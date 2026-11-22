// Analytics → Employee reports (OnlyFans, copie d'Infloww).
// Source : rapports journaliers d'Infloww recopiés par revenue.mjs (ifw_emp_sales_daily, ifw_emp_chat_daily), par
// employé × créatrice × jour, en cents. Les ventes suivent les réglages de ventes de l'agence dans Infloww.
// « Fans qui ont dépensé » : ventes attribuées à l'employé (rv_sales.seller), comptées par fan.
import { all } from './store.mjs';
import { isBoss } from './team.mjs';
import { accountsFor } from './ofreports.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';

const DAY = 864e5;
const REFUND = /refund|chargeback|revers|rembours|annul|^undo$/i;
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY) + 1;
const round = (x) => Math.round(x * 100) / 100;
const pct = (a, b) => (b ? round(((a - b) / b) * 100) : a ? null : 0);
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

const FIELDS = ['sales', 'ppv', 'tips', 'dm', 'prio', 'mass', 'msgs', 'ppvs', 'unlocked', 'fans', 'chars', 'rtS', 'rtSn', 'rtC', 'rtCn'];
const zero = () => Object.fromEntries(FIELDS.map((k) => [k, 0]));

function period(p) {
  const today = parisDay(Date.now());
  const to = isDay(p.get('to')) ? p.get('to') : addDay(today, -1);
  let from = isDay(p.get('from')) ? p.get('from') : addDay(to, -6);
  if (from > to) from = to;
  const days = daysBetween(from, to);
  let gran = ['day', 'week', 'month'].includes(p.get('gran')) ? p.get('gran') : 'day';
  if (gran === 'week' && !(days >= 14 && days <= 365)) gran = 'day';
  if (gran === 'month' && !(days > 62)) gran = 'day';
  return { from, to, days, gran, prevFrom: addDay(from, -days), prevTo: addDay(from, -1) };
}

/** Comptes visibles (avec leur identifiant OnlyFans, clé des rapports). */
function visible(u, creators) {
  const accs = accountsFor(u, creators);
  const pids = new Map(all("SELECT id, pid FROM rv_accounts WHERE platform = 'onlyfans' AND pid IS NOT NULL").map((r) => [r.id, r.pid]));
  const byPid = new Map();
  for (const a of accs) if (pids.get(a.id)) byPid.set(pids.get(a.id), { id: a.id, name: a.name, avatar: a.avatar });
  return byPid;
}

/** Lignes journalières (ventes + chatting) des créatrices visibles entre deux dates. */
function rows(byPid, from, to, emp = null) {
  const pids = [...byPid.keys()];
  if (!pids.length) return [];
  const ph = pids.map(() => '?').join(',');
  const e = emp ? ' AND employee_id = ?' : '';
  const args = [...pids, from, to, ...(emp ? [emp] : [])];
  const out = new Map();
  const get = (r) => {
    const k = `${r.day}|${r.employee_id}|${r.platform_pid}`;
    if (!out.has(k)) out.set(k, { day: r.day, emp: r.employee_id, pid: r.platform_pid, ...zero() });
    return out.get(k);
  };
  for (const r of all(`SELECT * FROM ifw_emp_sales_daily WHERE platform_pid IN (${ph}) AND day >= ? AND day <= ?${e}`, ...args))
    Object.assign(get(r), { sales: r.sales, ppv: r.ppv, tips: r.tips, dm: r.dm, prio: r.prio_mass, mass: r.mass });
  for (const r of all(`SELECT * FROM ifw_emp_chat_daily WHERE platform_pid IN (${ph}) AND day >= ? AND day <= ?${e}`, ...args))
    Object.assign(get(r), {
      msgs: r.msgs, ppvs: r.ppvs, unlocked: r.ppv_unlocked, fans: r.fans_chatted, chars: r.chars,
      rtS: r.rt_sched * r.msgs, rtSn: r.rt_sched ? r.msgs : 0, rtC: r.rt_clock * r.msgs, rtCn: r.rt_clock ? r.msgs : 0,
    });
  return [...out.values()];
}
const add = (a, r) => {
  for (const k of FIELDS) a[k] += r[k];
  return a;
};
const active = (a) => a.sales || a.msgs || a.ppvs || a.fans;

/** Indicateurs d'un total (cents → $). */
function metrics(c, p, spent = null, prevSpent = null) {
  const $ = (x) => round(x / 100);
  const ratio = (a, b) => (b ? round((a / b) * 100) : null);
  const rt = (s, n) => (n ? Math.round(s / n) : null);
  const m = {
    sales: $(c.sales), ppv: $(c.ppv), tips: $(c.tips), dm: $(c.dm), prio: $(c.prio), mass: $(c.mass),
    msgs: c.msgs, ppvs: c.ppvs, unlocked: c.unlocked, fans: c.fans, chars: c.chars,
    golden: ratio(c.ppvs, c.msgs), unlockRate: ratio(c.unlocked, c.ppvs), rtSched: rt(c.rtS, c.rtSn), rtClock: rt(c.rtC, c.rtCn),
    spent, fanCvr: spent != null ? ratio(spent, c.fans) : null, perSpent: spent ? $(c.sales / spent) : null,
  };
  if (p) {
    const pg = p.msgs ? (p.ppvs / p.msgs) * 100 : null;
    const pu = p.ppvs ? (p.unlocked / p.ppvs) * 100 : null;
    Object.assign(m, {
      salesChange: pct(c.sales, p.sales), ppvChange: pct(c.ppv, p.ppv), tipsChange: pct(c.tips, p.tips), dmChange: pct(c.dm, p.dm),
      prioChange: pct(c.prio, p.prio), massChange: pct(c.mass, p.mass), msgsChange: pct(c.msgs, p.msgs), ppvsChange: pct(c.ppvs, p.ppvs),
      unlockedChange: pct(c.unlocked, p.unlocked), fansChange: pct(c.fans, p.fans), charsChange: pct(c.chars, p.chars),
      goldenChange: m.golden != null && pg ? pct(m.golden, pg) : null, unlockRateChange: m.unlockRate != null && pu ? pct(m.unlockRate, pu) : null,
      spentChange: spent != null && prevSpent != null ? pct(spent, prevSpent) : null,
      perSpentChange: spent && prevSpent ? pct(c.sales / spent, p.sales / prevSpent) : null,
    });
  }
  return m;
}

/** Fans qui ont dépensé, par employé (ventes attribuées dans rv_sales). */
function spenders(byPid, from, to) {
  const accs = [...byPid.values()].map((a) => a.id);
  const out = new Map();
  if (!accs.length) return out;
  const ph = accs.map(() => '?').join(',');
  for (const r of all(`SELECT seller, fan_id, fan_name, status FROM rv_sales WHERE account IN (${ph}) AND seller LIKE 'ifw:%' AND at >= ? AND at < ?`, ...accs, parisMidnight(from), parisMidnight(addDay(to, 1)))) {
    if (REFUND.test(r.status || '')) continue;
    const e = r.seller.slice(4);
    if (!out.has(e)) out.set(e, new Set());
    out.get(e).add(r.fan_id || r.fan_name);
  }
  return out;
}

/** Seaux du graphique (jour / semaine / mois). */
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

function overview(u, creators, p) {
  const per = period(p);
  const byPid = visible(u, creators);
  const names = new Map(all("SELECT id, name FROM rv_sellers WHERE id LIKE 'ifw:%'").map((r) => [r.id.slice(4), r.name]));
  const cur = rows(byPid, per.from, per.to);
  const prev = rows(byPid, per.prevFrom, per.prevTo);
  const sp = spenders(byPid, per.from, per.to);
  const psp = spenders(byPid, per.prevFrom, per.prevTo);

  // Graphique : ventes des employés par période (messages = ventes hors pourboires).
  const bs = buckets(per.from, per.to, per.gran).map((b) => ({ ...b, sales: 0, tips: 0 }));
  for (const r of cur) {
    const b = slotOf(bs, r.day);
    b.sales += r.sales;
    b.tips += r.tips;
  }
  const chart = bs.map((b, i) => ({
    label: b.label,
    v: round(b.sales / 100),
    msgs: round((b.sales - b.tips) / 100),
    tips: round(b.tips / 100),
    change: i ? pct(b.sales, bs[i - 1].sales) : null,
  }));

  // Par employé, et par employé × créatrice.
  const emp = new Map();
  const get = (id) => {
    if (!emp.has(id)) emp.set(id, { cur: zero(), prev: zero(), byPid: new Map() });
    return emp.get(id);
  };
  for (const r of cur) {
    const e = get(r.emp);
    add(e.cur, r);
    if (!e.byPid.has(r.pid)) e.byPid.set(r.pid, { cur: zero(), prev: zero() });
    add(e.byPid.get(r.pid).cur, r);
  }
  for (const r of prev) {
    const e = get(r.emp);
    add(e.prev, r);
    if (e.byPid.has(r.pid)) add(e.byPid.get(r.pid).prev, r);
  }
  const total = zero();
  const list = [];
  for (const [id, e] of emp) {
    if (!active(e.cur)) continue;
    add(total, e.cur);
    const creatorsOf = [...e.byPid.entries()].filter(([, x]) => active(x.cur)).sort((a, b) => b[1].cur.sales - a[1].cur.sales);
    list.push({
      id,
      name: names.get(id) || `#${id}`,
      creators: creatorsOf.map(([pid]) => byPid.get(pid)).filter(Boolean),
      ...metrics(e.cur, e.prev, sp.get(id)?.size ?? 0, psp.get(id)?.size ?? 0),
      rows: creatorsOf.map(([pid, x]) => ({ creator: byPid.get(pid) || null, ...metrics(x.cur, x.prev) })),
    });
  }
  list.sort((a, b) => b.sales - a.sales);
  return {
    ...per,
    chart,
    kpi: { sales: round(total.sales / 100), unlockRate: total.ppvs ? round((total.unlocked / total.ppvs) * 100) : null, rtSched: total.rtSn ? Math.round(total.rtS / total.rtSn) : null, rtClock: total.rtCn ? Math.round(total.rtC / total.rtCn) : null },
    employees: list,
    synced: all('SELECT MAX(day) AS d FROM ifw_emp_chat_daily')[0]?.d ?? null,
  };
}

/** Un employé : courbes par période (ventes, messages, fans, caractères, golden ratio, unlock rate). */
function employee(u, creators, p) {
  const per = period(p);
  const id = String(p.get('id') || '');
  const byPid = visible(u, creators);
  const bs = buckets(per.from, per.to, per.gran).map((b) => ({ ...b, ...zero() }));
  if (id) for (const r of rows(byPid, per.from, per.to, id)) add(slotOf(bs, r.day), r);
  return {
    ...per,
    id,
    series: bs.map((b, i) => ({
      label: b.label,
      sales: round(b.sales / 100),
      msgs: round((b.sales - b.tips) / 100),
      tips: round(b.tips / 100),
      change: i ? pct(b.sales, bs[i - 1].sales) : null,
      dmSent: b.msgs,
      ppvSent: b.ppvs,
      unlocked: b.unlocked,
      fans: b.fans,
      chars: b.chars,
      golden: b.msgs ? round((b.ppvs / b.msgs) * 100) : null,
      unlockRate: b.ppvs ? round((b.unlocked / b.ppvs) * 100) : null,
    })),
  };
}

export function ofEmployeeRoutes({ userFrom, send, creators }) {
  const auth = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    return u;
  };
  return {
    'GET /api/of-reports/employees': async (req, res) => {
      const u = auth(req, res);
      if (u) send(res, 200, overview(u, creators, new URL(req.url, 'http://x').searchParams));
    },
    'GET /api/of-reports/employee': async (req, res) => {
      const u = auth(req, res);
      if (u) send(res, 200, employee(u, creators, new URL(req.url, 'http://x').searchParams));
    },
  };
}
