// Messagerie de Bloom : routes de lecture / envoi au-dessus du pont Substy, et diffusion du temps réel aux navigateurs.
import { all, run } from './store.mjs';

const money = (p) => (p == null ? 0 : typeof p === 'object' ? (p.minor || 0) / 100 : Number(p) || 0);
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
    text: m.text || '',
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
    fanId: f.fanId || c.chatId,
    name: f.displayName || f.name || f.username || 'Fan',
    username: f.username || null,
    avatar: f.avatar || null,
    unread: c.unreadCount || 0,
    ai: !!f.aiEnabled,
    handoff: !!f.needsHandoff,
    spent: money(f.spend?.net),
    subscribed: f.subscription?.status || null,
    canSend: c.canSendMessage !== false,
    last: c.lastMessage ? { text: c.lastMessage.text || '', at: c.lastMessage.sentAt, fromCreator: !!c.lastMessage.isFromCreator, media: c.lastMessage.mediaCount || 0 } : null,
  };
}

function fanView(f) {
  const b = f.spendBreakdown || {};
  return {
    fanId: f.fanId,
    name: f.displayName || f.name || f.username || 'Fan',
    username: f.username || null,
    avatar: f.avatar || null,
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
    payload.fanId = data.data.fanId;
    payload.message = messageView(data.data, bloomSenderOf(data.data));
  } else if (data?.data) payload.data = data.data;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) c.write(line);
}

/** Qui, dans Bloom, a envoyé ce message (même fan, même texte, envoyé dans la minute). */
function bloomSenderOf(m) {
  if (!m?.isSentByCreator) return null;
  const at = Date.parse(m.createdAt || '') || Date.now();
  const r = all('SELECT u.name FROM sent_log s JOIN users u ON u.id = s.user_id WHERE s.creator_id = ? AND s.fan_id = ? AND s.text = ? AND ABS(s.at - ?) < 90000 ORDER BY s.at DESC LIMIT 1', m.creatorId, m.fanId, m.text || '', at);
  return r[0]?.name || null;
}

// ---------------------------------------------------------------- routes
export function chatRoutes({ substy, userFrom, send, body }) {
  const auth = (req, res) => {
    const u = userFrom(req);
    if (!u) send(res, 401, { error: 'Connecte-toi' });
    return u;
  };
  const q = (req) => new URL(req.url, 'http://x').searchParams;

  return {
    'GET /api/creators': async (req, res) => {
      if (!auth(req, res)) return;
      const list = (await substy.creators()) || [];
      send(res, 200, list.map((c) => ({ id: c.id, name: c.name || c.pseudo || 'Créatrice', platform: c.platform, ai: c.setting?.enable ?? null })));
    },

    'GET /api/chats': async (req, res) => {
      if (!auth(req, res)) return;
      const p = q(req);
      const r = await substy.chats(p.get('creatorId'), {
        limit: 30,
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
      const r = await substy.messages(creatorId, fanId, { limit: 30, cursor: p.get('cursor') || undefined });
      const logs = all('SELECT s.text, s.at, u.name FROM sent_log s JOIN users u ON u.id = s.user_id WHERE s.creator_id = ? AND s.fan_id = ? ORDER BY s.at DESC LIMIT 200', creatorId, fanId);
      const who = (m) => {
        if (!m.isSentByCreator) return null;
        const at = Date.parse(m.createdAt);
        return logs.find((l) => l.text === (m.text || '') && Math.abs(l.at - at) < 90000)?.name || null;
      };
      const items = (r?.items || []).map((m) => messageView(m, who(m))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      send(res, 200, { items, olderCursor: r?.nextCursor || null });
    },

    'GET /api/fan': async (req, res) => {
      if (!auth(req, res)) return;
      const p = q(req);
      send(res, 200, fanView((await substy.fan(p.get('creatorId'), p.get('fanId'))) || {}));
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
