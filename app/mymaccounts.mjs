// MYM → « Compte Creator » (copie de « Mes Comptes » de MyPulse) : chiffre d'affaires de chaque modèle MYM (ventes
// MyPulse, `rv_sales`), évolution, courbe par jour, fans qui ont payé, équipe qui y a accès, qui est en ligne, tes accès.
// Une modèle = une créatrice MYM de Substy, reliée à son compte MyPulse (`rv_map`).
import { all } from './store.mjs';
import { canSee, onCreator, seesAll } from './team.mjs';
import { PERMS } from './staff.mjs';

const DAY = 864e5;
const REFUND = /refund|chargeback|revers|rembours|annul|^undo$/i; // même règle que revenue.mjs
const parisDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(t));

export function mymAccountRoutes({ userFrom, send, creators }) {
  return {
    'GET /api/mym/accounts': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (u.role === 'model') return send(res, 403, { error: 'Pas d’accès' });
      const p = new URL(req.url, 'http://x').searchParams;
      const days = [7, 14, 30, 60, 90].includes(Number(p.get('days'))) ? Number(p.get('days')) : 90;
      const col = p.get('mode') === 'gross' ? 'gross' : 'net';
      const now = Date.now();
      const from = now - days * DAY;
      const prev = from - days * DAY;
      const maps = new Map(all('SELECT creator_id, account FROM rv_map WHERE account IS NOT NULL').map((m) => [m.creator_id, m.account]));
      const accs = new Map(all("SELECT id, name, username, avatar, connected FROM rv_accounts WHERE platform = 'mym'").map((a) => [a.id, a]));
      const meta = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [m.creator_id, m.nickname]));
      const users = all("SELECT id, name, role, all_creators, avatar FROM users WHERE deleted = 0 AND active = 1 AND discord_id IS NOT NULL AND role <> 'model'");
      const access = all('SELECT user_id, creator_id FROM user_creators');
      const dayKeys = Array.from({ length: days }, (_, i) => parisDay(from + (i + 1) * DAY));
      const myPerms = u.perms || [];
      const permLabels = PERMS.filter((x) => myPerms.includes(x.key)).map((x) => x.label);

      const list = creators()
        .filter((c) => /mym/i.test(c.platform || '') && canSee({ ...u, pf: null }, c.id))
        .map((c) => {
          const acc = accs.get(maps.get(c.id)) || null;
          const sales = acc ? all(`SELECT at, ${col} AS v, fan_id, status FROM rv_sales WHERE account = ? AND at >= ? AND at < ?`, acc.id, prev, now).filter((r) => !REFUND.test(r.status || '')) : [];
          const cur = sales.filter((s) => s.at >= from);
          const total = cur.reduce((a, s) => a + s.v, 0) / 100;
          const before = sales.filter((s) => s.at < from).reduce((a, s) => a + s.v, 0) / 100;
          const byDay = new Map(dayKeys.map((d) => [d, 0]));
          for (const s of cur) {
            const d = parisDay(s.at);
            if (byDay.has(d)) byDay.set(d, byDay.get(d) + s.v / 100);
          }
          const fans = new Set(cur.map((s) => s.fan_id).filter(Boolean));
          const team = users.filter((x) => seesAll(x) || x.all_creators || access.some((a) => a.user_id === x.id && a.creator_id === c.id));
          const online = onCreator(c.id);
          return {
            id: c.id,
            name: meta.get(c.id) || c.name,
            handle: c.username || acc?.username || null,
            avatar: c.avatar || acc?.avatar || null,
            linked: !!acc,
            total: Math.round(total * 100) / 100,
            prev: Math.round(before * 100) / 100,
            delta: before > 0 ? Math.round(((total - before) / before) * 1000) / 10 : null,
            isNew: !before && total > 0,
            series: [...byDay.values()].map((v) => Math.round(v * 100) / 100),
            sales: cur.length,
            payers: fans.size,
            basket: cur.length ? Math.round((total / cur.length) * 100) / 100 : 0,
            team: { leads: team.filter((x) => ['admin', 'manager', 'lead'].includes(x.role)).length, chatters: team.filter((x) => x.role === 'chatter').length, total: team.length },
            online: online.map((o) => ({ name: o.name, avatar: o.avatar })),
          };
        });

      const total = list.reduce((a, c) => a + c.total, 0);
      const before = list.reduce((a, c) => a + c.prev, 0);
      const series = dayKeys.map((_, i) => Math.round(list.reduce((a, c) => a + c.series[i], 0) * 100) / 100);
      send(res, 200, {
        days,
        mode: col,
        role: u.roleName || u.role,
        perms: permLabels,
        canAdd: false,
        totals: {
          revenue: Math.round(total * 100) / 100,
          delta: before > 0 ? Math.round(((total - before) / before) * 1000) / 10 : null,
          perDay: Math.round((total / days) * 100) / 100,
          series,
          payers: list.reduce((a, c) => a + c.payers, 0),
          sales: list.reduce((a, c) => a + c.sales, 0),
          accounts: list.length,
          linked: list.filter((c) => c.linked).length,
          online: new Set(list.flatMap((c) => c.online.map((o) => o.name))).size,
        },
        accounts: list,
      });
    },
  };
}
