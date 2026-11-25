// MYM → Stats → « Statistiques Globales » (copie de la « Vue d'ensemble » de MyPulse), pour les comptes reliés.
// Tout vient des revenus lus chez MYM en direct (`rv_live`, src = 'mym', montants NETS : mymincome.mjs) :
//  - catégories d'après le titre de la transaction chez MYM : abonnement, renouvellement, média privé, Media On Demand,
//    médias push, pourboires, autres ; les remboursements sont comptés à part (pas dans le chiffre d'affaires) ;
//  - renouvellement = un abonnement d'un fan (même pseudo) qui s'était déjà abonné avant dans l'historique de Bloom
//    (400 jours) : MYM ne fait pas la différence dans sa liste ;
//  - total d'abonnés actifs : MYM ne donne que le nombre du moment. Bloom le relève toutes les 10 minutes et garde la
//    dernière valeur de chaque jour (`mym_subs_daily`), depuis le 24/11/2026. Avant le premier relevé, la courbe est
//    ESTIMÉE : premier relevé moins les nouveaux abonnés arrivés entre-temps (les désabonnements ne sont pas connus,
//    `subsEst`).
//  - meilleurs créneaux de vente : contenus payants et pourboires, par jour de la semaine et heure de Paris ;
//  - `GET /api/mym/transactions` : la liste des transactions (page Transactions), par type et par période.
// Jours = jours de Paris.
import { all, db, getSetting, one, run, setSetting } from './store.mjs';
import { isLinked, mymFollowerCounts, mymSiteRaw } from './mym.mjs';
import { canSee } from './team.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';

db.exec('CREATE TABLE IF NOT EXISTS mym_subs_daily (creator_id TEXT NOT NULL, day TEXT NOT NULL, active INTEGER NOT NULL, old INTEGER, interested INTEGER, at INTEGER NOT NULL, PRIMARY KEY (creator_id, day))');

const DAY = 864e5;
// Notifications du site MYM qui ne sont NI un abonnement NI une vente (déjà connus par les revenus) : surtout les
// demandes de média privé. Lues sur `/app/notifications` (HTML, 100 dernières) toutes les 5 minutes. Vérifié le
// 24/11/2026 : lire la page depuis le serveur ne marque rien comme lu (c'est un script du site qui le fait). La page ne
// donne qu'une heure relative (« 2 hours ago ») : on garde l'heure calculée à la première lecture.
db.exec('CREATE TABLE IF NOT EXISTS mym_site_notifs (creator_id TEXT NOT NULL, key TEXT NOT NULL, fan TEXT, title TEXT, at INTEGER NOT NULL, PRIMARY KEY (creator_id, key))');
const UNIT = { second: 1e3, seconde: 1e3, minute: 6e4, hour: 36e5, heure: 36e5, day: DAY, jour: DAY, week: 7 * DAY, semaine: 7 * DAY, month: 30 * DAY, mois: 30 * DAY };
/** « 2 hours ago », « il y a 3 minutes » → millisecondes écoulées (0 si illisible). */
function agoMs(t) {
  const m = /(\d+)\s*(seconde|second|minute|heure|hour|jour|day|semaine|week|mois|month)/i.exec(String(t || ''));
  return m ? Number(m[1]) * UNIT[m[2].toLowerCase()] : 0;
}
export function parseSiteNotifs(html) {
  return String(html).split(/class="js-card-notification/).slice(1).map((seg) => ({
    key: /data-notification-key="(\d+)"/.exec(seg)?.[1] || null,
    fan: /avatar--notification"\s+title="([^"]*)"/.exec(seg)?.[1] || /title="([^"]*)"/.exec(seg)?.[1] || null,
    title: (/card-notification__title[^>]*>([\s\S]*?)<\/p>/.exec(seg)?.[1] || '').replace(/<[^>]*>/g, '').replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(),
    ago: agoMs(/posted_date[^>]*>([^<]*)</.exec(seg)?.[1]),
  })).filter((n) => n.key && n.title);
}
async function siteNotifs(creators) {
  for (const c of creators().filter((x) => /mym/i.test(x.platform || '') && isLinked(x.id))) {
    try {
      const r = await mymSiteRaw(String(c.id), '/app/notifications');
      if (r.status !== 200) continue;
      for (const n of parseSiteNotifs(r.text)) {
        if (/abonn|subscri|vendu|sold|pourboire|tip/i.test(n.title)) continue;
        run('INSERT OR IGNORE INTO mym_site_notifs (creator_id, key, fan, title, at) VALUES (?, ?, ?, ?, ?)', String(c.id), n.key, n.fan, n.title.slice(0, 200), Date.now() - n.ago);
      }
    } catch {}
  }
  run('DELETE FROM mym_site_notifs WHERE at < ?', Date.now() - 90 * DAY);
}
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const CATS = ['sub', 'renew', 'ppv', 'mod', 'push', 'tip', 'other'];
export const catOf = (r) => (r.type === 'ppv' ? (/on demand|mod\b/i.test(r.raw || '') ? 'mod' : 'ppv') : r.type === 'sub' ? 'sub' : r.type === 'push' ? 'push' : r.type === 'tip' ? 'tip' : 'other');

/** Premier abonnement connu de chaque fan d'une créatrice (pseudo en minuscules → heure), gardé 2 minutes. */
const firstCache = new Map();
export function firstSubs(cid) {
  const hit = firstCache.get(cid);
  if (hit && Date.now() - hit.at < 120_000) return hit.m;
  const m = new Map();
  for (const r of all("SELECT LOWER(COALESCE(fan_name, fan_id)) AS k, MIN(at) AS t FROM rv_live WHERE creator_id = ? AND src = 'mym' AND type = 'sub' GROUP BY 1", cid)) m.set(r.k, r.t);
  firstCache.set(cid, { at: Date.now(), m });
  return m;
}

export function statsOf(cid, from, to) {
  const start = parisMidnight(from);
  const end = parisMidnight(addDay(to, 1));
  const first = firstSubs(cid);
  const days = new Map();
  for (let d = from; d <= to; d = addDay(d, 1)) days.set(d, { day: d, sub: 0, renew: 0, ppv: 0, mod: 0, push: 0, tip: 0, other: 0, refund: 0, total: 0, nPpv: 0, nTips: 0, newSubs: 0, renewals: 0, subs: null });
  for (const r of all("SELECT type, raw, at, gross, fan_id, fan_name FROM rv_live WHERE creator_id = ? AND src = 'mym' AND at >= ? AND at < ? AND type <> 'payout'", cid, start, end)) {
    const d = days.get(parisDay(r.at));
    if (!d) continue;
    if (r.type === 'refund' || r.gross < 0) {
      d.refund += r.gross;
      continue;
    }
    let cat = catOf(r);
    if (cat === 'sub') {
      const again = (first.get(String(r.fan_name || r.fan_id || '').toLowerCase()) ?? r.at) < r.at;
      if (again) (cat = 'renew'), d.renewals++;
      else d.newSubs++;
    }
    d[cat] += r.gross;
    d.total += r.gross;
    if ((cat === 'ppv' || cat === 'mod' || cat === 'push') && r.gross > 0) d.nPpv++;
    if (cat === 'tip' && r.gross > 0) d.nTips++;
  }
  for (const r of all('SELECT day, active FROM mym_subs_daily WHERE creator_id = ? AND day >= ? AND day <= ?', cid, from, to)) if (days.has(r.day)) days.get(r.day).subs = r.active;
  // Avant le premier relevé : estimation en remontant (relevé − nouveaux abonnés arrivés depuis).
  const snap = one('SELECT day, active FROM mym_subs_daily WHERE creator_id = ? ORDER BY day LIMIT 1', cid);
  if (snap && from < snap.day) {
    const news = new Map();
    for (const r of all("SELECT at, fan_id, fan_name FROM rv_live WHERE creator_id = ? AND src = 'mym' AND type = 'sub' AND at >= ? AND at < ?", cid, parisMidnight(addDay(from, 1)), parisMidnight(addDay(snap.day, 1)))) {
      if ((first.get(String(r.fan_name || r.fan_id || '').toLowerCase()) ?? r.at) < r.at) continue;
      const k = parisDay(r.at);
      news.set(k, (news.get(k) || 0) + 1);
    }
    let v = snap.active;
    for (let d = snap.day; d > from; ) {
      v -= news.get(d) || 0;
      d = addDay(d, -1);
      const x = days.get(d);
      if (x) (x.subs = Math.max(0, v)), (x.subsEst = true);
    }
  }
  return [...days.values()];
}

const slotFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** Ventes (contenus payants, pourboires) par jour de la semaine (0 = dimanche) et heure de Paris. */
function slotsOf(cids, from, to) {
  const m = new Map();
  if (!cids.length) return [];
  const rows = all(`SELECT at, gross FROM rv_live WHERE creator_id IN (${cids.map(() => '?').join(',')}) AND src = 'mym' AND type IN ('ppv', 'push', 'tip') AND gross > 0 AND at >= ? AND at < ?`, ...cids, parisMidnight(from), parisMidnight(addDay(to, 1)));
  for (const r of rows) {
    const p = Object.fromEntries(slotFmt.formatToParts(new Date(r.at)).map((x) => [x.type, x.value]));
    const k = WD[p.weekday] * 24 + (Number(p.hour) % 24);
    const s = m.get(k) || { d: WD[p.weekday], h: Number(p.hour) % 24, sum: 0, n: 0 };
    s.sum += r.gross / 100;
    s.n++;
    m.set(k, s);
  }
  return [...m.values()].map((s) => ({ ...s, sum: Math.round(s.sum * 100) / 100 }));
}

/** Relevé du nombre d'abonnés : la dernière valeur de la journée reste. */
async function snapshot(creators) {
  const day = parisDay(Date.now());
  for (const c of creators().filter((x) => /mym/i.test(x.platform || '') && isLinked(x.id))) {
    const n = await mymFollowerCounts(String(c.id)).catch(() => null);
    if (n && n.active >= 0) run('INSERT INTO mym_subs_daily (creator_id, day, active, old, interested, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (creator_id, day) DO UPDATE SET active = excluded.active, old = excluded.old, interested = excluded.interested, at = excluded.at', String(c.id), day, n.active, n.old, n.interested, Date.now());
  }
}
export function startMymStats(creators) {
  setTimeout(() => snapshot(creators).catch(() => {}), 20_000);
  setInterval(() => snapshot(creators).catch(() => {}), 10 * 60_000);
  setTimeout(() => siteNotifs(creators).catch(() => {}), 40_000);
  setInterval(() => siteNotifs(creators).catch(() => {}), 5 * 60_000);
}

export function mymStatsRoutes({ userFrom, send, creators }) {
  return {
    // Notifications MYM : le fil du compte (abonnements, renouvellements, achats), d'après les revenus lus chez MYM.
    // On ne lit PAS la page de notifications de MYM : l'ouvrir les marquerait comme lues sur le compte de la modèle,
    // et elle ne donne ni le pseudo ni l'heure exacte. Les demandes de média privé n'y sont donc pas.
    'GET /api/mym/notifs': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' });
      const p = new URL(req.url, 'http://x').searchParams;
      const only = p.get('creatorId') || '';
      const list = creators().filter((c) => /mym/i.test(c.platform || '') && isLinked(c.id) && canSee({ ...u, pf: null }, c.id));
      const meta = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [m.creator_id, m.nickname]));
      const names = new Map(list.map((c) => [String(c.id), meta.get(String(c.id)) || c.name]));
      const ids = [...names.keys()].filter((id) => !only || id === only);
      const seen = Number(getSetting(`mym_notifs_seen:${u.id}`)) || 0;
      const base = { creators: [...names].map(([id, name]) => ({ id, name })), seen };
      if (!ids.length) return send(res, 200, { ...base, items: [], more: false, unread: 0 });
      const kind = p.get('kind') || 'all';
      const before = Number(p.get('before')) || Date.now() + DAY;
      const types = kind === 'buy' ? "('ppv', 'tip', 'push')" : kind === 'subs' || kind === 'renew' ? "('sub')" : "('sub', 'ppv', 'tip', 'push')";
      const inSql = ids.map(() => '?').join(',');
      const out = [];
      // Demandes et autres notifications du site (ni abonnement ni vente).
      if (kind === 'all' || kind === 'req') for (const n of all(`SELECT creator_id, key, fan, title, at FROM mym_site_notifs WHERE creator_id IN (${inSql}) AND at < ? ORDER BY at DESC LIMIT 60`, ...ids, before)) out.push({ id: `site:${n.key}`, kind: 'req', sub: 'req', fan: n.fan || 'Un fan', title: n.title, creator: names.get(n.creator_id) || '', amount: 0, at: n.at });
      let cursor = before;
      // Nouveaux abonnés / renouvellements se décident ligne par ligne : on lit par paquets jusqu'à en avoir 50.
      for (let i = 0; kind !== 'req' && i < 8 && out.length < 51; i++) {
        const rows = all(`SELECT id, creator_id, type, raw, at, gross, fan_id, fan_name FROM rv_live WHERE creator_id IN (${inSql}) AND src = 'mym' AND type IN ${types} AND gross >= 0 AND at < ? ORDER BY at DESC LIMIT 200`, ...ids, cursor);
        if (!rows.length) break;
        for (const r of rows) {
          cursor = r.at;
          let k = 'buy';
          if (r.type === 'sub') k = (firstSubs(r.creator_id).get(String(r.fan_name || r.fan_id || '').toLowerCase()) ?? r.at) < r.at ? 'renew' : 'subs';
          else if (!(r.gross > 0)) continue;
          if (kind !== 'all' && kind !== k) continue;
          out.push({ id: String(r.id), kind: k, sub: r.type === 'tip' ? 'tip' : catOf(r), fan: r.fan_name || 'Un fan', creator: names.get(r.creator_id) || '', amount: r.gross / 100, at: r.at });
          if (out.length >= 51) break;
        }
        if (rows.length < 200) break;
      }
      out.sort((a, b) => b.at - a.at);
      send(res, 200, { ...base, items: out.slice(0, 50), more: out.length > 50, unread: one(`SELECT COUNT(*) AS n FROM rv_live WHERE creator_id IN (${inSql}) AND src = 'mym' AND type IN ('sub', 'ppv', 'tip', 'push') AND at > ?`, ...ids, Math.max(seen, Date.now() - 7 * DAY))?.n || 0 });
    },
    'POST /api/mym/notifs/read': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      setSetting(`mym_notifs_seen:${u.id}`, String(Date.now()));
      send(res, 200, { ok: true });
    },
    'GET /api/mym/stats': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' });
      const p = new URL(req.url, 'http://x').searchParams;
      const today = parisDay(Date.now());
      const ok = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);
      let to = ok(p.get('to')) || today;
      let from = ok(p.get('from')) || to;
      if (to > today) to = today;
      if (from > to) from = to;
      if (Date.parse(to) - Date.parse(from) > 400 * DAY) from = addDay(to, -400);
      const only = p.get('creatorId') || '';
      const list = creators().filter((c) => /mym/i.test(c.platform || '') && isLinked(c.id) && canSee({ ...u, pf: null }, c.id) && (!only || c.id === only));
      const meta = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [m.creator_id, m.nickname]));
      const out = list.map((c) => {
        const cid = String(c.id);
        const since = all("SELECT MIN(at) AS t FROM rv_live WHERE creator_id = ? AND src = 'mym'", cid)[0]?.t || null;
        return { id: cid, name: meta.get(cid) || c.name, handle: c.username || null, avatar: c.avatar || null, since, days: statsOf(cid, from, to).map((d) => ({ ...d, ...Object.fromEntries([...CATS, 'refund', 'total'].map((k) => [k, d[k] / 100])) })) };
      });
      send(res, 200, { from, to, today, creators: out, slots: slotsOf(out.map((c) => c.id), from, to), subsSince: all('SELECT MIN(day) AS d FROM mym_subs_daily')[0]?.d || null });
    },
    // Page Transactions : répartition par type + historique (50 par page), sur la période et les types demandés.
    'GET /api/mym/transactions': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' });
      const p = new URL(req.url, 'http://x').searchParams;
      const ok = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);
      const from = ok(p.get('from'));
      const to = ok(p.get('to'));
      const only = p.get('creatorId') || '';
      const types = new Set((p.get('types') || '').split(',').filter(Boolean));
      const offset = Math.max(0, Number(p.get('offset')) || 0);
      const list = creators().filter((c) => /mym/i.test(c.platform || '') && isLinked(c.id) && canSee({ ...u, pf: null }, c.id) && (!only || c.id === only));
      const meta = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [m.creator_id, m.nickname]));
      const names = new Map(list.map((c) => [String(c.id), meta.get(String(c.id)) || c.name]));
      const ids = [...names.keys()];
      if (!ids.length) return send(res, 200, { parts: [], total: 0, count: 0, rows: [], more: false, since: null });
      const rows = all(`SELECT id, creator_id, type, raw, at, gross, fan_name, currency FROM rv_live WHERE creator_id IN (${ids.map(() => '?').join(',')}) AND src = 'mym' AND type <> 'payout' AND at >= ? AND at < ? ORDER BY at DESC`, ...ids, from ? parisMidnight(from) : 0, to ? parisMidnight(addDay(to, 1)) : Date.now() + DAY)
        .map((r) => ({ ...r, cat: r.type === 'refund' || r.gross < 0 ? 'refund' : catOf(r) }))
        .filter((r) => !types.size || types.has(r.cat));
      const parts = new Map();
      for (const r of rows) {
        const x = parts.get(r.cat) || { type: r.cat, n: 0, amount: 0 };
        x.n++;
        x.amount += r.gross;
        parts.set(r.cat, x);
      }
      const order = ['tip', 'sub', 'ppv', 'mod', 'push', 'other', 'refund'];
      send(res, 200, {
        parts: [...parts.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).map((x) => ({ ...x, amount: x.amount / 100 })),
        // Comme MyPulse : les remboursements ne sont pas déduits du total.
        total: rows.reduce((a, r) => a + (r.cat === 'refund' ? 0 : r.gross), 0) / 100,
        count: rows.length,
        rows: rows.slice(offset, offset + 50).map((r) => ({ id: String(r.id).replace(/^mym:/, ''), creator: names.get(r.creator_id) || '', type: r.cat, label: r.raw || '', amount: r.gross / 100, fan: r.fan_name || null, at: r.at })),
        more: rows.length > offset + 50,
        since: one(`SELECT MIN(at) AS t FROM rv_live WHERE creator_id IN (${ids.map(() => '?').join(',')}) AND src = 'mym'`, ...ids)?.t || null,
      });
    },
  };
}
