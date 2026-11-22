// Growth → Vault Pro (OnlyFans, copie d'Infloww).
// Médias et listes du vault OnlyFans : lus chez Substy (medias.getLists / medias.getMedias).
// En plus, gardé par Bloom : catégories personnalisées (« Custom »), et pour chaque média : catégorie Bloom, hashtags,
// notes, prix suggéré, qui l'a modifié. Envoyer un média depuis l'ordinateur n'est pas possible via Substy.
import { all, db, one, run } from './store.mjs';
import { canSee, isBoss } from './team.mjs';
import { mediaView } from './chat.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS vault_cats (id INTEGER PRIMARY KEY, creator_id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS vault_meta (
    creator_id TEXT NOT NULL, media_id TEXT NOT NULL, cat_id INTEGER, hashtags TEXT NOT NULL DEFAULT '[]', notes TEXT, price REAL,
    snapshot TEXT, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (creator_id, media_id)
  );
`);
const J = (s, d) => {
  try {
    return JSON.parse(s ?? '');
  } catch {
    return d;
  }
};
const metaOf = (cid, ids) => {
  const m = new Map();
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400);
    for (const r of all(`SELECT * FROM vault_meta WHERE creator_id = ? AND media_id IN (${part.map(() => '?').join(',')})`, cid, ...part)) m.set(r.media_id, r);
  }
  return m;
};
const withMeta = (item, r) => ({ ...item, catId: r?.cat_id ?? null, hashtags: J(r?.hashtags, []), notes: r?.notes ?? '', price: r?.price ?? null, updatedBy: r?.updated_by ?? null, updatedAt: r?.updated_at ?? null });

export function vaultProRoutes({ substy, userFrom, send, body }) {
  const auth = (req, res, cid, edit = false) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!cid || !canSee(u, cid)) return send(res, 403, { error: 'Pas ta créatrice' }), null;
    if (edit && !isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    return u;
  };
  const q = (req) => new URL(req.url, 'http://x').searchParams;
  const cats = (cid) =>
    all('SELECT c.*, (SELECT COUNT(*) FROM vault_meta m WHERE m.cat_id = c.id) AS n FROM vault_cats c WHERE c.creator_id = ? ORDER BY c.position, c.id', cid).map((c) => {
      const snaps = all('SELECT snapshot FROM vault_meta WHERE cat_id = ?', c.id).map((r) => J(r.snapshot, {}));
      const k = (t) => snaps.filter((s) => s.type === t).length;
      return { id: c.id, name: c.name, count: c.n, photos: k('photo'), videos: k('video'), audios: k('audio'), createdBy: c.created_by };
    });

  return {
    'GET /api/vaultpro/cats': async (req, res) => {
      const cid = String(q(req).get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      const r = await substy.vaultLists(cid).catch(() => null);
      send(res, 200, {
        lists: (r?.lists || []).map((l) => ({ id: String(l.id), name: l.name, photos: l.photosCount || 0, videos: l.videosCount || 0, audios: l.audiosCount || 0 })),
        custom: cats(cid),
      });
    },
    'POST /api/vaultpro/cats': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      const name = String(b.name || '').trim().slice(0, 64);
      if (b.delete) {
        run('UPDATE vault_meta SET cat_id = NULL WHERE cat_id = ?', Number(b.id));
        run('DELETE FROM vault_cats WHERE id = ? AND creator_id = ?', Number(b.id), cid);
      } else if (b.id) {
        if (!name) return send(res, 400, { error: 'Donne un nom' });
        run('UPDATE vault_cats SET name = ? WHERE id = ? AND creator_id = ?', name, Number(b.id), cid);
      } else {
        if (!name) return send(res, 400, { error: 'Donne un nom' });
        const pos = one('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM vault_cats WHERE creator_id = ?', cid).p;
        run('INSERT INTO vault_cats (creator_id, name, position, created_by, created_at) VALUES (?, ?, ?, ?, ?)', cid, name, pos, u.name, Date.now());
      }
      send(res, 200, { custom: cats(cid) });
    },
    // Médias : d'une liste OnlyFans (Substy) ou d'une catégorie Bloom (photos gardées par Bloom).
    'GET /api/vaultpro/medias': async (req, res) => {
      const p = q(req);
      const cid = String(p.get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      const cat = Number(p.get('cat')) || null;
      if (cat) {
        const rows = all('SELECT * FROM vault_meta WHERE creator_id = ? AND cat_id = ? ORDER BY updated_at DESC', cid, cat);
        return send(res, 200, { items: rows.map((r) => withMeta(J(r.snapshot, { id: r.media_id }), r)), nextCursor: null });
      }
      const r = await substy.vaultMedias(cid, { listId: p.get('listId') || undefined, cursor: p.get('cursor') || undefined, limit: 60 });
      const raw = r?.medias || [];
      const items = raw.map((m) => ({
        ...mediaView(m),
        createdAt: m.createdAt || m.uploadedAt || null,
        caption: String(m.context || m.description || m.caption || m.text || ''),
        lists: (m.lists || m.listIds || []).map((l) => (typeof l === 'object' ? l.name : String(l))),
      }));
      const meta = metaOf(cid, items.map((i) => String(i.id)));
      send(res, 200, { items: items.map((i) => withMeta(i, meta.get(String(i.id)))), nextCursor: r?.hasMore ? r.nextCursor : null });
    },
    // Modifier un ou plusieurs médias (Media details, Batch edit, Add to category).
    'POST /api/vaultpro/meta': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      const medias = (Array.isArray(b.medias) ? b.medias : []).slice(0, 500);
      const patch = b.patch || {};
      const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);
      if (has('catId') && patch.catId && !one('SELECT 1 FROM vault_cats WHERE id = ? AND creator_id = ?', Number(patch.catId), cid)) return send(res, 404, { error: 'Catégorie introuvable' });
      for (const m of medias) {
        const id = String(m.id || '');
        if (!id) continue;
        const snap = JSON.stringify({ id, type: m.type || null, thumb: m.thumb || null, full: m.full || null, duration: m.duration ?? null, createdAt: m.createdAt || null, caption: m.caption || '' });
        run('INSERT OR IGNORE INTO vault_meta (creator_id, media_id, snapshot, updated_at) VALUES (?, ?, ?, ?)', cid, id, snap, Date.now());
        const sets = ['snapshot = ?', 'updated_by = ?', 'updated_at = ?'];
        const args = [snap, u.name, Date.now()];
        if (has('catId')) sets.push('cat_id = ?'), args.push(patch.catId ? Number(patch.catId) : null);
        if (has('hashtags')) sets.push('hashtags = ?'), args.push(JSON.stringify((Array.isArray(patch.hashtags) ? patch.hashtags : []).map((h) => String(h).replace(/^#/, '').trim().slice(0, 40)).filter(Boolean).slice(0, 20)));
        if (has('notes')) sets.push('notes = ?'), args.push(String(patch.notes || '').slice(0, 256));
        if (has('price')) sets.push('price = ?'), args.push(Number(patch.price) > 0 ? Math.round(Number(patch.price) * 100) / 100 : null);
        run(`UPDATE vault_meta SET ${sets.join(', ')} WHERE creator_id = ? AND media_id = ?`, ...args, cid, id);
      }
      send(res, 200, { ok: true, custom: cats(cid) });
    },
  };
}
