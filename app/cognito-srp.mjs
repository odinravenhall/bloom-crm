// Connexion « email + mot de passe » à un groupe d'utilisateurs AWS Cognito avec le protocole SRP (USER_SRP_AUTH),
// celui qu'utilise Amplify sur le site des créatrices MYM. Le mot de passe ne quitte jamais le serveur et n'est pas envoyé
// à Cognito (seule une preuve calculée l'est) ; il n'est jamais enregistré. Reprend les conventions
// d'amazon-cognito-identity-js (AuthenticationHelper) : hachages SHA-256, nombres en hexadécimal « paddé ».
import { createHash, createHmac, randomBytes } from 'node:crypto';

// Groupe de 3072 bits de la RFC 5054 (celui de Cognito), g = 2.
const N_HEX =
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF';
const N = BigInt('0x' + N_HEX);
const g = 2n;
const INFO = 'Caldera Derived Key';

const hex = (n) => n.toString(16);
/** Hexa signé façon Java BigInteger (Amplify) : longueur paire, et « 00 » devant si le 1er bit est à 1. */
export function padHex(v) {
  let h = typeof v === 'bigint' ? hex(v) : String(v);
  if (h.length % 2 === 1) h = '0' + h;
  else if ('89abcdefABCDEF'.includes(h[0])) h = '00' + h;
  return h;
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex').padStart(64, '0');
const hexHash = (h) => sha(Buffer.from(h, 'hex'));
const mod = (a, m) => ((a % m) + m) % m;
function modPow(b, e, m) {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    e >>= 1n;
    b = (b * b) % m;
  }
  return r;
}
const k = BigInt('0x' + hexHash(padHex(N) + padHex(g)));
const hkdf = (ikm, salt) => {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  return createHmac('sha256', prk).update(Buffer.concat([Buffer.from(INFO, 'utf8'), Buffer.from([1])])).digest().subarray(0, 16);
};
/** Date au format exigé par Cognito : « Mon Nov 3 09:05:07 UTC 2026 » (jour sans zéro). */
export function cognitoDate(d = new Date()) {
  const D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const p = (n) => String(n).padStart(2, '0');
  return `${D} ${M} ${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC ${d.getUTCFullYear()}`;
}

/** Nouvelle clé éphémère côté client : a (secret) et A = g^a mod N. */
export function srpStart() {
  let a, A;
  do {
    a = BigInt('0x' + randomBytes(128).toString('hex'));
    A = modPow(g, a, N);
  } while (A % N === 0n);
  return { a, A, AHex: hex(A) };
}

/** Clé de session HKDF (S, u) pour l'utilisateur, à partir du défi PASSWORD_VERIFIER. */
export function srpKey({ a, A }, { poolName, userId, password, saltHex, BHex }) {
  const B = BigInt('0x' + BHex);
  if (B % N === 0n) throw new Error('Défi SRP invalide');
  const u = BigInt('0x' + hexHash(padHex(A) + padHex(B)));
  if (u === 0n) throw new Error('Défi SRP invalide');
  const userHash = sha(Buffer.from(`${poolName}${userId}:${password}`, 'utf8'));
  const x = BigInt('0x' + hexHash(padHex(saltHex) + userHash));
  const S = modPow(mod(B - k * modPow(g, x, N), N), a + u * x, N);
  return { key: hkdf(Buffer.from(padHex(S), 'hex'), Buffer.from(padHex(u), 'hex')), S, u, x };
}

/** Réponse au défi PASSWORD_VERIFIER (signature HMAC). */
export function srpAnswer(start, { poolName, userId, password, saltHex, BHex, secretBlock, now = new Date() }) {
  const { key } = srpKey(start, { poolName, userId, password, saltHex, BHex });
  const timestamp = cognitoDate(now);
  const msg = Buffer.concat([Buffer.from(poolName, 'utf8'), Buffer.from(userId, 'utf8'), Buffer.from(secretBlock, 'base64'), Buffer.from(timestamp, 'utf8')]);
  return { timestamp, signature: createHmac('sha256', key).update(msg).digest('base64') };
}

// Pour les tests : côté « serveur » SRP (vérifie que les calculs du client tombent juste).
export const _test = { N, g, k, modPow, hexHash, padHex, sha };
