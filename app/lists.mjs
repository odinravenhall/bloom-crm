// Façon de chatter de chaque créatrice, et listes automatiques de fans.
//
// Mode de chatting (réglé par créatrice dans « Configuration IA ») :
//   - hybrid : l'IA de Substy parle à tous les fans. Quand un chatteur ÉPINGLE un fan pour le reprendre, Bloom coupe
//              l'IA sur ce fan ; quand il le désépingle, Bloom la rallume. Pour un chatteur, il faut que l'IA ait déjà
//              envoyé un PPV au fan (sinon l'IA n'a pas encore fait son travail).
//   - human  : pas d'IA, les chatteurs répondent à tous les fans (épingler ne touche pas à l'IA).
//   - ai     : l'IA fait tout (épingler ne coupe pas l'IA).
//   - pas de réglage : comme l'hybride.
// Les chatteurs voient toujours tous les fans (filtre « ont payé » dans la messagerie).
//
// Listes automatiques : chaque créatrice a ses propres listes, avec une règle (pour l'instant : « a dépensé au moins X »,
// en $ sur OnlyFans, en € sur MYM). Un fan entre tout seul dans la liste dès qu'il remplit la règle, et y reste.
// Ce qu'un fan a dépensé : le total de Substy, ou à défaut les ventes vues (Substy en direct, Infloww / MyPulse),
// sans les abonnements.
import { all, db, one, run } from './store.mjs';
import './inbox.mjs'; // table fan_meta (épingles)
import { inboxChat, inboxChats, patchInboxChat, refreshInboxTop } from './chat.mjs';
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

// ---------------------------------------------------------------- épingler = reprendre le fan
/** L'IA a-t-elle déjà envoyé un PPV à ce fan ? (journal de Bloom, sinon les derniers messages chez Substy) */
async function aiSentPpv(substy, cid, fanId) {
  if (one("SELECT 1 FROM msg_log WHERE creator_id = ? AND fan_id = ? AND from_fan = 0 AND kind = 'ai' AND price > 0", cid, String(fanId))) return true;
  let cursor;
  for (let i = 0; i < 3; i++) {
    const r = await substy.messages(cid, fanId, { limit: 30, cursor });
    const price = (p) => (p == null ? 0 : typeof p === 'object' ? (p.minor || 0) / 100 : Number(p) || 0);
    if ((r?.items || []).some((m) => m.isSentByCreator && m.sentByAi && price(m.price) > 0)) return true;
    cursor = r?.nextCursor;
    if (!cursor) break;
  }
  return false;
}
const err = (status, message) => Object.assign(new Error(message), { status });
/**
 * Épingler / désépingler un fan. En hybride : épingler coupe l'IA sur ce fan (un chatteur ne peut le faire qu'après
 * le premier PPV de l'IA), désépingler la rallume (seulement si c'est l'épingle qui l'avait coupée).
 * Renvoie l'état de l'IA sur le fan s'il a changé (sinon undefined).
 */
export async function pinFan(substy, u, cid, fanId, pin) {
  const mode = modeOf(cid)?.mode || 'hybrid';
  const meta = one('SELECT pinned, pin_cut FROM fan_meta WHERE creator_id = ? AND fan_id = ?', cid, String(fanId));
  const c = inboxChat(cid, fanId);
  let ai;
  let cut = meta?.pin_cut || 0;
  // Épingler = reprendre le fan : l'IA de Substy est coupée sur lui. Désépingler = on la rallume
  // (sauf créatrice réglée en « humain seulement », où l'IA reste éteinte).
  if (pin) {
    if (c?.ai !== false && !isBoss(u) && !(await aiSentPpv(substy, cid, fanId))) throw err(400, 'L’IA n’a pas encore envoyé de PPV à ce fan : attends son premier PPV avant de le reprendre.');
    await substy.setAi(cid, fanId, false);
    patchInboxChat(cid, fanId, { ai: false });
    ai = false;
    cut = 1;
  } else {
    if (mode !== 'human') {
      await substy.setAi(cid, fanId, true);
      patchInboxChat(cid, fanId, { ai: true });
      ai = true;
    }
    cut = 0;
  }
  run('INSERT OR IGNORE INTO fan_meta (creator_id, fan_id, updated_at) VALUES (?, ?, ?)', cid, String(fanId), Date.now());
  run('UPDATE fan_meta SET pinned = ?, pinned_by = ?, pin_cut = ?, updated_at = ? WHERE creator_id = ? AND fan_id = ?', pin ? 1 : 0, pin ? u.name : null, cut, Date.now(), cid, String(fanId));
  return ai;
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

// ---------------------------------------------------------------- listes (toutes les 20 s)
let SUB = null;
let CREATORS = () => [];
const lastSale = new Map(); // creatorId -> dernière vente vue
let busy = false;

/** Met à jour les listes d'une créatrice (les fans qui remplissent la règle y entrent). */
function updateLists(cid) {
  const lists = listsOf(cid);
  if (!lists.length) return;
  const paid = paidMap(cid, [...inboxChats(cid).chats]);
  const now = Date.now();
  const ins = db.prepare('INSERT OR IGNORE INTO auto_list_members (list_id, fan_id, joined_at) VALUES (?, ?, ?)');
  for (const l of lists) for (const [fanId, v] of paid) if (v > 0 && v >= l.min_spent) ins.run(l.id, fanId, now);
}

export async function tick() {
  if (busy || !SUB) return;
  busy = true;
  try {
    for (const cid of new Set(all('SELECT DISTINCT creator_id FROM auto_lists').map((r) => r.creator_id))) {
      if (!CREATORS().some((c) => c.id === cid)) continue;
      // Nouvelle vente : on relit le haut de sa liste de conversations pour avoir la dépense à jour.
      const last = one('SELECT MAX(first_seen) AS t FROM rv_live WHERE creator_id = ?', cid)?.t || 0;
      if (last > (lastSale.get(cid) ?? last - 1)) await refreshInboxTop(cid);
      lastSale.set(cid, last);
      updateLists(cid);
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
    // Choisir le mode (admins / managers).
    'POST /api/chat-setup/mode': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      if (!MODES.includes(b.mode)) return send(res, 400, { error: 'Mode inconnu' });
      run('INSERT INTO chat_mode (creator_id, mode, list_id, updated_at, updated_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(creator_id) DO UPDATE SET mode = excluded.mode, list_id = NULL, updated_at = excluded.updated_at, updated_by = excluded.updated_by', cid, b.mode, null, Date.now(), u.name || null);
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
