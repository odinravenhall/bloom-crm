// Liaison directe Bloom ↔ compte OnlyFans d'une modèle (sans Substy).
// Une session OF = cookies « sess », « auth_id », « fp », « bc » + l'empreinte du navigateur. Elle ne se renouvelle pas.
// Chaque modèle a SON proxy résidentiel FIXE, dérivé de son identifiant : tout passe par lui, jamais en direct.
// Connexion : un vrai Chromium dans le conteneur « browser » (ofbrowser/), avec un écran de relais pour le Cloudflare.
import { createHash, randomBytes } from 'node:crypto';
import { all, db, getSetting, one, run, seal, open, setSetting } from './store.mjs';
import { seesAll } from './team.mjs';
import { request as httpRequest } from 'node:http';

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
  const own = getSetting('of_proxy:' + cid);
  if (own) return own;
  const host = getSetting('nm_host'), user = getSetting('nm_user');
  const sealed = getSetting('nm_pass');
  if (!host || !user || !sealed) return null;
  const pass = open(sealed);
  const sid = createHash('sha1').update(`bloom-of:${cid}`).digest('hex').slice(0, 12);
  return `socks5://${encodeURIComponent(`${user}-country-fr-sid-${sid}`)}:${encodeURIComponent(pass)}@${host}:${getSetting('nm_port') || '1080'}`;
}

const RULES = ['app-token', 'user-id', 'x-bc', 'time', 'user-agent', 'path'];
function sign(path, userId, xbc, ua, query) {
  const time = String(Math.floor(Date.now() / 1000));
  let s = `${time}\n${APP_TOKEN}\n${userId || ''}\n${xbc}\n${ua}\n${path}\n`;
  for (const k of Object.keys(query).sort()) s += `${k}\n${query[k]}\n`;
  return createHash('md5').update(s).digest('hex');
}

const SIGN_STATIC = 'IOtkCISFShmFVwT4iyJ7v4SyOUUyQlW9';
const SIGN_PREFIX = '68816', SIGN_SUFFIX = '6b09a5d9', SIGN_SUM = 1088;
const SIGN_IDX = [0,0,0,3,8,8,8,13,15,19,20,21,22,23,23,23,24,25,28,28,28,29,29,30,30,31,32,33,35,35,35,39];
const OF_REV = '202611271546-053fafb120';
const OF_TOKEN = '33d57ade8c02dbc5a333db99ff9ae26a';

const agents = new Map();
async function agentFor(proxy) {
  if (!agents.has(proxy)) {
    const { ProxyAgent } = await import('undici');
    agents.set(proxy, new ProxyAgent(proxy));
  }
  return agents.get(proxy);
}

function ofSign(path, uid) {
  const time = Date.now();
  const sha = createHash('sha1').update(SIGN_STATIC + '\n' + time + '\n' + path + '\n' + uid).digest('hex');
  const sum = SIGN_IDX.reduce((a, i) => a + sha.charCodeAt(i), 0);
  return { time, sign: SIGN_PREFIX + ':' + sha + ':' + Math.abs(sum - SIGN_SUM).toString(16) + ':' + SIGN_SUFFIX };
}

/** Requête directe à l’API d’OnlyFans, signée comme le fait l’application. */
async function ofFetch(cid, path, { method = 'GET', query, form, json } = {}) {
  const l = one('SELECT cookies, user_agent FROM of_links WHERE creator_id = ?', cid);
  if (!l) throw new OFError(409, 'Ce compte OnlyFans n’est pas relié à Bloom.');
  const jar = open(l.cookies);
  const uid = /(?:^|;\s*)auth_id=([^;\s]+)/.exec(jar)?.[1] || '';
  const fp = /(?:^|;\s*)fp=([^;\s]+)/.exec(jar)?.[1] || '';
  const { time, sign } = ofSign(path, uid);
  const qs = query ? '?' + new URLSearchParams(query) : '';
  const headers = {
    accept: 'application/json, text/plain, */*',
    'app-token': OF_TOKEN,
    'user-agent': l.user_agent || UA,
    'x-bc': fp,
    'x-of-rev': OF_REV,
    time: String(time),
    sign,
    'user-id': uid,
    referer: 'https://onlyfans.com/my/chats/',
    cookie: jar,
  };
  if (form) headers['content-type'] = 'application/x-www-form-urlencoded';
  if (json) headers['content-type'] = 'application/json';
  const proxy = proxyOf(cid);
  const r = await fetch('https://onlyfans.com' + path + qs, {
    method, headers,
    body: json ? JSON.stringify(json) : form ? new URLSearchParams(form).toString() : undefined,
    dispatcher: proxy ? await agentFor(proxy) : undefined,
  });
  return { status: r.status, text: await r.text() };
}

/** Appel à l’API d’OnlyFans au nom d’une modèle, par son proxy. */
export async function of(cid, path, opts = {}) {
  const r = await ofFetch(cid, path, opts);
  let data = r.text;
  try { data = r.text ? JSON.parse(r.text) : null; } catch { }
  if (r.status === 401 || r.status === 403 || (r.status === 200 && /^\s*</.test(String(r.text || '')))) {
    run('UPDATE of_links SET error = ?, checked_at = ? WHERE creator_id = ?', 'Session refusée par OnlyFans : il faut relier le compte à nouveau.', Date.now(), cid);
    throw new OFError(401, 'Session OnlyFans refusée : relie le compte à nouveau.');
  }
  if (r.status >= 400 || data?.error) throw new OFError(r.status, 'OnlyFans ' + r.status + ' : ' + (data?.error?.message || String(r.text || '').slice(0, 140)));
  run('UPDATE of_links SET error = NULL, checked_at = ? WHERE creator_id = ?', Date.now(), cid);
  return data;
}

/** Vérifie la session (relit le profil) et note le résultat. */
export async function check(cid) {
  try {
    const r = await ofFetch(cid, '/api2/v2/users/me');
    if (r.status === 401 || r.status === 403) throw new Error('Session refusée par OnlyFans : relie le compte à nouveau.');
    let d = null;
    try { d = JSON.parse(r.text || ''); } catch { throw new Error('Réponse illisible du site.'); }
    const me = (d && (d.id ? d : Object.values(d || {})[0])) || {};
    const id = String(me.id || '');
    if (!id || !me.username) throw new Error('Profil illisible dans la réponse du site.');
    run('UPDATE of_links SET of_id = ?, username = ?, display_name = ?, avatar = ?, error = NULL, checked_at = ? WHERE creator_id = ?', id, me.username, me.name || null, me.avatar || null, Date.now(), cid);
    return { ok: true, username: me.username };
  } catch (e) {
    run('UPDATE of_links SET error = ?, checked_at = ? WHERE creator_id = ?', e.message, Date.now(), cid);
    return { ok: false, error: e.message + ' @ ' + ((e.stack || '').split('\n')[1] || '') };
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
const LIVE = () => `<!doctype html><meta charset="utf-8"><title>Connexion OnlyFans</title>
<style>html,body{margin:0;height:100%;background:#111}iframe{border:0;width:100%;height:100vh}</style>
<iframe src="/api/of/vnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&show_dot=0"></iframe>`;

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
 'POST /api/of/live/solve': async (req, res) => {
      const t = ticketOf(req);
      const l = one('SELECT creator_id FROM of_logins WHERE ticket = ?', t);
      if (!l) return send(res, 404, { error: 'Connexion inconnue' });
      await browser('/solve', { cid: l.creator_id }).catch(() => {});
      send(res, 200, { ok: true });
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

const VNC = 'browser';
const VNC_PORT = 6080;

/** Relaie noVNC (HTML et WebSocket) depuis le conteneur navigateur. */
export function ofVnc(req, res) {
  const p = req.url.replace(/^\/api\/of\/vnc/, '') || '/';
  const up = httpRequest({ host: VNC, port: VNC_PORT, path: p, method: req.method, headers: { ...req.headers, host: `${VNC}:${VNC_PORT}` } }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(up);
}

export function ofVncUpgrade(req, socket, head) {
  const p = req.url.replace(/^\/api\/of\/vnc/, '') || '/';
  const up = httpRequest({ host: VNC, port: VNC_PORT, path: p, headers: { ...req.headers, host: `${VNC}:${VNC_PORT}` } });
  up.on('upgrade', (r, s, h) => {
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if (h?.length) socket.write(h);
    s.pipe(socket);
    socket.pipe(s);
  });
  up.on('error', () => socket.destroy());
  up.end();
}