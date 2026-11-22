// Listes de fans, différentes selon la plateforme (le CRM est coupé en deux) :
//
//  OnlyFans — « Smart lists » (comme Infloww) :
//    - spend   : par dépense totale, en tranches (min inclus → max exclu, ou sans limite), expirés inclus ou non ;
//    - newfans : « abonné depuis moins de N jours » (expirés exclus).
//
//  MYM — « Groupes » (comme MyPulse) :
//    - manual  : on y met les fans à la main ; remise à zéro automatique possible (jour / semaine / mois) ;
//    - auto    : par CA cumulé (€, bornes incluses) : « sans paiement », « PPV et pourboires seulement »,
//                critères en plus : ancienneté (jours), taux d'achats (%) sur au moins N PPV envoyés.
//    Chaque groupe a une couleur et une icône ; ses membres sont séparés en abonnés / anciens.
//
// Les listes automatiques se calculent à la demande (un fan change de tranche dès que sa dépense change).
// Données du fan : conversations gardées par Bloom (dépense Substy, date d'abonnement, statut), ventes vues
// (Substy en direct, Infloww / MyPulse) et journal des messages (PPV envoyés / achetés).
import { all, db, one, run } from './store.mjs';
import { img, inboxChat, inboxChats } from './chat.mjs';
import { canChat, canSee, isBoss, platformOfCreator } from './team.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS fan_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
    color TEXT, icon TEXT, position INTEGER NOT NULL DEFAULT 0,
    min REAL, max REAL, days INTEGER, include_expired INTEGER NOT NULL DEFAULT 1,
    no_pay INTEGER NOT NULL DEFAULT 0, ppv_only INTEGER NOT NULL DEFAULT 0,
    age_min INTEGER, age_max INTEGER, rate_min REAL, rate_max REAL, rate_ppv INTEGER,
    reset TEXT NOT NULL DEFAULT 'never', last_reset INTEGER,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT
  );
  CREATE INDEX IF NOT EXISTS fan_lists_creator ON fan_lists (creator_id, position);
  CREATE TABLE IF NOT EXISTS fan_list_members (list_id INTEGER NOT NULL, fan_id TEXT NOT NULL, added_at INTEGER NOT NULL, added_by TEXT, PRIMARY KEY (list_id, fan_id));
`);

const DAY = 864e5;
const KINDS = { of: ['spend', 'newfans'], mym: ['manual', 'auto'] };
const RESETS = ['never', 'daily', 'weekly', 'monthly'];
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// ---------------------------------------------------------------- données des fans d'une créatrice
const cache = new Map(); // creatorId -> { at, fans }
/** fanId -> { c, total, ppvTips, since, expired, ppvSent, ppvBought } (montants dans la monnaie de la créatrice). */
export function fanData(cid) {
  const hit = cache.get(cid);
  if (hit && Date.now() - hit.at < 20_000) return hit.fans;
  const chats = [...inboxChats(cid).chats];
  const fans = new Map();
  for (const c of chats) {
    fans.set(c.fanId, {
      c,
      total: Math.max(Number(c.paid) || 0, Number(c.spent) || 0),
      ppvTips: null,
      since: c.since ? Date.parse(c.since) || null : null,
      expired: /expir|cancel|inactive|unsub|ended/i.test(c.subscribed || ''),
      ppvSent: 0,
      ppvBought: 0,
    });
  }
  // Ventes vues (MYM : Substy ne donne pas la dépense du fan) : par identifiant, sinon par nom s'il est unique.
  const byName = new Map();
  for (const c of chats) for (const n of new Set([norm(c.name), norm(c.username)])) if (n) byName.set(n, byName.has(n) && byName.get(n) !== c.fanId ? null : c.fanId);
  const find = (id, name) => (id && fans.has(String(id)) ? String(id) : byName.get(norm(name)) || null);
  const sums = new Map();
  const add = (id, name, cents, type) => {
    const f = find(id, name);
    if (!f) return;
    const s = sums.get(f) || { all: 0, pt: 0 };
    s.all += cents;
    if (/tip|ppv|messag|priv|media|média/i.test(type || '')) s.pt += cents;
    sums.set(f, s);
  };
  const acc = one('SELECT account FROM rv_map WHERE creator_id = ?', cid)?.account;
  if (acc) for (const r of all("SELECT fan_id, fan_name, gross, type FROM rv_sales WHERE account = ? AND gross > 0 AND type <> 'sub'", acc)) add(r.fan_id, r.fan_name, r.gross, r.type);
  for (const r of all("SELECT fan_id, fan_name, gross, type FROM rv_live WHERE creator_id = ? AND gross > 0 AND matched IS NULL AND COALESCE(type, '') NOT LIKE '%sub%'", cid)) add(r.fan_id, r.fan_name, r.gross, r.type || 'ppv');
  for (const [f, s] of sums) {
    const d = fans.get(f);
    d.total = Math.max(d.total, s.all / 100);
    d.ppvTips = s.pt / 100;
  }
  for (const r of all('SELECT fan_id, COUNT(*) AS sent, SUM(COALESCE(paid, 0)) AS bought FROM msg_log WHERE creator_id = ? AND from_fan = 0 AND price > 0 AND deleted = 0 GROUP BY fan_id', cid)) {
    const d = fans.get(String(r.fan_id));
    if (d) (d.ppvSent = r.sent), (d.ppvBought = r.bought || 0);
  }
  cache.set(cid, { at: Date.now(), fans });
  return fans;
}

// ---------------------------------------------------------------- règles
function maybeReset(l) {
  if (l.kind !== 'manual' || l.reset === 'never') return;
  const d = new Date();
  const start =
    l.reset === 'daily' ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : l.reset === 'weekly' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)) : new Date(d.getFullYear(), d.getMonth(), 1);
  if ((l.last_reset || l.created_at) < start.getTime()) {
    run('DELETE FROM fan_list_members WHERE list_id = ?', l.id);
    run('UPDATE fan_lists SET last_reset = ? WHERE id = ?', Date.now(), l.id);
  }
}
/** Le fan est-il dans cette liste (listes automatiques) ? */
function matches(l, f, now = Date.now()) {
  if (l.kind === 'spend') {
    if (!l.include_expired && f.expired) return false;
    return f.total >= (l.min ?? 0) && (l.max == null || f.total < l.max) && f.total > 0;
  }
  if (l.kind === 'newfans') return !f.expired && !!f.since && now - f.since < (l.days || 0) * DAY;
  if (l.kind === 'auto') {
    if (l.no_pay) {
      if (f.expired || f.total > 0) return false;
    } else {
      const v = l.ppv_only ? (f.ppvTips ?? f.total) : f.total;
      if (v < (l.min ?? 0) || (l.max != null && v > l.max)) return false;
    }
    if (l.age_min != null || l.age_max != null) {
      if (!f.since) return false;
      const age = (now - f.since) / DAY;
      if ((l.age_min != null && age < l.age_min) || (l.age_max != null && age > l.age_max)) return false;
    }
    if (l.rate_min != null || l.rate_max != null) {
      if (f.ppvSent < Math.max(1, l.rate_ppv || 1)) return false;
      const rate = (f.ppvBought / f.ppvSent) * 100;
      if ((l.rate_min != null && rate < l.rate_min) || (l.rate_max != null && rate > l.rate_max)) return false;
    }
    return true;
  }
  return false;
}
/** Les fans d'une liste (identifiants). */
export function membersOf(l) {
  if (l.kind === 'manual') {
    maybeReset(l);
    return new Set(all('SELECT fan_id FROM fan_list_members WHERE list_id = ?', l.id).map((r) => r.fan_id));
  }
  const out = new Set();
  const now = Date.now();
  for (const [id, f] of fanData(l.creator_id)) if (matches(l, f, now)) out.add(id);
  return out;
}
/** Pour le filtre de la messagerie : les fans d'une liste (null si inconnue). */
export function listMembers(listId) {
  const l = one('SELECT * FROM fan_lists WHERE id = ?', Number(listId));
  return l ? { creatorId: l.creator_id, fans: membersOf(l) } : null;
}
export const listsOfCreator = (cid) => all('SELECT * FROM fan_lists WHERE creator_id = ? ORDER BY position, id', String(cid));

const view = (l) => ({
  id: l.id,
  kind: l.kind,
  name: l.name,
  color: l.color,
  icon: l.icon,
  min: l.min,
  max: l.max,
  days: l.days,
  includeExpired: !!l.include_expired,
  noPay: !!l.no_pay,
  ppvOnly: !!l.ppv_only,
  ageMin: l.age_min,
  ageMax: l.age_max,
  rateMin: l.rate_min,
  rateMax: l.rate_max,
  ratePpv: l.rate_ppv,
  reset: l.reset,
  updatedBy: l.updated_by,
});

// ---------------------------------------------------------------- adresses
export function fanListRoutes({ userFrom, send, body, creators }) {
  const q = (req) => new URL(req.url, 'http://x').searchParams;
  const auth = (req, res, cid, edit) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!canChat(u) || !canSee(u, cid) || !creators().some((c) => c.id === cid)) return send(res, 403, { error: 'Tu n’as pas accès à cette créatrice.' }), null;
    if (edit && !isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    return u;
  };
  const pfOf = (cid) => platformOfCreator(cid) || 'of';
  const listView = (cid) => {
    const fans = fanData(cid);
    return {
      platform: pfOf(cid),
      canEdit: true,
      fans: fans.size,
      lists: listsOfCreator(cid)
        .filter((l) => KINDS[pfOf(cid)].includes(l.kind))
        .map((l) => {
          const m = membersOf(l);
          let expired = 0;
          for (const id of m) if (fans.get(id)?.expired) expired++;
          return { ...view(l), count: m.size, active: m.size - expired, expired };
        }),
    };
  };
  /** Nettoie une liste envoyée par la page (selon la plateforme de la créatrice). */
  const clean = (cid, b) => {
    const kind = String(b.kind || '');
    if (!KINDS[pfOf(cid)].includes(kind)) throw Object.assign(new Error('Type de liste inconnu pour cette plateforme'), { status: 400 });
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) throw Object.assign(new Error('Donne un nom à la liste.'), { status: 400 });
    const l = {
      kind,
      name,
      color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : null,
      icon: String(b.icon || '').slice(0, 30) || null,
      min: num(b.min),
      max: num(b.max),
      days: num(b.days) != null ? Math.round(num(b.days)) : null,
      include_expired: b.includeExpired === false ? 0 : 1,
      no_pay: b.noPay ? 1 : 0,
      ppv_only: b.ppvOnly ? 1 : 0,
      age_min: num(b.ageMin),
      age_max: num(b.ageMax),
      rate_min: num(b.rateMin),
      rate_max: num(b.rateMax),
      rate_ppv: num(b.ratePpv) != null ? Math.round(num(b.ratePpv)) : null,
      reset: RESETS.includes(b.reset) ? b.reset : 'never',
    };
    if (kind === 'newfans') {
      if (!(l.days >= 1 && l.days <= 3650)) throw Object.assign(new Error('Nombre de jours invalide.'), { status: 400 });
      l.include_expired = 0;
    }
    if (kind === 'spend' || (kind === 'auto' && !l.no_pay)) {
      if (l.min == null || l.min < 0) throw Object.assign(new Error('Indique le montant minimum.'), { status: 400 });
      if (l.max != null && l.max <= l.min) throw Object.assign(new Error('Le maximum doit être plus grand que le minimum.'), { status: 400 });
    }
    return l;
  };
  const COLS = ['kind', 'name', 'color', 'icon', 'min', 'max', 'days', 'include_expired', 'no_pay', 'ppv_only', 'age_min', 'age_max', 'rate_min', 'rate_max', 'rate_ppv', 'reset'];
  const insert = (cid, l, u, position) =>
    run(
      `INSERT INTO fan_lists (creator_id, ${COLS.join(', ')}, position, created_at, updated_at, updated_by) VALUES (?, ${COLS.map(() => '?').join(', ')}, ?, ?, ?, ?)`,
      cid, ...COLS.map((k) => l[k]), position, Date.now(), Date.now(), u.name || null,
    );
  const nextPos = (cid) => (one('SELECT MAX(position) AS p FROM fan_lists WHERE creator_id = ?', cid)?.p ?? -1) + 1;

  return {
    'GET /api/fanlists': async (req, res) => {
      const cid = String(q(req).get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      send(res, 200, listView(cid));
    },
    // Créer ou modifier une liste.
    'POST /api/fanlists/save': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      const l = clean(cid, b.list || {});
      const id = Number(b.list?.id) || null;
      if (id) {
        const old = one('SELECT * FROM fan_lists WHERE id = ? AND creator_id = ?', id, cid);
        if (!old) return send(res, 404, { error: 'Liste introuvable' });
        run(`UPDATE fan_lists SET ${COLS.map((k) => `${k} = ?`).join(', ')}, updated_at = ?, updated_by = ? WHERE id = ?`, ...COLS.map((k) => l[k]), Date.now(), u.name || null, id);
      } else insert(cid, l, u, nextPos(cid));
      cache.delete(cid);
      send(res, 200, listView(cid));
    },
    // OnlyFans : enregistrer toutes les tranches de dépense d'un coup (fenêtre « Segment by total spend »).
    'POST /api/fanlists/segments': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      const segs = (Array.isArray(b.segments) ? b.segments : []).slice(0, 20).map((s) => ({ id: Number(s.id) || null, ...clean(cid, { ...s, kind: 'spend', includeExpired: b.includeExpired !== false }) }));
      const keep = new Set(segs.map((s) => s.id).filter(Boolean));
      for (const l of listsOfCreator(cid).filter((x) => x.kind === 'spend' && !keep.has(x.id))) run('DELETE FROM fan_lists WHERE id = ?', l.id);
      segs.forEach((s, i) => {
        if (s.id && one('SELECT 1 FROM fan_lists WHERE id = ? AND creator_id = ?', s.id, cid))
          run(`UPDATE fan_lists SET ${COLS.map((k) => `${k} = ?`).join(', ')}, position = ?, updated_at = ?, updated_by = ? WHERE id = ?`, ...COLS.map((k) => s[k]), i, Date.now(), u.name || null, s.id);
        else insert(cid, s, u, i);
      });
      send(res, 200, listView(cid));
    },
    'POST /api/fanlists/delete': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (!auth(req, res, cid, true)) return;
      run('DELETE FROM fan_list_members WHERE list_id IN (SELECT id FROM fan_lists WHERE id = ? AND creator_id = ?)', Number(b.id), cid);
      run('DELETE FROM fan_lists WHERE id = ? AND creator_id = ?', Number(b.id), cid);
      send(res, 200, listView(cid));
    },
    'POST /api/fanlists/duplicate': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      const l = one('SELECT * FROM fan_lists WHERE id = ? AND creator_id = ?', Number(b.id), cid);
      if (!l) return send(res, 404, { error: 'Liste introuvable' });
      insert(cid, { ...l, name: `${l.name} (copie)`.slice(0, 60) }, u, nextPos(cid));
      send(res, 200, listView(cid));
    },
    // Les fans d'une liste.
    'GET /api/fanlists/members': async (req, res) => {
      const p = q(req);
      const cid = String(p.get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      const l = one('SELECT * FROM fan_lists WHERE id = ? AND creator_id = ?', Number(p.get('id')), cid);
      if (!l) return send(res, 404, { error: 'Liste introuvable' });
      const fans = fanData(cid);
      const added = l.kind === 'manual' ? new Map(all('SELECT fan_id, added_at, added_by FROM fan_list_members WHERE list_id = ?', l.id).map((r) => [r.fan_id, r])) : null;
      const rows = [...membersOf(l)].map((id) => {
        const f = fans.get(id);
        const c = f?.c || inboxChat(cid, id);
        return {
          fanId: id,
          name: c?.name || 'Fan',
          username: c?.username || null,
          avatar: img(c?.avatar) || null,
          total: f?.total ?? 0,
          since: f?.since ?? null,
          expired: !!f?.expired,
          rate: f?.ppvSent ? Math.round((f.ppvBought / f.ppvSent) * 100) : null,
          addedBy: added?.get(id)?.added_by || null,
        };
      });
      rows.sort((a, b) => b.total - a.total);
      send(res, 200, rows.slice(0, 1000));
    },
    // Groupes manuels (MYM) : ajouter / retirer un fan.
    'POST /api/fanlists/member': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid);
      if (!u) return;
      const l = one("SELECT * FROM fan_lists WHERE id = ? AND creator_id = ? AND kind = 'manual'", Number(b.id), cid);
      if (!l) return send(res, 404, { error: 'Groupe manuel introuvable' });
      if (b.add) run('INSERT OR IGNORE INTO fan_list_members (list_id, fan_id, added_at, added_by) VALUES (?, ?, ?, ?)', l.id, String(b.fanId), Date.now(), u.name || null);
      else run('DELETE FROM fan_list_members WHERE list_id = ? AND fan_id = ?', l.id, String(b.fanId));
      send(res, 200, { ok: true });
    },
    // Chercher un fan de la créatrice (pour l'ajouter à un groupe manuel).
    'GET /api/fanlists/search': async (req, res) => {
      const p = q(req);
      const cid = String(p.get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      const s = norm(p.get('q'));
      if (s.length < 2) return send(res, 200, []);
      const out = [];
      for (const [id, f] of fanData(cid)) {
        if (!`${norm(f.c.name)} ${norm(f.c.username)}`.includes(s)) continue;
        out.push({ fanId: id, name: f.c.name, username: f.c.username || null, avatar: img(f.c.avatar) || null, total: f.total, expired: f.expired });
        if (out.length >= 20) break;
      }
      send(res, 200, out);
    },
  };
}
