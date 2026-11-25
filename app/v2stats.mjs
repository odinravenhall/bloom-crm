// Bloom v2 → Chiffres : UN seul écran pour OnlyFans et MYM (25/11/2026, design « Constellation »).
// Il remplace, dans la v2, la copie de la « Vue d'ensemble » de MyPulse (mymstats.mjs) et celle du dashboard d'Infloww
// (ofdash.mjs). Les SOURCES ne changent pas, pour que les totaux restent ceux des anciens écrans :
//  - OnlyFans : les ventes lues chez Infloww (`rv_sales`) des comptes rapprochés des modèles de Substy, en dollars, en
//    net ou en brut, plus les ventes Substy des dernières 24 h pas encore confirmées (« en attente », net = 80 %) ;
//  - MYM : les revenus lus chez MYM en direct (`rv_live`, src = 'mym'), en euros, toujours NETS (MYM ne montre que ça).
// Ce qui est commun : une même forme de réponse (jours, types de vente, modèles, qui a vendu, créneaux), des montants en
// CENTIMES dans la devise de la plateforme. Les remboursements sont comptés à part, jamais dans le chiffre d'affaires.
// Jours = jours de Paris. La plateforme est celle choisie dans le menu (cookie `bloom_pf`, lu par `userFrom`).
import { all, one } from './store.mjs';
import { canSee, isBoss } from './team.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';
import { catOf, firstSubs, subsOf } from './mymstats.mjs';

const DAY = 864e5;
const REFUND = /refund|chargeback|revers|rembours|annul|^undo$/i; // Infloww : « undo » = remboursée
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
// Les types de vente de chaque plateforme, dans l'ordre d'affichage. Mêmes cartes à l'écran, vocabulaire de la plateforme.
const CATS = {
  of: [['sub', 'Abonnements'], ['ppv', 'Messages payants'], ['tip', 'Pourboires'], ['post', 'Publications'], ['stream', 'Lives'], ['ref', 'Parrainages'], ['other', 'Autres']],
  mym: [['sub', 'Abonnements'], ['renew', 'Renouvellements'], ['ppv', 'Médias privés'], ['mod', 'Media on demand'], ['push', 'Médias push'], ['tip', 'Pourboires'], ['other', 'Autres']],
};
// « Qui a vendu » ne vaut que pour les contenus payants envoyés en message ; « meilleurs créneaux » y ajoute les pourboires.
const PAID = { of: new Set(['ppv']), mym: new Set(['ppv', 'mod', 'push']) };
const SLOT = { of: new Set(['ppv', 'tip', 'post']), mym: new Set(['ppv', 'mod', 'push', 'tip']) };

/** Toutes les ventes de [pStart, end) ramenées à une même forme : { cid, at, cat, v (centimes), fan, who, wait }. */
function rowsOf(pf, list, pStart, start, end, gross) {
  const rows = [];
  let refunds = 0;
  const unmapped = [];
  if (pf === 'of') {
    const ids = list.map((c) => String(c.id));
    const maps = all('SELECT creator_id, account FROM rv_map WHERE account IS NOT NULL').filter((m) => ids.includes(String(m.creator_id)));
    const acc = new Map(maps.map((m) => [m.account, String(m.creator_id)]));
    for (const c of list) if (![...acc.values()].includes(String(c.id))) unmapped.push(c.name);
    if (acc.size) {
      const ph = [...acc.keys()].map(() => '?').join(',');
      for (const r of all(`SELECT account, type, raw_type, gross, net, status, seller, origin, at, fan_id, fan_name FROM rv_sales WHERE account IN (${ph}) AND at >= ? AND at < ?`, ...acc.keys(), pStart, end)) {
        const v = gross ? r.gross : r.net;
        if (REFUND.test(r.status || '')) {
          if (r.at >= start) refunds += Math.abs(v);
          continue;
        }
        const cat = ['sub', 'ppv', 'tip', 'post', 'stream'].includes(r.type) ? r.type : /refer|parrain/i.test(r.raw_type || '') ? 'ref' : 'other';
        rows.push({ cid: acc.get(r.account), at: r.at, cat, v, fan: r.fan_id || r.fan_name || null, who: r.origin === 'ai' ? 'ai' : r.origin === 'bloom' || r.seller ? 'team' : 'other', wait: false });
      }
    }
    // Ventes Substy des dernières 24 h pas encore confirmées par Infloww (comme le dashboard actuel).
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      for (const l of all(`SELECT creator_id, type, gross, at, message_id, fan_id, fan_name FROM rv_live WHERE matched IS NULL AND creator_id IN (${ph}) AND at >= ? AND at < ? AND at > ?`, ...ids, start, end, Date.now() - DAY)) {
        if (/sub/i.test(l.type || '')) continue;
        const cat = /tip/i.test(l.type || '') ? 'tip' : /post/i.test(l.type || '') ? 'post' : 'ppv';
        const k = cat === 'ppv' && l.message_id ? one('SELECT kind FROM msg_log WHERE id = ?', l.message_id)?.kind : null;
        rows.push({ cid: String(l.creator_id), at: l.at, cat, v: gross ? l.gross : Math.round(l.gross * 0.8), fan: l.fan_id || l.fan_name || null, who: k === 'ai' ? 'ai' : k === 'bloom' || k === 'employee' ? 'team' : 'other', wait: true });
      }
    }
  } else {
    for (const c of list) {
      const cid = String(c.id);
      const first = firstSubs(cid);
      for (const r of all("SELECT type, raw, at, gross, fan_id, fan_name, origin FROM rv_live WHERE creator_id = ? AND src = 'mym' AND at >= ? AND at < ? AND type <> 'payout'", cid, pStart, end)) {
        if (r.type === 'refund' || r.gross < 0) {
          if (r.at >= start) refunds += Math.abs(r.gross);
          continue;
        }
        let cat = catOf(r);
        // Renouvellement = un abonnement d'un fan qui s'était déjà abonné avant (MYM ne fait pas la différence).
        if (cat === 'sub' && (first.get(String(r.fan_name || r.fan_id || '').toLowerCase()) ?? r.at) < r.at) cat = 'renew';
        rows.push({ cid, at: r.at, cat, v: r.gross, fan: r.fan_name || r.fan_id || null, who: r.origin === 'ai' ? 'ai' : r.origin === 'bloom' ? 'team' : 'other', wait: false });
      }
    }
  }
  return { rows, refunds, unmapped };
}

export function v2Stats({ pf, list, from, to, gross }) {
  const days = [];
  for (let d = from; d <= to; d = addDay(d, 1)) days.push(d);
  const len = days.length;
  // Période d'avant (même durée) + période demandée : minuit de Paris de chaque jour, pour ranger une vente sans
  // convertir sa date une par une.
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
  const start = mid[len];
  const end = mid[mid.length - 1];
  const g = pf === 'of' && !!gross;
  const { rows, refunds, unmapped } = rowsOf(pf, list, mid[0], start, end, g);

  const cats = new Map(CATS[pf].map(([key, label]) => [key, { key, label, total: 0, n: 0, free: 0 }]));
  const perDay = days.map((day) => ({ day, total: 0, prev: 0, n: 0, wait: 0, cats: {}, models: {}, subs: null, subsEst: false }));
  const models = new Map(list.map((c) => [String(c.id), { id: String(c.id), name: c.name, avatar: c.avatar || null, total: 0, prev: 0, sales: 0 }]));
  const who = { ai: 0, team: 0, other: 0 };
  const buyers = new Set();
  const slots = new Map();
  let total = 0;
  let prev = 0;
  let provisional = 0;
  let sales = 0;
  for (const r of rows) {
    const i = idxOf(r.at);
    const m = models.get(r.cid);
    if (i < len) {
      // période d'avant
      prev += r.v;
      perDay[i].prev += r.v;
      if (m) m.prev += r.v;
      continue;
    }
    const d = perDay[i - len];
    if (!d) continue;
    total += r.v;
    d.total += r.v;
    d.cats[r.cat] = (d.cats[r.cat] || 0) + r.v;
    d.models[r.cid] = (d.models[r.cid] || 0) + r.v;
    if (r.wait) (d.wait += r.v), (provisional += r.v);
    const c = cats.get(r.cat) || cats.get('other');
    c.total += r.v;
    if (m) m.total += r.v;
    // Une ligne à 0 (abonnement gratuit, très courant sur MYM) n'est pas une VENTE : elle est comptée à part (`free`),
    // sinon le nombre de ventes, d'acheteurs et le panier moyen ne veulent plus rien dire.
    if (r.v > 0) {
      sales++;
      d.n++;
      c.n++;
      if (m) m.sales++;
      if (r.fan) buyers.add(`${r.cid}:${r.fan}`);
    } else c.free++;
    if (PAID[pf].has(r.cat)) who[r.who] += r.v;
    if (SLOT[pf].has(r.cat) && r.v > 0) {
      const wd = new Date(`${d.day}T12:00:00Z`).getUTCDay(); // 0 = dimanche
      const h = Math.max(0, Math.min(23, Math.floor((r.at - mid[i]) / 3600_000)));
      const k = wd * 24 + h;
      const s = slots.get(k) || { d: wd, h, sum: 0, n: 0 };
      s.sum += r.v;
      s.n++;
      slots.set(k, s);
    }
  }
  // MYM : abonnés actifs par jour (relevés de Bloom, estimés avant le premier relevé), additionnés sur les modèles choisies.
  if (pf === 'mym') {
    const at = new Map(perDay.map((d) => [d.day, d]));
    for (const c of list) {
      for (const [day, x] of subsOf(String(c.id), from, to)) {
        const d = at.get(day);
        if (!d || x.subs == null) continue;
        d.subs = (d.subs || 0) + x.subs;
        if (x.subsEst) d.subsEst = true;
      }
    }
  }
  return {
    platform: pf,
    currency: pf === 'of' ? 'USD' : 'EUR',
    mode: g ? 'gross' : 'net',
    canGross: pf === 'of',
    from,
    to,
    total,
    prev,
    provisional,
    refunds,
    sales,
    buyers: buyers.size,
    cats: [...cats.values()],
    days: perDay,
    models: [...models.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'fr')),
    who,
    slots: [...slots.values()],
    unmapped,
  };
}

export function v2StatsRoutes({ userFrom, send, creators }) {
  // Le calcul relit toutes les ventes de la période (et de celle d'avant) : le résultat est gardé 20 s, pour que
  // plusieurs personnes sur l'écran — ou son rafraîchissement automatique — ne le refassent pas à chaque fois.
  const cache = new Map();
  const cached = (key, make) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 20_000) return hit.data;
    const data = make();
    if (cache.size > 300) cache.clear();
    cache.set(key, { at: Date.now(), data });
    return data;
  };
  return {
    // Chiffres d'une plateforme : ?pf=of|mym (sinon celle du menu), ?from=&to= (jours de Paris), &creatorId= (une seule
    // modèle), &mode=gross (OnlyFans).
    'GET /api/v2/stats': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' });
      const p = new URL(req.url, 'http://x').searchParams;
      const today = parisDay(Date.now());
      const ok = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);
      let to = ok(p.get('to')) || today;
      let from = ok(p.get('from')) || to;
      if (to > today) to = today;
      if (from > to) from = to;
      if (Date.parse(to) - Date.parse(from) > 400 * DAY) from = addDay(to, -400);
      // La plateforme est celle que l'écran AFFICHE (« pf » dans l'adresse) : le cookie du menu est commun à tous les
      // onglets, un deuxième onglet resté sur l'autre plateforme recevrait sinon les mauvais chiffres sous le bon titre.
      const asked = p.get('pf');
      const pf = asked === 'of' || asked === 'mym' ? asked : u.pf === 'mym' ? 'mym' : 'of';
      // `canSee` ne garde que les modèles de la plateforme choisie (et, côté MYM, les comptes reliés).
      const mine = creators().filter((c) => canSee({ ...u, pf }, c.id));
      const only = p.get('creatorId') || '';
      const list = mine.filter((c) => !only || String(c.id) === only);
      const meta = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [String(m.creator_id), m.nickname]));
      const named = (c) => ({ ...c, name: meta.get(String(c.id)) || c.name });
      const gross = pf === 'of' && p.get('mode') === 'gross';
      const stats = cached(`${pf}|${gross}|${from}|${to}|${list.map((c) => c.id).join(',')}`, () => v2Stats({ pf, list: list.map(named), from, to, gross }));
      send(res, 200, { ...stats, today, all: mine.map(named).map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null })) });
    },
  };
}
