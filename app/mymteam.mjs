// MYM → Pilotage d'équipe (copies de MyPulse) : Message Dashboard, Ventes équipe, Contrôle des shifts.
// Sources, toutes déjà remplies par Bloom :
//  - `msg_log` : chaque message vu chez MYM (texte, heure, prix, médias, acheté, temps de réponse, auteur), 120 jours ;
//  - `rv_live` (src = 'mym') : les ventes lues chez MYM, avec `origin` / `origin_by` = qui a fait la vente (14 jours).
// ⚠️ Qui a écrit : Bloom ne connaît le NOM que pour ce qui part de Bloom (`sent_log`). Un message écrit ailleurs (IA de
// Substy, IA ou chatteur d'un autre outil comme MyPulse, appli MYM) arrive sans nom : il est rangé sous « Hors Bloom »
// (kind `ai`, fan dont l'IA est active) ou « Compte MYM » (kind `creator`). MYM ne dit jamais qui a écrit.
// Shifts : une « vacation » = une suite de messages d'un chatteur sans trou de plus de `cut` minutes ; le temps actif
// additionne les écarts de moins de `idle` minutes (1 minute comptée à chaque reprise). Heures de Paris.
import { all, one } from './store.mjs';
import { isLinked } from './mym.mjs';
import { inboxChat, plain } from './chat.mjs';
import { canSee, isBoss } from './team.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';

const DAY = 864e5;
const MIN = 60_000;
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const hm = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const okDay = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);

/** Auteur d'une ligne de `msg_log` ou d'une vente → clé stable + nom affiché. */
export function senderOf(kind, name) {
  if ((kind === 'bloom' || kind === 'employee') && name) return { key: `n:${name}`, name, type: 'human' };
  if (kind === 'ai') return { key: 'ext', name: 'Hors Bloom', type: 'ext' };
  if (kind === 'auto' || kind === 'script') return { key: 'auto', name: 'Automatisation', type: 'auto' };
  if (kind === 'bloom' || kind === 'employee') return { key: 'team', name: 'Équipe (sans nom)', type: 'human' };
  return { key: 'creator', name: 'Compte MYM', type: 'creator' };
}
const senderSql = (s, col = 'm') => {
  if (s === 'ext') return [`${col}.kind = 'ai'`, []];
  if (s === 'auto') return [`${col}.kind IN ('auto', 'script')`, []];
  if (s === 'creator') return [`COALESCE(${col}.kind, 'creator') = 'creator'`, []];
  if (s === 'team') return [`${col}.kind IN ('bloom', 'employee') AND ${col}.by_name IS NULL`, []];
  if (s?.startsWith('n:')) return [`${col}.kind IN ('bloom', 'employee') AND ${col}.by_name = ?`, [s.slice(2)]];
  return [null, []];
};

/** Les vacations d'une suite de messages triés ({ at, cid }). */
export function vacations(msgs, idleMin = 3, cutMin = 60) {
  const out = [];
  let cur = null;
  for (const m of msgs) {
    if (!cur || m.at - cur.end >= cutMin * MIN) {
      cur = { start: m.at, end: m.at, active: MIN, n: 0, models: new Map() };
      out.push(cur);
    } else {
      const gap = m.at - cur.end;
      cur.active += gap < idleMin * MIN ? gap : MIN;
      cur.end = m.at;
    }
    cur.n++;
    cur.models.set(m.cid, (cur.models.get(m.cid) || 0) + 1);
  }
  return out.map((v) => ({ start: v.start, end: v.end, activeMin: Math.max(1, Math.round(v.active / MIN)), messages: v.n, models: [...v.models].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n) }));
}
const median = (l) => {
  if (!l.length) return null;
  const s = [...l].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

export function mymTeamRoutes({ userFrom, send, creators }) {
  /** Team leader ou plus + ses comptes MYM reliés (éventuellement un seul). */
  const scope = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    const p = new URL(req.url, 'http://x').searchParams;
    const meta = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [m.creator_id, m.nickname]));
    const list = creators().filter((c) => /mym/i.test(c.platform || '') && isLinked(c.id) && canSee({ ...u, pf: null }, c.id)).map((c) => ({ id: String(c.id), name: meta.get(String(c.id)) || c.name }));
    const want = (p.get('creators') || p.get('creatorId') || '').split(',').filter(Boolean);
    const cids = (want.length ? list.filter((c) => want.includes(c.id)) : list).map((c) => c.id);
    return { u, p, list, cids, names: new Map(list.map((c) => [c.id, c.name])), inSql: cids.map(() => '?').join(',') };
  };
  const span = (p) => {
    const now = Date.now();
    let end = Number(p.get('end')) || now;
    let start = Number(p.get('start')) || end - DAY;
    if (start >= end) start = end - DAY;
    if (end - start > 120 * DAY) start = end - 120 * DAY;
    return [start, end];
  };
  const fanName = (cid, fid) => inboxChat(cid, fid)?.name || 'Fan';
  const sendersIn = (x, start, end) =>
    all(`SELECT m.kind, CASE WHEN m.kind IN ('bloom', 'employee') THEN m.by_name END AS name, COUNT(*) AS n FROM msg_log m WHERE m.from_fan = 0 AND m.creator_id IN (${x.inSql}) AND m.at >= ? AND m.at < ? GROUP BY 1, 2`, ...x.cids, start, end)
      .reduce((acc, r) => {
        const s = senderOf(r.kind, r.name);
        const hit = acc.find((a) => a.key === s.key);
        if (hit) hit.n += r.n;
        else acc.push({ ...s, n: r.n });
        return acc;
      }, [])
      .sort((a, b) => b.n - a.n);

  return {
    // ------------------------------------------------------------ Message Dashboard
    'GET /api/mym/team/messages': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      const [start, end] = span(x.p);
      if (!x.cids.length) return send(res, 200, { rows: [], total: 0, page: 1, pages: 1, senders: [], summary: [], creators: x.list, start, end, since: null });
      const base = ['m.from_fan = 0', 'm.deleted = 0', `m.creator_id IN (${x.inSql})`, 'm.at >= ?', 'm.at < ?'];
      const args = [...x.cids, start, end];
      const type = x.p.get('type');
      if (type === 'ppv') base.push('(m.price > 0 OR m.medias > 0)');
      if (type === 'free') base.push('m.medias > 0 AND m.price = 0');
      if (type === 'paid') base.push('m.price > 0');
      if (type === 'bought') base.push('m.price > 0 AND m.paid = 1');
      if (type === 'unbought') base.push('m.price > 0 AND COALESCE(m.paid, 0) = 0');
      const q = String(x.p.get('q') || '').trim().toLowerCase();
      if (q) base.push("LOWER(COALESCE(m.text, '')) LIKE ?"), args.push(`%${q.replace(/[%_]/g, '')}%`);
      // Résumé par chatteur : sur toute la sélection, sans le filtre de chatteur ni la pagination.
      const summary = all(
        `SELECT m.kind, CASE WHEN m.kind IN ('bloom', 'employee') THEN m.by_name END AS name, COUNT(*) AS messages, COUNT(DISTINCT m.creator_id || ':' || m.fan_id) AS fans, SUM(m.price > 0) AS ppvPaid, SUM(m.medias > 0 AND m.price = 0) AS ppvFree, AVG(m.reply_ms) AS avgMs
         FROM msg_log m WHERE ${base.join(' AND ')} GROUP BY 1, 2`, ...args)
        .reduce((acc, r) => {
          const s = senderOf(r.kind, r.name);
          const hit = acc.find((a) => a.key === s.key);
          // « auto » + « script » regroupés : les fans distincts s'additionnent (approximation).
          if (hit) (hit.messages += r.messages), (hit.fans += r.fans), (hit.ppvPaid += r.ppvPaid || 0), (hit.ppvFree += r.ppvFree || 0);
          else acc.push({ ...s, messages: r.messages, fans: r.fans, ppvPaid: r.ppvPaid || 0, ppvFree: r.ppvFree || 0, avgMs: r.avgMs == null ? null : Math.round(r.avgMs) });
          return acc;
        }, [])
        .sort((a, b) => b.messages - a.messages);
      const [ss, sa] = senderSql(x.p.get('sender'));
      if (ss) base.push(ss), args.push(...sa);
      const where = base.join(' AND ');
      const size = [50, 100, 200].includes(Number(x.p.get('size'))) ? Number(x.p.get('size')) : 50;
      const total = one(`SELECT COUNT(*) AS n FROM msg_log m WHERE ${where}`, ...args).n;
      const pages = Math.max(1, Math.ceil(total / size));
      const page = Math.min(pages, Math.max(1, Number(x.p.get('page')) || 1));
      const rows = all(`SELECT m.id, m.creator_id, m.fan_id, m.at, m.text, m.medias, m.price, m.paid, m.kind, m.by_name, m.reply_ms FROM msg_log m WHERE ${where} ORDER BY m.at DESC LIMIT ? OFFSET ?`, ...args, size, (page - 1) * size).map((m) => ({
        id: m.id, creatorId: m.creator_id, creator: x.names.get(m.creator_id) || '', fanId: m.fan_id, fan: fanName(m.creator_id, m.fan_id), at: m.at,
        text: m.text != null ? plain(m.text) : null, medias: m.medias || 0, price: m.price || 0, paid: m.price > 0 ? !!m.paid : null, sender: senderOf(m.kind, m.by_name), replyMs: m.reply_ms,
      }));
      send(res, 200, { rows, total, page, pages, senders: sendersIn(x, start, end), summary, creators: x.list, start, end, since: one(`SELECT MIN(at) AS t FROM msg_log WHERE creator_id IN (${x.inSql})`, ...x.cids)?.t || null });
    },
    // Le fil autour d'un message (loupe) : 12 messages avant, 6 après ; `before` / `after` pour en charger d'autres.
    'GET /api/mym/team/context': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      let cid = x.p.get('creator');
      let fid = x.p.get('fan');
      let at = Number(x.p.get('at')) || 0;
      const id = x.p.get('id');
      if (id) {
        const m = one('SELECT creator_id, fan_id, at FROM msg_log WHERE id = ?', id);
        if (m) (cid = m.creator_id), (fid = m.fan_id), (at = m.at);
      }
      if (!cid || !fid || !x.list.some((c) => c.id === cid)) return send(res, 404, { error: 'Conversation introuvable' });
      const view = (m) => ({ id: m.id, at: m.at, fromFan: !!m.from_fan, text: m.text != null ? plain(m.text) : null, medias: m.medias || 0, price: m.price || 0, paid: !!m.paid, sender: m.from_fan ? null : senderOf(m.kind, m.by_name) });
      const cols = 'id, at, from_fan, text, medias, price, paid, kind, by_name';
      const dir = x.p.get('dir');
      const before = dir === 'after' ? [] : all(`SELECT ${cols} FROM msg_log WHERE creator_id = ? AND fan_id = ? AND at ${dir === 'before' ? '<' : '<='} ? ORDER BY at DESC LIMIT ?`, cid, fid, at, dir === 'before' ? 15 : 13).reverse();
      const after = dir === 'before' ? [] : all(`SELECT ${cols} FROM msg_log WHERE creator_id = ? AND fan_id = ? AND at > ? ORDER BY at LIMIT ?`, cid, fid, at, dir === 'after' ? 15 : 6);
      send(res, 200, { creatorId: cid, fanId: fid, fan: fanName(cid, fid), creator: x.names.get(cid) || '', focus: id || null, messages: [...before, ...after].map(view) });
    },

    // ------------------------------------------------------------ Ventes équipe
    'GET /api/mym/team/sales': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      const [start, end] = span(x.p);
      if (!x.cids.length) return send(res, 200, { start, end, creators: x.list, sellers: [], rows: [], resume: [], total: 0, prevTotal: 0, sales: 0, prevSales: 0, ppv: 0, tips: 0 });
      const load = (a, b) => all(`SELECT id, creator_id, type, raw, at, gross, fan_id, fan_name, origin, origin_by, attr_at, message_id FROM rv_live WHERE creator_id IN (${x.inSql}) AND src = 'mym' AND type IN ('ppv', 'tip', 'push') AND gross > 0 AND at >= ? AND at < ? ORDER BY at DESC`, ...x.cids, a, b)
        .map((r) => ({ ...r, seller: r.attr_at == null || !r.origin ? { key: 'none', name: 'Non attribué', type: 'none' } : senderOf(r.origin, r.origin_by) }));
      const want = x.p.get('sender');
      const cur = load(start, end).filter((r) => !want || r.seller.key === want);
      const prev = load(start - (end - start), start).filter((r) => !want || r.seller.key === want);
      const group = (rows) => {
        const m = new Map();
        for (const r of rows) {
          const g = m.get(r.seller.key) || { ...r.seller, sales: 0, ppv: 0, tips: 0, amount: 0, caPpv: 0, caTips: 0 };
          g.sales++;
          if (r.type === 'tip') g.tips++, (g.caTips += r.gross);
          else g.ppv++, (g.caPpv += r.gross);
          g.amount += r.gross;
          m.set(r.seller.key, g);
        }
        return [...m.values()].sort((a, b) => b.amount - a.amount);
      };
      const now = group(cur);
      const old = group(prev);
      const sellers = now.map((g, i) => {
        const o = old.find((z) => z.key === g.key);
        const oi = old.findIndex((z) => z.key === g.key);
        return { ...g, amount: g.amount / 100, caPpv: g.caPpv / 100, caTips: g.caTips / 100, rank: i + 1, prevAmount: o ? o.amount / 100 : null, prevSales: o ? o.sales : null, prevRank: oi >= 0 ? oi + 1 : null };
      });
      // Résumé chatter : messages et PPV proposés sur la même période (msg_log).
      const msgs = all(`SELECT m.kind, CASE WHEN m.kind IN ('bloom', 'employee') THEN m.by_name END AS name, COUNT(*) AS messages, SUM(m.price > 0) AS proposed, AVG(m.reply_ms) AS avgMs FROM msg_log m WHERE m.from_fan = 0 AND m.deleted = 0 AND m.creator_id IN (${x.inSql}) AND m.at >= ? AND m.at < ? GROUP BY 1, 2`, ...x.cids, start, end);
      const byKey = new Map();
      for (const r of msgs) {
        const s = senderOf(r.kind, r.name);
        const h = byKey.get(s.key) || { messages: 0, proposed: 0, ms: 0, msN: 0 };
        h.messages += r.messages;
        h.proposed += r.proposed || 0;
        if (r.avgMs != null) (h.ms += r.avgMs * r.messages), (h.msN += r.messages);
        byKey.set(s.key, h);
      }
      const resume = sellers.map((g) => {
        const h = byKey.get(g.key) || { messages: 0, proposed: 0, ms: 0, msN: 0 };
        return { key: g.key, name: g.name, type: g.type, reactivity: h.msN ? Math.round(h.ms / h.msN / 1000) : null, proposed: h.proposed, sold: g.ppv, conv: h.proposed ? (g.ppv / h.proposed) * 100 : 0, golden: h.messages ? (h.proposed / h.messages) * 100 : 0, caPpv: g.caPpv, caTips: g.caTips, total: g.amount };
      });
      const sum = (l) => l.reduce((a, r) => a + r.gross, 0) / 100;
      send(res, 200, {
        start, end, creators: x.list,
        sellers, resume,
        rows: cur.slice(0, 500).map((r) => ({ id: String(r.id).replace(/^mym:/, ''), creatorId: r.creator_id, creator: x.names.get(r.creator_id) || '', seller: r.seller, fan: r.fan_name || fanName(r.creator_id, r.fan_id), fanId: r.fan_id, amount: r.gross / 100, type: r.type, at: r.at, messageId: r.message_id || null })),
        total: sum(cur), prevTotal: sum(prev), sales: cur.length, prevSales: prev.length,
        ppv: cur.filter((r) => r.type !== 'tip').length, prevPpv: prev.filter((r) => r.type !== 'tip').length, tips: cur.filter((r) => r.type === 'tip').length, prevTips: prev.filter((r) => r.type === 'tip').length,
        // Bloom ne cherche l'auteur que pour les ventes des 14 derniers jours.
        attributedSince: Date.now() - 14 * DAY,
      });
    },

    // Fiche d'une personne (Contrôle des accès → statistiques) : ventes MYM qui lui sont attribuées et temps passé dans
    // Bloom sur 30 jours (« actif » = sur le chat, « inactif » = Bloom ouvert ailleurs : `work_log` de team.mjs).
    'GET /api/mym/team/person': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      const t = one('SELECT id, name FROM users WHERE id = ? AND deleted = 0', Number(x.p.get('id')));
      if (!t) return send(res, 404, { error: 'Personne inconnue' });
      const since = Date.now() - 30 * DAY;
      const ca = (from) => (x.cids.length ? one(`SELECT SUM(gross) AS s, COUNT(*) AS n FROM rv_live WHERE creator_id IN (${x.inSql}) AND src = 'mym' AND gross > 0 AND origin IN ('bloom', 'employee') AND origin_by = ? AND at >= ?`, ...x.cids, t.name, from) : null);
      const w = one('SELECT SUM(active) AS a, SUM(idle) AS i FROM work_log WHERE user_id = ? AND day >= ?', t.id, parisDay(since));
      const msgs = x.cids.length ? one(`SELECT COUNT(*) AS n FROM msg_log WHERE from_fan = 0 AND kind IN ('bloom', 'employee') AND by_name = ? AND creator_id IN (${x.inSql}) AND at >= ?`, t.name, ...x.cids, since)?.n || 0 : 0;
      send(res, 200, { name: t.name, total: (ca(0)?.s || 0) / 100, d30: (ca(since)?.s || 0) / 100, sales30: ca(since)?.n || 0, activeH: (w?.a || 0) / 3600e3, idleH: (w?.i || 0) / 3600e3, messages30: msgs });
    },

    // ------------------------------------------------------------ Contrôle des shifts
    'GET /api/mym/team/shifts': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      const today = parisDay(Date.now());
      let to = okDay(x.p.get('to')) || today;
      if (to > today) to = today;
      let from = okDay(x.p.get('from')) || addDay(to, -6);
      if (from > to) from = to;
      if (Date.parse(to) - Date.parse(from) > 60 * DAY) from = addDay(to, -60);
      const idle = Math.min(60, Math.max(1, Number(x.p.get('idle')) || 3));
      const cut = Math.min(600, Math.max(idle, Number(x.p.get('cut')) || 60));
      const start = parisMidnight(from);
      const end = parisMidnight(addDay(to, 1));
      const empty = { from, to, idle, cut, creators: x.list, chatters: [], totals: { chatters: 0, vacations: 0, activeMin: 0, messages: 0, models: 0, of: x.cids.length }, people: [] };
      if (!x.cids.length) return send(res, 200, empty);
      const rows = all(`SELECT m.creator_id AS cid, m.at, m.by_name AS name, m.price, m.medias, m.reply_ms FROM msg_log m WHERE m.from_fan = 0 AND m.deleted = 0 AND m.kind IN ('bloom', 'employee') AND m.by_name IS NOT NULL AND m.creator_id IN (${x.inSql}) AND m.at >= ? AND m.at < ? ORDER BY m.at`, ...x.cids, start, end);
      const ids = new Map(all('SELECT id, name FROM users').map((u) => [u.name, u.id]));
      // Temps passé dans Bloom sur la période (team.mjs) : « actif » = sur le chat, « inactif » = Bloom ouvert ailleurs.
      const work = new Map(all('SELECT user_id, SUM(active) AS a, SUM(idle) AS i, COUNT(*) AS d FROM work_log WHERE day >= ? AND day <= ? GROUP BY user_id', from, to).map((w) => [w.user_id, w]));
      const by = new Map();
      for (const r of rows) (by.get(r.name) || by.set(r.name, []).get(r.name)).push(r);
      const worked = new Set();
      const chatters = [...by].map(([name, list]) => {
        const vs = vacations(list, idle, cut).map((v) => ({
          day: parisDay(v.start), start: hm.format(new Date(v.start)), end: hm.format(new Date(v.end)), endDay: parisDay(v.end), startAt: v.start, endAt: v.end, activeMin: v.activeMin, messages: v.messages,
          models: v.models.map((m) => ({ name: x.names.get(m.id) || m.id, n: m.n })),
        }));
        const models = new Map();
        for (const r of list) models.set(r.cid, (models.get(r.cid) || 0) + 1), worked.add(r.cid);
        // Temps de réponse : seulement les réponses données pendant que la personne était là (moins de 30 min).
        const rep = list.map((r) => r.reply_ms).filter((ms) => ms != null && ms <= 30 * MIN);
        const paid = list.filter((r) => r.price > 0).length;
        const free = list.filter((r) => r.medias > 0 && !(r.price > 0)).length;
        return {
          name, id: ids.get(name) ?? null, messages: list.length, activeMin: vs.reduce((a, v) => a + v.activeMin, 0), shifts: vs.length, vacations: vs,
          models: [...models].map(([id, n]) => ({ name: x.names.get(id) || id, n })).sort((a, b) => b.n - a.n),
          replyAvg: rep.length ? Math.round(rep.reduce((a, b) => a + b, 0) / rep.length / 1000) : null, replyMedian: rep.length ? Math.round(median(rep) / 1000) : null,
          first: list[0].at, last: list[list.length - 1].at, ppvPaid: paid, ppvFree: free,
          bloomActiveMin: Math.round((work.get(ids.get(name))?.a || 0) / MIN), bloomIdleMin: Math.round((work.get(ids.get(name))?.i || 0) / MIN), bloomDays: work.get(ids.get(name))?.d || 0,
        };
      }).sort((a, b) => b.messages - a.messages);
      // Un chatteur précis : son activité minute par minute (minutes où il a écrit) pour le graphique.
      const who = x.p.get('chatter');
      let minutes;
      if (who && by.has(who)) {
        const m = new Map();
        for (const r of by.get(who)) {
          const k = Math.floor(r.at / MIN);
          m.set(k, (m.get(k) || 0) + 1);
        }
        minutes = [...m].map(([k, n]) => [k * MIN, n]);
      }
      send(res, 200, {
        from, to, idle, cut, start, end, creators: x.list, chatters, minutes,
        totals: { chatters: chatters.length, vacations: chatters.reduce((a, c) => a + c.shifts, 0), activeMin: chatters.reduce((a, c) => a + c.activeMin, 0), messages: rows.length, models: worked.size, of: x.cids.length },
        // Ce que Bloom a vu passer sans nom sur la même période (IA, autre outil, appli MYM) : pour comprendre un relevé vide.
        unnamed: one(`SELECT COUNT(*) AS n FROM msg_log m WHERE m.from_fan = 0 AND m.deleted = 0 AND NOT (m.kind IN ('bloom', 'employee') AND m.by_name IS NOT NULL) AND m.creator_id IN (${x.inSql}) AND m.at >= ? AND m.at < ?`, ...x.cids, start, end)?.n || 0,
      });
    },
  };
}
