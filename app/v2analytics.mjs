// Bloom v2 → Analytique : l'analyse d'UNE modèle, le même écran pour OnlyFans et MYM (25/11/2026, « Constellation »).
// Il remplace, dans la v2, la copie de la page « Analytique » de MyPulse (MymAnalytics) et celle des « Creator reports »
// d'Infloww (ofreports.mjs). Chiffres = l'argent de l'agence ; Analytique = comprendre une modèle :
//  - d'où vient l'argent : types de vente comparés à la période d'avant, par jour, et par heure de Paris ;
//  - qui achète : acheteurs nouveaux ou déjà connus, meilleurs acheteurs ;
//  - les abonnés : nouveaux, renouvellements, actifs (MYM) ;
//  - ce que fait la messagerie : messages et contenus payants envoyés, achetés, temps de réponse, par auteur ;
//  - le détail jour par jour.
// Les ventes viennent de `rowsOf` (v2stats.mjs) : mêmes sources et mêmes règles que Chiffres, donc mêmes totaux.
// Les messages viennent de `msg_log` (ce que Bloom a vu passer, gardé 120 jours). Montants en CENTIMES de la devise de
// la plateforme ; jours et heures de Paris.
import { all, db, one } from './store.mjs';
import { isBoss } from './team.mjs';
import { parisMidnight } from './revenue.mjs';
import { subsOf } from './mymstats.mjs';
import { newSubsFor } from './ofreports.mjs';
import { CATS, SLOT, askOf, cached, rowsOf, statsCached } from './v2stats.mjs';

const DAY = 864e5;
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * Premier achat CONNU de chaque fan d'une modèle (clé du fan → heure), gardé 2 minutes. La clé est celle de `rowsOf`.
 * « Connu » : Bloom n'a pas les ventes d'avant le début de son historique (un an côté OnlyFans, moins côté MYM).
 */
const firstCache = new Map();
function firstBuys(pf, cid) {
  const key = `${pf}:${cid}`;
  const hit = firstCache.get(key);
  if (hit && Date.now() - hit.at < 120_000) return hit.m;
  const m = new Map();
  if (pf === 'of') {
    const accs = all('SELECT creator_id, account FROM rv_map WHERE account IS NOT NULL').filter((x) => String(x.creator_id) === cid).map((x) => x.account);
    if (accs.length) {
      for (const r of all(`SELECT COALESCE(NULLIF(fan_id, ''), fan_name) AS k, MIN(at) AS t FROM rv_sales WHERE account IN (${accs.map(() => '?').join(',')}) AND gross > 0 GROUP BY 1`, ...accs)) if (r.k != null) m.set(String(r.k), r.t);
    }
  } else {
    for (const r of all("SELECT COALESCE(NULLIF(fan_name, ''), fan_id) AS k, MIN(at) AS t FROM rv_live WHERE creator_id = ? AND src = 'mym' AND gross > 0 AND type NOT IN ('payout', 'refund') GROUP BY 1", cid)) if (r.k != null) m.set(String(r.k), r.t);
  }
  if (firstCache.size > 200) firstCache.clear();
  firstCache.set(key, { at: Date.now(), m });
  return m;
}

// Qui a écrit un message de `msg_log` : l'IA (déduite côté MYM), l'équipe depuis Bloom, une automatisation, ou le compte
// de la modèle (tout ce qui est écrit ailleurs que dans Bloom).
const GROUPS = [['team', 'Chatteurs'], ['ai', 'IA'], ['auto', 'Automatisations'], ['creator', 'Compte de la modèle']];
const groupOf = (k) => (k === 'ai' ? 'ai' : k === 'bloom' || k === 'employee' ? 'team' : k === 'auto' || k === 'script' ? 'auto' : 'creator');

/** Messages envoyés aux fans d'une modèle sur [a, b) : total et par auteur. */
function chatOf(cid, a, b) {
  const by = new Map(GROUPS.map(([key, label]) => [key, { key, label, sent: 0, ppv: 0, bought: 0, replySum: 0, replies: 0 }]));
  for (const r of all("SELECT kind, COUNT(*) AS sent, SUM(price > 0) AS ppv, SUM(price > 0 AND paid = 1) AS bought, SUM(reply_ms) AS replySum, COUNT(reply_ms) AS replies FROM msg_log WHERE creator_id = ? AND from_fan = 0 AND deleted = 0 AND at >= ? AND at < ? GROUP BY 1", cid, a, b)) {
    const g = by.get(groupOf(r.kind));
    g.sent += r.sent || 0;
    g.ppv += r.ppv || 0;
    g.bought += r.bought || 0;
    g.replySum += r.replySum || 0;
    g.replies += r.replies || 0;
  }
  const list = [...by.values()];
  const sum = (k) => list.reduce((x, g) => x + g[k], 0);
  const replies = sum('replies');
  return {
    sent: sum('sent'),
    ppv: sum('ppv'),
    bought: sum('bought'),
    reply: replies ? Math.round(sum('replySum') / replies) : null,
    fans: one('SELECT COUNT(DISTINCT fan_id) AS n FROM msg_log WHERE creator_id = ? AND from_fan = 0 AND deleted = 0 AND at >= ? AND at < ?', cid, a, b)?.n || 0,
    by: list.map(({ replySum, replies: n, ...g }) => ({ ...g, reply: n ? Math.round(replySum / n) : null })),
  };
}

export function v2Analytics({ pf, creator, from, to, gross }) {
  const cid = String(creator.id);
  const days = [];
  for (let d = from; d <= to; d = addDay(d, 1)) days.push(d);
  const len = days.length;
  // Comme `v2Stats` : la période d'avant (même durée) puis la période, un minuit de Paris par jour.
  const span = [];
  for (let d = addDay(from, -len); d <= to; d = addDay(d, 1)) span.push(d);
  const mid = span.map(parisMidnight);
  mid.push(parisMidnight(addDay(to, 1)));
  const idxOf = (at) => {
    let lo = 0;
    let hi = mid.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (mid[m] <= at) lo = m;
      else hi = m;
    }
    return lo;
  };
  const pStart = mid[0];
  const start = mid[len];
  const end = mid[mid.length - 1];
  const g = pf === 'of' && !!gross;
  const { rows, refunds, unmapped } = rowsOf(pf, [creator], pStart, start, end, g);
  const first = firstBuys(pf, cid);

  const cats = new Map(CATS[pf].map(([key, label]) => [key, { key, label, total: 0, prev: 0, n: 0, free: 0 }]));
  const perDay = days.map((day) => ({ day, total: 0, n: 0, buyers: 0, cats: {}, newSubs: 0, renewals: 0, sent: null, ppv: null, bought: null, subs: null, subsEst: false }));
  const dayBuyers = days.map(() => new Set());
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, sum: 0, n: 0 }));
  const fans = new Map(); // acheteurs de la période : clé → { name, total, n }
  const prevFans = new Set();
  const subs = { fresh: 0, freshPrev: 0, renewals: 0, renewalsPrev: 0 };
  let total = 0;
  let prev = 0;
  let provisional = 0;
  let sales = 0;
  let prevSales = 0;
  for (const r of rows) {
    const i = idxOf(r.at);
    const c = cats.get(r.cat) || cats.get('other');
    const isSub = r.cat === 'sub' || r.cat === 'renew';
    const isRenew = r.cat === 'renew' || r.renew;
    if (i < len) {
      // période d'avant
      prev += r.v;
      c.prev += r.v;
      if (isSub) isRenew ? subs.renewalsPrev++ : subs.freshPrev++;
      if (r.v > 0) {
        prevSales++;
        if (r.fan) prevFans.add(String(r.fan));
      }
      continue;
    }
    const d = perDay[i - len];
    if (!d) continue;
    total += r.v;
    d.total += r.v;
    d.cats[r.cat] = (d.cats[r.cat] || 0) + r.v;
    c.total += r.v;
    if (r.wait) provisional += r.v;
    if (isSub) {
      if (isRenew) subs.renewals++, d.renewals++;
      else subs.fresh++, d.newSubs++;
    }
    // Comme dans Chiffres : une ligne à 0 (abonnement gratuit) n'est pas une vente.
    if (!(r.v > 0)) {
      c.free++;
      continue;
    }
    sales++;
    d.n++;
    c.n++;
    if (SLOT[pf].has(r.cat)) {
      const h = hours[Math.max(0, Math.min(23, Math.floor((r.at - mid[i]) / 3600_000)))];
      h.sum += r.v;
      h.n++;
    }
    if (r.fan) {
      const k = String(r.fan);
      dayBuyers[i - len].add(k);
      const f = fans.get(k) || { name: r.name || k, total: 0, n: 0 };
      f.total += r.v;
      f.n++;
      fans.set(k, f);
    }
  }
  perDay.forEach((d, i) => (d.buyers = dayBuyers[i].size));

  // Acheteurs « nouveaux » = premier achat connu pendant la période ; « déjà connus » = ils avaient acheté avant.
  // (Vente des dernières 24 h pas encore confirmée : fan inconnu de l'historique, compté comme nouveau.)
  const fresh = { n: 0, total: 0 };
  const loyal = { n: 0, total: 0 };
  const top = [];
  for (const [k, f] of fans) {
    const isNew = (first.get(k) ?? start) >= start;
    const side = isNew ? fresh : loyal;
    side.n++;
    side.total += f.total;
    top.push({ name: f.name, total: f.total, n: f.n, fresh: isNew });
  }
  top.sort((a, b) => b.total - a.total || b.n - a.n);
  let since = null;
  for (const t of first.values()) if (since == null || t < since) since = t;

  // MYM : abonnés actifs par jour (relevés de Bloom, estimés avant le premier relevé).
  let active = null;
  let activeStart = null;
  let est = false;
  if (pf === 'mym') {
    const at = new Map(perDay.map((d) => [d.day, d]));
    for (const [day, x] of subsOf(cid, from, to)) {
      const d = at.get(day);
      if (!d || x.subs == null) continue;
      d.subs = x.subs;
      d.subsEst = !!x.subsEst;
      if (x.subsEst) est = true;
    }
    for (const d of perDay) {
      if (d.subs == null) continue;
      if (activeStart == null) activeStart = d.subs;
      active = d.subs;
    }
  }

  // Messagerie : ce que Bloom a vu passer (rien avant le premier message connu de cette modèle).
  const chatSince = one('SELECT MIN(at) AS t FROM msg_log WHERE creator_id = ?', cid)?.t ?? null;
  let chat = null;
  if (chatSince != null && chatSince < end) {
    const cur = chatOf(cid, start, end);
    const before = chatSince < start ? chatOf(cid, pStart, start) : null;
    // La période d'avant n'est comparable que si Bloom voyait déjà les messages à son début.
    const comparable = chatSince <= pStart;
    chat = { since: chatSince, partial: chatSince > start, ...cur, prev: comparable && before ? { sent: before.sent, ppv: before.ppv, bought: before.bought, reply: before.reply, fans: before.fans } : null };
    const q = db.prepare('SELECT COUNT(*) AS sent, SUM(price > 0) AS ppv, SUM(price > 0 AND paid = 1) AS bought FROM msg_log WHERE creator_id = ? AND from_fan = 0 AND deleted = 0 AND at >= ? AND at < ?');
    perDay.forEach((d, i) => {
      const a = mid[len + i];
      const b = mid[len + i + 1];
      if (b <= chatSince) return;
      const r = q.get(cid, a, b);
      d.sent = r?.sent || 0;
      d.ppv = r?.ppv || 0;
      d.bought = r?.bought || 0;
    });
  }

  return {
    model: { id: cid, name: creator.name, avatar: creator.avatar || null, since },
    total,
    prev,
    provisional,
    refunds,
    sales,
    prevSales,
    buyers: fans.size,
    prevBuyers: prevFans.size,
    cats: [...cats.values()],
    days: perDay,
    hours,
    fans: { fresh, loyal, top: top.slice(0, 10), shortHistory: since == null || since > start - 30 * DAY },
    // OnlyFans : seuls les abonnements PAYANTS sont des ventes (les nouveaux abonnés, gratuits compris, sont comptés
    // par Substy : route à part). MYM : tous les abonnements, gratuits compris.
    subs: { ...subs, active, activeStart, est, paidOnly: pf === 'of' },
    chat,
    unmapped: unmapped.length > 0,
  };
}

export function v2AnalyticsRoutes({ userFrom, send, creators, substy }) {
  const auth = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    return u;
  };
  return {
    // L'analyse d'une modèle : ?pf=of|mym, ?from=&to= (jours de Paris), &creatorId= (sinon la première du classement),
    // &mode=gross (OnlyFans). `list` = le classement de toutes les modèles visibles sur la période (colonne de l'écran).
    'GET /api/v2/analytics': (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const { p, pf, from, to, today, mine, gross } = askOf(u, req, creators);
      // Le classement vient du calcul de Chiffres, déjà en mémoire la plupart du temps.
      const stats = statsCached({ pf, list: mine, from, to, gross });
      const asked = p.get('creatorId') || '';
      const creator = mine.find((c) => String(c.id) === asked) || mine.find((c) => String(c.id) === stats.models[0]?.id) || null;
      const base = { platform: pf, currency: stats.currency, mode: stats.mode, canGross: stats.canGross, from, to, today, all: mine.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null })), list: stats.models };
      if (!creator) return send(res, 200, { ...base, model: null });
      send(res, 200, { ...base, ...cached(`ana|${pf}|${gross}|${from}|${to}|${creator.id}`, () => v2Analytics({ pf, creator, from, to, gross })) });
    },
    // Nouveaux abonnés OnlyFans sur la période et celle d'avant : comptés par Substy (un abonnement gratuit n'est pas
    // une vente chez Infloww). À part, car la réponse de Substy peut prendre plusieurs secondes. `null` = inconnu.
    'GET /api/v2/analytics/subs': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const { p, pf, from, to, mine } = askOf(u, req, creators);
      const c = mine.find((x) => String(x.id) === (p.get('creatorId') || ''));
      if (pf !== 'of' || !c || !substy) return send(res, 200, { v: null, prev: null });
      const got = await newSubsFor(substy, [c.id], from, to).catch(() => null);
      const x = got?.get(c.id);
      send(res, 200, { v: x?.v ?? null, prev: x?.prev ?? null });
    },
  };
}
