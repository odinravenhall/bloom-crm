// Liaison directe Bloom ↔ compte MYM d'une modèle (sans MyPulse). Relevé le 23/11/2026 sur creators.mym.fans :
//  - Connexion MYM = AWS Cognito (région eu-west-3) : jeton d'accès 1 h + jeton de renouvellement, gardés par le site
//    dans des cookies « CognitoIdentityServiceProvider.<clientId>.<utilisateur>.* ».
//  - API du site : https://api.mym.fans (profil « /creators/me », médias, playlists) et https://styx.mym.fans
//    (posts « /v1/posts », calendrier « /v1/posts/calendar », pushes « /v2/pushes », chats) — en-tête
//    « Authorization: Bearer <jeton d'accès> ».
// Liaison : un admin crée un code à usage unique (15 min) pour une modèle ; l'extension « Bloom – Relier MYM », dans le
// Chrome où l'on est connecté à MYM, envoie le jeton de renouvellement avec ce code. Bloom le vérifie (renouvellement +
// « /creators/me »), le garde CHIFFRÉ et renouvelle le jeton d'accès tout seul. Bloom ne voit jamais le mot de passe.
// Toute la couche MYM est ici, pour corriger à un seul endroit si MYM change son API.
import { randomBytes } from 'node:crypto';
import { all, db, one, open, run, seal } from './store.mjs';
import { canSee, seesAll } from './team.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS mym_links (
    creator_id TEXT PRIMARY KEY, client_id TEXT NOT NULL, refresh TEXT NOT NULL, access TEXT, access_exp INTEGER,
    mym_id TEXT, username TEXT, linked_by TEXT, linked_at INTEGER NOT NULL, checked_at INTEGER, error TEXT
  );
  CREATE TABLE IF NOT EXISTS mym_link_codes (code TEXT PRIMARY KEY, creator_id TEXT NOT NULL, created_by TEXT, expires_at INTEGER NOT NULL, used_at INTEGER);
`);

const REGION = 'eu-west-3';
export const API = 'https://api.mym.fans';
export const STYX = 'https://styx.mym.fans';

export class MymError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Jeton de renouvellement → nouveau jeton d'accès (AWS Cognito, comme le site de MYM). */
async function cognitoRefresh(clientId, refreshToken) {
  const r = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    body: JSON.stringify({ AuthFlow: 'REFRESH_TOKEN_AUTH', ClientId: clientId, AuthParameters: { REFRESH_TOKEN: refreshToken } }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!r) throw new MymError(502, 'MYM (connexion) ne répond pas');
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.AuthenticationResult?.AccessToken) {
    const why = String(b.__type || '').includes('NotAuthorized') ? 'La session MYM a expiré ou a été fermée : il faut relier le compte à nouveau.' : `Connexion MYM refusée (${b.__type || r.status})`;
    throw new MymError(401, why);
  }
  return { access: b.AuthenticationResult.AccessToken, expiresIn: Number(b.AuthenticationResult.ExpiresIn) || 3600, refresh: b.AuthenticationResult.RefreshToken || null };
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
      const t = await cognitoRefresh(l.client_id, open(l.refresh));
      run('UPDATE mym_links SET access = ?, access_exp = ?, refresh = COALESCE(?, refresh), checked_at = ?, error = NULL WHERE creator_id = ?', seal(t.access), Date.now() + t.expiresIn * 1000, t.refresh ? seal(t.refresh) : null, Date.now(), cid);
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
export const isLinked = (cid) => !!one('SELECT 1 AS x FROM mym_links WHERE creator_id = ?', String(cid));

export function mymRoutes({ userFrom, send, body, creators }) {
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
      send(res, 200, { canEdit: seesAll(u), links: mymCreators().filter((c) => canSee({ ...u, pf: null }, c.id)).map((c) => ({ creatorId: c.id, name: nick.get(c.id) || c.name, username: c.username, ...linkView(c.id) })) });
    },
    /** Code à usage unique pour relier une modèle (à coller dans l'extension). */
    'POST /api/mym/link-code': async (req, res) => {
      const u = admin(req, res);
      if (!u) return;
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (!mymCreators().some((c) => c.id === cid)) return send(res, 404, { error: 'Modèle MYM inconnue' });
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
        const meR = await fetch(`${API}/creators/me`, { headers: { authorization: `Bearer ${t.access}`, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
        const me = await meR.json().catch(() => null);
        if (!meR.ok || !me?.id) throw new MymError(400, 'MYM n’a pas reconnu ce compte comme un compte créatrice.');
        run(
          `INSERT INTO mym_links (creator_id, client_id, refresh, access, access_exp, mym_id, username, linked_by, linked_at, checked_at, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT (creator_id) DO UPDATE SET client_id = excluded.client_id, refresh = excluded.refresh, access = excluded.access, access_exp = excluded.access_exp, mym_id = excluded.mym_id,
             username = excluded.username, linked_by = excluded.linked_by, linked_at = excluded.linked_at, checked_at = excluded.checked_at, error = NULL`,
          c.creator_id, clientId, seal(t.refresh || refresh), seal(t.access), Date.now() + t.expiresIn * 1000, String(me.id), me.username || null, c.created_by, Date.now(), Date.now(),
        );
        run('UPDATE mym_link_codes SET used_at = ? WHERE code = ?', Date.now(), code);
        const name = creators().find((x) => x.id === c.creator_id)?.name || '';
        send(res, 200, { ok: true, username: me.username || null, creator: name });
      } catch (e) {
        send(res, e.status && e.status < 500 ? 400 : 502, { error: e.message });
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
