// Équipe de Bloom : qui a accès à quelles créatrices, qui est en ligne et sur quel fan, activité du jour.
//  - Accès : un admin voit tout. Un manager ou un chatteur ne voit que les créatrices qu'on lui a données
//    (ou toutes, si « toutes les créatrices » est coché). Un nouveau chatteur ne voit rien tant qu'on ne lui a rien donné.
//  - Présence : la messagerie de chaque personne signale toutes les 20 s la conversation ouverte. On sait ainsi qui est
//    en ligne, et deux chatteurs voient quand ils sont sur le même fan (pour ne pas répondre deux fois).
import { all, db, one, run } from './store.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS user_creators (user_id INTEGER NOT NULL, creator_id TEXT NOT NULL, PRIMARY KEY (user_id, creator_id));
`);
try {
  db.exec('ALTER TABLE users ADD COLUMN all_creators INTEGER NOT NULL DEFAULT 0');
} catch {}

// ---------------------------------------------------------------- accès
const accessCache = new Map(); // userId -> { at, set }
/** null = toutes les créatrices ; sinon l'ensemble des créatrices autorisées. */
export function creatorsOf(u) {
  if (!u) return new Set();
  if (u.role === 'admin') return null;
  const hit = accessCache.get(u.id);
  if (hit && Date.now() - hit.at < 15_000) return hit.set;
  const row = one('SELECT all_creators FROM users WHERE id = ?', u.id);
  const set = row?.all_creators ? null : new Set(all('SELECT creator_id FROM user_creators WHERE user_id = ?', u.id).map((r) => r.creator_id));
  accessCache.set(u.id, { at: Date.now(), set });
  return set;
}
export const canSee = (u, creatorId) => {
  const s = creatorsOf(u);
  return s === null || s.has(String(creatorId || ''));
};
export function setAccess(userId, { all: allC, creators }) {
  run('UPDATE users SET all_creators = ? WHERE id = ?', allC ? 1 : 0, userId);
  run('DELETE FROM user_creators WHERE user_id = ?', userId);
  for (const c of creators || []) run('INSERT OR IGNORE INTO user_creators (user_id, creator_id) VALUES (?, ?)', userId, String(c));
  accessCache.delete(userId);
}

// ---------------------------------------------------------------- présence
const presence = new Map(); // userId -> { at, creatorId, fanId, name, avatar }
const ONLINE_MS = 45_000;
export function ping(u, { creatorId, fanId, page }) {
  presence.set(u.id, { at: Date.now(), creatorId: creatorId ? String(creatorId) : null, fanId: fanId ? String(fanId) : null, page: page ? String(page).slice(0, 40) : null, name: u.name, avatar: u.avatar || null });
}
/** Personnes en ligne sur une créatrice (et le fan qu'elles ont ouvert). */
export function onCreator(creatorId) {
  const out = [];
  for (const [userId, p] of presence) if (Date.now() - p.at < ONLINE_MS && p.creatorId === String(creatorId)) out.push({ userId, name: p.name, avatar: p.avatar, fanId: p.fanId });
  return out;
}

// ---------------------------------------------------------------- page Équipe
export function teamView() {
  const since = parisMidnight(parisDay(Date.now()));
  const users = all('SELECT id, name, email, role, avatar, discord_id, active, all_creators, created_at FROM users ORDER BY active DESC, name COLLATE NOCASE');
  const access = all('SELECT user_id, creator_id FROM user_creators');
  const sent = all(
    `SELECT user_id, COUNT(*) AS msgs, SUM(price > 0) AS ppv, SUM(price) AS ppvValue, MAX(at) AS last FROM sent_log WHERE at >= ? GROUP BY user_id`,
    since,
  );
  const lastEver = all('SELECT user_id, MAX(at) AS last FROM sent_log GROUP BY user_id');
  // Ventes du jour faites depuis Bloom (PPV envoyé dans Bloom puis acheté), par nom et par devise.
  const sold = all("SELECT origin_by AS name, currency, COUNT(*) AS n, SUM(net) AS net FROM rv_sales WHERE origin = 'bloom' AND at >= ? GROUP BY origin_by, currency", since);
  return users.map((u) => {
    const p = presence.get(u.id);
    const s = sent.find((x) => x.user_id === u.id);
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      avatar: u.avatar,
      discord: !!u.discord_id,
      active: !!u.active,
      allCreators: u.role === 'admin' || !!u.all_creators,
      creators: access.filter((a) => a.user_id === u.id).map((a) => a.creator_id),
      online: !!p && Date.now() - p.at < ONLINE_MS,
      seenAt: p?.at || null,
      on: p && Date.now() - p.at < ONLINE_MS ? { creatorId: p.creatorId, fanId: p.fanId, page: p.page } : null,
      today: { msgs: s?.msgs || 0, ppv: s?.ppv || 0, ppvValue: s?.ppvValue || 0, last: s?.last || null },
      lastSent: lastEver.find((x) => x.user_id === u.id)?.last || null,
      sold: sold.filter((x) => x.name === u.name).map((x) => ({ currency: x.currency, n: x.n, net: x.net })),
    };
  });
}

export function setActive(userId, active) {
  run('UPDATE users SET active = ? WHERE id = ?', active ? 1 : 0, userId);
  if (!active) run('DELETE FROM sessions WHERE user_id = ?', userId);
  accessCache.delete(userId);
}
