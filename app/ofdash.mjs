// Dashboard OnlyFans (comme celui d'Infloww) : « Creator earnings overview » (net ou brut ; hier, aujourd'hui, cette
// semaine, ce mois), réparti en abonnements, posts, messages, pourboires, parrainages et lives, et « Employee sales »
// (ventes faites par l'équipe, jour par jour ou heure par heure).
// Source : les ventes OnlyFans lues chez Infloww (rv_sales), en dollars, plus les ventes Substy des dernières 24 h pas
// encore confirmées (provisoires). Heure de Paris.
import { all } from './store.mjs';
import { canSee, isBoss } from './team.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';

const DAY = 864e5;
const REFUND = /refund|chargeback|revers|rembours|annul/i;
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Bornes de la période (heure de Paris). La semaine commence le dimanche, comme Infloww. */
function bounds(period) {
  const today = parisDay(Date.now());
  if (period === 'yesterday') return { from: addDay(today, -1), to: addDay(today, -1) };
  if (period === 'week') {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = dimanche
    const from = addDay(today, -dow);
    return { from, to: addDay(from, 6) };
  }
  if (period === 'month') {
    const from = `${today.slice(0, 8)}01`;
    const next = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 10);
    return { from, to: addDay(next, -1) };
  }
  return { from: today, to: today };
}
// Type de vente Bloom → bloc du dashboard.
const BLOCK = { sub: 'subscriptions', post: 'posts', ppv: 'messages', tip: 'tips', stream: 'streams' };

export function ofDashRoutes({ userFrom, send, creators }) {
  return {
    'GET /api/of-dashboard': async (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' });
      const p = new URL(req.url, 'http://x').searchParams;
      const period = ['yesterday', 'today', 'week', 'month'].includes(p.get('period')) ? p.get('period') : 'week';
      const gross = p.get('mode') === 'gross';
      const { from, to } = bounds(period);
      const start = parisMidnight(from);
      const end = parisMidnight(addDay(to, 1));
      const ofCreators = creators().filter((c) => /onlyfans/i.test(c.platform || '') && canSee({ ...u, pf: null }, c.id));
      const only = p.get('creatorId');
      const ids = new Set(ofCreators.filter((c) => !only || c.id === only).map((c) => c.id));
      const maps = all('SELECT creator_id, account FROM rv_map WHERE account IS NOT NULL').filter((m) => ids.has(m.creator_id));
      const accounts = maps.map((m) => m.account);
      const blocks = { subscriptions: 0, posts: 0, messages: 0, tips: 0, referrals: 0, streams: 0 };
      // Courbe : heure par heure pour un seul jour, sinon jour par jour.
      const hourly = from === to;
      const points = [];
      if (hourly) for (let h = 0; h < 24; h++) points.push({ key: String(h), label: `${String(h).padStart(2, '0')}:00`, at: start + h * 3600_000, v: 0 });
      else for (let d = from; d <= to; d = addDay(d, 1)) points.push({ key: d, label: d, at: parisMidnight(d), v: 0 });
      const slot = (at) => (hourly ? points[Math.floor((at - start) / 3600_000)] : points.find((x) => x.key === parisDay(at)));
      let total = 0;
      let provisional = 0;
      let sales = 0;
      if (accounts.length) {
        const ph = accounts.map(() => '?').join(',');
        for (const r of all(`SELECT type, raw_type, gross, net, currency, status, seller, origin, at FROM rv_sales WHERE account IN (${ph}) AND at >= ? AND at < ?`, ...accounts, start, end)) {
          if (REFUND.test(r.status || '')) continue;
          const v = (gross ? r.gross : r.net) / 100;
          const b = BLOCK[r.type] || (/refer|parrain/i.test(r.raw_type || '') ? 'referrals' : null);
          if (b) blocks[b] += v;
          total += v;
          sales++;
          // Vente de l'équipe : vendeur connu (Infloww) ou chatteur de Bloom.
          if (r.seller || r.origin === 'bloom' || r.origin === 'chatter') {
            const s = slot(r.at);
            if (s) s.v += v;
          }
        }
      }
      // Ventes Substy des dernières 24 h pas encore confirmées par Infloww (provisoires).
      if (ids.size) {
        const ph = [...ids].map(() => '?').join(',');
        for (const l of all(`SELECT type, gross, at FROM rv_live WHERE matched IS NULL AND creator_id IN (${ph}) AND at >= ? AND at < ? AND at > ?`, ...ids, start, end, Date.now() - DAY)) {
          if (/sub/i.test(l.type || '')) continue;
          const v = (gross ? l.gross : l.gross * 0.8) / 100;
          blocks[/tip/i.test(l.type || '') ? 'tips' : /post/i.test(l.type || '') ? 'posts' : 'messages'] += v;
          total += v;
          provisional += v;
        }
      }
      const round = (x) => Math.round(x * 100) / 100;
      send(res, 200, {
        period,
        mode: gross ? 'gross' : 'net',
        from,
        to,
        total: round(total),
        provisional: round(provisional),
        sales,
        blocks: Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, round(v)])),
        employeeSales: points.map((x) => ({ label: x.label, v: round(x.v), future: x.at > Date.now() })),
        hourly,
        creators: ofCreators.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar, mapped: maps.some((m) => m.creator_id === c.id) || !ids.has(c.id) })),
        unmapped: ofCreators.filter((c) => ids.has(c.id) && !maps.some((m) => m.creator_id === c.id)).map((c) => c.name),
      });
    },
  };
}
