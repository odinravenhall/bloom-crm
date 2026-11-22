// Revenus de Bloom : les VRAIES ventes, comptées une seule fois.
//
//  - Source officielle : Infloww (OnlyFans) et MyPulse (MYM), synchronisés en tâche de fond
//    (ventes récentes toutes les 2-3 min, recalage sur 14 jours, historique d'un an recopié petit à petit).
//  - Substy (« ventes en direct ») ne sert qu'à deux choses :
//      1. combler les 2-3 minutes de retard : une vente vue chez Substy est comptée « provisoire » jusqu'à ce que
//         la même vente arrive d'Infloww / MyPulse (même créatrice, même fan, même heure à 2 min près) : elle est
//         alors REMPLACÉE, jamais ajoutée ;
//      2. savoir d'où vient la vente : le PPV acheté a été envoyé par l'IA de Substy, par un chatteur dans Bloom…
//  - Une créatrice de Bloom (Substy) est reliée à son compte Infloww / MyPulse automatiquement (même plateforme,
//    même prénom), ou à la main par un admin (Administration → Créatrices).
//  - Montants en centimes. OnlyFans en dollars, MYM en euros ; le total de l'agence est en euros
//    (dollars convertis au taux BCE du jour de chaque vente, comme le tableau de bord Zèbre).
import { all, db, getSetting, one, open, run, seal, setSetting } from './store.mjs';

const DAY = 86_400_000;
const sleep = (t) => new Promise((r) => setTimeout(r, t));
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? 0 : Math.round(Number(v)));
const msOf = (v) => (v === null || v === undefined || v === '' ? null : /^\d+$/.test(String(v)) ? Number(v) : Date.parse(v) || null);
const cents = (v) => (v === null || v === undefined || v === '' ? 0 : Math.round(Number(v) * 100) || 0);
export const parisDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Minuit (heure de Paris) du jour donné, en millisecondes. */
export function parisMidnight(day) {
  const utc = Date.parse(`${day}T00:00:00Z`);
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).format(new Date(utc)));
  return utc - (h >= 12 ? h - 24 : h) * 3600_000;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS rv_accounts (id TEXT PRIMARY KEY, src TEXT NOT NULL, platform TEXT NOT NULL, name TEXT, nick TEXT, username TEXT, connected INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS rv_sellers (id TEXT PRIMARY KEY, name TEXT, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS rv_sales (
    id TEXT PRIMARY KEY, src TEXT NOT NULL, account TEXT NOT NULL, platform TEXT NOT NULL, fan_id TEXT, fan_name TEXT, at INTEGER NOT NULL,
    type TEXT NOT NULL, raw_type TEXT, gross INTEGER NOT NULL DEFAULT 0, net INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL, status TEXT,
    seller TEXT, substy_id TEXT, origin TEXT, origin_by TEXT, first_seen INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS rv_sales_at ON rv_sales (at);
  CREATE INDEX IF NOT EXISTS rv_sales_account ON rv_sales (account, at);
  -- Ventes vues en direct chez Substy (en attente de la vente officielle)
  CREATE TABLE IF NOT EXISTS rv_live (
    id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, type TEXT, at INTEGER NOT NULL, gross INTEGER NOT NULL, currency TEXT NOT NULL,
    fan_id TEXT, fan_name TEXT, message_id TEXT, matched TEXT, first_seen INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS rv_live_at ON rv_live (at);
  -- Créatrice de Bloom (id Substy) → compte Infloww / MyPulse (« ifw:… » / « mp:… »)
  CREATE TABLE IF NOT EXISTS rv_map (creator_id TEXT PRIMARY KEY, account TEXT, manual INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS fx_usd_eur (day TEXT PRIMARY KEY, rate REAL NOT NULL);
`);
try {
  db.exec('ALTER TABLE msg_log ADD COLUMN by_name TEXT');
} catch {}
try {
  db.exec('ALTER TABLE rv_accounts ADD COLUMN avatar TEXT'); // photo du compte (Infloww)
} catch {}
for (const sql of [
  'ALTER TABLE rv_accounts ADD COLUMN pid TEXT', // identifiant OnlyFans (clé des rapports Infloww)
  'ALTER TABLE rv_sellers ADD COLUMN status TEXT', // Activated / Deactivated / Deleted (Infloww)
]) {
  try {
    db.exec(sql);
  } catch {}
}
// Rapports journaliers d'Infloww (même format que le tableau de bord Zèbre) : par employé × créatrice, et par créatrice.
db.exec(`
  CREATE TABLE IF NOT EXISTS ifw_emp_sales_daily (
    day TEXT NOT NULL, employee_id TEXT NOT NULL, platform_pid TEXT NOT NULL,
    sales INTEGER NOT NULL DEFAULT 0, ppv INTEGER NOT NULL DEFAULT 0, tips INTEGER NOT NULL DEFAULT 0, dm INTEGER NOT NULL DEFAULT 0,
    prio_mass INTEGER NOT NULL DEFAULT 0, mass INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, employee_id, platform_pid)
  );
  CREATE TABLE IF NOT EXISTS ifw_emp_chat_daily (
    day TEXT NOT NULL, employee_id TEXT NOT NULL, platform_pid TEXT NOT NULL,
    msgs INTEGER NOT NULL DEFAULT 0, ppvs INTEGER NOT NULL DEFAULT 0, ppv_unlocked INTEGER NOT NULL DEFAULT 0, fans_chatted INTEGER NOT NULL DEFAULT 0,
    chars INTEGER NOT NULL DEFAULT 0, rt_sched INTEGER NOT NULL DEFAULT 0, rt_clock INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, employee_id, platform_pid)
  );
  CREATE TABLE IF NOT EXISTS ifw_creator_daily (
    day TEXT NOT NULL, platform_pid TEXT NOT NULL,
    new_subs INTEGER, renewals INTEGER, active_fans INTEGER, expired_fans INTEGER, renew_on INTEGER, avg_sub_len INTEGER,
    visitors INTEGER, visitors_guest INTEGER, visitors_logged INTEGER,
    msgs_sent INTEGER, ppvs_sent INTEGER, fans_chatted INTEGER, reply_time INTEGER,
    PRIMARY KEY (day, platform_pid)
  );
`);
// Une seule fois : relire tout de suite le catalogue Infloww.
if (!getSetting('rv:pid-v1')) (setSetting('rv:pid-v1', '1'), setSetting('rv:due:ifw-catalog', '0')); // relire les créatrices (identifiant OnlyFans) et les employés (statut)
/** Photo d'une créatrice dans la réponse d'Infloww (nom du champ non documenté : on prend la 1re URL d'image). */
const pictureOf = (c) => {
  for (const [k, v] of Object.entries(c || {})) if (/avatar|head|pic|photo|image/i.test(k) && typeof v === 'string' && /^https?:\/\//.test(v)) return v;
  return null;
};

// ---------------------------------------------------------------- clés (collées par un admin, gardées chiffrées)
const secret = (k) => {
  const v = getSetting(k);
  try {
    return v ? open(v) : null;
  } catch {
    return null;
  }
};
const keys = () => ({ ifwKey: secret('ifw_key'), ifwOid: secret('ifw_oid'), mpKey: secret('mp_key') });
export const ifwReady = () => !!(keys().ifwKey && keys().ifwOid);
export const mpReady = () => !!keys().mpKey;

export async function saveKeys({ ifwKey, ifwOid, mpKey }) {
  const k = (v) => String(v || '').trim();
  if (k(ifwKey) || k(ifwOid)) {
    if (!k(ifwKey) || !k(ifwOid)) throw Object.assign(new Error('Infloww : il faut la clé ET l’identifiant d’agence (OID).'), { status: 400 });
    const r = await fetch('https://openapi.infloww.com/v1/creators?limit=1', { headers: { Authorization: k(ifwKey), 'x-oid': k(ifwOid), Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!r?.ok) throw Object.assign(new Error(`Infloww refuse cette clé (${r?.status ?? 'pas de réponse'}).`), { status: 400 });
    setSetting('ifw_key', seal(k(ifwKey)));
    setSetting('ifw_oid', seal(k(ifwOid)));
  }
  if (k(mpKey)) {
    const r = await fetch('https://mypuls.app/api/v1/creators', { headers: { 'X-API-TOKEN': k(mpKey), Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!r?.ok) throw Object.assign(new Error(`MyPulse refuse cette clé (${r?.status ?? 'pas de réponse'}).`), { status: 400 });
    setSetting('mp_key', seal(k(mpKey)));
  }
  for (const j of JOBS) setSetting(`rv:due:${j.name}`, '0'); // tout relancer tout de suite
  return status();
}

// ---------------------------------------------------------------- clients API (lecture seule)
let ifwLast = 0;
async function ifw(path, params = {}) {
  const { ifwKey, ifwOid } = keys();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, Array.isArray(v) ? v.join(',') : String(v));
  const url = `https://openapi.infloww.com${path}${q.size ? `?${q}` : ''}`;
  for (let attempt = 0; ; attempt++) {
    // Clé partagée avec le tableau de bord Zèbre (1 000 appels/min pour toute l'agence) : Bloom reste à ~200/min.
    const wait = ifwLast + 300 - Date.now();
    if (wait > 0) await sleep(wait);
    ifwLast = Date.now();
    let r;
    try {
      r = await fetch(url, { headers: { Authorization: ifwKey ?? '', 'x-oid': ifwOid ?? '', Accept: 'application/json' }, signal: AbortSignal.timeout(45_000) });
    } catch (e) {
      if (attempt < 3) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw new Error(`Infloww ${path} : ${e.message}`);
    }
    if ((r.status === 429 || r.status >= 500) && attempt < 3) {
      await sleep(r.status === 429 ? 30_000 : 3000 * (attempt + 1));
      continue;
    }
    const body = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(`Infloww ${path} : ${r.status} ${body?.errorMessage ?? ''}`.trim()), { status: r.status });
    return body;
  }
}
async function ifwAll(path, params = {}, max = 300) {
  const out = [];
  let cursor;
  for (let i = 0; i < max; i++) {
    const b = await ifw(path, { limit: 100, ...params, cursor });
    out.push(...(b?.data?.list ?? []));
    const more = b?.hasMore ?? b?.data?.hasMore;
    cursor = b?.cursor ?? b?.data?.cursor;
    if (!more || !cursor) break;
  }
  return out;
}

let mpLast = 0;
async function mp(path, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
  const url = `https://mypuls.app${path}${q.size ? `?${q}` : ''}`;
  for (let attempt = 0; ; attempt++) {
    const wait = mpLast + 700 - Date.now();
    if (wait > 0) await sleep(wait);
    mpLast = Date.now();
    let r;
    try {
      r = await fetch(url, { headers: { 'X-API-TOKEN': keys().mpKey ?? '', Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
    } catch (e) {
      if (attempt < 3) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      throw new Error(`MyPulse ${path} : ${e.message}`);
    }
    if ((r.status === 429 || r.status >= 500) && attempt < 3) {
      await sleep(r.status === 429 ? 30_000 : 4000 * (attempt + 1));
      continue;
    }
    const body = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error(`MyPulse ${path} : ${r.status} ${body?.error ?? body?.message ?? ''}`.trim()), { status: r.status });
    return body;
  }
}

// ---------------------------------------------------------------- types de vente (communs aux deux plateformes)
function typeOf(raw) {
  const t = String(raw || '').toLowerCase();
  if (/abonn|subscri|renew|recurr/.test(t)) return 'sub';
  if (/tip|pourboire/.test(t)) return 'tip';
  if (/stream|live/.test(t)) return 'stream';
  if (/post/.test(t)) return 'post';
  if (/messag|ppv|priv|push|média|media/.test(t)) return 'ppv';
  return 'other';
}
const REFUND = /refund|chargeback|revers|rembours|annul|^undo$/i; // Infloww : « undo » = remboursée

const tx = (fn) => {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};
const upSale = () =>
  db.prepare(`INSERT INTO rv_sales (id, src, account, platform, fan_id, fan_name, at, type, raw_type, gross, net, currency, status, seller, first_seen, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET fan_name = excluded.fan_name, type = excluded.type, raw_type = excluded.raw_type, gross = excluded.gross, net = excluded.net,
      status = excluded.status, seller = excluded.seller, updated_at = excluded.updated_at`);

// ---------------------------------------------------------------- Infloww (OnlyFans)
async function ifwCatalog() {
  const now = Date.now();
  const list = await ifwAll('/v1/creators');
  const up = db.prepare(`INSERT INTO rv_accounts (id, src, platform, name, nick, username, avatar, pid, connected, updated_at) VALUES (?, 'ifw', 'onlyfans', ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT (id) DO UPDATE SET name = excluded.name, nick = excluded.nick, username = excluded.username, avatar = COALESCE(excluded.avatar, rv_accounts.avatar), pid = COALESCE(excluded.pid, rv_accounts.pid), connected = 1, updated_at = excluded.updated_at`);
  tx(() => {
    run("UPDATE rv_accounts SET connected = 0 WHERE src = 'ifw'");
    for (const c of list) up.run(`ifw:${c.id}`, c.name ?? '?', c.nickName ?? null, c.userName ?? null, pictureOf(c), c.platformPid != null ? String(c.platformPid) : null, now);
  });
  const emps = await ifwAll('/v1/employees');
  const ue = db.prepare('INSERT INTO rv_sellers (id, name, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, status = excluded.status, updated_at = excluded.updated_at');
  tx(() => emps.forEach((e) => ue.run(`ifw:${e.employeeId}`, String(e.employeeName ?? '?').trim(), e.status ?? null, now)));
  autoMap();
  const pics = list.filter((c) => pictureOf(c)).length;
  return `${list.length} créatrices (${pics} photos ; champs : ${Object.keys(list[0] || {}).join(', ')}), ${emps.length} employés`;
}

async function ifwSalesWindow(accountId, start, end) {
  const id = accountId.slice(4);
  let list;
  try {
    list = await ifwAll('/v1/transaction-perf/details', { creatorId: id, startTime: start, endTime: end });
  } catch (e) {
    // fenêtre trop proche de « maintenant » : on recule la fin d'une heure ; avant la création du compte : rien
    if (e.status === 400 && end > Date.now() - 2 * 3600_000) list = await ifwAll('/v1/transaction-perf/details', { creatorId: id, startTime: start, endTime: Date.now() - 3600_000 });
    else if (e.status === 400 || e.status === 403) return 0;
    else throw e;
  }
  const now = Date.now();
  const st = upSale();
  tx(() => {
    for (const s of list) {
      const at = msOf(s.createdTime);
      if (!at) continue;
      st.run(`ifw:${s.id}`, 'ifw', accountId, 'onlyfans', s.fanId ? String(s.fanId) : null, s.fanName ?? null, at, typeOf(s.type), s.type ?? null,
        num(s.amount), num(s.net), s.currency ?? 'USD', s.status ?? null, s.attributeEmployeeId ? `ifw:${s.attributeEmployeeId}` : null, now, now);
    }
  });
  return list.length;
}
const ifwAccounts = () => all("SELECT id FROM rv_accounts WHERE src = 'ifw' AND connected = 1").map((r) => r.id);
async function ifwRecent(days) {
  let n = 0;
  for (const a of ifwAccounts()) n += await ifwSalesWindow(a, Date.now() - days * DAY, Date.now());
  return `${n} ventes lues (${days} j)`;
}
/** Historique : 30 jours par compte et par passage, du plus récent au plus ancien, jusqu'à 1 an. */
async function ifwBackfill() {
  const floor = Date.now() - 365 * DAY;
  for (const a of ifwAccounts()) {
    const key = `rv:bf:${a}`;
    const done = Number(getSetting(key) ?? Date.now());
    if (done <= floor) continue;
    const start = Math.max(done - 30 * DAY, floor);
    const n = await ifwSalesWindow(a, start, done);
    setSetting(key, String(start));
    return `${a} ${parisDay(start)} → ${parisDay(done)} : ${n}`;
  }
  return null;
}

// ---------------------------------------------------------------- rapports journaliers d'Infloww
const nn = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? 0 : Math.round(Number(v)));
const nOrNull = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Math.round(Number(v)));
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const ymdUtc = (t) => new Date(t).toISOString().slice(0, 10);

/** Ventes et chatting par employé × créatrice × jour (Employee reports). */
async function ifwEmpReports(from, to) {
  const ids = all("SELECT id FROM rv_sellers WHERE id LIKE 'ifw:%' AND COALESCE(status, '') != 'Deleted'").map((r) => r.id.slice(4));
  const us = db.prepare(`INSERT INTO ifw_emp_sales_daily (day, employee_id, platform_pid, sales, ppv, tips, dm, prio_mass, mass) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET sales = excluded.sales, ppv = excluded.ppv, tips = excluded.tips, dm = excluded.dm, prio_mass = excluded.prio_mass, mass = excluded.mass`);
  const uc = db.prepare(`INSERT INTO ifw_emp_chat_daily (day, employee_id, platform_pid, msgs, ppvs, ppv_unlocked, fans_chatted, chars, rt_sched, rt_clock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET msgs = excluded.msgs, ppvs = excluded.ppvs, ppv_unlocked = excluded.ppv_unlocked, fans_chatted = excluded.fans_chatted,
      chars = excluded.chars, rt_sched = excluded.rt_sched, rt_clock = excluded.rt_clock`);
  let rows = 0;
  for (const group of chunks(ids, 10)) {
    const p = { employeeIds: group, startTime: from, endTime: to };
    const s = await ifwAll('/v1/employee-report/employee-sales-summary', p, 50);
    const c = await ifwAll('/v1/employee-report/employee-chat-summary', p, 50);
    tx(() => {
      for (const r of s) us.run(r.date, String(r.employeeId), String(r.platformPid), nn(r.salesAmount), nn(r.ppvSalesAmount), nn(r.tipsSalesAmount), nn(r.directMessageSalesAmount), nn(r.priorityMassMessageSalesAmount), nn(r.massMessageSalesAmount));
      for (const r of c) uc.run(r.date, String(r.employeeId), String(r.platformPid), nn(r.directMessagesSent), nn(r.directPpvsSent), nn(r.ppvsUnlocked), nn(r.fansChatted), nn(r.characterCount), nn(r.responseTimeBasedOnScheduledHours), nn(r.responseTimeBasedOnClockedHours));
    });
    rows += s.length + c.length;
  }
  return rows;
}

const CREATOR_REPORTS = [
  ['/v1/creator-report/fans/subscriber-count', (r) => ({ new_subs: nOrNull(r.newSubscribers), renewals: nOrNull(r.subscriberRenewals) })],
  ['/v1/creator-report/fans/count', (r) => ({ active_fans: nOrNull(r.activeFans), expired_fans: nOrNull(r.expiredFans) })],
  ['/v1/creator-report/fans/renew-on', (r) => ({ renew_on: nOrNull(r.fansWithRenewOn) })],
  ['/v1/creator-report/fans/avg-subscription-length', (r) => ({ avg_sub_len: nOrNull(r.avgSubscriptionLength) })],
  ['/v1/creator-report/reach/profile-visitor-count', (r) => ({ visitors: nOrNull(r.profileVisitors), visitors_guest: nOrNull(r.guestProfileVisitors), visitors_logged: nOrNull(r.loggedInUsersProfileVisitors) })],
];
function upCreatorDay(day, pid, fields) {
  const ks = Object.keys(fields);
  if (!ks.length) return;
  db.prepare(`INSERT INTO ifw_creator_daily (day, platform_pid, ${ks.join(', ')}) VALUES (?, ?, ${ks.map(() => '?').join(', ')})
    ON CONFLICT (day, platform_pid) DO UPDATE SET ${ks.map((k) => `${k} = excluded.${k}`).join(', ')}`).run(day, pid, ...ks.map((k) => fields[k]));
}
/** Abonnés, fans, visiteurs, messages… par créatrice × jour (Creator reports). */
async function ifwCreatorReports(from, to) {
  const ids = all("SELECT id FROM rv_accounts WHERE src = 'ifw' AND connected = 1").map((r) => r.id.slice(4));
  let rows = 0;
  for (const group of chunks(ids, 10)) {
    for (const [path, map] of CREATOR_REPORTS) {
      let list;
      try {
        list = await ifwAll(path, { creatorIds: group, startTime: from, endTime: to }, 20);
      } catch (e) {
        if (e.status === 403 || e.status === 400) continue;
        throw e;
      }
      tx(() => list.forEach((r) => r.date && upCreatorDay(r.date, String(r.platformPid), map(r))));
      rows += list.length;
    }
    // chat-summary : total de la plage demandée (pas de date) → un appel par jour.
    for (let d = from; d <= to; d = ymdUtc(Date.parse(`${d}T12:00:00Z`) + DAY)) {
      try {
        const list = await ifwAll('/v1/creator-report/chat-summary', { creatorIds: group, startTime: d, endTime: d }, 5);
        tx(() => list.forEach((r) => upCreatorDay(d, String(r.platformPid), { msgs_sent: nOrNull(r.messagesSent), ppvs_sent: nOrNull(r.ppvsSent), fans_chatted: nOrNull(r.fansChatted), reply_time: nOrNull(r.replyTime) })));
        rows += list.length;
      } catch (e) {
        if (e.status !== 403 && e.status !== 400) throw e;
      }
    }
  }
  return rows;
}
const recentReports = async (fn) => `${await fn(ymdUtc(Date.now() - 4 * DAY), ymdUtc(Date.now()))} lignes`;
/** Historique des rapports (1 an), 30 jours par passage : d'abord les employés, puis les créatrices. */
async function ifwReportsBackfill() {
  const floor = Date.now() - 365 * DAY;
  for (const [key, fn] of [['rv:bf:emp-reports', ifwEmpReports], ['rv:bf:creator-reports', ifwCreatorReports]]) {
    const done = Number(getSetting(key) ?? Date.now() - 4 * DAY);
    if (done <= floor) continue;
    const start = Math.max(done - 29 * DAY, floor);
    const n = await fn(ymdUtc(start), ymdUtc(done));
    setSetting(key, String(start - DAY));
    return `${key.slice(6)} ${ymdUtc(start)} → ${ymdUtc(done)} : ${n} lignes`;
  }
  return null;
}

// ---------------------------------------------------------------- MyPulse (MYM)
async function mpCatalog() {
  const now = Date.now();
  const { data: cs } = await mp('/api/v1/creators');
  const { data: us } = await mp('/api/v1/users');
  const up = db.prepare(`INSERT INTO rv_accounts (id, src, platform, name, nick, username, connected, updated_at) VALUES (?, 'mp', 'mym', ?, NULL, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET name = excluded.name, username = excluded.username, connected = excluded.connected, updated_at = excluded.updated_at`);
  const ue = db.prepare('INSERT INTO rv_sellers (id, name, updated_at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at');
  tx(() => {
    for (const c of cs ?? []) up.run(`mp:${c.id}`, c.pseudo ?? '?', c.pseudo ?? null, c.active ? 1 : 0, now);
    for (const u of us ?? []) ue.run(`mp:${u.user_id}`, String(u.email || u.pseudo || u.user_id).split('@')[0], now);
  });
  autoMap();
  return `${cs?.length ?? 0} créatrices, ${us?.length ?? 0} membres`;
}
async function mpSalesWindow(start, end) {
  const st = upSale();
  let n = 0;
  for (let page = 1; page <= 500; page++) {
    const b = await mp('/api/v1/team/money', { start: new Date(start).toISOString(), end: new Date(end).toISOString(), per_page: 200, page });
    const now = Date.now();
    tx(() => {
      for (const s of b.data ?? []) {
        const at = Date.parse(s.date);
        if (!at) continue;
        const net = cents(s.net ?? s.amount);
        st.run(`mp:${s.payment_id}`, 'mp', `mp:${s.creator_id}`, 'mym', s.fan_id ? String(s.fan_id) : null, s.fan ?? null, at, typeOf(s.kind || s.type), s.type ?? s.kind ?? null,
          cents(s.amount), net, s.currency ?? 'EUR', s.status ?? null, s.attributed_user_id ? `mp:${s.attributed_user_id}` : null, now, now);
      }
    });
    n += b.data?.length ?? 0;
    if (!b.pagination?.has_more) break;
  }
  return n;
}
/** Historique MyPulse : fenêtres de 90 jours (maximum de l'API : 92), jusqu'à 1 an. */
async function mpBackfill() {
  const floor = Date.now() - 365 * DAY;
  const done = Number(getSetting('rv:bf:mp') ?? Date.now());
  if (done <= floor) return null;
  const start = Math.max(done - 90 * DAY, floor);
  const n = await mpSalesWindow(start, done);
  setSetting('rv:bf:mp', String(start));
  return `MYM ${parisDay(start)} → ${parisDay(done)} : ${n}`;
}

// ---------------------------------------------------------------- taux USD → EUR (BCE)
async function syncFx() {
  const from = parisDay(Date.now() - 400 * DAY);
  const to = parisDay(Date.now());
  const r = await fetch(`https://api.frankfurter.dev/v1/${from}..${to}?base=USD&symbols=EUR`, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`BCE : ${r.status}`);
  const pub = Object.entries((await r.json()).rates ?? {})
    .map(([d, v]) => [d, Number(v.EUR)])
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  if (!pub.length) throw new Error('BCE : aucun taux');
  const byDay = new Map(pub);
  let rate = pub[0][1];
  const up = db.prepare('INSERT INTO fx_usd_eur (day, rate) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET rate = excluded.rate');
  tx(() => {
    for (let d = from; d <= to; d = addDay(d, 1)) {
      if (byDay.has(d)) rate = byDay.get(d);
      up.run(d, rate);
    }
  });
  return `dernier taux ${rate}`;
}

// ---------------------------------------------------------------- créatrices Bloom ↔ comptes Infloww / MyPulse
let substyCreators = []; // [{ id, name, platform }] fourni par le serveur
export function setCreators(list) {
  substyCreators = list;
  autoMap();
}
const norm = (s) => String(s || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const prefix = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};
/** Relie chaque créatrice à son compte : même plateforme, nom le plus proche (au moins 4 lettres en commun au début, sans égalité). */
function autoMap() {
  for (const c of substyCreators) {
    const cur = one('SELECT manual FROM rv_map WHERE creator_id = ?', c.id);
    if (cur?.manual) continue;
    const src = /mym/i.test(c.platform || '') ? 'mp' : 'ifw';
    const me = norm(c.name);
    let best = null;
    let bestScore = 3;
    let tie = false;
    for (const a of all('SELECT id, name, nick, username FROM rv_accounts WHERE src = ?', src)) {
      const score = Math.max(...[a.name, a.nick, a.username].map((x) => (norm(x) === me ? 100 : prefix(norm(x), me))));
      if (score > bestScore) {
        best = a.id;
        bestScore = score;
        tie = false;
      } else if (score === bestScore && best) tie = true;
    }
    const account = best && !tie ? best : null;
    run('INSERT INTO rv_map (creator_id, account, manual, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT (creator_id) DO UPDATE SET account = excluded.account, updated_at = excluded.updated_at', c.id, account, Date.now());
  }
}
export function setMap(creatorId, account) {
  if (account && !one('SELECT 1 FROM rv_accounts WHERE id = ?', account)) throw Object.assign(new Error('Compte inconnu'), { status: 400 });
  run('INSERT INTO rv_map (creator_id, account, manual, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (creator_id) DO UPDATE SET account = excluded.account, manual = 1, updated_at = excluded.updated_at', creatorId, account || null, Date.now());
  if (!account) run('UPDATE rv_map SET manual = 0 WHERE creator_id = ?', creatorId), autoMap();
  matchLive();
}
export const mapping = () => ({
  map: all('SELECT creator_id AS creatorId, account, manual FROM rv_map'),
  accounts: all('SELECT id, src, platform, name, nick, username, connected FROM rv_accounts ORDER BY platform, name'),
});

// ---------------------------------------------------------------- ventes en direct de Substy → rapprochement
function parsePrice(p) {
  const s = String(p || '');
  const currency = s.includes('€') ? 'EUR' : 'USD';
  const v = Number(s.replace(/[^0-9.,-]/g, '').replace(',', '.'));
  return { gross: Number.isFinite(v) ? Math.round(v * 100) : 0, currency };
}
/** Ventes récentes de Substy (lues toutes les 30 s par le serveur). */
export function recordLive(list) {
  const now = Date.now();
  const ins = db.prepare(`INSERT OR IGNORE INTO rv_live (id, creator_id, type, at, gross, currency, fan_id, fan_name, message_id, matched, first_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`);
  tx(() => {
    for (const s of list || []) {
      const at = Date.parse(s.createdAt || s.at);
      if (!at || !s.creatorId) continue;
      const { gross, currency } = parsePrice(s.price);
      ins.run(String(s.id), String(s.creatorId), s.type || null, at, gross, currency, s.userId ? String(s.userId) : s.fanId || null, s.userName ?? s.fan ?? null, s.messageId ? String(s.messageId) : null, now);
    }
  });
  matchLive();
}

/**
 * D'où vient une vente rapprochée. ATTENTION : le flux « ventes » de Substy contient TOUTES les ventes de la créatrice
 * (même celles faites depuis Infloww). On ne donne donc une origine que si Bloom connaît l'expéditeur du PPV acheté :
 * l'IA Substy, un chatteur dans Bloom, ou une automatisation / un script Substy. Sinon : null (on garde l'attribution
 * d'Infloww / MyPulse).
 */
function originOfLive(l) {
  if (!l.message_id) return { origin: null, by: null };
  const m = one('SELECT kind, by_name FROM msg_log WHERE id = ?', l.message_id);
  if (!m) return { origin: null, by: null };
  if (m.kind === 'ai') return { origin: 'ai', by: null };
  if (m.kind === 'bloom') return { origin: 'bloom', by: m.by_name || null };
  if (m.kind === 'auto' || m.kind === 'script') return { origin: 'substy', by: null };
  return { origin: null, by: null };
}
// Correction (22/11/2026) : les ventes classées « substy » juste parce qu'elles étaient dans le flux Substy.
if (!getSetting('rv:fix-origin-1')) {
  run("UPDATE rv_sales SET origin = NULL, origin_by = NULL WHERE origin = 'substy'");
  setSetting('rv:fix-origin-1', '1');
}

/** Relie chaque vente Substy à la vente officielle (même compte, même fan, ≤ 2 min d'écart). */
export function matchLive() {
  const live = all('SELECT l.*, m.account FROM rv_live l JOIN rv_map m ON m.creator_id = l.creator_id WHERE l.matched IS NULL AND m.account IS NOT NULL AND l.at > ?', Date.now() - 14 * DAY);
  for (const l of live) {
    const cands = all('SELECT id, fan_id, fan_name, at FROM rv_sales WHERE account = ? AND substy_id IS NULL AND at BETWEEN ? AND ?', l.account, l.at - 120_000, l.at + 120_000);
    const same = (c) => (l.fan_id && c.fan_id ? c.fan_id === l.fan_id : !!l.fan_name && norm(c.fan_name) === norm(l.fan_name));
    const hit = cands.filter(same).sort((a, b) => Math.abs(a.at - l.at) - Math.abs(b.at - l.at))[0];
    if (!hit) continue;
    const o = originOfLive(l);
    tx(() => {
      run('UPDATE rv_sales SET substy_id = ?, origin = ?, origin_by = ? WHERE id = ?', l.id, o.origin, o.by, hit.id);
      run('UPDATE rv_live SET matched = ? WHERE id = ?', hit.id, l.id);
    });
  }
}

// ---------------------------------------------------------------- tâches de fond
const JOBS = [
  { name: 'fx', every: 6 * 3600_000, ok: () => true, run: syncFx },
  { name: 'ifw-catalog', every: 30 * 60_000, ok: ifwReady, run: ifwCatalog },
  { name: 'ifw-sales', every: 2 * 60_000, ok: ifwReady, run: () => ifwRecent(2) },
  { name: 'ifw-settle', every: 3 * 3600_000, ok: ifwReady, run: () => ifwRecent(14) },
  { name: 'ifw-emp-reports', every: 60 * 60_000, ok: ifwReady, run: () => recentReports(ifwEmpReports) },
  { name: 'ifw-creator-reports', every: 60 * 60_000, ok: ifwReady, run: () => recentReports(ifwCreatorReports) },
  { name: 'mp-catalog', every: 30 * 60_000, ok: mpReady, run: mpCatalog },
  { name: 'mp-sales', every: 3 * 60_000, ok: mpReady, run: async () => `${await mpSalesWindow(Date.now() - 3 * DAY, Date.now())} ventes lues (3 j)` },
];
const jobState = {};
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    for (const j of JOBS) {
      if (!j.ok()) continue;
      const due = Number(getSetting(`rv:due:${j.name}`) || 0);
      if (Date.now() < due) continue;
      try {
        const detail = await j.run();
        jobState[j.name] = { at: Date.now(), ok: true, detail };
        setSetting(`rv:due:${j.name}`, String(Date.now() + j.every));
      } catch (e) {
        jobState[j.name] = { at: Date.now(), ok: false, detail: e.message };
        console.warn(`[revenus] ${j.name} :`, e.message);
        setSetting(`rv:due:${j.name}`, String(Date.now() + 5 * 60_000)); // nouvel essai dans 5 min
      }
    }
    matchLive();
    // Historique : un morceau par passage, quand tout le reste est à jour.
    for (const [name, ok, fn] of [
      ['ifw-backfill', ifwReady, ifwBackfill],
      ['ifw-reports-backfill', ifwReady, ifwReportsBackfill],
      ['mp-backfill', mpReady, mpBackfill],
    ]) {
      if (!ok()) continue;
      try {
        const d = await fn();
        jobState[name] = { at: Date.now(), ok: true, detail: d ?? 'historique complet (1 an)' };
      } catch (e) {
        jobState[name] = { at: Date.now(), ok: false, detail: e.message };
      }
    }
  } finally {
    running = false;
  }
}
export function startRevenue() {
  setTimeout(tick, 5_000);
  setInterval(tick, 20_000);
  setInterval(() => run('DELETE FROM rv_live WHERE at < ?', Date.now() - 60 * DAY), 6 * 3600_000);
}

export function status() {
  return {
    infloww: ifwReady(),
    mypulse: mpReady(),
    jobs: jobState,
    sales: one('SELECT COUNT(*) AS n, MIN(at) AS first FROM rv_sales'),
    ...mapping(),
  };
}

// ---------------------------------------------------------------- chiffres d'une période
const fxCache = { at: 0, map: new Map(), last: 0.92 };
function fxRate(day) {
  if (Date.now() - fxCache.at > 10 * 60_000) {
    const rows = all('SELECT day, rate FROM fx_usd_eur');
    fxCache.map = new Map(rows.map((r) => [r.day, r.rate]));
    fxCache.last = rows.length ? rows.sort((a, b) => (a.day < b.day ? 1 : -1))[0].rate : 0.92;
    fxCache.at = Date.now();
  }
  return fxCache.map.get(day) ?? fxCache.last;
}
export const toEur = (cents, currency, day) => (currency === 'USD' ? Math.round(cents * fxRate(day)) : cents);
// Part nette d'une vente Substy (prix affiché = brut) : OnlyFans garde 20 % ; MYM : rapport net / brut observé sur les ventes déjà rapprochées.
function netRatio(account, platform) {
  if (platform === 'onlyfans') return 0.8;
  const r = one(
    'SELECT AVG(CAST(s.net AS REAL) / l.gross) AS r FROM rv_sales s JOIN rv_live l ON l.id = s.substy_id WHERE s.account = ? AND l.gross > 0 AND s.at > ?',
    account,
    Date.now() - 30 * DAY,
  )?.r;
  return r && r > 0.3 && r <= 1 ? r : 0.75;
}

/**
 * Chiffres de [from, to] (jours de Paris, inclus) pour les créatrices de Bloom.
 * Ventes officielles + ventes Substy pas encore arrivées d'Infloww / MyPulse (« provisoires », moins de 24 h).
 */
export function revenue({ from, to, creators }) {
  const start = parisMidnight(from);
  const end = parisMidnight(addDay(to, 1));
  const days = Math.round((end - start) / DAY);
  const pStart = start - days * DAY;
  const maps = all('SELECT creator_id, account FROM rv_map WHERE account IS NOT NULL').filter((m) => creators.some((c) => c.id === m.creator_id));
  const acc = new Map(maps.map((m) => [m.account, m.creator_id]));
  const accounts = [...acc.keys()];
  const empty = { from, to, total: 0, prev: 0, provisional: 0, sales: 0, buyers: 0, byType: {}, byOrigin: {}, days: [], creators: [], recent: [], unmapped: creators.filter((c) => !maps.some((m) => m.creator_id === c.id)).map((c) => c.id) };
  if (!accounts.length) return empty;
  const ph = accounts.map(() => '?').join(',');
  const rows = all(`SELECT id, account, platform, fan_id, fan_name, at, type, net, currency, status, seller, origin, origin_by FROM rv_sales WHERE account IN (${ph}) AND at >= ? AND at < ?`, ...accounts, pStart, end);
  // Ventes Substy pas encore confirmées (récentes uniquement : au-delà de 24 h (MyPulse peut avoir plusieurs heures de retard), une vente non confirmée n'est pas comptée).
  const live = all(
    `SELECT l.*, m.account, a.platform FROM rv_live l JOIN rv_map m ON m.creator_id = l.creator_id JOIN rv_accounts a ON a.id = m.account
     WHERE l.matched IS NULL AND m.account IN (${ph}) AND l.at >= ? AND l.at < ? AND l.at > ?`,
    ...accounts,
    start,
    end,
    Date.now() - 24 * 3600_000,
  );
  const sellers = new Map(all('SELECT id, name FROM rv_sellers').map((s) => [s.id, s.name]));
  const out = { ...empty, unmapped: empty.unmapped };
  const perCreator = new Map();
  const perDay = new Map();
  for (let d = from; d <= to; d = addDay(d, 1)) perDay.set(d, { day: d, onlyfans: 0, mym: 0, provisional: 0 });
  const buyers = new Set();
  const cr = (id) => {
    if (!perCreator.has(id)) perCreator.set(id, { creatorId: id, account: maps.find((m) => m.creator_id === id)?.account, platform: null, currency: null, net: 0, eur: 0, prev: 0, provisional: 0, sales: 0, byType: {}, byOrigin: {} });
    return perCreator.get(id);
  };
  const originOf = (r) => (r.type === 'sub' ? 'sub' : r.origin || (r.seller ? 'chatter' : 'other'));
  for (const r of rows) {
    if (REFUND.test(r.status || '')) continue;
    const day = parisDay(r.at);
    const eur = toEur(r.net, r.currency, day);
    const c = cr(acc.get(r.account));
    if (r.at < start) {
      c.prev += eur;
      out.prev += eur;
      continue;
    }
    c.platform = r.platform;
    c.currency = r.currency;
    c.net += r.net;
    c.eur += eur;
    c.sales++;
    c.byType[r.type] = (c.byType[r.type] || 0) + eur;
    const o = originOf(r);
    c.byOrigin[o] = (c.byOrigin[o] || 0) + eur;
    out.total += eur;
    out.sales++;
    out.byType[r.type] = (out.byType[r.type] || 0) + eur;
    out.byOrigin[o] = (out.byOrigin[o] || 0) + eur;
    if (r.fan_id || r.fan_name) buyers.add(`${r.account}:${r.fan_id || r.fan_name}`);
    const pd = perDay.get(day);
    if (pd) pd[r.platform === 'mym' ? 'mym' : 'onlyfans'] += eur;
  }
  for (const l of live) {
    const day = parisDay(l.at);
    const net = Math.round(l.gross * netRatio(l.account, l.platform));
    const eur = toEur(net, l.currency, day);
    const c = cr(acc.get(l.account));
    c.provisional += eur;
    c.eur += eur;
    out.provisional += eur;
    out.total += eur;
    const pd = perDay.get(day);
    if (pd) pd.provisional += eur;
  }
  out.buyers = buyers.size;
  out.days = [...perDay.values()];
  out.creators = [...perCreator.values()];
  // Dernières ventes de la période (officielles + provisoires), avec leur origine.
  const recent = rows
    .filter((r) => r.at >= start && !REFUND.test(r.status || ''))
    .sort((a, b) => b.at - a.at)
    .slice(0, 40)
    .map((r) => ({
      id: r.id,
      creatorId: acc.get(r.account),
      at: new Date(r.at).toISOString(),
      type: r.type,
      net: r.net,
      currency: r.currency,
      fan: r.fan_name,
      fanId: r.platform === 'onlyfans' ? r.fan_id : null,
      origin: originOf(r),
      // Vente rapprochée de Substy : on montre qui l'a faite dans Bloom (pas l'attribution automatique d'Infloww / MyPulse).
      by: r.origin ? r.origin_by || null : r.seller ? sellers.get(r.seller) || null : null,
      provisional: false,
    }));
  for (const l of live)
    recent.push({
      id: `live:${l.id}`,
      creatorId: acc.get(l.account),
      at: new Date(l.at).toISOString(),
      type: /tip/i.test(l.type || '') ? 'tip' : /post/i.test(l.type || '') ? 'post' : 'ppv',
      net: Math.round(l.gross * netRatio(l.account, l.platform)),
      currency: l.currency,
      fan: l.fan_name,
      fanId: l.fan_id,
      origin: originOfLive(l).origin,
      by: originOfLive(l).by,
      provisional: true,
    });
  out.recent = recent.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 40);
  return out;
}

// ---------------------------------------------------------------- performances (page Performances)
/**
 * Qui a fait le chiffre sur la période : chaque vente confirmée (hors abonnements) va à celui qui l'a faite —
 * chatteur Bloom (PPV envoyé depuis Bloom), IA Substy, chatteur attribué par Infloww / MyPulse, sinon « sans chatteur ».
 * Montants nets en centimes d'euro. Avec la période d'avant (même durée) pour comparer.
 */
export function performance({ from, to, creators }) {
  const start = parisMidnight(from);
  const end = parisMidnight(addDay(to, 1));
  const pStart = start - (end - start);
  const maps = all('SELECT creator_id, account FROM rv_map WHERE account IS NOT NULL').filter((m) => creators.some((c) => c.id === m.creator_id));
  const acc = new Map(maps.map((m) => [m.account, m.creator_id]));
  const out = { from, to, total: 0, prev: 0, subs: 0, sellers: [], creators: [] };
  if (!acc.size) return out;
  const accounts = [...acc.keys()];
  const ph = accounts.map(() => '?').join(',');
  const rows = all(`SELECT account, fan_id, fan_name, at, type, net, currency, status, seller, origin, origin_by FROM rv_sales WHERE account IN (${ph}) AND at >= ? AND at < ?`, ...accounts, pStart, end);
  const sellerName = new Map(all('SELECT id, name FROM rv_sellers').map((s) => [s.id, s.name]));
  const sellers = new Map();
  const perCreator = new Map();
  const who = (r) =>
    r.origin === 'ai' ? ['ai', 'IA Substy', 'ai']
    : r.origin === 'bloom' && r.origin_by ? [`bloom:${r.origin_by}`, r.origin_by, 'bloom']
    : r.seller ? [`seller:${r.seller}`, sellerName.get(r.seller) || 'Chatteur inconnu', 'platform']
    : ['other', 'Sans chatteur', 'other'];
  for (const r of rows) {
    if (REFUND.test(r.status || '')) continue;
    const eur = toEur(r.net, r.currency, parisDay(r.at));
    const cid = acc.get(r.account);
    const cur = r.at >= start;
    if (!perCreator.has(cid)) perCreator.set(cid, { creatorId: cid, eur: 0, prev: 0, subs: 0, sellers: {} });
    const c = perCreator.get(cid);
    if (cur) out.total += eur;
    else out.prev += eur;
    cur ? (c.eur += eur) : (c.prev += eur);
    if (r.type === 'sub') {
      if (cur) (out.subs += eur), (c.subs += eur);
      continue;
    }
    const [key, name, kind] = who(r);
    if (!sellers.has(key)) sellers.set(key, { key, name, kind, eur: 0, prev: 0, sales: 0, ppv: 0, tips: 0, other: 0, buyers: new Set(), creators: {}, best: 0 });
    const s = sellers.get(key);
    if (!cur) {
      s.prev += eur;
      continue;
    }
    s.eur += eur;
    s.sales++;
    if (r.type === 'ppv') s.ppv += eur;
    else if (r.type === 'tip') s.tips += eur;
    else s.other += eur;
    s.best = Math.max(s.best, eur);
    if (r.fan_id || r.fan_name) s.buyers.add(`${r.account}:${r.fan_id || r.fan_name}`);
    s.creators[cid] = (s.creators[cid] || 0) + eur;
    c.sellers[key] = (c.sellers[key] || 0) + eur;
  }
  // Activité dans Bloom sur la période : messages et PPV envoyés par personne.
  const sent = all(
    `SELECT u.name AS name, COUNT(*) AS msgs, SUM(s.price > 0) AS ppv FROM sent_log s JOIN users u ON u.id = s.user_id
     WHERE s.at >= ? AND s.at < ? AND s.creator_id IN (${creators.map(() => '?').join(',') || "''"}) GROUP BY u.id`,
    start,
    end,
    ...creators.map((c) => c.id),
  );
  for (const a of sent) {
    const key = `bloom:${a.name}`;
    if (!sellers.has(key)) sellers.set(key, { key, name: a.name, kind: 'bloom', eur: 0, prev: 0, sales: 0, ppv: 0, tips: 0, other: 0, buyers: new Set(), creators: {}, best: 0 });
    Object.assign(sellers.get(key), { msgs: a.msgs, ppvSent: a.ppv || 0 });
  }
  out.sellers = [...sellers.values()]
    .map(({ buyers, ...s }) => ({ ...s, buyers: buyers.size, msgs: s.msgs ?? null, ppvSent: s.ppvSent ?? null }))
    .filter((s) => s.eur || s.prev || s.msgs)
    .sort((a, b) => b.eur - a.eur || b.prev - a.prev);
  out.creators = [...perCreator.values()].sort((a, b) => b.eur - a.eur);
  return out;
}
