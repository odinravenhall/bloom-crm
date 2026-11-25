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
import { all, one, run } from './store.mjs';
import { canSee, isBoss, liveView, seesAll } from './team.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';
import { inboxChat, plain } from './chat.mjs';
import { askOf, cached, CATS, rowsOf, whoOf } from './v2stats.mjs';
import { vacations } from './mymteam.mjs';
import { CATS as MOD_CATS, suspects } from './mymmod.mjs';
import { bannedCount } from './journal.mjs';

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

// ---------------------------------------------------------------- messages
const SLOW = 10 * 60_000; // une réponse « lente » : plus de 10 minutes après le fan
// Message parti d'un script : script de Substy, ou script de la bibliothèque de Bloom envoyé depuis la messagerie.
const SCRIPT = "(m.kind = 'script' OR EXISTS (SELECT 1 FROM sent_log s WHERE s.message_id = m.id AND s.lib_item IS NOT NULL))";
const HUMAN = "m.kind IN ('bloom', 'employee')";
/** Filtre SQL d'un auteur (clé de `whoOf`, ou « humans » = toutes les personnes de l'équipe). */
function senderSql(key) {
  if (key === 'humans') return [HUMAN, []];
  if (key === 'team') return [`${HUMAN} AND (m.by_name IS NULL OR m.by_name IN ('Bloom', 'Employé'))`, []];
  if (key === 'ai') return ["m.kind = 'ai'", []];
  if (key === 'auto') return ["m.kind IN ('auto', 'script', 'substy')", []];
  if (key === 'creator') return ["COALESCE(m.kind, 'creator') NOT IN ('bloom', 'employee', 'ai', 'auto', 'script', 'substy')", []];
  if (key?.startsWith('n:')) return [`${HUMAN} AND m.by_name = ?`, [key.slice(2)]];
  return [null, []];
}
const TYPES = {
  paid: 'm.price > 0',
  bought: 'm.price > 0 AND m.paid = 1',
  unbought: 'm.price > 0 AND COALESCE(m.paid, 0) = 0',
  free: 'm.medias > 0 AND m.price = 0',
  script: SCRIPT,
  slow: `m.reply_ms >= ${SLOW}`,
};

/**
 * Les messages envoyés aux fans sur [from, to] (jours de Paris), message par message, avec le résumé par auteur.
 * `q` : { sender, type, text, fan (« modèle~fan »), page, size, sort }. Prix dans la devise de la plateforme (unités).
 */
export function teamMessages({ pf, list, from, to, q }) {
  const start = parisMidnight(from);
  const end = parisMidnight(addDay(to, 1));
  const ids = list.map((c) => String(c.id));
  const names = new Map(list.map((c) => [String(c.id), c.name]));
  const size = [25, 50, 100, 200].includes(q.size) ? q.size : 50;
  const empty = { platform: pf, currency: pf === 'of' ? 'USD' : 'EUR', from, to, rows: [], total: 0, page: 1, pages: 1, size, kpi: { messages: 0, fans: 0, proposed: 0, bought: 0, boughtAmount: 0, free: 0, slow: 0, replyMs: null }, senders: [], since: null, fan: null };
  if (!ids.length) return empty;
  const base = ['m.from_fan = 0', `m.creator_id IN (${ids.map(() => '?').join(',')})`, 'm.at >= ?', 'm.at < ?'];
  const args = [...ids, start, end];
  // Les messages retirés chez le fan ne sont montrés que si on les demande.
  base.push(q.type === 'unsent' ? 'm.deleted = 1' : 'm.deleted = 0');
  if (TYPES[q.type]) base.push(TYPES[q.type]);
  const text = String(q.text || '').trim().toLowerCase().replace(/[%_]/g, '');
  if (text) base.push("LOWER(COALESCE(m.text, '')) LIKE ?"), args.push(`%${text}%`);
  let fan = null;
  if (String(q.fan || '').includes('~')) {
    const [cid, fid] = String(q.fan).split('~', 2);
    if (ids.includes(cid)) {
      base.push('m.creator_id = ? AND m.fan_id = ?');
      args.push(cid, fid);
      fan = { key: `${cid}~${fid}`, name: inboxChat(cid, fid)?.name || 'Fan' };
    }
  }
  // Résumé par auteur : sur la sélection, SANS le filtre d'auteur (il sert aussi à remplir ce filtre).
  const group = new Map();
  for (const r of all(
    `SELECT m.kind, CASE WHEN ${HUMAN} THEN m.by_name END AS name, COUNT(*) AS messages, COUNT(DISTINCT m.creator_id || ':' || m.fan_id) AS fans, SUM(m.price > 0) AS proposed, SUM(m.price > 0 AND m.paid = 1) AS bought,
       SUM(CASE WHEN m.paid = 1 THEN m.price ELSE 0 END) AS amount, SUM(m.medias > 0 AND m.price = 0) AS free, SUM(m.reply_ms >= ${SLOW}) AS slow,
       SUM(CASE WHEN m.reply_ms <= ${REPLY_OK} THEN m.reply_ms END) AS replySum, COUNT(CASE WHEN m.reply_ms <= ${REPLY_OK} THEN 1 END) AS replies
     FROM msg_log m WHERE ${base.join(' AND ')} GROUP BY 1, 2`, ...args)) {
    const w = whoOf(pf, r.kind, r.name);
    const g = group.get(w.key) || { ...w, messages: 0, fans: 0, proposed: 0, bought: 0, boughtAmount: 0, free: 0, slow: 0, replySum: 0, replies: 0 };
    g.messages += r.messages;
    g.fans += r.fans; // lignes regroupées : les fans s'additionnent (approximation)
    g.proposed += r.proposed || 0;
    g.bought += r.bought || 0;
    g.boughtAmount += Math.round((r.amount || 0) * 100);
    g.free += r.free || 0;
    g.slow += r.slow || 0;
    g.replySum += r.replySum || 0;
    g.replies += r.replies || 0;
    group.set(w.key, g);
  }
  const senders = [...group.values()].map(({ replySum, replies, ...g }) => ({ ...g, replyMs: replies ? Math.round(replySum / replies) : null })).sort((a, b) => b.messages - a.messages);
  const [ss, sa] = senderSql(q.sender);
  if (ss) base.push(ss), args.push(...sa);
  const where = base.join(' AND ');
  const k = one(
    `SELECT COUNT(*) AS messages, COUNT(DISTINCT m.creator_id || ':' || m.fan_id) AS fans, SUM(m.price > 0) AS proposed, SUM(m.price > 0 AND m.paid = 1) AS bought, SUM(CASE WHEN m.paid = 1 THEN m.price ELSE 0 END) AS amount,
       SUM(m.medias > 0 AND m.price = 0) AS free, SUM(m.reply_ms >= ${SLOW}) AS slow, SUM(CASE WHEN m.reply_ms <= ${REPLY_OK} THEN m.reply_ms END) AS replySum, COUNT(CASE WHEN m.reply_ms <= ${REPLY_OK} THEN 1 END) AS replies
     FROM msg_log m WHERE ${where}`, ...args);
  const total = k.messages || 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.max(1, q.page || 1));
  const order = q.sort === 'slow' ? 'm.reply_ms DESC NULLS LAST, m.at DESC' : q.sort === 'price' ? 'm.price DESC, m.at DESC' : 'm.at DESC';
  const rows = all(`SELECT m.id, m.creator_id, m.fan_id, m.at, m.text, m.medias, m.price, m.paid, m.kind, m.by_name, m.reply_ms, m.reply_text, m.deleted, ${SCRIPT} AS is_script FROM msg_log m WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, size, (page - 1) * size).map((m) => ({
    id: m.id, at: m.at, cid: m.creator_id, model: names.get(m.creator_id) || '', fid: m.fan_id, fan: inboxChat(m.creator_id, m.fan_id)?.name || 'Fan',
    text: m.text != null ? plain(m.text) : null, medias: m.medias || 0, price: m.price || 0, paid: m.price > 0 ? !!m.paid : null, who: whoOf(pf, m.kind, m.by_name),
    replyMs: m.reply_ms, replyTo: m.reply_text || null, deleted: !!m.deleted, script: !!m.is_script,
  }));
  return {
    ...empty, rows, total, page, pages, senders, fan,
    kpi: { messages: total, fans: k.fans || 0, proposed: k.proposed || 0, bought: k.bought || 0, boughtAmount: Math.round((k.amount || 0) * 100), free: k.free || 0, slow: k.slow || 0, replyMs: k.replies ? Math.round(k.replySum / k.replies) : null },
    since: one(`SELECT MIN(at) AS t FROM msg_log WHERE creator_id IN (${ids.map(() => '?').join(',')})`, ...ids)?.t || null,
  };
}

export function v2TeamRoutes({ userFrom, send, body, creators }) {
  /** Team leader ou plus + ce que l'adresse demande (plateforme affichée, période, modèles visibles). */
  const scope = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    const x = askOf(u, req, creators);
    const only = x.p.get('creatorId') || '';
    return { u, ...x, only, list: x.mine.filter((c) => !only || String(c.id) === only), all: x.mine.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null })) };
  };

  /** Team leader ou plus + toutes les modèles qu'il voit, les DEUX plateformes (écrans sur les personnes). */
  const people = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    const meta = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [String(m.creator_id), m.nickname]));
    const models = creators().filter((c) => canSee({ ...u, pf: null }, c.id)).map((c) => ({ id: String(c.id), name: meta.get(String(c.id)) || c.name, avatar: c.avatar || null, mym: /mym/i.test(c.platform || '') })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { u, p: new URL(req.url, 'http://x').searchParams, models, names: new Map(models.map((m) => [m.id, m])) };
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

    // Messages de l'équipe : ?pf, ?from=&to=, &creatorId=, &sender=<clé de whoOf | humans>, &type=paid|bought|unbought|
    // free|script|slow|unsent, &q=<texte>, &fan=<modèle~fan>, &sort=slow|price, &page=, &size=25|50|100|200.
    'GET /api/v2/team/messages': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      const g = (k) => x.p.get(k) || '';
      const data = teamMessages({ pf: x.pf, list: x.list, from: x.from, to: x.to, q: { sender: g('sender'), type: g('type'), text: g('q'), fan: g('fan'), sort: g('sort'), page: Number(g('page')) || 1, size: Number(g('size')) || 50 } });
      send(res, 200, { ...data, today: x.today, all: x.all });
    },

    // Activité : le journal des actions faites DANS Bloom (`bl_actions`, 60 jours), pour toutes les modèles que la
    // personne voit, les deux plateformes ensemble. ?from=&to= (jours de Paris, 7 jours par défaut), &creatorId=,
    // &user=<nom>, &action=<libellé>, &page=, &size=. Les actions sans modèle (droits, mots interdits…) ne sont
    // montrées qu'aux admins et managers.
    'GET /api/v2/team/activity': (req, res) => {
      const x = people(req, res);
      if (!x) return;
      const today = parisDay(Date.now());
      const ok = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);
      let to = ok(x.p.get('to')) || today;
      if (to > today) to = today;
      let from = ok(x.p.get('from')) || addDay(to, -6);
      if (from > to) from = to;
      if (from < addDay(today, -60)) from = addDay(today, -60);
      if (to < from) to = from;
      const start = parisMidnight(from);
      const end = parisMidnight(addDay(to, 1));
      const ids = [...x.names.keys()];
      const where = ['a.at >= ? AND a.at < ?', `(a.creator_id IN (${ids.map(() => '?').join(',') || "''"})${seesAll(x.u) ? ' OR a.creator_id IS NULL' : ''})`];
      const args = [start, end, ...ids];
      const only = x.p.get('creatorId');
      if (only) where.push('a.creator_id = ?'), args.push(only);
      const who = x.p.get('user');
      if (who) where.push('a.user_name = ?'), args.push(who);
      // Répartition par action : sans le filtre d'action (elle sert à le choisir).
      const split = all(`SELECT a.action, COUNT(*) AS n FROM bl_actions a WHERE ${where.join(' AND ')} GROUP BY 1 ORDER BY n DESC`, ...args);
      const action = x.p.get('action');
      if (action) where.push('a.action = ?'), args.push(action);
      const size = [50, 100, 200].includes(Number(x.p.get('size'))) ? Number(x.p.get('size')) : 50;
      const t = one(`SELECT COUNT(*) AS n, COUNT(DISTINCT a.user_name) AS users, COUNT(DISTINCT CASE WHEN a.fan_id IS NOT NULL THEN a.creator_id || ':' || a.fan_id END) AS fans FROM bl_actions a WHERE ${where.join(' AND ')}`, ...args);
      const pages = Math.max(1, Math.ceil(t.n / size));
      const page = Math.min(pages, Math.max(1, Number(x.p.get('page')) || 1));
      send(res, 200, {
        from, to, today, total: t.n, users: t.users, fans: t.fans, page, pages, size, split,
        people: all('SELECT DISTINCT a.user_name AS name FROM bl_actions a WHERE a.at >= ? AND a.user_name IS NOT NULL ORDER BY 1', Date.now() - 60 * DAY).map((r) => r.name),
        models: x.models,
        rows: all(`SELECT a.* FROM bl_actions a WHERE ${where.join(' AND ')} ORDER BY a.at DESC LIMIT ? OFFSET ?`, ...args, size, (page - 1) * size).map((a) => ({
          id: a.id, at: a.at, user: a.user_name, model: x.names.get(a.creator_id)?.name || '', mym: !!x.names.get(a.creator_id)?.mym, fan: a.creator_id && a.fan_id ? inboxChat(a.creator_id, a.fan_id)?.name || 'Fan' : null, action: a.action, details: a.details,
        })),
        since: one('SELECT MIN(at) AS t FROM bl_actions')?.t || null,
      });
    },

    // Modération : les messages envoyés aux fans que les règles jugent suspects (`bl_alerts`, relus chaque minute par
    // mymmod.mjs), pour les modèles de la plateforme affichée. Les motifs sont RECALCULÉS ici avec les règles de la
    // plateforme (un lien onlyfans.com n'est pas suspect sur OnlyFans) et sans les « sorties autorisées » du compte.
    // ?pf, &hours=24|168|720. Mots interdits et messages refusés : routes « /api/mym/mod/banned » (communes).
    'GET /api/v2/team/mod': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      const hours = [24, 168, 720].includes(Number(x.p.get('hours'))) ? Number(x.p.get('hours')) : 168;
      const since = Date.now() - hours * 3600_000;
      const ids = x.mine.map((c) => String(c.id));
      const names = new Map(x.mine.map((c) => [String(c.id), c.name]));
      const base = { platform: x.pf, cats: MOD_CATS, hours, models: x.all, canAct: seesAll(x.u), banned: bannedCount(), refused: one('SELECT COUNT(*) AS n FROM bl_refused WHERE at > ?', since)?.n || 0 };
      if (!ids.length) return send(res, 200, { ...base, total: 0, high: 0, fans: 0, counts: {}, authors: [], alerts: [], allowed: [] });
      const ph = ids.map(() => '?').join(',');
      const allowed = all(`SELECT creator_id, cat, by_name, at FROM bl_allowed WHERE creator_id IN (${ph})`, ...ids);
      const ok = new Set(allowed.map((a) => `${a.creator_id}:${a.cat}`));
      const rows = [];
      for (const a of all(`SELECT a.*, COALESCE(m.deleted, 0) AS deleted FROM bl_alerts a LEFT JOIN msg_log m ON m.id = a.msg_id WHERE a.creator_id IN (${ph}) AND a.at > ? ORDER BY a.at DESC`, ...ids, since)) {
        const s = suspects(a.text, x.pf);
        const cats = (s?.cats || []).filter((c) => !ok.has(`${a.creator_id}:${c}`));
        if (cats.length) rows.push({ ...a, cats, severity: s.severity });
      }
      const counts = Object.fromEntries(Object.keys(MOD_CATS).map((c) => [c, rows.filter((a) => a.cats.includes(c)).length]));
      const by = new Map();
      for (const a of rows) {
        const w = whoOf(x.pf, a.kind, a.by_name);
        const g = by.get(w.key) || { ...w, alerts: 0, high: 0, cats: new Set(), last: 0, models: new Set() };
        g.alerts++;
        if (a.severity === 'high') g.high++;
        a.cats.forEach((c) => g.cats.add(c));
        g.last = Math.max(g.last, a.at);
        g.models.add(names.get(a.creator_id) || '');
        by.set(w.key, g);
      }
      send(res, 200, {
        ...base,
        total: rows.length, high: rows.filter((a) => a.severity === 'high').length, fans: new Set(rows.map((a) => `${a.creator_id}:${a.fan_id}`)).size, counts,
        authors: [...by.values()].map((g) => ({ ...g, cats: [...g.cats], models: [...g.models] })).sort((a, b) => b.high - a.high || b.alerts - a.alerts),
        alerts: rows.slice(0, 200).map((a) => ({ id: a.msg_id, at: a.at, cid: a.creator_id, model: names.get(a.creator_id) || '', fid: a.fan_id, fan: a.fan_id ? inboxChat(a.creator_id, a.fan_id)?.name || 'Fan' : null, who: whoOf(x.pf, a.kind, a.by_name), cats: a.cats, severity: a.severity, text: plain(a.text || ''), deleted: !!a.deleted })),
        allowed: allowed.map((a) => ({ cid: a.creator_id, model: names.get(a.creator_id) || '', cat: a.cat, by: a.by_name, at: a.at })),
      });
    },
    // Sortie autorisée : un motif accepté sur une modèle (ex. son Instagram officiel) n'y est plus signalé.
    // `on: false` pour l'enlever. Admins et managers ; le droit porte sur la MODÈLE, pas sur le menu.
    'POST /api/v2/team/mod/allow': async (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      const b = await body(req);
      const c = creators().find((m) => String(m.id) === String(b.creatorId || ''));
      if (!c || !canSee({ ...u, pf: null }, c.id) || !MOD_CATS[b.cat]) return send(res, 400, { error: 'Modèle ou motif inconnu' });
      if (b.on === false) run('DELETE FROM bl_allowed WHERE creator_id = ? AND cat = ?', String(c.id), b.cat);
      else run('INSERT OR REPLACE INTO bl_allowed (creator_id, cat, by_name, at) VALUES (?, ?, ?, ?)', String(c.id), b.cat, u.name, Date.now());
      send(res, 200, { ok: true });
    },

    // Shifts : les heures de travail de chacun, déduites des messages qu'il a envoyés DEPUIS Bloom (les seuls dont
    // Bloom connaît l'auteur), sur toutes les modèles que la personne voit, les deux plateformes ensemble.
    // Un « shift » = une suite de messages sans trou de plus de `cut` minutes ; le temps actif additionne les écarts
    // de moins de `idle` minutes (1 minute comptée à chaque reprise). ?from=&to= (60 jours au plus), &idle=, &cut=,
    // &creatorId=, &person=<nom> (ajoute son activité minute par minute).
    'GET /api/v2/team/shifts': (req, res) => {
      const x = people(req, res);
      if (!x) return;
      const today = parisDay(Date.now());
      const ok = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);
      let to = ok(x.p.get('to')) || today;
      if (to > today) to = today;
      let from = ok(x.p.get('from')) || addDay(to, -6);
      if (from > to) from = to;
      if (from < addDay(to, -59)) from = addDay(to, -59);
      const idle = Math.min(60, Math.max(1, Math.round(Number(x.p.get('idle')) || 3)));
      const cut = Math.min(600, Math.max(idle, Math.round(Number(x.p.get('cut')) || 60)));
      const start = parisMidnight(from);
      const end = parisMidnight(addDay(to, 1));
      const only = x.p.get('creatorId') || '';
      const ids = [...x.names.keys()].filter((id) => !only || id === only);
      const base = { from, to, today, idle, cut, start, end, models: x.models, people: [], totals: { people: 0, shifts: 0, activeMin: 0, messages: 0, models: 0, of: ids.length }, unnamed: 0 };
      if (!ids.length) return send(res, 200, base);
      const ph = ids.map(() => '?').join(',');
      const rows = all(`SELECT m.creator_id AS cid, m.at, m.by_name AS name, m.price, m.medias, m.reply_ms FROM msg_log m WHERE m.from_fan = 0 AND m.deleted = 0 AND m.kind IN ('bloom', 'employee') AND m.by_name IS NOT NULL AND m.by_name NOT IN ('Bloom', 'Employé') AND m.creator_id IN (${ph}) AND m.at >= ? AND m.at < ? ORDER BY m.at`, ...ids, start, end);
      const users = new Map(all('SELECT id, name, avatar FROM users WHERE deleted = 0').map((u) => [u.name, u]));
      // Temps passé dans Bloom sur la période (team.mjs) : « sur le chat » et « Bloom ouvert ailleurs ».
      const work = new Map(all('SELECT user_id, SUM(active) AS a, SUM(idle) AS i, COUNT(*) AS d FROM work_log WHERE day >= ? AND day <= ? GROUP BY user_id', from, to).map((w) => [w.user_id, w]));
      const by = new Map();
      for (const r of rows) (by.get(r.name) || by.set(r.name, []).get(r.name)).push(r);
      const worked = new Set();
      const hm = (t) => new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
      const model = (id, n) => ({ id, name: x.names.get(id)?.name || id, mym: !!x.names.get(id)?.mym, n });
      const median = (l) => {
        const s = [...l].sort((a, b) => a - b);
        return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
      };
      const person = x.p.get('person') || '';
      const list = [...by].map(([name, msgs]) => {
        const vs = vacations(msgs, idle, cut).map((v) => ({ day: parisDay(v.start), start: hm(v.start), end: hm(v.end), endDay: parisDay(v.end), startAt: v.start, endAt: v.end, activeMin: v.activeMin, messages: v.messages, models: v.models.map((m) => model(m.id, m.n)) }));
        const models = new Map();
        for (const r of msgs) models.set(r.cid, (models.get(r.cid) || 0) + 1), worked.add(r.cid);
        // Temps de réponse : seulement les réponses données pendant que la personne était là (moins de 30 min).
        const rep = msgs.map((r) => r.reply_ms).filter((ms) => ms != null && ms <= REPLY_OK);
        const u = users.get(name);
        const w = u ? work.get(u.id) : null;
        let minutes;
        if (person === name) {
          const m = new Map();
          for (const r of msgs) m.set(Math.floor(r.at / 60_000), (m.get(Math.floor(r.at / 60_000)) || 0) + 1);
          minutes = [...m].map(([k, n]) => [k * 60_000, n]);
        }
        return {
          name, id: u?.id ?? null, avatar: u?.avatar ?? null, messages: msgs.length, activeMin: vs.reduce((a, v) => a + v.activeMin, 0), shifts: vs.length, vacations: vs,
          models: [...models].map(([id, n]) => model(id, n)).sort((a, b) => b.n - a.n),
          replyAvg: rep.length ? Math.round(rep.reduce((a, b) => a + b, 0) / rep.length) : null, replyMedian: rep.length ? median(rep) : null,
          first: msgs[0].at, last: msgs[msgs.length - 1].at, ppvPaid: msgs.filter((r) => r.price > 0).length, ppvFree: msgs.filter((r) => r.medias > 0 && !(r.price > 0)).length,
          bloomActiveMin: Math.round((w?.a || 0) / 60_000), bloomIdleMin: Math.round((w?.i || 0) / 60_000), bloomDays: w?.d || 0, minutes,
        };
      }).sort((a, b) => b.activeMin - a.activeMin || b.messages - a.messages);
      send(res, 200, {
        ...base, people: list,
        totals: { people: list.length, shifts: list.reduce((a, c) => a + c.shifts, 0), activeMin: list.reduce((a, c) => a + c.activeMin, 0), messages: rows.length, models: worked.size, of: ids.length },
        // Ce que Bloom a vu passer sans nom sur la même période (IA, autre outil, appli) : pour comprendre un relevé vide.
        unnamed: one(`SELECT COUNT(*) AS n FROM msg_log m WHERE m.from_fan = 0 AND m.deleted = 0 AND NOT (m.kind IN ('bloom', 'employee') AND m.by_name IS NOT NULL AND m.by_name NOT IN ('Bloom', 'Employé')) AND m.creator_id IN (${ph}) AND m.at >= ? AND m.at < ?`, ...ids, start, end)?.n || 0,
      });
    },

    // En direct : qui a Bloom ouvert en ce moment (présence de team.mjs), sur quelle page, quelle modèle, quel fan,
    // depuis quel appareil ; avec ce que chacun a fait aujourd'hui (temps sur le chat / ailleurs, messages envoyés).
    'GET /api/v2/team/live': (req, res) => {
      const x = people(req, res);
      if (!x) return;
      const day = parisDay(Date.now());
      const work = new Map(all('SELECT user_id, active, idle FROM work_log WHERE day = ?', day).map((w) => [w.user_id, w]));
      const sent = new Map(all('SELECT user_id, COUNT(*) AS msgs, SUM(price > 0) AS ppv FROM sent_log WHERE at >= ? GROUP BY user_id', parisMidnight(day)).map((s) => [s.user_id, s]));
      const list = liveView().map((p) => {
        const m = p.creatorId ? x.names.get(p.creatorId) : null;
        return {
          userId: p.userId, name: p.name, avatar: p.avatar, role: p.role, since: p.since, at: p.at, page: p.page, active: p.active, device: p.device, country: p.country,
          modelId: m ? p.creatorId : null, model: m?.name ?? null, mym: !!m?.mym, hidden: !!p.creatorId && !m, fan: m && p.fanId ? inboxChat(p.creatorId, p.fanId)?.name || 'Fan' : null,
          today: { activeMs: work.get(p.userId)?.active || 0, idleMs: work.get(p.userId)?.idle || 0, msgs: sent.get(p.userId)?.msgs || 0, ppv: sent.get(p.userId)?.ppv || 0 },
        };
      });
      send(res, 200, { now: Date.now(), people: list, models: x.models });
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
      // Autour d'une VENTE (pas de message connu) : seulement ce qui s'est dit dans les 7 jours d'avant et le jour
      // d'après — sinon on montrerait comme « contexte » des messages écrits des semaines plus tard.
      const lo = id || dir ? 0 : at - 7 * DAY;
      const hi = id || dir ? Number.MAX_SAFE_INTEGER : at + DAY;
      const before = dir === 'after' ? [] : all(`SELECT ${cols} FROM msg_log WHERE creator_id = ? AND fan_id = ? AND at ${dir === 'before' ? '<' : '<='} ? AND at >= ? ORDER BY at DESC LIMIT ?`, String(c.id), fid, at, lo, dir === 'before' ? 15 : 13).reverse();
      const after = dir === 'before' ? [] : all(`SELECT ${cols} FROM msg_log WHERE creator_id = ? AND fan_id = ? AND at > ? AND at <= ? ORDER BY at LIMIT ?`, String(c.id), fid, at, hi, dir === 'after' ? 15 : 6);
      const meta = one('SELECT nickname FROM creator_meta WHERE creator_id = ?', String(c.id));
      send(res, 200, { platform: pf, currency: pf === 'of' ? 'USD' : 'EUR', creatorId: String(c.id), creator: meta?.nickname || c.name, fanId: fid, fan: inboxChat(String(c.id), fid)?.name || 'Fan', focus: id || null, at, messages: [...before, ...after].map(view) });
    },
  };
}
