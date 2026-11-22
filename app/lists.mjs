// Façon de chatter de chaque créatrice, et listes automatiques de fans.
//
// Mode de chatting (réglé par créatrice dans « Configuration IA ») :
//   - hybrid : l'IA de Substy parle à tous les fans ; dès qu'un fan entre dans la « liste de passage »
//              (ex. « a dépensé au moins 1 $ »), Bloom coupe l'IA sur ce fan et les chatteurs prennent la main.
//              Les chatteurs ne voient que les fans sans IA (coupée, ou passés à la main par l'IA).
//   - human  : pas d'IA, les chatteurs voient et répondent à tous les fans.
//   - ai     : l'IA fait tout ; les chatteurs ne voient que les fans que l'IA leur passe (ou dont l'IA est coupée).
//   - pas de réglage : comme avant (les chatteurs voient tout, Bloom ne coupe rien).
// Les admins, managers et team leaders voient toujours tous les fans.
//
// Listes automatiques : chaque créatrice a ses propres listes, avec une règle (pour l'instant : « a dépensé au moins X »,
// en $ sur OnlyFans, en € sur MYM). Un fan entre tout seul dans la liste dès qu'il remplit la règle, et y reste.
// Ce qu'un fan a dépensé : le total de Substy, ou à défaut les ventes vues (Substy en direct, Infloww / MyPulse),
// sans les abonnements.
import { all, db, one, run } from './store.mjs';
import { inboxChats, patchInboxChat, refreshInboxTop } from './chat.mjs';
import { canChat, canSee, isBoss, seesAll } from './team.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_mode (creator_id TEXT PRIMARY KEY, mode TEXT NOT NULL, list_id INTEGER, updated_at INTEGER NOT NULL, updated_by TEXT);
  CREATE TABLE IF NOT EXISTS auto_lists (id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id TEXT NOT NULL, name TEXT NOT NULL, min_spent REAL NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS auto_list_members (list_id INTEGER NOT NULL, fan_id TEXT NOT NULL, joined_at INTEGER NOT NULL, handled INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (list_id, fan_id));
`);

export const MODES = ['hybrid', 'human', 'ai'];

// ---------------------------------------------------------------- réglages
export function modeOf(cid) {
  return one('SELECT mode, list_id FROM chat_mode WHERE creator_id = ?', String(cid)) || null;
}
/** Ce qu'un chatteur voit d'une créatrice : null = tous les fans ; sinon un filtre sur la conversation. */
export function chatterFilter(u, cid) {
  if (!u || isBoss(u)) return null;
  const m = modeOf(cid);
  if (!m || m.mode === 'human') return null;
  // Hybride et full IA : seulement les fans sans IA (coupée par Bloom, à la main, ou passés à la main par l'IA).
  return (c) => !c.ai || !!c.handoff;
}

const listsOf = (cid) => all('SELECT * FROM auto_lists WHERE creator_id = ? ORDER BY id', String(cid));

// ---------------------------------------------------------------- dépenses des fans
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
/** Montant dépensé par fan (dans la monnaie de la créatrice) : fanId -> montant. */
function paidMap(cid, chats) {
  const out = new Map();
  const add = (id, v) => out.set(id, Math.max(out.get(id) || 0, v));
  for (const c of chats) add(c.fanId, Math.max(Number(c.paid) || 0, Number(c.spent) || 0));
  // Ventes vues ailleurs (MYM : Substy ne donne pas toujours la dépense du fan). On retrouve le fan par son
  // identifiant, ou par son nom quand un seul fan de la créatrice porte ce nom.
  const byName = new Map();
  for (const c of chats)
    for (const n of new Set([norm(c.name), norm(c.username)]))
      if (n) byName.set(n, byName.has(n) && byName.get(n) !== c.fanId ? null : c.fanId);
  const ids = new Set(chats.map((c) => c.fanId));
  const find = (id, name) => (id && ids.has(String(id)) ? String(id) : byName.get(norm(name)) || null);
  const sums = new Map();
  const sum = (id, name, cents) => {
    const f = find(id, name);
    if (f) sums.set(f, (sums.get(f) || 0) + cents);
  };
  for (const r of all("SELECT fan_id, fan_name, gross FROM rv_live WHERE creator_id = ? AND gross > 0 AND matched IS NULL AND COALESCE(type, '') NOT LIKE '%sub%'", cid)) sum(r.fan_id, r.fan_name, r.gross);
  const acc = one('SELECT account FROM rv_map WHERE creator_id = ?', cid)?.account;
  if (acc) for (const r of all("SELECT fan_id, fan_name, gross FROM rv_sales WHERE account = ? AND gross > 0 AND type <> 'sub'", acc)) sum(r.fan_id, r.fan_name, r.gross);
  for (const [f, cents] of sums) add(f, cents / 100);
  return out;
}

// ---------------------------------------------------------------- moteur (toutes les 20 s)
let SUB = null;
let CREATORS = () => [];
const lastSale = new Map(); // creatorId -> dernière vente vue
const fails = new Map(); // `${cid}:${fanId}` -> essais ratés
let busy = false;

/** Met à jour les listes d'une créatrice ; renvoie les fans dont il faut couper l'IA (mode hybride). */
function updateLists(cid) {
  const lists = listsOf(cid);
  if (!lists.length) return [];
  const inb = inboxChats(cid);
  const chats = [...inb.chats];
  const paid = paidMap(cid, chats);
  const now = Date.now();
  const ins = db.prepare('INSERT OR IGNORE INTO auto_list_members (list_id, fan_id, joined_at) VALUES (?, ?, ?)');
  for (const l of lists) for (const [fanId, v] of paid) if (v > 0 && v >= l.min_spent) ins.run(l.id, fanId, now);
  const m = modeOf(cid);
  if (m?.mode !== 'hybrid' || !m.list_id || !inb.complete) return [];
  // Fans de la liste de passage pas encore traités : l'IA est coupée une seule fois, à l'entrée
  // (si un manager la rallume ensuite sur un fan, Bloom ne la recoupe pas).
  const byId = new Map(chats.map((c) => [c.fanId, c]));
  const todo = [];
  for (const r of all('SELECT fan_id FROM auto_list_members WHERE list_id = ? AND handled = 0', m.list_id)) {
    const c = byId.get(r.fan_id);
    if (!c) continue;
    if (!c.ai) run('UPDATE auto_list_members SET handled = 1 WHERE list_id = ? AND fan_id = ?', m.list_id, r.fan_id);
    else todo.push({ cid, fanId: r.fan_id, listId: m.list_id });
  }
  return todo;
}

export async function tick() {
  if (busy || !SUB) return;
  busy = true;
  try {
    const ids = new Set(all('SELECT DISTINCT creator_id FROM auto_lists').map((r) => r.creator_id));
    const todo = [];
    for (const cid of ids) {
      if (!CREATORS().some((c) => c.id === cid)) continue;
      // Nouvelle vente : on relit le haut de sa liste de conversations pour avoir la dépense à jour.
      const last = one('SELECT MAX(first_seen) AS t FROM rv_live WHERE creator_id = ?', cid)?.t || 0;
      if (last > (lastSale.get(cid) ?? last - 1)) await refreshInboxTop(cid);
      lastSale.set(cid, last);
      todo.push(...updateLists(cid));
    }
    // Coupures, une à une (au plus 40 par tour, le reste au tour suivant).
    for (const t of todo.slice(0, 40)) {
      const k = `${t.cid}:${t.fanId}`;
      if ((fails.get(k) || 0) >= 3) continue;
      try {
        await SUB.setAi(t.cid, t.fanId, false);
        patchInboxChat(t.cid, t.fanId, { ai: false });
        run('UPDATE auto_list_members SET handled = 1 WHERE list_id = ? AND fan_id = ?', t.listId, t.fanId);
        console.log(`[bloom] IA coupée sur le fan ${t.fanId} (${t.cid}) : entré dans la liste de passage`);
      } catch (e) {
        fails.set(k, (fails.get(k) || 0) + 1);
        console.warn(`[bloom] coupure IA du fan ${t.fanId} :`, e.message);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch (e) {
    console.warn('[bloom] listes automatiques :', e.message);
  } finally {
    busy = false;
  }
}

// ---------------------------------------------------------------- adresses
export function listRoutes({ substy, userFrom, send, body, creators }) {
  SUB = substy;
  CREATORS = creators;
  setInterval(tick, 20_000);
  setTimeout(tick, 15_000);
  const q = (req) => new URL(req.url, 'http://x').searchParams;
  const auth = (req, res, cid, manage) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!canChat(u) || !canSee(u, cid) || !creators().some((c) => c.id === cid)) return send(res, 403, { error: 'Tu n’as pas accès à cette créatrice.' }), null;
    if (manage && !seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    return u;
  };
  const view = (cid) => {
    const chats = [...inboxChats(cid).chats];
    const ai = new Map(chats.map((c) => [c.fanId, !!c.ai]));
    const m = modeOf(cid);
    return {
      mode: m?.mode || null,
      listId: m?.list_id || null,
      payers: chats.filter((c) => (Number(c.paid) || 0) > 0 || (Number(c.spent) || 0) > 0).length,
      lists: listsOf(cid).map((l) => {
        const mem = all('SELECT fan_id FROM auto_list_members WHERE list_id = ?', l.id);
        return { id: l.id, name: l.name, minSpent: l.min_spent, members: mem.length, withAi: mem.filter((r) => ai.get(r.fan_id)).length, createdAt: l.created_at };
      }),
    };
  };
  const cleanName = (s) => String(s || '').trim().slice(0, 40);
  const cleanMin = (v) => Math.round(Number(v) * 100) / 100;

  return {
    // Mode de chatting + listes d'une créatrice.
    'GET /api/chat-setup': async (req, res) => {
      const cid = String(q(req).get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      send(res, 200, view(cid));
    },
    // Choisir le mode (admins / managers). Hybride : il faut une liste de passage (créée si besoin : « A dépensé 1 $ »).
    'POST /api/chat-setup/mode': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      if (!MODES.includes(b.mode)) return send(res, 400, { error: 'Mode inconnu' });
      let listId = b.mode === 'hybrid' ? Number(b.listId) || null : null;
      if (listId && !one('SELECT id FROM auto_lists WHERE id = ? AND creator_id = ?', listId, cid)) return send(res, 400, { error: 'Liste inconnue' });
      if (b.mode === 'hybrid' && !listId) {
        listId = listsOf(cid).find((l) => l.min_spent === 1)?.id || Number(run('INSERT INTO auto_lists (creator_id, name, min_spent, created_at) VALUES (?, ?, ?, ?)', cid, 'Payeurs', 1, Date.now()).lastInsertRowid);
      }
      run('INSERT INTO chat_mode (creator_id, mode, list_id, updated_at, updated_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(creator_id) DO UPDATE SET mode = excluded.mode, list_id = excluded.list_id, updated_at = excluded.updated_at, updated_by = excluded.updated_by', cid, b.mode, listId, Date.now(), u.name || null);
      updateLists(cid);
      send(res, 200, view(cid));
    },
    'POST /api/chat-setup/list': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (!auth(req, res, cid, true)) return;
      const name = cleanName(b.name);
      const min = cleanMin(b.minSpent);
      if (!name) return send(res, 400, { error: 'Donne un nom à la liste.' });
      if (!(min > 0)) return send(res, 400, { error: 'Le montant doit être plus grand que 0.' });
      if (b.id) {
        const l = one('SELECT * FROM auto_lists WHERE id = ? AND creator_id = ?', Number(b.id), cid);
        if (!l) return send(res, 404, { error: 'Liste inconnue' });
        run('UPDATE auto_lists SET name = ?, min_spent = ? WHERE id = ?', name, min, l.id);
        // Seuil relevé : les fans qui ne le remplissent plus sont recalculés (ceux déjà traités restent traités).
        if (min > l.min_spent) {
          const paid = paidMap(cid, [...inboxChats(cid).chats]);
          for (const r of all('SELECT fan_id FROM auto_list_members WHERE list_id = ?', l.id)) if ((paid.get(r.fan_id) || 0) < min) run('DELETE FROM auto_list_members WHERE list_id = ? AND fan_id = ? AND handled = 0', l.id, r.fan_id);
        }
      } else run('INSERT INTO auto_lists (creator_id, name, min_spent, created_at) VALUES (?, ?, ?, ?)', cid, name, min, Date.now());
      updateLists(cid);
      send(res, 200, view(cid));
    },
    'POST /api/chat-setup/list/delete': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (!auth(req, res, cid, true)) return;
      const id = Number(b.id);
      if (modeOf(cid)?.list_id === id) return send(res, 400, { error: 'C’est la liste de passage du mode hybride : choisis-en une autre avant de la supprimer.' });
      run('DELETE FROM auto_list_members WHERE list_id = ? AND list_id IN (SELECT id FROM auto_lists WHERE creator_id = ?)', id, cid);
      run('DELETE FROM auto_lists WHERE id = ? AND creator_id = ?', id, cid);
      send(res, 200, view(cid));
    },
    // Les fans d'une liste (les plus récents d'abord).
    'GET /api/chat-setup/members': async (req, res) => {
      const p = q(req);
      const cid = String(p.get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      const l = one('SELECT * FROM auto_lists WHERE id = ? AND creator_id = ?', Number(p.get('listId')), cid);
      if (!l) return send(res, 404, { error: 'Liste inconnue' });
      const chats = new Map([...inboxChats(cid).chats].map((c) => [c.fanId, c]));
      const paid = paidMap(cid, [...chats.values()]);
      send(
        res,
        200,
        all('SELECT fan_id, joined_at FROM auto_list_members WHERE list_id = ? ORDER BY joined_at DESC LIMIT 500', l.id).map((r) => {
          const c = chats.get(r.fan_id);
          return { fanId: r.fan_id, name: c?.name || 'Fan', username: c?.username || null, avatar: c?.avatar || null, spent: paid.get(r.fan_id) || 0, ai: !!c?.ai, joinedAt: r.joined_at };
        }),
      );
    },
  };
}
