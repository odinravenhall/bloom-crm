// « OF Manager » (comme Infloww) : le vrai site OnlyFans / MYM de la créatrice, affiché dans Bloom.
// Substy a un site intégré (« Browser », of.substy.ai) : une session par créatrice, valable 4 h, autorisée par un cookie
// que Substy pose après « …/access ». Les chatteurs n'ont pas de compte Substy : c'est le serveur de Bloom qui ouvre
// et autorise la session, garde le cookie, et relaie le site sous ses propres adresses (« /s/<session>/… », comme sur
// of.substy.ai). Le navigateur ne voit jamais la connexion Substy de l'agence. Réservé aux admins et managers.
import { creatorsOf, seesAll } from './team.mjs';

const HOUR = 3600_000;
const sessions = new Map(); // id (jeton de session) -> { id, creatorId, origin, jar: Map, at }
const byCreator = new Map(); // creatorId -> id

// Réservé aux admins et managers (les chatteurs n'ont jamais accès à l'OF Manager).
const seesCreator = (u, cid) => {
  if (!u || !seesAll(u)) return false;
  const s = creatorsOf(u);
  return s === null || s.has(String(cid));
};
function absorb(jar, setCookies) {
  for (const c of setCookies || []) {
    const [pair, ...attrs] = String(c).split(';');
    const i = pair.indexOf('=');
    if (i < 1) continue;
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    const expired = attrs.some((a) => /^\s*max-age=0/i.test(a)) || (attrs.find((a) => /^\s*expires=/i.test(a)) && Date.parse(attrs.find((a) => /^\s*expires=/i.test(a)).split('=')[1]) < Date.now());
    if (expired || !value) jar.delete(name);
    else jar.set(name, value);
  }
}
const cookieHeader = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

/** Ouvre (ou reprend, si elle a moins de 3 h 30) la session du site intégré d'une créatrice. */
async function open(substy, creatorId) {
  const cur = sessions.get(byCreator.get(creatorId));
  if (cur && Date.now() - cur.at < 3.5 * HOUR) return cur;
  const r = await substy.browserOpen(creatorId);
  const url = new URL(r.redirectUrl, r.origin);
  const id = /^\/s\/([^/]+)/.exec(url.pathname)?.[1] || r.token;
  const s = { id, creatorId, origin: r.origin, jar: new Map(), at: Date.now() };
  absorb(s.jar, r.cookies);
  sessions.set(id, s);
  byCreator.set(creatorId, id);
  console.log(`[bloom] site intégré ouvert pour ${creatorId} (${s.jar.size} cookie(s))`);
  return s;
}
setInterval(() => {
  for (const [id, s] of sessions) if (Date.now() - s.at > 4 * HOUR) sessions.delete(id), byCreator.get(s.creatorId) === id && byCreator.delete(s.creatorId);
}, 10 * 60_000);

// En-têtes du navigateur qu'on ne transmet pas (cookies de Bloom, adresse de Bloom…).
const DROP_REQ = new Set(['cookie', 'host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'forwarded', 'via', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ipcountry', 'cdn-loop']);
const DROP_RES = new Set(['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'strict-transport-security', 'content-security-policy', 'x-frame-options', 'alt-svc', 'report-to', 'nel', 'server', 'cf-ray']);

export function ofBrowserRoutes({ substy, userFrom, send }) {
  /** Relais : « /ofb/s/<session>/… » et « /ofb/static/… » (adresses du site intégré, servies sous Bloom). */
  async function proxy(req, res, path) {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' });
    const rest = path.slice('/ofb'.length) || '/';
    const sid = /^\/s\/([^/?]+)/.exec(rest)?.[1];
    const s = sid ? sessions.get(sid) : sessions.get(byCreator.get([...byCreator.keys()].pop()));
    if (sid && !s) {
      res.writeHead(410, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<p style="font-family:sans-serif;padding:24px">Session terminée : rouvre la modèle dans Bloom.</p>');
    }
    if (s && !seesCreator(u, s.creatorId)) return send(res, 403, { error: 'Pas d’accès à cette créatrice' });
    const origin = s?.origin || 'https://of.substy.ai';
    const qs = (req.url || '').includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!DROP_REQ.has(k) && !k.startsWith('sec-fetch-')) headers[k] = v;
    headers.origin = origin;
    headers.referer = `${origin}/`;
    if (s?.jar.size) headers.cookie = cookieHeader(s.jar);
    let body;
    if (!['GET', 'HEAD'].includes(req.method)) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = Buffer.concat(chunks);
    }
    const r = await fetch(origin + rest + qs, { method: req.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(60_000) });
    if (s) absorb(s.jar, r.headers.getSetCookie?.() || []);
    const out = {};
    r.headers.forEach((v, k) => {
      if (DROP_RES.has(k)) return;
      out[k] = k === 'location' ? v.replace(origin, '') : v;
    });
    out['x-frame-options'] = 'SAMEORIGIN';
    const type = r.headers.get('content-type') || '';
    // Adresses absolues du site intégré dans le texte → relatives (elles repassent par Bloom).
    if (/text\/|javascript|json/.test(type)) {
      const t = (await r.text()).split(origin).join('');
      res.writeHead(r.status, out);
      return res.end(t);
    }
    res.writeHead(r.status, out);
    if (!r.body || req.method === 'HEAD') return res.end();
    for await (const c of r.body) res.write(c);
    res.end();
  }

  return {
    proxy,
    routes: {
      // Ouvrir le site d'une créatrice : renvoie l'adresse à mettre dans la page (sous Bloom).
      'GET /api/of-browser/open': async (req, res) => {
        const u = userFrom(req);
        if (!u) return send(res, 401, { error: 'Connecte-toi' });
        const cid = String(new URL(req.url, 'http://x').searchParams.get('creatorId') || '');
        if (!seesCreator(u, cid)) return send(res, 403, { error: 'Pas d’accès à cette créatrice' });
        const s = await open(substy, cid);
        send(res, 200, { src: `/s/${encodeURIComponent(s.id)}?theme=dark`, openedAt: s.at, expiresAt: s.at + 4 * HOUR });
      },
    },
  };
}
