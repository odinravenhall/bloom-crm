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
export const CATS = {
  of: [['sub', 'Abonnements'], ['ppv', 'Messages payants'], ['tip', 'Pourboires'], ['post', 'Publications'], ['stream', 'Lives'], ['ref', 'Parrainages'], ['other', 'Autres']],
  mym: [['sub', 'Abonnements'], ['renew', 'Renouvellements'], ['ppv', 'Médias privés'], ['mod', 'Media on demand'], ['push', 'Médias push'], ['tip', 'Pourboires'], ['other', 'Autres']],
};
// « Qui a vendu » ne vaut que pour les contenus payants envoyés en message ; « meilleurs créneaux » y ajoute les pourboires.
const PAID = { of: new Set(['ppv']), mym: new Set(['ppv', 'mod', 'push']) };
export const SLOT = { of: new Set(['ppv', 'tip', 'post']), mym: new Set(['ppv', 'mod', 'push', 'tip']) };

/**
 * Qui a écrit un message ou fait une vente → { key, name, type }, la même clé sur tous les écrans de l'équipe.
 * `kind` = celui de `msg_log` (ou l'origine d'une vente) : « bloom » / « employee » (une personne, connue par son nom
 * seulement quand elle écrit depuis Bloom), « ai », « auto » / « script », sinon le compte de la modèle.
 * ⚠️ Côté OnlyFans « ai » est certain (Substy le dit). Côté MYM il est DÉDUIT (message pas parti de Bloom, sur un fan
 * dont l'IA est active) : ce peut être l'IA de Substy ou un autre outil, d'où « Hors Bloom » et le type « ext ».
 */
export function whoOf(pf, kind, name) {
  const human = kind === 'bloom' || kind === 'employee';
  if (human && name && name !== 'Bloom' && name !== 'Employé') return { key: `n:${name}`, name, type: 'human' };
  if (human) return { key: 'team', name: 'Équipe (sans nom)', type: 'human' };
  if (kind === 'ai') return pf === 'of' ? { key: 'ai', name: 'IA Substy', type: 'ai' } : { key: 'ai', name: 'Hors Bloom', type: 'ext' };
  if (kind === 'auto' || kind === 'script' || kind === 'substy') return { key: 'auto', name: 'Automatisation', type: 'auto' };
  return { key: 'creator', name: pf === 'of' ? 'Compte OnlyFans' : 'Compte MYM', type: 'creator' };
}
const NOBODY = { of: { key: 'none', name: 'Sans chatteur', type: 'none' }, mym: { key: 'none', name: 'Non attribué', type: 'none' } };
const PUSH = { key: 'push', name: 'Push MYM', type: 'auto' };

/**
 * Toutes les ventes de [pStart, end) ramenées à une même forme : { cid, at, cat, v (centimes), fan, name, who, wait,
 * renew, s }. `fan` = clé stable du fan pour compter les acheteurs, `name` = son nom affiché, `renew` = abonnement
 * OnlyFans renouvelé (la catégorie reste « sub » ; côté MYM le renouvellement est une catégorie à part).
 * `s` = qui a fait la vente (`whoOf`, ou le chatteur qu'Infloww lui attribue : clé « s:<id> », type « platform »).
 * `detail` : ajoute `id`, `fid` (identifiant du fan, pour retrouver sa conversation) et `mid` (message acheté).
 */
export function rowsOf(pf, list, pStart, start, end, gross, detail = false) {
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
      const sellers = new Map(all('SELECT id, name FROM rv_sellers').map((x) => [x.id, x.name]));
      const sql = detail
        ? `SELECT s.id, s.account, s.type, s.raw_type, s.gross, s.net, s.status, s.seller, s.origin, s.origin_by, s.at, s.fan_id, s.fan_name, l.message_id FROM rv_sales s LEFT JOIN rv_live l ON l.id = s.substy_id WHERE s.account IN (${ph}) AND s.at >= ? AND s.at < ?`
        : `SELECT account, type, raw_type, gross, net, status, seller, origin, origin_by, at, fan_id, fan_name FROM rv_sales WHERE account IN (${ph}) AND at >= ? AND at < ?`;
      for (const r of all(sql, ...acc.keys(), pStart, end)) {
        const v = gross ? r.gross : r.net;
        if (REFUND.test(r.status || '')) {
          if (r.at >= start) refunds += Math.abs(v);
          continue;
        }
        const cat = ['sub', 'ppv', 'tip', 'post', 'stream'].includes(r.type) ? r.type : /refer|parrain/i.test(r.raw_type || '') ? 'ref' : 'other';
        // Vente rapprochée d'une vente Substy : on sait qui a envoyé le message acheté (IA, quelqu'un dans Bloom, une
        // automatisation) ; sinon on garde le chatteur qu'Infloww lui attribue.
        const s = r.origin === 'ai' || r.origin === 'bloom' || r.origin === 'substy' ? whoOf('of', r.origin, r.origin_by) : r.seller ? { key: `s:${r.seller}`, name: sellers.get(r.seller) || 'Chatteur inconnu', type: 'platform' } : NOBODY.of;
        rows.push({ cid: acc.get(r.account), at: r.at, cat, v, fan: r.fan_id || r.fan_name || null, name: r.fan_name || null, who: r.origin === 'ai' ? 'ai' : r.origin === 'bloom' || r.seller ? 'team' : 'other', wait: false, renew: cat === 'sub' && /recurr|renew|rebill/i.test(r.raw_type || ''), s, ...(detail ? { id: r.id, fid: r.fan_id || null, mid: r.message_id || null } : null) });
      }
    }
    // Ventes Substy des dernières 24 h pas encore confirmées par Infloww (comme le dashboard actuel).
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      for (const l of all(`SELECT id, creator_id, type, gross, at, message_id, fan_id, fan_name FROM rv_live WHERE matched IS NULL AND creator_id IN (${ph}) AND at >= ? AND at < ? AND at > ?`, ...ids, start, end, Date.now() - DAY)) {
        if (/sub/i.test(l.type || '')) continue;
        const cat = /tip/i.test(l.type || '') ? 'tip' : /post/i.test(l.type || '') ? 'post' : 'ppv';
        const m = cat === 'ppv' && l.message_id ? one('SELECT kind, by_name FROM msg_log WHERE id = ?', l.message_id) : null;
        const k = m?.kind;
        const s = k === 'ai' || k === 'bloom' || k === 'employee' || k === 'auto' || k === 'script' ? whoOf('of', k, m.by_name) : NOBODY.of;
        rows.push({ cid: String(l.creator_id), at: l.at, cat, v: gross ? l.gross : Math.round(l.gross * 0.8), fan: l.fan_id || l.fan_name || null, name: l.fan_name || null, who: k === 'ai' ? 'ai' : k === 'bloom' || k === 'employee' ? 'team' : 'other', wait: true, renew: false, s, ...(detail ? { id: `live:${l.id}`, fid: l.fan_id || null, mid: l.message_id || null } : null) });
      }
    }
  } else {
    for (const c of list) {
      const cid = String(c.id);
      const first = firstSubs(cid);
      for (const r of all("SELECT id, type, raw, at, gross, fan_id, fan_name, origin, origin_by, attr_at, message_id FROM rv_live WHERE creator_id = ? AND src = 'mym' AND at >= ? AND at < ? AND type <> 'payout'", cid, pStart, end)) {
        if (r.type === 'refund' || r.gross < 0) {
          if (r.at >= start) refunds += Math.abs(r.gross);
          continue;
        }
        let cat = catOf(r);
        // Renouvellement = un abonnement d'un fan qui s'était déjà abonné avant (MYM ne fait pas la différence).
        if (cat === 'sub' && (first.get(String(r.fan_name || r.fan_id || '').toLowerCase()) ?? r.at) < r.at) cat = 'renew';
        // Bloom ne cherche l'auteur que des contenus privés et des pourboires des 14 derniers jours (mymincome.mjs) ;
        // un média push est vendu par le push lui-même, pas par un chatteur.
        const s = cat === 'push' ? PUSH : r.attr_at == null || !r.origin ? NOBODY.mym : whoOf('mym', r.origin, r.origin_by);
        rows.push({ cid, at: r.at, cat, v: r.gross, fan: r.fan_name || r.fan_id || null, name: r.fan_name || null, who: r.origin === 'ai' ? 'ai' : r.origin === 'bloom' ? 'team' : 'other', wait: false, renew: false, s, ...(detail ? { id: String(r.id), fid: /-/.test(r.fan_id || '') ? r.fan_id : null, mid: r.message_id || null } : null) });
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

// Les calculs relisent toutes les ventes de la période (et de celle d'avant) : chaque résultat est gardé 20 s, pour que
// plusieurs personnes sur un écran — ou son rafraîchissement automatique — ne le refassent pas à chaque fois.
const cache = new Map();
export function cached(key, make) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.data;
  const data = make();
  if (cache.size > 400) cache.clear();
  cache.set(key, { at: Date.now(), data });
  return data;
}
/** `v2Stats` avec sa mémoire de 20 s (clé = plateforme, brut ou net, période, modèles). */
export const statsCached = ({ pf, list, from, to, gross }) => cached(`stats|${pf}|${!!gross}|${from}|${to}|${list.map((c) => c.id).join(',')}`, () => v2Stats({ pf, list, from, to, gross }));

/**
 * Ce que toutes les routes de chiffres de la v2 lisent dans l'adresse : la plateforme que l'écran AFFICHE (« pf », sinon
 * celle du menu : le cookie est commun à tous les onglets, un deuxième onglet resté sur l'autre plateforme recevrait
 * sinon les mauvais chiffres sous le bon titre), la période (jours de Paris, 400 jours au plus), les modèles que la
 * personne voit sur cette plateforme (avec leur surnom), et « brut » (OnlyFans seulement).
 */
export function askOf(u, req, creators) {
  const p = new URL(req.url, 'http://x').searchParams;
  const today = parisDay(Date.now());
  const ok = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);
  let to = ok(p.get('to')) || today;
  let from = ok(p.get('from')) || to;
  if (to > today) to = today;
  if (from > to) from = to;
  if (Date.parse(to) - Date.parse(from) > 400 * DAY) from = addDay(to, -400);
  const asked = p.get('pf');
  const pf = asked === 'of' || asked === 'mym' ? asked : u.pf === 'mym' ? 'mym' : 'of';
  // `canSee` ne garde que les modèles de la plateforme choisie (et, côté MYM, les comptes reliés).
  const meta = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [String(m.creator_id), m.nickname]));
  const mine = creators().filter((c) => canSee({ ...u, pf }, c.id)).map((c) => ({ ...c, name: meta.get(String(c.id)) || c.name }));
  return { p, pf, from, to, today, mine, gross: pf === 'of' && p.get('mode') === 'gross' };
}

export function v2StatsRoutes({ userFrom, send, creators }) {
  return {
    // Chiffres d'une plateforme : ?pf=of|mym (sinon celle du menu), ?from=&to= (jours de Paris), &creatorId= (une seule
    // modèle), &mode=gross (OnlyFans).
    'GET /api/v2/stats': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' });
      const { p, pf, from, to, today, mine, gross } = askOf(u, req, creators);
      const only = p.get('creatorId') || '';
      const list = mine.filter((c) => !only || String(c.id) === only);
      send(res, 200, { ...statsCached({ pf, list, from, to, gross }), today, all: mine.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null })) });
    },
  };
}
