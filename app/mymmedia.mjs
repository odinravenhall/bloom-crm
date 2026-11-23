// MYM → Médias : Liste d'amis, Feed et Planification (copie de MyPulse), en direct avec le compte MYM relié (mym.mjs).
// Relevé le 23/11/2026 sur creators.mym.fans :
//  - Amies (styx) : GET /v1/creators/me/friends → { data: [{ username, display_name, avatar_url, available }], count } ;
//    POST /v1/creators/me/friends { username } ; DELETE /v1/creators/me/friends/<pseudo> ; PUT { usernames: [...] } (ordre).
//    12 amies au plus par compte.
//  - Feed (site) : GET /app/ajax/profile/feed?page=N → HTML, 21 posts par page (« data-media-id », classes
//    « media--video », « media--locked » = privé) ; détail d'un post : GET /app/api/posts/<id> → { data: { type, comment,
//    is_public, publishedAt, likes: { count }, viewers: { count }, duration, image } }.
//  - mym.cloud (styx) : GET /v1/cloud?perPage=20&status=ready&type=photo|video&offset=<base64 {"page","perPage"}> →
//    { data: [{ id, preview, url, type, used_in_public_post, used_in_private_post }], meta: { total, total_pages } }.
//  - Publier un post (styx, format lu dans le site, PAS encore vérifié sur un vrai envoi) :
//    POST /v1/posts { medias: [idCloud], caption, private, playlists: [], thirdPartyConsent: false }.
// La planification est gardée par Bloom (`mym_plan`) : Bloom publie à l'heure prévue. Jamais deux fois : la ligne passe
// en « publishing » avant l'appel, et un échec n'est jamais retenté tout seul.
// Pas encore fait : stories, « passer en privé après N h », import Excel, suivi des listes d'amis.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { all, db, one, run } from './store.mjs';
import { canSee, isBoss, seesAll } from './team.mjs';
import { STYX, isLinked, mym, mymSite } from './mym.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS mym_feed (
    creator_id TEXT NOT NULL, post_id TEXT NOT NULL, type TEXT, is_public INTEGER NOT NULL DEFAULT 0, caption TEXT, published_at INTEGER,
    likes INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, duration TEXT, thumb TEXT, thumb_exp INTEGER, pos INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL, PRIMARY KEY (creator_id, post_id)
  );
  CREATE TABLE IF NOT EXISTS mym_feed_sync (creator_id TEXT PRIMARY KEY, synced_at INTEGER, error TEXT);
  CREATE TABLE IF NOT EXISTS mym_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'feed', at INTEGER NOT NULL, visibility TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '', media_id TEXT NOT NULL, media_type TEXT, status TEXT NOT NULL DEFAULT 'planned', mym_post_id TEXT, error TEXT,
    created_by TEXT, created_at INTEGER NOT NULL, done_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS mym_plan_due ON mym_plan (status, at);
`);

// Vignettes gardées par Bloom : les adresses d'images de MYM sont signées et expirent au bout d'une heure, alors un
// média choisi dans un script garde une petite copie de sa vignette (data/mymthumbs), servie par /api/mym/cloud/thumb.
db.exec('CREATE TABLE IF NOT EXISTS mym_thumbs (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, mime TEXT NOT NULL, at INTEGER NOT NULL)');
const THUMBS = `${process.env.DATA_DIR || '/data'}/mymthumbs`;
mkdirSync(THUMBS, { recursive: true });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cloudItem = (m) => ({ id: String(m.id), type: /video/i.test(m.type || '') ? 'video' : /audio/i.test(m.type || m.mime_type || '') ? 'audio' : 'photo', thumb: m.preview || m.url || null, full: m.url || null, duration: Number(m.duration) || null, usedPublic: !!m.used_in_public_post, usedPrivate: !!m.used_in_private_post });

const FRIENDS_MAX = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => String(s || '').trim().replace(/^@/, '');

// ---------------------------------------------------------------- amies
const friendCache = new Map();
async function friendsOf(cid, fresh = false) {
  const hit = friendCache.get(cid);
  if (!fresh && hit && Date.now() - hit.at < 2 * 60_000) return hit.v;
  const d = await mym(cid, '/v1/creators/me/friends', { base: STYX });
  const v = (d?.data || []).map((f) => ({ username: f.username || '', displayName: f.display_name || f.username || '', avatar: f.avatar_url || null, available: f.available !== false }));
  friendCache.set(cid, { at: Date.now(), v });
  return v;
}

// ---------------------------------------------------------------- feed
const syncing = new Map(); // creatorId -> { done, total }
const expOf = (url) => (Number(/[?&]Expires=(\d+)/.exec(url || '')?.[1]) || 0) * 1000 || null;

function saveDetail(cid, id, d, pos) {
  const at = Date.parse(d.publishedAt || d.published_at || d.createdAt || '') || null;
  const thumb = d.image || d.url || null;
  run(
    `INSERT INTO mym_feed (creator_id, post_id, type, is_public, caption, published_at, likes, views, duration, thumb, thumb_exp, pos, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (creator_id, post_id) DO UPDATE SET type = excluded.type, is_public = excluded.is_public, caption = excluded.caption, published_at = excluded.published_at, likes = excluded.likes,
       views = excluded.views, duration = excluded.duration, thumb = excluded.thumb, thumb_exp = excluded.thumb_exp, pos = excluded.pos, updated_at = excluded.updated_at`,
    cid, String(id), /video/i.test(d.type || '') ? 'video' : 'photo', d.is_public ? 1 : 0, String(d.comment || ''), at, Number(d.likes?.count) || 0, Number(d.viewers?.count) || 0,
    d.duration ? String(d.duration) : null, thumb, expOf(thumb), pos, Date.now(),
  );
}

/** Relit tout le feed d'une modèle chez MYM (liste puis détail de chaque post), doucement. */
function syncFeed(cid) {
  if (syncing.has(cid)) return;
  const st = { done: 0, total: 0 };
  syncing.set(cid, st);
  (async () => {
    try {
      const ids = [];
      for (let page = 1; page <= 80; page++) {
        const html = String(await mymSite(cid, `/app/ajax/profile/feed?page=${page}`));
        const found = [...html.matchAll(/data-media-id="(\d+)"/g)].map((m) => m[1]).filter((id) => !ids.includes(id));
        if (!found.length) break;
        ids.push(...found);
        st.total = ids.length;
        await sleep(300);
      }
      for (let i = 0; i < ids.length; i++) {
        const r = await mymSite(cid, `/app/api/posts/${ids[i]}`).catch(() => null);
        if (r?.data) saveDetail(cid, ids[i], r.data, i);
        st.done = i + 1;
        await sleep(250);
      }
      // Posts supprimés chez MYM : on les retire (seulement si la liste a bien été lue).
      if (ids.length) for (const row of all('SELECT post_id FROM mym_feed WHERE creator_id = ?', cid)) if (!ids.includes(row.post_id)) run('DELETE FROM mym_feed WHERE creator_id = ? AND post_id = ?', cid, row.post_id);
      run('INSERT INTO mym_feed_sync (creator_id, synced_at, error) VALUES (?, ?, NULL) ON CONFLICT (creator_id) DO UPDATE SET synced_at = excluded.synced_at, error = NULL', cid, Date.now());
    } catch (e) {
      run('INSERT INTO mym_feed_sync (creator_id, synced_at, error) VALUES (?, NULL, ?) ON CONFLICT (creator_id) DO UPDATE SET error = excluded.error', cid, e.message);
    } finally {
      syncing.delete(cid);
    }
  })();
}

// ---------------------------------------------------------------- planification
const LATE_MAX = 30 * 60_000;
const planView = (p) => ({ id: p.id, creatorId: p.creator_id, kind: p.kind, at: p.at, visibility: p.visibility, caption: p.caption, mediaId: p.media_id, mediaType: p.media_type, status: p.status, error: p.error, createdBy: p.created_by, createdAt: p.created_at, doneAt: p.done_at });

async function publishDue() {
  const due = all("SELECT * FROM mym_plan WHERE status = 'planned' AND at <= ? ORDER BY at LIMIT 5", Date.now());
  for (const p of due) {
    if (Date.now() - p.at > LATE_MAX) {
      run("UPDATE mym_plan SET status = 'failed', error = ?, done_at = ? WHERE id = ?", 'Heure dépassée de plus de 30 min (Bloom était arrêté) : rien n’a été publié.', Date.now(), p.id);
      continue;
    }
    // « publishing » d'abord : si Bloom s'arrête pendant l'appel, la ligne ne repartira pas une deuxième fois.
    if (!run("UPDATE mym_plan SET status = 'publishing' WHERE id = ? AND status = 'planned'", p.id).changes) continue;
    try {
      const r = await mym(p.creator_id, '/v1/posts', { method: 'POST', base: STYX, body: { medias: [p.media_id], caption: p.caption, private: p.visibility === 'private', playlists: [], thirdPartyConsent: false } });
      const pid = r?.id ?? r?.data?.id ?? r?.post?.id ?? null;
      run("UPDATE mym_plan SET status = 'created', mym_post_id = ?, error = NULL, done_at = ? WHERE id = ?", pid ? String(pid) : null, Date.now(), p.id);
    } catch (e) {
      run("UPDATE mym_plan SET status = 'failed', error = ?, done_at = ? WHERE id = ?", String(e.message).slice(0, 300), Date.now(), p.id);
    }
  }
}
// Une ligne restée « publishing » (Bloom arrêté en plein envoi) : on ne sait pas si MYM l'a publiée → à vérifier à la main.
run("UPDATE mym_plan SET status = 'failed', error = ?, done_at = ? WHERE status = 'publishing'", 'Bloom a redémarré pendant l’envoi : vérifie sur MYM si le post est parti avant de le replanifier.', Date.now());
setInterval(() => publishDue().catch(() => {}), 20_000);

export function mymMediaRoutes({ userFrom, send, body, creators }) {
  const nick = () => new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [m.creator_id, m.nickname]));
  /** Modèles MYM que la personne voit, avec leur nom Bloom. */
  const mine = (u) => {
    const n = nick();
    const mymName = new Map(all('SELECT creator_id, username FROM mym_links').map((l) => [l.creator_id, l.username]));
    return creators().filter((c) => /mym/i.test(c.platform || '') && canSee({ ...u, pf: null }, c.id)).map((c) => ({ id: c.id, name: n.get(c.id) || c.name, username: mymName.get(c.id) || c.username || null, avatar: c.avatar || null, linked: isLinked(c.id) }));
  };
  const who = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' }), null;
    return u;
  };
  /** La modèle demandée, si la personne la voit et si son compte MYM est relié. */
  const pick = (u, res, cid) => {
    const c = mine(u).find((x) => x.id === String(cid || ''));
    if (!c) return send(res, 404, { error: 'Modèle MYM inconnue' }), null;
    if (!c.linked) return send(res, 409, { error: `Le compte MYM de ${c.name} n’est pas relié à Bloom (MYM → Compte Creator → « Relier à MYM »).` }), null;
    return c;
  };
  const q = (req) => new URL(req.url, 'http://x').searchParams;

  return {
    // ------------------------------------------------------------ amies
    /** Liste d'amis de chaque modèle MYM reliée. */
    'GET /api/mym/friends': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      const fresh = q(req).get('fresh') === '1';
      const accounts = await Promise.all(
        mine(u).map(async (c) => {
          if (!c.linked) return { ...c, friends: [], error: 'Compte MYM pas relié à Bloom' };
          try {
            return { ...c, friends: await friendsOf(c.id, fresh), error: null };
          } catch (e) {
            return { ...c, friends: [], error: e.message };
          }
        }),
      );
      send(res, 200, { canEdit: seesAll(u), max: FRIENDS_MAX, accounts });
    },
    /** Ajouter des amies sur des comptes (une par une, jamais la modèle chez elle-même, 12 au plus). */
    'POST /api/mym/friends/add': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      const b = await body(req);
      const names = [...new Set((b.usernames || []).map(clean).filter(Boolean))].slice(0, 40);
      const targets = mine(u).filter((c) => c.linked && (b.creatorIds || []).includes(c.id));
      if (!names.length || !targets.length) return send(res, 400, { error: 'Choisis au moins une amie et un compte.' });
      const results = [];
      for (const c of targets) {
        let cur;
        try {
          cur = await friendsOf(c.id, true);
        } catch (e) {
          results.push({ creatorId: c.id, account: c.name, username: null, ok: false, error: e.message });
          continue;
        }
        const have = new Set(cur.map((f) => f.username.toLowerCase()));
        let count = cur.length;
        for (const name of names) {
          const row = { creatorId: c.id, account: c.name, username: name };
          if (name.toLowerCase() === String(c.username || '').toLowerCase()) results.push({ ...row, ok: false, skipped: true, error: 'C’est elle-même' });
          else if (have.has(name.toLowerCase())) results.push({ ...row, ok: true, skipped: true, error: 'Déjà dans la liste' });
          else if (count >= FRIENDS_MAX) results.push({ ...row, ok: false, error: `Liste pleine (${FRIENDS_MAX} amies)` });
          else {
            try {
              await mym(c.id, '/v1/creators/me/friends', { method: 'POST', base: STYX, body: { username: name } });
              count++;
              have.add(name.toLowerCase());
              results.push({ ...row, ok: true });
            } catch (e) {
              results.push({ ...row, ok: false, error: e.status === 404 ? 'Pseudo MYM introuvable' : e.message });
            }
            await sleep(250);
          }
        }
        friendCache.delete(c.id);
      }
      send(res, 200, { added: results.filter((r) => r.ok && !r.skipped).length, results });
    },
    /** Retirer des amies de comptes. */
    'POST /api/mym/friends/remove': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      const b = await body(req);
      const names = [...new Set((b.usernames || []).map(clean).filter(Boolean))];
      const targets = mine(u).filter((c) => c.linked && (b.creatorIds || []).includes(c.id));
      if (!names.length || !targets.length) return send(res, 400, { error: 'Rien à retirer.' });
      let removed = 0;
      const errors = [];
      for (const c of targets) {
        const cur = await friendsOf(c.id, true).catch(() => []);
        for (const name of names) {
          const f = cur.find((x) => x.username.toLowerCase() === name.toLowerCase());
          if (!f) continue;
          try {
            await mym(c.id, `/v1/creators/me/friends/${encodeURIComponent(f.username)}`, { method: 'DELETE', base: STYX });
            removed++;
          } catch (e) {
            errors.push(`${c.name} / ${name} : ${e.message}`);
          }
          await sleep(250);
        }
        friendCache.delete(c.id);
      }
      send(res, 200, { removed, errors });
    },
    /** Changer l'ordre des amies d'un compte. */
    'POST /api/mym/friends/order': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      if (!seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      const b = await body(req);
      const c = pick(u, res, b.creatorId);
      if (!c) return;
      try {
        const cur = await friendsOf(c.id, true);
        const want = (b.usernames || []).map(clean);
        // Même liste, autre ordre : on refuse tout ce qui ajouterait ou retirerait quelqu'un.
        if (want.length !== cur.length || cur.some((f) => !want.includes(f.username))) return send(res, 409, { error: 'La liste a changé chez MYM : recharge la page.' });
        await mym(c.id, '/v1/creators/me/friends', { method: 'PUT', base: STYX, body: { usernames: want } });
        friendCache.delete(c.id);
        send(res, 200, { ok: true });
      } catch (e) {
        send(res, 502, { error: e.message });
      }
    },

    // ------------------------------------------------------------ feed
    /** Le feed gardé par Bloom (relu chez MYM avec « Actualiser », ou tout seul après 6 h). */
    'GET /api/mym/feed': (req, res) => {
      const u = who(req, res);
      if (!u) return;
      const c = pick(u, res, q(req).get('creatorId'));
      if (!c) return;
      const sync = one('SELECT synced_at, error FROM mym_feed_sync WHERE creator_id = ?', c.id);
      if (!syncing.has(c.id) && (!sync?.synced_at || Date.now() - sync.synced_at > 6 * 3600_000) && !sync?.error) syncFeed(c.id);
      const items = all('SELECT post_id, type, is_public, caption, published_at, likes, views, duration FROM mym_feed WHERE creator_id = ? ORDER BY published_at DESC, pos', c.id).map((p) => ({
        id: p.post_id, type: p.type, isPublic: !!p.is_public, caption: p.caption || '', publishedAt: p.published_at, likes: p.likes, views: p.views, duration: p.duration || null,
        thumb: `/api/mym/feed/thumb?creatorId=${encodeURIComponent(c.id)}&id=${p.post_id}`,
      }));
      send(res, 200, { items, syncedAt: sync?.synced_at ?? null, error: sync?.error ?? null, syncing: syncing.get(c.id) ?? null });
    },
    'POST /api/mym/feed/refresh': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      const c = pick(u, res, (await body(req)).creatorId);
      if (!c) return;
      syncFeed(c.id);
      send(res, 200, { ok: true });
    },
    /** Vignette d'un post : renvoie vers l'adresse signée de MYM (relue si elle a expiré). */
    'GET /api/mym/feed/thumb': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      const p = q(req);
      const c = pick(u, res, p.get('creatorId'));
      if (!c) return;
      const id = String(p.get('id') || '');
      let row = one('SELECT thumb, thumb_exp, pos FROM mym_feed WHERE creator_id = ? AND post_id = ?', c.id, id);
      if (!row) return send(res, 404, { error: 'Post inconnu' });
      if (!row.thumb || (row.thumb_exp && row.thumb_exp < Date.now() + 60_000)) {
        const r = await mymSite(c.id, `/app/api/posts/${id}`).catch(() => null);
        if (r?.data) saveDetail(c.id, id, r.data, row.pos);
        row = one('SELECT thumb, thumb_exp FROM mym_feed WHERE creator_id = ? AND post_id = ?', c.id, id);
      }
      if (!row?.thumb || !/^https:\/\/[a-z0-9.-]+\.mym\.fans\//i.test(row.thumb)) return send(res, 404, { error: 'Image indisponible' });
      res.writeHead(302, { location: row.thumb, 'cache-control': 'private, max-age=600' });
      res.end();
    },

    // ------------------------------------------------------------ mym.cloud (choix du média à publier)
    // mym.cloud en direct (relevé le 23/11/2026) : mêmes identifiants de médias et de collections que le vault de
    // Substy, donc un média choisi ici s'envoie tel quel depuis le chat.
    //  - collections : GET /v1/cloud/collections?perPage=100 → { data: [{ id, name, items_count, images_count, videos_count }] }
    //  - médias d'une collection : GET /v1/cloud/collections/<id>/items?perPage=30&cursor=<next_cursor> → { data, next_cursor }
    //  - tous les médias : GET /v1/cloud?perPage&status=ready[&type=photo|video]&offset=<base64 {"page","perPage"}>
    //  - vocaux : GET /v1/cloud/audios?perPage&cursor → { data: [{ id, display_name, duration_ms, playback_url }], next_cursor }
    'GET /api/mym/cloud/collections': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      const c = pick(u, res, q(req).get('creatorId'));
      if (!c) return;
      try {
        const d = await mym(c.id, '/v1/cloud/collections?perPage=100', { base: STYX });
        send(res, 200, { collections: (d?.data || d?.collections || []).map((x) => ({ id: String(x.id), name: x.name || '', total: Number(x.items_count ?? x.media_count) || 0, photos: Number(x.images_count) || 0, videos: Number(x.videos_count) || 0 })) });
      } catch (e) {
        send(res, 502, { error: e.message });
      }
    },
    'GET /api/mym/cloud/medias': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      const p = q(req);
      const c = pick(u, res, p.get('creatorId'));
      if (!c) return;
      const type = ['photo', 'video', 'audio'].includes(p.get('type')) ? p.get('type') : '';
      const col = String(p.get('collectionId') || '');
      const cursor = String(p.get('cursor') || '');
      try {
        if (col) {
          if (!UUID.test(col)) return send(res, 400, { error: 'Collection inconnue' });
          const d = await mym(c.id, `/v1/cloud/collections/${col}/items?perPage=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { base: STYX });
          const items = (d?.data || []).map(cloudItem).filter((m) => !type || m.type === type);
          return send(res, 200, { items, nextCursor: d?.next_cursor || null });
        }
        if (type === 'audio') {
          const d = await mym(c.id, `/v1/cloud/audios?perPage=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { base: STYX });
          return send(res, 200, { items: (d?.data || []).map((a) => ({ id: String(a.id), type: 'audio', thumb: null, full: a.playback_url || null, duration: a.duration_ms ? Math.round(a.duration_ms / 1000) : null, name: a.display_name || '', usedPublic: false, usedPrivate: false })), nextCursor: d?.next_cursor || null });
        }
        const page = Math.max(1, Number(cursor) || 1);
        const qs = new URLSearchParams({ perPage: '30', status: 'ready' });
        if (type) qs.set('type', type);
        if (page > 1) qs.set('offset', Buffer.from(JSON.stringify({ page, perPage: 30 })).toString('base64'));
        const d = await mym(c.id, `/v1/cloud?${qs}`, { base: STYX });
        send(res, 200, { items: (d?.data || []).map(cloudItem), nextCursor: page < (Number(d?.meta?.total_pages) || 1) ? String(page + 1) : null });
      } catch (e) {
        send(res, 502, { error: e.message });
      }
    },
    /** Garde une copie des vignettes des médias choisis (adresses MYM signées, valables une heure seulement). */
    'POST /api/mym/cloud/keep': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      const b = await body(req);
      const c = pick(u, res, b.creatorId);
      if (!c) return;
      const out = {};
      for (const m of (Array.isArray(b.medias) ? b.medias : []).slice(0, 10)) {
        const id = String(m.id || '');
        const url = String(m.thumb || '');
        if (!UUID.test(id) || !/^https:\/\/[a-z0-9.-]+\.mym\.fans\//i.test(url)) continue;
        try {
          if (!existsSync(`${THUMBS}/${id}`)) {
            const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
            const mime = r.headers.get('content-type') || '';
            const buf = Buffer.from(await r.arrayBuffer());
            if (!r.ok || !/^image\//.test(mime) || buf.length > 6_000_000) continue;
            writeFileSync(`${THUMBS}/${id}`, buf);
            run('INSERT OR REPLACE INTO mym_thumbs (id, creator_id, mime, at) VALUES (?, ?, ?, ?)', id, c.id, mime.split(';')[0], Date.now());
          }
          out[id] = `/api/mym/cloud/thumb?id=${id}`;
        } catch {}
      }
      send(res, 200, { thumbs: out });
    },
    'GET /api/mym/cloud/thumb': (req, res) => {
      const u = who(req, res);
      if (!u) return;
      const id = String(q(req).get('id') || '');
      const t = UUID.test(id) ? one('SELECT creator_id, mime FROM mym_thumbs WHERE id = ?', id) : null;
      if (!t || !canSee({ ...u, pf: null }, t.creator_id) || !existsSync(`${THUMBS}/${id}`)) return send(res, 404, { error: 'Vignette inconnue' });
      res.writeHead(200, { 'content-type': t.mime, 'cache-control': 'private, max-age=604800' });
      res.end(readFileSync(`${THUMBS}/${id}`));
    },
    'GET /api/mym/cloud': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      const p = q(req);
      const c = pick(u, res, p.get('creatorId'));
      if (!c) return;
      const page = Math.max(1, Number(p.get('page')) || 1);
      const type = p.get('type') === 'video' ? 'video' : 'photo';
      const qs = new URLSearchParams({ perPage: '24', status: 'ready', type });
      if (page > 1) qs.set('offset', Buffer.from(JSON.stringify({ page, perPage: 24 })).toString('base64'));
      try {
        const d = await mym(c.id, `/v1/cloud?${qs}`, { base: STYX });
        send(res, 200, {
          items: (d?.data || []).map((m) => ({ id: m.id, type: /video/i.test(m.type || '') ? 'video' : 'photo', preview: m.preview || m.url || null, usedPublic: !!m.used_in_public_post, usedPrivate: !!m.used_in_private_post, createdAt: m.created_at || null })),
          page, pages: Number(d?.meta?.total_pages) || 1, total: Number(d?.meta?.total) || 0,
        });
      } catch (e) {
        send(res, 502, { error: e.message });
      }
    },

    // ------------------------------------------------------------ planification
    /** Planification des modèles MYM visibles : `from` / `to` (ms) pour le calendrier, sinon tout l'à-venir + 300 derniers. */
    'GET /api/mym/plan': (req, res) => {
      const u = who(req, res);
      if (!u) return;
      const accounts = mine(u);
      const ids = accounts.map((c) => c.id);
      if (!ids.length) return send(res, 200, { canEdit: isBoss(u), accounts, items: [] });
      const marks = ids.map(() => '?').join(',');
      const p = q(req);
      const from = Number(p.get('from')) || 0;
      const to = Number(p.get('to')) || 0;
      const rows = from && to
        ? all(`SELECT * FROM mym_plan WHERE creator_id IN (${marks}) AND at >= ? AND at < ? AND status != 'cancelled' ORDER BY at`, ...ids, from, to)
        : [...all(`SELECT * FROM mym_plan WHERE creator_id IN (${marks}) AND status IN ('planned', 'publishing') ORDER BY at`, ...ids), ...all(`SELECT * FROM mym_plan WHERE creator_id IN (${marks}) AND status IN ('created', 'failed') ORDER BY at DESC LIMIT 300`, ...ids)];
      const last = Object.fromEntries(all(`SELECT creator_id, MAX(at) AS at FROM mym_plan WHERE creator_id IN (${marks}) AND status IN ('planned', 'publishing') GROUP BY creator_id`, ...ids).map((r) => [r.creator_id, r.at]));
      send(res, 200, { canEdit: isBoss(u), accounts, items: rows.map(planView), last });
    },
    /** Planifier un post (ou modifier une ligne encore planifiée avec `id`). */
    'POST /api/mym/plan': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux admins, managers et team leaders' });
      const b = await body(req);
      const c = pick(u, res, b.creatorId);
      if (!c) return;
      const at = Number(b.at);
      const visibility = b.visibility === 'private' ? 'private' : 'public';
      const caption = String(b.caption || '').trim().slice(0, 2000);
      const mediaId = String(b.mediaId || '');
      if (!Number.isFinite(at) || at < Date.now() + 60_000) return send(res, 400, { error: 'Choisis une date dans le futur (au moins une minute).' });
      if (at > Date.now() + 366 * 864e5) return send(res, 400, { error: 'Date trop lointaine.' });
      if (!/^[0-9a-f-]{36}$/i.test(mediaId)) return send(res, 400, { error: 'Choisis un média du mym.cloud.' });
      if (b.id) {
        const done = run("UPDATE mym_plan SET at = ?, visibility = ?, caption = ?, media_id = ?, media_type = ? WHERE id = ? AND creator_id = ? AND status = 'planned'", at, visibility, caption, mediaId, b.mediaType === 'video' ? 'video' : 'photo', Number(b.id), c.id);
        if (!done.changes) return send(res, 409, { error: 'Cette publication n’est plus modifiable (déjà partie ou annulée).' });
        return send(res, 200, { ok: true, id: Number(b.id) });
      }
      const r = run('INSERT INTO mym_plan (creator_id, kind, at, visibility, caption, media_id, media_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', c.id, 'feed', at, visibility, caption, mediaId, b.mediaType === 'video' ? 'video' : 'photo', u.name, Date.now());
      send(res, 200, { ok: true, id: Number(r.lastInsertRowid) });
    },
    /** Annuler une publication encore planifiée. */
    'POST /api/mym/plan/cancel': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux admins, managers et team leaders' });
      const b = await body(req);
      const row = one('SELECT creator_id FROM mym_plan WHERE id = ?', Number(b.id));
      if (!row || !mine(u).some((c) => c.id === row.creator_id)) return send(res, 404, { error: 'Publication inconnue' });
      const done = run("UPDATE mym_plan SET status = 'cancelled', done_at = ? WHERE id = ? AND status = 'planned'", Date.now(), Number(b.id));
      send(res, done.changes ? 200 : 409, done.changes ? { ok: true } : { error: 'Déjà partie ou déjà annulée.' });
    },
    /** « Vider la planification » : compte (`dry`) ou annule tout ce qui est encore planifié sur une période. */
    'POST /api/mym/plan/clear': async (req, res) => {
      const u = who(req, res);
      if (!u) return;
      if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux admins, managers et team leaders' });
      const b = await body(req);
      const c = mine(u).find((x) => x.id === String(b.creatorId || ''));
      if (!c) return send(res, 404, { error: 'Modèle MYM inconnue' });
      const from = Math.max(Number(b.from) || 0, Date.now());
      const to = Number(b.to) || 0;
      if (!to || to <= from) return send(res, 400, { error: 'Période invalide (seul l’avenir peut être vidé).' });
      const count = one("SELECT COUNT(*) AS n FROM mym_plan WHERE creator_id = ? AND status = 'planned' AND at >= ? AND at < ?", c.id, from, to).n;
      if (b.dry) return send(res, 200, { count });
      run("UPDATE mym_plan SET status = 'cancelled', done_at = ? WHERE creator_id = ? AND status = 'planned' AND at >= ? AND at < ?", Date.now(), c.id, from, to);
      send(res, 200, { count, cancelled: count });
    },
  };
}
