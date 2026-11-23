// Employés, groupes, rôles et notifications système : copie de « Manage employees », « Role settings » et
// « System Notifications » d'Infloww. Depuis le 23/11/2026 c'est BLOOM qui décide des accès :
//  - Discord sert seulement à se connecter (et il faut rester sur le serveur de l'agence).
//  - Chaque personne a un rôle Bloom (`bl_roles`) : un nom libre, une base (admin / manager / lead / chatter / model) qui
//    règle ce que l'API autorise, et des cases d'accès page par page (`perms` ; null = toutes les pages de la base).
//  - Les comptes déjà là gardent leur rôle d'avant. Un nouveau venu avec un rôle Discord Bloom reçoit ce rôle comme point de
//    départ ; sinon il doit avoir été ajouté avant (« Add employee », par pseudo Discord).
//  - Quand les accès de quelqu'un changent, il reçoit « Permissions updated » (cloche) pour rafraîchir sa page.
import { all, db, one, run } from './store.mjs';
import { ROLES, canEditAccess, canSee, seesAll, setAccess } from './team.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS bl_roles (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', base TEXT NOT NULL, perms TEXT,
    active INTEGER NOT NULL DEFAULT 1, system INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bl_groups (id INTEGER PRIMARY KEY, name TEXT NOT NULL, parent_id INTEGER, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sys_notifs (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL, read_at INTEGER);
  CREATE INDEX IF NOT EXISTS sys_notifs_u ON sys_notifs (user_id, at);
`);
for (const c of ['role_id INTEGER', 'group_id INTEGER', 'discord_username TEXT', 'deleted INTEGER NOT NULL DEFAULT 0']) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${c}`);
  } catch {}
}

// Rôles de départ (= les rôles Discord d'avant). Le rôle Admin ne peut être ni coupé, ni supprimé, ni changé de base.
const SYSTEM = [
  ['Admin', 'Have permissions for the entire system.', 'admin'],
  ['Manager', 'Managers des modèles et du chatting : toutes les créatrices, chiffres, équipe.', 'manager'],
  ['Team Leader', 'Ses créatrices : messagerie, chiffres, équipe.', 'lead'],
  ['Chatteur', 'Messagerie, scripts, envoi groupé, vault de ses créatrices.', 'chatter'],
  ['Modèle', 'Voit seulement son chiffre d’affaires.', 'model'],
];
for (const [name, description, base] of SYSTEM)
  if (!one('SELECT 1 AS x FROM bl_roles WHERE system = 1 AND base = ?', base)) run('INSERT INTO bl_roles (name, description, base, perms, active, system, created_at) VALUES (?, ?, ?, NULL, 1, 1, ?)', name, description, base, Date.now());
if (!one('SELECT 1 AS x FROM bl_groups LIMIT 1')) run('INSERT INTO bl_groups (name, parent_id, created_at) VALUES (?, NULL, ?)', 'Agence', Date.now());
// Comptes d'avant : rôle Bloom = rôle qu'ils avaient (venu de Discord). Ensuite Discord ne le change plus.
for (const u of all('SELECT id, role FROM users WHERE role_id IS NULL'))
  run('UPDATE users SET role_id = (SELECT id FROM bl_roles WHERE system = 1 AND base = ?) WHERE id = ?', ROLES.includes(u.role) ? u.role : 'chatter', u.id);

export const systemRoleId = (base) => one('SELECT id FROM bl_roles WHERE system = 1 AND base = ?', base)?.id ?? null;
const rootGroup = () => one('SELECT id FROM bl_groups WHERE parent_id IS NULL ORDER BY id LIMIT 1')?.id ?? null;

// Pages qu'on peut ouvrir ou fermer par rôle (menu OnlyFans d'Infloww). `bases` = rôles de base qui y ont droit.
const B = ['admin', 'manager', 'lead'], C = ['admin', 'manager', 'lead', 'chatter'], M = ['admin', 'manager'];
export const PERMS = [
  { key: 'dashboard', group: 'Dashboard', label: 'Dashboard', bases: B },
  { key: 'ofmanager', group: 'OF Manager', label: 'OF Manager', bases: M },
  { key: 'analytics.creators', group: 'Analytics', label: 'Creator reports', bases: B },
  { key: 'analytics.employees', group: 'Analytics', label: 'Employee reports', bases: B },
  { key: 'analytics.fans', group: 'Analytics', label: 'Fan reports', bases: B },
  { key: 'analytics.messages', group: 'Analytics', label: 'Message dashboard', bases: B },
  { key: 'messagespro', group: 'Messages Pro', label: 'Messages Pro', bases: C },
  { key: 'growth.smart', group: 'Growth', label: 'Smart Messages', bases: B },
  { key: 'growth.lists', group: 'Growth', label: 'Smart lists', bases: C },
  { key: 'growth.autofollow', group: 'Growth', label: 'Auto-follow', bases: B },
  { key: 'growth.vault', group: 'Growth', label: 'Vault Pro', bases: C },
  { key: 'growth.scripts', group: 'Growth', label: 'Scripts', bases: C },
  { key: 'growth.tracking', group: 'Growth', label: 'Tracking links', bases: B },
  { key: 'growth.sensitive', group: 'Growth', label: 'Sensitive words', bases: C },
  { key: 'growth.ai', group: 'Growth', label: 'AI (Substy)', bases: M },
  { key: 'creators', group: 'Creators', label: 'Manage creators', bases: M },
  { key: 'employees', group: 'Employees', label: 'Manage employees', bases: B },
];
const J = (s, d) => {
  try {
    return s == null ? d : JSON.parse(s);
  } catch {
    return d;
  }
};
/** Pages permises : celles de la base, réduites aux cases cochées du rôle s'il en a. */
export function permsOf(base, perms) {
  const list = J(perms, null);
  return PERMS.filter((p) => p.bases.includes(base) && (!Array.isArray(list) || list.includes(p.key))).map((p) => p.key);
}

// ---------------------------------------------------------------- notifications système
export function notify(userIds, title, text, kind = 'perms') {
  const now = Date.now();
  for (const id of new Set(userIds.map(Number).filter(Boolean))) run('INSERT INTO sys_notifs (user_id, kind, title, body, at) VALUES (?, ?, ?, ?, ?)', id, kind, title, text, now);
}
const permsChanged = (ids) => notify(ids, 'Permissions updated', 'Your access permissions have been updated. Please refresh your page to implement these changes.');

/** Donne un rôle Bloom (la base suit, pour que l'API applique les bons droits). */
function giveRole(userId, roleId) {
  const r = one('SELECT id, base FROM bl_roles WHERE id = ?', roleId);
  if (!r) return false;
  run('UPDATE users SET role_id = ?, role = ? WHERE id = ?', r.id, r.base, userId);
  return true;
}

// ---------------------------------------------------------------- connexion (appelé par discord.mjs)
/**
 * Compte Bloom d'une personne qui se connecte avec Discord. `discordRole` = rôle venu des rôles Discord (ou null) :
 * il ne sert qu'à créer le compte d'un nouveau venu. Lève une Error lisible si pas d'accès.
 */
export function accountFor({ discordId, username, name, avatar, discordRole }) {
  let u = one('SELECT id, active, deleted, role_id FROM users WHERE discord_id = ?', discordId);
  // Ajouté à l'avance par un admin (« Add employee ») avec son pseudo Discord.
  if (!u && username) {
    const pending = one('SELECT id FROM users WHERE discord_id IS NULL AND discord_username = ? COLLATE NOCASE', String(username));
    if (pending) {
      run('UPDATE users SET discord_id = ?, email = ? WHERE id = ?', discordId, `discord:${discordId}`, pending.id);
      u = one('SELECT id, active, deleted, role_id FROM users WHERE id = ?', pending.id);
    }
  }
  if (!u) {
    if (!discordRole) throw new Error('Tu n’as pas encore accès à Bloom : demande à un admin de t’ajouter dans Employees.');
    const r = run(
      'INSERT INTO users (email, name, role, pass_hash, active, created_at, discord_id, avatar, discord_username, group_id) VALUES (?, ?, ?, NULL, 1, ?, ?, ?, ?, ?)',
      `discord:${discordId}`, String(name || 'Chatteur').slice(0, 60), discordRole, Date.now(), discordId, avatar || null, username || null, rootGroup(),
    );
    u = { id: Number(r.lastInsertRowid), active: 1, deleted: 0, role_id: null };
    giveRole(u.id, systemRoleId(discordRole));
  } else {
    run('UPDATE users SET name = ?, avatar = ?, discord_username = COALESCE(?, discord_username) WHERE id = ?', String(name || 'Chatteur').slice(0, 60), avatar || null, username || null, u.id);
    if (!u.role_id) giveRole(u.id, systemRoleId(discordRole || 'chatter'));
  }
  if (u.deleted || !u.active) throw new Error('Ton compte Bloom est désactivé. Vois avec un admin.');
  const role = one('SELECT r.active FROM users x JOIN bl_roles r ON r.id = x.role_id WHERE x.id = ?', u.id);
  if (role && !role.active) throw new Error('Ton rôle Bloom est désactivé. Vois avec un admin.');
  run('UPDATE users SET discord_checked = ? WHERE id = ?', Date.now(), u.id);
  return u;
}

// ---------------------------------------------------------------- routes
export function staffRoutes({ userFrom, send, body, creators }) {
  const auth = (req, res, test, msg = 'Pas autorisé') => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (test && !test(u)) return send(res, 403, { error: msg }), null;
    return u;
  };
  const boss = (u) => seesAll(u) || u.role === 'lead';
  const roles = () => all('SELECT * FROM bl_roles ORDER BY system DESC, id');
  const groups = () => all('SELECT id, name, parent_id AS parentId FROM bl_groups ORDER BY parent_id IS NOT NULL, name COLLATE NOCASE');
  const view = () => {
    const access = all('SELECT user_id, creator_id FROM user_creators');
    const rs = new Map(roles().map((r) => [r.id, r]));
    return all('SELECT id, name, avatar, role, role_id, group_id, discord_id, discord_username, active, all_creators, created_at FROM users WHERE deleted = 0 AND (discord_id IS NOT NULL OR discord_username IS NOT NULL) ORDER BY name COLLATE NOCASE').map((u) => ({
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      base: u.role,
      roleId: u.role_id,
      roleName: rs.get(u.role_id)?.name ?? u.role,
      groupId: u.group_id ?? rootGroup(),
      discord: u.discord_username || null,
      status: !u.discord_id ? 'pending' : u.active ? 'active' : 'off',
      allCreators: seesAll(u) || !!u.all_creators,
      creators: access.filter((a) => a.user_id === u.id).map((a) => a.creator_id),
      createdAt: u.created_at,
    }));
  };
  // Un manager ne touche pas aux admins ; seul un admin donne un rôle de base admin.
  const canTouch = (me, target) => me.role === 'admin' || (seesAll(me) && target.role !== 'admin');
  const roleAllowed = (me, roleId) => {
    const r = one('SELECT base FROM bl_roles WHERE id = ?', roleId);
    return !!r && (me.role === 'admin' || r.base !== 'admin');
  };

  return {
    // ------------------------------------------------ Manage employees
    'GET /api/staff': (req, res) => {
      const u = auth(req, res, boss, 'Réservé aux team leaders, managers et admins');
      if (!u) return;
      send(res, 200, { employees: view(), groups: groups(), roles: roles().filter((r) => r.active).map((r) => ({ id: r.id, name: r.name, base: r.base })), canEdit: seesAll(u), me: u.id });
    },
    'POST /api/staff/groups': async (req, res) => {
      const u = auth(req, res, seesAll, 'Réservé aux admins et managers');
      if (!u) return;
      const b = await body(req);
      const name = String(b.name || '').trim().slice(0, 40);
      if (b.delete) {
        const g = one('SELECT id, parent_id FROM bl_groups WHERE id = ?', Number(b.id));
        if (!g) return send(res, 404, { error: 'Groupe introuvable' });
        if (!g.parent_id) return send(res, 400, { error: 'Le groupe principal ne peut pas être supprimé' });
        // Les sous-groupes et les personnes remontent au groupe du dessus.
        run('UPDATE bl_groups SET parent_id = ? WHERE parent_id = ?', g.parent_id, g.id);
        run('UPDATE users SET group_id = ? WHERE group_id = ?', g.parent_id, g.id);
        run('DELETE FROM bl_groups WHERE id = ?', g.id);
      } else if (b.id) {
        if (!name) return send(res, 400, { error: 'Nom vide' });
        run('UPDATE bl_groups SET name = ? WHERE id = ?', name, Number(b.id));
      } else {
        if (!name) return send(res, 400, { error: 'Nom vide' });
        run('INSERT INTO bl_groups (name, parent_id, created_at) VALUES (?, ?, ?)', name, Number(b.parentId) || rootGroup(), Date.now());
      }
      send(res, 200, { groups: groups(), employees: view() });
    },
    /** Ajouter (pseudo Discord) ou modifier une personne : nom, groupe, rôle, créatrices. */
    'POST /api/staff/employee': async (req, res) => {
      const u = auth(req, res, seesAll, 'Réservé aux admins et managers');
      if (!u) return;
      const b = await body(req);
      const name = String(b.name || '').trim().slice(0, 60);
      const roleId = Number(b.roleId);
      if (!name) return send(res, 400, { error: 'Nom obligatoire' });
      if (!roleAllowed(u, roleId)) return send(res, 403, { error: 'Rôle non autorisé' });
      const groupId = Number(b.groupId) || rootGroup();
      let id = Number(b.id) || 0;
      if (id) {
        const t = one('SELECT id, role, role_id, group_id FROM users WHERE id = ? AND deleted = 0', id);
        if (!t) return send(res, 404, { error: 'Personne inconnue' });
        if (!canTouch(u, t)) return send(res, 403, { error: 'Seul un admin peut modifier un admin.' });
        if (id === u.id && roleId !== t.role_id) return send(res, 400, { error: 'Tu ne peux pas changer ton propre rôle.' });
        run('UPDATE users SET name = ?, group_id = ? WHERE id = ?', name, groupId, id);
        if (roleId !== t.role_id) giveRole(id, roleId), permsChanged([id]);
      } else {
        const dname = String(b.discord || '').trim().replace(/^@/, '').toLowerCase();
        if (!/^[a-z0-9_.]{2,32}$/.test(dname)) return send(res, 400, { error: 'Pseudo Discord invalide (celui de la connexion, ex. « jean.dupont »)' });
        const known = one('SELECT id, deleted FROM users WHERE discord_username = ? COLLATE NOCASE', dname);
        if (known && !known.deleted) return send(res, 400, { error: 'Ce pseudo Discord est déjà dans l’équipe' });
        if (known) {
          id = known.id;
          run('UPDATE users SET deleted = 0, active = 1, name = ?, group_id = ? WHERE id = ?', name, groupId, id);
        } else {
          const r = run('INSERT INTO users (email, name, role, pass_hash, active, created_at, discord_username, group_id) VALUES (?, ?, ?, NULL, 1, ?, ?, ?)', `pending:${dname}`, name, 'chatter', Date.now(), dname, groupId);
          id = Number(r.lastInsertRowid);
        }
        giveRole(id, roleId);
      }
      if (Array.isArray(b.creators)) {
        const t = one('SELECT role FROM users WHERE id = ?', id);
        if (!seesAll(t)) setAccess(id, { all: !!b.all, creators: b.creators.map(String) }), b.id && permsChanged([id]);
      }
      send(res, 200, { employees: view() });
    },
    /** Actions groupées (et « More ») : activer, désactiver, supprimer, changer de groupe / de rôle, donner des créatrices. */
    'POST /api/staff/batch': async (req, res) => {
      const u = auth(req, res, boss, 'Réservé aux team leaders, managers et admins');
      if (!u) return;
      const b = await body(req);
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean);
      const targets = ids.map((id) => one('SELECT id, role, discord_id FROM users WHERE id = ? AND deleted = 0', id)).filter(Boolean);
      const act = String(b.action || '');
      // Team leader : seulement les créatrices de ses chatteurs (comme avant).
      if (act === 'creators') {
        for (const t of targets) {
          if (seesAll(t)) continue;
          if (!canEditAccess(u, t)) return send(res, 403, { error: 'Un team leader ne peut changer que les accès de ses chatteurs.' });
        }
        if (!seesAll(u) && (b.all || (b.creators || []).some((c) => !canSee({ ...u, pf: null }, c)))) return send(res, 403, { error: 'Tu ne peux donner que tes propres créatrices.' });
        for (const t of targets) if (!seesAll(t)) setAccess(t.id, { all: !!b.all, creators: (b.creators || []).map(String) });
        permsChanged(targets.map((t) => t.id));
        return send(res, 200, { employees: view() });
      }
      if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      for (const t of targets) {
        if (!canTouch(u, t)) return send(res, 403, { error: 'Seul un admin peut modifier un admin.' });
        if (t.id === u.id && act !== 'group') return send(res, 400, { error: 'Pas sur ton propre compte.' });
      }
      if (act === 'role' && !roleAllowed(u, Number(b.roleId))) return send(res, 403, { error: 'Rôle non autorisé' });
      for (const t of targets) {
        if (act === 'activate') run('UPDATE users SET active = 1 WHERE id = ?', t.id);
        else if (act === 'deactivate') run('UPDATE users SET active = 0 WHERE id = ?', t.id), run('DELETE FROM sessions WHERE user_id = ?', t.id);
        else if (act === 'delete') {
          run('DELETE FROM sessions WHERE user_id = ?', t.id);
          if (!t.discord_id) run('DELETE FROM users WHERE id = ?', t.id);
          else run('UPDATE users SET deleted = 1, active = 0 WHERE id = ?', t.id);
        } else if (act === 'group') run('UPDATE users SET group_id = ? WHERE id = ?', Number(b.groupId) || rootGroup(), t.id);
        else if (act === 'role') giveRole(t.id, Number(b.roleId));
        else return send(res, 400, { error: 'Action inconnue' });
      }
      if (act === 'role' || act === 'activate') permsChanged(targets.map((t) => t.id));
      send(res, 200, { employees: view() });
    },

    // ------------------------------------------------ Role settings
    'GET /api/staff/roles': (req, res) => {
      const u = auth(req, res, seesAll, 'Réservé aux admins et managers');
      if (!u) return;
      const users = all('SELECT role_id, name FROM users WHERE deleted = 0 AND (discord_id IS NOT NULL OR discord_username IS NOT NULL) ORDER BY name COLLATE NOCASE');
      send(res, 200, {
        roles: roles().map((r) => ({ id: r.id, name: r.name, description: r.description, base: r.base, perms: J(r.perms, null), active: !!r.active, system: !!r.system, users: users.filter((x) => x.role_id === r.id).map((x) => x.name) })),
        perms: PERMS,
        canEdit: u.role === 'admin',
      });
    },
    'POST /api/staff/roles': async (req, res) => {
      const u = auth(req, res, (x) => x.role === 'admin', 'Seuls les admins créent et modifient les rôles');
      if (!u) return;
      const b = await body(req);
      const r = b.id ? one('SELECT * FROM bl_roles WHERE id = ?', Number(b.id)) : null;
      if (b.id && !r) return send(res, 404, { error: 'Rôle introuvable' });
      const affected = () => all('SELECT id FROM users WHERE role_id = ? AND deleted = 0', r.id).map((x) => x.id);
      if (b.delete) {
        if (r.system) return send(res, 400, { error: 'Les rôles de départ ne se suppriment pas (tu peux les couper).' });
        if (affected().length) return send(res, 400, { error: 'Donne d’abord un autre rôle aux personnes qui ont celui-ci.' });
        run('DELETE FROM bl_roles WHERE id = ?', r.id);
        return send(res, 200, { ok: true });
      }
      if (b.active !== undefined && b.name === undefined) {
        if (r.system && r.base === 'admin') return send(res, 400, { error: 'Le rôle Admin ne peut pas être coupé.' });
        run('UPDATE bl_roles SET active = ? WHERE id = ?', b.active ? 1 : 0, r.id);
        if (!b.active) for (const id of affected()) run('DELETE FROM sessions WHERE user_id = ?', id);
        else permsChanged(affected());
        return send(res, 200, { ok: true });
      }
      const name = String(b.name || '').trim().slice(0, 40);
      const base = ROLES.includes(b.base) ? b.base : null;
      if (!name || !base) return send(res, 400, { error: 'Nom et type de rôle obligatoires' });
      const perms = Array.isArray(b.perms) ? JSON.stringify(b.perms.filter((k) => PERMS.some((p) => p.key === k))) : null;
      if (r) {
        if (r.system && base !== r.base) return send(res, 400, { error: 'Le type d’un rôle de départ ne change pas.' });
        if (r.system && r.base === 'admin' && perms) return send(res, 400, { error: 'Le rôle Admin garde tous les accès.' });
        run('UPDATE bl_roles SET name = ?, description = ?, base = ?, perms = ? WHERE id = ?', name, String(b.description || '').slice(0, 200), base, perms, r.id);
        run('UPDATE users SET role = ? WHERE role_id = ?', base, r.id);
        permsChanged(affected());
      } else run('INSERT INTO bl_roles (name, description, base, perms, active, system, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)', name, String(b.description || '').slice(0, 200), base, perms, Date.now());
      send(res, 200, { ok: true });
    },

    // ------------------------------------------------ Manage creators
    'GET /api/staff/creators': (req, res) => {
      const u = auth(req, res, seesAll, 'Réservé aux admins et managers');
      if (!u) return;
      const users = all("SELECT id, name, role, all_creators FROM users WHERE deleted = 0 AND active = 1 AND discord_id IS NOT NULL AND role <> 'model'");
      const access = all('SELECT user_id, creator_id FROM user_creators');
      const maps = new Map(all('SELECT creator_id, account FROM rv_map WHERE account IS NOT NULL').map((m) => [m.creator_id, m.account]));
      const accounts = all('SELECT id, platform, name, nick, username, avatar, connected FROM rv_accounts');
      const meta = new Map(all('SELECT creator_id, nickname, tags FROM creator_meta').map((m) => [m.creator_id, m]));
      const used = new Set();
      const rows = creators().map((c) => {
        const acc = accounts.find((a) => a.id === maps.get(c.id));
        if (acc) used.add(acc.id);
        const emp = users.filter((x) => seesAll(x) || x.all_creators || access.some((a) => a.user_id === x.id && a.creator_id === c.id)).map((x) => x.name);
        return { id: c.id, name: acc?.name || c.name, avatar: acc?.avatar || c.avatar, nickname: meta.get(c.id)?.nickname || c.name, tags: J(meta.get(c.id)?.tags, []), platform: /mym/i.test(c.platform || '') ? 'MYM' : 'OnlyFans', handle: c.username || acc?.username || null, employees: emp, status: 'connected', substy: true };
      });
      // Comptes vus seulement dans Infloww / MyPulse (pas reliés à Substy) : affichés, sans chat possible.
      for (const a of accounts.filter((x) => !used.has(x.id)))
        rows.push({ id: `acc:${a.id}`, name: a.name || a.nick || a.username || 'Créatrice', avatar: a.avatar, nickname: meta.get(`acc:${a.id}`)?.nickname || a.nick || a.name, tags: J(meta.get(`acc:${a.id}`)?.tags, []), platform: /mym/i.test(a.platform) ? 'MYM' : 'OnlyFans', handle: a.username, employees: [], status: 'stats', substy: false });
      send(res, 200, { creators: rows, tags: [...new Set(rows.flatMap((r) => r.tags))].sort(), employees: users.map((x) => x.name).sort() });
    },
    'POST /api/staff/creators': async (req, res) => {
      const u = auth(req, res, seesAll, 'Réservé aux admins et managers');
      if (!u) return;
      const b = await body(req);
      const tags = (Array.isArray(b.tags) ? b.tags : []).map((t) => String(t).trim().slice(0, 30)).filter(Boolean);
      run('INSERT INTO creator_meta (creator_id, nickname, tags) VALUES (?, ?, ?) ON CONFLICT (creator_id) DO UPDATE SET nickname = excluded.nickname, tags = excluded.tags', String(b.id), String(b.nickname || '').slice(0, 60), JSON.stringify(tags));
      send(res, 200, { ok: true });
    },

    // ------------------------------------------------ notifications système
    'GET /api/sysnotifs': (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const items = all('SELECT id, kind, title, body, at, read_at FROM sys_notifs WHERE user_id = ? AND at > ? ORDER BY at DESC LIMIT 100', u.id, Date.now() - 30 * 864e5);
      send(res, 200, { items: items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, at: n.at, read: !!n.read_at })), unread: items.filter((n) => !n.read_at).length });
    },
    'POST /api/sysnotifs/read': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      run('UPDATE sys_notifs SET read_at = ? WHERE user_id = ? AND read_at IS NULL', Date.now(), u.id);
      send(res, 200, { ok: true });
    },
    'POST /api/sysnotifs/clear': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      run('DELETE FROM sys_notifs WHERE user_id = ?', u.id);
      send(res, 200, { ok: true });
    },
  };
}

db.exec(`CREATE TABLE IF NOT EXISTS creator_meta (creator_id TEXT PRIMARY KEY, nickname TEXT, tags TEXT NOT NULL DEFAULT '[]')`);
