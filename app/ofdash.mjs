// Dashboard OnlyFans (comme celui d'Infloww) : « Creator earnings overview » (net ou brut ; hier, aujourd'hui, cette
// semaine, ce mois), réparti en abonnements, posts, messages, pourboires, parrainages et lives, et « Employee sales »
// (comme Infloww : ventes de messages et pourboires faites par les employés, en brut, jour par jour).
// Source : les ventes OnlyFans lues chez Infloww (rv_sales), en dollars, des modèles OnlyFans présentes chez Substy seulement, plus les ventes Substy des dernières 24 h pas
// encore confirmées (provisoires). Heure de Paris.
import { all, one } from './store.mjs';
import { canSee, isBoss, seesAll } from './team.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';

const DAY = 864e5;
const REFUND = /refund|chargeback|revers|rembours|annul|^undo$/i; // Infloww : « undo » = remboursée
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Bornes de la période (heure de Paris). La semaine commence le dimanche (comme Infloww) ou le lundi (réglage). */
function bounds(period, weekStart = 0) {
  const today = parisDay(Date.now());
  if (period === 'yesterday') return { from: addDay(today, -1), to: addDay(today, -1) };
  if (period === 'week') {
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = dimanche
    const from = addDay(today, -((dow - weekStart + 7) % 7));
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
      const { from, to } = bounds(period, p.get('weekStart') === '1' ? 1 : 0);
      const start = parisMidnight(from);
      const end = parisMidnight(addDay(to, 1));
      const ofCreators = creators().filter((c) => /onlyfans/i.test(c.platform || '') && canSee({ ...u, pf: null }, c.id));
      const only = p.get('creatorId');
      const ids = new Set(ofCreators.filter((c) => !only || c.id === only).map((c) => c.id));
      const maps = all('SELECT creator_id, account FROM rv_map WHERE account IS NOT NULL').filter((m) => ids.has(m.creator_id));
      // Seulement les modèles OnlyFans présentes chez Substy (demande de l'agence, 25/11/2026) : les autres comptes
      // d'Infloww ne sont plus comptés, le but étant de faire passer toutes les modèles ici.
      const accounts = maps.map((m) => m.account);
      const blocks = { subscriptions: 0, posts: 0, messages: 0, tips: 0, referrals: 0, streams: 0 };
      // Courbe : un point par jour (un seul pour « aujourd'hui » / « hier », comme Infloww), plus le jour d'avant (pour « Growth »).
      const hourly = false;
      const points = [];
      for (let d = addDay(from, -1); d <= to; d = addDay(d, 1)) points.push({ key: d, label: d, at: parisMidnight(d), msgs: 0, tips: 0 });
      // Point de la courbe d'une vente : calcul direct (pas de conversion de date par vente : trop lent sur un mois).
      const slot = (at) => {
        let i = Math.floor((at - points[0].at) / DAY);
        i = Math.max(0, Math.min(points.length - 1, i));
        while (i + 1 < points.length && points[i + 1].at <= at) i++;
        while (i > 0 && points[i].at > at) i--;
        return points[i];
      };
      let total = 0;
      let provisional = 0;
      let sales = 0;
      // Messages payants : qui les a vendus ? IA de Substy, chatteurs (message parti de Bloom, ou chatteur attribué par
      // Infloww), ou ni l'un ni l'autre (script automatique, auteur inconnu).
      const messagesBy = { ai: 0, team: 0, other: 0 };
      if (accounts.length) {
        const ph = accounts.map(() => '?').join(',');
        for (const r of all(`SELECT type, raw_type, gross, net, currency, status, seller, origin, at FROM rv_sales WHERE account IN (${ph}) AND at >= ? AND at < ?`, ...accounts, start - DAY, end)) {
          if (REFUND.test(r.status || '')) continue;
          // Courbe « Employee sales » (comme Infloww) : ventes de messages et pourboires faites par un employé, en brut.
          if ((r.type === 'ppv' || r.type === 'tip') && r.seller) {
            const sl = slot(r.at);
            if (sl) sl[r.type === 'tip' ? 'tips' : 'msgs'] += r.gross / 100;
          }
          if (r.at < start) continue;
          const v = (gross ? r.gross : r.net) / 100;
          const b = BLOCK[r.type] || (/refer|parrain/i.test(r.raw_type || '') ? 'referrals' : null);
          if (b) blocks[b] += v;
          if (b === 'messages') messagesBy[r.origin === 'ai' ? 'ai' : r.origin === 'bloom' || r.seller ? 'team' : 'other'] += v;
          total += v;
          sales++;
        }
      }
      // Ventes Substy des dernières 24 h pas encore confirmées par Infloww (provisoires).
      if (ids.size) {
        const ph = [...ids].map(() => '?').join(',');
        for (const l of all(`SELECT type, gross, at, message_id FROM rv_live WHERE matched IS NULL AND creator_id IN (${ph}) AND at >= ? AND at < ? AND at > ?`, ...ids, start, end, Date.now() - DAY)) {
          if (/sub/i.test(l.type || '')) continue;
          const v = (gross ? l.gross : l.gross * 0.8) / 100;
          const lb = /tip/i.test(l.type || '') ? 'tips' : /post/i.test(l.type || '') ? 'posts' : 'messages';
          blocks[lb] += v;
          if (lb === 'messages') {
            const k = l.message_id ? one('SELECT kind FROM msg_log WHERE id = ?', l.message_id)?.kind : null;
            messagesBy[k === 'ai' ? 'ai' : k === 'bloom' || k === 'employee' ? 'team' : 'other'] += v;
          }
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
        messagesBy: Object.fromEntries(Object.entries(messagesBy).map(([k, v]) => [k, round(v)])),
        employeeSales: points.slice(1).map((x) => ({ label: x.label, v: round(x.msgs + x.tips), msgs: round(x.msgs), tips: round(x.tips), future: x.at > Date.now() })),
        employeeBefore: round(points[0].msgs + points[0].tips),
        hourly,
        creators: ofCreators.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar, mapped: maps.some((m) => m.creator_id === c.id) || !ids.has(c.id) })),
        accounts: accounts.length,
        unmapped: ofCreators.filter((c) => ids.has(c.id) && !maps.some((m) => m.creator_id === c.id)).map((c) => c.name),
      });
    },
  };
}
