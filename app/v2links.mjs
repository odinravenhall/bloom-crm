// Bloom v2 → Liens de suivi : UN écran pour OnlyFans et MYM (25/11/2026, design « Constellation »).
// Il remplace, dans la v2, la copie de MyPulse (MymTrack) et celle d'Infloww (TrackingLinks). Des deux côtés ce sont les
// VRAIS liens de la plateforme, que Bloom ne fait que lire :
//  - OnlyFans : les liens de suivi d'OnlyFans (« onlyfans.com/<pseudo>/c123 », les mêmes que montre Infloww), que Substy
//    synchronise avec OnlyFans. Relevé le 25/11/2026 sur app.substy.ai/tracking-links :
//      `creators.trackingLinks.getTrackingLinks { creatorId, limit, offset }` → { trackingLinks, total, hasMore } ; par
//      lien : name, url, isActive, source, listId, clicks, subscribers, conversionRate, revenue (BRUT, en $),
//      totalRevenue (NET), promoCost, lastSyncAt, syncStatus, syncError, reversals { refundedAmount, chargebackAmount },
//      createdAt (= le jour où Substy a vu le lien pour la première fois, pas sa création chez OnlyFans) ;
//      `creators.trackingLinks.getTrackingLinksStats { creatorId, startDate, endDate }` → metrics (période),
//      chartData (un point par jour : clicks, subscribers, revenue), comparison.previousPeriod.
//    Substy ne donne PAS les « fans qui ont dépensé » ni les tags d'Infloww. Créer un lien se fait chez OnlyFans (ou
//    dans Substy / Infloww) : Bloom ne les crée pas.
//  - MYM : les liens du compte MYM (mymtrack.mjs). Bloom lit leurs TOTAUX sur le site et en garde un relevé par jour :
//    le détail par jour n'existe donc que depuis le premier relevé (24/11/2026), par différence entre deux relevés.
// (Les liens « /l/<code> » faits par Bloom, tracking.mjs, restent dans la version actuelle ; la v2 ne les montre plus :
// personne n'en avait créé, et ceux d'OnlyFans disent exactement d'où vient chaque abonné.)
// Cette route ne fait que LIRE, dans une même forme pour les deux plateformes. Montants en CENTIMES de la devise de la
// plateforme. Créer / supprimer / partager côté MYM : les routes de mymtrack.mjs.
import { all } from './store.mjs';
import { isBoss, seesAll } from './team.mjs';
import { parisDay } from './revenue.mjs';
import { syncTrack, trackState } from './mymtrack.mjs';
import { askOf } from './v2stats.mjs';

const DAY = 864e5;
const FEE = 0.8; // net OnlyFans = brut × 0,8
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const zero = () => ({ clicks: 0, subs: 0, revenue: 0 });
const cents = (x) => Math.round((Number(x) || 0) * 100);

// ---------------------------------------------------------------- OnlyFans : les liens d'OnlyFans, lus chez Substy
// Substy ne relit OnlyFans qu'une à deux fois par heure : ses réponses sont gardées quelques minutes (la demande en
// cours est partagée, pour ne pas interroger Substy deux fois de suite pour la même chose).
const memo = new Map(); // clé → { at, value (promesse) }
function kept(key, ttl, fresh, make) {
  const hit = memo.get(key);
  if (hit && !fresh && Date.now() - hit.at < ttl) return hit.value;
  const value = Promise.resolve().then(make);
  if (memo.size > 600) memo.clear();
  memo.set(key, { at: Date.now(), value });
  value.catch(() => memo.get(key)?.value === value && memo.delete(key));
  return value;
}
const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('Substy ne répond pas')), ms))]);

/** Un lien de Substy → la forme commune de l'écran. `lists` : nom des listes de fans (id → nom). */
function ofLink(l, gross, lists) {
  return {
    id: String(l.id), name: l.name || 'Lien', url: l.url || null, created: l.createdAt ? parisDay(Date.parse(l.createdAt)) : null, active: l.isActive !== false,
    clicks: Number(l.clicks) || 0, subs: Number(l.subscribers) || 0,
    revenue: gross ? cents(l.revenue) : l.totalRevenue != null ? cents(l.totalRevenue) : Math.round(cents(l.revenue) * FEE),
    items: null, parts: null,
    source: l.source || null, cost: cents(l.promoCost), listName: l.listId ? lists.get(String(l.listId)) || 'liste' : null,
    lastSync: l.lastSyncAt ? Date.parse(l.lastSyncAt) || null : null, syncError: l.syncError || null,
    refunds: cents((Number(l.reversals?.refundedAmount) || 0) + (Number(l.reversals?.chargebackAmount) || 0)),
    days: null,
  };
}

async function ofLinks(substy, cid, cur, gross, fresh) {
  const k = gross ? 1 : FEE;
  const list = await kept(`links|${cid}`, 5 * 60_000, fresh, () => substy.trackingLinks(cid));
  let lists = new Map();
  if (list.some((l) => l.listId)) lists = await kept(`lists|${cid}`, 15 * 60_000, false, async () => new Map(((await substy.fanLists(cid))?.items || []).map((x) => [String(x.id), String(x.name || '')]))).catch(() => new Map());
  const links = list.map((l) => ofLink(l, gross, lists));
  // La période : Substy donne un point par jour pour tous les liens ensemble, et la période d'avant.
  let error = null;
  const stats = await kept(`stats|${cid}|${cur[0]}|${cur[cur.length - 1]}`, 5 * 60_000, fresh, () => substy.trackingStats(cid, cur[0], cur[cur.length - 1])).catch((e) => ((error = `Substy n’a pas donné le détail par jour (${e.message}).`), null));
  const byDate = new Map((stats?.chartData || []).map((d) => [String(d.date).slice(0, 10), d]));
  const daily = cur.map((d) => {
    const x = byDate.get(d);
    return [Number(x?.clicks) || 0, Number(x?.subscribers) || 0, Math.round(cents(x?.revenue) * k)];
  });
  const trio = (m) => ({ clicks: Number(m?.clicks) || 0, subs: Number(m?.subscribers) || 0, revenue: Math.round(cents(m?.revenue) * k) });
  const before = stats?.comparison?.previousPeriod || null;
  // Substy ne suit les liens d'une modèle que depuis un certain jour (`since` = le premier lien qu'il a vu). Constaté le
  // 25/11/2026 : les clics et abonnés gagnés AVANT sont comptés d'un coup sur les deux ou trois premiers jours du suivi
  // (seul le revenu a un vrai historique par jour). Une période qui touche ces jours-là n'est donc pas comparable.
  const since = links.reduce((m, l) => (l.created && (!m || l.created < m) ? l.created : m), null);
  const solid = since ? addDay(since, 3) : null;
  const covered = !!stats && (!solid || cur[0] >= solid);
  return {
    links, daily, error,
    period: stats?.metrics ? trio(stats.metrics) : daily.reduce((x, d) => ({ clicks: x.clicks + d[0], subs: x.subs + d[1], revenue: x.revenue + d[2] }), zero()),
    prev: trio(before), since, covered, prevCovered: covered && !!before && (!solid || addDay(cur[0], -cur.length) >= solid),
    at: links.reduce((m, l) => Math.max(m, l.lastSync || 0), 0) || null,
  };
}

/** Colonne des modèles côté OnlyFans : une demande à Substy par modèle, gardée dix minutes (zéro si Substy ne répond pas). */
async function ofRanking(substy, mine) {
  return Promise.all(mine.map(async (c) => {
    const list = await within(kept(`links|${c.id}`, 10 * 60_000, false, () => substy.trackingLinks(String(c.id))), 8000).catch(() => null);
    return { id: String(c.id), name: c.name, avatar: c.avatar || null, links: list ? list.filter((l) => l.isActive !== false).length : 0, subs: (list || []).reduce((a, l) => a + (Number(l.subscribers) || 0), 0), clicks: (list || []).reduce((a, l) => a + (Number(l.clicks) || 0), 0) };
  }));
}

// ---------------------------------------------------------------- MYM : les liens du compte, relevés par Bloom
/**
 * Liens MYM d'une modèle : totaux lus chez MYM, et par jour la DIFFÉRENCE entre deux relevés (rien avant le premier
 * relevé d'un lien qui existait déjà : sa base n'est pas connue ; un lien créé après le début des relevés part de zéro).
 * `days` = la période d'avant puis la période.
 */
function mymLinks(cid, days) {
  const len = days.length / 2;
  const at = new Map(days.map((d, i) => [d, i]));
  const rows = all('SELECT * FROM mym_track_links WHERE creator_id = ? AND COALESCE(gone, 0) = 0 ORDER BY created, name', cid);
  const since = all('SELECT MIN(day) AS d FROM mym_track_daily WHERE creator_id = ?', cid)[0]?.d || null;
  const snaps = new Map();
  for (const s of all('SELECT link_id, day, clicks, subs, total FROM mym_track_daily WHERE creator_id = ? AND day <= ? ORDER BY day', cid, days[days.length - 1])) {
    if (!snaps.has(s.link_id)) snaps.set(s.link_id, []);
    snaps.get(s.link_id).push(s);
  }
  const total = days.map(() => [0, 0, 0]);
  const links = rows.map((l) => {
    const day = days.map(() => [0, 0, 0]);
    let before = null;
    for (const s of snaps.get(l.link_id) || []) {
      // Premier relevé du lien : compté seulement s'il a été créé après le début des relevés (il part alors de zéro).
      const base = before || (since && /^\d{4}-\d{2}-\d{2}$/.test(l.created || '') && l.created > since ? { clicks: 0, subs: 0, total: 0 } : null);
      const i = at.get(s.day);
      if (base && i !== undefined) day[i] = [Math.max(0, (s.clicks || 0) - (base.clicks || 0)), Math.max(0, (s.subs || 0) - (base.subs || 0)), Math.max(0, (s.total || 0) - (base.total || 0))];
      before = s;
    }
    day.forEach((d, i) => d.forEach((v, j) => (total[i][j] += v)));
    return {
      id: String(l.link_id), name: l.name, url: l.url || null, created: l.created || null, active: true,
      clicks: l.clicks || 0, subs: l.subs || 0, revenue: l.total || 0, items: l.ppv_n || 0, parts: { subs: l.sub_rev || 0, content: l.ppv || 0 },
      source: null, cost: 0, listName: null, lastSync: null, syncError: null, refunds: 0,
      days: day.slice(len),
    };
  });
  const sum = (from, to) => total.slice(from, to).reduce((x, d) => ({ clicks: x.clicks + d[0], subs: x.subs + d[1], revenue: x.revenue + d[2] }), zero());
  return {
    links, daily: total.slice(len), error: null, period: sum(len, len * 2), prev: sum(0, len), since,
    // La période n'est entièrement connue que si un relevé existait avant son premier jour.
    covered: !!since && since < days[len], prevCovered: !!since && since < days[0],
    at: rows.reduce((m, l) => Math.max(m, l.at || 0), 0) || null,
  };
}

/** Colonne des modèles côté MYM : nombre de liens, abonnés et clics depuis toujours (une requête légère). */
function mymRanking(mine) {
  const by = new Map(all('SELECT creator_id, COUNT(*) AS n, SUM(subs) AS subs, SUM(clicks) AS clicks FROM mym_track_links WHERE COALESCE(gone, 0) = 0 GROUP BY creator_id').map((r) => [String(r.creator_id), { links: r.n, subs: r.subs || 0, clicks: r.clicks || 0 }]));
  return mine.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null, ...(by.get(String(c.id)) || { links: 0, subs: 0, clicks: 0 }) }));
}

/**
 * Ce que montre l'écran pour une modèle : ses liens (totaux depuis leur création), la période jour par jour (`daily` :
 * [clics, abonnés, revenus] de tous ses liens) et les totaux de la période et de celle d'avant.
 */
export async function v2Links({ pf, creator, from, to, gross, substy, fresh = false }) {
  const cid = String(creator.id);
  const cur = [];
  for (let d = from; d <= to; d = addDay(d, 1)) cur.push(d);
  if (pf === 'mym') {
    const days = [];
    for (let d = addDay(from, -cur.length); d <= to; d = addDay(d, 1)) days.push(d);
    return { ...mymLinks(cid, days), days: cur };
  }
  return { ...(await ofLinks(substy, cid, cur, gross, fresh)), days: cur };
}

export function v2LinksRoutes({ userFrom, send, creators, substy }) {
  return {
    // Les liens de suivi d'une modèle : ?pf=of|mym, ?from=&to= (jours de Paris), &creatorId= (sinon la première de la
    // colonne), &mode=gross (OnlyFans), &fresh=1 (relire tout de suite : le site de MYM, ou Substy côté OnlyFans).
    'GET /api/v2/links': async (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' });
      const { p, pf, from, to, today, mine, gross } = askOf(u, req, creators);
      const asked = p.get('creatorId') || '';
      const fresh = p.get('fresh') === '1';
      const list = (pf === 'mym' ? mymRanking(mine) : await ofRanking(substy, mine)).sort((a, b) => b.subs - a.subs || b.clicks - a.clicks || b.links - a.links || a.name.localeCompare(b.name, 'fr'));
      const creator = mine.find((c) => String(c.id) === asked) || mine.find((c) => String(c.id) === list[0]?.id) || null;
      const base = {
        platform: pf, currency: pf === 'of' ? 'USD' : 'EUR', mode: gross ? 'gross' : 'net', canGross: pf === 'of', from, to, today,
        all: mine.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null })), list,
        // MYM : admins et managers créent et suppriment les liens du compte. OnlyFans : Bloom ne fait que lire.
        canEdit: pf === 'mym' && seesAll(u),
      };
      if (!creator) return send(res, 200, { ...base, model: null });
      const cid = String(creator.id);
      const model = { id: cid, name: creator.name, avatar: creator.avatar || null };
      if (pf === 'mym') {
        let error = null;
        if (fresh) await syncTrack(cid).catch((e) => (error = e.message));
        const st = trackState(cid);
        const data = await v2Links({ pf, creator, from, to, gross });
        return send(res, 200, { ...base, ...data, model, at: st?.ok || data.at, error: error || st?.error || null });
      }
      try {
        send(res, 200, { ...base, ...(await v2Links({ pf, creator, from, to, gross, substy, fresh })), model });
      } catch (e) {
        // Substy n'a pas donné les liens (fonction absente de l'abonnement, compte déconnecté…) : l'écran le dit.
        send(res, 200, { ...base, model, links: [], daily: [], days: [], period: zero(), prev: zero(), since: null, covered: false, prevCovered: false, at: null, error: `Substy n’a pas donné les liens de suivi de cette modèle : ${e.message}` });
      }
    },
  };
}
