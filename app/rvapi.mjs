// Messagerie façon Raven CRM : les écrans de Raven (web/src/rv) parlent à ces routes « /api/rv/… », qui répondent
// exactement dans le format de Raven, à partir de Substy (OnlyFans / MYM) et de ce que Bloom garde en plus.
// Une conversation = « <creatorId>~<fanId> ». Les montants sont en centimes (comme Raven).
import { all, db, getSetting, one, run, setSetting } from './store.mjs';
import { img, inboxChat, inboxChats, mediaView, messageView, plain } from './chat.mjs';
import { balanced, computeQueue, metaMap, tagsOf, waiting } from './inbox.mjs';
import { libItemOf } from './library.mjs';
import { pinFan } from './lists.mjs';
import { listMembers, listsOfCreator } from './fanlists.mjs';
import { parisDay, revenue } from './revenue.mjs';
import { canChat, canSee, isBoss } from './team.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS seq_progress (creator_id TEXT NOT NULL, fan_id TEXT NOT NULL, sequence_id INTEGER NOT NULL, step INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, PRIMARY KEY (creator_id, fan_id, sequence_id));
  CREATE TABLE IF NOT EXISTS creator_profile (creator_id TEXT PRIMARY KEY, sheet TEXT NOT NULL DEFAULT '', updated_at INTEGER, updated_by TEXT);
`);
for (const sql of ['ALTER TABLE fan_meta ADD COLUMN nickname TEXT', 'ALTER TABLE fan_meta ADD COLUMN badge_icon TEXT', 'ALTER TABLE fan_meta ADD COLUMN badge_label TEXT']) {
  try {
    db.exec(sql);
  } catch {}
}

const cents = (v) => Math.round((Number(v) || 0) * 100);
const iso = (t) => (t ? new Date(t).toISOString() : null);
const cid_ = (id) => {
  const i = String(id).indexOf('~');
  return i > 0 ? [String(id).slice(0, i), String(id).slice(i + 1)] : [null, null];
};
const convId = (cid, fanId) => `${cid}~${fanId}`;
const SEQ_TAG = 1_000_000_000; // scripts d'un tag = « scripts » d'une étape (ids distincts des séquences)

// Verrous « X est sur ce fan » (en mémoire, 90 s, comme Raven).
const locks = new Map();
const lockOf = (id) => {
  const l = locks.get(id);
  if (l && l.until < Date.now()) return locks.delete(id), null;
  return l ?? null;
};

/** Une conversation de Bloom → le format `Conv` de Raven. */
function convOf(cid, c, m, extra = {}) {
  const last = c?.last;
  const fromFan = !!last && !last.fromCreator;
  const lock = lockOf(convId(cid, c.fanId));
  return {
    id: convId(cid, c.fanId),
    modelId: cid,
    memberId: c.fanId,
    memberName: c.name,
    memberUsername: c.username || null,
    memberAvatar: img(c.avatar),
    nickname: m?.nickname || null,
    totalSpent: cents(c.spent),
    // Substy ne dit pas si le fan est en ligne : on prend l'heure de son dernier message.
    lastSeenAt: fromFan ? last.at : null,
    lastMessageAt: last?.at || null,
    preview: last ? last.text || (last.media ? '📷 Média' : '') : '',
    lastFromFan: fromFan,
    subscribedAt: c.since || null,
    pinnedBy: m?.pinned && m?.pinned_by ? { id: 0, name: m.pinned_by } : null,
    seen: !!m?.seen_id && m.seen_id === last?.id,
    unread: c.unread > 0 || !!m?.unread,
    fresh: !!m?.unread || (fromFan && m?.seen_id !== last?.id && waiting(c, m)),
    pinned: !!m?.pinned,
    vip: false,
    needsReply: waiting(c, m),
    waitingSince: waiting(c, m) ? last?.at || null : null,
    crmNote: m?.notes || '',
    crmTags: tagsOf(m?.tags),
    revealNote: '',
    cardVerified: false,
    badge: { icon: m?.badge_icon || null, label: m?.badge_label || null },
    score: { rank: 'unranked', top: null, lastPaidAt: null, paidWeek: false },
    lock: lock ? { userId: lock.userId, name: lock.name } : null,
    // En plus de Raven : IA de Substy sur ce fan, « à reprendre », peut recevoir un message.
    ai: !!c.ai,
    handoff: !!c.handoff,
    canSend: c.canSend !== false,
    ...extra,
  };
}

/** Média Bloom → `Media` de Raven. */
const rvMedia = (m) => ({ id: String(m.id), type: m.type === 'video' ? 'video' : m.type === 'audio' ? 'audio' : 'photo', url: m.full || m.thumb || undefined, smallUrl: m.thumb || undefined, mediumUrl: m.full || m.thumb || undefined, thumbnailUrl: m.thumb || undefined, durationSeconds: m.duration ?? null });

/** Message Bloom → `LiveMsg` de Raven. */
function liveMsg(v, fanId, fanName) {
  const medias = (v.medias || []).map(rvMedia);
  const out = {
    message: { id: String(v.id), content: v.text || '', type: v.tip ? 'tips' : 'message', createdAt: v.at, deletedAt: v.reverted ? v.at : null },
    authorMessage: v.fromFan ? { memberId: String(fanId), displayName: fanName } : { displayName: v.by?.name || 'Créatrice' },
    replyTo: null,
    reactions: [],
    // En plus de Raven : qui a envoyé (IA de Substy, automatisation, chatteur…).
    by: v.by || null,
  };
  if (v.price > 0) out.bundleWithMedias = { bundle: { price: cents(v.price), isPaid: !!v.paid }, medias };
  else out.medias = medias;
  return out;
}

/** Bibliothèque de Bloom (tags + séquences) → format `Lib` de Raven, avec ce qui a déjà été envoyé au fan. */
function libOf(cid, fanId) {
  const groups = all('SELECT id, kind, name, position, updated_at FROM lib_groups WHERE creator_id = ? ORDER BY position, id', cid);
  const items = all('SELECT i.* FROM lib_items i JOIN lib_groups g ON g.id = i.group_id WHERE g.creator_id = ? ORDER BY i.position, i.id', cid);
  const stats = new Map(
    all(
      `SELECT s.lib_item AS id, COUNT(*) AS uses, SUM(s.price > 0) AS ppv, COUNT(l.id) AS sales, COALESCE(SUM(l.gross), 0) AS revenue
       FROM sent_log s LEFT JOIN rv_live l ON s.message_id IS NOT NULL AND l.message_id = s.message_id WHERE s.creator_id = ? AND s.lib_item IS NOT NULL GROUP BY s.lib_item`,
      cid,
    ).map((r) => [r.id, r]),
  );
  const fan = fanId
    ? new Map(all('SELECT s.lib_item AS id, MAX(s.at) AS at, u.name AS by FROM sent_log s LEFT JOIN users u ON u.id = s.user_id WHERE s.creator_id = ? AND s.fan_id = ? AND s.lib_item IS NOT NULL GROUP BY s.lib_item', cid, String(fanId)).map((r) => [r.id, r]))
    : new Map();
  const gname = new Map(groups.map((g) => [g.id, g]));
  const scripts = items.map((i) => {
    const s = stats.get(i.id);
    const f = fan.get(i.id);
    let medias = [];
    try {
      medias = JSON.parse(i.medias || '[]').map(rvMedia);
    } catch {}
    return { id: i.id, title: i.name || '', content: i.text, note: i.note || null, price: i.price ? cents(i.price) : null, medias, tags: [gname.get(i.group_id)?.name || 'Général'], fromReveal: false, uses: s?.uses || 0, sales: s?.sales || 0, revenue: s?.revenue || 0, usedWithFan: f ? iso(f.at) : null, usedBy: f?.by || null };
  });
  const sequences = [];
  for (const g of groups) {
    const its = items.filter((i) => i.group_id === g.id);
    const sum = (k) => its.reduce((a, i) => a + (stats.get(i.id)?.[k] || 0), 0);
    if (g.kind === 'sequence') sequences.push({ id: g.id, title: g.name, folder: 'Séquences', isSequence: true, fromReveal: false, steps: its.map((i) => i.id), uses: sum('uses'), sales: sum('sales'), ppvSent: sum('ppv'), revenue: sum('revenue'), updatedAt: g.updated_at, pushedAt: null });
    // Un tag = un dossier ; chacun de ses scripts est un « script » d'une seule étape (comme les scripts sans séquence de Raven).
    else for (const i of its) sequences.push({ id: SEQ_TAG + i.id, title: i.name || i.text.slice(0, 40), folder: g.name, isSequence: false, fromReveal: false, steps: [i.id], uses: stats.get(i.id)?.uses || 0, sales: stats.get(i.id)?.sales || 0, ppvSent: stats.get(i.id)?.ppv || 0, revenue: stats.get(i.id)?.revenue || 0, updatedAt: g.updated_at, pushedAt: null });
  }
  const progress = fanId ? all('SELECT sequence_id AS sequenceId, step, active FROM seq_progress WHERE creator_id = ? AND fan_id = ?', cid, String(fanId)).map((p) => ({ ...p, active: !!p.active })) : [];
  return { scripts, sequences, progress };
}

export function rvRoutes({ substy, userFrom, send, body, creators }) {
  const me = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!canChat(u)) return send(res, 403, { error: 'Pas d’accès à la messagerie' }), null;
    return u;
  };
  const hiddenOf = (u) => {
    try {
      return JSON.parse(getSetting(`rv_hidden:${u.id}`) || '[]');
    } catch {
      return [];
    }
  };
  /** La conversation existe et l'utilisateur a accès à sa créatrice. */
  const conv = (req, res, id) => {
    const u = me(req, res);
    if (!u) return null;
    const [cid, fanId] = cid_(id);
    if (!cid || !canSee(u, cid)) return send(res, 403, { error: 'Tu n’as pas accès à cette créatrice.' }), null;
    return { u, cid, fanId };
  };
  const metaOf = (cid, fanId) => one('SELECT * FROM fan_meta WHERE creator_id = ? AND fan_id = ?', cid, String(fanId));
  const setMeta = (cid, fanId, sql, ...v) => {
    run('INSERT OR IGNORE INTO fan_meta (creator_id, fan_id, updated_at) VALUES (?, ?, ?)', cid, String(fanId), Date.now());
    run(`UPDATE fan_meta SET ${sql}, updated_at = ? WHERE creator_id = ? AND fan_id = ?`, ...v, Date.now(), cid, String(fanId));
  };
  const chatOf = async (cid, fanId) => {
    const c = inboxChat(cid, fanId);
    if (c) return c;
    const f = (await substy.fan(cid, fanId).catch(() => null)) || {};
    return { fanId: String(fanId), name: f.displayName || f.name || f.username || 'Fan', username: f.username || null, avatar: null, unread: 0, ai: !!f.aiEnabled, handoff: false, spent: 0, canSend: true, last: null };
  };
  const modelList = (u) => creators().filter((c) => canSee(u, c.id)).map((c) => ({ id: c.id, userName: c.username, displayName: c.name, avatar: c.avatar, connected: true, platform: c.platform }));

  // [méthode, motif, gestionnaire(req, res, ...captures)]
  const R = [
    ['GET', /^\/api\/rv\/boot$/, async (req, res) => {
      const u = me(req, res);
      if (!u) return;
      send(res, 200, { me: { id: u.id, name: u.name, admin: isBoss(u) }, models: modelList(u), hasConnection: true, hidden: hiddenOf(u) });
    }],
    ['PUT', /^\/api\/rv\/me$/, async (req, res) => {
      const u = me(req, res);
      if (!u) return;
      const b = await body(req);
      if (Array.isArray(b.hiddenModels)) setSetting(`rv_hidden:${u.id}`, JSON.stringify(b.hiddenModels.map(String).slice(0, 200)));
      send(res, 200, { ok: true });
    }],

    // ---------------------------------------------------------------- file
    ['GET', /^\/api\/rv\/inbox$/, async (req, res) => {
      const u = me(req, res);
      if (!u) return;
      const p = new URL(req.url, 'http://x').searchParams;
      const tab = { all: 'all', pinned: 'pinned', online: 'active', new: 'new', relance: 'relance', reply: 'reply', handoff: 'manual' }[p.get('tab')] || 'reply';
      const w = Number(p.get('window'));
      const hidden = hiddenOf(u);
      const model = p.get('model') || '';
      const { keep, counts, perCreator, manualPerCreator, rel, boxes, mine } = computeQueue(u, creators(), {
        hide: model ? [] : hidden,
        scope: model || 'all',
        tab,
        winMs: w > 0 ? w * 3600_000 : 0,
        sort: p.get('sort') === 'spent' ? 'spent' : p.get('sort') === 'newest' ? 'recent' : p.get('sort') === 'oldest' ? 'old' : undefined,
        q: p.get('q'),
        paying: p.get('paying') === '1',
        activeOnly: p.get('online') === '1',
        only: ['handoff', 'unread'].includes(p.get('only')) ? p.get('only') : undefined,
        list: p.get('list') ? listMembers(p.get('list')) || { creatorId: '', fans: new Set() } : undefined,
      });
      const items = keep.slice(0, 300).map((r) =>
        convOf(r.cid, r.c, r.m, {
          box: r.boxIdx != null ? r.boxIdx + 1 : null,
          relance: r.relCand && rel.has(r.c.last.id) ? { ppv: cents(rel.get(r.c.last.id).price), step: rel.get(r.c.last.id).script, at: iso(rel.get(r.c.last.id).at) } : undefined,
        }),
      );
      // Boîtes de la créatrice choisie (Box 1..N).
      let bx = null;
      if (model && canSee(u, model)) {
        const cfg = boxes.get(model);
        const perBox = {};
        if (cfg) {
          const w2 = w > 0 ? w * 3600_000 : 0;
          const metas = metaMap([model]);
          const now = Date.now();
          const list = [...inboxChats(model).chats].filter((c) => waiting(c, metas.get(`${model}:${c.fanId}`)) && (!w2 || Date.parse(c.last?.at || 0) >= now - w2));
          for (const b of balanced(list, cfg.count).values()) perBox[b + 1] = (perBox[b + 1] || 0) + 1;
        }
        bx = { modelId: model, config: { enabled: !!cfg, count: cfg?.count || 2, names: [] }, mine: (mine.get(model) || []).map((i) => i + 1), perBox };
      }
      const allReply = Object.entries(perCreator).filter(([k]) => !hidden.includes(k)).reduce((a, [, n]) => a + n, 0);
      send(res, 200, {
        items,
        counts: perCreator,
        // « À reprendre » (fans sans IA qui attendent) par créatrice : pour l'Accueil.
        handoffCounts: manualPerCreator,
        allReply,
        totals: { reply: counts.reply, unread: counts.unread, all: counts.all, newSubs: counts.new, relances: counts.relance, pinned: counts.pinned, pinnedReply: counts.pinnedReply, online: counts.active, handoff: counts.manual },
        boxes: bx,
        hidden,
      });
    }],

    // ---------------------------------------------------------------- une conversation
    ['GET', /^\/api\/rv\/conversations\/([^/]+)$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      const c = await chatOf(x.cid, x.fanId);
      const m = metaOf(x.cid, x.fanId);
      const sentBy = Object.fromEntries(all('SELECT s.message_id, u.name FROM sent_log s JOIN users u ON u.id = s.user_id WHERE s.creator_id = ? AND s.fan_id = ? AND s.message_id IS NOT NULL', x.cid, x.fanId).map((r) => [r.message_id, r.name]));
      const firstName = /^\s*pr[ée]nom\s*:\s*(.+)$/im.exec(m?.notes || '')?.[1]?.trim().slice(0, 40) || null;
      send(res, 200, { conversation: convOf(x.cid, c, m), sentBy, firstName });
    }],
    ['GET', /^\/api\/rv\/conversations\/([^/]+)\/messages$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      const cursor = new URL(req.url, 'http://x').searchParams.get('cursor') || undefined;
      const c = inboxChat(x.cid, x.fanId);
      const r = await substy.messages(x.cid, x.fanId, { limit: 30, cursor });
      const logs = all('SELECT s.text, s.at, s.message_id, u.name FROM sent_log s JOIN users u ON u.id = s.user_id WHERE s.creator_id = ? AND s.fan_id = ? ORDER BY s.at DESC LIMIT 200', x.cid, x.fanId);
      const who = (m) => {
        if (!m.isSentByCreator) return null;
        const at = Date.parse(m.createdAt);
        return logs.find((l) => l.message_id === String(m.id) || (l.text.trim() === plain(m.text) && Math.abs(l.at - at) < 90000))?.name || null;
      };
      const views = (r?.items || []).map((m) => messageView(m, who(m)));
      const sentBy = Object.fromEntries(views.filter((v) => v.by?.kind === 'bloom').map((v) => [String(v.id), v.by.name]));
      const data = views.map((v) => liveMsg(v, x.fanId, c?.name || 'Fan'));
      data.sort((a, b) => Date.parse(b.message.createdAt) - Date.parse(a.message.createdAt));
      // Lu par le fan : notre dernier message marqué lu.
      const readAt = views.filter((v) => !v.fromFan && v.read).map((v) => v.at).sort().pop() || null;
      send(res, 200, { data, pageInfo: r?.nextCursor ? { hasNextPage: true, endCursor: r.nextCursor } : { hasNextPage: false, endCursor: '' }, memberLastReadAt: readAt, sentBy });
    }],
    ['POST', /^\/api\/rv\/conversations\/([^/]+)\/send$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      const b = await body(req);
      const message = String(b.content || '').slice(0, 5000);
      const medias = Array.isArray(b.mediaIds) ? b.mediaIds.map(String).slice(0, 50) : [];
      const price = Number(b.price) > 0 ? Math.round(Number(b.price)) / 100 : 0;
      if (!message.trim() && !medias.length) return send(res, 400, { error: 'Message vide' });
      if (price && !medias.length) return send(res, 400, { error: 'Un PPV a besoin d’au moins un média' });
      if (message.trim()) {
        const v = await substy.validate(message).catch(() => null);
        const bad = v && (v.valid === false || v.isValid === false || (Array.isArray(v.bannedWords) && v.bannedWords.length) || (Array.isArray(v.matches) && v.matches.length));
        if (bad) return send(res, 400, { error: 'Mot interdit dans le message', warning: { detected: (v.bannedWords || v.matches || []).map((w) => String(w.word || w)) } });
      }
      const c = inboxChat(x.cid, x.fanId);
      const waitedMs = c?.last && !c.last.fromCreator ? Date.now() - Date.parse(c.last.at) : null;
      const lib = libItemOf(x.cid, b.scriptId);
      run('INSERT INTO sent_log (user_id, creator_id, fan_id, text, price, at, lib_item) VALUES (?, ?, ?, ?, ?, ?, ?)', x.u.id, x.cid, x.fanId, message, price, Date.now(), lib);
      run('UPDATE fan_meta SET unread = 0 WHERE creator_id = ? AND fan_id = ?', x.cid, x.fanId);
      locks.delete(convId(x.cid, x.fanId));
      const r = await substy.send(x.cid, x.fanId, { message, medias, price: price || undefined, replyId: b.replyToId || null });
      send(res, 200, { message: { id: String(r?.id || r?.message?.id || r?.messageId || `sent-${Date.now()}`) }, waitedMs });
    }],
    ['POST', /^\/api\/rv\/conversations\/([^/]+)\/action$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      const b = await body(req);
      const key = convId(x.cid, x.fanId);
      switch (b.action) {
        // Épingler = reprendre le fan : en hybride, l'IA est coupée sur lui (rallumée quand on le désépingle).
        case 'pin': {
          const ai = await pinFan(substy, x.u, x.cid, x.fanId, !!b.pin);
          return send(res, 200, { pinned: !!b.pin, ai });
        }
        case 'read': {
          const c = inboxChat(x.cid, x.fanId);
          setMeta(x.cid, x.fanId, 'seen_id = ?, unread = 0', c?.last?.id || null);
          return send(res, 200, { ok: true });
        }
        case 'unread':
          setMeta(x.cid, x.fanId, 'unread = 1, seen_id = NULL');
          return send(res, 200, { ok: true });
        case 'lock': {
          const l = lockOf(key);
          if (l && l.userId !== x.u.id) return send(res, 200, { ok: false, lock: { name: l.name } });
          locks.set(key, { userId: x.u.id, name: x.u.name, until: Date.now() + 90_000 });
          // Ouvert par l'équipe : le dernier message n'est plus « frais ».
          const c = inboxChat(x.cid, x.fanId);
          if (c?.last?.id) setMeta(x.cid, x.fanId, 'seen_id = ?', c.last.id);
          return send(res, 200, { ok: true });
        }
        case 'unlock':
          if (lockOf(key)?.userId === x.u.id) locks.delete(key);
          return send(res, 200, { ok: true });
        case 'typing':
          return send(res, 200, { ok: true });
        case 'nickname': {
          const n = String(b.nickname || '').trim().slice(0, 60) || null;
          setMeta(x.cid, x.fanId, 'nickname = ?', n);
          return send(res, 200, { nickname: n });
        }
        case 'badge':
          setMeta(x.cid, x.fanId, 'badge_icon = ?, badge_label = ?', b.icon || null, b.label ? String(b.label).slice(0, 30) : null);
          return send(res, 200, { badge: { icon: b.icon || null, label: b.label || null } });
        case 'crm': {
          const tags = [...new Set((Array.isArray(b.crmTags) ? b.crmTags : []).map((t) => String(t).trim().replace(/,/g, ' ').slice(0, 30)).filter(Boolean))].slice(0, 20);
          setMeta(x.cid, x.fanId, 'tags = ?', tags.join(','));
          return send(res, 200, { ok: true });
        }
        case 'reveal-note':
          return send(res, 200, { ok: true });
        // En plus de Raven : couper / rallumer l'IA de Substy sur ce fan.
        case 'ai':
          await substy.setAi(x.cid, x.fanId, !!b.on);
          return send(res, 200, { ai: !!b.on });
        default:
          return send(res, 400, { error: 'Action inconnue' });
      }
    }],
    ['POST', /^\/api\/rv\/conversations\/([^/]+)\/messages\/([^/]+)$/, async (req, res) => send(res, 400, { error: 'Les réactions ne passent pas par Substy pour l’instant.' })],
    ['DELETE', /^\/api\/rv\/conversations\/([^/]+)\/messages\/([^/]+)$/, async (req, res) => send(res, 400, { error: 'Supprimer un message n’est pas encore possible via Substy.' })],
    ['POST', /^\/api\/rv\/conversations\/([^/]+)\/watch$/, async (req, res) => send(res, 200, { ok: true })],
    ['POST', /^\/api\/rv\/conversations\/([^/]+)\/sequence$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      const b = await body(req);
      const sid = Number(b.sequenceId);
      if (!sid) return send(res, 400, { error: 'Séquence manquante' });
      if (b.active) run('UPDATE seq_progress SET active = 0 WHERE creator_id = ? AND fan_id = ?', x.cid, x.fanId);
      run('INSERT INTO seq_progress (creator_id, fan_id, sequence_id, step, active, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(creator_id, fan_id, sequence_id) DO UPDATE SET step = excluded.step, active = excluded.active, updated_at = excluded.updated_at', x.cid, x.fanId, sid, Math.max(0, Number(b.step) || 0), b.active ? 1 : 0, Date.now());
      send(res, 200, { ok: true });
    }],

    // ---------------------------------------------------------------- fiche du fan
    // Bloc « Substy » de la fiche : IA sur ce fan, ventes faites par l'IA, scripts de Substy envoyés (étapes, achats).
    ['GET', /^\/api\/rv\/conversations\/([^/]+)\/substy$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      const [f, list, msgs] = await Promise.all([
        substy.fan(x.cid, x.fanId).catch(() => null),
        substy.fanScripts(x.cid, x.fanId).catch(() => []),
        substy.messages(x.cid, x.fanId, { limit: 30 }).catch(() => null),
      ]);
      // Dernier envoi de chaque script : Substy ne le donne pas, on le lit sur les messages récents (ils portent leur script).
      const lastBy = new Map();
      for (const m of msgs?.items || []) {
        const sid = m.script?.id;
        if (sid && (!lastBy.has(sid) || Date.parse(m.createdAt) > Date.parse(lastBy.get(sid)))) lastBy.set(sid, m.createdAt);
      }
      const scripts = (list || [])
        .map((sc) => {
          const steps = (sc.templates || [])
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((t, i) => ({
              id: t.id,
              index: i,
              name: plain(t.name) || `Étape ${i + 1}`,
              text: plain(t.content),
              price: cents(t.price),
              medias: (t.medias || []).length,
              sent: !!t.alreadySent,
              bought: /paid|purchas|bought|unlock/i.test(String(t.purchaseState?.status || '')),
            }));
          const sent = steps.filter((s) => s.sent).length;
          const lastAt = lastBy.get(sc.id) || null;
          return {
            id: sc.id,
            name: plain(sc.name),
            total: steps.length,
            sent,
            bought: steps.filter((s) => s.bought).length,
            lastAt,
            status: sent >= steps.length && steps.length ? 'done' : lastAt && Date.now() - Date.parse(lastAt) < 48 * 3600_000 ? 'active' : 'paused',
            steps,
          };
        })
        .filter((s) => s.sent > 0)
        .sort((a, b) => (Date.parse(b.lastAt || 0) || 0) - (Date.parse(a.lastAt || 0) || 0));
      // Ventes de l'IA à ce fan (PPV envoyés par l'IA de Substy puis achetés), vues par Bloom.
      const sale = one(
        `SELECT COUNT(*) AS n, COALESCE(SUM(l.gross), 0) AS gross, MAX(l.currency) AS currency FROM rv_live l JOIN msg_log m ON m.id = l.message_id WHERE l.creator_id = ? AND l.fan_id = ? AND m.kind = 'ai'`,
        x.cid,
        x.fanId,
      );
      send(res, 200, { ai: !!f?.aiEnabled, sales: { amount: sale?.gross || 0, count: sale?.n || 0 }, scripts });
    }],
    ['GET', /^\/api\/rv\/conversations\/([^/]+)\/fan$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      const f = (await substy.fan(x.cid, x.fanId).catch(() => null)) || {};
      const m = metaOf(x.cid, x.fanId);
      const mon = (p) => (p == null ? 0 : typeof p === 'object' ? p.minor || 0 : cents(p));
      const sb = f.spendBreakdown || {};
      send(res, 200, {
        stats: {
          firstSubscriptionAt: f.subscription?.subscribedAt || undefined,
          totalSpent: mon(f.spend?.net),
          tipsTotal: mon(sb.tips),
          lastPaidAt: f.spend?.lastPurchaseAt || undefined,
          subscriptionExpireAt: f.subscription?.renewsAt || f.subscription?.expiresAt || undefined,
          autoRenew: f.subscription ? !f.subscription.isCanceledAtPeriodEnd : undefined,
        },
        platformSpent: null,
        insights: null,
        profile: { notes: m?.notes || '' },
        // Messages Pro : listes OnlyFans du fan (si Substy les donne) et prix de son abonnement.
        lists: (Array.isArray(f.lists) ? f.lists : Array.isArray(f.fanLists) ? f.fanLists : []).map((l) => String(l?.name ?? l)).filter(Boolean).slice(0, 30),
        subscriptionPrice: f.subscription?.price ?? null,
        profileUpdated: m?.notes_at ? { at: m.notes_at, by: m.notes_by || null } : null,
      });
    }],
    ['PUT', /^\/api\/rv\/conversations\/([^/]+)\/fan$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      const b = await body(req);
      setMeta(x.cid, x.fanId, 'notes = ?, notes_by = ?, notes_at = ?', String(b.profile?.notes ?? '').slice(0, 5000), x.u.name, Date.now());
      send(res, 200, { ok: true });
    }],
    ['POST', /^\/api\/rv\/conversations\/([^/]+)\/history$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      const r = one('SELECT SUM(from_fan = 1) AS fan, SUM(from_fan = 0) AS us, MIN(at) AS first, SUM(from_fan = 0 AND price > 0) AS ppv FROM msg_log WHERE creator_id = ? AND fan_id = ?', x.cid, x.fanId) || {};
      send(res, 200, { complete: false, fanMessages: r.fan || 0, ourMessages: r.us || 0, firstMessageAt: iso(r.first), ppvSent: r.ppv || 0, ppvPaid: 0, ppvTotal: r.ppv || 0, ppv: [], tips: [] });
    }],
    ['POST', /^\/api\/rv\/conversations\/([^/]+)\/erase$/, async (req, res) => send(res, 400, { error: 'Pas disponible avec Substy.' })],
    ['GET', /^\/api\/rv\/conversations\/([^/]+)\/scripts$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      const lib = libOf(x.cid, x.fanId);
      const byId = new Map(lib.scripts.map((s) => [s.id, s]));
      const scripts = lib.sequences
        .map((q) => {
          const steps = q.steps.map((sid, i) => {
            const s = byId.get(sid);
            return { index: i, id: sid, title: s?.title || '', content: s?.content || '', note: s?.note || null, price: s?.price ?? null, medias: s?.medias || [], sent: !!s?.usedWithFan, sentAt: s?.usedWithFan || null };
          });
          const sent = steps.filter((s) => s.sent);
          const lastAt = sent.map((s) => s.sentAt).sort().pop() || null;
          return { id: q.id, title: q.title, folder: q.folder, isSequence: q.isSequence, total: steps.length, sent: sent.length, lastAt, status: sent.length >= steps.length ? 'done' : lastAt && Date.now() - Date.parse(lastAt) < 48 * 3600_000 ? 'active' : 'paused', steps };
        })
        .filter((s) => s.sent);
      send(res, 200, { scripts });
    }],
    ['GET', /^\/api\/rv\/conversations\/([^/]+)\/free-medias$/, async (req, res, id) => (conv(req, res, decodeURIComponent(id)) ? send(res, 200, { items: [] }) : null)],
    ['GET', /^\/api\/rv\/conversations\/([^/]+)\/ppv$/, async (req, res, id) => {
      const x = conv(req, res, decodeURIComponent(id));
      if (!x) return;
      // PPV envoyés à ce fan vus par Bloom, payés ou non (vente Substy liée au message).
      const rows = all(
        `SELECT m.id, m.at, m.price, m.medias, m.by_name, (SELECT COUNT(*) FROM rv_live l WHERE l.message_id = m.id) AS paid FROM msg_log m WHERE m.creator_id = ? AND m.fan_id = ? AND m.from_fan = 0 AND m.price > 0 ORDER BY m.at DESC LIMIT 100`,
        x.cid,
        x.fanId,
      );
      const bundles = rows.map((r) => ({ id: r.id, price: cents(r.price), isPaid: !!r.paid, createdAt: iso(r.at), massDM: false, content: null, author: r.by_name || null, medias: [] }));
      const paid = bundles.filter((b) => b.isPaid).length;
      const prices = bundles.map((b) => b.price);
      send(res, 200, { buyRate: bundles.length ? { purchased: paid, total: bundles.length, percentage: Math.round((paid / bundles.length) * 100) } : null, highestPrice: prices.length ? Math.max(...prices) : null, lowestPrice: prices.length ? Math.min(...prices) : null, bundles });
    }],

    // ---------------------------------------------------------------- créatrice : scripts, fiche, vault, boîtes
    ['GET', /^\/api\/rv\/models\/([^/]+)\/library$/, async (req, res, mid) => {
      const u = me(req, res);
      if (!u) return;
      if (!canSee(u, mid)) return send(res, 403, { error: 'Pas ta créatrice' });
      const id = new URL(req.url, 'http://x').searchParams.get('conv');
      const [cid, fanId] = id ? cid_(id) : [null, null];
      send(res, 200, { ...libOf(mid, cid === mid ? fanId : null), canEdit: isBoss(u) });
    }],
    ['GET', /^\/api\/rv\/models\/([^/]+)\/profile$/, async (req, res, mid) => {
      const u = me(req, res);
      if (!u) return;
      if (!canSee(u, mid)) return send(res, 403, { error: 'Pas ta créatrice' });
      const p = one('SELECT * FROM creator_profile WHERE creator_id = ?', mid);
      send(res, 200, { profile: { sheet: p?.sheet || '' }, updated: p?.updated_at ? { at: p.updated_at, by: p.updated_by || null } : null, canEdit: isBoss(u) });
    }],
    ['PUT', /^\/api\/rv\/models\/([^/]+)\/profile$/, async (req, res, mid) => {
      const u = me(req, res);
      if (!u) return;
      if (!isBoss(u) || !canSee(u, mid)) return send(res, 403, { error: 'Réservé aux managers' });
      const b = await body(req);
      run('INSERT INTO creator_profile (creator_id, sheet, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(creator_id) DO UPDATE SET sheet = excluded.sheet, updated_at = excluded.updated_at, updated_by = excluded.updated_by', mid, String(b.profile?.sheet ?? '').slice(0, 20000), Date.now(), u.name);
      send(res, 200, { ok: true });
    }],
    ['GET', /^\/api\/rv\/models\/([^/]+)\/folders$/, async (req, res, mid) => {
      const u = me(req, res);
      if (!u) return;
      if (!canSee(u, mid)) return send(res, 403, { error: 'Pas ta créatrice' });
      const r = await substy.vaultLists(mid);
      send(res, 200, (r?.lists || []).map((l) => ({ id: l.id, name: l.name, imageCount: l.photosCount || 0, videoCount: l.videosCount || 0 })));
    }],
    ['GET', /^\/api\/rv\/models\/([^/]+)\/vault$/, async (req, res, mid) => {
      const u = me(req, res);
      if (!u) return;
      if (!canSee(u, mid)) return send(res, 403, { error: 'Pas ta créatrice' });
      const p = new URL(req.url, 'http://x').searchParams;
      const r = await substy.vaultMedias(mid, { listId: p.get('folder') || undefined, cursor: p.get('cursor') || undefined });
      const type = p.get('type');
      const data = (r?.medias || []).map((m) => rvMedia(mediaView(m))).filter((m) => !type || type === 'all' || (type === 'image' ? m.type === 'photo' : m.type === type));
      send(res, 200, { data, pageInfo: { hasNextPage: !!r?.hasMore, endCursor: r?.nextCursor || '' }, totalCount: r?.total ?? data.length });
    }],
    ['GET', /^\/api\/rv\/models\/([^/]+)\/boxes$/, async (req, res, mid) => {
      const u = me(req, res);
      if (!u) return;
      if (!canSee(u, mid)) return send(res, 403, { error: 'Pas ta créatrice' });
      const p = new URL(req.url, 'http://x').searchParams;
      const count = Math.min(20, Math.max(2, Number(p.get('count')) || 2));
      const w = Number(p.get('window'));
      const metas = metaMap([mid]);
      const now = Date.now();
      const chats = [...inboxChats(mid).chats];
      const list = chats.filter((c) => waiting(c, metas.get(`${mid}:${c.fanId}`)) && (!(w > 0) || Date.parse(c.last?.at || 0) >= now - w * 3600_000));
      const per = Array.from({ length: count }, (_, i) => ({ box: i + 1, fans: 0, reply: 0 }));
      for (const b of balanced(list, count).values()) (per[b].reply++, per[b].fans++);
      send(res, 200, { boxes: per });
    }],
    ['PUT', /^\/api\/rv\/models\/([^/]+)\/boxes$/, async (req, res, mid) => {
      const u = me(req, res);
      if (!u) return;
      if (!isBoss(u) || !canSee(u, mid)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' });
      const b = await body(req);
      const count = b.enabled ? Math.min(20, Math.max(2, Number(b.count) || 2)) : 0;
      run('INSERT INTO creator_boxes (creator_id, count, names, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(creator_id) DO UPDATE SET count = excluded.count, updated_at = excluded.updated_at', mid, count, '[]', Date.now());
      send(res, 200, { ok: true });
    }],
    ['POST', /^\/api\/rv\/models\/([^/]+)\/boxes$/, async (req, res, mid) => {
      const u = me(req, res);
      if (!u) return;
      if (!canSee(u, mid)) return send(res, 403, { error: 'Pas ta créatrice' });
      const b = await body(req);
      const boxes = [...new Set((Array.isArray(b.boxes) ? b.boxes : []).map(Number).filter((i) => Number.isInteger(i) && i >= 1 && i <= 20))].sort((a, c) => a - c).map((i) => i - 1);
      run('INSERT INTO user_boxes (user_id, creator_id, boxes) VALUES (?, ?, ?) ON CONFLICT(user_id, creator_id) DO UPDATE SET boxes = excluded.boxes', u.id, mid, JSON.stringify(boxes));
      send(res, 200, { ok: true });
    }],

    // ---------------------------------------------------------------- cloche : ventes, pourboires, abonnements
    ['GET', /^\/api\/rv\/notifications$/, async (req, res) => {
      const u = me(req, res);
      if (!u) return;
      const p = new URL(req.url, 'http://x').searchParams;
      const model = p.get('model');
      const list = creators().filter((c) => canSee(u, c.id) && (!model || c.id === model));
      const before = p.get('before') ? Date.parse(p.get('before')) : Date.now();
      const r = revenue({ from: parisDay(before - 7 * 864e5), to: parisDay(before), creators: list });
      const kindOf = (t) => (t === 'ppv' || t === 'post' ? 'sale' : t === 'tip' ? 'tip' : t === 'sub' ? 'sub' : 'other');
      const kind = p.get('kind') || 'all';
      const items = r.recent
        .filter((s) => Date.parse(s.at) < before)
        .map((s) => ({ id: s.id, at: s.at, kind: kindOf(s.type), amount: s.net, modelId: s.creatorId, fan: s.fan || null, convId: s.fanId ? convId(s.creatorId, s.fanId) : null, chatter: s.by || null }))
        .filter((n) => kind === 'all' || n.kind === kind || (kind === 'sales' && n.kind === 'sale') || (kind === 'tips' && n.kind === 'tip') || (kind === 'subs' && n.kind === 'sub'));
      send(res, 200, { items });
    }],
  ];

  /** Appelé par le serveur pour toute adresse « /api/rv/… ». */
  return async function handle(req, res, path) {
    for (const [m, re, fn] of R) {
      if (m !== req.method) continue;
      const hit = re.exec(path);
      if (hit) return void (await fn(req, res, ...hit.slice(1)));
    }
    send(res, 404, { error: 'Introuvable' });
  };
}
