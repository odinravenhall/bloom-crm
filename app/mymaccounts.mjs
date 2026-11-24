// MYM → « Compte Creator » (copie de « Mes Comptes » de MyPulse). Compte relié : revenus lus chez MYM en direct
// (mymincome.mjs). Sinon tout vient de SUBSTY (Bloom doit pouvoir se passer
// de MyPulse) : chiffre d'affaires et courbe par jour = `revenue.overview` de Substy (net ou brut), abonnés / anciens /
// intéressés = fans MYM relus chez Substy (mymfans.mjs), équipe et présence = Bloom.
import { all } from './store.mjs';
import { canSee, onCreator, seesAll } from './team.mjs';
import { PERMS } from './staff.mjs';
import { tabOf } from './mymfans.mjs';
import { isLinked, isNative, mymFollowerCounts } from './mym.mjs';
import { mymIncome, mymIncomeOn } from './mymincome.mjs';

const DAY = 864e5;
const ymd = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(t));

export function mymAccountRoutes({ substy, userFrom, send, creators }) {
  const cache = new Map();
  const revenueOf = async (cid, days, mode) => {
    // Compte relié : revenus lus chez MYM en direct (nets), avec la part de l'IA de Substy.
    if (mymIncomeOn(cid) || isNative(cid)) return mymIncome(cid, days);
    const key = `${cid}|${days}|${mode}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60_000) return hit.v;
    const end = ymd(Date.now());
    const start = ymd(Date.now() - (days - 1) * DAY);
    const r = await Promise.race([substy.revenue([cid], start, end, mode), new Promise((_, no) => setTimeout(() => no(new Error('Substy ne répond pas')), 20_000))]);
    const byDay = new Map((r?.totalCharts || []).map((x) => [String(x.date).slice(0, 10), Number(x.count) || 0]));
    const series = Array.from({ length: days }, (_, i) => byDay.get(ymd(Date.now() - (days - 1 - i) * DAY)) || 0);
    let v = { total: Number(r?.total) || 0, delta: r?.totalDelta ?? null, series, currency: r?.currency || 'EUR', newSubs: Number(r?.totalNewSubs) || 0, source: 'overview', since: null, parts: { messages: Number(r?.messages) || 0, tips: Number(r?.tips) || 0, subscriptions: Number(r?.subscriptions) || 0, posts: Number(r?.posts) || 0 } };
    // Le tableau de revenus de Substy ne couvre pas MYM (0) : ventes du flux Substy, enregistrées par Bloom en direct.
    if (!v.total) {
      const from = Date.now() - days * DAY;
      const rows = all('SELECT at, gross FROM rv_live WHERE creator_id = ? AND at >= ?', cid, from - days * DAY);
      const cur = rows.filter((x) => x.at >= from);
      const before = rows.filter((x) => x.at < from).reduce((a, x) => a + x.gross, 0) / 100;
      const total = cur.reduce((a, x) => a + x.gross, 0) / 100;
      const byDay2 = new Map();
      for (const x of cur) byDay2.set(ymd(x.at), (byDay2.get(ymd(x.at)) || 0) + x.gross / 100);
      const first = all('SELECT MIN(at) AS t FROM rv_live WHERE creator_id = ?', cid)[0]?.t || null;
      v = { ...v, total, delta: before > 0 ? ((total - before) / before) * 100 : null, series: Array.from({ length: days }, (_, i) => Math.round((byDay2.get(ymd(Date.now() - (days - 1 - i) * DAY)) || 0) * 100) / 100), source: 'live', since: first, sales: cur.length };
    }
    cache.set(key, { at: Date.now(), v });
    return v;
  };

  return {
    'GET /api/mym/accounts': async (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (u.role === 'model') return send(res, 403, { error: 'Pas d’accès' });
      const p = new URL(req.url, 'http://x').searchParams;
      const days = [7, 14, 30, 60, 90].includes(Number(p.get('days'))) ? Number(p.get('days')) : 90;
      const mode = p.get('mode') === 'gross' ? 'gross' : 'net';
      const meta = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [m.creator_id, m.nickname]));
      const users = all("SELECT id, name, role, all_creators, avatar FROM users WHERE deleted = 0 AND active = 1 AND discord_id IS NOT NULL AND role <> 'model'");
      const access = all('SELECT user_id, creator_id FROM user_creators');
      const myPerms = u.perms || [];

      const mine = creators().filter((c) => /mym/i.test(c.platform || '') && canSee({ ...u, pf: null }, c.id));
      const list = await Promise.all(
        mine.map(async (c) => {
          const rev = await revenueOf(c.id, days, mode).catch((e) => ({ error: e.message, total: 0, delta: null, series: Array(days).fill(0), newSubs: 0, parts: {} }));
          const fans = all('SELECT status, gross FROM mym_fans WHERE creator_id = ? AND checked_at > 0', c.id);
          let counts = { active: 0, old: 0, interested: 0 };
          for (const f of fans) counts[tabOf(f.status)]++;
          // Compte relié à MYM : les vrais compteurs de MYM.
          let direct = false;
          if (isLinked(c.id)) {
            const m = await mymFollowerCounts(c.id).catch(() => null);
            if (m) (counts = { active: m.active, old: m.old, interested: m.interested }), (direct = true);
          }
          const team = users.filter((x) => seesAll(x) || x.all_creators || access.some((a) => a.user_id === x.id && a.creator_id === c.id));
          return {
            id: c.id,
            name: meta.get(c.id) || c.name,
            handle: c.username || null,
            avatar: c.avatar || null,
            total: Math.round(rev.total * 100) / 100,
            delta: rev.delta == null ? null : Math.round(Number(rev.delta) * 10) / 10,
            series: rev.series,
            newSubs: rev.newSubs,
            parts: rev.parts,
            error: rev.error || null,
            source: rev.source || null,
            since: rev.since || null,
            sales: rev.sales ?? null,
            complete: rev.complete ?? null,
            ai: rev.ai ?? null,
            analysed: rev.analysed ?? null,
            byTeam: rev.team ?? null,
            auto: rev.auto ?? null,
            fans: { ...counts, checked: fans.length, payers: fans.filter((f) => f.gross > 0).length, direct },
            team: { leads: team.filter((x) => ['admin', 'manager', 'lead'].includes(x.role)).length, chatters: team.filter((x) => x.role === 'chatter').length, total: team.length },
            online: onCreator(c.id).map((o) => ({ name: o.name, avatar: o.avatar })),
          };
        }),
      );
      const total = list.reduce((a, c) => a + c.total, 0);
      // Évolution globale : pondérée par le CA de chaque compte (Substy donne l'évolution compte par compte).
      const prev = list.reduce((a, c) => a + (c.delta != null && c.delta > -100 ? c.total / (1 + c.delta / 100) : 0), 0);
      const sum = (k) => list.reduce((a, c) => a + c.fans[k], 0);
      send(res, 200, {
        days,
        mode,
        role: u.roleName || u.role,
        perms: PERMS.filter((x) => myPerms.includes(x.key)).map((x) => x.label),
        totals: {
          revenue: Math.round(total * 100) / 100,
          delta: prev > 0 ? Math.round(((total - prev) / prev) * 1000) / 10 : null,
          perDay: Math.round((total / days) * 100) / 100,
          series: Array.from({ length: days }, (_, i) => Math.round(list.reduce((a, c) => a + (c.series[i] || 0), 0) * 100) / 100),
          active: sum('active'),
          old: sum('old'),
          interested: sum('interested'),
          checked: sum('checked'),
          newSubs: list.reduce((a, c) => a + c.newSubs, 0),
          accounts: list.length,
          online: new Set(list.flatMap((c) => c.online.map((o) => o.name))).size,
        },
        source: list.some((c) => c.source === 'mym') ? 'mym' : list.some((c) => c.source === 'live') ? 'live' : 'overview',
        complete: list.filter((c) => c.source === 'mym').every((c) => c.complete),
        ai: Math.round(list.reduce((a, c) => a + (c.ai || 0), 0) * 100) / 100,
        analysed: Math.round(list.reduce((a, c) => a + (c.analysed || 0), 0) * 100) / 100,
        byTeam: Math.round(list.reduce((a, c) => a + (c.byTeam || 0), 0) * 100) / 100,
        since: list.map((c) => c.since).filter(Boolean).sort()[0] || null,
        accounts: list,
      });
    },
  };
}
