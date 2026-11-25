// Bloom v2 → Liens de suivi : UN écran pour OnlyFans et MYM (25/11/2026, design « Constellation »).
// Il remplace, dans la v2, la copie de MyPulse (MymTrack) et celle d'Infloww (TrackingLinks). Les liens eux-mêmes ne
// changent pas, parce que les deux plateformes ne marchent pas pareil :
//  - OnlyFans : ce sont des liens FAITS PAR BLOOM (tracking.mjs, « /l/<code> »). Bloom compte les clics, attribue chaque
//    nouvel abonné au dernier clic (30 min avant) et additionne ses dépenses vues chez Substy (brut ; net = brut × 0,8) ;
//  - MYM : ce sont les liens de MYM (mymtrack.mjs). Bloom lit leurs TOTAUX sur le site et en garde un relevé par jour :
//    le détail par jour n'existe donc que depuis le premier relevé (24/11/2026), par différence entre deux relevés.
// Cette route ne fait que LIRE, dans une même forme pour les deux plateformes : totaux de chaque lien depuis sa création,
// et ce qui s'est passé jour par jour sur la période (et la période d'avant). Montants en CENTIMES de la devise de la
// plateforme. Créer, modifier, activer, supprimer, partager : les routes existantes de tracking.mjs et mymtrack.mjs.
import { all } from './store.mjs';
import { isBoss, seesAll } from './team.mjs';
import { parisDay, parisMidnight } from './revenue.mjs';
import { SOURCES } from './tracking.mjs';
import { syncTrack, trackState } from './mymtrack.mjs';
import { askOf } from './v2stats.mjs';

const DAY = 864e5;
const FEE = 0.8; // net OnlyFans = brut × 0,8, comme dans tracking.mjs
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const zero = () => ({ clicks: 0, subs: 0, revenue: 0 });
const J = (s, d) => {
  try {
    return JSON.parse(s ?? '');
  } catch {
    return d;
  }
};

/** Liens OnlyFans (faits par Bloom) d'une modèle : totaux, et clics / abonnés / dépenses rangés par jour de [days]. */
function ofLinks(cid, days, gross) {
  const len = days.length / 2; // `days` = période d'avant puis période
  const mid = days.map(parisMidnight);
  mid.push(parisMidnight(addDay(days[days.length - 1], 1)));
  const lo = mid[0];
  const hi = mid[mid.length - 1];
  const idxOf = (at) => {
    let a = 0;
    let b = mid.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (mid[m] <= at) a = m;
      else b = m;
    }
    return a;
  };
  const k = gross ? 1 : FEE;
  const rows = all('SELECT * FROM track_links WHERE creator_id = ? ORDER BY created_at DESC', cid);
  // Par lien : totaux (les revenus sont additionnés en brut, convertis à la fin) et un tableau par jour.
  const acc = new Map(rows.map((l) => [l.id, { clicks: 0, subs: 0, gross: 0, buyers: 0, day: days.map(() => [0, 0, 0]) }]));
  for (const r of all('SELECT link_id, COUNT(*) AS n FROM track_clicks WHERE creator_id = ? GROUP BY link_id', cid)) if (acc.has(r.link_id)) acc.get(r.link_id).clicks = r.n;
  for (const r of all('SELECT link_id, at FROM track_clicks WHERE creator_id = ? AND at >= ? AND at < ?', cid, lo, hi)) {
    const a = acc.get(r.link_id);
    if (a) a.day[idxOf(r.at)][0]++;
  }
  const fans = all('SELECT fan_id, link_id, subscribed_at FROM track_fans WHERE creator_id = ?', cid);
  const fanOf = new Map();
  for (const f of fans) {
    const a = acc.get(f.link_id);
    if (!a) continue;
    fanOf.set(String(f.fan_id), { a, since: f.subscribed_at || 0, spent: 0 });
    a.subs++;
    const t = f.subscribed_at || 0;
    if (t >= lo && t < hi) a.day[idxOf(t)][1]++;
  }
  // Dépenses des fans arrivés par un lien, depuis leur abonnement (ventes vues chez Substy).
  if (fanOf.size) {
    for (const s of all('SELECT fan_id, at, gross FROM rv_live WHERE creator_id = ? AND fan_id IS NOT NULL', cid)) {
      const f = fanOf.get(String(s.fan_id));
      if (!f || s.at < f.since) continue;
      f.a.gross += s.gross;
      f.spent += s.gross;
      if (s.at >= lo && s.at < hi) f.a.day[idxOf(s.at)][2] += s.gross;
    }
    for (const f of fanOf.values()) if (f.spent > 0) f.a.buyers++;
  }
  const links = rows.map((l) => {
    const a = acc.get(l.id);
    const sum = (from, to) => a.day.slice(from, to).reduce((x, d) => ({ clicks: x.clicks + d[0], subs: x.subs + d[1], revenue: x.revenue + d[2] }), zero());
    const money = (x) => ({ ...x, revenue: Math.round(x.revenue * k) });
    return {
      id: String(l.id), name: l.name, url: null, code: l.code, dest: l.dest, created: parisDay(l.created_at), active: !!l.active,
      clicks: a.clicks, subs: a.subs, revenue: Math.round(a.gross * k), buyers: a.buyers, items: null, parts: null,
      source: l.source, tags: J(l.tags, []), cost: Math.round((l.cost || 0) * 100), listId: l.list_id || null, listName: l.list_name || null, createdBy: l.created_by || null,
      period: money(sum(len, len * 2)), prev: money(sum(0, len)),
      days: a.day.slice(len).map((d) => [d[0], d[1], Math.round(d[2] * k)]),
    };
  });
  return { links, since: null, covered: true, prevCovered: true, at: null };
}

/**
 * Liens MYM d'une modèle : totaux lus chez MYM, et par jour la DIFFÉRENCE entre deux relevés (rien avant le premier
 * relevé d'un lien qui existait déjà : sa base n'est pas connue ; un lien créé après le début des relevés part de zéro).
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
    const sum = (from, to) => day.slice(from, to).reduce((x, d) => ({ clicks: x.clicks + d[0], subs: x.subs + d[1], revenue: x.revenue + d[2] }), zero());
    return {
      id: String(l.link_id), name: l.name, url: l.url || null, code: null, dest: null, created: l.created || null, active: true,
      clicks: l.clicks || 0, subs: l.subs || 0, revenue: l.total || 0, buyers: null, items: l.ppv_n || 0, parts: { subs: l.sub_rev || 0, content: l.ppv || 0 },
      source: null, tags: [], cost: 0, listId: null, listName: null, createdBy: null,
      period: sum(len, len * 2), prev: sum(0, len),
      days: day.slice(len),
    };
  });
  // La période n'est entièrement connue que si un relevé existait avant son premier jour.
  return { links, since, covered: !!since && since < days[len], prevCovered: !!since && since < days[0], at: rows.reduce((m, l) => Math.max(m, l.at || 0), 0) || null };
}

/** Ce que montre l'écran pour une modèle : ses liens, la période jour par jour, et les totaux de la période. */
export function v2Links({ pf, creator, from, to, gross }) {
  const cid = String(creator.id);
  const cur = [];
  for (let d = from; d <= to; d = addDay(d, 1)) cur.push(d);
  const len = cur.length;
  const days = [];
  for (let d = addDay(from, -len); d <= to; d = addDay(d, 1)) days.push(d);
  const data = pf === 'mym' ? mymLinks(cid, days) : ofLinks(cid, days, gross);
  const add = (k) => data.links.reduce((x, l) => ({ clicks: x.clicks + l[k].clicks, subs: x.subs + l[k].subs, revenue: x.revenue + l[k].revenue }), zero());
  return { ...data, days: cur, period: add('period'), prev: add('prev') };
}

/** Colonne des modèles : nombre de liens et abonnés gagnés par les liens, depuis toujours (deux requêtes légères). */
function ranking(pf, mine) {
  const by = new Map();
  if (pf === 'mym') for (const r of all('SELECT creator_id, COUNT(*) AS n, SUM(subs) AS subs, SUM(clicks) AS clicks FROM mym_track_links WHERE COALESCE(gone, 0) = 0 GROUP BY creator_id')) by.set(String(r.creator_id), { links: r.n, subs: r.subs || 0, clicks: r.clicks || 0 });
  else {
    for (const r of all('SELECT creator_id, COUNT(*) AS n FROM track_links WHERE active = 1 GROUP BY creator_id')) by.set(String(r.creator_id), { links: r.n, subs: 0, clicks: 0 });
    for (const r of all('SELECT creator_id, COUNT(*) AS n FROM track_fans GROUP BY creator_id')) by.set(String(r.creator_id), { ...(by.get(String(r.creator_id)) || { links: 0, clicks: 0 }), subs: r.n });
    for (const r of all('SELECT creator_id, COUNT(*) AS n FROM track_clicks GROUP BY creator_id')) by.set(String(r.creator_id), { ...(by.get(String(r.creator_id)) || { links: 0, subs: 0 }), clicks: r.n });
  }
  return mine
    .map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null, ...(by.get(String(c.id)) || { links: 0, subs: 0, clicks: 0 }) }))
    .sort((a, b) => b.subs - a.subs || b.clicks - a.clicks || b.links - a.links || a.name.localeCompare(b.name, 'fr'));
}

export function v2LinksRoutes({ userFrom, send, creators }) {
  return {
    // Les liens de suivi d'une modèle : ?pf=of|mym, ?from=&to= (jours de Paris), &creatorId= (sinon la première de la
    // colonne), &mode=gross (OnlyFans), &fresh=1 (MYM : relire les liens sur le site de MYM avant de répondre).
    'GET /api/v2/links': async (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' });
      const { p, pf, from, to, today, mine, gross } = askOf(u, req, creators);
      const asked = p.get('creatorId') || '';
      const list = ranking(pf, mine);
      const creator = mine.find((c) => String(c.id) === asked) || mine.find((c) => String(c.id) === list[0]?.id) || null;
      const base = {
        platform: pf, currency: pf === 'of' ? 'USD' : 'EUR', mode: gross ? 'gross' : 'net', canGross: pf === 'of', from, to, today,
        all: mine.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null })), list,
        // OnlyFans : liens de Bloom, les team leaders les gèrent. MYM : liens du compte de la modèle, admins et managers.
        native: pf === 'mym', canEdit: pf === 'mym' ? seesAll(u) : true,
      };
      if (!creator) return send(res, 200, { ...base, model: null });
      const cid = String(creator.id);
      let error = null;
      if (pf === 'mym' && p.get('fresh') === '1') await syncTrack(cid).catch((e) => (error = e.message));
      const st = pf === 'mym' ? trackState(cid) : null;
      // Pas de mémoire ici : après une création ou une suppression, l'écran doit voir le changement tout de suite.
      const data = v2Links({ pf, creator, from, to, gross });
      send(res, 200, {
        ...base, ...data,
        model: { id: cid, name: creator.name, avatar: creator.avatar || null },
        at: st?.ok || data.at || null, error: error || st?.error || null,
        ...(pf === 'of' ? { sources: SOURCES, tags: all('SELECT name FROM track_tags ORDER BY name').map((r) => r.name), profile: creator.username ? `https://onlyfans.com/${creator.username}` : 'https://onlyfans.com/' } : {}),
      });
    },
  };
}
