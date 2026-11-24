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
// Écriture (formats lus dans le code du site le 23/11/2026, VÉRIFIÉS le même jour sur un vrai fan : texte envoyé puis
// supprimé, média payant à 5 € envoyé). MYM refuse de supprimer un message qui porte un média privé ou un push
// (422 « A message containing a private media or a push cannot be deleted ») : un PPV envoyé ne se retire pas.
//  - envoyer : POST /v1/chats/messages { receiver_id, content, type: "text" } ; avec des médias :
//    { receiver_id, content, type: "private_media", price (en CENTIMES), attachments: [idsMédias], third_party_consent }
//  - supprimer : DELETE /v1/chats/messages/<id>?for=everyone (ou « me » : seulement de notre côté)
//  - lu / non lu : POST /v1/chats/<fan>/ack | nack ; « en train d'écrire » : POST /v1/chats/<fan>/typing.
// MYM ne connaît pas la « réponse à un message ».
import { STYX, isLinked, mym } from './mym.mjs';
import { all, one } from './store.mjs';

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
    interested: !!u.is_interested,
    last: lm?.id ? { id: String(lm.id), text: String(lm.content || ''), at: lm.date, fromCreator: lm.sender_id === creator, media: lm.type === 'private_media' ? 1 : 0, readAt: lm.read_at || null } : null,
  };
}

/** Une page de conversations (30), de la plus récente à la plus ancienne. */
export async function mymChatPage(cid, cursor, search) {
  const qs = new URLSearchParams({ limit: '30', last_message_opts: 'full' });
  if (cursor) qs.set('cursor', cursor);
  if (search) qs.set('search', search);
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

// ---------------------------------------------------------------- qui a écrit un message
// MYM ne dit pas qui a écrit (chatteur, IA, automatisation). Bloom le sait par son journal d'envois (`sent_log`).
// Pour l'IA, Substy ne dit RIEN côté MYM (constaté le 23/11/2026) : son flux n'annonce pas les messages sortants, et sa
// liste de messages les marque tous « créatrice », sans « écrit par l'IA » ni historique de l'IA. Bloom le DÉDUIT donc :
// un message de la créatrice qui n'est ni parti de Bloom ni un push, pour un fan dont l'IA de Substy est active, est
// compté comme écrit par l'IA (`aiOn`). C'est une estimation (un message tapé par la modèle sur MYM serait compté IA).
// Les messages notés par Substy dans `msg_log` ont SES identifiants (différents de ceux de MYM) : on retrouve le
// « jumeau » d'un message par le fan, le texte et l'heure (à 2 min près).
const same = (a, b) => String(a || '').trim() === String(b || '').trim();
/** Le même message noté par l'autre source (`src` : 'mym' = noté depuis MYM, '' = noté depuis Substy). */
export function twinOf(cid, fanId, fromFan, text, at, src) {
  const rows = all("SELECT id, kind, by_name, text, at FROM msg_log WHERE creator_id = ? AND fan_id = ? AND from_fan = ? AND at BETWEEN ? AND ? AND COALESCE(src, '') = ?", String(cid), String(fanId), fromFan ? 1 : 0, at - 120_000, at + 120_000, src);
  const t = String(text || '').trim();
  return rows.filter((r) => (t ? same(r.text, t) : !String(r.text || '').trim() && Math.abs(r.at - at) < 20_000)).sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0] || null;
}
/** L'auteur d'un message de la créatrice lu chez MYM : { kind, name } (null pour un message du fan). */
export function mymAuthor(cid, fanId, v, aiOn = false) {
  if (v.fromFan) return null;
  const at = Date.parse(v.at) || 0;
  const mine = all('SELECT s.text, s.message_id, u.name FROM sent_log s JOIN users u ON u.id = s.user_id WHERE s.creator_id = ? AND s.fan_id = ? AND (s.message_id = ? OR s.at BETWEEN ? AND ?)', String(cid), String(fanId), String(v.id), at - 90_000, at + 90_000)
    .find((l) => l.message_id === String(v.id) || (!l.message_id && same(l.text, v.text)));
  if (mine) return { kind: 'bloom', name: mine.name };
  // Message parti d'une campagne de Mass DM (mymbulk.mjs).
  try {
    if (one('SELECT 1 AS x FROM mdm_sends WHERE message_id = ?', String(v.id))) return { kind: 'auto', name: 'Mass DM' };
  } catch {}
  const own = one('SELECT kind, by_name FROM msg_log WHERE id = ?', String(v.id));
  const k = own?.kind && own.kind !== 'creator' ? own : twinOf(cid, fanId, false, v.text, at, '') || own;
  return k?.kind === 'ai' ? { kind: 'ai', name: 'IA' }
    : k?.kind === 'auto' ? { kind: 'auto', name: 'Automatisation' }
    : k?.kind === 'script' ? { kind: 'script', name: 'Script' }
    : k?.kind === 'employee' ? { kind: 'employee', name: k.by_name || 'Employé' }
    : k?.kind === 'bloom' ? { kind: 'bloom', name: k.by_name || 'Bloom' }
    : v.kind === 'push' ? { kind: 'auto', name: 'Push' }
    : aiOn ? { kind: 'ai', name: 'IA' }
    : { kind: 'creator', name: 'Créatrice' };
}
