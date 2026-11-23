// MYM → Messages → « Mes ventes » (copie de « Ventes chatting » de MyPulse) : les ventes de la personne connectée.
//  - Une vente lui est attribuée quand le fan achète un message payant qu'ELLE a envoyé depuis Bloom
//    (`sent_log.message_id` = `rv_live.message_id`), ou laisse un pourboire dans les 2 h qui suivent un de ses messages
//    (et que personne d'autre de l'équipe ne lui a écrit entre-temps).
//  - Montants BRUTS tels que Substy les annonce en direct (`rv_live`), dans la monnaie de la créatrice.
//  - Temps actif / idle : relevé par Bloom depuis le 23/11/2026 (`work_log`, nourri par le signe de vie des pages).
import { all } from './store.mjs';
import { canSee } from './team.mjs';
import { parisDay } from './revenue.mjs';

const TIP_WINDOW = 2 * 3600_000;

export function mySalesRoutes({ userFrom, send, creators }) {
  return {
    'GET /api/my-sales': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' });
      const p = new URL(req.url, 'http://x').searchParams;
      const to = Number(p.get('to')) || Date.now();
      const from = Number(p.get('from')) || to - 864e5;
      const mine = creators().filter((c) => canSee(u, c.id));
      const only = String(p.get('creatorId') || '');
      const ids = mine.filter((c) => !only || c.id === only).map((c) => c.id);
      const name = new Map(mine.map((c) => [c.id, c.name]));
      if (!ids.length) return send(res, 200, { rows: [], totals: { count: 0, ppv: 0, tips: 0, sums: {} }, activeMs: 0, idleMs: 0, creators: [] });
      const ph = ids.map(() => '?').join(',');
      // PPV : le message acheté est un de MES envois.
      const ppv = all(
        `SELECT l.id, l.creator_id, l.fan_name, l.fan_id, l.gross, l.currency, l.type, l.at FROM rv_live l
         JOIN sent_log s ON s.message_id = l.message_id WHERE s.user_id = ? AND l.creator_id IN (${ph}) AND l.at >= ? AND l.at < ?`,
        u.id, ...ids, from, to,
      );
      const seen = new Set(ppv.map((r) => r.id));
      // Pourboires : le dernier message de l'équipe à ce fan, dans les 2 h d'avant, vient de moi.
      const tips = all(`SELECT id, creator_id, fan_name, fan_id, gross, currency, type, at FROM rv_live WHERE type = 'tip' AND fan_id IS NOT NULL AND creator_id IN (${ph}) AND at >= ? AND at < ?`, ...ids, from, to).filter((t) => {
        if (seen.has(t.id)) return false;
        const last = all('SELECT user_id FROM sent_log WHERE creator_id = ? AND fan_id = ? AND at <= ? AND at >= ? ORDER BY at DESC LIMIT 1', t.creator_id, t.fan_id, t.at, t.at - TIP_WINDOW)[0];
        return last?.user_id === u.id;
      });
      const rows = [...ppv, ...tips].sort((a, b) => b.at - a.at).map((r) => ({ id: r.id, creator: name.get(r.creator_id) || '—', fan: r.fan_name || r.fan_id || '—', amount: r.gross / 100, currency: r.currency || 'EUR', type: r.type === 'tip' ? 'tip' : 'ppv', at: r.at }));
      const sums = {};
      for (const r of rows) sums[r.currency] = Math.round(((sums[r.currency] || 0) + r.amount) * 100) / 100;
      let work = [];
      try {
        work = all('SELECT active, idle FROM work_log WHERE user_id = ? AND day >= ? AND day <= ?', u.id, parisDay(from), parisDay(to));
      } catch {}
      send(res, 200, {
        rows,
        totals: { count: rows.length, ppv: rows.filter((r) => r.type === 'ppv').length, tips: rows.filter((r) => r.type === 'tip').length, sums },
        activeMs: work.reduce((a, w) => a + w.active, 0),
        idleMs: work.reduce((a, w) => a + w.idle, 0),
        creators: mine.map((c) => ({ id: c.id, name: c.name })),
      });
    },
  };
}
