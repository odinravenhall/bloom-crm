// Analytics → Fan reports (OnlyFans, copie d'Infloww). Une créatrice à la fois :
// nouveaux fans (nouveaux abonnés + renouvellements), fans actifs, gains par source de trafic, meilleurs fans.
// Sources : chiffres journaliers par créatrice (ifw_creator_daily) et ventes (rv_sales) en brut ou net.
import { all } from './store.mjs';
import { isBoss } from './team.mjs';
import { accountsFor } from './ofreports.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';

const DAY = 864e5;
const REFUND = /refund|chargeback|revers|rembours|annul|^undo$/i;
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY) + 1;
const round = (x) => Math.round(x * 100) / 100;
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const SORTS = { total: 'total', tips: 'tips', ppv: 'ppv', length: 'since' };

function period(p) {
  const today = parisDay(Date.now());
  const to = isDay(p.get('to')) ? p.get('to') : addDay(today, -1);
  let from = isDay(p.get('from')) ? p.get('from') : addDay(to, -6);
  if (from > to) from = to;
  const days = daysBetween(from, to);
  let gran = ['day', 'week', 'month'].includes(p.get('gran')) ? p.get('gran') : 'day';
  if (gran === 'week' && !(days >= 14 && days <= 365)) gran = 'day';
  if (gran === 'month' && !(days > 62)) gran = 'day';
  return { from, to, days, gran, net: p.get('net') !== '0' };
}

function buckets(from, to, gran) {
  const b = [];
  if (gran === 'day') for (let d = from; d <= to; d = addDay(d, 1)) b.push({ label: d, start: d });
  else if (gran === 'week') {
    const dow = new Date(`${from}T12:00:00Z`).getUTCDay();
    for (let d = addDay(from, -dow); d <= to; d = addDay(d, 7)) b.push({ label: d < from ? from : d, start: d < from ? from : d });
  } else
    for (let d = from; d <= to; ) {
      b.push({ label: d.slice(0, 7), start: d });
      d = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 1)).toISOString().slice(0, 10);
    }
  return b;
}
const slotOf = (bs, day) => {
  let i = bs.length - 1;
  while (i > 0 && bs[i].start > day) i--;
  return bs[i];
};

/** Meilleurs fans d'une créatrice sur la période (dépense totale, pourboires, PPV, ancienneté approximative). */
function topFans(acc, per, sort = 'total', limit = 100) {
  const start = parisMidnight(per.from);
  const end = parisMidnight(addDay(per.to, 1));
  const fans = new Map();
  for (const r of all('SELECT fan_id, fan_name, type, gross, net, status FROM rv_sales WHERE account = ? AND at >= ? AND at < ?', acc, start, end)) {
    if (REFUND.test(r.status || '')) continue;
    const k = r.fan_id || r.fan_name;
    if (!k) continue;
    if (!fans.has(k)) fans.set(k, { id: r.fan_id || null, name: r.fan_name || r.fan_id || '?', total: 0, tips: 0, ppv: 0 });
    const f = fans.get(k);
    const v = (per.net ? r.net : r.gross) / 100;
    f.total += v;
    if (r.type === 'tip') f.tips += v;
    if (r.type === 'ppv') f.ppv += v;
  }
  // Ancienneté : première vente connue de ce fan chez cette créatrice (approximation de la durée d'abonnement).
  const ids = [...fans.values()].filter((f) => f.id).map((f) => f.id);
  const first = new Map();
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400);
    for (const r of all(`SELECT fan_id, MIN(at) AS t FROM rv_sales WHERE account = ? AND fan_id IN (${part.map(() => '?').join(',')}) GROUP BY fan_id`, acc, ...part)) first.set(r.fan_id, r.t);
  }
  const list = [...fans.values()].map((f) => ({ name: f.name, total: round(f.total), tips: round(f.tips), ppv: round(f.ppv), since: f.id && first.has(f.id) ? first.get(f.id) : null }));
  const key = SORTS[sort] || 'total';
  list.sort((a, b) => (key === 'since' ? (a.since ?? Infinity) - (b.since ?? Infinity) : b[key] - a[key]));
  return list.slice(0, limit).map((f) => ({ ...f, lengthDays: f.since ? Math.max(1, Math.round((Date.now() - f.since) / DAY)) : null }));
}

function report(u, creators, p) {
  const per = period(p);
  const accs = accountsFor(u, creators);
  const acc = accs.find((a) => a.id === p.get('account'))?.id ?? accs[0]?.id ?? null;
  const pid = acc ? all('SELECT pid FROM rv_accounts WHERE id = ?', acc)[0]?.pid : null;
  const bs = buckets(per.from, per.to, per.gran).map((b) => ({ ...b, news: 0, renews: 0, active: null, seen: false }));
  if (pid)
    for (const r of all('SELECT day, new_subs, renewals, active_fans FROM ifw_creator_daily WHERE platform_pid = ? AND day >= ? AND day <= ? ORDER BY day', pid, per.from, per.to)) {
      const b = slotOf(bs, r.day);
      b.news += r.new_subs ?? 0;
      b.renews += r.renewals ?? 0;
      if (r.active_fans != null) b.active = r.active_fans; // dernier jour du seau
      b.seen = true;
    }
  // Gains par source de trafic : Bloom ne connaît pas encore la source des fans → tout est « Unknown ».
  let total = 0;
  if (acc)
    for (const r of all('SELECT gross, net, status FROM rv_sales WHERE account = ? AND at >= ? AND at < ?', acc, parisMidnight(per.from), parisMidnight(addDay(per.to, 1))))
      if (!REFUND.test(r.status || '')) total += (per.net ? r.net : r.gross) / 100;
  return {
    ...per,
    accounts: accs.map(({ id, name, avatar, creatorId }) => ({ id, name, avatar, creatorId })),
    account: acc,
    newFans: bs.map((b) => ({ label: b.label, all: b.news + b.renews, renews: b.renews, news: b.news })),
    totalFans: bs.map((b, i) => {
      const prev = i ? bs[i - 1].active : null;
      return { label: b.label, v: b.active, change: b.active != null && prev ? round(((b.active - prev) / prev) * 100) : null };
    }),
    traffic: [
      { source: 'Unknown', v: round(total) },
      { source: 'OnlyFans', v: 0 },
      { source: 'Snapchat', v: 0 },
      { source: 'Instagram', v: 0 },
    ],
    topFans: acc ? topFans(acc, per, p.get('sort') || 'total') : [],
  };
}

export function ofFanRoutes({ userFrom, send, creators }) {
  const auth = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    return u;
  };
  return {
    'GET /api/of-reports/fans': async (req, res) => {
      const u = auth(req, res);
      if (u) send(res, 200, report(u, creators, new URL(req.url, 'http://x').searchParams));
    },
    // « Download report » : tous les fans de la période, triés comme demandé, en CSV.
    'GET /api/of-reports/fans.csv': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const p = new URL(req.url, 'http://x').searchParams;
      const per = period(p);
      const acc = accountsFor(u, creators).find((a) => a.id === p.get('account'));
      if (!acc) return send(res, 404, { error: 'Créatrice inconnue' });
      const rows = topFans(acc.id, per, p.get('sort') || 'total', 100000);
      const esc = (x) => (/[",;\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
      const lines = [['Fan name', 'Total spend', 'Tips', 'PPV sales', 'Subscription length (days)'], ...rows.map((r) => [r.name, r.total, r.tips, r.ppv, r.lengthDays ?? ''])];
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="fan-report-${per.from}-${per.to}.csv"` });
      res.end('﻿' + lines.map((l) => l.map(esc).join(',')).join('\n'));
    },
  };
}
