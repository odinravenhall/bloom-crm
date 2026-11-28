// Messagerie OnlyFans en direct (compte relié dans Créatrices, `of.mjs`), sans passer par Substy pour LIRE.
// Relevé le 28/11/2026 sur le compte de Pauline (lecture seule) :
//  - conversations : GET /api2/v2/chats?limit&offset&order=recent → { list: [{ withUser: { id, name, username, avatar,
//    lastSeen, subscribedOn… }, lastMessage: { id, text (HTML), createdAt, fromUser: { id }, mediaCount, price, isTip },
//    unreadMessagesCount, canSendMessage }], hasMore, nextOffset }
//  - messages d'un fan : GET /api2/v2/chats/<fan>/messages?limit&order=desc[&id=<plus ancien connu>] → { list, hasMore }
//    (du plus récent au plus ancien). PPV acheté = price > 0 et canPurchaseReason « opened ».
//  - ⚠️ la requête (limit, offset…) doit être DANS le chemin passé à `of()` : la signature porte sur le chemin complet
//    (avec l'option `query`, OnlyFans répond « Please refresh the page »).
// Les identifiants des FANS et des MESSAGES sont les mêmes chez OnlyFans et chez Substy (vérifié le 28/11/2026) : l'état
// de l'IA et l'auteur noté par Substy (`msg_log`) se recollent sans table de passage.
// Médias : ceux du vault (envoyés par la modèle) passent par le relais de Substy, par identifiant (il ne périme pas) ;
// les autres (photos envoyées par les fans) par `/api/of/cdn`, relu chez OnlyFans par le proxy de la modèle (les adresses
// du CDN d'OnlyFans ne s'ouvrent que depuis l'adresse qui les a demandées).
import { isLinked, of, proxyOf } from './of.mjs';
import { all, one } from './store.mjs';
import { canSee } from './team.mjs';

/** Cette modèle OnlyFans a un compte relié : on lit sa messagerie chez OnlyFans. */
export const ofDirect = (cid) => isLinked(String(cid));

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const text = (s) =>
  String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>\s*/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (a, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? a))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
const iso = (t) => (t ? new Date(t).toISOString() : null);
const cdn = (cid, u) => (u ? `/api/of/cdn?c=${encodeURIComponent(cid)}&u=${Buffer.from(String(u)).toString('base64url')}` : null);
const vault = (cid, id, size) => `/media?p=${encodeURIComponent(`/api/creators/${cid}/medias/${id}/${size}`)}`;

function chatOf(c) {
  const u = c?.withUser || {};
  if (!u.id) return null;
  const fanId = String(u.id);
  const lm = c.lastMessage;
  return {
    fanId,
    username: u.username || null,
    ofName: u.name || null,
    ofAvatar: u.avatar || null,
    unread: Number(c.unreadMessagesCount) || 0,
    canSend: c.canSendMessage !== false,
    seenAt: iso(u.lastSeen),
    sub: !!u.subscribedOn,
    last: lm?.id ? { id: String(lm.id), text: text(lm.text), at: iso(lm.createdAt), fromCreator: String(lm.fromUser?.id || '') !== fanId, media: Number(lm.mediaCount) || 0 } : null,
  };
}

/** Une page de conversations (les plus récentes d'abord). `offset` = position de départ. */
export async function ofChatPage(cid, offset = 0, limit = 20) {
  const d = await of(cid, `/api2/v2/chats?limit=${limit}&offset=${offset}&order=recent`);
  const items = (d?.list || []).map(chatOf).filter(Boolean);
  return { items, next: d?.hasMore ? Number(d.nextOffset) || offset + items.length : null };
}

function mediaOf(cid, x, fromCreator) {
  const type = /video|gif/i.test(x.type || '') ? 'video' : /audio/i.test(x.type || '') ? 'audio' : 'photo';
  // Média de la modèle = média de son vault : relais de Substy par identifiant. Sinon : relais par le proxy.
  if (fromCreator) return { id: String(x.id), type, thumb: type === 'audio' ? null : vault(cid, x.id, 'thumb'), full: vault(cid, x.id, 'full'), duration: Number(x.duration) || null };
  return { id: String(x.id), type, thumb: cdn(cid, x.files?.thumb?.url || x.files?.squarePreview?.url), full: cdn(cid, x.files?.full?.url || x.files?.preview?.url), duration: Number(x.duration) || null };
}

/** Les messages d'un fan, au format des « vues » de Bloom (comme `messageView`), sans l'auteur (`by` : ajouté par l'appelant). */
export async function ofChatMessages(cid, fanId, { cursor, limit = 30 } = {}) {
  const d = await of(cid, `/api2/v2/chats/${encodeURIComponent(fanId)}/messages?limit=${limit}&order=desc${cursor ? `&id=${encodeURIComponent(cursor)}` : ''}`);
  const rows = d?.list || [];
  const views = rows.map((m) => {
    const fromFan = String(m.fromUser?.id || '') === String(fanId);
    const price = Number(m.price) || 0;
    return {
      id: String(m.id),
      text: text(m.text),
      at: iso(m.createdAt),
      fromFan,
      by: null,
      medias: (m.media || []).map((x) => mediaOf(cid, x, !fromFan)),
      price,
      paid: price > 0 && !fromFan && (m.canPurchaseReason === 'opened' || (m.isOpened && !m.canPurchase)),
      tip: !!m.isTip,
      read: !!m.isOpened,
      reverted: false,
      cancelSeconds: !fromFan && typeof m.cancelSeconds === 'number' ? m.cancelSeconds : null,
    };
  });
  return { views, nextCursor: d?.hasMore && rows.length ? String(rows[rows.length - 1].id) : null };
}

/**
 * Envoyer un message TEXTE au nom de la modèle. Renvoie l'identifiant du message.
 * ⚠️ Format lu dans le site d'OnlyFans, pas encore vérifié sur un vrai envoi (28/11/2026). Les PPV restent sur Substy.
 */
export async function ofSend(cid, fanId, message) {
  const r = await of(cid, `/api2/v2/chats/${encodeURIComponent(fanId)}/messages`, {
    method: 'POST',
    json: { text: String(message), lockedText: false, mediaFiles: [], price: 0, previews: [], isCouplePeopleMedia: false, isForward: false },
  });
  return r?.id != null ? String(r.id) : null;
}

// ---------------------------------------------------------------- qui a écrit un message
// OnlyFans ne dit pas qui a écrit (chatteur, IA, automatisation). Le journal d'envois de Bloom (`sent_log`) le dit
// pour ce qui part de Bloom ; Substy note le reste dans `msg_log` avec LE MÊME identifiant (IA, employé, automatisation).
const same = (a, b) => String(a || '').trim() === String(b || '').trim();
export function ofAuthor(cid, fanId, v) {
  if (v.fromFan) return null;
  const at = Date.parse(v.at) || 0;
  const mine = all('SELECT s.text, s.message_id, u.name FROM sent_log s JOIN users u ON u.id = s.user_id WHERE s.creator_id = ? AND s.fan_id = ? AND (s.message_id = ? OR s.at BETWEEN ? AND ?)', String(cid), String(fanId), String(v.id), at - 90_000, at + 90_000)
    .find((l) => l.message_id === String(v.id) || (!l.message_id && same(l.text, v.text)));
  if (mine) return { kind: 'bloom', name: mine.name };
  const k = one('SELECT kind, by_name FROM msg_log WHERE id = ?', String(v.id));
  return k?.kind === 'ai' ? { kind: 'ai', name: 'IA' }
    : k?.kind === 'auto' ? { kind: 'auto', name: 'Automatisation' }
    : k?.kind === 'script' ? { kind: 'script', name: 'Script' }
    : k?.kind === 'employee' ? { kind: 'employee', name: k.by_name || 'Employé' }
    : k?.kind === 'bloom' ? { kind: 'bloom', name: k.by_name || 'Bloom' }
    : { kind: 'creator', name: 'Créatrice' };
}

// ---------------------------------------------------------------- médias hors vault (relais par le proxy de la modèle)
let Agent = null;
const agents = new Map();
async function agentFor(proxy) {
  if (!Agent) Agent = (await import('undici')).ProxyAgent;
  if (!agents.has(proxy)) agents.set(proxy, new Agent(proxy));
  return agents.get(proxy);
}
export function ofChatRoutes({ userFrom, send }) {
  return {
    'GET /api/of/cdn': async (req, res) => {
      const u = userFrom(req);
      const p = new URL(req.url, 'http://x').searchParams;
      const cid = String(p.get('c') || '');
      if (!u || !cid || !canSee({ ...u, pf: null }, cid) || !ofDirect(cid)) return res.writeHead(u ? 403 : 401), res.end();
      let target = '';
      try {
        target = Buffer.from(String(p.get('u') || ''), 'base64url').toString();
      } catch {}
      // Seulement le CDN d'OnlyFans : la route ne sert pas de relais ouvert.
      if (!/^https:\/\/([\w-]+\.)*onlyfans\.com\//i.test(target)) return send(res, 400, { error: 'Adresse refusée' });
      const proxy = proxyOf(cid);
      const r = await fetch(target, { headers: { referer: 'https://onlyfans.com/', ...(req.headers.range ? { range: req.headers.range } : {}) }, dispatcher: proxy ? await agentFor(proxy) : undefined }).catch(() => null);
      if (!r) return res.writeHead(502), res.end();
      const h = { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'private, max-age=3600' };
      for (const k of ['content-length', 'content-range', 'accept-ranges']) if (r.headers.get(k)) h[k] = r.headers.get(k);
      res.writeHead(r.status, h);
      if (!r.body) return res.end();
      for await (const chunk of r.body) res.write(chunk);
      res.end();
    },
  };
}
