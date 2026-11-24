// Liaison directe Bloom ↔ compte MYM d'une modèle (sans MyPulse). Relevé le 23/11/2026 sur creators.mym.fans :
//  - Connexion MYM = AWS Cognito (région eu-west-3) : jeton d'accès 1 h + jeton de renouvellement, gardés par le site
//    dans des cookies « CognitoIdentityServiceProvider.<clientId>.<utilisateur>.* ».
//  - API du site : https://api.mym.fans (profil « /creators/me », médias, playlists) et https://styx.mym.fans
//    (posts « /v1/posts », calendrier « /v1/posts/calendar », pushes « /v2/pushes », chats) — en-tête
//    « Authorization: Bearer <jeton d'accès> ».
// Deux façons de relier une modèle (admins / managers) :
//  1. Email + mot de passe MYM Creator (comme « Ajouter un compte » de MyPulse) : Bloom se connecte UNE fois avec le
//     protocole SRP de Cognito (cognito-srp.mjs, comme le site de MYM), demande le code de validation si MYM en envoie un,
//     puis ne garde que le jeton de renouvellement. Le mot de passe n'est jamais enregistré.
//  2. Extension « Bloom – Relier MYM » : un code à usage unique (15 min) + la session du Chrome connecté à MYM.
// Le jeton de renouvellement est gardé CHIFFRÉ ; Bloom renouvelle le jeton d'accès tout seul.
// Toute la couche MYM est ici, pour corriger à un seul endroit si MYM change son API.
import { randomBytes } from 'node:crypto';
import { all, db, one, open, run, seal } from './store.mjs';
import { canSee, seesAll } from './team.mjs';
import { srpAnswer, srpStart } from './cognito-srp.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS mym_links (
    creator_id TEXT PRIMARY KEY, client_id TEXT NOT NULL, refresh TEXT NOT NULL, access TEXT, access_exp INTEGER,
    mym_id TEXT, username TEXT, linked_by TEXT, linked_at INTEGER NOT NULL, checked_at INTEGER, error TEXT
  );
  CREATE TABLE IF NOT EXISTS mym_link_codes (code TEXT PRIMARY KEY, creator_id TEXT NOT NULL, created_by TEXT, expires_at INTEGER NOT NULL, used_at INTEGER);
`);
for (const c of ['device_key TEXT', 'id_token TEXT']) {
  try {
    db.exec(`ALTER TABLE mym_links ADD COLUMN ${c}`);
  } catch {}
}

const REGION = 'eu-west-3';
// Groupe d'utilisateurs et application Cognito du site des créatrices MYM (publics, dans le site).
const POOL = 'eu-west-3_RGbsNDpNd';
const CLIENT_ID = '27hq9jdoc4t09pmvab18aaf1sh';
export const API = 'https://api.mym.fans';
export const STYX = 'https://styx.mym.fans';

export class MymError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Appel à Cognito (connexion MYM). */
async function cognito(action, payload) {
  const r = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `AWSCognitoIdentityProviderService.${action}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!r) throw new MymError(502, 'MYM (connexion) ne répond pas');
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    const t = String(b.__type || '');
    const msg = /NotAuthorized|UserNotFound/.test(t)
      ? 'Email ou mot de passe MYM incorrect (ou code de validation faux).'
      : /CodeMismatch|ExpiredCode/.test(t)
        ? 'Code de validation faux ou expiré.'
        : /TooManyRequests|LimitExceeded|TooManyFailed/.test(t)
          ? 'Trop d’essais : MYM bloque les connexions pendant un moment. Réessaie plus tard.'
          : /PasswordResetRequired/.test(t)
            ? 'MYM demande de changer le mot de passe de ce compte avant de pouvoir le relier.'
            : `Connexion MYM refusée (${t || r.status})`;
    throw Object.assign(new MymError(t.includes('InvalidParameter') ? 400 : 401, msg), { type: t, raw: b.message });
  }
  return b;
}

/** Jeton de renouvellement → nouveau jeton d'accès (AWS Cognito, comme le site de MYM). */
async function cognitoRefresh(clientId, refreshToken, deviceKey) {
  const r = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    body: JSON.stringify({ AuthFlow: 'REFRESH_TOKEN_AUTH', ClientId: clientId, AuthParameters: { REFRESH_TOKEN: refreshToken, ...(deviceKey ? { DEVICE_KEY: deviceKey } : {}) } }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!r) throw new MymError(502, 'MYM (connexion) ne répond pas');
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.AuthenticationResult?.AccessToken) {
    const why = String(b.__type || '').includes('NotAuthorized') ? 'La session MYM a expiré ou a été fermée : il faut relier le compte à nouveau.' : `Connexion MYM refusée (${b.__type || r.status})`;
    throw new MymError(401, why);
  }
  return { access: b.AuthenticationResult.AccessToken, id: b.AuthenticationResult.IdToken || null, expiresIn: Number(b.AuthenticationResult.ExpiresIn) || 3600, refresh: b.AuthenticationResult.RefreshToken || null };
}

const pending = new Map();
/** Jeton d'accès valable pour une modèle (renouvelé 5 min avant la fin). */
async function accessOf(cid) {
  const l = one('SELECT * FROM mym_links WHERE creator_id = ?', cid);
  if (!l) throw new MymError(409, 'Ce compte MYM n’est pas encore relié à Bloom.');
  if (l.access && l.access_exp > Date.now() + 5 * 60_000) return open(l.access);
  if (pending.has(cid)) return pending.get(cid);
  const p = (async () => {
    try {
      const t = await cognitoRefresh(l.client_id, open(l.refresh), l.device_key || undefined);
      run('UPDATE mym_links SET access = ?, id_token = COALESCE(?, id_token), access_exp = ?, refresh = COALESCE(?, refresh), checked_at = ?, error = NULL WHERE creator_id = ?', seal(t.access), t.id ? seal(t.id) : null, Date.now() + t.expiresIn * 1000, t.refresh ? seal(t.refresh) : null, Date.now(), cid);
      return t.access;
    } catch (e) {
      run('UPDATE mym_links SET error = ?, checked_at = ? WHERE creator_id = ?', e.message, Date.now(), cid);
      throw e;
    } finally {
      pending.delete(cid);
    }
  })();
  pending.set(cid, p);
  return p;
}

/** Appel à l'API de MYM au nom d'une modèle. `base` : API ou STYX. Réponse JSON (ou texte). */
export async function mym(cid, path, { method = 'GET', body, base = API, headers = {} } = {}) {
  const go = async () => {
    const token = await accessOf(cid);
    return fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  };
  let r = await go();
  if (r.status === 401) {
    run('UPDATE mym_links SET access = NULL WHERE creator_id = ?', cid);
    r = await go();
  }
  const text = await r.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!r.ok) throw new MymError(r.status, `MYM ${r.status} : ${data?.message || data?.error || String(text).slice(0, 120)}`);
  return data;
}
/**
 * Appel à une adresse du site des créatrices (creators.mym.fans, ex. « /app/ajax/followers/counts »), qui lit la session
 * dans les cookies Cognito comme le navigateur : Bloom les recompose avec la session reliée.
 */
export async function mymSite(cid, path) {
  await accessOf(cid);
  const l = one('SELECT client_id, access, id_token FROM mym_links WHERE creator_id = ?', cid);
  const access = open(l.access);
  const idTok = l.id_token ? open(l.id_token) : null;
  const claims = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString('utf8'));
  const user = encodeURIComponent(claims.username || claims.sub);
  const pre = `CognitoIdentityServiceProvider.${l.client_id}`;
  const cookie = [`${pre}.LastAuthUser=${user}`, `${pre}.${user}.accessToken=${access}`, ...(idTok ? [`${pre}.${user}.idToken=${idTok}`] : []), 'amplify-signin-with-hostedUI=false'].join('; ');
  const r = await fetch(`https://creators.mym.fans${path}`, {
    headers: { cookie, accept: 'application/json', 'x-requested-with': 'XMLHttpRequest', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36' },
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await r.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  if (r.status >= 300) throw new MymError(r.status, r.status >= 300 && r.status < 400 ? 'MYM renvoie vers la page de connexion (session refusée par le site)' : `MYM ${r.status}`);
  return data;
}

/**
 * Appel « brut » au site des créatrices (pages HTML et formulaires, ex. les bons de réduction) : renvoie le statut, le
 * texte, l'adresse de redirection et les cookies posés par MYM (à renvoyer avec le formulaire : le jeton du formulaire
 * est lié à la session de la page). `form` (URLSearchParams) = envoi du formulaire en POST. Jamais de redirection suivie.
 */
export async function mymSiteRaw(cid, path, { form, cookies = '', xhr = false } = {}) {
  await accessOf(cid);
  const l = one('SELECT client_id, access, id_token FROM mym_links WHERE creator_id = ?', cid);
  const access = open(l.access);
  const idTok = l.id_token ? open(l.id_token) : null;
  const claims = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString('utf8'));
  const user = encodeURIComponent(claims.username || claims.sub);
  const pre = `CognitoIdentityServiceProvider.${l.client_id}`;
  const cookie = [`${pre}.LastAuthUser=${user}`, `${pre}.${user}.accessToken=${access}`, ...(idTok ? [`${pre}.${user}.idToken=${idTok}`] : []), 'amplify-signin-with-hostedUI=false', ...(cookies ? [cookies] : [])].join('; ');
  const r = await fetch(`https://creators.mym.fans${path}`, {
    method: form ? 'POST' : 'GET',
    headers: {
      cookie,
      accept: 'text/html,application/xhtml+xml',
      ...(xhr ? { 'x-requested-with': 'XMLHttpRequest' } : {}),
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36',
      ...(form ? { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://creators.mym.fans', referer: `https://creators.mym.fans${path}` } : {}),
    },
    body: form ? form.toString() : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  const location = r.headers.get('location') || null;
  if (r.status >= 300 && r.status < 400 && /login|connexion|signin/i.test(location || '')) throw new MymError(401, 'MYM renvoie vers la page de connexion (session refusée par le site)');
  const set = (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter(Boolean);
  return { status: r.status, text: await r.text(), location, cookies: [cookies, ...set].filter(Boolean).join('; ') };
}

// ---------------------------------------------------------------- abonnés / anciens / intéressés (site MYM)
const followCache = new Map();
/** Compteurs MYM (abonnés actifs, anciens, intéressés, bloqués), gardés 2 min. */
export async function mymFollowerCounts(cid) {
  const hit = followCache.get(cid);
  if (hit && Date.now() - hit.at < 2 * 60_000) return hit.v;
  const d = await mymSite(cid, '/app/ajax/followers/counts');
  const v = { active: Number(d?.countActiveSubscriptions) || 0, old: Number(d?.countInactiveSubscriptions) || 0, interested: Number(d?.countInterestedFans) || 0, blocked: Number(d?.countBlockedFans) || 0 };
  followCache.set(cid, { at: Date.now(), v });
  return v;
}
const TAB_PATH = { active: 'active_subscriptions', old: 'inactive_subscriptions', interested: 'interested_fans' };
const strip = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
/** Une page de fans MYM d'un onglet (pseudo + identifiant MYM), dans l'ordre de MYM. */
export async function mymFollowers(cid, tab, { offset = 0, limit = 50, search = '' } = {}) {
  const q = new URLSearchParams({ offset: String(offset), limit: String(limit), search, sort: '' });
  const d = await mymSite(cid, `/app/ajax/followers/${TAB_PATH[tab]}?${q}`);
  const html = String(d?.html || '');
  // Une carte = avatar (title = pseudo) … puis le lien « data-open-fan-profile-modal data-fan-id="…" » (relevé le 23/11/2026).
  const segs = html.split(/data-open-fan-profile-modal/);
  const rows = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const id = /data-fan-id="(\d+)"/.exec(segs[i + 1])?.[1];
    const titles = [...segs[i].matchAll(/title="([^"]*)"/g)].map((m) => strip(m[1]));
    const username = titles[titles.length - 1] || null;
    const avatar = [...segs[i].matchAll(/<img[^>]+src="([^"]+)"/g)].pop()?.[1] || null;
    if (id && username) rows.push({ mymId: id, username, avatar });
  }
  return { total: Number(d?.total) || 0, more: !!d?.loadMore, rows };
}

export const isLinked = (cid) => !!one('SELECT 1 AS x FROM mym_links WHERE creator_id = ?', String(cid));

// ---------------------------------------------------------------- comptes MYM ajoutés directement dans Bloom
// Depuis le 24/11/2026, un compte MYM se relie sans passer par Substy : « Ajouter un compte » demande seulement l'email
// et le mot de passe MYM Creator (ou l'extension). Bloom lit le profil du compte, puis :
//  - si ce compte MYM est déjà connu (déjà relié une fois) → même modèle ;
//  - sinon, si une modèle MYM de Substy porte le même pseudo → c'est elle (elle garde l'IA de Substy) ;
//  - sinon → une modèle « de Bloom » (`mym_native`, identifiant « mym-<id MYM> »), sans Substy donc sans IA.
// Si la modèle est ajoutée plus tard chez Substy (même pseudo MYM), Bloom fusionne tout seul : `adoptNatives`.
db.exec('CREATE TABLE IF NOT EXISTS mym_native (id TEXT PRIMARY KEY, mym_id TEXT NOT NULL, name TEXT, username TEXT, avatar TEXT, created_by TEXT, created_at INTEGER NOT NULL)');
/** Modèle ajoutée dans Bloom sans Substy (pas d'IA, aucun appel à Substy). */
export const isNative = (cid) => String(cid || '').startsWith('mym-');
export const nativeCreators = () => all('SELECT * FROM mym_native ORDER BY created_at').map((n) => ({ id: n.id, name: n.name || n.username || 'Modèle MYM', username: n.username || null, platform: 'mym', avatar: n.avatar || null, native: true }));
const lower = (x) => String(x || '').trim().toLowerCase();
/** La modèle de Bloom qui correspond à un profil MYM (voir plus haut). `substy` = les créatrices connues de Substy. */
function creatorFor(me, substy, by) {
  const known = one('SELECT creator_id FROM mym_links WHERE mym_id = ?', String(me.id)) || one('SELECT id AS creator_id FROM mym_native WHERE mym_id = ?', String(me.id));
  if (known) return known.creator_id;
  const twin = me.username ? substy.find((x) => /mym/i.test(x.platform || '') && !isNative(x.id) && lower(x.username) === lower(me.username)) : null;
  if (twin) return String(twin.id);
  const id = `mym-${me.id}`;
  const pic = me.avatar?.url || me.avatarUrl || me.avatar_url || me.profilePicture?.url || me.profile_picture || (typeof me.avatar === 'string' ? me.avatar : null);
  run('INSERT OR IGNORE INTO mym_native (id, mym_id, name, username, avatar, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, String(me.id), me.nickname || me.displayName || me.display_name || me.username || null, me.username || null, pic || null, by || null, Date.now());
  return id;
}
/**
 * Une modèle « de Bloom » vient d'apparaître chez Substy (même pseudo MYM) : tout ce que Bloom a noté sous son
 * identifiant « mym-… » passe sous l'identifiant de Substy (liaison, conversations, ventes, groupes, accès…), et elle
 * gagne l'IA. Renvoie le nombre de modèles fusionnées.
 */
export function adoptNatives(substy) {
  let n = 0;
  for (const nat of all('SELECT * FROM mym_native')) {
    const twin = nat.username ? substy.find((x) => /mym/i.test(x.platform || '') && !isNative(x.id) && lower(x.username) === lower(nat.username)) : null;
    if (!twin) continue;
    const tables = all("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name).filter((t) => /^[A-Za-z0-9_]+$/.test(t) && all(`PRAGMA table_info("${t}")`).some((col) => col.name === 'creator_id'));
    for (const t of tables) {
      run(`UPDATE OR IGNORE "${t}" SET creator_id = ? WHERE creator_id = ?`, String(twin.id), nat.id);
      run(`DELETE FROM "${t}" WHERE creator_id = ?`, nat.id);
    }
    for (const k of all("SELECT key, value FROM settings WHERE key LIKE ?", `%:${nat.id}`)) run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', k.key.replace(nat.id, String(twin.id)), k.value);
    run('DELETE FROM mym_native WHERE id = ?', nat.id);
    console.log(`[bloom] modèle MYM « ${nat.username} » maintenant chez Substy : ${nat.id} → ${twin.id}`);
    n++;
  }
  return n;
}

/** Vérifie le compte (profil MYM créatrice) puis enregistre la liaison. Sans `cid` : la modèle est trouvée d'après le profil. */
async function saveLink(cid, { clientId, refresh, access, expiresIn, deviceKey }, by, substy = []) {
  const meR = await fetch(`${API}/creators/me`, { headers: { authorization: `Bearer ${access}`, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  const me = await meR.json().catch(() => null);
  if (!meR.ok || !me?.id) throw new MymError(400, 'MYM n’a pas reconnu ce compte comme un compte créatrice (MYM Creator, pas un compte fan).');
  if (!cid) cid = creatorFor(me, substy, by);
  // Le même compte MYM ne peut être relié qu'à une seule modèle.
  const other = one('SELECT creator_id FROM mym_links WHERE mym_id = ? AND creator_id <> ?', String(me.id), cid);
  if (other) throw new MymError(400, 'Ce compte MYM est déjà relié à une autre modèle dans Bloom.');
  me.bloomId = cid;
  run(
    `INSERT INTO mym_links (creator_id, client_id, refresh, access, access_exp, mym_id, username, linked_by, linked_at, checked_at, error, device_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT (creator_id) DO UPDATE SET client_id = excluded.client_id, refresh = excluded.refresh, access = excluded.access, access_exp = excluded.access_exp, mym_id = excluded.mym_id,
       username = excluded.username, linked_by = excluded.linked_by, linked_at = excluded.linked_at, checked_at = excluded.checked_at, error = NULL, device_key = excluded.device_key`,
    cid, clientId, seal(refresh), seal(access), Date.now() + (expiresIn || 3600) * 1000, String(me.id), me.username || null, by, Date.now(), Date.now(), deviceKey || null,
  );
  return me;
}
const logins = new Map(); // essais de connexion en attente d'un code (5 min)
const attempts = new Map(); // creatorId -> [instants] : 5 essais max par 15 min

export function mymRoutes({ userFrom, send, body, creators, onLinked }) {
  const admin = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    return u;
  };
  const mymCreators = () => creators().filter((c) => /mym/i.test(c.platform || ''));
  const linkView = (cid) => {
    const l = one('SELECT creator_id, mym_id, username, linked_by, linked_at, checked_at, error, access_exp FROM mym_links WHERE creator_id = ?', cid);
    return l ? { linked: true, username: l.username, mymId: l.mym_id, linkedBy: l.linked_by, linkedAt: l.linked_at, checkedAt: l.checked_at, error: l.error, ok: !l.error } : { linked: false };
  };

  return {
    /** État de la liaison de chaque modèle MYM. */
    'GET /api/mym/links': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      const nick = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [m.creator_id, m.nickname]));
      send(res, 200, { canEdit: seesAll(u), links: mymCreators().filter((c) => canSee({ ...u, pf: null, unlinkedToo: true }, c.id)).map((c) => ({ creatorId: c.id, name: nick.get(c.id) || c.name, username: c.username, ...linkView(c.id) })) });
    },
    /** Code à usage unique pour relier une modèle (à coller dans l'extension). */
    'POST /api/mym/link-code': async (req, res) => {
      const u = admin(req, res);
      if (!u) return;
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (cid && !mymCreators().some((c) => c.id === cid)) return send(res, 404, { error: 'Modèle MYM inconnue' });
      const code = randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8).toUpperCase();
      run('DELETE FROM mym_link_codes WHERE expires_at < ?', Date.now());
      run('INSERT INTO mym_link_codes (code, creator_id, created_by, expires_at) VALUES (?, ?, ?, ?)', code, cid, u.name, Date.now() + 15 * 60_000);
      send(res, 200, { code, expiresAt: Date.now() + 15 * 60_000 });
    },
    /** Envoyé par l'extension : code + session MYM. Pas de session Bloom ici : c'est le code qui autorise. */
    'POST /api/mym/link': async (req, res) => {
      res.setHeader('access-control-allow-origin', '*');
      const b = await body(req);
      const code = String(b.code || '').trim().toUpperCase();
      const c = one('SELECT * FROM mym_link_codes WHERE code = ? AND used_at IS NULL AND expires_at > ?', code, Date.now());
      if (!c) return send(res, 400, { error: 'Code inconnu, déjà utilisé ou expiré : crée-en un nouveau dans Bloom.' });
      const clientId = String(b.clientId || '').trim();
      const refresh = String(b.refreshToken || '').trim();
      if (!/^[a-z0-9]{20,40}$/i.test(clientId) || refresh.length < 100) return send(res, 400, { error: 'Session MYM introuvable : connecte-toi à creators.mym.fans dans ce Chrome, puis réessaie.' });
      try {
        const t = await cognitoRefresh(clientId, refresh);
        const me = await saveLink(c.creator_id || null, { clientId, refresh: t.refresh || refresh, access: t.access, expiresIn: t.expiresIn }, c.created_by, creators());
        run('UPDATE mym_link_codes SET used_at = ? WHERE code = ?', Date.now(), code);
        onLinked?.();
        const name = creators().find((x) => x.id === me.bloomId)?.name || me.username || '';
        send(res, 200, { ok: true, username: me.username || null, creator: name });
      } catch (e) {
        send(res, e.status && e.status < 500 ? 400 : 502, { error: e.message });
      }
    },
    /** Relier avec l'email et le mot de passe MYM Creator (comme MyPulse). Le mot de passe n'est jamais gardé. */
    'POST /api/mym/login': async (req, res) => {
      const u = admin(req, res);
      if (!u) return;
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (cid && !mymCreators().some((c) => c.id === cid)) return send(res, 404, { error: 'Modèle MYM inconnue' });
      if (!b.confirmCreator || !b.confirmOwner) return send(res, 400, { error: 'Coche les deux confirmations.' });
      const email = String(b.email || '').trim();
      const password = String(b.password || '');
      if (!/^\S+@\S+\.\S+$/.test(email) || !password) return send(res, 400, { error: 'Email et mot de passe MYM Creator obligatoires.' });
      // Essais comptés par modèle, ou par email quand on ajoute un compte sans modèle.
      const key = cid || `email:${email.toLowerCase()}`;
      const recent = (attempts.get(key) || []).filter((t) => Date.now() - t < 15 * 60_000);
      if (recent.length >= 5) return send(res, 429, { error: 'Trop d’essais pour ce compte : attends 15 minutes (pour ne pas faire bloquer le compte par MYM).' });
      attempts.set(key, [...recent, Date.now()]);
      try {
        const start = srpStart();
        let r = await cognito('InitiateAuth', { AuthFlow: 'USER_SRP_AUTH', ClientId: CLIENT_ID, AuthParameters: { USERNAME: email, SRP_A: start.AHex } }).catch((e) => {
          if (/USER_SRP_AUTH|not enabled|InvalidParameter/i.test(`${e.type} ${e.raw}`)) return null;
          throw e;
        });
        if (!r) r = await cognito('InitiateAuth', { AuthFlow: 'USER_PASSWORD_AUTH', ClientId: CLIENT_ID, AuthParameters: { USERNAME: email, PASSWORD: password } });
        if (r.ChallengeName === 'PASSWORD_VERIFIER') {
          const p = r.ChallengeParameters || {};
          const userId = p.USER_ID_FOR_SRP || p.USERNAME;
          const ans = srpAnswer(start, { poolName: POOL.split('_')[1], userId, password, saltHex: p.SALT, BHex: p.SRP_B, secretBlock: p.SECRET_BLOCK });
          r = await cognito('RespondToAuthChallenge', {
            ChallengeName: 'PASSWORD_VERIFIER',
            ClientId: CLIENT_ID,
            ...(r.Session ? { Session: r.Session } : {}),
            ChallengeResponses: { USERNAME: userId, PASSWORD_CLAIM_SECRET_BLOCK: p.SECRET_BLOCK, TIMESTAMP: ans.timestamp, PASSWORD_CLAIM_SIGNATURE: ans.signature },
          });
        }
        if (r.AuthenticationResult) {
          const a = r.AuthenticationResult;
          const me = await saveLink(cid || null, { clientId: CLIENT_ID, refresh: a.RefreshToken, access: a.AccessToken, expiresIn: a.ExpiresIn, deviceKey: a.NewDeviceMetadata?.DeviceKey }, u.name, creators());
          attempts.delete(key);
          onLinked?.();
          return send(res, 200, { ok: true, username: me.username || null, creatorId: me.bloomId, native: isNative(me.bloomId) });
        }
        const kinds = { SMS_MFA: 'SMS_MFA_CODE', SOFTWARE_TOKEN_MFA: 'SOFTWARE_TOKEN_MFA_CODE', EMAIL_OTP: 'EMAIL_OTP_CODE' };
        if (kinds[r.ChallengeName]) {
          const id = randomBytes(12).toString('base64url');
          const p = r.ChallengeParameters || {};
          logins.set(id, { cid, key, by: u.name, challenge: r.ChallengeName, session: r.Session, username: p.USER_ID_FOR_SRP || p.USERNAME || email, at: Date.now() });
          setTimeout(() => logins.delete(id), 5 * 60_000);
          return send(res, 200, { needCode: true, loginId: id, kind: r.ChallengeName, destination: p.CODE_DELIVERY_DESTINATION || null });
        }
        send(res, 400, { error: `MYM demande une étape que Bloom ne sait pas encore faire (${r.ChallengeName || 'inconnue'}). Utilise l’extension.` });
      } catch (e) {
        send(res, e.status === 401 || e.status === 400 ? 400 : 502, { error: e.message });
      }
    },
    /** Code de validation envoyé par MYM (SMS, e-mail ou appli d'authentification). */
    'POST /api/mym/login/code': async (req, res) => {
      const u = admin(req, res);
      if (!u) return;
      const b = await body(req);
      const l = logins.get(String(b.loginId || ''));
      if (!l) return send(res, 400, { error: 'Connexion expirée : recommence depuis le début.' });
      const code = String(b.code || '').replace(/\s+/g, '');
      if (!/^\d{4,10}$/.test(code)) return send(res, 400, { error: 'Code invalide.' });
      const field = { SMS_MFA: 'SMS_MFA_CODE', SOFTWARE_TOKEN_MFA: 'SOFTWARE_TOKEN_MFA_CODE', EMAIL_OTP: 'EMAIL_OTP_CODE' }[l.challenge];
      try {
        const r = await cognito('RespondToAuthChallenge', { ChallengeName: l.challenge, ClientId: CLIENT_ID, Session: l.session, ChallengeResponses: { USERNAME: l.username, [field]: code } });
        if (!r.AuthenticationResult) return send(res, 400, { error: `MYM demande encore une étape (${r.ChallengeName || 'inconnue'}).` });
        const a = r.AuthenticationResult;
        const me = await saveLink(l.cid || null, { clientId: CLIENT_ID, refresh: a.RefreshToken, access: a.AccessToken, expiresIn: a.ExpiresIn, deviceKey: a.NewDeviceMetadata?.DeviceKey }, l.by, creators());
        logins.delete(String(b.loginId));
        attempts.delete(l.key);
        onLinked?.();
        send(res, 200, { ok: true, username: me.username || null, creatorId: me.bloomId, native: isNative(me.bloomId) });
      } catch (e) {
        send(res, e.status === 401 || e.status === 400 ? 400 : 502, { error: e.message });
      }
    },
    'OPTIONS /api/mym/link': (req, res) => {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' });
      res.end();
    },
    /** Vérifier que la liaison marche (renouvelle le jeton et relit le profil MYM). */
    'POST /api/mym/check': async (req, res) => {
      const u = admin(req, res);
      if (!u) return;
      const b = await body(req);
      const cid = String(b.creatorId || '');
      try {
        const me = await mym(cid, '/creators/me');
        run('UPDATE mym_links SET username = ?, checked_at = ?, error = NULL WHERE creator_id = ?', me?.username || null, Date.now(), cid);
        send(res, 200, { ok: true, ...linkView(cid) });
      } catch (e) {
        send(res, 200, { ok: false, error: e.message, ...linkView(cid) });
      }
    },
    /** Essai (admins) : lecture d'une adresse MYM autorisée, pour vérifier ce que Bloom peut lire. Renvoie la forme, pas les données. */
    'GET /api/mym/probe': async (req, res) => {
      const u = userFrom(req);
      if (!u || u.role !== 'admin') return send(res, 403, { error: 'Admins seulement' });
      const p = new URL(req.url, 'http://x').searchParams;
      const cid = String(p.get('creatorId') || '');
      const ALLOWED = { counts: '/app/ajax/followers/counts', active: '/app/ajax/followers/active_subscriptions?offset=0&limit=5&search=&sort=', calendar: '/v1/posts/calendar', me: '/creators/me' };
      const what = String(p.get('what') || 'counts');
      if (!ALLOWED[what]) return send(res, 400, { error: 'Adresse non autorisée' });
      const shape = (o) => (o && typeof o === 'object' ? (Array.isArray(o) ? `array:${o.length}` : Object.keys(o).slice(0, 20)) : typeof o === 'string' ? `text:${o.length}` : typeof o);
      try {
        const d = what === 'calendar' ? await mym(cid, ALLOWED[what], { base: STYX }) : what === 'me' ? await mym(cid, ALLOWED[what]) : await mymSite(cid, ALLOWED[what]);
        send(res, 200, { ok: true, shape: shape(d), total: d?.total ?? d?.countActiveSubscriptions ?? null });
      } catch (e) {
        send(res, 200, { ok: false, status: e.status || null, error: e.message });
      }
    },
    'POST /api/mym/unlink': async (req, res) => {
      const u = admin(req, res);
      if (!u) return;
      const b = await body(req);
      run('DELETE FROM mym_links WHERE creator_id = ?', String(b.creatorId || ''));
      send(res, 200, { ok: true });
    },
  };
}

// Vérification régulière (toutes les 30 min) : garde le jeton d'accès frais et signale une liaison cassée.
setInterval(() => {
  for (const { creator_id: cid } of all('SELECT creator_id FROM mym_links')) accessOf(cid).catch(() => {});
}, 30 * 60_000);
