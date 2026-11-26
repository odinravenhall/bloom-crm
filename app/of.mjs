// Liaison directe Bloom ↔ compte OnlyFans d'une modèle (sans Substy).
// Une session OF = cookies « sess », « auth_id », « fp », « bc » + l'empreinte du navigateur. Elle ne se renouvelle pas.
// Chaque modèle a SON proxy résidentiel FIXE, dérivé de son identifiant : tout passe par lui, jamais en direct.
// Connexion : un vrai Chromium dans le conteneur « browser » (ofbrowser/), avec un écran de relais pour le Cloudflare.
import { createHash, randomBytes } from 'node:crypto';
import { all, db, getSetting, one, run, seal, open, setSetting } from './store.mjs';
import { seesAll } from './team.mjs';

let Agent = null;
/** Charge undici seulement quand un proxy existe : l'API démarre donc même sans lui. */
async function via(proxy) {
  if (!proxy) return {};
  if (!Agent) Agent = (await import('undici')).ProxyAgent;
  return { dispatcher: new Agent(proxy) };
}

db.exec(`
  CREATE TABLE IF NOT EXISTS of_links (
    creator_id TEXT PRIMARY KEY, cookies TEXT NOT NULL, user_agent TEXT NOT NULL,
    of_id TEXT, username TEXT, display_name TEXT, avatar TEXT,
    linked_by TEXT, linked_at INTEGER NOT NULL, checked_at INTEGER, error TEXT
  );
  CREATE TABLE IF NOT EXISTS of_logins (ticket TEXT PRIMARY KEY, creator_id TEXT NOT NULL, by TEXT, at INTEGER NOT NULL);
`);

const APP_TOKEN = '33d57ade8c02dbc5a333db99ff9ae26a';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const BROWSER = process.env.BROWSER_URL || 'http://browser:3100';

export class OFError extends Error { constructor(s, m) { super(m); this.status = s; } }

/** Proxy résidentiel FIXE de la modèle. `null` tant qu'IPRoyal n'est pas réglé (test seulement). */
export function proxyOf(cid) {
  const host = getSetting('iproyal_host'), user = getSetting('iproyal_user'), pass = getSetting('iproyal_pass');
  if (!host || !user || !pass) return null;
  const sid = createHash('sha1').update(`bloom-of:${cid}`).digest('hex').slice(0, 12);
  return `http://${encodeURIComponent(user)}:${encodeURIComponent(`${pass}_session-${sid}_lifetime-24h`)}@${host}`;
}

const RULES = ['app-token', 'user-id', 'x-bc', 'time', 'user-agent', 'path'];
function sign(path, userId, xbc, ua, query) {
  const time = String(Math.floor(Date.now() / 1000));
  let s = `${time}\n${APP_TOKEN}\n${userId || ''}\n${xbc}\n${ua}\n${path}\n`;
  for (const k of Object.keys(query).sort()) s += `${k}\n${query[k]}\n`;
  return createHash('md5').update(s).digest('hex');
}

/** Appel à l'API d'OnlyFans au nom d'une modèle, par son proxy. */
export async function of(cid, path, { method = 'GET', query, form } = {}) {
 const l = one('SELECT * FROM of_links WHERE creator_id = ?', cid); if (!l) throw new OFError(409, 'Ce compte OnlyFans n’est pas relié à Bloom.');
 const r = await browser('/call', { cid, path, method, query, form, proxy: proxyOf(cid), cookies: open(l.cookies) }).catch((e) => {
    throw new OFError(502, `Navigateur : ${e.message}`);
  });
 if (r.last && !r.last.keys.includes('sign')) throw new OFError(502, 'Le site n’a pas signé la requête.');
  if (!r) throw new OFError(502, 'Navigateur injoignable.');
  if (!r.status) throw new OFError(502, 'OnlyFans ne répond pas.');
  let data = r.body;
  try { data = r.body ? JSON.parse(r.body) : null; } catch {}
  if (r.status === 401 || r.status === 403 || (r.status === 200 && /^\s*</.test(String(r.body || '')))) {
    run('UPDATE of_links SET error = ?, checked_at = ? WHERE creator_id = ?', 'Session refusée par OnlyFans : il faut relier le compte à nouveau.', Date.now(), cid);
    throw new OFError(401, 'Session OnlyFans refusée : relie le compte à nouveau.');
  }
  if (r.status >= 400 || data?.error) throw new OFError(r.status, `OnlyFans ${r.status} : ${data?.error?.message || String(r.body || '').slice(0, 140)}${r.last ? ` [${r.last.url} | ${r.last.keys}]` : ''}`);
  run('UPDATE of_links SET error = NULL, checked_at = ? WHERE creator_id = ?', Date.now(), cid);
  return data;
}

/** Vérifie la session (relit le profil) et note le résultat. */
export async function check(cid) {
  try {
    const l = one('SELECT cookies FROM of_links WHERE creator_id = ?', cid);
    if (!l) throw new Error('Compte non relié.');
    const r = await browser('/json', { cid, goto: '/my/profile', match: '/api2/v2/users/list?a[]=', proxy: proxyOf(cid), cookies: open(l.cookies) });
    if (!r) throw new Error('OnlyFans ne répond pas.');
    if (String(r.url || '').includes('return_to')) throw new Error('Session refusée par OnlyFans : relie le compte à nouveau.');
    const d = JSON.parse(r.text || '{}');
    const id = Object.keys(d)[0];
    const me = d[id] || {};
    if (!id || !me.username) throw new Error('Profil illisible dans la réponse du site.');
    run('UPDATE of_links SET of_id = ?, username = ?, display_name = ?, avatar = ?, error = NULL, checked_at = ? WHERE creator_id = ?',
      id, me.username, me.name || null, me.avatar || null, Date.now(), cid);
    return { ok: true, username: me.username };
  } catch (e) {
    run('UPDATE of_links SET error = ?, checked_at = ? WHERE creator_id = ?', e.message, Date.now(), cid);
return { ok: false, error: `${e.message} @ ${(e.stack || '').split('\n')[1] || ''}` };
  }
}
export async function saveLink(cid, { cookies, userAgent, ofId }, by) {
  const jar = String(cookies || '').trim();
  if (!/(?:^|;\s*)sess=[^;\s]+/.test(jar)) throw new OFError(400, 'Cookie « sess » absent : la connexion a échoué.');
  const uid = String(ofId || /(?:^|;\s*)(?:auth_id|user_id|u_id)=([^;]+)/.exec(jar)?.[1] || '');
  run(`INSERT INTO of_links (creator_id, cookies, user_agent, linked_by, linked_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (creator_id) DO UPDATE SET cookies = excluded.cookies, user_agent = excluded.user_agent,
       linked_by = excluded.linked_by, linked_at = excluded.linked_at, error = NULL`,
    cid, seal(jar), String(userAgent || UA), by, Date.now());
  if (uid) run('UPDATE of_links SET of_id = ? WHERE creator_id = ?', uid, cid);
  const v = await check(cid);
  if (!v.ok) throw new OFError(400, v.error);
  return v;
}

export const isLinked = (cid) => !!one('SELECT 1 AS x FROM of_links WHERE creator_id = ?', String(cid));

const browser = async (path, payload) => {
  const r = await fetch(`${BROWSER}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new OFError(400, b.error || 'Navigateur : erreur');
  return b;
};

/** Écran de relais du Cloudflare (page ouverte dans un onglet, à part). */
const LIVE = (t) => `<!doctype html><meta charset="utf-8"><title>Connexion OnlyFans</title>
<style>body{margin:0;background:#111;color:#eee;font:14px system-ui}#s{display:block;width:100%;cursor:crosshair}#b{padding:8px 12px}</style>
<div id="b">Clique dans la page comme dans un navigateur. <span id="w"></span></div>
<img id="s" src="/api/of/live/shot?t=${t}">
<script>
const t='${t}',s=document.getElementById('s');
async function tick(){try{const r=await fetch('/api/of/live/result?t='+t);const b=await r.json();
 if(b.state==='done'||b.state==='error'){document.getElementById('w').textContent=b.state==='done'?'Connecté ✓':'Échec : '+(b.error||'');setTimeout(()=>window.close(),1800);return}
 s.src='/api/of/live/shot?t='+t+'&r='+Date.now()}catch{}setTimeout(tick,900)}
s.onload=()=>setTimeout(tick,500);
s.onclick=async e=>{const r=s.getBoundingClientRect(),k=s.naturalWidth/r.width;
 await fetch('/api/of/live/click?t='+t,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({x:(e.clientX-r.left)*k,y:(e.clientY-r.top)*k})});
 s.src='/api/of/live/shot?t='+t+'&r='+Date.now()};
</script>`;

export function ofRoutes({ userFrom, send, body, creators }) {
  const admin = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    return u;
  };
  const vue = (cid) => {
    const l = one('SELECT username, linked_by, linked_at, checked_at, error FROM of_links WHERE creator_id = ?', cid);
    return l ? { linked: true, username: l.username, linkedBy: l.linked_by, linkedAt: l.linked_at, error: l.error, ok: !l.error } : { linked: false };
  };
  const ticketOf = (req) => String(new URL(req.url, 'http://x').searchParams.get('t') || '');
  return {
    'GET /api/of/links': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      send(res, 200, { canEdit: seesAll(u), proxy: !!proxyOf('x'), links: creators().filter((c) => !/mym/i.test(c.platform || '')).map((c) => ({ creatorId: c.id, name: c.name, ...vue(c.id) })) });
    },
    /** Connexion : email + mot de passe, dans le navigateur, par le proxy de la modèle. Le mot de passe n'est pas gardé. */
    'POST /api/of/login': async (req, res) => {
      const u = admin(req, res); if (!u) return;
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const email = String(b.email || '').trim(), password = String(b.password || '');
      if (!cid) return send(res, 400, { error: 'Modèle manquante' });
      if (!/^\S+@\S+\.\S+$/.test(email) || !password) return send(res, 400, { error: 'Email et mot de passe OnlyFans obligatoires.' });
      try {
        const r = await browser('/login', { cid, email, password, proxy: proxyOf(cid) });
        run('DELETE FROM of_logins WHERE at < ?', Date.now() - 15 * 60_000);
        run('INSERT INTO of_logins (ticket, creator_id, by, at) VALUES (?, ?, ?, ?)', r.ticket, cid, u.name, Date.now());
        send(res, 200, { ticket: r.ticket });
      } catch (e) { send(res, 400, { error: e.message }); }
    },
    'GET /api/of/live/result': async (req, res) => {
      const t = ticketOf(req);
      const l = one('SELECT creator_id FROM of_logins WHERE ticket = ?', t);
      if (!l) return send(res, 404, { state: 'error', error: 'Connexion inconnue ou expirée' });
      const r = await fetch(`${BROWSER}/result?t=${encodeURIComponent(t)}`).then((x) => x.json()).catch(() => ({ state: 'error', error: 'Navigateur injoignable' }));
      if (r.state === 'done') {
        const v = await saveLink(l.creator_id, r, 'navigateur').catch((e) => ({ ok: false, error: e.message }));
        if (!v.ok) return send(res, 200, { state: 'error', error: `${v.error}\n\nOnlyFans affiche : ${r.text || '(rien)'}\n${r.url || ''}` });
        await browser('/close', { t }).catch(() => {});
        run('DELETE FROM of_logins WHERE ticket = ?', t);
      }
      send(res, 200, r);
    },
    'GET /api/of/live': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(LIVE(ticketOf(req)));
    },
    'GET /api/of/live/shot': async (req, res) => {
      const r = await fetch(`${BROWSER}/shot?t=${encodeURIComponent(ticketOf(req))}`).catch(() => null);
      if (!r?.ok) return send(res, 404, {});
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
      res.end(Buffer.from(await r.arrayBuffer()));
    },
    'POST /api/of/live/click': async (req, res) => {
      const b = await body(req);
      await browser(`/click?t=${encodeURIComponent(ticketOf(req))}`, b).catch(() => {});
      send(res, 200, { ok: true });
    },
    /** Code reçu par mail ou par application d'authentification. */
    'POST /api/of/login/code': async (req, res) => {
      const b = await body(req);
      try { await browser(`/code?t=${encodeURIComponent(String(b.ticket || ''))}`, { code: String(b.code || '') }); send(res, 200, { ok: true }); }
      catch (e) { send(res, 400, { error: e.message }); }
    },
    'POST /api/of/check': async (req, res) => {
      const u = admin(req, res); if (!u) return;
      send(res, 200, await check(String((await body(req)).creatorId || '')));
    },
    'POST /api/of/unlink': async (req, res) => {
      const u = admin(req, res); if (!u) return;
      run('DELETE FROM of_links WHERE creator_id = ?', String((await body(req)).creatorId || ''));
      send(res, 200, { ok: true });
    },
    /** Réglages IPRoyal (admins), gardés chiffrés. */
    'POST /api/of/proxy': async (req, res) => {
      const u = admin(req, res); if (!u) return;
      const b = await body(req);
      if (b.host !== undefined) setSetting('iproyal_host', String(b.host).trim());
      if (b.user !== undefined) setSetting('iproyal_user', String(b.user).trim());
      if (b.pass) setSetting('iproyal_pass', seal(String(b.pass)));
      send(res, 200, { ok: true, actif: !!proxyOf('x') });
    },
  };
}

// Toutes les 15 min : garde les sessions vivantes et signale celles qui sont mortes.
setInterval(() => {
  for (const { creator_id: cid } of all('SELECT creator_id FROM of_links')) check(cid).catch(() => {});
}, 15 * 60_000);