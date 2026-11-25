// Liaison directe Bloom ↔ compte OnlyFans d'une modèle (sans Substy). Même principe que MYM (mym.mjs) :
//  - Extension « Bloom – Relier OnlyFans » (extension-of/) : un code à usage unique (15 min) + la session du Chrome
//    connecté à onlyfans.com (cookies « sess » et « auth_id », valeur « bcTokenSha » du site = en-tête x-bc,
//    User-Agent du navigateur, auquel la session est liée). Le mot de passe n'est jamais lu.
//  - La session est gardée CHIFFRÉE (seal) dans of_links.
// API du site : https://onlyfans.com/api2/v2/... Chaque requête est SIGNÉE (en-têtes sign / time / app-token) avec des
// « règles » qu'OnlyFans change régulièrement : Bloom ne les met pas en dur, un admin donne une adresse qui les publie
// (réglage « of_rules_url ») ou les colle directement (« of_rules »). Format attendu (JSON) :
//   { app_token, static_param, checksum_indexes: [..], checksum_constant, prefix, suffix }  (ou « format » : "p:{}:{:x}:s")
// Toute la couche OnlyFans est ici, pour corriger à un seul endroit si OnlyFans change son API.
import { createHash, randomBytes } from 'node:crypto';
import { all, db, getSetting, one, open, run, seal, setSetting } from './store.mjs';
import { canSee, seesAll } from './team.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS of_links (
    creator_id TEXT PRIMARY KEY, of_id TEXT NOT NULL, username TEXT, session TEXT NOT NULL,
    linked_by TEXT, linked_at INTEGER NOT NULL, checked_at INTEGER, error TEXT
  );
  CREATE TABLE IF NOT EXISTS of_link_codes (code TEXT PRIMARY KEY, creator_id TEXT NOT NULL, created_by TEXT, expires_at INTEGER NOT NULL, used_at INTEGER);
`);

export const OF = 'https://onlyfans.com';

export class OfError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- Règles de signature ----------
let rulesCache = null; // { at, rules }
async function rules() {
  if (rulesCache && Date.now() - rulesCache.at < 30 * 60_000) return rulesCache.rules;
  let r = null;
  const url = getSetting('of_rules_url');
  if (url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) r = await res.json();
    } catch {}
  }
  if (!r) {
    const raw = getSetting('of_rules');
    if (raw) r = JSON.parse(raw);
  }
  if (!r || !r.static_param || !Array.isArray(r.checksum_indexes)) {
    throw new OfError(503, 'Règles de signature OnlyFans absentes : un admin doit les configurer (adresse ou JSON).');
  }
  rulesCache = { at: Date.now(), rules: r };
  return r;
}

/** En-têtes signés pour un chemin « /api2/v2/...?... ». */
export function signHeaders(r, path, userId) {
  const time = String(Date.now());
  const sha = createHash('sha1').update([r.static_param, time, path, userId].join('\n')).digest('hex');
  const sum = r.checksum_indexes.reduce((s, i) => s + sha.charCodeAt(i), 0) + Number(r.checksum_constant || 0);
  const hex = Math.abs(sum).toString(16);
  const sign = r.format ? r.format.replace('{}', sha).replace('{:x}', hex) : `${r.prefix}:${sha}:${hex}:${r.suffix}`;
  return { time, sign, 'app-token': r.app_token };
}

// ---------- Appels à l'API ----------
const sessionOf = (cid) => {
  const l = one('SELECT session FROM of_links WHERE creator_id = ?', cid);
  if (!l) throw new OfError(404, 'Cette modèle n’est pas reliée à OnlyFans.');
  return JSON.parse(open(l.session));
};

async function call(s, path, { method = 'GET', json } = {}) {
  const r = await rules();
  const res = await fetch(OF + path, {
    method,
    headers: {
      accept: 'application/json, text/plain, */*',
      'user-agent': s.ua,
      'user-id': s.authId,
      'x-bc': s.bc,
      cookie: `sess=${s.sess}; auth_id=${s.authId}`,
      ...signHeaders(r, path, s.authId),
      ...(json ? { 'content-type': 'application/json' } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let b = null;
  try {
    b = text ? JSON.parse(text) : null;
  } catch {}
  if (res.status === 401) throw new OfError(401, 'Session OnlyFans expirée ou refusée : relie à nouveau la modèle avec l’extension.');
  if (!res.ok) throw new OfError(res.status, b?.error?.message || `OnlyFans a répondu ${res.status}`);
  return b;
}

/** Appel API pour une modèle reliée (met à jour l'état de la liaison). */
export async function of(cid, path, opts) {
  try {
    const b = await call(sessionOf(cid), path, opts);
    run('UPDATE of_links SET checked_at = ?, error = NULL WHERE creator_id = ?', Date.now(), cid);
    return b;
  } catch (e) {
    if (e.status === 401) run('UPDATE of_links SET error = ?, checked_at = ? WHERE creator_id = ?', e.message, Date.now(), cid);
    throw e;
  }
}

export const isOfLinked = (cid) => !!one('SELECT 1 FROM of_links WHERE creator_id = ? AND error IS NULL', cid);

// ---------- Routes ----------
export function onlyfansRoutes({ userFrom, send, body, creators }) {
  const admin = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    return u;
  };
  const ofCreators = () => creators().filter((c) => /only/i.test(c.platform || ''));
  const linkView = (cid) => {
    const l = one('SELECT of_id, username, linked_by, linked_at, checked_at, error FROM of_links WHERE creator_id = ?', cid);
    return l ? { linked: true, ofId: l.of_id, username: l.username, linkedBy: l.linked_by, linkedAt: l.linked_at, checkedAt: l.checked_at, error: l.error, ok: !l.error } : { linked: false };
  };

  return {
    /** État de la liaison de chaque modèle OnlyFans. */
    'GET /api/of/links': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      const nick = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [m.creator_id, m.nickname]));
      const hasRules = !!(getSetting('of_rules_url') || getSetting('of_rules'));
      send(res, 200, {
        canEdit: seesAll(u),
        hasRules,
        links: ofCreators().filter((c) => canSee({ ...u, pf: null, unlinkedToo: true }, c.id)).map((c) => ({ creatorId: c.id, name: nick.get(c.id) || c.name, username: c.username, pid: c.pid || null, ...linkView(c.id) })),
      });
    },
    /** Code à usage unique pour relier une modèle (à coller dans l'extension). */
    'POST /api/of/link-code': async (req, res) => {
      const u = admin(req, res);
      if (!u) return;
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (!ofCreators().some((c) => c.id === cid)) return send(res, 404, { error: 'Modèle OnlyFans inconnue' });
      const code = randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8).toUpperCase();
      run('DELETE FROM of_link_codes WHERE expires_at < ?', Date.now());
      run('INSERT INTO of_link_codes (code, creator_id, created_by, expires_at) VALUES (?, ?, ?, ?)', code, cid, u.name, Date.now() + 15 * 60_000);
      send(res, 200, { code, expiresAt: Date.now() + 15 * 60_000 });
    },
    /** Envoyé par l'extension : code + session OnlyFans. C'est le code qui autorise (pas de session Bloom ici). */
    'POST /api/of/link': async (req, res) => {
      res.setHeader('access-control-allow-origin', '*');
      const b = await body(req);
      const code = String(b.code || '').trim().toUpperCase();
      const c = one('SELECT * FROM of_link_codes WHERE code = ? AND used_at IS NULL AND expires_at > ?', code, Date.now());
      if (!c) return send(res, 400, { error: 'Code inconnu, déjà utilisé ou expiré : crée-en un nouveau dans Bloom.' });
      const s = { sess: String(b.sess || '').trim(), authId: String(b.authId || '').trim(), bc: String(b.bc || '').trim(), ua: String(b.ua || '').slice(0, 400) };
      if (!/^[a-z0-9]{20,64}$/i.test(s.sess) || !/^\d{1,15}$/.test(s.authId) || !/^[a-f0-9]{20,128}$/i.test(s.bc) || !s.ua) {
        return send(res, 400, { error: 'Session OnlyFans introuvable : connecte-toi à onlyfans.com dans ce Chrome (onglet ouvert), puis réessaie.' });
      }
      const creator = creators().find((x) => x.id === c.creator_id);
      // Le compte connecté dans Chrome doit être celui de la modèle choisie dans Bloom.
      if (creator?.pid && creator.pid !== s.authId) return send(res, 400, { error: `Ce Chrome est connecté à un autre compte OnlyFans que celui de ${creator.name}.` });
      try {
        const me = await call(s, '/api2/v2/users/me');
        if (String(me?.id) !== s.authId) throw new OfError(400, 'OnlyFans ne reconnaît pas cette session.');
        run(
          `INSERT INTO of_links (creator_id, of_id, username, session, linked_by, linked_at, checked_at, error) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(creator_id) DO UPDATE SET of_id = excluded.of_id, username = excluded.username, session = excluded.session,
             linked_by = excluded.linked_by, linked_at = excluded.linked_at, checked_at = excluded.checked_at, error = NULL`,
          c.creator_id, s.authId, me.username || null, seal(JSON.stringify(s)), c.created_by, Date.now(), Date.now(),
        );
        run('UPDATE of_link_codes SET used_at = ? WHERE code = ?', Date.now(), code);
        send(res, 200, { ok: true, username: me.username || null, creator: creator?.name || '' });
      } catch (e) {
        send(res, e.status && e.status < 500 ? 400 : 502, { error: e.message });
      }
    },
    'OPTIONS /api/of/link': (req, res) => {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' });
      res.end();
    },
    /** Vérifier que la liaison marche (relit le profil OnlyFans). */
    'POST /api/of/check': async (req, res) => {
      const u = admin(req, res);
      if (!u) return;
      const b = await body(req);
      const cid = String(b.creatorId || '');
      try {
        const me = await of(cid, '/api2/v2/users/me');
        run('UPDATE of_links SET username = ? WHERE creator_id = ?', me?.username || null, cid);
        send(res, 200, { ok: true, ...linkView(cid) });
      } catch (e) {
        send(res, 200, { ok: false, error: e.message, ...linkView(cid) });
      }
    },
    /** Délier une modèle (efface la session). */
    'POST /api/of/unlink': async (req, res) => {
      const u = admin(req, res);
      if (!u) return;
      const b = await body(req);
      run('DELETE FROM of_links WHERE creator_id = ?', String(b.creatorId || ''));
      send(res, 200, { ok: true });
    },
    /** Règles de signature : adresse qui les publie, ou JSON collé. Réservé aux admins/managers. */
    'POST /api/of/rules': async (req, res) => {
      const u = admin(req, res);
      if (!u) return;
      const b = await body(req);
      if (b.url != null) {
        const url = String(b.url).trim();
        if (url && !/^https:\/\//.test(url)) return send(res, 400, { error: 'L’adresse doit commencer par https://' });
        setSetting('of_rules_url', url);
      }
      if (b.json != null) {
        const raw = String(b.json).trim();
        if (raw) {
          try {
            const r = JSON.parse(raw);
            if (!r.static_param || !Array.isArray(r.checksum_indexes)) throw new Error();
          } catch {
            return send(res, 400, { error: 'JSON invalide : il faut au moins static_param et checksum_indexes.' });
          }
        }
        setSetting('of_rules', raw);
      }
      rulesCache = null;
      try {
        await rules();
        send(res, 200, { ok: true });
      } catch (e) {
        send(res, 400, { error: e.message });
      }
    },
  };
}
