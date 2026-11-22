// Analytics → Creator reports (OnlyFans, copie d'Infloww).
// Sur une période (heure de Paris) et pour les créatrices choisies : résumé des gains par canal avec l'évolution par
// rapport à la période d'avant, tendances (heure / jour / semaine / mois), gains par canal, répartition, et statistiques
// par créatrice (colonnes au choix, export CSV).
// Source : ventes OnlyFans lues chez Infloww (rv_sales), en dollars, brut ou net ; messages vus par Bloom (msg_log)
// pour le temps de réponse, les fans contactés, les messages et PPV envoyés (créatrices branchées sur Substy).
import { all } from './store.mjs';
import { isBoss, seesAll, canSee } from './team.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';

const DAY = 864e5;
const REFUND = /refund|chargeback|revers|rembours|annul/i;
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY) + 1;
const CHANNELS = ['subscriptions', 'tips', 'posts', 'messages', 'referrals', 'streams'];
const channelOf = (r) => ({ sub: 'subscriptions', tip: 'tips', post: 'posts', ppv: 'messages', stream: 'streams' })[r.type] || (/refer|parrain/i.test(r.raw_type || '') ? 'referrals' : null);
const round = (x) => Math.round(x * 100) / 100;
const zero = () => Object.fromEntries(CHANNELS.map((c) => [c, 0]));

/** Granularité permise (comme Infloww) : heure ≤ 2 jours, semaine 14 à 365 jours, mois > 62 jours. */
function allowed(gran, days) {
  if (gran === 'hour') return days <= 2;
  if (gran === 'week') return days >= 14 && days <= 365;
  if (gran === 'month') return days > 62;
  return true;
}

/** Comptes OnlyFans (Infloww) visibles par la personne, avec nom et photo. */
function accountsFor(u, creators) {
  const maps = all('SELECT creator_id, account FROM rv_map WHERE account IS NOT NULL');
  const byAcc = new Map(maps.map((m) => [m.account, m.creator_id]));
  const cr = new Map(creators().map((c) => [c.id, c]));
  return all("SELECT id, name, nick, username FROM rv_accounts WHERE platform = 'onlyfans' ORDER BY name COLLATE NOCASE")
    .map((a) => {
      const cid = byAcc.get(a.id) || null;
      const c = cid ? cr.get(cid) : null;
      return { id: a.id, name: c?.name || a.nick || a.name || a.username || 'Créatrice', avatar: c?.avatar || null, creatorId: cid };
    })
    .filter((a) => seesAll(u) || (a.creatorId && canSee({ ...u, pf: null }, a.creatorId)));
}

/** Toutes les données du rapport. */
function report(u, creators, p) {
  const today = parisDay(Date.now());
  const to = /^\d{4}-\d{2}-\d{2}$/.test(p.get('to') || '') ? p.get('to') : addDay(today, -1);
  let from = /^\d{4}-\d{2}-\d{2}$/.test(p.get('from') || '') ? p.get('from') : addDay(to, -6);
  if (from > to) from = to;
  const days = daysBetween(from, to);
  let gran = ['hour', 'day', 'week', 'month'].includes(p.get('gran')) ? p.get('gran') : 'day';
  if (!allowed(gran, days)) gran = 'day';
  const net = p.get('net') !== '0';
  const all_ = accountsFor(u, creators);
  const want = new Set((p.get('accounts') || '').split(',').filter(Boolean));
  const accs = want.size ? all_.filter((a) => want.has(a.id)) : all_;
  const start = parisMidnight(from);
  const end = parisMidnight(addDay(to, 1));
  const prevStart = start - (end - start);

  // Seaux de la courbe.
  const buckets = [];
  if (gran === 'hour') for (let t = start; t < end; t += 3600_000) buckets.push({ at: t, label: new Date(t).toISOString() });
  else if (gran === 'day') for (let d = from; d <= to; d = addDay(d, 1)) buckets.push({ at: parisMidnight(d), label: d });
  else if (gran === 'week') {
    const dow = new Date(`${from}T12:00:00Z`).getUTCDay();
    for (let d = addDay(from, -dow); d <= to; d = addDay(d, 7)) buckets.push({ at: Math.max(start, parisMidnight(d)), label: d < from ? from : d });
  } else {
    for (let d = from; d <= to; ) {
      buckets.push({ at: parisMidnight(d), label: d.slice(0, 7) });
      const next = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 1)).toISOString().slice(0, 10);
      d = next;
    }
  }
  for (const b of buckets) Object.assign(b, zero(), { total: 0 });
  const slot = (at) => {
    let i = buckets.length - 1;
    while (i > 0 && buckets[i].at > at) i--;
    return buckets[i];
  };

  const cur = zero();
  const prev = zero();
  const per = new Map(accs.map((a) => [a.id, { ...a, cur: zero(), prev: zero(), total: 0, prevTotal: 0, refunds: 0, newSubs: 0, renewals: 0, subNew: 0, subRecurring: 0, tx: 0, spenders: new Set() }]));
  let refunded = 0;
  if (accs.length) {
    const ph = accs.map(() => '?').join(',');
    for (const r of all(`SELECT account, type, raw_type, gross, net, status, fan_id, fan_name, at FROM rv_sales WHERE account IN (${ph}) AND at >= ? AND at < ?`, ...accs.map((a) => a.id), prevStart, end)) {
      const c = per.get(r.account);
      const v = (net ? r.net : r.gross) / 100;
      if (REFUND.test(r.status || '')) {
        if (r.at >= start) (refunded += Math.abs(v)), (c.refunds += Math.abs(v));
        continue;
      }
      const ch = channelOf(r);
      if (!ch) continue;
      if (r.at < start) {
        prev[ch] += v;
        c.prev[ch] += v;
        c.prevTotal += v;
        continue;
      }
      cur[ch] += v;
      c.cur[ch] += v;
      c.total += v;
      c.tx++;
      if (r.fan_id || r.fan_name) c.spenders.add(r.fan_id || r.fan_name);
      if (ch === 'subscriptions') {
        if (/recurr|renew|rebill/i.test(r.raw_type || '')) (c.renewals++, (c.subRecurring += v));
        else (c.newSubs++, (c.subNew += v));
      }
      const b = slot(r.at);
      b[ch] += v;
      b.total += v;
    }
  }
  // Messages vus par Bloom (créatrices branchées sur Substy).
  const msg = new Map();
  const cids = accs.filter((a) => a.creatorId).map((a) => a.creatorId);
  if (cids.length) {
    const ph = cids.map(() => '?').join(',');
    for (const r of all(
      `SELECT creator_id, COUNT(*) AS sent, SUM(price > 0) AS ppv, COUNT(DISTINCT fan_id) AS fans, AVG(reply_ms) AS reply FROM msg_log WHERE creator_id IN (${ph}) AND from_fan = 0 AND at >= ? AND at < ? GROUP BY creator_id`,
      ...cids, start, end,
    ))
      msg.set(r.creator_id, r);
  }

  const sum = (o) => CHANNELS.reduce((a, k) => a + o[k], 0);
  const total = sum(cur);
  const prevTotal = sum(prev);
  const hours = (end - start) / 3600_000;
  const pct = (a, b) => (b ? round(((a - b) / b) * 100) : a ? null : 0);
  const prevAll = [...per.values()].reduce((a, c) => a + c.prevTotal, 0);
  return {
    from,
    to,
    days,
    gran,
    net,
    accounts: all_.map(({ id, name, avatar }) => ({ id, name, avatar })),
    summary: Object.fromEntries([['total', { v: round(total), change: pct(total, prevTotal) }], ...CHANNELS.map((k) => [k, { v: round(cur[k]), change: pct(cur[k], prev[k]) }])]),
    trends: buckets.map((b, i) => ({ label: b.label, ...Object.fromEntries(CHANNELS.map((k) => [k, round(b[k])])), total: round(b.total), change: i ? pct(b.total, buckets[i - 1].total) : null })),
    kpi: { creators: accs.length, messages: round(cur.messages), total: round(total), refunded: round(refunded) },
    creators: [...per.values()].map((c) => {
      const m = c.creatorId ? msg.get(c.creatorId) : null;
      const spenders = c.spenders.size;
      return {
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        subscriptions: round(c.cur.subscriptions),
        subscriptionsChange: pct(c.cur.subscriptions, c.prev.subscriptions),
        subNew: round(c.subNew),
        subRecurring: round(c.subRecurring),
        tips: round(c.cur.tips),
        messages: round(c.cur.messages),
        posts: round(c.cur.posts),
        streams: round(c.cur.streams),
        total: round(c.total),
        totalChange: pct(c.total, c.prevTotal),
        contribution: total ? round((c.total / total) * 100) : 0,
        contributionChange: prevAll && total ? round((c.total / total) * 100 - (c.prevTotal / prevAll) * 100) : null,
        refunds: round(c.refunds),
        avgHourly: round(c.total / hours),
        newSubs: c.newSubs,
        renewals: c.renewals,
        spenders,
        avgPerSpender: spenders ? round(c.total / spenders) : 0,
        avgPerTx: c.tx ? round(c.total / c.tx) : 0,
        replyMs: m?.reply != null ? Math.round(m.reply) : null,
        fansChatted: m ? m.fans : null,
        messagesSent: m ? m.sent : null,
        ppvSent: m ? m.ppv || 0 : null,
      };
    }),
    // Pour l'export « par jour ».
    _byDay: null,
  };
}

/** Lignes du CSV d'export (total, par jour, ou les deux). */
function csv(u, creators, p) {
  const fmt = p.get('format') || 'total';
  const head = ['Creator', 'Date', 'Subscriptions', 'Tips', 'Messages', 'Posts', 'Streams', 'Referrals', 'Total earnings', 'Refunds'];
  const lines = [head];
  const add = (name, date, r) => lines.push([name, date, r.subscriptions, r.tips, r.messages, r.posts, r.streams, r.referrals ?? 0, r.total, r.refunds ?? '']);
  if (fmt !== 'day') {
    const r = report(u, creators, p);
    for (const c of r.creators) add(c.name, `${r.from} → ${r.to}`, c);
  }
  if (fmt !== 'total') {
    const base = report(u, creators, p);
    for (let d = base.from; d <= base.to; d = addDay(d, 1)) {
      const q = new URLSearchParams(p);
      q.set('from', d);
      q.set('to', d);
      q.set('gran', 'day');
      for (const c of report(u, creators, q).creators) add(c.name, d, c);
    }
  }
  const esc = (x) => (/[",;\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
  return '﻿' + lines.map((l) => l.map(esc).join(',')).join('\n');
}

export function ofReportRoutes({ userFrom, send, creators }) {
  const auth = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    return u;
  };
  return {
    'GET /api/of-reports/creators': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const r = report(u, creators, new URL(req.url, 'http://x').searchParams);
      delete r._byDay;
      send(res, 200, r);
    },
    'GET /api/of-reports/creators.csv': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const p = new URL(req.url, 'http://x').searchParams;
      const body = csv(u, creators, p);
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="creator-report-${p.get('from') || ''}-${p.get('to') || ''}.csv"` });
      res.end(body);
    },
  };
}
