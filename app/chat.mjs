// Messagerie de Bloom : routes de lecture / envoi au-dessus du pont Substy, et diffusion du temps réel aux navigateurs.
import { all, getSetting, one, run, setSetting } from './store.mjs';
import { onMessageAlert } from './alerts.mjs';
import { enrichMessage } from './sentlog.mjs';
import { libItemOf } from './library.mjs';
import { mymAuthor, mymChatMessages, mymChatPage, mymDirect, twinOf } from './mymchat.mjs';
import { isNative, nativeCreators } from './mym.mjs';
import { ofNativeCreators } from './onlyfans.mjs';
import { canChat, canEditAccess, canSee, creatorsOf, isBoss, onCreator, onVisible, ping, seesAll, setAccess, setActive, teamView, mymHidden } from './team.mjs';
import { refuseBanned } from './journal.mjs';

export const money = (p) => (p == null ? 0 : typeof p === 'object' ? (p.minor || 0) / 100 : Number(p) || 0);
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
export function aiLogView(l) {
  const a = String(l.action || '').toLowerCase();
  const on = /disabl|pause|stop|deactiv|handoff|(^|[^a-z])off/.test(a) ? false : /enabl|resum|activ|start|(^|[^a-z])on($|[^a-z])/.test(a) ? true : null;
  return { id: l.id, at: l.createdAt, on, action: l.action || '', reason: l.reason || '', by: l.employee?.name || null };
}
/** Images de Substy : les chemins « /api/creators/… » passent par le relais de Bloom. */
/** Photo de Substy : un chemin, une adresse, ou un objet { url, thumbUrl } (photos de profil des fans). */
/** Photos de profil des créatrices (Substy les donne à part ; le serveur les met à jour chaque minute). */
const CREATOR_PICS = new Map();
export function setCreatorPics(list) {
  for (const c of list) if (c.id && c.avatar) CREATOR_PICS.set(String(c.id), c.avatar);
}
export const img = (u) => {
  if (u && typeof u === 'object') u = u.thumbUrl || u.url || null;
  return !u ? null : String(u).startsWith('/api/creators/') ? `/media?p=${encodeURIComponent(u)}` : String(u);
};
// Fichier d'un média : chemin Substy (« /api/creators/… », relayé par /media) ou adresse complète (CDN de MYM, lisible
// directement par le navigateur).
const fileUrl = (u) => (!u ? null : /^https?:\/\//i.test(u) ? String(u) : `/media?p=${encodeURIComponent(u)}`);
export const mediaView = (m) => ({
  id: m.id,
  type: (m.type || '').toLowerCase(),
  thumb: fileUrl(m.files?.thumb),
  full: fileUrl(m.files?.full),
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
    // OnlyFans : secondes restantes pour pouvoir supprimer le message (0 = trop tard) ; qui l'a supprimé chez Substy.
    cancelSeconds: typeof m.cancelSeconds === 'number' ? m.cancelSeconds : null,
    revertedBy: m.revertedByEmployee?.name || null,
  };
}

export function chatView(c) {
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
    // Ce que le fan a payé (brut) : sert aux listes automatiques (« a dépensé au moins 1 $ »).
    paid: money(f.spend?.gross),
    subscribed: f.subscription?.status || null,
    canSend: c.canSendMessage !== false,
    since: f.subscription?.subscribedAt || null,
    last: c.lastMessage ? { id: c.lastMessage.id != null ? String(c.lastMessage.id) : null, text: plain(c.lastMessage.text), at: c.lastMessage.sentAt, fromCreator: !!c.lastMessage.isFromCreator, media: c.lastMessage.mediaCount || 0 } : null,
  };
}

export function fanView(f) {
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
const clients = new Map(); // réponse SSE -> personne connectée
export function broadcast(creatorId, type, data) {
  if (type === 'ping' || type === 'connected' || data?.type === 'connection_ready') return;
  const kind = data?.type || type;
  // Créatrice MYM reliée : les messages arrivent de MYM en direct (plus bas). Ce que Substy annonce ne sert plus qu'à
  // savoir si c'est son IA qui a écrit ; rien n'est envoyé aux navigateurs depuis Substy.
  if (kind === 'new_message' && data?.data && mymDirect(creatorId)) return void substyShadow(creatorId, data.data);
  const payload = { creatorId, type: kind };
  if (kind === 'new_message' && data?.data) {
    payload.fanId = data.data.fanId != null ? String(data.data.fanId) : null;
    payload.message = messageView(data.data, bloomSenderOf(data.data));
    logMessage(creatorId, data.data.fanId, payload.message);
    onLiveMessage(creatorId, data.data.fanId, payload.message);
    onMessageAlert(creatorId, data.data.fanId, payload.message);
    // Le direct de Substy ne dit pas si l'IA (ou un employé) a écrit le message : on relit la conversation juste après.
    if (!payload.message.fromFan && payload.message.by?.kind === 'creator') confirmSender(creatorId, payload.fanId);
  } else if (data?.data) payload.data = data.data;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const [c, u] of clients) if (canSee(u, creatorId)) c.write(line);
}

function substyShadow(cid, raw) {
  const fanId = raw.fanId != null ? String(raw.fanId) : null;
  const v = messageView(raw, bloomSenderOf(raw, false));
  const twin = fanId ? twinOf(cid, fanId, v.fromFan, v.text, Date.parse(v.at) || Date.now(), 'mym') : null;
  // Déjà noté depuis MYM : on complète seulement l'auteur ; sinon on le note (identifiant de Substy).
  if (twin) {
    if (v.by && v.by.kind !== 'creator') run('UPDATE msg_log SET kind = ?, by_name = ? WHERE id = ?', v.by.kind, v.by.kind === 'bloom' || v.by.kind === 'employee' ? v.by.name : null, twin.id);
  } else logMessage(cid, fanId, v);
  onMessageAlert(cid, fanId, v);
  if (!v.fromFan && v.by?.kind === 'creator') confirmSender(cid, fanId);
}

// ---------------------------------------------------------------- temps réel MYM (créatrices reliées)
// MYM n'a pas de flux « poussé » : son propre site relit la liste des conversations toutes les 10 à 12 s. Bloom fait
// pareil avec le compte relié : toutes les 7 s pour une créatrice que quelqu'un regarde, toutes les 30 s sinon.
// Une conversation dont le dernier message a changé → on lit ses derniers messages et on prévient les navigateurs.
const mymLive = new Map(); // cid -> { busy, primed, at, ok, err }
const mymLiveOf = (cid) => mymLive.get(cid) || (mymLive.set(cid, { busy: false, primed: false, at: 0, ok: 0, err: null, events: 0 }), mymLive.get(cid));
export const mymLiveState = () => Object.fromEntries([...mymLive].map(([cid, s]) => [cid, { live: !!s.ok && Date.now() - s.ok < 90_000, lastOk: s.ok || null, error: s.err, events: s.events }]));
async function mymLiveTick(cid) {
  const st = mymLiveOf(cid);
  if (st.busy) return;
  st.busy = true;
  st.at = Date.now();
  try {
    const b = inboxOf(cid);
    const r = await mymChatPage(cid);
    const changed = [];
    for (const m of r.items) {
      const old = b.map.get(m.fanId);
      // Nouveau dernier message (et pas un plus ancien remonté parce que le dernier a été supprimé).
      if (st.primed && m.last && m.last.id !== old?.last?.id && !(old?.last?.at && Date.parse(old.last.at) > Date.parse(m.last.at))) changed.push([m, old?.last || null]);
      const base = old ? strip(old) : { name: m.username || 'Fan', avatar: null, ai: false, handoff: false, spent: 0, paid: 0, subscribed: m.sub ? 'active' : null, since: null };
      put(b, { ...base, ...m, name: base.name || m.username || 'Fan', mym: true });
    }
    st.primed = true;
    st.ok = Date.now();
    st.err = null;
    for (const [m, prev] of changed.slice(0, 10)) {
      const d = await mymChatMessages(cid, m.fanId, { limit: 10 }).catch(() => null);
      // Messages plus récents que le dernier connu (du plus ancien au plus récent) ; à défaut, le dernier seulement.
      const since = prev?.at ? Date.parse(prev.at) : Infinity;
      let fresh = (d?.views || []).filter((v) => v.id !== prev?.id && Date.parse(v.at) > since).reverse();
      if (!fresh.length) fresh = (d?.views || []).slice(0, 1);
      if (!fresh.length) fresh = [{ id: m.last.id, text: m.last.text, at: m.last.at, fromFan: !m.last.fromCreator, by: null, kind: 'text', medias: [], price: 0, paid: false, tip: false, read: false, reverted: false }];
      for (const v of fresh) {
        v.by = mymAuthor(cid, m.fanId, v, !!b.map.get(m.fanId)?.ai);
        if (!twinOf(cid, m.fanId, v.fromFan, v.text, Date.parse(v.at) || Date.now(), '')) logMessage(cid, m.fanId, v, 'mym');
        st.events++;
        if (v.fromFan) for (const fn of fanListeners) Promise.resolve().then(() => fn(cid, m.fanId, v)).catch((e) => console.warn('[bloom] message de fan :', e.message));
        const line = `data: ${JSON.stringify({ creatorId: cid, type: 'new_message', fanId: m.fanId, message: v, via: 'mym' })}\n\n`;
        for (const [c, u] of clients) if (canSee(u, cid)) c.write(line);
      }
    }
  } catch (e) {
    st.err = e.message;
  } finally {
    st.busy = false;
  }
}
setInterval(() => {
  const watched = (cid) => [...clients.values()].some((u) => canSee(u, cid));
  for (const cid of INBOX.keys()) {
    if (!mymDirect(cid)) continue;
    const st = mymLiveOf(cid);
    if (Date.now() - st.at >= (watched(cid) ? 7_000 : 30_000)) mymLiveTick(cid);
  }
}, 1_000);

/**
 * Qui a vraiment envoyé les derniers messages d'une conversation : le direct de Substy n'indique pas « IA » (ni
 * l'employé), mais la liste des messages, oui. 4 s après un envoi, on relit les derniers messages du fan et on corrige
 * le journal ; un PPV de l'IA ainsi reconnu déclenche ses notifications (et la relance auto).
 */
const confirmLater = new Map();
function confirmSender(cid, fanId) {
  if (!fanId || !SUB) return;
  const key = `${cid}:${fanId}`;
  if (confirmLater.has(key)) return;
  confirmLater.set(
    key,
    setTimeout(async () => {
      confirmLater.delete(key);
      try {
        const r = await SUB.messages(cid, fanId, { limit: 15 });
        for (const it of r?.items || []) {
          if (!it.isSentByCreator) continue;
          const v = messageView(it, null);
          if (!v.by || v.by.kind === 'creator') continue;
          const row = one('SELECT kind FROM msg_log WHERE id = ?', String(v.id));
          if (!row || row.kind !== 'creator') continue;
          run('UPDATE msg_log SET kind = ?, by_name = ? WHERE id = ?', v.by.kind, v.by.kind === 'employee' ? v.by.name : null, String(v.id));
          if (v.by.kind === 'ai') onMessageAlert(cid, fanId, v);
        }
      } catch (e) {
        console.warn('[bloom] expéditeur des messages :', e.message);
      }
    }, 4000),
  );
}

// ---------------------------------------------------------------- toutes les conversations, gardées en mémoire
// Substy ne renvoie qu'une vingtaine de conversations par page : Bloom les parcourt toutes en tâche de fond,
// les garde ici à jour (temps réel + haut de liste toutes les 30 s + tour complet toutes les heures),
// et la messagerie les reçoit d'un coup (puis seulement ce qui a changé).
let SUB = null;
const INBOX = new Map(); // creatorId -> { map: Map(fanId -> chat + _t), complete, crawling, crawledAt, usedAt }
let seq = Date.now();
const stamp = () => (seq = Math.max(seq + 1, Date.now()));
// La liste est aussi enregistrée dans la base : après une mise à jour du site, elle est là tout de suite.
function inboxOf(cid) {
  let b = INBOX.get(cid);
  if (!b) {
    b = { cid, map: new Map(), complete: false, crawling: false, crawledAt: 0, usedAt: 0, resume: undefined };
    for (const r of all('SELECT data FROM inbox_cache WHERE creator_id = ?', cid)) {
      try {
        const c = JSON.parse(r.data);
        b.map.set(c.fanId, { ...c, _t: stamp() });
      } catch {}
    }
    // 22/11/2026 : les photos des fans n'étaient pas lues ; on refait un tour complet une fois pour les récupérer.
    const done = getSetting('inbox_avatars_v1') ? Number(getSetting(`inbox_done:${cid}`)) || 0 : 0;
    if (done && b.map.size) {
      b.complete = true;
      b.crawledAt = done;
    }
    INBOX.set(cid, b);
  }
  return b;
}
const strip = ({ _t, ...c }) => c;
/** Pour la file de la messagerie (toutes créatrices) : les conversations en mémoire d'une créatrice ; relance la récupération si besoin. */
/** Une conversation de la mémoire (ou null). */
export function inboxChat(cid, fanId) {
  return INBOX.get(cid)?.map.get(String(fanId)) ?? inboxOf(cid).map.get(String(fanId)) ?? null;
}
/** Le fan d'une créatrice d'après son pseudo (sans relancer la lecture des conversations). */
export function inboxFanByUsername(cid, username) {
  const n = String(username || '').trim().toLowerCase();
  if (!n) return null;
  for (const c of inboxOf(cid).map.values()) if (String(c.username || '').trim().toLowerCase() === n) return c.fanId;
  return null;
}
/** Toutes les conversations en mémoire d'une créatrice, sans relancer de lecture (envois groupés). */
export const inboxPeek = (cid) => [...inboxOf(cid).map.values()];
/** Relit TOUTES les conversations d'une créatrice chez MYM (avant un retrait de messages non lus). */
export const refreshMymInbox = (cid) => overlayMym(cid, 400);
/** Prévenu à chaque message d'un fan MYM arrivé en direct : (créatrice, fan, message). */
const fanListeners = [];
export const onMymFanMessage = (fn) => fanListeners.push(fn);
export function inboxChats(cid) {
  const b = inboxOf(cid);
  b.usedAt = Date.now();
  if (!b.crawling && (!b.crawledAt || Date.now() - b.crawledAt > 60 * 60_000)) crawl(cid);
  return { chats: b.map.values(), complete: b.complete, total: b.map.size };
}
function put(b, chat) {
  const old = b.map.get(chat.fanId);
  const json = JSON.stringify(chat);
  if (old && JSON.stringify(strip(old)) === json) return;
  b.map.set(chat.fanId, { ...chat, _t: stamp() });
  try {
    run('INSERT INTO inbox_cache (creator_id, fan_id, data) VALUES (?, ?, ?) ON CONFLICT(creator_id, fan_id) DO UPDATE SET data = excluded.data', b.cid, chat.fanId, json);
  } catch {}
}

/**
 * Créatrice MYM reliée : la liste des conversations vient de MYM en direct (dernier message, non lu, en ligne, abonné).
 * De Substy on ne garde que ce que lui seul connaît : l'état de son IA sur le fan et la dépense. `pages` = nombre de
 * pages de 30 à relire (les plus récentes d'abord).
 */
const mymSleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Une conversation vue par Substy : si elle est déjà lue chez MYM, Substy ne met à jour que l'IA et la dépense. */
const fromSubsty = (b, c) => {
  const old = b.map.get(c.fanId);
  return old?.mym ? { ...strip(old), ai: c.ai, handoff: c.handoff, spent: c.spent, paid: c.paid, name: c.name || old.name, avatar: c.avatar || old.avatar, subscribed: c.subscribed ?? old.subscribed, since: c.since ?? old.since } : c;
};
async function overlayMym(cid, pages) {
  if (!mymDirect(cid)) return;
  const b = inboxOf(cid);
  let cursor;
  for (let i = 0; i < pages; i++) {
    const r = await mymChatPage(cid, cursor);
    for (const m of r.items) {
      const old = b.map.get(m.fanId);
      const base = old ? strip(old) : { name: m.username || 'Fan', avatar: null, ai: false, handoff: false, spent: 0, paid: 0, subscribed: m.sub ? 'active' : null, since: null };
      put(b, { ...base, ...m, name: base.name || m.username || 'Fan', mym: true });
    }
    cursor = r.nextCursor;
    if (!cursor || !r.items.length) break;
    if (pages > 2) await mymSleep(120);
  }
}

async function crawl(cid) {
  const b = inboxOf(cid);
  if (b.crawling || !SUB) return;
  b.crawling = true;
  const t0 = Date.now();
  // Reprise là où un tour interrompu s'était arrêté (erreur passagère de Substy).
  let cursor = b.resume;
  try {
    let pages = 0;
    let stale = 0;
    const seen = new Set();
    // Modèle sans Substy : toutes ses conversations viennent de MYM (plus bas).
    if (!isNative(cid) && !String(cid).startsWith('of-')) do {
      // Pages de 30 comme le site de Substy : au-delà, sa pagination tourne en boucle.
      const r = await SUB.chats(cid, { limit: 30, cursor });
      let fresh = 0;
      for (const it of r?.items || []) {
        const c = chatView(it);
        if (!seen.has(c.fanId)) fresh++;
        seen.add(c.fanId);
        put(b, fromSubsty(b, c));
      }
      // Sécurité : 3 pages de suite sans nouveau fan = la pagination tourne en rond, on s'arrête.
      stale = fresh ? 0 : stale + 1;
      cursor = r?.nextCursor || undefined;
      b.resume = cursor;
    } while (cursor && stale < 3 && ++pages < 2000);
    b.resume = undefined;
    // MYM en direct par-dessus (tour complet : toutes les conversations, y compris celles que Substy ne connaît pas).
    await overlayMym(cid, 400).catch((e) => console.warn('[bloom] conversations MYM en direct :', e.message));
    b.complete = true;
    b.crawledAt = Date.now();
    setSetting(`inbox_done:${cid}`, String(b.crawledAt));
    setSetting('inbox_avatars_v1', '1');
    console.log(`[bloom] conversations de ${cid} : ${b.map.size} en ${Math.round((Date.now() - t0) / 1000)} s`);
  } catch (e) {
    console.warn('[bloom] liste des conversations (reprise dans 10 s) :', e.message);
    setTimeout(() => crawl(cid), 10_000);
  } finally {
    b.crawling = false;
  }
}
async function refreshTop(cid) {
  if (!SUB) return;
  const b = inboxOf(cid);
  try {
    if (isNative(cid) || String(cid).startsWith('of-')) throw new Error('sans Substy');
    const r = await SUB.chats(cid, { limit: 30 });
    for (const it of r?.items || []) put(b, fromSubsty(b, chatView(it)));
  } catch {}
  // Le haut de la liste (60 conversations) relu chez MYM ; la toute première fois, toutes les conversations.
  if (mymDirect(cid) && !b.mymFull) {
    b.mymFull = true;
    overlayMym(cid, 400).catch((e) => ((b.mymFull = false), console.warn('[bloom] conversations MYM en direct :', e.message)));
  } else await overlayMym(cid, 2).catch(() => {});
}
/** Relit le haut de la liste d'une créatrice (nouvelle vente, nouveau fan…). */
export const refreshInboxTop = (cid) => refreshTop(cid);
/** Change une conversation gardée en mémoire (ex. IA coupée par Bloom), sans attendre Substy. */
export function patchInboxChat(cid, fanId, patch) {
  const b = inboxOf(cid);
  const c = b.map.get(String(fanId));
  if (c) put(b, { ...strip(c), ...patch });
}
/** Au démarrage : on commence tout de suite à récupérer les conversations de chaque créatrice. */
export function warmInbox(ids) {
  for (const id of ids) if (!inboxOf(id).complete) crawl(id);
}
setInterval(() => {
  for (const [cid, b] of INBOX) {
    if (b.crawling) continue;
    if (Date.now() - b.crawledAt > 60 * 60_000) crawl(cid);
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
    last: { id: String(m.id), text: m.text, at: m.at, fromCreator: !m.fromFan, media: m.medias.length },
    unread: m.fromFan ? (c.unread || 0) + 1 : c.unread,
    handoff: m.fromFan ? c.handoff : false,
  });
}

/** Journal des messages vus en temps réel (un message n'est compté qu'une fois). */
let pruned = 0;
try {
  run('ALTER TABLE msg_log ADD COLUMN src TEXT');
} catch {}
function logMessage(creatorId, fanId, m, src = null) {
  try {
    run('INSERT OR IGNORE INTO msg_log (id, creator_id, fan_id, at, from_fan, kind, price, tip, medias, by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      String(m.id), creatorId, fanId ? String(fanId) : null, Date.parse(m.at) || Date.now(), m.fromFan ? 1 : 0, m.fromFan ? 'fan' : m.by?.kind || null, m.price || 0, m.tip ? 1 : 0, m.medias.length,
      m.by?.kind === 'bloom' || m.by?.kind === 'employee' ? m.by.name : null);
    if (src) run('UPDATE msg_log SET src = ? WHERE id = ? AND src IS NULL', src, String(m.id));
    // Texte, temps de réponse… pour « Messages envoyés ».
    enrichMessage(creatorId, fanId, m);
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
function bloomSenderOf(m, link = true) {
  if (!m?.isSentByCreator) return null;
  const at = Date.parse(m.createdAt || '') || Date.now();
  const r = all('SELECT s.id, s.message_id, u.name FROM sent_log s JOIN users u ON u.id = s.user_id WHERE s.creator_id = ? AND s.fan_id = ? AND s.text = ? AND ABS(s.at - ?) < 90000 ORDER BY s.at DESC LIMIT 1', m.creatorId, m.fanId, plain(m.text), at);
  // On garde l'identifiant du message : sert aux statistiques des scripts (achat du PPV envoyé).
  if (link && r[0] && !r[0].message_id && m.id != null) run('UPDATE sent_log SET message_id = ? WHERE id = ?', String(m.id), r[0].id);
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
  // Chiffres et équipe : admins, managers et team leaders (chacun sur ses créatrices).
  const boss = (req, res) => {
    const u = auth(req, res);
    if (u && !isBoss(u)) {
      send(res, 403, { error: 'Réservé aux managers et team leaders' });
      return null;
    }
    return u;
  };
  const q = (req) => new URL(req.url, 'http://x').searchParams;
  // Connexion + accès à la créatrice demandée (un chatteur ne voit que ses créatrices).
  // Envois groupés : le droit porte sur la MODÈLE, pas sur la plateforme choisie dans le menu (cookie commun à tous
  // les onglets : sans ça, un envoi préparé dans un onglet est refusé dès qu'un autre onglet passe sur MYM).
  const authM = (req, res, creatorId) => {
    const u = auth(req, res);
    if (!u) return null;
    if (!canChat(u) || !canSee({ ...u, pf: null }, creatorId)) {
      send(res, 403, { error: 'Tu n’as pas accès à cette créatrice. Demande à un manager.' });
      return null;
    }
    return u;
  };
  const authC = (req, res, creatorId) => {
    const u = auth(req, res);
    if (!u) return null;
    if (!canChat(u) || !canSee(u, creatorId)) {
      send(res, 403, { error: 'Tu n’as pas accès à cette créatrice. Demande à un manager.' });
      return null;
    }
    return u;
  };

  const creatorOf = (c) => ({
    id: c.id || c.creatorId,
    name: c.name || c.pseudo || c.displayName || c.username || 'Créatrice',
    username: c.username || c.platformUsername || null,
    platform: c.platform || null,
    avatar: img(c.avatar || c.avatarUrl || c.profilePicture || CREATOR_PICS.get(String(c.id || c.creatorId)) || null),
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

  const scriptView = (s) => ({
    id: s.id,
    name: plain(s.name),
    description: plain(s.description),
    position: s.position ?? 0,
    enabled: !!s.enabled,
    ai: !!s.isAi,
    human: !!s.isHuman,
    steps: s._count?.messageTemplates ?? (s.templates || []).length,
    medias: s._stats?.totalMedia ?? null,
    totalPrice: s._stats?.totalPrice ?? null,
    minPrice: s._stats?.minPrice ?? null,
    maxPrice: s._stats?.maxPrice ?? null,
  });
  const stepView = (t) => ({
    id: t.id,
    position: t.position ?? 0,
    name: plain(t.name),
    text: plain(t.content),
    aiCaption: !!t.isAiCaption,
    locked: !!t.isLockedText,
    price: Number(t.price) || 0,
    medias: (t.medias || []).map((m) => ({ ...mediaView({ ...m, files: { thumb: m.files?.thumb || m.files?.preview, full: m.files?.full } }), context: m.context || null })),
    followUps: (t.postMediaMessages || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((f) => ({ text: plain(f.message), wait: f.waitTime ?? null, ifRead: !f.doNotSendIfRead, ifReply: !f.doNotSendIfReply, ifPaid: !f.doNotSendIfPaid })),
    sent: !!t.alreadySent,
    purchase: t.purchaseState?.status || null,
  });

  /** Toute la configuration IA d'une créatrice, en une réponse (réglages, personnalité, fiche, ce qui manque, dernières modifications). */
  async function aiConfig(cid) {
    const [settings, presets, creators] = await Promise.all([substy.aiSettings(cid), substy.voicePresets(cid).catch(() => []), substy.creators()]);
    const c = (creators || []).find((x) => (x.id || x.creatorId) === cid) || {};
    const PROFILE = ['name', 'label', 'pseudo', 'age', 'gender', 'birthday', 'living', 'profession', 'timezone', 'primaryLanguage', 'otherLanguages', 'appearance', 'hairColor', 'eyeColor', 'ethnicity', 'weight', 'shoeSize', 'braCupSize', 'description', 'customAttributes', 'platform', 'platformAccountStartedAt'];
    const profile = Object.fromEntries(PROFILE.map((k) => [k, c[k] ?? null]));
    const missing = [['timezone', 'Fuseau horaire'], ['primaryLanguage', 'Langue maternelle']].filter(([k]) => !profile[k]).map(([, l]) => l);
    const preset = (x) => x && { id: x.id, name: x.name, description: x.description, builtin: x.presetType === 'BUILTIN', prompt: x.prompt, emojis: { casual: x.casualEmojis || [], sexting: x.sextingEmojis || [], negotiation: x.negociationEmojis || [] } };
    const { voicePreset, ...rest } = settings || {};
    const changes = all('SELECT a.what, a.detail, a.at, u.name FROM ai_changes a LEFT JOIN users u ON u.id = a.user_id WHERE a.creator_id = ? ORDER BY a.at DESC LIMIT 10', cid);
    return { settings: rest, preset: preset(voicePreset), presets: (Array.isArray(presets) ? presets : presets?.items || []).map(preset), profile, missing, changes };
  }

  return {
    // Ventes en direct (rafraîchies souvent, sans recalculer tout le dashboard).
    'GET /api/sales': async (req, res) => {
      const u = boss(req, res);
      if (!u) return;
      send(res, 200, (await salesView()).filter((s) => canSee(u, s.creatorId)));
    },

    'GET /api/creators': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      // Les modèles MYM dont le compte n'est pas relié à Bloom ne sont pas affichées.
      // Créatrices de Substy, plus les comptes MYM et OnlyFans ajoutés directement dans Bloom.
      const list = [...((await substy.creators().catch(() => [])) || []), ...nativeCreators(), ...ofNativeCreators()].map(creatorOf).filter((c) => !mymHidden(c.id));
      const allowed = creatorsOf(u);
      send(res, 200, allowed === null ? list : list.filter((c) => allowed.has(String(c.id))));
    },

    // ------------------------------------------------ configuration de l'IA (lecture seule pour l'instant)
    // Admins et managers. Tout ce que Substy répartit sur 4 pages (AI Chatter, AI Persona, Creator Info), en une réponse.
    'GET /api/ai-config': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      send(res, 200, await aiConfig(String(q(req).get('creatorId') || '')));
    },

    // Modifier les réglages de l'IA (seulement les champs dont le format est connu). Relit l'état actuel juste avant.
    'POST /api/ai-config/settings': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const ch = b.changes || {};
      const cur = await substy.aiSettings(cid);
      if (!cur?.creatorId) return send(res, 404, { error: 'Créatrice inconnue' });
      const next = { ...cur };
      for (const k of ['enable', 'standardEmojis', 'sextingEmojis', 'enableFanSpendLimit']) if (k in ch) next[k] = !!ch[k];
      if ('scriptRotationIntervalHours' in ch) {
        const h = Math.round(Number(ch.scriptRotationIntervalHours));
        if (!(h >= 8 && h <= 24)) return send(res, 400, { error: 'Changement de scripts : entre 8 et 24 heures.' });
        next.scriptRotationIntervalHours = h;
      }
      if ('maxFanSpend' in ch) {
        const v = ch.maxFanSpend === null || ch.maxFanSpend === '' ? null : Number(ch.maxFanSpend);
        if (v !== null && !(v >= 0)) return send(res, 400, { error: 'Montant invalide' });
        next.maxFanSpend = v;
      }
      if (next.enableFanSpendLimit && next.maxFanSpend == null) return send(res, 400, { error: 'Indique le montant de dépense qui fait passer le fan à l’équipe.' });
      if ('allowedSubscriptionTypes' in ch) {
        const t = (Array.isArray(ch.allowedSubscriptionTypes) ? ch.allowedSubscriptionTypes : []).filter((x) => x === 'FREE' || x === 'PAID');
        if (!t.length) return send(res, 400, { error: 'Choisis au moins un type de fans.' });
        next.allowedSubscriptionTypes = t;
      }
      if (next.enable && !cur.enable) {
        const cfg = await aiConfig(cid);
        if (cfg.missing.length) return send(res, 400, { error: `Substy ne peut pas allumer l’IA : il manque ${cfg.missing.join(' et ').toLowerCase()} dans la fiche.` });
      }
      await substy.updateSettings(cid, next);
      const changed = Object.keys(ch).filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(next[k]));
      if (changed.length) run('INSERT INTO ai_changes (user_id, creator_id, what, detail, at) VALUES (?, ?, ?, ?, ?)', u.id, cid, 'settings', JSON.stringify(Object.fromEntries(changed.map((k) => [k, [cur[k], next[k]]]))), Date.now());
      send(res, 200, await aiConfig(cid));
    },

    // Choisir la personnalité de l'IA.
    'POST /api/ai-config/preset': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const cfg = await aiConfig(cid);
      if (!cfg.presets.some((x) => x.id === b.voicePresetId)) return send(res, 400, { error: 'Personnalité inconnue' });
      await substy.setVoicePreset(cid, String(b.voicePresetId));
      run('INSERT INTO ai_changes (user_id, creator_id, what, detail, at) VALUES (?, ?, ?, ?, ?)', u.id, cid, 'preset', JSON.stringify([cfg.preset?.id ?? null, b.voicePresetId]), Date.now());
      send(res, 200, await aiConfig(cid));
    },

    // Modifier la fiche de la créatrice (on renvoie la fiche complète, comme le site de Substy).
    'POST /api/ai-config/profile': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const c = ((await substy.creators()) || []).find((x) => (x.id || x.creatorId) === cid);
      if (!c) return send(res, 404, { error: 'Créatrice inconnue' });
      // Les « infos en plus » de Substy ne sont pas encore gérées par Bloom : on ne risque pas de les effacer.
      if (Array.isArray(c.customAttributes) && c.customAttributes.length) return send(res, 409, { error: 'Cette fiche a des « infos en plus » que Bloom ne sait pas encore modifier : modifie-la sur Substy.' });
      const pr = b.profile || {};
      const TEXT = ['name', 'label', 'pseudo', 'gender', 'living', 'profession', 'timezone', 'primaryLanguage', 'appearance', 'hairColor', 'eyeColor', 'ethnicity', 'braCupSize', 'description', 'birthday'];
      const NUM = ['age', 'weight', 'shoeSize'];
      const next = { ...c, otherLanguages: Array.isArray(c.otherLanguages) ? c.otherLanguages : [], physicalCustomAttributes: [], interestsCustomAttributes: [] };
      for (const k of TEXT) if (k in pr) next[k] = pr[k] === '' || pr[k] == null ? null : String(pr[k]).slice(0, 2000);
      for (const k of NUM) if (k in pr) next[k] = pr[k] === '' || pr[k] == null ? null : Number(pr[k]);
      if ('otherLanguages' in pr) next.otherLanguages = (Array.isArray(pr.otherLanguages) ? pr.otherLanguages : []).map(String).slice(0, 10);
      if (!String(next.name || '').trim()) return send(res, 400, { error: 'Le nom est obligatoire.' });
      if (NUM.some((k) => next[k] !== null && next[k] !== undefined && !Number.isFinite(next[k]))) return send(res, 400, { error: 'Âge, poids et pointure : des nombres.' });
      await substy.updateCreator({ ...next, id: cid });
      run('INSERT INTO ai_changes (user_id, creator_id, what, detail, at) VALUES (?, ?, ?, ?, ?)', u.id, cid, 'profile', JSON.stringify(Object.keys(pr)), Date.now());
      send(res, 200, await aiConfig(cid));
    },

    // ------------------------------------------------ scripts (séquences de Substy, partagées avec l'IA)
    'GET /api/scripts': async (req, res) => {
      const p = q(req);
      if (!authC(req, res, p.get('creatorId'))) return;
      const list = (await substy.scripts(String(p.get('creatorId')))) || [];
      send(res, 200, list.map(scriptView).sort((a, b) => a.position - b.position));
    },
    'GET /api/scripts/steps': async (req, res) => {
      const p = q(req);
      if (!authC(req, res, p.get('creatorId'))) return;
      const steps = (await substy.scriptSteps(String(p.get('creatorId')), String(p.get('scriptId')))) || [];
      send(res, 200, steps.map(stepView).sort((a, b) => a.position - b.position));
    },
    // Où en est un fan dans chaque script : étapes envoyées, achetées, étape suivante.
    'GET /api/fan-scripts': async (req, res) => {
      const p = q(req);
      if (!authC(req, res, p.get('creatorId'))) return;
      const list = (await substy.fanScripts(String(p.get('creatorId')), String(p.get('fanId')))) || [];
      send(
        res,
        200,
        list.map((s) => {
          const steps = (s.templates || []).map(stepView).sort((a, b) => a.position - b.position);
          return { ...scriptView(s), steps, next: steps.find((x) => !x.sent)?.id ?? null, sent: steps.filter((x) => x.sent).length, bought: steps.filter((x) => x.purchase === 'bought').length };
        }),
      );
    },

    // ------------------------------------------------ messages rapides (« / » dans la zone de message)
    'GET /api/quick': async (req, res) => {
      const cid = q(req).get('creatorId');
      if (!authC(req, res, cid)) return;
      const rows = all(
        `SELECT r.id, r.creator_id, r.title, r.text, r.uses, r.user_id, u.name AS by FROM quick_replies r LEFT JOIN users u ON u.id = r.user_id
         WHERE r.creator_id IS NULL OR r.creator_id = ? ORDER BY r.uses DESC, r.title COLLATE NOCASE`,
        String(cid),
      );
      send(res, 200, rows.map((r) => ({ id: r.id, title: r.title, text: r.text, all: r.creator_id == null, uses: r.uses, by: r.by || null, mine: r.user_id === userFrom(req)?.id })));
    },
    'POST /api/quick': async (req, res) => {
      const b = await body(req);
      const u = authC(req, res, b.creatorId);
      if (!u) return;
      const title = String(b.title || '').trim().slice(0, 60);
      const text = String(b.text || '').trim().slice(0, 2000);
      if (!title || !text) return send(res, 400, { error: 'Un nom et un texte' });
      // « Pour toutes les créatrices » : réservé aux admins, managers et team leaders.
      const forAll = !!b.all && isBoss(u);
      if (b.id) {
        const r = one('SELECT user_id FROM quick_replies WHERE id = ?', Number(b.id));
        if (!r) return send(res, 404, { error: 'Introuvable' });
        if (r.user_id !== u.id && !isBoss(u)) return send(res, 403, { error: 'Seul son auteur ou un manager peut le modifier' });
        run('UPDATE quick_replies SET title = ?, text = ?, creator_id = ? WHERE id = ?', title, text, forAll ? null : String(b.creatorId), Number(b.id));
      } else run('INSERT INTO quick_replies (creator_id, title, text, user_id, at) VALUES (?, ?, ?, ?, ?)', forAll ? null : String(b.creatorId), title, text, u.id, Date.now());
      send(res, 200, { ok: true });
    },
    'POST /api/quick/delete': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const b = await body(req);
      const r = one('SELECT user_id, creator_id FROM quick_replies WHERE id = ?', Number(b.id));
      if (!r) return send(res, 404, { error: 'Introuvable' });
      if (r.user_id !== u.id && !isBoss(u)) return send(res, 403, { error: 'Seul son auteur ou un manager peut le supprimer' });
      if (r.creator_id && !canSee(u, r.creator_id)) return send(res, 403, { error: 'Pas ta créatrice' });
      run('DELETE FROM quick_replies WHERE id = ?', Number(b.id));
      send(res, 200, { ok: true });
    },
    'POST /api/quick/used': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const b = await body(req);
      run('UPDATE quick_replies SET uses = uses + 1 WHERE id = ?', Number(b.id));
      send(res, 200, { ok: true });
    },

    // ------------------------------------------------ envois groupés
    'GET /api/mass': async (req, res) => {
      const p = q(req);
      if (!authM(req, res, p.get('creatorId'))) return;
      const page = Math.max(1, Number(p.get('page')) || 1);
      const r = (await substy.massMessages(String(p.get('creatorId')), page, 20)) || {};
      const money = (m) => (m == null ? null : Number(m) / 100);
      send(res, 200, {
        total: r.total || 0,
        page: r.page || page,
        pages: r.totalPages || 1,
        items: (r.items || []).map((m) => ({
          id: String(m.id),
          text: plain(m.text || ''),
          price: Number(m.price) || 0,
          medias: (m.mediaIds || []).length,
          included: (m.includedListIds || []).map(String),
          excluded: (m.excludedListIds || []).map(String),
          fans: (m.userIds || []).length,
          onlineOnly: !!m.includeOnlineFans,
          status: String(m.status || ''),
          scheduledAt: m.scheduledAt || null,
          createdAt: m.createdAt || null,
          recipients: m.recipientCount ?? null,
          sent: m.sentCount ?? null,
          viewed: m.viewedCount ?? null,
          purchased: m.purchasedCount ?? null,
          gross: money(m.revenueGrossMinor),
          net: money(m.revenueNetMinor),
          currency: m.revenueCurrency || 'USD',
          canUnsend: !!m.canUnsend,
          unsendDeadline: m.unsendDeadline || null,
          revertedBy: m.revertedByName || null,
        })),
      });
    },
    // Envoi groupé : réservé aux admins, managers et team leaders (un envoi touche des milliers de fans).
    'POST /api/mass': async (req, res) => {
      const b = await body(req);
      const u = authM(req, res, b.creatorId);
      if (!u) return;
      if (u.role === 'chatter') return send(res, 403, { error: 'Envoi groupé réservé aux team leaders, managers et admins.' });
      const cid = String(b.creatorId);
      const text = String(b.text || '').slice(0, 5000);
      // Mots interdits de l'agence (Modération) : rien ne part, le refus est noté.
      const refusedMass = text.trim() ? refuseBanned(u, cid, null, text) : null;
      if (refusedMass) return send(res, 400, { error: refusedMass });
      const ids = (a, n) => (Array.isArray(a) ? [...new Set(a.map(String))].slice(0, n) : []);
      const mediaIds = ids(b.mediaIds, 50);
      const inc = ids(b.includedListIds, 50);
      const exc = ids(b.excludedListIds, 50).filter((x) => !inc.includes(x));
      const price = Number(b.price) > 0 ? Math.round(Number(b.price) * 100) / 100 : 0;
      if (!text.trim() && !mediaIds.length) return send(res, 400, { error: 'Message vide' });
      if (price && !mediaIds.length) return send(res, 400, { error: 'Un PPV a besoin d’au moins un média' });
      if (price > 200) return send(res, 400, { error: 'Prix trop élevé (200 $ max)' });
      if (!inc.length) return send(res, 400, { error: 'Choisis au moins une liste de fans' });
      let scheduledAt;
      if (b.scheduledAt) {
        const t = Date.parse(b.scheduledAt);
        if (!Number.isFinite(t) || t < Date.now() + 60_000) return send(res, 400, { error: 'La date programmée doit être dans le futur' });
        scheduledAt = new Date(t).toISOString();
      }
      const unsend = Number(b.autoUnsendAfterSeconds) > 0 ? Math.round(Number(b.autoUnsendAfterSeconds)) : undefined;
      if (text.trim()) {
        const v = await substy.validate(text).catch(() => null);
        if (v && (v.valid === false || v.isValid === false || (Array.isArray(v.bannedWords) && v.bannedWords.length) || (Array.isArray(v.matches) && v.matches.length)))
          return send(res, 400, { error: `Mot interdit dans le message : ${(v.bannedWords || v.matches || []).map((w) => String(w.word || w)).join(', ')}`, details: v });
      }
      const r = await substy.createMass(cid, { text, price, mediaIds, includedListIds: inc, excludedListIds: exc, includeOnlineFans: !!b.onlineOnly, scheduledAt, autoUnsendAfterSeconds: unsend });
      run('INSERT INTO ai_changes (user_id, creator_id, what, detail, at) VALUES (?, ?, ?, ?, ?)', u.id, cid, 'mass', JSON.stringify({ text: text.slice(0, 200), price, medias: mediaIds.length, inc, exc, scheduledAt: scheduledAt || null }), Date.now());
      send(res, 200, { ok: true, result: r ?? null });
    },
    'GET /api/fan-lists': async (req, res) => {
      const p = q(req);
      if (!authM(req, res, p.get('creatorId'))) return;
      const r = (await substy.fanLists(String(p.get('creatorId')))) || {};
      send(res, 200, (r.items || []).map((l) => ({ id: String(l.id), name: String(l.name || ''), type: String(l.type || ''), fans: Number(l.fanCount) || 0 })));
    },

    // ------------------------------------------------ équipe
    // Présence : la messagerie signale la conversation ouverte (toutes les 20 s) ; réponse = qui d'autre est sur la créatrice.
    'POST /api/presence': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const b = await body(req);
      const cid = b.creatorId && canSee(u, b.creatorId) ? String(b.creatorId) : null;
      ping(u, { creatorId: cid, fanId: cid ? b.fanId : null, page: b.page, ua: req.headers['user-agent'], country: req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] });
      // scope « all » : la messagerie en vue « Tous » veut savoir qui est sur quel fan, toutes créatrices confondues.
      const others = b.scope === 'all' ? onVisible(u) : cid ? onCreator(cid) : [];
      send(res, 200, { others: others.filter((x) => x.userId !== u.id) });
    },
    'GET /api/team': async (req, res) => {
      if (!boss(req, res)) return;
      send(res, 200, teamView());
    },
    'POST /api/team/access': async (req, res) => {
      const u = boss(req, res);
      if (!u) return;
      const b = await body(req);
      const target = one('SELECT id, role FROM users WHERE id = ?', Number(b.userId));
      if (!target) return send(res, 404, { error: 'Personne inconnue' });
      if (seesAll(target)) return send(res, 400, { error: 'Les admins et managers voient déjà toutes les créatrices.' });
      if (!canEditAccess(u, target)) return send(res, 403, { error: 'Un team leader ne peut changer que les accès de ses chatteurs.' });
      // On ne donne que des créatrices qu'on voit soi-même.
      if (!seesAll(u) && (b.all || (b.creators || []).some((c) => !canSee(u, c)))) return send(res, 403, { error: 'Tu ne peux donner que tes propres créatrices.' });
      setAccess(target.id, { all: !!b.all, creators: Array.isArray(b.creators) ? b.creators.map(String) : [] });
      send(res, 200, teamView());
    },
    'POST /api/team/active': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      const b = await body(req);
      const target = one('SELECT role FROM users WHERE id = ?', Number(b.userId));
      if (target?.role === 'admin' && u.role !== 'admin') return send(res, 403, { error: 'Seul un admin peut désactiver un admin.' });
      if (Number(b.userId) === u.id) return send(res, 400, { error: 'Tu ne peux pas te désactiver toi-même.' });
      setActive(Number(b.userId), !!b.active);
      send(res, 200, teamView());
    },

    // Dashboard : l'état en direct de chaque créatrice + ce que Bloom a vu passer aujourd'hui et sur 7 jours.
    'GET /api/dashboard': async (req, res) => {
      const me = boss(req, res);
      if (!me) return;
      // Chaque personne ne voit que ses créatrices (le cache est commun, on filtre à la sortie).
      const mine = (d) => ({ ...d, creators: d.creators.filter((c) => canSee(me, c.id)), sales: (d.sales || []).filter((s) => canSee(me, s.creatorId)) });
      const sendMine = (r, code, d) => send(r, code, mine(d));
      const period = ['today', '7d', '30d'].includes(q(req).get('period')) ? q(req).get('period') : 'today';
      if (dashCache?.[period] && Date.now() - dashCache[period].at < 20_000) return sendMine(res, 200, dashCache[period].data);
      const creators = ((await substy.creators()) || []).map(creatorOf);
      // Dates à l'heure de Paris, comme le dashboard de Substy (7 jours = du J-7 à aujourd'hui).
      const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d);
      const end = ymd(new Date());
      const start = ymd(new Date(Date.now() - (period === '7d' ? 7 : period === '30d' ? 30 : 0) * 864e5));
      const rev = async () => null; // revenus : /api/revenue (Infloww / MyPulse)
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
            rev(),
          ]);
          return { ...c, live: !!st[c.id]?.live, unread, handoff, aiOff, recent, revenue, today: today[c.id] || null, week: week[c.id] || null };
        }),
      );
      const [revenue, sales] = await Promise.all([rev(), salesView()]);
      const since = one('SELECT MIN(at) AS t FROM msg_log')?.t || null;
      const data = { period, start, end, revenue, sales, creators: items, since, at: Date.now() };
      dashCache = { ...dashCache, [period]: { at: Date.now(), data } };
      sendMine(res, 200, data);
    },

    // Toutes les conversations d'une créatrice (depuis la mémoire de Bloom). since = seulement ce qui a changé depuis.
    'GET /api/inbox': async (req, res) => {
      const p = q(req);
      const cid = String(p.get('creatorId') || '');
      if (!authC(req, res, cid)) return;
      if (!cid) return send(res, 400, { error: 'Créatrice manquante' });
      const b = inboxOf(cid);
      b.usedAt = Date.now();
      if (!b.crawling && (!b.crawledAt || Date.now() - b.crawledAt > 60 * 60_000)) crawl(cid);
      const since = Number(p.get('since')) || 0;
      const at = seq;
      const items = [];
      for (const c of b.map.values()) if (c._t > since) items.push(strip(c));
      send(res, 200, { items, at, complete: b.complete, total: b.map.size });
    },

    'GET /api/chats': async (req, res) => {
      const p = q(req);
      if (!authC(req, res, p.get('creatorId'))) return;
      const limit = Math.min(30, Math.max(10, Number(p.get('limit')) || 30)); // au-delà de 30, la pagination de Substy tourne en boucle
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
      const p = q(req);
      if (!authC(req, res, p.get('creatorId'))) return;
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
      const p = q(req);
      if (!authC(req, res, p.get('creatorId'))) return;
      send(res, 200, fanView((await substy.fan(p.get('creatorId'), p.get('fanId'))) || {}));
    },

    'GET /api/ailog': async (req, res) => {
      const p = q(req);
      if (!authC(req, res, p.get('creatorId'))) return;
      const r = await substy.aiLogs(p.get('creatorId'), p.get('fanId'));
      send(res, 200, (r?.items || []).map(aiLogView));
    },

    'POST /api/ai': async (req, res) => {
      const b = await body(req);
      if (!authC(req, res, b.creatorId)) return;
      await substy.setAi(String(b.creatorId), String(b.fanId), !!b.on);
      send(res, 200, { ok: true, ai: !!b.on });
    },

    'POST /api/send': async (req, res) => {
      const b = await body(req);
      const u = authC(req, res, b.creatorId);
      if (!u) return;
      const message = String(b.message || '').slice(0, 5000);
      const medias = Array.isArray(b.medias) ? b.medias.map(String).slice(0, 50) : [];
      const price = Number(b.price) > 0 ? Math.round(Number(b.price) * 100) / 100 : 0;
      if (!message.trim() && !medias.length) return send(res, 400, { error: 'Message vide' });
      if (price && !medias.length) return send(res, 400, { error: 'Un PPV a besoin d’au moins un média' });
      // Mots interdits de l'agence, liste de Bloom (Modération).
      const refused = message.trim() ? refuseBanned(u, b.creatorId, b.fanId, message) : null;
      if (refused) return send(res, 400, { error: refused });
      if (message.trim()) {
        // Mots interdits de l'agence (même contrôle que le site de Substy avant chaque envoi).
        const v = await substy.validate(message).catch(() => null);
        if (v && (v.valid === false || v.isValid === false || (Array.isArray(v.bannedWords) && v.bannedWords.length) || (Array.isArray(v.matches) && v.matches.length)))
          return send(res, 400, { error: `Mot interdit dans le message : ${(v.bannedWords || v.matches || []).map((w) => String(w.word || w)).join(', ')}`, details: v });
      }
      // Script de la bibliothèque de Bloom envoyé (pour ses statistiques et l'avancement du fan dans la séquence).
      const lib = libItemOf(String(b.creatorId), b.libItemId);
      run('INSERT INTO sent_log (user_id, creator_id, fan_id, text, price, at, lib_item) VALUES (?, ?, ?, ?, ?, ?, ?)', u.id, String(b.creatorId), String(b.fanId), message, price, Date.now(), lib);
      // Répondu depuis Bloom : le fan n'est plus « non lu » à la main.
      try {
        run('UPDATE fan_meta SET unread = 0 WHERE creator_id = ? AND fan_id = ?', String(b.creatorId), String(b.fanId));
      } catch {}
      const r = await substy.send(String(b.creatorId), String(b.fanId), { message, medias, price: price || undefined, replyId: b.replyId || null, templateId: b.templateId ? String(b.templateId) : undefined });
      send(res, 200, { ok: true, result: r ?? null });
    },

    'GET /api/vault/lists': async (req, res) => {
      if (!authC(req, res, q(req).get('creatorId'))) return;
      const r = await substy.vaultLists(q(req).get('creatorId'));
      send(res, 200, (r?.lists || []).map((l) => ({ id: l.id, name: l.name, photos: l.photosCount || 0, videos: l.videosCount || 0, audios: l.audiosCount || 0 })));
    },
    'GET /api/vault/medias': async (req, res) => {
      const p = q(req);
      if (!authC(req, res, p.get('creatorId'))) return;
      const r = await substy.vaultMedias(p.get('creatorId'), { listId: p.get('listId') || undefined, cursor: p.get('cursor') || undefined });
      send(res, 200, { items: (r?.medias || []).map((m) => ({ ...mediaView(m), price: money(m.price) })), nextCursor: r?.hasMore ? r.nextCursor : null });
    },

    // Images / vidéos (relayées par Bloom : le navigateur ne parle jamais à Substy directement).
    'GET /media': async (req, res) => {
      const u = userFrom(req);
      const path = q(req).get('p') || '';
      // Le chemin d'un média contient la créatrice : « /api/creators/<id>/medias/view?… »
      const cid = /^\/api\/creators\/([\w-]+)\//.exec(path)?.[1];
      // Le droit porte sur la MODÈLE, pas sur la plateforme choisie dans le menu (cookie commun à tous les onglets).
      if (!u || !cid || !canSee({ ...u, pf: null }, cid)) {
        res.writeHead(u ? 403 : 401);
        return res.end();
      }
      const r = await substy.media(path);
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'private, max-age=3600' });
      if (!r.body) return res.end();
      for await (const chunk of r.body) res.write(chunk);
      res.end();
    },

    // Flux temps réel vers le navigateur.
    'GET /api/live': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      // content-encoding « identity » : le Caddy du serveur ne compresse pas (et donc ne retient pas) ce flux.
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no', 'content-encoding': 'identity' });
      res.write('retry: 3000\n\n');
      clients.set(res, u);
      const t = setInterval(() => res.write(': ok\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(t);
        clients.delete(res);
      });
    },
  };
}
