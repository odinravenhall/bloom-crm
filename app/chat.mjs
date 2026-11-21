// Messagerie de Bloom : routes de lecture / envoi au-dessus du pont Substy, et diffusion du temps réel aux navigateurs.
import { all, one, run } from './store.mjs';

const money = (p) => (p == null ? 0 : typeof p === 'object' ? (p.minor || 0) / 100 : Number(p) || 0);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** Les textes de Substy arrivent parfois en HTML (« <p>Oui</p> ») : on garde le texte, avec les retours à la ligne. */
export const plain = (s) =>
  String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>\s*/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (all, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? all))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Historique IA d'un fan (coupée / rallumée, par qui) → lignes à glisser dans la conversation. */
function aiLogView(l) {
  const a = String(l.action || '').toLowerCase();
  const on = /disabl|pause|stop|deactiv|handoff|(^|[^a-z])off/.test(a) ? false : /enabl|resum|activ|start|(^|[^a-z])on($|[^a-z])/.test(a) ? true : null;
  return { id: l.id, at: l.createdAt, on, action: l.action || '', reason: l.reason || '', by: l.employee?.name || null };
}
/** Images de Substy : les chemins « /api/creators/… » passent par le relais de Bloom. */
const img = (u) => (!u ? null : String(u).startsWith('/api/creators/') ? `/media?p=${encodeURIComponent(u)}` : u);
const mediaView = (m) => ({
  id: m.id,
  type: (m.type || '').toLowerCase(),
  thumb: m.files?.thumb ? `/media?p=${encodeURIComponent(m.files.thumb)}` : null,
  full: m.files?.full ? `/media?p=${encodeURIComponent(m.files.full)}` : null,
  duration: m.duration ?? null,
});

/** Un message Substy → ce qu'affiche Bloom (qui l'a envoyé, médias, PPV payé ou non). */
export function messageView(m, bloomBy = null) {
  const fromFan = !m.isSentByCreator;
  let by = null;
  if (!fromFan) {
    if (bloomBy) by = { kind: 'bloom', name: bloomBy };
    else if (m.sentByAi) by = { kind: 'ai', name: 'IA' };
    else if (m.isAutomationMessage) by = { kind: 'auto', name: m.automation?.name || 'Automatisation' };
    else if (m.isScriptMessage) by = { kind: 'script', name: m.script?.name || 'Script' };
    else if (m.sentByEmployee) by = { kind: 'employee', name: m.sentByEmployee.name || m.sentByEmployee.username || 'Employé' };
    else by = { kind: 'creator', name: 'Créatrice' };
  }
  const price = money(m.price);
  return {
    id: m.id,
    text: plain(m.text),
    at: m.createdAt,
    fromFan,
    by,
    medias: (m.medias || []).map(mediaView),
    price,
    paid: !!m.isPurchasedByRecipient,
    tip: !!m.isTip,
    read: !!m.isRead,
    reverted: !!m.reverted,
  };
}

function chatView(c) {
  const f = c.fan || {};
  return {
    fanId: String(f.fanId || c.chatId),
    name: f.displayName || f.name || f.username || 'Fan',
    username: f.username || null,
    avatar: img(f.avatar),
    unread: c.unreadCount || 0,
    ai: !!f.aiEnabled,
    handoff: !!f.needsHandoff,
    spent: money(f.spend?.net),
    subscribed: f.subscription?.status || null,
    canSend: c.canSendMessage !== false,
    last: c.lastMessage ? { text: plain(c.lastMessage.text), at: c.lastMessage.sentAt, fromCreator: !!c.lastMessage.isFromCreator, media: c.lastMessage.mediaCount || 0 } : null,
  };
}

function fanView(f) {
  const b = f.spendBreakdown || {};
  return {
    fanId: f.fanId,
    name: f.displayName || f.name || f.username || 'Fan',
    username: f.username || null,
    avatar: img(f.avatar),
    ai: !!f.aiEnabled,
    platform: f.platform || null,
    subscription: f.subscription ? { status: f.subscription.status, since: f.subscription.subscribedAt, renews: f.subscription.renewsAt, canceled: !!f.subscription.isCanceledAtPeriodEnd, price: money(f.subscription.price) } : null,
    spend: { net: money(f.spend?.net), gross: money(f.spend?.gross), purchases: f.spend?.purchases ?? 0, last: f.spend?.lastPurchaseAt || null },
    breakdown: { tips: money(b.tips), subscriptions: money(b.subscriptions), messages: money(b.messages), posts: money(b.posts) },
    lists: (f.lists || []).filter((l) => l.isMember).map((l) => l.name),
    moderation: f.moderation || null,
    lastPpv: f.lastPpvPurchaseAt || null,
  };
}

// ---------------------------------------------------------------- temps réel vers les navigateurs (SSE)
const clients = new Set();
export function broadcast(creatorId, type, data) {
  if (type === 'ping' || type === 'connected' || data?.type === 'connection_ready') return;
  const kind = data?.type || type;
  const payload = { creatorId, type: kind };
  if (kind === 'new_message' && data?.data) {
    payload.fanId = data.data.fanId != null ? String(data.data.fanId) : null;
    payload.message = messageView(data.data, bloomSenderOf(data.data));
    logMessage(creatorId, data.data.fanId, payload.message);
    onLiveMessage(creatorId, data.data.fanId, payload.message);
  } else if (data?.data) payload.data = data.data;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) c.write(line);
}

// ---------------------------------------------------------------- toutes les conversations, gardées en mémoire
// Substy ne renvoie qu'une vingtaine de conversations par page : Bloom les parcourt toutes en tâche de fond,
// les garde ici à jour (temps réel + haut de liste toutes les 30 s + tour complet toutes les 15 min),
// et la messagerie les reçoit d'un coup (puis seulement ce qui a changé).
let SUB = null;
const INBOX = new Map(); // creatorId -> { map: Map(fanId -> chat + _t), complete, crawling, crawledAt, usedAt }
let seq = Date.now();
const stamp = () => (seq = Math.max(seq + 1, Date.now()));
function inboxOf(cid) {
  let b = INBOX.get(cid);
  if (!b) INBOX.set(cid, (b = { map: new Map(), complete: false, crawling: false, crawledAt: 0, usedAt: 0 }));
  return b;
}
const strip = ({ _t, ...c }) => c;
function put(b, chat) {
  const old = b.map.get(chat.fanId);
  if (old && JSON.stringify(strip(old)) === JSON.stringify(chat)) return;
  b.map.set(chat.fanId, { ...chat, _t: stamp() });
}

async function crawl(cid) {
  const b = inboxOf(cid);
  if (b.crawling || !SUB) return;
  b.crawling = true;
  const t0 = Date.now();
  try {
    let cursor;
    let pages = 0;
    do {
      const r = await SUB.chats(cid, { limit: 100, cursor });
      for (const it of r?.items || []) put(b, chatView(it));
      cursor = r?.nextCursor || undefined;
    } while (cursor && ++pages < 1000);
    b.complete = true;
    b.crawledAt = Date.now();
    console.log(`[bloom] conversations de ${cid} : ${b.map.size} en ${Math.round((Date.now() - t0) / 1000)} s`);
  } catch (e) {
    console.warn('[bloom] liste des conversations :', e.message);
  } finally {
    b.crawling = false;
  }
}
async function refreshTop(cid) {
  if (!SUB) return;
  const b = inboxOf(cid);
  try {
    const r = await SUB.chats(cid, { limit: 100 });
    for (const it of r?.items || []) put(b, chatView(it));
  } catch {}
}
/** Au démarrage : on commence tout de suite à récupérer les conversations de chaque créatrice. */
export function warmInbox(ids) {
  for (const id of ids) if (!inboxOf(id).complete) crawl(id);
}
setInterval(() => {
  for (const [cid, b] of INBOX) {
    if (b.crawling) continue;
    if (Date.now() - b.crawledAt > 15 * 60_000) crawl(cid);
    else if (Date.now() - b.usedAt < 30 * 60_000) refreshTop(cid);
  }
}, 30_000);

/** Nouveau message en direct : la conversation est mise à jour dans la liste. */
const topLater = new Map();
function onLiveMessage(cid, fanId, m) {
  const b = INBOX.get(cid);
  if (!b || !fanId) return;
  const c = b.map.get(String(fanId));
  if (!c) {
    // Conversation inconnue (nouveau fan…) : on relit le haut de la liste, au plus une fois toutes les 3 s.
    if (!topLater.has(cid)) topLater.set(cid, setTimeout(() => (topLater.delete(cid), refreshTop(cid)), 3000));
    return;
  }
  put(b, {
    ...strip(c),
    last: { text: m.text, at: m.at, fromCreator: !m.fromFan, media: m.medias.length },
    unread: m.fromFan ? (c.unread || 0) + 1 : c.unread,
    handoff: m.fromFan ? c.handoff : false,
  });
}

/** Journal des messages vus en temps réel (un message n'est compté qu'une fois). */
let pruned = 0;
function logMessage(creatorId, fanId, m) {
  try {
    run('INSERT OR IGNORE INTO msg_log (id, creator_id, fan_id, at, from_fan, kind, price, tip, medias) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      String(m.id), creatorId, fanId ? String(fanId) : null, Date.parse(m.at) || Date.now(), m.fromFan ? 1 : 0, m.fromFan ? 'fan' : m.by?.kind || null, m.price || 0, m.tip ? 1 : 0, m.medias.length);
    if (Date.now() - pruned > 3600_000) {
      pruned = Date.now();
      run('DELETE FROM msg_log WHERE at < ?', Date.now() - 120 * 864e5);
    }
  } catch (e) {
    console.warn('[bloom] journal des messages :', e.message);
  }
}

/** Compteurs d'une période, par créatrice. */
function periodStats(since) {
  const rows = all(`SELECT creator_id AS c,
      SUM(from_fan = 1 AND tip = 0) AS fanIn,
      SUM(from_fan = 0 AND kind = 'ai') AS ai,
      SUM(from_fan = 0 AND kind IN ('bloom', 'employee', 'creator')) AS team,
      SUM(from_fan = 0 AND kind IN ('auto', 'script')) AS auto,
      SUM(from_fan = 0 AND price > 0) AS ppv,
      SUM(CASE WHEN from_fan = 0 AND price > 0 THEN price ELSE 0 END) AS ppvValue,
      SUM(tip = 1) AS tips,
      COUNT(DISTINCT CASE WHEN from_fan = 1 THEN fan_id END) AS fans
    FROM msg_log WHERE at >= ? GROUP BY creator_id`, since);
  return Object.fromEntries(rows.map((r) => [r.c, r]));
}

/** Qui, dans Bloom, a envoyé ce message (même fan, même texte, envoyé dans la minute). */
function bloomSenderOf(m) {
  if (!m?.isSentByCreator) return null;
  const at = Date.parse(m.createdAt || '') || Date.now();
  const r = all('SELECT u.name FROM sent_log s JOIN users u ON u.id = s.user_id WHERE s.creator_id = ? AND s.fan_id = ? AND s.text = ? AND ABS(s.at - ?) < 90000 ORDER BY s.at DESC LIMIT 1', m.creatorId, m.fanId, plain(m.text), at);
  return r[0]?.name || null;
}

// ---------------------------------------------------------------- routes
export function chatRoutes({ substy, userFrom, send, body, streams }) {
  SUB = substy;
  const auth = (req, res) => {
    const u = userFrom(req);
    if (!u) send(res, 401, { error: 'Connecte-toi' });
    return u;
  };
  // Chiffres de l'agence (revenus, ventes) : admins et managers seulement.
  const boss = (req, res) => {
    const u = auth(req, res);
    if (u && u.role !== 'admin' && u.role !== 'lead') {
      send(res, 403, { error: 'Réservé aux admins et managers' });
      return null;
    }
    return u;
  };
  const q = (req) => new URL(req.url, 'http://x').searchParams;

  const creatorOf = (c) => ({
    id: c.id || c.creatorId,
    name: c.name || c.pseudo || c.displayName || c.username || 'Créatrice',
    username: c.username || c.platformUsername || null,
    platform: c.platform || null,
    avatar: img(c.avatar || c.avatarUrl || c.profilePicture || null),
    ai: c.setting?.enable ?? null,
  });

  // Nombre de conversations qui correspondent à un filtre (Substy ne donne pas de total : on compte une grande page).
  async function countChats(creatorId, opts) {
    for (const limit of [100, 50]) {
      try {
        const r = await substy.chats(creatorId, { limit, ...opts });
        const n = (r?.items || []).length;
        return { n, more: n > 0 && !!r?.nextCursor };
      } catch (e) {
        if (limit === 50) return { n: null, more: false, error: e.message };
      }
    }
  }
  let dashCache = null;
  // Revenus Substy : montants en dollars, « …Delta » = évolution en % par rapport à la période précédente.
  const revenueView = (r) => {
    if (!r) return null;
    const part = (k) => ({ v: Number(r[k]) || 0, d: r[k + 'Delta'] ?? null });
    return {
      total: part('total'), messages: part('messages'), tips: part('tips'), subscriptions: part('subscriptions'), posts: part('posts'),
      newSubs: { v: Number(r.totalNewSubs) || 0, d: r.totalNewSubsDelta ?? null },
      chart: (r.totalCharts || []).map((x) => ({ date: x.date, v: Number(x.count) || 0 })),
      currency: r.currency || 'USD',
    };
  };
  const salesView = () =>
    substy.recentSales()
      .then((list) => (list || []).slice(0, 40).map((x) => ({ id: String(x.id), type: x.type, at: x.createdAt, price: x.price, fan: x.userName || null, fanId: x.userId ? String(x.userId) : null, creatorId: x.creatorId, creator: x.creatorName })))
      .catch(() => []);

  return {
    // Ventes en direct (rafraîchies souvent, sans recalculer tout le dashboard).
    'GET /api/sales': async (req, res) => {
      if (!boss(req, res)) return;
      send(res, 200, await salesView());
    },

    'GET /api/creators': async (req, res) => {
      if (!auth(req, res)) return;
      const list = (await substy.creators()) || [];
      send(res, 200, list.map(creatorOf));
    },

    // Dashboard : l'état en direct de chaque créatrice + ce que Bloom a vu passer aujourd'hui et sur 7 jours.
    'GET /api/dashboard': async (req, res) => {
      if (!boss(req, res)) return;
      const period = ['today', '7d', '30d'].includes(q(req).get('period')) ? q(req).get('period') : 'today';
      if (dashCache?.[period] && Date.now() - dashCache[period].at < 20_000) return send(res, 200, dashCache[period].data);
      const creators = ((await substy.creators()) || []).map(creatorOf);
      // Dates à l'heure de Paris, comme le dashboard de Substy (7 jours = du J-7 à aujourd'hui).
      const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);
      const end = ymd(new Date());
      const start = ymd(new Date(Date.now() - (period === '7d' ? 7 : period === '30d' ? 30 : 0) * 864e5));
      const rev = (ids) => substy.revenue(ids, start, end).then(revenueView).catch((e) => ({ error: e.message }));
      const day0 = new Date();
      day0.setHours(0, 0, 0, 0);
      const today = periodStats(day0.getTime());
      const week = periodStats(Date.now() - 7 * 864e5);
      const st = streams();
      const items = await Promise.all(
        creators.map(async (c) => {
          const [unread, handoff, aiOff, recent, revenue] = await Promise.all([
            countChats(c.id, { unreadOnly: true }),
            countChats(c.id, { handoffOnly: true }),
            countChats(c.id, { aiStatus: 'disabled' }),
            substy.chats(c.id, { limit: 6 }).then((r) => (r?.items || []).slice(0, 6).map(chatView)).catch(() => []),
            rev([c.id]),
          ]);
          return { ...c, live: !!st[c.id]?.live, unread, handoff, aiOff, recent, revenue, today: today[c.id] || null, week: week[c.id] || null };
        }),
      );
      const [revenue, sales] = await Promise.all([rev([]), salesView()]);
      const since = one('SELECT MIN(at) AS t FROM msg_log')?.t || null;
      const data = { period, start, end, revenue, sales, creators: items, since, at: Date.now() };
      dashCache = { ...dashCache, [period]: { at: Date.now(), data } };
      send(res, 200, data);
    },

    // Toutes les conversations d'une créatrice (depuis la mémoire de Bloom). since = seulement ce qui a changé depuis.
    'GET /api/inbox': async (req, res) => {
      if (!auth(req, res)) return;
      const p = q(req);
      const cid = String(p.get('creatorId') || '');
      if (!cid) return send(res, 400, { error: 'Créatrice manquante' });
      const b = inboxOf(cid);
      b.usedAt = Date.now();
      if (!b.crawling && (!b.crawledAt || Date.now() - b.crawledAt > 15 * 60_000)) crawl(cid);
      const since = Number(p.get('since')) || 0;
      const at = seq;
      const items = [];
      for (const c of b.map.values()) if (c._t > since) items.push(strip(c));
      send(res, 200, { items, at, complete: b.complete, total: b.map.size });
    },

    'GET /api/chats': async (req, res) => {
      if (!auth(req, res)) return;
      const p = q(req);
      // Jusqu'à 100 conversations par page (la messagerie charge toutes les pages d'un coup).
      const limit = Math.min(100, Math.max(10, Number(p.get('limit')) || 30));
      const r = await substy.chats(p.get('creatorId'), {
        limit,
        cursor: p.get('cursor') || undefined,
        query: p.get('q') || '',
        unreadOnly: p.get('unread') === '1',
        aiStatus: ['enabled', 'disabled'].includes(p.get('ai')) ? p.get('ai') : 'all',
        handoffOnly: p.get('handoff') === '1',
      });
      send(res, 200, { items: (r?.items || []).map(chatView), nextCursor: r?.nextCursor || null });
    },

    'GET /api/messages': async (req, res) => {
      if (!auth(req, res)) return;
      const p = q(req);
      const creatorId = p.get('creatorId');
      const fanId = p.get('fanId');
      const cursor = p.get('cursor') || undefined;
      const [r, ai] = await Promise.all([
        substy.messages(creatorId, fanId, { limit: 30, cursor }),
        cursor ? null : substy.aiLogs(creatorId, fanId).catch((e) => (console.warn('[bloom] historique IA :', e.message), null)),
      ]);
      const logs = all('SELECT s.text, s.at, u.name FROM sent_log s JOIN users u ON u.id = s.user_id WHERE s.creator_id = ? AND s.fan_id = ? ORDER BY s.at DESC LIMIT 200', creatorId, fanId);
      const who = (m) => {
        if (!m.isSentByCreator) return null;
        const at = Date.parse(m.createdAt);
        return logs.find((l) => l.text.trim() === plain(m.text) && Math.abs(l.at - at) < 90000)?.name || null;
      };
      const items = (r?.items || []).map((m) => messageView(m, who(m))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      send(res, 200, { items, olderCursor: r?.nextCursor || null, ...(ai ? { aiLog: (ai.items || []).map(aiLogView) } : {}) });
    },

    'GET /api/fan': async (req, res) => {
      if (!auth(req, res)) return;
      const p = q(req);
      send(res, 200, fanView((await substy.fan(p.get('creatorId'), p.get('fanId'))) || {}));
    },

    'GET /api/ailog': async (req, res) => {
      if (!auth(req, res)) return;
      const p = q(req);
      const r = await substy.aiLogs(p.get('creatorId'), p.get('fanId'));
      send(res, 200, (r?.items || []).map(aiLogView));
    },

    'POST /api/ai': async (req, res) => {
      if (!auth(req, res)) return;
      const b = await body(req);
      await substy.setAi(String(b.creatorId), String(b.fanId), !!b.on);
      send(res, 200, { ok: true, ai: !!b.on });
    },

    'POST /api/send': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const b = await body(req);
      const message = String(b.message || '').slice(0, 5000);
      const medias = Array.isArray(b.medias) ? b.medias.map(String).slice(0, 50) : [];
      const price = Number(b.price) > 0 ? Math.round(Number(b.price) * 100) / 100 : 0;
      if (!message.trim() && !medias.length) return send(res, 400, { error: 'Message vide' });
      if (price && !medias.length) return send(res, 400, { error: 'Un PPV a besoin d’au moins un média' });
      if (message.trim()) {
        // Mots interdits de l'agence (même contrôle que le site de Substy avant chaque envoi).
        const v = await substy.validate(message).catch(() => null);
        if (v && (v.valid === false || v.isValid === false || (Array.isArray(v.bannedWords) && v.bannedWords.length) || (Array.isArray(v.matches) && v.matches.length)))
          return send(res, 400, { error: 'Mot interdit dans le message', details: v });
      }
      run('INSERT INTO sent_log (user_id, creator_id, fan_id, text, price, at) VALUES (?, ?, ?, ?, ?, ?)', u.id, String(b.creatorId), String(b.fanId), message, price, Date.now());
      const r = await substy.send(String(b.creatorId), String(b.fanId), { message, medias, price: price || undefined, replyId: b.replyId || null });
      send(res, 200, { ok: true, result: r ?? null });
    },

    'GET /api/vault/lists': async (req, res) => {
      if (!auth(req, res)) return;
      const r = await substy.vaultLists(q(req).get('creatorId'));
      send(res, 200, (r?.lists || []).map((l) => ({ id: l.id, name: l.name, photos: l.photosCount || 0, videos: l.videosCount || 0, audios: l.audiosCount || 0 })));
    },
    'GET /api/vault/medias': async (req, res) => {
      if (!auth(req, res)) return;
      const p = q(req);
      const r = await substy.vaultMedias(p.get('creatorId'), { listId: p.get('listId') || undefined, cursor: p.get('cursor') || undefined });
      send(res, 200, { items: (r?.medias || []).map((m) => ({ ...mediaView(m), price: money(m.price) })), nextCursor: r?.hasMore ? r.nextCursor : null });
    },

    // Images / vidéos (relayées par Bloom : le navigateur ne parle jamais à Substy directement).
    'GET /media': async (req, res) => {
      if (!userFrom(req)) {
        res.writeHead(401);
        return res.end();
      }
      const r = await substy.media(q(req).get('p') || '');
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'private, max-age=3600' });
      if (!r.body) return res.end();
      for await (const chunk of r.body) res.write(chunk);
      res.end();
    },

    // Flux temps réel vers le navigateur.
    'GET /api/live': async (req, res) => {
      if (!auth(req, res)) return;
      // content-encoding « identity » : le Caddy du serveur ne compresse pas (et donc ne retient pas) ce flux.
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no', 'content-encoding': 'identity' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      const t = setInterval(() => res.write(': ok\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(t);
        clients.delete(res);
      });
    },
  };
}
