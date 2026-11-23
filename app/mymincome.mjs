// Revenus MYM en direct (compte relié), sans Substy ni MyPulse. Relevé le 23/11/2026 sur creators.mym.fans → Revenus :
//  - GET /app/income-fetch?page=N (site, session du compte) → un morceau de page avec 10 transactions, de la plus récente
//    à la plus ancienne. Pour chacune : une carte « card-income » (data-transaction-id, titre « Subscription » /
//    « Private content »…, montant « +11.27 € », <time datetime>, état) et un panneau « panel--income--<id> »
//    (commande « #… », pseudo du fan, lien « /app/chat/fan/<idFan>/init »).
//  - Le fan y est désigné par son ancien numéro ; la messagerie (styx) utilise un autre identifiant. Bloom fait le lien
//    par le pseudo (liste des conversations, sinon recherche chez MYM) et garde l'identifiant de la messagerie.
//  - La liste contient aussi les virements à la créatrice (« Versement PU… », montant négatif) : gardés à 0 €, type
//    « payout », pour ne pas fausser le chiffre d'affaires.
//  - Autres titres vus : « Média privé », « Pourboires », « Media On Demand », « Médias push ».
//  - Les montants sont NETS : ce que MYM crédite à la créatrice (pas ce que le fan a payé). Abonnement gratuit = 0 €.
//  - Le site s'affiche en français ou en anglais selon le compte : les titres sont reconnus dans les deux langues.
// Ces transactions vont dans `rv_live` (src = 'mym') : tout Bloom lit déjà cette table (Compte Creator, Mes ventes,
// alertes de vente, dépense des fans). Pour une créatrice reliée, les ventes de Substy n'y entrent plus.
// Part de l'IA : pour chaque contenu privé acheté ou pourboire récent, Bloom retrouve le message concerné chez MYM et
// regarde qui l'a envoyé (un chatteur dans Bloom, sinon l'IA de Substy si elle est active sur ce fan : estimation, voir
// mymchat.mjs) → colonnes `origin`, `origin_by`.
import './revenue.mjs';
import { all, db, getSetting, one, run, setSetting } from './store.mjs';
import { isLinked, mymSiteRaw } from './mym.mjs';
import { mymAuthor, mymChatMessages, mymChatPage } from './mymchat.mjs';
import { inboxChat, inboxFanByUsername } from './chat.mjs';

const DAY = 864e5;
const KEEP_DAYS = 90;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const sql of ['ALTER TABLE rv_live ADD COLUMN src TEXT', 'ALTER TABLE rv_live ADD COLUMN origin TEXT', 'ALTER TABLE rv_live ADD COLUMN origin_by TEXT', 'ALTER TABLE rv_live ADD COLUMN raw TEXT', 'ALTER TABLE rv_live ADD COLUMN attr_at INTEGER']) {
  try {
    db.exec(sql);
  } catch {}
}
db.exec('CREATE INDEX IF NOT EXISTS rv_live_creator_at ON rv_live (creator_id, at)');
run("UPDATE rv_live SET type = 'payout', gross = 0 WHERE src = 'mym' AND type = 'refund' AND (raw LIKE 'Versement%' OR raw LIKE 'Payout%' OR raw LIKE 'Virement%')");
// 23/11/2026 : les premières ventes ont été attribuées avant la règle « IA déduite » : on les refait.
if (!getSetting('mym_attr_fix2')) {
  run("UPDATE rv_live SET attr_at = NULL, origin = NULL, origin_by = NULL, message_id = NULL WHERE src = 'mym'");
  setSetting('mym_attr_fix2', '1');
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const text = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&(#\d+|\w+);/g, (a, e) => (e[0] === '#' ? String.fromCodePoint(Number(e.slice(1))) : ENT[e] ?? a)).replace(/\s+/g, ' ').trim();
/** « +11.27 € », « 1,889.71 € », « 1 889,71 € », « -5 € » → centimes. */
export function moneyCents(s) {
  const neg = /[-−–]/.test(s);
  let t = String(s || '').replace(/[^0-9.,]/g, '');
  const dec = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  if (dec >= 0 && t.length - dec - 1 <= 2) t = `${t.slice(0, dec).replace(/[.,]/g, '')}.${t.slice(dec + 1)}`;
  else t = t.replace(/[.,]/g, '');
  const v = Math.round(Number(t) * 100) || 0;
  return neg ? -v : v;
}
/** Titre de la transaction (français ou anglais) → type de Bloom. */
function typeOf(title, amount) {
  const t = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // Virement des gains à la créatrice (« Versement PU… ») : ce n'est pas une vente.
  if (/versement|payout|virement|withdraw/.test(t)) return 'payout';
  if (amount < 0 || /refund|rembours|chargeback|fraud/.test(t)) return 'refund';
  if (/subscri|abonnement|renew|renouvel/.test(t)) return 'sub';
  if (/tip|pourboire/.test(t)) return 'tip';
  if (/push/.test(t)) return 'push';
  if (/priv|media|message|unlock|debloc/.test(t)) return 'ppv';
  if (/post|publication/.test(t)) return 'post';
  return 'other';
}

/** Les transactions d'un morceau de page « income-fetch ». */
export function parseIncome(html) {
  const marks = [];
  const tagRe = /<div\b[^>]*>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const id = /data-transaction-id="(\d+)"/.exec(m[0])?.[1];
    if (!id) continue;
    const kind = /class="card-income"/.test(m[0]) ? 'card' : /panel--income/.test(m[0]) ? 'panel' : null;
    if (kind) marks.push({ kind, id, idx: m.index });
  }
  const tx = new Map();
  marks.forEach((k, i) => {
    const chunk = html.slice(k.idx, marks[i + 1]?.idx ?? html.length);
    const t = tx.get(k.id) || { id: k.id };
    if (k.kind === 'card') {
      t.title = text(/card-income__info--title[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(chunk)?.[1]);
      const amount = text(/card-income__info--amount[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(chunk)?.[1]);
      t.amount = moneyCents(amount);
      t.currency = amount.includes('$') ? 'USD' : 'EUR';
      const dt = /datetime="([^"]+)"/.exec(chunk)?.[1];
      t.at = Date.parse(dt || '') || null;
      t.status = /card-income__info--status-([a-z_-]+)/.exec(chunk)?.[1] || null;
    } else {
      t.fanId = /\/app\/chat\/fan\/(\d+)\//.exec(chunk)?.[1] || null;
      t.fan = text(/panel__income--pseudo[^"]*"[^>]*>([\s\S]*?)<\//.exec(chunk)?.[1]).replace(/^@/, '') || null;
      t.order = /#(\d+)/.exec(text(/tag__text[^"]*"[^>]*>([\s\S]*?)<\//.exec(chunk)?.[1]))?.[1] || null;
    }
    tx.set(k.id, t);
  });
  return [...tx.values()].filter((t) => t.at && t.title != null);
}

const state = new Map(); // cid -> { at, ok, error, busy }
const st = (cid) => state.get(cid) || (state.set(cid, { at: 0, ok: 0, error: null, busy: false }), state.get(cid));
const known = (id) => !!one('SELECT 1 AS x FROM rv_live WHERE id = ?', `mym:${id}`);
function save(cid, list) {
  const now = Date.now();
  let fresh = 0;
  for (const t of list) {
    const type = typeOf(t.title, t.amount);
    const r = run(
      `INSERT OR IGNORE INTO rv_live (id, creator_id, type, at, gross, currency, fan_id, fan_name, message_id, matched, first_seen, src, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'mym', ?)`,
      `mym:${t.id}`, cid, type, t.at, type === 'payout' ? 0 : t.amount, t.currency, inboxFanByUsername(cid, t.fan) || t.fanId, t.fan, now, t.title.slice(0, 80),
    );
    if (r.changes) fresh++;
  }
  return fresh;
}
async function fetchPage(cid, n) {
  const r = await mymSiteRaw(cid, `/app/income-fetch?page=${n}`, { xhr: true });
  if (r.status !== 200) throw new Error(`MYM a répondu ${r.status} sur les revenus`);
  return parseIncome(r.text);
}

/**
 * Une fois les transactions MYM en place, les ventes que Substy avait remontées sur la même période sont retirées
 * (sinon elles compteraient deux fois). Si l'une était déjà rapprochée d'une vente officielle, la vente MYM du même
 * fan au même moment reprend ce rapprochement.
 */
function dropSubsty(cid) {
  const oldest = one("SELECT MIN(at) AS t FROM rv_live WHERE creator_id = ? AND src = 'mym'", cid)?.t;
  if (!oldest) return;
  const rows = all("SELECT id, at, fan_id, fan_name, matched FROM rv_live WHERE creator_id = ? AND COALESCE(src, '') <> 'mym' AND at >= ?", cid, oldest);
  for (const r of rows) {
    if (r.matched) {
      const twin = all("SELECT id, fan_id, fan_name, at FROM rv_live WHERE creator_id = ? AND src = 'mym' AND matched IS NULL AND gross > 0 AND at BETWEEN ? AND ?", cid, r.at - 120_000, r.at + 120_000)
        .filter((x) => (r.fan_id && x.fan_id ? x.fan_id === r.fan_id : String(x.fan_name || '').toLowerCase() === String(r.fan_name || '').toLowerCase()))
        .sort((a, b) => Math.abs(a.at - r.at) - Math.abs(b.at - r.at))[0];
      if (twin) run('UPDATE rv_live SET matched = ? WHERE id = ?', r.matched, twin.id);
    }
    run('DELETE FROM rv_live WHERE id = ?', r.id);
  }
}

/** Les transactions récentes : on lit depuis la page 1 jusqu'à retomber sur une page déjà entièrement connue. */
async function syncRecent(cid) {
  let fresh = 0;
  for (let p = 1; p <= 40; p++) {
    const list = await fetchPage(cid, p);
    if (!list.length) break;
    const allKnown = list.every((t) => known(t.id));
    fresh += save(cid, list);
    if (allKnown || list[list.length - 1].at < Date.now() - KEEP_DAYS * DAY) break;
    await sleep(500);
  }
  return fresh;
}
/** L'historique (90 jours), repris là où il s'était arrêté : quelques pages à chaque passage. */
async function backfill(cid) {
  if (getSetting(`mym_tx_done:${cid}`)) return;
  const n = one("SELECT COUNT(*) AS n FROM rv_live WHERE creator_id = ? AND src = 'mym'", cid)?.n || 0;
  let p = Math.max(1, Math.floor(n / 10) - 1);
  for (let i = 0; i < 25; i++, p++) {
    const list = await fetchPage(cid, p);
    save(cid, list);
    if (!list.length || list[list.length - 1].at < Date.now() - KEEP_DAYS * DAY) {
      setSetting(`mym_tx_done:${cid}`, String(Date.now()));
      break;
    }
    await sleep(700);
  }
}

/** Ventes payantes encore rangées sous l'ancien numéro du fan : on retrouve son identifiant de messagerie par le pseudo. */
const searched = new Set();
async function relink(cid) {
  const rows = all("SELECT DISTINCT fan_id, fan_name FROM rv_live WHERE creator_id = ? AND src = 'mym' AND gross > 0 AND fan_id NOT LIKE '%-%' AND fan_name IS NOT NULL AND at > ?", cid, Date.now() - 14 * DAY);
  let calls = 0;
  for (const r of rows) {
    let id = inboxFanByUsername(cid, r.fan_name);
    const key = `${cid}:${r.fan_id}`;
    if (!id && !searched.has(key) && calls < 5) {
      searched.add(key);
      calls++;
      const found = await mymChatPage(cid, undefined, r.fan_name).catch(() => null);
      id = found?.items.find((c) => String(c.username || '').toLowerCase() === String(r.fan_name).toLowerCase())?.fanId || null;
      await sleep(300);
    }
    if (id) run("UPDATE rv_live SET fan_id = ? WHERE creator_id = ? AND src = 'mym' AND fan_id = ?", id, cid, r.fan_id);
  }
}

/** Qui a fait la vente : le message acheté (contenu privé) ou le dernier message avant le pourboire (2 h). */
async function attribute(cid) {
  const rows = all("SELECT id, type, at, fan_id FROM rv_live WHERE creator_id = ? AND src = 'mym' AND type IN ('ppv', 'tip') AND gross > 0 AND fan_id LIKE '%-%' AND attr_at IS NULL AND at > ? ORDER BY at DESC LIMIT 6", cid, Date.now() - 14 * DAY);
  for (const r of rows) {
    // Vente toute fraîche : on laisse une minute à Substy pour dire si son IA a écrit le message.
    if (Date.now() - r.at < 60_000) continue;
    let origin = null;
    let by = null;
    let mid = null;
    try {
      const d = await mymChatMessages(cid, r.fan_id, { limit: 30 });
      const out = d.views.filter((v) => !v.fromFan);
      let hit;
      if (r.type === 'ppv') {
        const used = new Set(all('SELECT message_id FROM rv_live WHERE creator_id = ? AND fan_id = ? AND message_id IS NOT NULL', cid, r.fan_id).map((x) => x.message_id));
        hit = out.filter((v) => v.price > 0 && v.paid && Date.parse(v.at) <= r.at + 60_000 && !used.has(v.id))[0];
        mid = hit?.id || null;
      } else hit = out.filter((v) => Date.parse(v.at) <= r.at && Date.parse(v.at) >= r.at - 2 * 3600_000)[0];
      if (hit) {
        // IA de Substy : déduite (message pas parti de Bloom, IA active sur ce fan), voir mymchat.mjs.
        const a = mymAuthor(cid, r.fan_id, hit, !!inboxChat(cid, r.fan_id)?.ai);
        origin = a?.kind || null;
        by = a?.name || null;
      }
    } catch (e) {
      // MYM ne répond pas : on réessaiera au prochain passage.
      continue;
    }
    run('UPDATE rv_live SET message_id = ?, origin = ?, origin_by = ?, attr_at = ? WHERE id = ?', mid, origin, by, Date.now(), r.id);
    await sleep(400);
  }
}

async function tick(cid) {
  const s = st(cid);
  if (s.busy) return;
  s.busy = true;
  s.at = Date.now();
  try {
    await syncRecent(cid);
    setSetting(`mym_tx_on:${cid}`, '1');
    dropSubsty(cid);
    await backfill(cid);
    dropSubsty(cid);
    await relink(cid);
    await attribute(cid);
    s.ok = Date.now();
    s.error = null;
  } catch (e) {
    s.error = e.message;
  } finally {
    s.busy = false;
  }
}

/** Les revenus MYM de cette créatrice sont lus en direct (au moins une lecture réussie). */
export const mymIncomeOn = (cid) => isLinked(String(cid)) && !!getSetting(`mym_tx_on:${cid}`);

const ymd = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(t));
/** Chiffres d'une créatrice sur `days` jours (jour en cours compris), au format de « Compte Creator ». */
export function mymIncome(cid, days) {
  const from = Date.now() - days * DAY;
  const rows = all("SELECT at, gross, type, origin, currency FROM rv_live WHERE creator_id = ? AND src = 'mym' AND at >= ?", cid, from - days * DAY);
  const cur = rows.filter((x) => x.at >= from);
  const sum = (l) => l.reduce((a, x) => a + x.gross, 0) / 100;
  const total = sum(cur);
  const before = sum(rows.filter((x) => x.at < from));
  const since = one("SELECT MIN(at) AS t FROM rv_live WHERE creator_id = ? AND src = 'mym'", cid)?.t || null;
  const complete = !!getSetting(`mym_tx_done:${cid}`);
  const byDay = new Map();
  for (const x of cur) byDay.set(ymd(x.at), (byDay.get(ymd(x.at)) || 0) + x.gross / 100);
  const part = (f) => Math.round(sum(cur.filter(f)) * 100) / 100;
  return {
    total,
    // Évolution : seulement si l'historique couvre aussi la période d'avant.
    delta: before > 0 && (complete || (since && since <= from - days * DAY)) ? ((total - before) / before) * 100 : null,
    series: Array.from({ length: days }, (_, i) => Math.round((byDay.get(ymd(Date.now() - (days - 1 - i) * DAY)) || 0) * 100) / 100),
    currency: cur[0]?.currency || 'EUR',
    newSubs: cur.filter((x) => x.type === 'sub').length,
    source: 'mym',
    since,
    complete,
    sales: cur.filter((x) => x.gross > 0).length,
    parts: { messages: part((x) => x.type === 'ppv'), tips: part((x) => x.type === 'tip'), subscriptions: part((x) => x.type === 'sub'), posts: part((x) => x.type === 'post' || x.type === 'push') },
    // Part de l'IA de Substy et de l'équipe (ventes dont Bloom a retrouvé le message).
    ai: part((x) => x.origin === 'ai'),
    team: part((x) => x.origin === 'bloom' || x.origin === 'employee'),
    auto: part((x) => x.origin === 'auto' || x.origin === 'script'),
  };
}

export function startMymIncome(creators) {
  let i = 0;
  // Une créatrice toutes les 4 s, chacune relue au plus toutes les 45 s.
  setInterval(() => {
    const ids = creators().filter((c) => /mym/i.test(c.platform || '') && isLinked(c.id)).map((c) => String(c.id));
    if (!ids.length) return;
    const cid = ids[i++ % ids.length];
    if (Date.now() - st(cid).at >= 45_000) tick(cid);
  }, 4_000);
}

export function mymIncomeRoutes({ userFrom, send, creators, live = () => ({}) }) {
  return {
    // État de la lecture des revenus MYM (admins, managers) : pour vérifier que tout suit.
    'GET /api/mym/income/status': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (!['admin', 'manager'].includes(u.role)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      const list = creators().filter((c) => /mym/i.test(c.platform || '') && isLinked(c.id)).map((c) => {
        const cid = String(c.id);
        const a = one("SELECT COUNT(*) AS n, MIN(at) AS first, MAX(at) AS last, SUM(gross > 0) AS paid, SUM(attr_at IS NOT NULL) AS attributed, SUM(gross > 0 AND fan_id LIKE '%-%') AS linked, SUM(message_id IS NOT NULL) AS withMessage, SUM(origin = 'ai') AS ai, SUM(origin = 'bloom') AS bloom FROM rv_live WHERE creator_id = ? AND src = 'mym'", cid);
        const types = Object.fromEntries(all("SELECT type, COUNT(*) AS n FROM rv_live WHERE creator_id = ? AND src = 'mym' GROUP BY type", cid).map((r) => [r.type, r.n]));
        const titles = all("SELECT raw, COUNT(*) AS n FROM rv_live WHERE creator_id = ? AND src = 'mym' GROUP BY raw ORDER BY n DESC LIMIT 12", cid).map((r) => `${r.raw} (${r.n})`);
        const substy = one("SELECT COUNT(*) AS n FROM rv_live WHERE creator_id = ? AND COALESCE(src, '') <> 'mym'", cid)?.n || 0;
        const origins = Object.fromEntries(all("SELECT COALESCE(origin, 'inconnu') AS o, COUNT(*) AS n FROM rv_live WHERE creator_id = ? AND src = 'mym' AND attr_at IS NOT NULL GROUP BY 1", cid).map((r) => [r.o, r.n]));
        // Journal des messages sur 3 jours, par source (substy / mym) et auteur : pour vérifier la reconnaissance de l'IA.
        const journal = all("SELECT COALESCE(src, 'substy') AS src, from_fan AS fromFan, COALESCE(kind, '-') AS kind, COUNT(*) AS n, SUM(text IS NOT NULL AND text <> '') AS withText FROM msg_log WHERE creator_id = ? AND at > ? GROUP BY 1, 2, 3", cid, Date.now() - 3 * DAY);
        const s = st(cid);
        return { id: cid, name: c.name, on: mymIncomeOn(cid), complete: !!getSetting(`mym_tx_done:${cid}`), ...a, types, titles, substyRows: substy, origins, journal, lastTry: s.at || null, lastOk: s.ok || null, error: s.error };
      });
      send(res, 200, { creators: list, live: live() });
    },
  };
}
