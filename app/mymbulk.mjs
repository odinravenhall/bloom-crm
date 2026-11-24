// MYM → Envois groupés (copie de MyPulse), pour les comptes reliés.
//
// 1. PUSH (MYM officiel) — api.mym.fans, relevé le 24/11/2026 dans le code du site (page « Nouveau push ») :
//    - GET /v2/pushes[?offset=<base64 {"page","perPage"}>] → { pagination: { offset }, pushes: [{ id, caption, status, scheduledAt,
//      publishedAt, teaserId, emailAudiences }] } (5 par page, sans médias ni prix : détail par GET /v2/pushes/<id>) ;
//      GET /creators/me/audience → [{ id: 'subscribers' | 'exSubscribers' | 'interested', count }] ;
//      GET /v2/pushes/prices → { ranges: [{ currency, value (centimes) }], limit } ; /discount-durations → { durations: [secondes] }.
//    - GET /v2/pushes (liste), GET /v2/pushes/<id>, DELETE /v2/pushes/<id> (push programmé), GET /creators/me/audience,
//      GET /v2/pushes/prices, /v2/pushes/discount-durations, /v2/pushes/calendar(/restrictions).
//    - créer : POST /v2/pushes { targets: [...], medias: [idsCloud], caption, mod, price: { value (CENTIMES), currency },
//      playlists: [], thirdPartyConsent, teaserId?, discount?: { price: { value, currency }, duration }, scheduledAt?, email? }
//    ⚠️ Un push envoyé ne se retire pas et part à des milliers de fans : un seul essai, jamais de renvoi automatique,
//    réservé aux admins et managers. Format de création lu dans le code du site, pas encore vérifié sur un vrai push.
// 2. MoDs (MYM officiel) : les pushs payants ajoutés au catalogue « Media On Demand » (`mod: true`).
// 3. MASS DM (fait par Bloom, MYM ne le propose pas) : un message privé envoyé fan par fan avec l'envoi direct du Chatting
//    (`mymSend`). Contrairement au push, un message TEXTE peut être retiré (`mymDelete`) ; un message avec média non (MYM
//    le refuse). Messages prêts (`mdm_messages`), campagnes (`mdm_campaigns`), un envoi par fan (`mdm_sends`).
//    Audience = les conversations MYM connues de Bloom (abonnés / anciens / intéressés), groupes de Bloom en plus ou en
//    moins, filtres (nouveaux abonnés, conversation en cours, dépense), prix du message ou « prix intelligent » (calculé
//    sur les achats passés du fan), départ immédiat ou programmé, retrait automatique si non lu, challenge en 2 temps
//    (le fan répond un mot-clé → un second message part tout seul).
import { all, db, one, run } from './store.mjs';
import { API, isLinked, mym } from './mym.mjs';
import { mymChatMessages, mymDelete, mymSend } from './mymchat.mjs';
import { inboxChat, inboxPeek, onMymFanMessage, patchInboxChat, refreshMymInbox } from './chat.mjs';
import { mymGroups } from './fanlists.mjs';
import { canSee, isBoss, seesAll } from './team.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS mym_push_log (id INTEGER PRIMARY KEY, creator_id TEXT NOT NULL, push_id TEXT, payload TEXT NOT NULL, ok INTEGER NOT NULL, answer TEXT, by_name TEXT, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS mdm_messages (
    id INTEGER PRIMARY KEY, creator_id TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL DEFAULT '', price REAL NOT NULL DEFAULT 0, medias TEXT NOT NULL DEFAULT '[]',
    created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS mdm_campaigns (
    id INTEGER PRIMARY KEY, creator_id TEXT NOT NULL, message_id INTEGER, title TEXT NOT NULL, text TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, medias TEXT NOT NULL DEFAULT '[]',
    opts TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL, start_at INTEGER NOT NULL, remove_at INTEGER, total INTEGER NOT NULL DEFAULT 0,
    created_by TEXT, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, note TEXT
  );
  CREATE TABLE IF NOT EXISTS mdm_sends (
    campaign_id INTEGER NOT NULL, fan_id TEXT NOT NULL, fan_name TEXT, status TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, message_id TEXT, at INTEGER, error TEXT,
    reward_at INTEGER, PRIMARY KEY (campaign_id, fan_id)
  );
  CREATE INDEX IF NOT EXISTS mdm_sends_msg ON mdm_sends (message_id);
  CREATE INDEX IF NOT EXISTS mdm_sends_fan ON mdm_sends (fan_id, at);
`);

const DAY = 864e5;
const HOUR = 3600_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (s, d) => {
  try {
    return JSON.parse(s ?? '') ?? d;
  } catch {
    return d;
  }
};
const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
// Identifiants des cibles tels que MYM les donne dans /creators/me/audience (vérifié le 24/11/2026).
const TARGETS = ['subscribers', 'exSubscribers', 'interested'];

// ---------------------------------------------------------------- push : lecture
const pick = (o, ...keys) => {
  for (const k of keys) if (o?.[k] != null) return o[k];
  return null;
};
const mediaView = (m) => (m && typeof m === 'object' ? { id: String(m.id ?? ''), type: /video/i.test(m.type || '') ? 'video' : 'photo', thumb: pick(m, 'preview', 'thumbnail', 'thumbnailUrl', 'thumbnail_url', 'url'), duration: Number(m.duration) || null } : { id: String(m), type: 'photo', thumb: null, duration: null });
function pushView(p) {
  const price = Number(p.price?.value ?? p.price) || 0;
  const stats = p.stats || p.statistics || {};
  return {
    id: String(p.id),
    targets: p.targets || [],
    caption: p.caption || '',
    price: price / 100,
    currency: p.price?.currency || 'EUR',
    mod: !!p.mod,
    status: p.status || null,
    scheduledAt: p.scheduledAt || null,
    sentAt: pick(p, 'sentAt', 'publishedAt', 'createdAt', 'date'),
    medias: (p.medias || []).map(mediaView),
    teaser: p.teaser ? mediaView(p.teaser) : null,
    sales: pick(stats, 'sales', 'salesCount', 'purchases') ?? pick(p, 'sales', 'salesCount', 'purchasesCount'),
    revenue: (() => {
      const r = pick(stats, 'revenue', 'income', 'earnings') ?? pick(p, 'revenue', 'income', 'earnings');
      return r == null ? null : (Number(r?.value ?? r) || 0) / 100;
    })(),
    email: p.email ?? null,
    discount: p.discount ? { price: (Number(p.discount.price?.value) || 0) / 100, duration: p.discount.duration } : null,
  };
}
const listOf = (d) => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.items) ? d.items : Array.isArray(d?.pushes) ? d.pushes : []);
const shape = (o, d = 0) =>
  Array.isArray(o) ? [o.length, o.length ? shape(o[0], d + 1) : null]
  : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).slice(0, 40).map(([k, v]) => [k, d < 4 ? shape(v, d + 1) : '…']))
  : typeof o === 'string' ? (o.length > 40 ? `str(${o.length})` : o)
  : o;

// ---------------------------------------------------------------- mass DM : audience
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tabOf = (c) => (c.sub ? 'active' : c.interested ? 'interested' : 'old');
/** Dépense connue d'un fan chez la créatrice (la plus haute des sources de Bloom), en euros. */
function spendMap(cid) {
  const m = new Map();
  for (const r of all('SELECT fan_id, gross, purchases, subscribed_at FROM mym_fans WHERE creator_id = ?', cid)) m.set(r.fan_id, { spent: r.gross || 0, purchases: r.purchases || 0, since: r.subscribed_at || null });
  for (const r of all("SELECT fan_id, SUM(gross) AS g, COUNT(*) AS n FROM rv_live WHERE creator_id = ? AND src = 'mym' AND gross > 0 AND type <> 'sub' AND fan_id LIKE '%-%' GROUP BY fan_id", cid)) {
    const cur = m.get(r.fan_id) || { spent: 0, purchases: 0, since: null };
    // Les revenus MYM sont nets : on garde le plus grand des deux montants connus.
    m.set(r.fan_id, { ...cur, spent: Math.max(cur.spent, r.g / 100), purchases: Math.max(cur.purchases, r.n) });
  }
  return m;
}
/** Prix « intelligent » d'un fan : son panier moyen passé, entre le minimum et le maximum (le minimum s'il n'a rien acheté). */
function smartPrice(s, min, max) {
  const avg = s && s.purchases > 0 ? s.spent / s.purchases : 0;
  return Math.min(max, Math.max(min, Math.round(avg || min)));
}
/**
 * Les fans visés par une campagne : [{ fanId, name, price }]. `opts` : { audiences: ['active'|'old'|'interested'],
 * include: [idsGroupes], exclude: [idsGroupes], newSubsDays, skipActiveMin, spendMin, spendMax, smart: { min, max } }.
 */
function audience(cid, opts, basePrice, hasMedia) {
  const tabs = new Set(opts.audiences || []);
  const groups = mymGroups(cid);
  const inc = (opts.include || []).map((id) => groups.find((g) => g.id === String(id))?.members).filter(Boolean);
  const exc = (opts.exclude || []).map((id) => groups.find((g) => g.id === String(id))?.members).filter(Boolean);
  const spend = spendMap(cid);
  const now = Date.now();
  const out = [];
  const by = { active: 0, old: 0, interested: 0 };
  for (const c of inboxPeek(cid)) {
    if (!c.mym || c.canSend === false) continue;
    const tab = tabOf(c);
    if (!tabs.has(tab)) continue;
    if (inc.length && !inc.some((s) => s.has(c.fanId))) continue;
    if (exc.some((s) => s.has(c.fanId))) continue;
    const s = spend.get(c.fanId);
    if (opts.newSubsDays > 0 && !(tab === 'active' && s?.since && s.since >= now - opts.newSubsDays * DAY)) continue;
    if (opts.skipActiveMin > 0 && c.last && !c.last.fromCreator && Date.parse(c.last.at) >= now - opts.skipActiveMin * 60_000) continue;
    const spent = Math.max(s?.spent || 0, Number(c.spent) || 0);
    if (opts.spendMin != null && spent < opts.spendMin) continue;
    if (opts.spendMax != null && spent > opts.spendMax) continue;
    by[tab]++;
    out.push({ fanId: c.fanId, name: c.name || c.username || 'Fan', price: hasMedia && opts.smart ? smartPrice(s, opts.smart.min, opts.smart.max) : basePrice });
  }
  return { fans: out, by };
}
function cleanOpts(b) {
  const o = { audiences: (Array.isArray(b.audiences) ? b.audiences : []).filter((a) => ['active', 'old', 'interested'].includes(a)) };
  o.include = (Array.isArray(b.include) ? b.include : []).map(String).slice(0, 50);
  o.exclude = (Array.isArray(b.exclude) ? b.exclude : []).map(String).slice(0, 50);
  if (num(b.newSubsDays) > 0) o.newSubsDays = Math.min(365, Math.round(num(b.newSubsDays)));
  if (num(b.skipActiveMin) > 0) o.skipActiveMin = Math.min(24 * 60, Math.round(num(b.skipActiveMin)));
  if (b.spendMin != null && b.spendMin !== '') o.spendMin = Math.max(0, num(b.spendMin));
  if (b.spendMax != null && b.spendMax !== '') o.spendMax = Math.max(0, num(b.spendMax));
  if (b.smart && num(b.smart.min) >= 5 && num(b.smart.max) >= num(b.smart.min)) o.smart = { min: Math.round(num(b.smart.min)), max: Math.min(1000, Math.round(num(b.smart.max))) };
  if (num(b.removeAfterH) > 0) o.removeAfterH = Math.min(24 * 14, num(b.removeAfterH));
  const ch = b.challenge;
  if (ch && String(ch.keywords || '').trim() && Number(ch.rewardId)) {
    o.challenge = { keywords: String(ch.keywords).split(',').map((k) => norm(k).trim()).filter(Boolean).slice(0, 10), rewardId: Number(ch.rewardId), windowH: Math.min(24 * 14, Math.max(1, num(ch.windowH) || 48)), buyersOnly: !!ch.buyersOnly };
  }
  return o;
}

// ---------------------------------------------------------------- mass DM : envoi (tâche de fond)
// Un message toutes les 1,2 s par créatrice (≈ 3 000 à l'heure). Si MYM dit « trop de demandes », pause d'une minute.
const pace = new Map(); // cid -> prochain envoi possible
let working = false;
const msgOf = (id) => one('SELECT * FROM mdm_messages WHERE id = ?', Number(id));
async function sendOne(c, s) {
  const medias = J(c.medias, []).map((m) => m.id);
  try {
    const mid = await mymSend(c.creator_id, s.fan_id, { message: c.text, medias, priceCents: medias.length ? Math.round(s.price * 100) : 0 });
    run("UPDATE mdm_sends SET status = 'sent', message_id = ?, at = ? WHERE campaign_id = ? AND fan_id = ?", mid, Date.now(), c.id, s.fan_id);
    // La liste des conversations est tenue à jour sans attendre la relecture de MYM (et sans alerte « nouveau message »).
    patchInboxChat(c.creator_id, s.fan_id, { last: { id: mid || `mdm-${c.id}`, text: c.text, at: new Date().toISOString(), fromCreator: true, media: medias.length, readAt: null } });
    return true;
  } catch (e) {
    const busy = e?.status === 429 || /429|too many/i.test(e?.message || '');
    if (busy) {
      pace.set(c.creator_id, Date.now() + 60_000);
      return false;
    }
    run("UPDATE mdm_sends SET status = 'failed', error = ?, at = ? WHERE campaign_id = ? AND fan_id = ?", String(e?.message || e).slice(0, 200), Date.now(), c.id, s.fan_id);
    return true;
  }
}
async function work() {
  if (working) return;
  working = true;
  try {
    const now = Date.now();
    // Campagnes programmées dont l'heure est venue : l'audience est calculée maintenant.
    for (const c of all("SELECT * FROM mdm_campaigns WHERE status = 'scheduled' AND start_at <= ?", now)) {
      if (!isLinked(c.creator_id)) {
        run("UPDATE mdm_campaigns SET status = 'cancelled', note = 'Compte MYM plus relié', finished_at = ? WHERE id = ?", now, c.id);
        continue;
      }
      const opts = J(c.opts, {});
      const a = audience(c.creator_id, opts, c.price, J(c.medias, []).length > 0);
      for (const f of a.fans) run("INSERT OR IGNORE INTO mdm_sends (campaign_id, fan_id, fan_name, status, price) VALUES (?, ?, ?, 'pending', ?)", c.id, f.fanId, f.name, f.price);
      run("UPDATE mdm_campaigns SET status = 'running', started_at = ?, total = ?, remove_at = ? WHERE id = ?", now, a.fans.length, opts.removeAfterH ? null : null, c.id);
    }
    for (const c of all("SELECT * FROM mdm_campaigns WHERE status = 'running' ORDER BY started_at")) {
      if ((pace.get(c.creator_id) || 0) > Date.now()) continue;
      const opts = J(c.opts, {});
      const s = one("SELECT * FROM mdm_sends WHERE campaign_id = ? AND status = 'pending' LIMIT 1", c.id);
      if (!s) {
        const end = Date.now();
        run("UPDATE mdm_campaigns SET status = 'done', finished_at = ?, remove_at = ? WHERE id = ?", end, opts.removeAfterH ? end + opts.removeAfterH * HOUR : null, c.id);
        continue;
      }
      // « Exclure les conversations en cours » : revérifié au moment où chaque message part.
      const chat = inboxChat(c.creator_id, s.fan_id);
      if (opts.skipActiveMin > 0 && chat?.last && !chat.last.fromCreator && Date.parse(chat.last.at) >= Date.now() - opts.skipActiveMin * 60_000) {
        run("UPDATE mdm_sends SET status = 'skipped', error = 'Conversation en cours', at = ? WHERE campaign_id = ? AND fan_id = ?", Date.now(), c.id, s.fan_id);
        continue;
      }
      pace.set(c.creator_id, Date.now() + 1200);
      await sendOne(c, s);
    }
    // Retrait automatique des messages non lus.
    for (const c of all("SELECT * FROM mdm_campaigns WHERE status = 'done' AND remove_at IS NOT NULL AND remove_at <= ?", Date.now())) {
      run('UPDATE mdm_campaigns SET remove_at = NULL WHERE id = ?', c.id);
      withdraw(c, true).catch((e) => console.warn('[bloom] retrait mass DM :', e.message));
    }
  } catch (e) {
    console.warn('[bloom] mass DM :', e.message);
  } finally {
    working = false;
  }
}

/**
 * Retirer les messages d'une campagne chez les fans. `unreadOnly` : seulement là où le message est encore le dernier de
 * la conversation et n'a pas été lu (d'après la liste des conversations de MYM, relue juste avant).
 */
const withdrawing = new Set();
async function withdraw(c, unreadOnly) {
  if (withdrawing.has(c.id)) return;
  withdrawing.add(c.id);
  try {
    if (J(c.medias, []).length) {
      run("UPDATE mdm_campaigns SET note = 'Retrait impossible : MYM refuse de supprimer un message avec média' WHERE id = ?", c.id);
      return;
    }
    if (unreadOnly) await refreshMymInbox(c.creator_id).catch(() => {});
    for (const s of all("SELECT * FROM mdm_sends WHERE campaign_id = ? AND status = 'sent' AND message_id IS NOT NULL", c.id)) {
      if (unreadOnly) {
        const chat = inboxChat(c.creator_id, s.fan_id);
        if (!chat?.last || chat.last.id !== s.message_id || chat.last.readAt) continue;
      }
      try {
        await mymDelete(c.creator_id, s.message_id);
        run("UPDATE mdm_sends SET status = 'removed' WHERE campaign_id = ? AND fan_id = ?", c.id, s.fan_id);
      } catch (e) {
        run('UPDATE mdm_sends SET error = ? WHERE campaign_id = ? AND fan_id = ?', `Retrait refusé : ${String(e?.message || e).slice(0, 150)}`, c.id, s.fan_id);
        if (e?.status === 429) await sleep(60_000);
      }
      await sleep(700);
    }
    run('UPDATE mdm_campaigns SET note = ? WHERE id = ?', unreadOnly ? 'Messages non lus retirés' : 'Messages retirés', c.id);
  } finally {
    withdrawing.delete(c.id);
  }
}

// Challenge en 2 temps : le fan répond le mot-clé dans la fenêtre → le message de récompense part (une seule fois).
onMymFanMessage(async (cid, fanId, v) => {
  const text = ` ${norm(v.text).replace(/[^a-z0-9]+/g, ' ')} `;
  const rows = all("SELECT s.campaign_id, s.at, s.message_id, c.opts FROM mdm_sends s JOIN mdm_campaigns c ON c.id = s.campaign_id WHERE c.creator_id = ? AND s.fan_id = ? AND s.status = 'sent' AND s.reward_at IS NULL AND s.at > ?", cid, String(fanId), Date.now() - 14 * DAY);
  for (const r of rows) {
    const ch = J(r.opts, {}).challenge;
    if (!ch || Date.now() - r.at > ch.windowH * HOUR) continue;
    if (!ch.keywords.some((k) => text.includes(` ${k.replace(/[^a-z0-9]+/g, ' ').trim()} `))) continue;
    const reward = msgOf(ch.rewardId);
    if (!reward || reward.deleted_at) continue;
    if (ch.buyersOnly) {
      const d = await mymChatMessages(cid, fanId, { limit: 30 }).catch(() => null);
      if (!d?.views.some((m) => m.id === r.message_id && m.paid)) continue;
    }
    // Marqué AVANT l'envoi : en cas d'erreur, pas de deuxième essai (jamais deux récompenses).
    run('UPDATE mdm_sends SET reward_at = ? WHERE campaign_id = ? AND fan_id = ?', Date.now(), r.campaign_id, String(fanId));
    const medias = J(reward.medias, []).map((m) => m.id);
    await mymSend(cid, fanId, { message: reward.text, medias, priceCents: medias.length ? Math.round(reward.price * 100) : 0 }).catch((e) => console.warn('[bloom] récompense du challenge :', e.message));
    return;
  }
});

/** Un message envoyé par une campagne de Mass DM ? (pour l'auteur affiché dans la conversation) */
export const isMassDm = (messageId) => !!one('SELECT 1 AS x FROM mdm_sends WHERE message_id = ?', String(messageId));

export function startMymBulk() {
  setInterval(work, 400);
}

// ---------------------------------------------------------------- routes
const synced = new Set();
const details = new Map(); // « créatrice:push » -> détail d'un push déjà parti
export function mymBulkRoutes({ userFrom, send, body, creators }) {
  /** Créatrice MYM reliée que la personne voit. `level` : 'see' (équipe), 'boss' (team leader et +), 'admin' (admin / manager). */
  const pickC = (req, res, cid, level = 'see') => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' }), null;
    if (level === 'admin' && !seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    if (level === 'boss' && !isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    const c = creators().find((x) => x.id === String(cid || '') && /mym/i.test(x.platform || '') && canSee({ ...u, pf: null }, x.id));
    if (!c) return send(res, 404, { error: 'Modèle MYM inconnue' }), null;
    if (!isLinked(c.id)) return send(res, 409, { error: 'Le compte MYM de cette modèle n’est pas relié à Bloom.' }), null;
    return { u, c };
  };
  const qs = (req) => new URL(req.url, 'http://x').searchParams;
  const msgView = (m) => ({ id: m.id, title: m.title, text: m.text, price: m.price, medias: J(m.medias, []), createdBy: m.created_by, updatedAt: m.updated_at });
  const campView = (c) => {
    const n = Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM mdm_sends WHERE campaign_id = ? GROUP BY status', c.id).map((r) => [r.status, r.n]));
    const rev = one("SELECT COUNT(*) AS n, COALESCE(SUM(l.gross), 0) AS g FROM rv_live l JOIN mdm_sends s ON s.message_id = l.message_id WHERE s.campaign_id = ?", c.id);
    const opts = J(c.opts, {});
    return {
      id: c.id, messageId: c.message_id, title: c.title, text: c.text, price: c.price, medias: J(c.medias, []), opts, status: c.status, startAt: c.start_at, startedAt: c.started_at, finishedAt: c.finished_at,
      removeAt: c.remove_at, total: c.total, sent: (n.sent || 0) + (n.removed || 0), pending: n.pending || 0, failed: n.failed || 0, skipped: n.skipped || 0, removed: n.removed || 0,
      sales: rev?.n || 0, revenue: (rev?.g || 0) / 100, createdBy: c.created_by, createdAt: c.created_at, note: c.note || null, removable: !J(c.medias, []).length,
    };
  };

  return {
    // ------------------------------------------------------------ push (MYM officiel)
    'GET /api/mym/push/raw': async (req, res) => {
      const x = pickC(req, res, qs(req).get('creatorId'), 'admin');
      if (!x) return;
      const out = {};
      const first = listOf(await mym(x.c.id, '/v2/pushes', { base: API }).catch(() => null))[0];
      if (first) out.detail = await mym(x.c.id, `/v2/pushes/${first.id}`, { base: API }).then(shape, (e) => ({ error: e.message }));
      for (const p of ['/creators/me/audience', '/v2/pushes/calendar/restrictions', '/v2/pushes/calendar', '/v2/pushes/prices', '/v2/pushes/discount-durations']) out[p] = await mym(x.c.id, p, { base: API }).then(shape, (e) => ({ error: e.message }));
      send(res, 200, out);
    },
    'GET /api/mym/push': async (req, res) => {
      const x = pickC(req, res, qs(req).get('creatorId'));
      if (!x) return;
      try {
        // 4 pages de 5 pushs, puis le détail de chacun (médias, cibles, prix), gardé en mémoire une fois le push parti.
        const rows = [];
        let offset = null;
        for (let i = 0; i < 4; i++) {
          const d = await mym(x.c.id, `/v2/pushes${offset ? `?offset=${encodeURIComponent(offset)}` : ''}`, { base: API });
          rows.push(...listOf(d));
          offset = d?.pagination?.offset || null;
          if (!offset || !listOf(d).length) break;
        }
        const list = await Promise.all(rows.map(async (p) => {
          const key = `${x.c.id}:${p.id}`;
          if (!details.has(key)) {
            const d = await mym(x.c.id, `/v2/pushes/${encodeURIComponent(p.id)}`, { base: API }).catch(() => null);
            const full = d?.data ?? d;
            if (!full) return p;
            if (p.status !== 'pushed') return { ...p, ...full };
            details.set(key, full);
          }
          return { ...p, ...details.get(key) };
        }));
        const [aud, prices, durations, restrictions] = await Promise.all([
          mym(x.c.id, '/creators/me/audience', { base: API }).catch(() => null),
          mym(x.c.id, '/v2/pushes/prices', { base: API }).catch(() => null),
          mym(x.c.id, '/v2/pushes/discount-durations', { base: API }).catch(() => null),
          mym(x.c.id, '/v2/pushes/calendar/restrictions', { base: API }).catch(() => null),
        ]);
        send(res, 200, {
          canSend: seesAll(x.u),
          pushes: list.map(pushView),
          audience: listOf(aud).map((a) => ({ id: String(a.id), count: Number(a.count) || 0 })),
          prices: (prices?.ranges || listOf(prices)).map((p) => (Number(p?.value ?? p) || 0) / 100).filter((v) => v > 0),
          durations: (durations?.durations || listOf(durations)).map((d) => Number(d?.value ?? d?.duration ?? d) || 0).filter(Boolean),
          restrictions: restrictions?.data ?? restrictions ?? null,
          log: all('SELECT push_id AS pushId, ok, answer, by_name AS byName, at FROM mym_push_log WHERE creator_id = ? ORDER BY at DESC LIMIT 20', x.c.id),
        });
      } catch (e) {
        send(res, 502, { error: `MYM : ${e.message}` });
      }
    },
    /** Envoyer ou programmer un push chez MYM. UN SEUL essai : en cas d'erreur, rien n'est renvoyé tout seul. */
    'POST /api/mym/push': async (req, res) => {
      const b = await body(req);
      const x = pickC(req, res, b.creatorId, 'admin');
      if (!x) return;
      const targets = (Array.isArray(b.targets) ? b.targets : []).filter((t) => TARGETS.includes(t));
      const medias = (Array.isArray(b.medias) ? b.medias : []).map(String).filter(Boolean).slice(0, 20);
      const caption = String(b.caption || '').trim();
      const price = Math.round(num(b.price) * 100);
      if (!targets.length) return send(res, 400, { error: 'Choisis au moins une cible.' });
      if (!medias.length) return send(res, 400, { error: 'Choisis au moins un média.' });
      if (!caption) return send(res, 400, { error: 'MYM refuse un push sans message.' });
      if (caption.length > 1500) return send(res, 400, { error: '1 500 caractères au plus.' });
      if (price < 0 || price > 100000) return send(res, 400, { error: 'Prix invalide.' });
      if (b.confirm !== true) return send(res, 400, { error: 'Confirmation manquante.' });
      let scheduledAt = null;
      if (b.scheduledAt) {
        const t = Date.parse(b.scheduledAt);
        if (!t || t < Date.now() + 5 * 60_000) return send(res, 400, { error: 'La date programmée doit être dans plus de 5 minutes.' });
        scheduledAt = new Date(t).toISOString();
      }
      const discount = b.discount && price > 0 && num(b.discount.price) > 0 && Number(b.discount.duration) > 0 ? { price: { value: Math.round(num(b.discount.price) * 100), currency: 'EUR' }, duration: Number(b.discount.duration) } : null;
      // Exactement ce que construit le site de MYM (page « Nouveau push », étape de validation).
      const payload = {
        targets, medias, caption, mod: !!b.mod && price > 0, price: { value: price, currency: 'EUR' }, playlists: [], thirdPartyConsent: !!b.thirdPartyConsent,
        ...(b.teaserId ? { teaserId: String(b.teaserId) } : {}), ...(discount ? { discount } : {}), ...(scheduledAt ? { scheduledAt } : {}), ...(typeof b.email === 'boolean' ? { email: b.email } : {}),
      };
      try {
        const r = await mym(x.c.id, '/v2/pushes', { method: 'POST', base: API, body: payload });
        const id = r?.data?.id ?? r?.id ?? null;
        run('INSERT INTO mym_push_log (creator_id, push_id, payload, ok, answer, by_name, at) VALUES (?, ?, ?, 1, ?, ?, ?)', x.c.id, id ? String(id) : null, JSON.stringify(payload), JSON.stringify(shape(r)).slice(0, 1500), x.u.name, Date.now());
        send(res, 200, { ok: true, id, scheduled: !!scheduledAt });
      } catch (e) {
        run('INSERT INTO mym_push_log (creator_id, push_id, payload, ok, answer, by_name, at) VALUES (?, NULL, ?, 0, ?, ?, ?)', x.c.id, JSON.stringify(payload), String(e.message).slice(0, 1500), x.u.name, Date.now());
        send(res, 502, { error: `MYM a refusé le push : ${e.message}. Rien n’a été renvoyé : vérifie sur MYM avant de réessayer.` });
      }
    },
    /** Annuler un push programmé (MYM refuse pour un push déjà parti). */
    'POST /api/mym/push/delete': async (req, res) => {
      const b = await body(req);
      const x = pickC(req, res, b.creatorId, 'admin');
      if (!x) return;
      try {
        await mym(x.c.id, `/v2/pushes/${encodeURIComponent(String(b.id || ''))}`, { method: 'DELETE', base: API });
        send(res, 200, { ok: true });
      } catch (e) {
        send(res, 502, { error: `MYM a refusé : ${e.message}` });
      }
    },

    // ------------------------------------------------------------ mass DM : messages prêts
    'GET /api/mym/massdm': (req, res) => {
      const x = pickC(req, res, qs(req).get('creatorId'));
      if (!x) return;
      // Une fois par démarrage : toutes les conversations sont relues chez MYM (abonné / ancien / intéressé à jour).
      if (!synced.has(x.c.id)) {
        synced.add(x.c.id);
        refreshMymInbox(x.c.id).catch(() => synced.delete(x.c.id));
      }
      const counts = { active: 0, old: 0, interested: 0 };
      for (const c of inboxPeek(x.c.id)) if (c.mym && c.canSend !== false) counts[tabOf(c)]++;
      send(res, 200, {
        canSend: isBoss(x.u),
        messages: all('SELECT * FROM mdm_messages WHERE creator_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC', x.c.id).map(msgView),
        campaigns: all('SELECT * FROM mdm_campaigns WHERE creator_id = ? ORDER BY created_at DESC LIMIT 60', x.c.id).map(campView),
        counts,
        groups: mymGroups(x.c.id).map((g) => ({ id: g.id, name: g.name, color: g.color, size: g.members.size })),
      });
    },
    'POST /api/mym/massdm/message': async (req, res) => {
      const b = await body(req);
      const x = pickC(req, res, b.creatorId, 'boss');
      if (!x) return;
      const title = String(b.title || '').trim().slice(0, 80);
      const text = String(b.text || '').trim().slice(0, 500);
      const medias = (Array.isArray(b.medias) ? b.medias : []).slice(0, 5).map((m) => ({ id: String(m.id), type: m.type || 'photo', thumb: m.thumb || null, duration: m.duration ?? null }));
      const price = medias.length ? num(b.price) : 0;
      if (!title) return send(res, 400, { error: 'Donne un titre (visible seulement par l’équipe).' });
      if (!text && !medias.length) return send(res, 400, { error: 'Écris un message ou choisis un média.' });
      if (price && (price < 5 || price > 1000)) return send(res, 400, { error: 'Prix : gratuit, ou de 5 à 1 000 €.' });
      const now = Date.now();
      if (b.id) {
        const m = msgOf(b.id);
        if (!m || m.creator_id !== x.c.id || m.deleted_at) return send(res, 404, { error: 'Message introuvable' });
        run('UPDATE mdm_messages SET title = ?, text = ?, price = ?, medias = ?, updated_at = ? WHERE id = ?', title, text, price, JSON.stringify(medias), now, m.id);
        return send(res, 200, { id: m.id });
      }
      const r = run('INSERT INTO mdm_messages (creator_id, title, text, price, medias, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', x.c.id, title, text, price, JSON.stringify(medias), x.u.name, now, now);
      send(res, 200, { id: Number(r.lastInsertRowid) });
    },
    'POST /api/mym/massdm/message/delete': async (req, res) => {
      const b = await body(req);
      const m = msgOf(b.id);
      const x = m && pickC(req, res, m.creator_id, 'boss');
      if (!m) return send(res, 404, { error: 'Message introuvable' });
      if (!x) return;
      run('UPDATE mdm_messages SET deleted_at = ? WHERE id = ?', Date.now(), m.id);
      send(res, 200, { ok: true });
    },

    // ------------------------------------------------------------ mass DM : campagnes
    /** Combien de fans une campagne viserait (rien n'est envoyé). */
    'POST /api/mym/massdm/preview': async (req, res) => {
      const b = await body(req);
      const x = pickC(req, res, b.creatorId);
      if (!x) return;
      const m = msgOf(b.messageId);
      const hasMedia = !!m && J(m.medias, []).length > 0;
      const a = audience(x.c.id, cleanOpts(b), m?.price || 0, hasMedia);
      const prices = a.fans.map((f) => f.price);
      send(res, 200, { total: a.fans.length, by: a.by, priceMin: prices.length ? Math.min(...prices) : 0, priceMax: prices.length ? Math.max(...prices) : 0, minutes: Math.ceil((a.fans.length * 1.3) / 60) });
    },
    'POST /api/mym/massdm/campaign': async (req, res) => {
      const b = await body(req);
      const x = pickC(req, res, b.creatorId, 'boss');
      if (!x) return;
      const m = msgOf(b.messageId);
      if (!m || m.creator_id !== x.c.id || m.deleted_at) return send(res, 404, { error: 'Choisis un message prêt.' });
      const opts = cleanOpts(b);
      if (!opts.audiences.length) return send(res, 400, { error: 'Choisis au moins une audience.' });
      const medias = J(m.medias, []);
      if (opts.smart && !medias.length) delete opts.smart;
      if (opts.removeAfterH && medias.length) return send(res, 400, { error: 'Le retrait automatique ne marche que pour un message sans média (MYM refuse de supprimer un média envoyé).' });
      if (opts.challenge) {
        const rw = msgOf(opts.challenge.rewardId);
        if (!rw || rw.creator_id !== x.c.id || rw.deleted_at) return send(res, 400, { error: 'Message de récompense introuvable.' });
      }
      if (b.confirm !== true) return send(res, 400, { error: 'Confirmation manquante.' });
      if (one("SELECT 1 AS x FROM mdm_campaigns WHERE creator_id = ? AND status IN ('running')", x.c.id)) return send(res, 409, { error: 'Une campagne est déjà en cours d’envoi pour cette modèle. Attends qu’elle finisse ou arrête-la.' });
      const start = b.startAt ? Date.parse(b.startAt) : Date.now();
      if (!start || start < Date.now() - 60_000) return send(res, 400, { error: 'Date de départ invalide.' });
      const now = Date.now();
      const r = run("INSERT INTO mdm_campaigns (creator_id, message_id, title, text, price, medias, opts, status, start_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)",
        x.c.id, m.id, m.title, m.text, m.price, m.medias, JSON.stringify(opts), Math.max(start, now), x.u.name, now);
      send(res, 200, { id: Number(r.lastInsertRowid), scheduled: start > now + 30_000 });
    },
    /** Arrêter une campagne (programmée ou en cours) : les messages déjà partis restent. */
    'POST /api/mym/massdm/campaign/stop': async (req, res) => {
      const b = await body(req);
      const c = one('SELECT * FROM mdm_campaigns WHERE id = ?', Number(b.id));
      if (!c) return send(res, 404, { error: 'Campagne introuvable' });
      const x = pickC(req, res, c.creator_id, 'boss');
      if (!x) return;
      if (!['scheduled', 'running'].includes(c.status)) return send(res, 400, { error: 'Cette campagne est déjà terminée.' });
      run("UPDATE mdm_sends SET status = 'skipped', error = 'Campagne arrêtée' WHERE campaign_id = ? AND status = 'pending'", c.id);
      run("UPDATE mdm_campaigns SET status = 'cancelled', finished_at = ?, note = ? WHERE id = ?", Date.now(), `Arrêtée par ${x.u.name}`, c.id);
      send(res, 200, { ok: true });
    },
    /** Retirer les messages d'une campagne chez les fans (texte seulement). */
    'POST /api/mym/massdm/campaign/remove': async (req, res) => {
      const b = await body(req);
      const c = one('SELECT * FROM mdm_campaigns WHERE id = ?', Number(b.id));
      if (!c) return send(res, 404, { error: 'Campagne introuvable' });
      const x = pickC(req, res, c.creator_id, 'boss');
      if (!x) return;
      if (J(c.medias, []).length) return send(res, 400, { error: 'MYM refuse de supprimer un message qui porte un média : cette campagne ne peut pas être retirée.' });
      if (c.status === 'running' || c.status === 'scheduled') return send(res, 400, { error: 'Arrête d’abord la campagne.' });
      withdraw(c, b.unreadOnly === true).catch((e) => console.warn('[bloom] retrait mass DM :', e.message));
      send(res, 200, { ok: true, count: one("SELECT COUNT(*) AS n FROM mdm_sends WHERE campaign_id = ? AND status = 'sent'", c.id).n });
    },
    'GET /api/mym/massdm/campaign': (req, res) => {
      const c = one('SELECT * FROM mdm_campaigns WHERE id = ?', Number(qs(req).get('id')));
      if (!c) return send(res, 404, { error: 'Campagne introuvable' });
      const x = pickC(req, res, c.creator_id);
      if (!x) return;
      send(res, 200, { campaign: campView(c), sends: all('SELECT fan_id AS fanId, fan_name AS fan, status, price, at, error, reward_at AS rewardAt FROM mdm_sends WHERE campaign_id = ? ORDER BY at DESC LIMIT 300', c.id) });
    },
  };
}
