// Bibliothèque de scripts de Bloom (comme Infloww) : par créatrice, des TAGS (dossiers de scripts à envoyer quand on veut)
// et des SÉQUENCES (étapes dans l'ordre, on reprend où en est le fan). Gardée dans la base de Bloom.
// Statistiques : chaque envoi depuis Bloom note l'étape (sent_log.lib_item), puis l'identifiant du message reçu en
// temps réel (sent_log.message_id) ; une vente Substy liée à ce message = un achat de l'étape.
import { all, db, one, run } from './store.mjs';
import { canSee, isBoss } from './team.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS lib_groups (
    id INTEGER PRIMARY KEY, creator_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS lib_groups_creator ON lib_groups (creator_id, kind, position);
  CREATE TABLE IF NOT EXISTS lib_items (
    id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES lib_groups(id) ON DELETE CASCADE, position INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '', note TEXT, price REAL NOT NULL DEFAULT 0, medias TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS lib_items_group ON lib_items (group_id, position);
`);
for (const sql of ['ALTER TABLE sent_log ADD COLUMN lib_item INTEGER', 'ALTER TABLE sent_log ADD COLUMN message_id TEXT', 'CREATE INDEX IF NOT EXISTS sent_lib ON sent_log (lib_item)']) {
  try {
    db.exec(sql);
  } catch {}
}

const KINDS = ['tag', 'sequence'];
const tx = (fn) => {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};
const parse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
};
const cleanMedias = (a) =>
  (Array.isArray(a) ? a : [])
    .slice(0, 30)
    .map((m) => ({ id: String(m.id), type: String(m.type || 'photo'), thumb: m.thumb ? String(m.thumb) : null, full: m.full ? String(m.full) : null }))
    .filter((m) => m.id);

/** L'étape existe et appartient bien à cette créatrice (pour l'envoi). */
export function libItemOf(creatorId, id) {
  if (!id) return null;
  return one('SELECT i.id FROM lib_items i JOIN lib_groups g ON g.id = i.group_id WHERE i.id = ? AND g.creator_id = ?', Number(id), String(creatorId))?.id ?? null;
}

/** Toute la bibliothèque d'une créatrice, avec les chiffres de chaque script ; avec `fanId`, ce qui a déjà été envoyé à ce fan. */
function library(creatorId, fanId) {
  const groups = all('SELECT id, kind, name, position FROM lib_groups WHERE creator_id = ? ORDER BY position, id', creatorId);
  const items = all(
    `SELECT i.* FROM lib_items i JOIN lib_groups g ON g.id = i.group_id WHERE g.creator_id = ? ORDER BY i.position, i.id`,
    creatorId,
  );
  const stats = new Map(
    all(
      `SELECT s.lib_item AS id, COUNT(*) AS uses, COUNT(DISTINCT s.fan_id) AS fans, SUM(s.price > 0) AS ppv,
              COUNT(l.id) AS sales, COALESCE(SUM(l.gross), 0) AS revenue, MAX(l.currency) AS currency
       FROM sent_log s LEFT JOIN rv_live l ON s.message_id IS NOT NULL AND l.message_id = s.message_id
       WHERE s.creator_id = ? AND s.lib_item IS NOT NULL GROUP BY s.lib_item`,
      creatorId,
    ).map((r) => [r.id, r]),
  );
  const toFan = fanId
    ? new Map(
        all(
          `SELECT s.lib_item AS id, MAX(s.at) AS at, u.name AS by, MAX(l.id IS NOT NULL) AS bought FROM sent_log s LEFT JOIN users u ON u.id = s.user_id
           LEFT JOIN rv_live l ON s.message_id IS NOT NULL AND l.message_id = s.message_id
           WHERE s.creator_id = ? AND s.fan_id = ? AND s.lib_item IS NOT NULL GROUP BY s.lib_item`,
          creatorId,
          String(fanId),
        ).map((r) => [r.id, r]),
      )
    : null;
  return groups.map((g) => ({
    ...g,
    items: items
      .filter((i) => i.group_id === g.id)
      .map((i) => {
        const s = stats.get(i.id);
        const f = toFan?.get(i.id);
        return {
          id: i.id,
          name: i.name,
          text: i.text,
          note: i.note || null,
          price: i.price || 0,
          medias: parse(i.medias),
          uses: s?.uses || 0,
          fans: s?.fans || 0,
          ppvSent: s?.ppv || 0,
          sales: s?.sales || 0,
          revenue: s?.revenue || 0,
          currency: s?.currency || null,
          sent: f ? { at: f.at, by: f.by || null, bought: !!f.bought } : null,
        };
      }),
  }));
}

export function libraryRoutes({ userFrom, send, body }) {
  const auth = (req, res) => {
    const u = userFrom(req);
    if (!u) send(res, 401, { error: 'Connecte-toi' });
    return u;
  };
  // Créer / modifier / supprimer : admins, managers et team leaders, sur leurs créatrices.
  const editor = (req, res, creatorId) => {
    const u = auth(req, res);
    if (!u) return null;
    if (!isBoss(u) || !canSee(u, creatorId)) {
      send(res, 403, { error: 'Réservé aux team leaders, managers et admins de cette créatrice.' });
      return null;
    }
    return u;
  };
  const groupOf = (id) => one('SELECT * FROM lib_groups WHERE id = ?', Number(id));
  const itemOf = (id) => one('SELECT i.*, g.creator_id FROM lib_items i JOIN lib_groups g ON g.id = i.group_id WHERE i.id = ?', Number(id));

  return {
    'GET /api/lib': async (req, res) => {
      const p = new URL(req.url, 'http://x').searchParams;
      const cid = String(p.get('creatorId') || '');
      const u = auth(req, res);
      if (!u) return;
      if (u.role === 'model' || !canSee(u, cid)) return send(res, 403, { error: 'Tu n’as pas accès à cette créatrice.' });
      send(res, 200, { groups: library(cid, p.get('fanId')), canEdit: isBoss(u) });
    },

    // Créer ou renommer un tag / une séquence.
    'POST /api/lib/group': async (req, res) => {
      const b = await body(req);
      const g = b.id ? groupOf(b.id) : null;
      if (b.id && !g) return send(res, 404, { error: 'Introuvable' });
      const cid = g ? g.creator_id : String(b.creatorId || '');
      const u = editor(req, res, cid);
      if (!u) return;
      const name = String(b.name || '').trim().slice(0, 80);
      if (!name) return send(res, 400, { error: 'Donne un nom' });
      if (g) {
        run('UPDATE lib_groups SET name = ?, updated_at = ? WHERE id = ?', name, Date.now(), g.id);
        return send(res, 200, { id: g.id });
      }
      const kind = KINDS.includes(b.kind) ? b.kind : 'tag';
      const pos = (one('SELECT MAX(position) AS m FROM lib_groups WHERE creator_id = ? AND kind = ?', cid, kind)?.m ?? -1) + 1;
      const r = run('INSERT INTO lib_groups (creator_id, kind, name, position, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', cid, kind, name, pos, u.id, Date.now(), Date.now());
      send(res, 200, { id: Number(r.lastInsertRowid) });
    },
    'POST /api/lib/group/delete': async (req, res) => {
      const b = await body(req);
      const g = groupOf(b.id);
      if (!g) return send(res, 404, { error: 'Introuvable' });
      if (!editor(req, res, g.creator_id)) return;
      tx(() => {
        run('DELETE FROM lib_items WHERE group_id = ?', g.id);
        run('DELETE FROM lib_groups WHERE id = ?', g.id);
      });
      send(res, 200, { ok: true });
    },
    // Ordre des tags / séquences (liste d'identifiants dans le nouvel ordre).
    'POST /api/lib/group/order': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (!editor(req, res, cid)) return;
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number);
      tx(() => ids.forEach((id, i) => run('UPDATE lib_groups SET position = ? WHERE id = ? AND creator_id = ?', i, id, cid)));
      send(res, 200, { ok: true });
    },
    // Copier un tag / une séquence vers une autre créatrice (les médias restent : chaque vault est propre à la créatrice).
    'POST /api/lib/group/copy': async (req, res) => {
      const b = await body(req);
      const g = groupOf(b.id);
      if (!g) return send(res, 404, { error: 'Introuvable' });
      const to = String(b.toCreatorId || '');
      const u = editor(req, res, g.creator_id);
      if (!u || !editor(req, res, to)) return;
      const same = to === g.creator_id;
      const id = tx(() => {
        const pos = (one('SELECT MAX(position) AS m FROM lib_groups WHERE creator_id = ? AND kind = ?', to, g.kind)?.m ?? -1) + 1;
        const r = run('INSERT INTO lib_groups (creator_id, kind, name, position, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', to, g.kind, same ? `${g.name} (copie)` : g.name, pos, u.id, Date.now(), Date.now());
        const nid = Number(r.lastInsertRowid);
        for (const i of all('SELECT * FROM lib_items WHERE group_id = ? ORDER BY position, id', g.id))
          run(
            'INSERT INTO lib_items (group_id, position, name, text, note, price, medias, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            nid, i.position, i.name, i.text, i.note, same ? i.price : 0, same ? i.medias : '[]', Date.now(), Date.now(),
          );
        return nid;
      });
      send(res, 200, { id, mediasDropped: !same });
    },

    // Créer ou modifier un script (une étape).
    'POST /api/lib/item': async (req, res) => {
      const b = await body(req);
      const cur = b.id ? itemOf(b.id) : null;
      if (b.id && !cur) return send(res, 404, { error: 'Introuvable' });
      const g = groupOf(cur ? cur.group_id : b.groupId);
      if (!g) return send(res, 404, { error: 'Tag ou séquence introuvable' });
      if (!editor(req, res, g.creator_id)) return;
      const text = String(b.text || '').slice(0, 5000);
      const medias = cleanMedias(b.medias);
      const price = Number(b.price) > 0 ? Math.round(Number(b.price) * 100) / 100 : 0;
      if (!text.trim() && !medias.length) return send(res, 400, { error: 'Écris un message ou ajoute un média' });
      if (price && !medias.length) return send(res, 400, { error: 'Un PPV a besoin d’au moins un média' });
      if (price && price < 3) return send(res, 400, { error: 'Prix minimum d’un PPV : 3 $' });
      const name = String(b.name || '').trim().slice(0, 80);
      const note = String(b.note || '').trim().slice(0, 200) || null;
      if (cur) {
        run('UPDATE lib_items SET name = ?, text = ?, note = ?, price = ?, medias = ?, updated_at = ? WHERE id = ?', name, text, note, price, JSON.stringify(medias), Date.now(), cur.id);
        return send(res, 200, { id: cur.id });
      }
      const pos = (one('SELECT MAX(position) AS m FROM lib_items WHERE group_id = ?', g.id)?.m ?? -1) + 1;
      const r = run(
        'INSERT INTO lib_items (group_id, position, name, text, note, price, medias, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        g.id, pos, name || String(pos + 1), text, note, price, JSON.stringify(medias), Date.now(), Date.now(),
      );
      run('UPDATE lib_groups SET updated_at = ? WHERE id = ?', Date.now(), g.id);
      send(res, 200, { id: Number(r.lastInsertRowid) });
    },
    'POST /api/lib/item/delete': async (req, res) => {
      const b = await body(req);
      const i = itemOf(b.id);
      if (!i) return send(res, 404, { error: 'Introuvable' });
      if (!editor(req, res, i.creator_id)) return;
      run('DELETE FROM lib_items WHERE id = ?', i.id);
      send(res, 200, { ok: true });
    },
    'POST /api/lib/item/order': async (req, res) => {
      const b = await body(req);
      const g = groupOf(b.groupId);
      if (!g) return send(res, 404, { error: 'Introuvable' });
      if (!editor(req, res, g.creator_id)) return;
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number);
      tx(() => ids.forEach((id, i) => run('UPDATE lib_items SET position = ? WHERE id = ? AND group_id = ?', i, id, g.id)));
      send(res, 200, { ok: true });
    },
  };
}
