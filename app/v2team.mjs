// Bloom v2 → Équipe : les écrans de pilotage de l'équipe, les mêmes pour OnlyFans et MYM (25/11/2026, « Constellation »).
// Ils remplacent, dans la v2, les copies de MyPulse (mymteam.mjs, mymmod.mjs) et d'Infloww (ofemployees.mjs, sentlog.mjs),
// qui restent dans la version actuelle. Rien n'est écrit ici : ces routes ne font que LIRE.
//
// Sources (ce que Bloom voit lui-même, jamais les rapports d'Infloww ou de MyPulse) :
//  - les ventes : `rowsOf` de v2stats.mjs, donc EXACTEMENT les ventes de l'écran Chiffres (Infloww `rv_sales` côté
//    OnlyFans, revenus lus chez MYM côté MYM), avec pour chacune « qui l'a faite » (`whoOf`) ;
//  - les messages : `msg_log`, tous les messages que Bloom a vus passer (120 jours), avec leur auteur quand il est connu.
// ⚠️ Bloom ne connaît le NOM d'un chatteur que pour ce qui part de Bloom. Un message écrit ailleurs est rangé sous
//    « IA Substy » (OnlyFans, certain), « Hors Bloom » (MYM : IA déduite ou autre outil), « Automatisation » ou le compte
//    de la modèle. Côté OnlyFans, une vente dont Bloom ne connaît pas l'auteur garde le chatteur qu'Infloww lui attribue
//    (type « platform ») : c'est la seule donnée d'Infloww utilisée ici, elle vient avec la vente.
import { all, one } from './store.mjs';
import { canSee, isBoss } from './team.mjs';
import { parisMidnight } from './revenue.mjs';
import { inboxChat, plain } from './chat.mjs';
import { askOf, cached, CATS, rowsOf, whoOf } from './v2stats.mjs';

const DAY = 864e5;
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
// Ce qu'un chatteur vend : les contenus payants envoyés en message et les pourboires. Les abonnements, publications
// et lives ne sont la vente de personne : ils restent dans Chiffres.
const SELL = { of: ['ppv', 'tip'], mym: ['ppv', 'mod', 'push', 'tip'] };
const REPLY_OK = 30 * 60_000; // une réponse donnée « pendant qu'on est là » : moins de 30 min après le fan

/** Les messages envoyés sur la période, par auteur (clé de `whoOf`) : de quoi juger l'efficacité de chacun. */
function messagesBy(pf, ids, start, end) {
  const out = new Map();
  if (!ids.length) return out;
  const ph = ids.map(() => '?').join(',');
  const rows = all(
    `SELECT m.kind, CASE WHEN m.kind IN ('bloom', 'employee') THEN m.by_name END AS name, COUNT(*) AS messages, SUM(m.price > 0) AS proposed, SUM(m.price > 0 AND m.paid = 1) AS bought,
       COUNT(DISTINCT m.creator_id || ':' || m.fan_id) AS fans, SUM(CASE WHEN m.reply_ms <= ${REPLY_OK} THEN m.reply_ms END) AS replySum, COUNT(CASE WHEN m.reply_ms <= ${REPLY_OK} THEN 1 END) AS replies
     FROM msg_log m WHERE m.from_fan = 0 AND m.deleted = 0 AND m.creator_id IN (${ph}) AND m.at >= ? AND m.at < ? GROUP BY 1, 2`,
    ...ids, start, end,
  );
  for (const r of rows) {
    const w = whoOf(pf, r.kind, r.name);
    const g = out.get(w.key) || { who: w, messages: 0, proposed: 0, bought: 0, fans: 0, replySum: 0, replies: 0 };
    g.messages += r.messages;
    g.proposed += r.proposed || 0;
    g.bought += r.bought || 0;
    g.fans += r.fans; // deux lignes regroupées (« auto » + « script ») : les fans s'additionnent (approximation)
    g.replySum += r.replySum || 0;
    g.replies += r.replies || 0;
    out.set(w.key, g);
  }
  return out;
}

/**
 * Qui a vendu quoi sur [from, to] (jours de Paris), avec la période d'avant (même durée). Montants en centimes, dans la
 * devise de la plateforme. `seller` : ne garder dans le détail (`rows`) que les ventes de ce vendeur.
 */
export function teamSales({ pf, list, from, to, gross, seller }) {
  const days = [];
  for (let d = from; d <= to; d = addDay(d, 1)) days.push(d);
  const len = days.length;
  const mids = days.map(parisMidnight);
  const start = mids[0];
  const end = parisMidnight(addDay(to, 1));
  mids.push(end);
  const dayOf = (at) => {
    let lo = 0;
    let hi = mids.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (mids[m] <= at) lo = m;
      else hi = m;
    }
    return lo;
  };
  const g = pf === 'of' && !!gross;
  const sell = new Set(SELL[pf]);
  const { rows, unmapped } = rowsOf(pf, list, parisMidnight(addDay(from, -len)), start, end, g, true);
  const names = new Map(list.map((c) => [String(c.id), c.name]));

  const by = new Map();
  const of = (s) => {
    let x = by.get(s.key);
    if (!x) by.set(s.key, (x = { key: s.key, name: s.name, type: s.type, total: 0, prev: 0, sales: 0, prevSales: 0, ppv: 0, ppvN: 0, tips: 0, tipsN: 0, best: 0, buyers: new Set(), models: new Map(), daily: new Array(len).fill(0) }));
    return x;
  };
  const cats = new Map(CATS[pf].filter(([k]) => sell.has(k)).map(([key, label]) => [key, { key, label, total: 0, n: 0, prev: 0, prevN: 0 }]));
  const cur = [];
  let total = 0;
  let prev = 0;
  let sales = 0;
  let prevSales = 0;
  let provisional = 0;
  for (const r of rows) {
    // Une ligne à 0 n'est pas une vente (même règle que Chiffres).
    if (!sell.has(r.cat) || !(r.v > 0)) continue;
    const x = of(r.s);
    const c = cats.get(r.cat);
    if (r.at < start) {
      prev += r.v;
      prevSales++;
      x.prev += r.v;
      x.prevSales++;
      c.prev += r.v;
      c.prevN++;
      continue;
    }
    total += r.v;
    sales++;
    if (r.wait) provisional += r.v;
    c.total += r.v;
    c.n++;
    x.total += r.v;
    x.sales++;
    if (r.cat === 'tip') (x.tips += r.v), x.tipsN++;
    else (x.ppv += r.v), x.ppvN++;
    if (r.v > x.best) x.best = r.v;
    if (r.fan) x.buyers.add(`${r.cid}:${r.fan}`);
    x.models.set(r.cid, (x.models.get(r.cid) || 0) + r.v);
    x.daily[dayOf(r.at)] += r.v;
    cur.push(r);
  }
  // Ce que chacun a écrit sur la période : un chatteur qui a beaucoup écrit sans rien vendre doit apparaître aussi.
  const ids = list.map((c) => String(c.id));
  const msgs = messagesBy(pf, ids, start, end);
  for (const m of msgs.values()) of(m.who);
  const rank = (field) => new Map([...by.values()].filter((x) => x[field] > 0).sort((a, b) => b[field] - a[field]).map((x, i) => [x.key, i + 1]));
  const now = rank('total');
  const old = rank('prev');
  const sellers = [...by.values()]
    .map((x) => {
      const m = msgs.get(x.key);
      return {
        key: x.key, name: x.name, type: x.type, rank: now.get(x.key) ?? null, prevRank: old.get(x.key) ?? null,
        total: x.total, prev: x.prev, sales: x.sales, prevSales: x.prevSales, ppv: x.ppv, ppvN: x.ppvN, tips: x.tips, tipsN: x.tipsN, best: x.best, buyers: x.buyers.size,
        models: [...x.models].map(([id, v]) => ({ id, name: names.get(id) || '', total: v })).sort((a, b) => b.total - a.total),
        daily: x.daily,
        messages: m?.messages ?? 0, proposed: m?.proposed ?? 0, bought: m?.bought ?? 0, fans: m?.fans ?? 0, replyMs: m?.replies ? Math.round(m.replySum / m.replies) : null,
      };
    })
    .sort((a, b) => b.total - a.total || b.prev - a.prev || b.messages - a.messages || a.name.localeCompare(b.name, 'fr'));
  const mine = seller ? cur.filter((r) => r.s.key === seller) : cur;
  mine.sort((a, b) => b.at - a.at);
  return {
    platform: pf, currency: pf === 'of' ? 'USD' : 'EUR', mode: g ? 'gross' : 'net', canGross: pf === 'of', from, to, days,
    total, prev, sales, prevSales, provisional, cats: [...cats.values()], sellers, unmapped,
    rows: mine.slice(0, 500).map((r) => ({ id: String(r.id), at: r.at, cid: r.cid, model: names.get(r.cid) || '', fan: r.name || 'Fan', fid: r.fid, cat: r.cat, v: r.v, wait: r.wait, seller: r.s, mid: r.mid })),
    rowsTotal: mine.length,
    // MYM : Bloom ne cherche l'auteur d'une vente que sur les 14 derniers jours ; avant, tout est « Non attribué ».
    attributedSince: pf === 'mym' ? Date.now() - 14 * DAY : null,
    // Bloom note les messages depuis cette date pour ces modèles (rien avant : pas de messages, pas de taux d'achat).
    msgSince: ids.length ? one(`SELECT MIN(at) AS t FROM msg_log WHERE creator_id IN (${ids.map(() => '?').join(',')})`, ...ids)?.t || null : null,
  };
}

export function v2TeamRoutes({ userFrom, send, creators }) {
  /** Team leader ou plus + ce que l'adresse demande (plateforme affichée, période, modèles visibles). */
  const scope = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    const x = askOf(u, req, creators);
    const only = x.p.get('creatorId') || '';
    return { u, ...x, only, list: x.mine.filter((c) => !only || String(c.id) === only), all: x.mine.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null })) };
  };

  return {
    // Ventes de l'équipe : ?pf=of|mym, ?from=&to= (jours de Paris), &creatorId= (une modèle), &mode=gross (OnlyFans),
    // &seller=<clé> (le détail des ventes d'un seul vendeur).
    'GET /api/v2/team/sales': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      const seller = x.p.get('seller') || '';
      const data = cached(`team-sales|${x.pf}|${x.gross}|${x.from}|${x.to}|${x.list.map((c) => c.id).join(',')}|${seller}`, () => teamSales({ pf: x.pf, list: x.list, from: x.from, to: x.to, gross: x.gross, seller }));
      send(res, 200, { ...data, today: x.today, all: x.all });
    },

    // Le fil autour d'un message ou d'une vente, tel que Bloom l'a noté (`msg_log`) : ?id=<message>, ou
    // ?creator=&fan=&at= ; 12 messages avant et 6 après, puis &dir=before|after pour en lire d'autres.
    'GET /api/v2/team/thread': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' });
      const p = new URL(req.url, 'http://x').searchParams;
      let cid = p.get('creator');
      let fid = p.get('fan');
      let at = Number(p.get('at')) || 0;
      const id = p.get('id');
      if (id) {
        const m = one('SELECT creator_id, fan_id, at FROM msg_log WHERE id = ?', id);
        if (m) (cid = m.creator_id), (fid = m.fan_id), (at = m.at);
      }
      // Le droit porte sur la MODÈLE (le cookie de plateforme du menu est commun à tous les onglets).
      const c = creators().find((x) => String(x.id) === String(cid || ''));
      if (!c || !fid || !canSee({ ...u, pf: null }, c.id)) return send(res, 404, { error: 'Conversation introuvable' });
      const pf = /mym/i.test(c.platform || '') ? 'mym' : 'of';
      const view = (m) => ({ id: m.id, at: m.at, fromFan: !!m.from_fan, text: m.text != null ? plain(m.text) : null, medias: m.medias || 0, price: m.price || 0, paid: !!m.paid, deleted: !!m.deleted, who: m.from_fan ? null : whoOf(pf, m.kind, m.by_name) });
      const cols = 'id, at, from_fan, text, medias, price, paid, deleted, kind, by_name';
      const dir = p.get('dir');
      const before = dir === 'after' ? [] : all(`SELECT ${cols} FROM msg_log WHERE creator_id = ? AND fan_id = ? AND at ${dir === 'before' ? '<' : '<='} ? ORDER BY at DESC LIMIT ?`, String(c.id), fid, at, dir === 'before' ? 15 : 13).reverse();
      const after = dir === 'before' ? [] : all(`SELECT ${cols} FROM msg_log WHERE creator_id = ? AND fan_id = ? AND at > ? ORDER BY at LIMIT ?`, String(c.id), fid, at, dir === 'after' ? 15 : 6);
      const meta = one('SELECT nickname FROM creator_meta WHERE creator_id = ?', String(c.id));
      send(res, 200, { platform: pf, currency: pf === 'of' ? 'USD' : 'EUR', creatorId: String(c.id), creator: meta?.nickname || c.name, fanId: fid, fan: inboxChat(String(c.id), fid)?.name || 'Fan', focus: id || null, at, messages: [...before, ...after].map(view) });
    },
  };
}
