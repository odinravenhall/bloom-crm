// MYM → Accès MYM (Direct) : le vrai site de MYM (creators.mym.fans) affiché dans Bloom, comme dans MyPulse.
// Demandé par l'agence le 24/11/2026, pour les admins et managers seulement (jamais les chatteurs).
//
// Comment ça marche :
//  - une adresse dédiée (MYM_SITE_HOST, par défaut mym.ravencrm.xyz) pointe sur le même site que Bloom ; Next y renvoie
//    TOUT vers `/mymsite/…` de l'API (next.config.mjs). Le site de MYM utilise les mêmes chemins que Bloom (`/app/…`) :
//    il ne peut pas vivre sous l'adresse de Bloom.
//  - Bloom ouvre la page avec un ticket à usage unique (60 s) : `POST /api/mym/site/ticket` → `/__bloom/open?t=…`, qui
//    pose un cookie de session propre à cette adresse (4 h) puis renvoie vers les messages de MYM.
//  - chaque requête est refaite chez creators.mym.fans avec la session de la modèle (cookies Cognito du compte relié,
//    ajoutés ICI, côté serveur) et les cookies que le site de MYM pose en route (gardés ici aussi, par session).
//  - la réponse repart telle quelle, sauf : les liens absolus vers creators.mym.fans deviennent relatifs, et la page
//    n'accepte d'être affichée que dans Bloom (`frame-ancestors`).
// ⚠️ Les pages de MYM contiennent elles-mêmes le jeton de la modèle (attributs `data-user-token`) : la personne qui ouvre
// cette page peut donc agir sur le compte. D'où la limite aux admins et managers, et le journal (`bl_actions`).
// Refusé ici : se déconnecter (cela couperait aussi la liaison de Bloom) et supprimer le compte.
// Pas garanti : les parties récentes du site (nouvelle messagerie, réglages) tournent dans le navigateur et parlent à
// api.mym.fans, qui peut refuser une autre adresse que la sienne.
import { randomBytes } from 'node:crypto';
import { isLinked, mymSiteCookie } from './mym.mjs';
import { canSee, seesAll } from './team.mjs';
import { logAction } from './journal.mjs';

export const SITE_HOST = process.env.MYM_SITE_HOST || 'mym.ravencrm.xyz';
const BLOOM = process.env.BLOOM_ORIGIN || 'https://bloom.ravencrm.xyz';
const ORIGIN = 'https://creators.mym.fans';
const COOKIE = 'bloom_mymsite';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36';
const tickets = new Map(); // ticket -> { user, cid, exp }
const sessions = new Map(); // sid -> { user, cid, exp, jar: Map }
const FORBIDDEN = /\/(?:logout|signout|sign-out|deconnexion|delete-account|close-account|account\/delete|supprimer-(?:mon-)?compte)(?:\/|$)/i;

const page = (res, status, text) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': `frame-ancestors ${BLOOM}`, 'x-robots-tag': 'noindex' });
  res.end(`<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;background:#1a1d21;color:#ced4da;font:15px system-ui"><p style="max-width:460px;text-align:center;line-height:1.5">${text}</p>`);
};
// Partie récente du site (nouvelle messagerie, réglages) : une application qui tourne dans le navigateur et parle à
// api.mym.fans, qui n'accepte que l'adresse de MYM (vérifié le 24/11/2026). Ici elle n'afficherait que la page de
// connexion de MYM : on le dit clairement à la place, et personne ne tape de mot de passe dans le cadre.
// On ne contourne pas cette limite (ce serait passer outre une protection de MYM).
const spa = (res, cid, path) => {
  const chat = path.startsWith('/app/chat');
  const link = chat ? `${BLOOM}/app/mym/chatting?c=${encodeURIComponent(cid)}` : `${ORIGIN}${path}`;
  page(res, 200, `<b style="color:#f1f6e8;font-size:17px">Cette partie du site MYM ne s’affiche pas dans Bloom</b><br><br>${chat ? 'La nouvelle messagerie de MYM' : 'Cette page de MYM (réglages, nouvelle messagerie)'} est une application qui n’accepte de fonctionner que sur l’adresse de MYM.<br><br><a href="${link}" target="${chat ? '_top' : '_blank'}" rel="noreferrer" style="color:#c7ff4a">${chat ? 'Ouvrir Chatting dans Bloom' : 'Ouvrir cette page sur creators.mym.fans'}</a> &nbsp;·&nbsp; <a href="/app/myms" style="color:#9fb0f0">Revenir au site MYM</a>`);
};
const sessionOf = (req) => {
  const sid = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '')?.[1];
  const s = sid ? sessions.get(sid) : null;
  if (!s || s.exp < Date.now()) return sid && sessions.delete(sid), null;
  return s;
};
async function raw(req, max = 50_000_000) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const parts = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error('Envoi trop gros'), { status: 413 });
    parts.push(c);
  }
  return Buffer.concat(parts);
}
/** Une requête refaite chez creators.mym.fans avec la session de la modèle. */
async function relay(cid, jar, method, pathAndQuery, headers, body) {
  const cookie = [await mymSiteCookie(cid), ...[...jar].map(([k, v]) => `${k}=${v}`)].join('; ');
  const h = { cookie, 'user-agent': UA, accept: headers.accept || '*/*', 'accept-language': headers['accept-language'] || 'fr-FR,fr;q=0.9' };
  for (const k of ['content-type', 'x-requested-with', 'x-csrf-token', 'x-xsrf-token']) if (headers[k]) h[k] = headers[k];
  if (method !== 'GET' && method !== 'HEAD') h.origin = ORIGIN;
  h.referer = `${ORIGIN}/app/myms`;
  const r = await fetch(`${ORIGIN}${pathAndQuery}`, { method, headers: h, body, redirect: 'manual', signal: AbortSignal.timeout(60_000) });
  // Les cookies posés par le site de MYM restent ici (jamais envoyés au navigateur de la personne).
  for (const c of r.headers.getSetCookie?.() || []) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    if (i > 0 && !/^CognitoIdentityServiceProvider/.test(kv)) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1));
  }
  return r;
}

/** Tout ce qui arrive sur l'adresse dédiée (chemin `/mymsite/…`). */
export async function mymSiteProxy(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace(/^\/mymsite/, '') || '/';
  if (path === '/__bloom/ping') return res.writeHead(204, { 'access-control-allow-origin': BLOOM, 'cache-control': 'no-store' }), res.end();
  if (path === '/__bloom/open') {
    const t = tickets.get(url.searchParams.get('t') || '');
    tickets.delete(url.searchParams.get('t') || '');
    if (!t || t.exp < Date.now()) return page(res, 403, 'Ce lien n’est plus valable. Rouvre « Accès MYM (Direct) » depuis Bloom.');
    const sid = randomBytes(24).toString('base64url');
    sessions.set(sid, { user: t.user, cid: t.cid, exp: Date.now() + 4 * 3600e3, jar: new Map() });
    for (const [k, s] of sessions) if (s.exp < Date.now()) sessions.delete(k);
    logAction(t.user, 'Accès MYM (Direct) ouvert', { creatorId: t.cid });
    res.writeHead(302, { 'set-cookie': `${COOKIE}=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400`, location: '/app/myms', 'cache-control': 'no-store' });
    return res.end();
  }
  const s = sessionOf(req);
  if (!s) return page(res, 401, 'Cette page s’ouvre depuis Bloom : menu MYM → Accès MYM (Direct).');
  if (!isLinked(s.cid)) return page(res, 409, 'Le compte MYM de cette modèle n’est plus relié à Bloom.');
  if (path.startsWith('/app/login')) return spa(res, s.cid, '/app/reglages');
  if (FORBIDDEN.test(path)) return page(res, 403, 'Cette action est bloquée depuis Bloom : se déconnecter ici couperait aussi la liaison du compte avec Bloom.');
  try {
    const body = await raw(req);
    const r = await relay(s.cid, s.jar, req.method, `${path === '/' ? '/app/myms' : path}${url.search}`, req.headers, body);
    if (req.method !== 'GET' && req.method !== 'HEAD' && !/\/ajax\/|\/api\//.test(path)) logAction(s.user, 'Action sur le site MYM (accès direct)', { creatorId: s.cid, details: `${req.method} ${path.slice(0, 120)} → ${r.status}` });
    const out = { 'content-security-policy': `frame-ancestors ${BLOOM}`, 'x-robots-tag': 'noindex', 'referrer-policy': 'same-origin' };
    for (const k of ['content-type', 'cache-control', 'etag', 'last-modified', 'content-disposition']) if (r.headers.get(k)) out[k] = r.headers.get(k);
    const loc = r.headers.get('location');
    if (loc) {
      // Renvoi vers la page de connexion : la session de la modèle n'est pas acceptée par le site.
      if (/login|connexion|signin/i.test(loc)) return page(res, 502, 'MYM renvoie vers sa page de connexion : la session du compte relié n’est pas acceptée par le site. Vérifie la liaison dans Compte Creator.');
      out.location = loc.startsWith(ORIGIN) ? loc.slice(ORIGIN.length) || '/' : loc;
    }
    const type = r.headers.get('content-type') || '';
    if (/text\/html|javascript|json/.test(type)) {
      // Les liens absolus vers le site de MYM restent sur cette adresse.
      const text = (await r.text()).replaceAll(ORIGIN, '').replaceAll(ORIGIN.replace(/\//g, '\\/'), '');
      // La coquille de l'application récente : une petite page qui ne charge que « korben-creators ».
      if (type.includes('text/html') && text.length < 20_000 && text.includes('korben-creators')) return spa(res, s.cid, path);
      res.writeHead(r.status, out);
      return res.end(text);
    }
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    if (res.headersSent) return res.end();
    page(res, e.status || 502, `Le site de MYM n’a pas répondu (${String(e.message).slice(0, 120)}).`);
  }
}

export function mymSiteRoutes({ userFrom, send, body, creators }) {
  const pick = async (req, res, cid) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    const c = creators().find((x) => String(x.id) === String(cid || '') && /mym/i.test(x.platform || '') && canSee({ ...u, pf: null }, x.id));
    if (!c) return send(res, 404, { error: 'Modèle MYM inconnue' }), null;
    if (!isLinked(c.id)) return send(res, 409, { error: 'Le compte MYM de cette modèle n’est pas relié à Bloom.' }), null;
    return { u, cid: String(c.id) };
  };
  return {
    // Un ticket à usage unique pour ouvrir le site de MYM de cette modèle sur l'adresse dédiée.
    'POST /api/mym/site/ticket': async (req, res) => {
      const b = await body(req);
      const x = await pick(req, res, b.creatorId);
      if (!x) return;
      const t = randomBytes(24).toString('base64url');
      tickets.set(t, { user: { id: x.u.id, name: x.u.name }, cid: x.cid, exp: Date.now() + 60_000 });
      for (const [k, v] of tickets) if (v.exp < Date.now()) tickets.delete(k);
      send(res, 200, { url: `https://${SITE_HOST}/__bloom/open?t=${t}`, host: SITE_HOST });
    },
    // Vérification (admins, managers) : le site de MYM répond-il avec la session du compte relié ? Lecture seule.
    'GET /api/mym/site/probe': async (req, res) => {
      const p = new URL(req.url, 'http://x').searchParams;
      const x = await pick(req, res, p.get('creatorId'));
      if (!x) return;
      const path = /^\/app\/[a-z0-9/_-]{1,80}$/i.test(p.get('path') || '') ? p.get('path') : '/app/myms';
      try {
        const r = await relay(x.cid, new Map(), 'GET', path, {}, undefined);
        const text = /html/.test(r.headers.get('content-type') || '') ? await r.text() : '';
        send(res, 200, { host: SITE_HOST, path, status: r.status, type: r.headers.get('content-type'), location: r.headers.get('location'), length: text.length, title: /<title>([^<]*)<\/title>/i.exec(text)?.[1]?.trim() || null, frame: r.headers.get('x-frame-options') || null, csp: (r.headers.get('content-security-policy') || '').slice(0, 160) || null });
      } catch (e) {
        send(res, 502, { error: e.message });
      }
    },
  };
}
