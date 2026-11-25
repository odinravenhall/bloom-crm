// Bloom v2 → Fans : UN écran pour OnlyFans et MYM (25/11/2026, design « Constellation »).
// Il remplace, dans la v2, la copie d'Infloww (Smart lists) et celle de MyPulse (Abonnés / Anciens / Intéressés, Mes
// groupes). Ces routes lisent, dans une même forme des deux côtés, les fans qu'on connaît d'une modèle : ceux avec
// qui une conversation existe (`fanData` de fanlists.mjs : dépense, ancienneté, contenus payants envoyés / achetés).
//  - Statut. OnlyFans : abonné ou ancien, d'après Substy. MYM : abonné, ancien ou intéressé, d'après MYM lui-même
//    quand la conversation est lue en direct (`is_subscriber`, `is_interested`), sinon d'après Substy (`mym_fans`).
//  - Dépense. OnlyFans : ce que le fan a payé d'après Substy, ou les ventes d'Infloww si elles disent plus. MYM : les
//    achats et pourboires que Bloom a vus passer (nets, hors abonnements) — Substy ne donne pas la dépense d'un fan MYM.
//  - Vues rapides (calculées, rien à régler) : ont acheté, abonnés qui n'ont jamais acheté, nouveaux abonnés, épinglés.
//  - Groupes : ceux de `fan_lists` (fanlists.mjs), manuels ou automatiques, les mêmes des deux côtés depuis la v2.
//  - Abonné depuis. MYM : Substy, sinon le premier abonnement vu dans les revenus. OnlyFans : la liste de Substy ne
//    donne PAS la date (relevé le 25/11/2026) ; seule la fiche d'un fan (`fans.get`) la donne, avec le prix, la fin de
//    l'abonnement et le lien de suivi qui a amené le fan → « /api/v2/fans/live », lu à l'ouverture d'une fiche.
// La fiche d'un fan lit et écrit ce que la MESSAGERIE montre déjà (`fan_meta` : surnom, note, étiquettes) et le
// profil (`mym_fan_meta` : âge, genre, provenance, langue, promesse d'achat), maintenant aussi côté OnlyFans.
// Créer / modifier / supprimer un groupe : « /api/fanlists/save|delete|duplicate » (team leaders et plus).
import { all, db, one, run } from './store.mjs';
import './inbox.mjs'; // table fan_meta
import { canSee, isBoss } from './team.mjs';
import { askOf } from './v2stats.mjs';
import { img } from './chat.mjs';
import { fanData, fanListView, forgetFans, listsOfCreator, membersOf } from './fanlists.mjs';
import { SOURCES, tabOf } from './mymfans.mjs';
import { catOf, firstSubs } from './mymstats.mjs';
import { isLinked, mymFollowerCounts } from './mym.mjs';

// Colonnes ajoutées par la messagerie (rvapi.mjs) : on s'assure qu'elles existent si ce fichier est chargé avant.
for (const sql of ['ALTER TABLE fan_meta ADD COLUMN nickname TEXT']) {
  try {
    db.exec(sql);
  } catch {}
}

const DAY = 864e5;
const NEW_DAYS = 7;
const PER = 50;
const REFUND = /refund|chargeback|revers|rembours|annul|^undo$/i;
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const lower = (s) => String(s || '').trim().toLowerCase();

/**
 * Statut d'un fan : 'active' (abonné), 'old' (ancien abonné), 'interested' (MYM : suit sans être abonné) ou 'gone'
 * (MYM : compte supprimé, bloqué ou conversation fermée — on ne peut plus lui écrire). Sans les « gone », le nombre
 * d'abonnés retombe sur celui que MYM annonce (Pauline, 25/11/2026 : 9 142).
 */
function statusOf(pf, f, sub) {
  if (pf !== 'mym') return f.expired ? 'old' : 'active';
  const c = f.c;
  if (c.mym && c.canSend === false) return 'gone';
  if (c.mym) return c.sub ? 'active' : c.interested ? 'interested' : 'old';
  if (sub) return tabOf(sub.status);
  return /^active$/i.test(c.subscribed || '') ? 'active' : c.subscribed ? 'old' : 'interested';
}

// Les fans d'une modèle, prêts à trier et filtrer (gardés 15 s : le tableau se relit souvent).
const sets = new Map();
function fansOf(pf, cid) {
  const key = `${pf}:${cid}`;
  const hit = sets.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit;
  const data = fanData(cid);
  const sub = pf === 'mym' ? new Map(all('SELECT fan_id, status, subscribed_at FROM mym_fans WHERE creator_id = ?', cid).map((r) => [r.fan_id, r])) : new Map();
  const meta = new Map(all("SELECT fan_id, nickname, notes, tags, pinned FROM fan_meta WHERE creator_id = ? AND (nickname IS NOT NULL OR notes <> '' OR tags <> '' OR pinned = 1)", cid).map((r) => [r.fan_id, r]));
  const first = pf === 'mym' ? firstSubs(cid) : null;
  const rows = [];
  for (const [id, f] of data) {
    const c = f.c;
    const m = meta.get(id);
    const s = sub.get(id);
    rows.push({
      fanId: id, name: c.name || 'Fan', nickname: m?.nickname || null, username: c.username || null, avatar: img(c.avatar) || null,
      status: statusOf(pf, f, s),
      // Abonné depuis : Substy, sinon le premier abonnement que Bloom a vu passer dans les revenus MYM.
      since: f.since || s?.subscribed_at || first?.get(lower(c.username || c.name)) || null,
      total: Math.round((f.total || 0) * 100), ppvSent: f.ppvSent || 0, ppvBought: f.ppvBought || 0,
      lastAt: c.last?.at ? Date.parse(c.last.at) || null : null, lastFromFan: !!c.last && !c.last.fromCreator,
      hasNote: !!m?.notes, tags: m?.tags ? String(m.tags).split(',').filter(Boolean) : [], pinned: !!m?.pinned, ai: !!c.ai,
      key: norm(`${c.name || ''} ${m?.nickname || ''} ${c.username || ''}`),
    });
  }
  const v = { at: Date.now(), rows, byId: new Map(rows.map((r) => [r.fanId, r])) };
  sets.set(key, v);
  if (sets.size > 60) for (const [k, x] of sets) if (Date.now() - x.at > 60_000) sets.delete(k);
  return v;
}
const forget = (cid) => {
  forgetFans(cid);
  for (const k of sets.keys()) if (k.endsWith(`:${cid}`)) sets.delete(k);
};

// Vues rapides : des tris tout faits, sans rien régler.
const VIEWS = [
  ['buyers', 'Ont acheté', (r) => r.total > 0],
  ['never', 'Abonnés sans achat', (r) => r.status === 'active' && r.total <= 0],
  ['new', `Nouveaux abonnés (${NEW_DAYS} jours)`, (r, now) => r.status === 'active' && !!r.since && now - r.since < NEW_DAYS * DAY],
  ['pinned', 'Épinglés par l’équipe', (r) => r.pinned],
];

const publicRow = ({ key, ...r }) => r;
const cmp = {
  spent: (a, b) => b.total - a.total || (b.lastAt || 0) - (a.lastAt || 0),
  recent: (a, b) => (b.since || 0) - (a.since || 0) || b.total - a.total,
  last: (a, b) => (b.lastAt || 0) - (a.lastAt || 0),
  name: (a, b) => (a.nickname || a.name).localeCompare(b.nickname || b.name, 'fr', { sensitivity: 'base' }),
  rate: (a, b) => (b.ppvSent ? b.ppvBought / b.ppvSent : -1) - (a.ppvSent ? a.ppvBought / a.ppvSent : -1) || b.ppvSent - a.ppvSent,
};

/** Les derniers achats d'un fan que Bloom a vus passer (12 au plus). Montants en centimes. */
function buysOf(pf, cid, r, unique) {
  const out = [];
  if (pf === 'mym') {
    const name = unique ? lower(r.username || r.name) : '\u0000';
    for (const l of all("SELECT at, type, raw, gross FROM rv_live WHERE creator_id = ? AND src = 'mym' AND type <> 'payout' AND (fan_id = ? OR LOWER(fan_name) = ?) ORDER BY at DESC LIMIT 12", cid, r.fanId, name))
      out.push({ at: l.at, type: l.type === 'refund' || l.gross < 0 ? 'refund' : catOf(l), amount: l.gross, pending: false });
    return out;
  }
  const acc = one('SELECT account FROM rv_map WHERE creator_id = ?', cid)?.account;
  const name = unique ? r.name : '\u0000';
  if (acc)
    for (const s of all('SELECT at, type, gross, status FROM rv_sales WHERE account = ? AND (fan_id = ? OR fan_name = ?) ORDER BY at DESC LIMIT 12', acc, r.fanId, name))
      out.push({ at: s.at, type: REFUND.test(s.status || '') ? 'refund' : s.type, amount: s.gross, pending: false });
  // Ventes de Substy des dernières 24 h qu'Infloww n'a pas encore confirmées.
  for (const l of all('SELECT at, type, gross FROM rv_live WHERE creator_id = ? AND fan_id = ? AND matched IS NULL AND at > ? ORDER BY at DESC LIMIT 6', cid, r.fanId, Date.now() - DAY))
    out.push({ at: l.at, type: /sub/i.test(l.type || '') ? 'sub' : /tip/i.test(l.type || '') ? 'tip' : /post/i.test(l.type || '') ? 'post' : 'ppv', amount: l.gross, pending: true });
  return out.sort((a, b) => b.at - a.at).slice(0, 12);
}

const money = (p) => (p == null ? null : typeof p === 'object' ? (Number.isFinite(p.minor) ? p.minor : null) : Math.round((Number(p) || 0) * 100));

export function v2FansRoutes({ userFrom, send, body, creators, substy }) {
  /** La personne (toute l'équipe sauf les modèles) et ce qu'elle demande : plateforme affichée, modèles visibles. */
  const start = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' }), null;
    return { u, ...askOf(u, req, creators) };
  };
  /** Pour écrire : le droit porte sur la MODÈLE (le cookie de plateforme du menu est commun à tous les onglets). */
  const writer = async (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    const b = await body(req);
    const cid = String(b.creatorId || '');
    const c = creators().find((x) => String(x.id) === cid);
    if (u.role === 'model' || !c || !canSee({ ...u, pf: null }, cid)) return send(res, 403, { error: 'Tu n’as pas accès à cette modèle.' }), null;
    return { u, b, cid, pf: /mym/i.test(c.platform || '') ? 'mym' : 'of' };
  };
  const groupsOf = (cid) => listsOfCreator(cid).map((l) => ({ l, members: membersOf(l) }));

  // ---------------------------------------------------------------- listes d'OnlyFans (« Collections »)
  // Les listes du compte OnlyFans (celles d'OnlyFans comme « Fans », « Following »…, et celles créées par l'agence),
  // lues chez Substy (`fans.lists.list`, gardées 60 s). Leurs membres : les conversations de Substy filtrées par
  // liste (`chats.list` avec `listId`), par pages de 30 comme le site de Substy, gardées 5 min. Au-delà de
  // OF_MAX fans, la lecture s'arrête (`partial`) : une très grande liste (ex. tous les abonnés) prendrait des
  // minutes. Lecture seule : Bloom ne change pas les listes d'OnlyFans ici.
  const OF_MAX = 1500;
  const ofCache = new Map(); // clé → { at, value | promise }
  const remember = (key, ttl, make) => {
    const hit = ofCache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = make().catch((e) => (ofCache.delete(key), Promise.reject(e)));
    ofCache.set(key, { at: Date.now(), value });
    return value;
  };
  const ofLists = (cid) =>
    remember(`lists:${cid}`, 60_000, async () =>
      ((await substy.fanLists(cid))?.items || []).map((l) => ({ id: String(l.id), name: String(l.name || 'Sans nom'), type: String(l.type || ''), fans: Number(l.fanCount) || 0 })));
  const ofMembers = (cid, listId) =>
    remember(`members:${cid}:${listId}`, 5 * 60_000, async () => {
      const ids = new Set();
      let cursor;
      let stale = 0;
      for (let page = 0; page < Math.ceil(OF_MAX / 30) + 5; page++) {
        // Substy répond « Chats not found » (erreur) au lieu d'une page vide : liste sans conversation, ou page
        // demandée après la dernière. Ce n'est pas une panne : on garde ce qui a été lu.
        let r;
        try {
          r = await substy.chats(cid, { limit: 30, cursor, listId });
        } catch (e) {
          // Dès la première page : Substy ne donne pas les membres de cette liste (son propre site affiche alors
          // « Unable to load conversations », vu le 25/11/2026 sur la liste « Fans » de Lena) ; il ne les donne que
          // pour certaines listes (celles qu'il suit dans sa messagerie, semble-t-il).
          if (/not found/i.test(String(e?.message || e))) return { ids, partial: false, unsupported: !ids.size };
          if (ids.size) return { ids, partial: true };
          throw e;
        }
        let fresh = 0;
        for (const it of r?.items || []) {
          const id = String(it?.fan?.fanId ?? it?.fanId ?? '');
          if (id && !ids.has(id)) ids.add(id), fresh++;
        }
        stale = fresh ? 0 : stale + 1;
        cursor = r?.nextCursor || undefined;
        if (!cursor || stale >= 3) return { ids, partial: false };
        if (ids.size >= OF_MAX) return { ids, partial: true };
      }
      return { ids, partial: true };
    });
  const chip = (g) => ({ id: g.l.id, name: g.l.name, color: g.l.color || null, icon: g.l.icon || null, kind: g.l.kind });

  return {
    // ?pf=of|mym, &creatorId= (sinon la première modèle), &group= (identifiant d'un groupe, ou « v:… » pour une vue
    // rapide), &status=active|old|interested, &q=, &sort=spent|recent|last|name|rate, &dir=asc, &page=.
    'GET /api/v2/fans': async (req, res) => {
      const a = start(req, res);
      if (!a) return;
      const { u, p, pf, mine } = a;
      const known = new Map(all('SELECT creator_id AS cid, COUNT(*) AS n FROM inbox_cache GROUP BY creator_id').map((r) => [String(r.cid), r.n]));
      const list = mine.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null, fans: known.get(String(c.id)) || 0 })).sort((x, y) => y.fans - x.fans || x.name.localeCompare(y.name, 'fr'));
      const asked = p.get('creatorId') || '';
      const creator = mine.find((c) => String(c.id) === asked) || mine.find((c) => String(c.id) === list[0]?.id) || null;
      const cid = creator ? String(creator.id) : null;
      const head = { platform: pf, currency: pf === 'of' ? 'USD' : 'EUR', list, canEdit: isBoss(u), model: creator ? { id: cid, name: creator.name, avatar: creator.avatar || null } : null, sources: SOURCES, newDays: NEW_DAYS };
      if (!cid) return send(res, 200, { ...head, views: [], groups: [], stats: null, total: 0, page: 1, per: PER, rows: [] });
      const now = Date.now();
      const set = fansOf(pf, cid);
      const groups = groupsOf(cid);
      // Le groupe (ou la vue rapide) choisi : la base du tableau et des chiffres du haut.
      const g = p.get('group') || '';
      const view = g.startsWith('v:') ? VIEWS.find((v) => v[0] === g.slice(2)) : null;
      // « of:<id> » : une liste d'OnlyFans (seulement côté OnlyFans, modèle de Substy).
      let ofList = null;
      let ofErr = null;
      if (g.startsWith('of:') && pf === 'of' && substy && !cid.startsWith('mym-')) {
        try {
          const m = await ofMembers(cid, g.slice(3));
          ofList = { id: g, members: m.ids, partial: m.partial, read: m.ids.size, unsupported: !!m.unsupported };
        } catch (e) {
          ofErr = `Liste d’OnlyFans illisible pour l’instant (${String(e?.message || e).slice(0, 120)}).`;
          ofList = { id: g, members: new Set(), partial: false, read: 0 };
        }
      }
      const picked = !view && g && !ofList ? groups.find((x) => String(x.l.id) === g) : null;
      const base = view ? set.rows.filter((r) => view[2](r, now)) : ofList ? set.rows.filter((r) => ofList.members.has(r.fanId)) : picked ? set.rows.filter((r) => picked.members.has(r.fanId)) : set.rows;
      const stats = { fans: base.length, active: 0, old: 0, interested: 0, gone: 0, buyers: 0, spent: 0 };
      for (const r of base) {
        stats[r.status]++;
        if (r.total > 0) stats.buyers++, (stats.spent += r.total);
      }
      const status = ['active', 'old', 'interested', 'gone'].includes(p.get('status')) ? p.get('status') : '';
      const word = norm(p.get('q')).slice(0, 60);
      const rows = base.filter((r) => (!status || r.status === status) && (!word || r.key.includes(word)));
      const sort = cmp[p.get('sort')] ? p.get('sort') : 'spent';
      rows.sort(cmp[sort]);
      if (p.get('dir') === 'asc') rows.reverse();
      const pages = Math.max(1, Math.ceil(rows.length / PER));
      const page = Math.min(pages, Math.max(1, Number(p.get('page')) || 1));
      send(res, 200, {
        ...head,
        views: VIEWS.map(([id, name, test]) => ({ id: `v:${id}`, name, count: set.rows.reduce((n, r) => n + (test(r, now) ? 1 : 0), 0) })),
        groups: groups.map((x) => {
          let count = 0;
          let active = 0;
          let spent = 0;
          for (const id of x.members) {
            const r = set.byId.get(id);
            if (!r) continue;
            count++;
            if (r.status === 'active') active++;
            spent += r.total;
          }
          return { ...fanListView(x.l), count, active, spent };
        }),
        all: set.rows.length,
        // La liste d'OnlyFans choisie : fans lus chez Substy (`read`), lecture arrêtée avant la fin (`partial`).
        ofList: ofList ? { id: ofList.id, read: ofList.read, partial: ofList.partial, unsupported: !!ofList.unsupported, error: ofErr } : null,
        // Aucune date d'abonnement connue (OnlyFans : Substy ne la donne que fan par fan) : l'écran cache la colonne.
        dated: set.rows.some((r) => r.since),
        stats, total: rows.length, page, per: PER, sort,
        rows: rows.slice((page - 1) * PER, page * PER).map((r) => ({ ...publicRow(r), groups: groups.filter((x) => x.members.has(r.fanId)).map(chip) })),
      });
    },

    // Les listes d'OnlyFans de la modèle (« Collections » d'OnlyFans), avec le nombre de fans donné par OnlyFans.
    'GET /api/v2/fans/oflists': async (req, res) => {
      const a = start(req, res);
      if (!a) return;
      const { p, pf, mine } = a;
      const c = mine.find((x) => String(x.id) === String(p.get('creatorId') || ''));
      if (!c) return send(res, 404, { error: 'Modèle inconnue sur cette plateforme' });
      if (pf !== 'of' || !substy || String(c.id).startsWith('mym-')) return send(res, 200, { lists: [] });
      try {
        send(res, 200, { lists: await ofLists(String(c.id)) });
      } catch (e) {
        send(res, 200, { lists: [], error: `Listes d’OnlyFans illisibles pour l’instant (${String(e?.message || e).slice(0, 120)}).` });
      }
    },

    // Ce que MYM compte lui-même (abonnés, anciens, intéressés) : Bloom n'affiche que les fans qui ont une conversation.
    'GET /api/v2/fans/official': async (req, res) => {
      const a = start(req, res);
      if (!a) return;
      const { p, pf, mine } = a;
      const c = mine.find((x) => String(x.id) === String(p.get('creatorId') || ''));
      if (!c) return send(res, 404, { error: 'Modèle inconnue sur cette plateforme' });
      if (pf !== 'mym' || !isLinked(String(c.id))) return send(res, 200, { official: null });
      const v = await mymFollowerCounts(String(c.id)).catch(() => null);
      send(res, 200, { official: v ? { active: v.active, old: v.old, interested: v.interested } : null });
    },

    // La fiche d'un fan : ce que la messagerie sait déjà de lui, ses groupes, ses derniers achats.
    'GET /api/v2/fans/one': (req, res) => {
      const a = start(req, res);
      if (!a) return;
      const { p, pf, mine } = a;
      const c = mine.find((x) => String(x.id) === String(p.get('creatorId') || ''));
      if (!c) return send(res, 404, { error: 'Modèle inconnue sur cette plateforme' });
      const cid = String(c.id);
      const fanId = String(p.get('fanId') || '');
      const set = fansOf(pf, cid);
      const r = set.byId.get(fanId);
      if (!r) return send(res, 404, { error: 'Fan inconnu (aucune conversation avec lui).' });
      const m = one('SELECT nickname, notes, notes_by, notes_at, tags FROM fan_meta WHERE creator_id = ? AND fan_id = ?', cid, fanId);
      const x = one('SELECT age, gender, source, lang, promise, notes FROM mym_fan_meta WHERE creator_id = ? AND fan_id = ?', cid, fanId);
      const groups = groupsOf(cid);
      // Un nom porté par un seul fan de la modèle peut servir à retrouver ses achats (sinon l'identifiant seulement).
      const unique = set.rows.filter((y) => norm(y.name) === norm(r.name)).length === 1;
      send(res, 200, {
        fan: { ...publicRow(r), groups: groups.filter((g) => g.members.has(fanId)).map(chip) },
        sheet: {
          nickname: m?.nickname || '', notes: m?.notes || '', notesBy: m?.notes_by || null, notesAt: m?.notes_at || null, tags: m?.tags ? String(m.tags).split(',').filter(Boolean) : [],
          // Note écrite autrefois dans « Fans → Modifier » côté MYM : proposée tant que la note de la messagerie est vide.
          oldNotes: !m?.notes && x?.notes ? String(x.notes) : '',
          age: x?.age || '', gender: x?.gender || '', source: x?.source || '', lang: x?.lang || '', promise: x?.promise || '',
        },
        groups: groups.map((g) => ({ ...chip(g), member: g.members.has(fanId) })),
        buys: buysOf(pf, cid, r, unique),
        convId: `${cid}~${fanId}`,
      });
    },

    // Ce que Substy sait du fan à l'instant (une lecture par fiche ouverte) : abonnement exact, dernier achat, et le
    // lien de suivi qui l'a amené. Rien pour une modèle ajoutée sans Substy.
    'GET /api/v2/fans/live': async (req, res) => {
      const a = start(req, res);
      if (!a) return;
      const { p, mine } = a;
      const c = mine.find((x) => String(x.id) === String(p.get('creatorId') || ''));
      if (!c) return send(res, 404, { error: 'Modèle inconnue sur cette plateforme' });
      const cid = String(c.id);
      const fanId = String(p.get('fanId') || '');
      if (!fanData(cid).has(fanId) || cid.startsWith('mym-') || !substy) return send(res, 200, { live: null });
      const f = await substy.fan(cid, fanId).catch(() => null);
      if (!f || typeof f !== 'object') return send(res, 200, { live: null });
      const s = f.subscription || {};
      const t = (x) => Date.parse(x || '') || null;
      send(res, 200, {
        live: {
          status: s.status || null, since: t(s.subscribedAt), expires: t(s.expiresAt), renews: s.isCanceledAtPeriodEnd ? null : t(s.renewsAt), canceled: !!s.isCanceledAtPeriodEnd,
          price: money(s.price), purchases: Number(f.spend?.purchases) || 0, lastPurchase: t(f.spend?.lastPurchaseAt || f.lastPpvPurchaseAt),
          link: f.acquisition?.link?.name ? String(f.acquisition.link.name) : null, channel: f.acquisition?.channel ? String(f.acquisition.channel) : null,
        },
      });
    },

    // Enregistrer la fiche : seuls les champs envoyés changent. `groups` : [{ id, on }] pour les groupes manuels.
    'POST /api/v2/fans/sheet': async (req, res) => {
      const w = await writer(req, res);
      if (!w) return;
      const { u, b, cid } = w;
      const fanId = String(b.fanId || '');
      if (!fanData(cid).has(fanId)) return send(res, 404, { error: 'Fan inconnu (aucune conversation avec lui).' });
      const x = b.patch && typeof b.patch === 'object' ? b.patch : {};
      const sets_ = [];
      const args = [];
      if ('nickname' in x) sets_.push('nickname = ?'), args.push(String(x.nickname ?? '').trim().slice(0, 60) || null);
      if ('tags' in x) sets_.push('tags = ?'), args.push([...new Set((Array.isArray(x.tags) ? x.tags : []).map((t) => String(t).trim().replace(/,/g, ' ').slice(0, 30)).filter(Boolean))].slice(0, 20).join(','));
      if ('notes' in x) {
        const notes = String(x.notes ?? '').slice(0, 5000);
        const old = one('SELECT notes FROM fan_meta WHERE creator_id = ? AND fan_id = ?', cid, fanId)?.notes || '';
        if (notes !== old) sets_.push('notes = ?, notes_by = ?, notes_at = ?'), args.push(notes, u.name || null, Date.now());
      }
      if (sets_.length) {
        run('INSERT OR IGNORE INTO fan_meta (creator_id, fan_id, updated_at) VALUES (?, ?, ?)', cid, fanId, Date.now());
        run(`UPDATE fan_meta SET ${sets_.join(', ')}, updated_at = ? WHERE creator_id = ? AND fan_id = ?`, ...args, Date.now(), cid, fanId);
      }
      if (['age', 'gender', 'source', 'lang', 'promise'].some((k) => k in x)) {
        const cur = one('SELECT age, gender, source, lang, promise FROM mym_fan_meta WHERE creator_id = ? AND fan_id = ?', cid, fanId) || {};
        const next = {
          age: 'age' in x ? String(x.age ?? '').trim().slice(0, 10) || null : cur.age ?? null,
          gender: 'gender' in x ? (['Masculin', 'Féminin'].includes(x.gender) ? x.gender : null) : cur.gender ?? null,
          source: 'source' in x ? (SOURCES.includes(x.source) ? x.source : null) : cur.source ?? null,
          lang: 'lang' in x ? String(x.lang ?? '').trim().slice(0, 30) || null : cur.lang ?? null,
          promise: 'promise' in x ? (/^\d{4}-\d{2}-\d{2}$/.test(String(x.promise)) ? String(x.promise) : null) : cur.promise ?? null,
        };
        run('INSERT OR IGNORE INTO mym_fan_meta (creator_id, fan_id, updated_at) VALUES (?, ?, ?)', cid, fanId, Date.now());
        run('UPDATE mym_fan_meta SET age = ?, gender = ?, source = ?, lang = ?, promise = ?, updated_by = ?, updated_at = ? WHERE creator_id = ? AND fan_id = ?', next.age, next.gender, next.source, next.lang, next.promise, u.name || null, Date.now(), cid, fanId);
      }
      for (const g of (Array.isArray(b.groups) ? b.groups : []).slice(0, 100)) {
        const l = one("SELECT id FROM fan_lists WHERE id = ? AND creator_id = ? AND kind = 'manual'", Number(g?.id), cid);
        if (!l) continue;
        if (g.on) run('INSERT OR IGNORE INTO fan_list_members (list_id, fan_id, added_at, added_by) VALUES (?, ?, ?, ?)', l.id, fanId, Date.now(), u.name || null);
        else run('DELETE FROM fan_list_members WHERE list_id = ? AND fan_id = ?', l.id, fanId);
      }
      forget(cid);
      send(res, 200, { ok: true });
    },

    // Mettre plusieurs fans dans un groupe manuel, ou les en retirer (`add: false`).
    'POST /api/v2/fans/members': async (req, res) => {
      const w = await writer(req, res);
      if (!w) return;
      const { u, b, cid } = w;
      const l = one("SELECT id, name FROM fan_lists WHERE id = ? AND creator_id = ? AND kind = 'manual'", Number(b.groupId), cid);
      const data = fanData(cid);
      const ids = [...new Set((Array.isArray(b.fanIds) ? b.fanIds : []).map(String))].filter((id) => data.has(id)).slice(0, 1000);
      if (!l || !ids.length) return send(res, 400, { error: 'Choisis des fans et un groupe manuel.' });
      for (const id of ids) {
        if (b.add === false) run('DELETE FROM fan_list_members WHERE list_id = ? AND fan_id = ?', l.id, id);
        else run('INSERT OR IGNORE INTO fan_list_members (list_id, fan_id, added_at, added_by) VALUES (?, ?, ?, ?)', l.id, id, Date.now(), u.name || null);
      }
      forget(cid);
      send(res, 200, { ok: ids.length, name: l.name });
    },
  };
}
