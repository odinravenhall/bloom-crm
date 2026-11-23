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
try {
  db.exec('ALTER TABLE mym_links ADD COLUMN device_key TEXT');
} catch {}

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
      const t = await cognitoRefresh(l.client_id, open(l.refresh), l.device_key || undefined);
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

/** Vérifie le compte (profil MYM créatrice) puis enregistre la liaison. */
async function saveLink(cid, { clientId, refresh, access, expiresIn, deviceKey }, by) {
  const meR = await fetch(`${API}/creators/me`, { headers: { authorization: `Bearer ${access}`, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  const me = await meR.json().catch(() => null);
  if (!meR.ok || !me?.id) throw new MymError(400, 'MYM n’a pas reconnu ce compte comme un compte créatrice (MYM Creator, pas un compte fan).');
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
        const me = await saveLink(c.creator_id, { clientId, refresh: t.refresh || refresh, access: t.access, expiresIn: t.expiresIn }, c.created_by);
        run('UPDATE mym_link_codes SET used_at = ? WHERE code = ?', Date.now(), code);
        const name = creators().find((x) => x.id === c.creator_id)?.name || '';
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
      if (!mymCreators().some((c) => c.id === cid)) return send(res, 404, { error: 'Modèle MYM inconnue' });
      if (!b.confirmCreator || !b.confirmOwner) return send(res, 400, { error: 'Coche les deux confirmations.' });
      const email = String(b.email || '').trim();
      const password = String(b.password || '');
      if (!/^\S+@\S+\.\S+$/.test(email) || !password) return send(res, 400, { error: 'Email et mot de passe MYM Creator obligatoires.' });
      const recent = (attempts.get(cid) || []).filter((t) => Date.now() - t < 15 * 60_000);
      if (recent.length >= 5) return send(res, 429, { error: 'Trop d’essais pour cette modèle : attends 15 minutes (pour ne pas faire bloquer le compte par MYM).' });
      attempts.set(cid, [...recent, Date.now()]);
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
          const me = await saveLink(cid, { clientId: CLIENT_ID, refresh: a.RefreshToken, access: a.AccessToken, expiresIn: a.ExpiresIn, deviceKey: a.NewDeviceMetadata?.DeviceKey }, u.name);
          attempts.delete(cid);
          return send(res, 200, { ok: true, username: me.username || null });
        }
        const kinds = { SMS_MFA: 'SMS_MFA_CODE', SOFTWARE_TOKEN_MFA: 'SOFTWARE_TOKEN_MFA_CODE', EMAIL_OTP: 'EMAIL_OTP_CODE' };
        if (kinds[r.ChallengeName]) {
          const id = randomBytes(12).toString('base64url');
          const p = r.ChallengeParameters || {};
          logins.set(id, { cid, by: u.name, challenge: r.ChallengeName, session: r.Session, username: p.USER_ID_FOR_SRP || p.USERNAME || email, at: Date.now() });
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
        const me = await saveLink(l.cid, { clientId: CLIENT_ID, refresh: a.RefreshToken, access: a.AccessToken, expiresIn: a.ExpiresIn, deviceKey: a.NewDeviceMetadata?.DeviceKey }, l.by);
        logins.delete(String(b.loginId));
        attempts.delete(l.cid);
        send(res, 200, { ok: true, username: me.username || null });
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
