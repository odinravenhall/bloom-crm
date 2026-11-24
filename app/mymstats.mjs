// MYM → Stats → « Statistiques Globales » (copie de la « Vue d'ensemble » de MyPulse), pour les comptes reliés.
// Tout vient des revenus lus chez MYM en direct (`rv_live`, src = 'mym', montants NETS : mymincome.mjs) :
//  - catégories d'après le titre de la transaction chez MYM : abonnement, renouvellement, média privé, Media On Demand,
//    médias push, pourboires, autres ; les remboursements sont comptés à part (pas dans le chiffre d'affaires) ;
//  - renouvellement = un abonnement d'un fan (même pseudo) qui s'était déjà abonné avant dans l'historique de Bloom
//    (400 jours) : MYM ne fait pas la différence dans sa liste ;
//  - total d'abonnés actifs : MYM ne donne que le nombre du moment. Bloom le relève toutes les 10 minutes et garde la
//    dernière valeur de chaque jour (`mym_subs_daily`), depuis le 24/11/2026 : pas de courbe avant cette date.
// Jours = jours de Paris.
import { all, db, run } from './store.mjs';
import { isLinked, mymFollowerCounts } from './mym.mjs';
import { canSee } from './team.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';

db.exec('CREATE TABLE IF NOT EXISTS mym_subs_daily (creator_id TEXT NOT NULL, day TEXT NOT NULL, active INTEGER NOT NULL, old INTEGER, interested INTEGER, at INTEGER NOT NULL, PRIMARY KEY (creator_id, day))');

const DAY = 864e5;
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const CATS = ['sub', 'renew', 'ppv', 'mod', 'push', 'tip', 'other'];
const catOf = (r) => (r.type === 'ppv' ? (/on demand|mod\b/i.test(r.raw || '') ? 'mod' : 'ppv') : r.type === 'sub' ? 'sub' : r.type === 'push' ? 'push' : r.type === 'tip' ? 'tip' : 'other');

/** Premier abonnement connu de chaque fan d'une créatrice (pseudo en minuscules → heure), gardé 2 minutes. */
const firstCache = new Map();
function firstSubs(cid) {
  const hit = firstCache.get(cid);
  if (hit && Date.now() - hit.at < 120_000) return hit.m;
  const m = new Map();
  for (const r of all("SELECT LOWER(COALESCE(fan_name, fan_id)) AS k, MIN(at) AS t FROM rv_live WHERE creator_id = ? AND src = 'mym' AND type = 'sub' GROUP BY 1", cid)) m.set(r.k, r.t);
  firstCache.set(cid, { at: Date.now(), m });
  return m;
}

function statsOf(cid, from, to) {
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
  return [...days.values()];
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
}

export function mymStatsRoutes({ userFrom, send, creators }) {
  return {
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
      send(res, 200, { from, to, today, creators: out, subsSince: all('SELECT MIN(day) AS d FROM mym_subs_daily')[0]?.d || null });
    },
  };
}
