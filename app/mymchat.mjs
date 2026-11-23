// Messagerie MYM en direct (compte relié), sans passer par Substy pour LIRE. Relevé le 23/11/2026 sur la nouvelle
// messagerie de creators.mym.fans (styx) :
//  - conversations : GET /v1/chats?limit=30&last_message_opts=full[&cursor][&search][&status] →
//    { data: [{ id: "<créatrice>#<fan>", is_read, is_enabled, chat_id, user: { username, is_subscriber, is_interested,
//      is_online, last_seen_at, avatar_url, blocked_at, is_deleted }, last_message: { id, sender_id, receiver_id, date,
//      type, content, status, read_at } }], cursor, count }
//  - messages d'un fan : GET /v1/chats/<fan>/messages?limit=30[&cursor] → { data: [...du plus récent au plus ancien], cursor }
//    types vus : text, private_media (média payant), push.
//  - médias et paiement d'un message : GET /v1/chats/messages?ids=a,b → { data: [{ …, attachment: { status, purchased,
//      price: { amount (centimes), currency }, media: [{ id, type, thumbnail_url, url }] } }] }
//  - compteurs : GET /v1/chats/status_counts → { unread, muted, blocked, pending_requests, to_deliver }
// L'identifiant d'un fan est le même chez MYM et chez Substy : l'état de l'IA (Substy) se recolle sans table de passage.
// Écriture (formats lus dans le code du site le 23/11/2026) :
//  - envoyer : POST /v1/chats/messages { receiver_id, content, type: "text" } ; avec des médias :
//    { receiver_id, content, type: "private_media", price (en CENTIMES), attachments: [idsMédias], third_party_consent }
//  - supprimer : DELETE /v1/chats/messages/<id>?for=everyone (ou « me » : seulement de notre côté)
//  - lu / non lu : POST /v1/chats/<fan>/ack | nack ; « en train d'écrire » : POST /v1/chats/<fan>/typing.
// MYM ne connaît pas la « réponse à un message ».
import { STYX, isLinked, mym } from './mym.mjs';

/** Cette créatrice MYM a un compte relié : on lit sa messagerie chez MYM. */
export const mymDirect = (cid) => isLinked(String(cid));

const hls = (u) => (/\.m3u8(\?|$)/i.test(u || '') ? `/api/mym/hls?u=${Buffer.from(u).toString('base64url')}` : u || null);

function chatOf(c) {
  const [creator, fan] = String(c?.id || '').split('#');
  if (!fan) return null;
  const u = c.user || {};
  const lm = c.last_message;
  return {
    fanId: fan,
    username: u.username || null,
    unread: c.is_read === false ? 1 : 0,
    canSend: c.is_enabled !== false && !u.is_deleted && !u.blocked_at,
    online: !!u.is_online,
    seenAt: u.last_seen_at || null,
    sub: !!u.is_subscriber,
    last: lm?.id ? { id: String(lm.id), text: String(lm.content || ''), at: lm.date, fromCreator: lm.sender_id === creator, media: lm.type === 'private_media' ? 1 : 0, readAt: lm.read_at || null } : null,
  };
}

/** Une page de conversations (30), de la plus récente à la plus ancienne. */
export async function mymChatPage(cid, cursor) {
  const qs = new URLSearchParams({ limit: '30', last_message_opts: 'full' });
  if (cursor) qs.set('cursor', cursor);
  const d = await mym(cid, `/v1/chats?${qs}`, { base: STYX });
  return { items: (d?.data || []).map(chatOf).filter(Boolean), nextCursor: d?.cursor || null };
}

/** Les messages d'un fan, au format des « vues » de Bloom (comme `messageView`), sans l'auteur (`by` : ajouté par l'appelant). */
export async function mymChatMessages(cid, fanId, { cursor, limit = 30 } = {}) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set('cursor', cursor);
  const d = await mym(cid, `/v1/chats/${encodeURIComponent(fanId)}/messages?${qs}`, { base: STYX });
  const rows = d?.data || [];
  // Médias et état du paiement : seulement pour les messages qui en portent.
  const rich = rows.filter((m) => m.type !== 'text').map((m) => m.id);
  const detail = new Map();
  for (let i = 0; i < rich.length; i += 20) {
    const r = await mym(cid, `/v1/chats/messages?ids=${rich.slice(i, i + 20).join(',')}`, { base: STYX }).catch(() => null);
    for (const x of r?.data || []) detail.set(x.id, x);
  }
  const views = rows.map((m) => {
    const a = detail.get(m.id)?.attachment || null;
    const amount = Number(a?.price?.amount) || 0;
    return {
      id: String(m.id),
      text: String(m.content || ''),
      at: m.date,
      fromFan: m.sender_id === String(fanId),
      by: null,
      kind: m.type,
      medias: (a?.media || []).map((x) => ({ id: String(x.id), type: /video/i.test(x.type || '') ? 'video' : /audio/i.test(x.type || '') ? 'audio' : 'photo', thumb: x.thumbnail_url || x.blurry_url || null, full: hls(x.url) || x.thumbnail_url || null, duration: Number(x.duration) || null })),
      price: amount / 100,
      paid: !!a?.purchased,
      tip: false,
      read: !!m.read_at,
      readAt: m.read_at || null,
      reverted: !!m.status && m.status !== 'active',
    };
  });
  return { views, nextCursor: d?.cursor || null };
}

/** Envoyer un message (texte seul, ou médias du mym.cloud avec un prix en centimes). Renvoie l'identifiant du message. */
export async function mymSend(cid, fanId, { message = '', medias = [], priceCents = 0 } = {}) {
  const body = medias.length
    ? { receiver_id: String(fanId), content: message, type: 'private_media', price: Math.round(priceCents) || 0, attachments: medias.map(String), third_party_consent: false }
    : { receiver_id: String(fanId), content: message, type: 'text' };
  const r = await mym(cid, '/v1/chats/messages', { method: 'POST', base: STYX, body });
  const m = r?.data ?? r ?? {};
  return m.id ? String(m.id) : null;
}
/** Supprimer un de nos messages, aussi chez le fan. */
export const mymDelete = (cid, messageId) => mym(cid, `/v1/chats/messages/${encodeURIComponent(messageId)}?for=everyone`, { method: 'DELETE', base: STYX });
/** Marquer la conversation lue (`true`) ou non lue chez MYM. */
export const mymRead = (cid, fanId, read) => mym(cid, `/v1/chats/${encodeURIComponent(fanId)}/${read ? 'ack' : 'nack'}`, { method: 'POST', base: STYX, body: {} });
/** Montrer au fan que la créatrice est en train d'écrire. */
export const mymTyping = (cid, fanId) => mym(cid, `/v1/chats/${encodeURIComponent(fanId)}/typing`, { method: 'POST', base: STYX });
