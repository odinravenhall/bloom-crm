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

// ---------------------------------------------------------------- rôles
// admin     : tout, y compris les branchements (Substy, Discord, Infloww / MyPulse).
// manager   : managers des modèles et du chatting : toutes les créatrices, l'équipe, les chiffres.
// lead      : team leader : surveille ses chatteurs (équipe, chiffres) sur les créatrices qu'on lui donne.
// chatter   : chatte sur les créatrices qu'on lui donne.
// model     : une créatrice : voit seulement son chiffre d'affaires (toutes plateformes), pas les conversations.
export const ROLES = ['admin', 'manager', 'lead', 'chatter', 'model'];
export const seesAll = (u) => u?.role === 'admin' || u?.role === 'manager';
export const isBoss = (u) => seesAll(u) || u?.role === 'lead';
export const canChat = (u) => !!u && u.role !== 'model';
/** Qui peut changer les accès de qui : admin / manager → tout le monde sauf les admins ; team leader → ses chatteurs. */
export const canEditAccess = (actor, target) => target.role !== 'admin' && (seesAll(actor) || (actor.role === 'lead' && target.role === 'chatter'));

// ---------------------------------------------------------------- accès
const accessCache = new Map(); // userId -> { at, set }
/** null = toutes les créatrices ; sinon l'ensemble des créatrices autorisées. */
export function creatorsOf(u) {
  if (!u) return new Set();
  if (seesAll(u)) return null;
  const hit = accessCache.get(u.id);
  if (hit && Date.now() - hit.at < 15_000) return hit.set;
  const row = one('SELECT all_creators FROM users WHERE id = ?', u.id);
  const set = row?.all_creators ? null : new Set(all('SELECT creator_id FROM user_creators WHERE user_id = ?', u.id).map((r) => r.creator_id));
  accessCache.set(u.id, { at: Date.now(), set });
  return set;
}
// Plateforme de chaque créatrice (« of » / « mym ») : le CRM est coupé en deux, on travaille sur l'une ou l'autre.
const PLATFORM = new Map();
export function setCreatorPlatforms(list) {
  for (const c of list || []) PLATFORM.set(String(c.id), /mym/i.test(c.platform || '') ? 'mym' : 'of');
}
export const platformOfCreator = (id) => PLATFORM.get(String(id)) || null;
/**
 * u.pf : plateforme choisie en haut du menu (OnlyFans ou MYM). Les créatrices de l'autre plateforme sont alors
 * invisibles (messagerie, chiffres, scripts, vault…), sauf sur les pages communes (IA, équipe) où u.pf est vide.
 */
// Une modèle MYM n'existe dans Bloom que si son compte MYM a été relié à la main (MYM → Compte Creator → « Ajouter un
// compte »). Les autres modèles MYM de Substy restent cachées partout (demande de l'agence, 23/11/2026).
let linkedHit = { at: 0, set: new Set() };
function mymLinkedSet() {
  if (Date.now() - linkedHit.at < 5000) return linkedHit.set;
  let set = new Set();
  try {
    set = new Set(all('SELECT creator_id FROM mym_links').map((r) => String(r.creator_id)));
  } catch {}
  linkedHit = { at: Date.now(), set };
  return set;
}
export const mymHidden = (creatorId) => PLATFORM.get(String(creatorId || '')) === 'mym' && !mymLinkedSet().has(String(creatorId));
export const canSee = (u, creatorId) => {
  const s = creatorsOf(u);
  if (!(s === null || s.has(String(creatorId || '')))) return false;
  // `unlinkedToo` : seulement pour la fenêtre qui sert à relier un compte.
  if (!u?.unlinkedToo && mymHidden(creatorId)) return false;
  const p = u?.pf && PLATFORM.get(String(creatorId || ''));
  return !p || p === u.pf;
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
// Temps de travail par jour (Mes ventes) : « actif » = Bloom ouvert sur la messagerie / le chatting, « idle » = ouvert
// ailleurs. Compté entre deux signes de vie rapprochés (une page fermée ne compte plus).
db.exec('CREATE TABLE IF NOT EXISTS work_log (user_id INTEGER NOT NULL, day TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0, idle INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day))');
const CHAT_PAGE = /^\/(app\/(messagerie|mym\/(chatting|switchboard))|pro)(\/|$)/;
export function ping(u, { creatorId, fanId, page, ua = null, country = null }) {
  try {
    const prev = presence.get(u.id);
    const gap = prev ? Date.now() - prev.at : 0;
    if (gap > 0 && gap < 90_000) {
      const col = fanId || CHAT_PAGE.test(String(page || '')) ? 'active' : 'idle';
      run(`INSERT INTO work_log (user_id, day, ${col}) VALUES (?, ?, ?) ON CONFLICT (user_id, day) DO UPDATE SET ${col} = ${col} + excluded.${col}`, u.id, parisDay(Date.now()), gap);
    }
  } catch {}
  const old = presence.get(u.id);
  // Début de session : le premier signe de vie après un trou de plus de 90 s.
  const since = old && Date.now() - old.at < 90_000 ? old.since || old.at : Date.now();
  presence.set(u.id, { at: Date.now(), since, creatorId: creatorId ? String(creatorId) : null, fanId: fanId ? String(fanId) : null, page: page ? String(page).slice(0, 40) : null, name: u.name, avatar: u.avatar || null, role: u.roleName || u.role || null, ua: ua ? String(ua).slice(0, 300) : old?.ua || null, country: country ? String(country).slice(0, 2).toUpperCase() : old?.country || null });
}
/** « Chrome sur Windows », ordinateur / mobile, d'après le navigateur annoncé. */
function deviceOf(ua) {
  const s = String(ua || '');
  if (!s) return { label: 'Navigateur inconnu', kind: 'unknown' };
  const os = /Windows/.test(s) ? 'Windows' : /Android/.test(s) ? 'Android' : /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Mac OS X/.test(s) ? 'macOS' : /Linux/.test(s) ? 'Linux' : null;
  const br = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : null;
  return { label: br && os ? `${br} sur ${os}` : br || os || 'Navigateur inconnu', kind: /Android|iPhone|iPod|Mobile/.test(s) ? 'mobile' : os ? 'desktop' : 'unknown' };
}
/** Tous ceux qui ont Bloom ouvert en ce moment (page « En direct »). */
export function liveView() {
  const out = [];
  for (const [userId, p] of presence) {
    if (Date.now() - p.at >= ONLINE_MS) continue;
    const chatting = !!p.fanId || CHAT_PAGE.test(String(p.page || ''));
    out.push({ userId, name: p.name, avatar: p.avatar, role: p.role, since: p.since || p.at, at: p.at, page: p.page, creatorId: p.creatorId, fanId: p.fanId, active: chatting, device: deviceOf(p.ua), country: p.country });
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
}
/** Personnes en ligne sur une créatrice (et le fan qu'elles ont ouvert). */
export function onCreator(creatorId) {
  const out = [];
  for (const [userId, p] of presence) if (Date.now() - p.at < ONLINE_MS && p.creatorId === String(creatorId)) out.push({ userId, name: p.name, avatar: p.avatar, fanId: p.fanId, creatorId: p.creatorId });
  return out;
}
/** Personnes en ligne sur l'une des créatrices que l'utilisateur voit (vue « Tous » de la messagerie). */
export function onVisible(u) {
  const out = [];
  for (const [userId, p] of presence) if (Date.now() - p.at < ONLINE_MS && p.creatorId && canSee(u, p.creatorId)) out.push({ userId, name: p.name, avatar: p.avatar, fanId: p.fanId, creatorId: p.creatorId });
  return out;
}

// ---------------------------------------------------------------- page Équipe
export function teamView() {
  const since = parisMidnight(parisDay(Date.now()));
  // Seulement les membres du serveur Discord (le compte de la première mise en route, lié à Substy, n'est pas une personne de l'équipe).
  const users = all('SELECT id, name, email, role, avatar, discord_id, active, all_creators, created_at FROM users WHERE discord_id IS NOT NULL ORDER BY active DESC, name COLLATE NOCASE');
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
      allCreators: seesAll(u) || !!u.all_creators,
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
