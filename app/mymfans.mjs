// MYM → Fans (copie de MyPulse : Abonnés, Anciens, Intéressés). Tout vient de SUBSTY (pas de MyPulse ni d'Infloww :
// Bloom doit pouvoir s'en passer). La liste des conversations de Substy ne donne pas le statut d'abonnement d'un fan MYM :
// Bloom relit donc chaque fan avec `fans.get` (comme quand on ouvre sa fiche), doucement en tâche de fond
// (un fan toutes les 1,5 s : d'abord les nouveaux, puis ceux vus il y a plus de 12 h), et garde le résultat (`mym_fans`).
//  - Abonnés   : abonnement « active » ;
//  - Anciens   : un abonnement qui n'est plus actif (expiré, annulé…) ;
//  - Intéressés : pas d'abonnement (le fan suit la créatrice / lui écrit sans être abonné).
// « Modifier » : surnom → `fans.rename` (Substy) ; groupes → listes Substy (`fans.lists.add` / `remove`) ;
// âge, genre, source, notes → gardés par Bloom (`mym_fan_meta`).
import { all, db, one, run } from './store.mjs';
import { img, inboxChats, money, plain } from './chat.mjs';
import { canSee, isBoss, platformOfCreator } from './team.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS mym_fans (
    creator_id TEXT NOT NULL, fan_id TEXT NOT NULL, name TEXT, username TEXT, avatar TEXT, status TEXT, subscribed_at INTEGER, expires_at INTEGER,
    canceled INTEGER NOT NULL DEFAULT 0, gross REAL NOT NULL DEFAULT 0, net REAL NOT NULL DEFAULT 0, purchases INTEGER NOT NULL DEFAULT 0, last_purchase INTEGER,
    lists TEXT NOT NULL DEFAULT '[]', checked_at INTEGER NOT NULL, PRIMARY KEY (creator_id, fan_id)
  );
  CREATE TABLE IF NOT EXISTS mym_fan_meta (creator_id TEXT NOT NULL, fan_id TEXT NOT NULL, age TEXT, gender TEXT, source TEXT, notes TEXT, updated_by TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (creator_id, fan_id));
`);

const STALE = 12 * 3600_000;
const J = (s, d) => {
  try {
    return JSON.parse(s ?? '');
  } catch {
    return d;
  }
};
export const tabOf = (status) => (!status ? 'interested' : /^active$/i.test(status) ? 'active' : 'old');
export const SOURCES = ['Instagram', 'Twitter', 'Snap', 'Facebook', 'Tiktok', 'Telegram', 'Autre'];

/** Fiche Substy d'un fan → ligne `mym_fans`. */
function save(cid, f) {
  const s = f.subscription || null;
  const lists = (f.lists || []).filter((l) => l.isMember !== false).map((l) => ({ id: String(l.id ?? l.listId ?? l.name), name: plain(l.name || '') }));
  run(
    `INSERT INTO mym_fans (creator_id, fan_id, name, username, avatar, status, subscribed_at, expires_at, canceled, gross, net, purchases, last_purchase, lists, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (creator_id, fan_id) DO UPDATE SET name = excluded.name, username = excluded.username, avatar = excluded.avatar, status = excluded.status,
       subscribed_at = excluded.subscribed_at, expires_at = excluded.expires_at, canceled = excluded.canceled, gross = excluded.gross, net = excluded.net,
       purchases = excluded.purchases, last_purchase = excluded.last_purchase, lists = excluded.lists, checked_at = excluded.checked_at`,
    cid, String(f.fanId), f.displayName || f.name || f.username || 'Fan', f.username || null, img(f.avatar), s?.status || null,
    Date.parse(s?.subscribedAt) || null, Date.parse(s?.expiresAt) || null, s?.isCanceledAtPeriodEnd ? 1 : 0,
    money(f.spend?.gross), money(f.spend?.net), Number(f.spend?.purchases) || 0, Date.parse(f.spend?.lastPurchaseAt) || null, JSON.stringify(lists), Date.now(),
  );
}

/** Fans MYM de Bloom pour une créatrice (avec ceux pas encore relus chez Substy). */
export function mymFansOf(cid) {
  const known = new Map(all('SELECT * FROM mym_fans WHERE creator_id = ?', cid).map((r) => [r.fan_id, r]));
  const out = [];
  for (const c of inboxChats(cid).chats) {
    const r = known.get(c.fanId);
    out.push(r ? { ...r, avatar: r.avatar || c.avatar, lastAt: c.last?.at || null } : { creator_id: cid, fan_id: c.fanId, name: c.name, username: c.username, avatar: c.avatar, status: undefined, gross: 0, lists: '[]', checked_at: 0, lastAt: c.last?.at || null });
  }
  return out;
}

export function mymFanRoutes({ substy, userFrom, send, body, creators }) {
  // Relecture douce des fans MYM chez Substy.
  let busy = false;
  let turn = 0;
  const mymIds = () => creators().filter((c) => /mym/i.test(c.platform || '')).map((c) => c.id);
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      // D'abord un fan jamais relu (toutes créatrices MYM), sinon celui relu il y a le plus longtemps (plus de 12 h).
      let next = null;
      let oldest = null;
      // Chacune son tour (une créatrice avec beaucoup de fans ne bloque pas les autres).
      const ids = mymIds();
      turn = (turn + 1) % Math.max(1, ids.length);
      for (const cid of [...ids.slice(turn), ...ids.slice(0, turn)]) {
        const rows = new Map(all('SELECT fan_id, checked_at FROM mym_fans WHERE creator_id = ?', cid).map((r) => [r.fan_id, r.checked_at]));
        for (const c of inboxChats(cid).chats) {
          const at = rows.get(c.fanId);
          if (at === undefined) {
            next = { cid, fanId: c.fanId };
            break;
          }
          if (Date.now() - at > STALE && (!oldest || at < oldest.at)) oldest = { cid, fanId: c.fanId, at };
        }
        if (next) break;
      }
      next = next || oldest;
      if (next) {
        const f = await substy.call('fans.get', { creatorId: next.cid, fanId: next.fanId }).catch(() => null);
        if (f) save(next.cid, f);
        else run('INSERT OR IGNORE INTO mym_fans (creator_id, fan_id, checked_at) VALUES (?, ?, ?)', next.cid, next.fanId, Date.now() - STALE + 3600_000); // réessai dans 1 h
      }
    } catch (e) {
      console.warn('[mym-fans]', e.message);
    } finally {
      busy = false;
    }
  }, 1500);

  const auth = (req, res, cid, edit) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (u.role === 'model' || !canSee({ ...u, pf: null }, cid)) return send(res, 403, { error: 'Tu n’as pas accès à cette créatrice.' }), null;
    if (platformOfCreator(cid) !== 'mym') return send(res, 400, { error: 'Créatrice MYM seulement' }), null;
    if (edit && u.role === 'model') return send(res, 403, { error: 'Pas autorisé' }), null;
    return u;
  };
  const listsCache = new Map();
  const listsOf = async (cid) => {
    const hit = listsCache.get(cid);
    if (hit && Date.now() - hit.at < 60_000) return hit.v;
    const r = await substy.fanLists(cid).catch(() => null);
    const v = (r?.items || []).map((l) => ({ id: String(l.id), name: plain(l.name || ''), type: String(l.type || ''), fans: Number(l.fanCount) || 0 }));
    listsCache.set(cid, { at: Date.now(), v });
    return v;
  };

  return {
    /** Abonnés / Anciens / Intéressés d'une créatrice MYM. */
    'GET /api/mym/fans': async (req, res) => {
      const p = new URL(req.url, 'http://x').searchParams;
      const cid = String(p.get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      const tab = ['active', 'old', 'interested'].includes(p.get('tab')) ? p.get('tab') : 'active';
      const q = String(p.get('q') || '').trim().toLowerCase();
      const per = [50, 100, 250].includes(Number(p.get('per'))) ? Number(p.get('per')) : 50;
      const page = Math.max(1, Number(p.get('page')) || 1);
      const listIds = (p.get('lists') || '').split(',').filter(Boolean);
      const sort = p.get('sort') === 'name' ? 'name' : p.get('sort') === 'since' ? 'since' : 'gross';
      const all_ = mymFansOf(cid);
      const checked = all_.filter((f) => f.status !== undefined);
      const counts = { active: 0, old: 0, interested: 0 };
      for (const f of checked) counts[tabOf(f.status)]++;
      const lists = await listsOf(cid);
      const inTab = checked.filter((f) => tabOf(f.status) === tab);
      const listCount = new Map();
      for (const f of inTab) for (const l of J(f.lists, [])) listCount.set(l.id, (listCount.get(l.id) || 0) + 1);
      let rows = inTab.filter((f) => (!q || `${f.name} ${f.username || ''}`.toLowerCase().includes(q)) && (!listIds.length || J(f.lists, []).some((l) => listIds.includes(l.id))));
      rows.sort((a, b) => (sort === 'name' ? String(a.name).localeCompare(String(b.name)) : sort === 'since' ? (b.subscribed_at || 0) - (a.subscribed_at || 0) : b.gross - a.gross));
      const total = rows.length;
      const meta = new Map(all('SELECT fan_id, age, gender, source, notes FROM mym_fan_meta WHERE creator_id = ?', cid).map((m) => [m.fan_id, m]));
      rows = rows.slice((page - 1) * per, page * per);
      send(res, 200, {
        tab,
        counts,
        progress: { checked: checked.length, total: all_.length },
        lists: lists.map((l) => ({ ...l, count: listCount.get(l.id) || 0 })),
        total,
        rows: rows.map((f) => ({
          fanId: f.fan_id, name: f.name, username: f.username, avatar: f.avatar, status: f.status, since: f.subscribed_at, expires: f.expires_at, canceled: !!f.canceled,
          gross: f.gross, net: f.net, purchases: f.purchases, lastPurchase: f.last_purchase, lists: J(f.lists, []), meta: meta.get(f.fan_id) || null, lastAt: f.lastAt,
        })),
      });
    },
    /** « Modifier » un fan : surnom (Substy), groupes (listes Substy), âge / genre / source / notes (Bloom). */
    'POST /api/mym/fans/edit': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const fanId = String(b.fanId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      try {
        const cur = one('SELECT name, lists FROM mym_fans WHERE creator_id = ? AND fan_id = ?', cid, fanId);
        const nick = String(b.nickname ?? '').trim().slice(0, 60);
        if (nick && nick !== cur?.name) await substy.call('fans.rename', { creatorId: cid, fanId, displayName: nick });
        if (Array.isArray(b.lists)) {
          const want = new Set(b.lists.map(String));
          const had = new Set(J(cur?.lists, []).map((l) => l.id));
          const add = [...want].filter((x) => !had.has(x));
          const del = [...had].filter((x) => !want.has(x));
          if (add.length) await substy.call('fans.lists.add', { creatorId: cid, fanId, listIds: add });
          if (del.length) await substy.call('fans.lists.remove', { creatorId: cid, fanId, listIds: del });
          listsCache.delete(cid);
        }
        run(
          `INSERT INTO mym_fan_meta (creator_id, fan_id, age, gender, source, notes, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (creator_id, fan_id) DO UPDATE SET age = excluded.age, gender = excluded.gender, source = excluded.source, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
          cid, fanId, String(b.age ?? '').slice(0, 10) || null, ['Masculin', 'Féminin'].includes(b.gender) ? b.gender : null, SOURCES.includes(b.source) ? b.source : null, String(b.notes ?? '').slice(0, 4000) || null, u.name, Date.now(),
        );
        const f = await substy.call('fans.get', { creatorId: cid, fanId }).catch(() => null);
        if (f) save(cid, f);
        send(res, 200, { ok: true });
      } catch (e) {
        send(res, 502, { error: `Substy : ${e.message}` });
      }
    },
    /** « Ajouter au groupe » : plusieurs fans dans une liste Substy. */
    'POST /api/mym/fans/add-to-list': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (!auth(req, res, cid, true)) return;
      const ids = (Array.isArray(b.fanIds) ? b.fanIds : []).map(String).slice(0, 500);
      const listId = String(b.listId || '');
      if (!ids.length || !listId) return send(res, 400, { error: 'Choisis des fans et un groupe' });
      let ok = 0;
      for (const fanId of ids) {
        try {
          await substy.call('fans.lists.add', { creatorId: cid, fanId, listIds: [listId] });
          const cur = one('SELECT lists FROM mym_fans WHERE creator_id = ? AND fan_id = ?', cid, fanId);
          const l = J(cur?.lists, []);
          if (!l.some((x) => x.id === listId)) run('UPDATE mym_fans SET lists = ? WHERE creator_id = ? AND fan_id = ?', JSON.stringify([...l, { id: listId, name: String(b.listName || '') }]), cid, fanId);
          ok++;
        } catch {}
      }
      listsCache.delete(cid);
      send(res, 200, { ok, failed: ids.length - ok });
    },
    /** Créer un groupe (liste Substy) — depuis la fenêtre « Ajouter au groupe ». */
    'POST /api/mym/fans/lists': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' });
      const name = String(b.name || '').trim().slice(0, 60);
      if (!name) return send(res, 400, { error: 'Donne un nom' });
      try {
        const r = await substy.call('fans.lists.create', { creatorId: cid, name });
        listsCache.delete(cid);
        send(res, 200, { id: r?.id ? String(r.id) : null });
      } catch (e) {
        send(res, 502, { error: `Substy : ${e.message}` });
      }
    },
  };
}
