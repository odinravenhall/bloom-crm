// Stockage de Bloom : base SQLite (data/bloom.db) et chiffrement de la session Substy.
// La clé de chiffrement est créée sur le serveur au premier démarrage (data/secret.key, jamais dans le dépôt).
import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';

const DIR = process.env.DATA_DIR || '/data';
mkdirSync(DIR, { recursive: true });

const KEY_FILE = `${DIR}/secret.key`;
if (!existsSync(KEY_FILE)) {
  writeFileSync(KEY_FILE, randomBytes(32).toString('base64'));
  chmodSync(KEY_FILE, 0o600);
}
const KEY = Buffer.from(readFileSync(KEY_FILE, 'utf8').trim(), 'base64');

export const db = new DatabaseSync(`${DIR}/bloom.db`);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'chatter',      -- admin | lead | chatter
    pass_hash TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, creator_id TEXT, type TEXT, data TEXT, at INTEGER NOT NULL);
`);

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function getSetting(key) {
  return one('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
}
export function setSetting(key, value) {
  run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', key, value, Date.now());
}

/** Chiffrement AES-256-GCM (pour la session Substy). */
export function seal(text) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function open(b64) {
  const buf = Buffer.from(b64, 'base64');
  const d = createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

export function hashPassword(pw) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`;
}
export function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
