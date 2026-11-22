// File de la messagerie (comme Raven CRM), adaptée à OnlyFans / MYM via Substy :
// une seule liste pour toutes les créatrices visibles (ou une seule), onglets (à répondre, épinglés, nouveaux,
// relances, actifs, tous), tri, fenêtre de temps, et ce que Bloom garde en plus de Substy : épingle, tags, notes,
// « non lu » remis à la main, « vu par l'équipe ».
import { all, db, one, run } from './store.mjs';
import { inboxChats } from './chat.mjs';
import { canChat, canSee } from './team.mjs';
import { parisDay, revenue } from './revenue.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS fan_meta (
    creator_id TEXT NOT NULL, fan_id TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0, pinned_by TEXT,
    tags TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', notes_by TEXT, notes_at INTEGER,
    unread INTEGER NOT NULL DEFAULT 0, seen_id TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (creator_id, fan_id)
  );
`);

const MIN = 60_000;
const HOUR = 60 * MIN;
const WINDOWS = { '6h': 6 * HOUR, '24h': 24 * HOUR, '3j': 72 * HOUR, '7j': 168 * HOUR, tout: 0 };
const TABS = ['reply', 'all', 'pinned', 'new', 'relance', 'active'];
const tagsOf = (s) => String(s || '').split(',').map((t) => t.trim()).filter(Boolean);

/** Le fan attend une réponse : dernier message de lui, non lu chez Substy, « à reprendre » (l'IA a passé la main), ou remis « non lu » dans Bloom. */
const waiting = (c, m) => !!c.last && c.canSend !== false && (c.handoff || c.unread > 0 || !c.last.fromCreator || !!m?.unread);

function metaMap(cids) {
  if (!cids.length) return new Map();
  const rows = all(`SELECT * FROM fan_meta WHERE creator_id IN (${cids.map(() => '?').join(',')})`, ...cids);
  return new Map(rows.map((r) => [`${r.creator_id}:${r.fan_id}`, r]));
}

/** Relances : notre dernier message est un PPV pas encore payé, envoyé il y a 5 min à 24 h. */
function relances(cands) {
  const out = new Map();
  const ids = cands.map((c) => c.last.id).filter(Boolean);
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400);
    const ph = part.map(() => '?').join(',');
    const ppv = all(`SELECT id, price, at FROM msg_log WHERE id IN (${ph}) AND from_fan = 0 AND price > 0`, ...part);
    if (!ppv.length) continue;
    const paid = new Set(all(`SELECT message_id FROM rv_live WHERE message_id IN (${ppv.map(() => '?').join(',')})`, ...ppv.map((p) => p.id)).map((r) => String(r.message_id)));
    // Étape de script qui l'a envoyé (bibliothèque de Bloom), si on la connaît.
    const lib = new Map(
      all(
        `SELECT s.message_id AS id, i.name AS step, g.name AS grp FROM sent_log s JOIN lib_items i ON i.id = s.lib_item JOIN lib_groups g ON g.id = i.group_id WHERE s.message_id IN (${ppv.map(() => '?').join(',')})`,
        ...ppv.map((p) => p.id),
      ).map((r) => [String(r.id), `${r.grp} · ${r.step}`]),
    );
    for (const p of ppv) if (!paid.has(String(p.id))) out.set(String(p.id), { price: p.price, at: p.at, script: lib.get(String(p.id)) || null });
  }
  return out;
}

export function inboxRoutes({ userFrom, send, body, creators }) {
  const auth = (req, res) => {
    const u = userFrom(req);
    if (!u) send(res, 401, { error: 'Connecte-toi' });
    else if (!canChat(u)) {
      send(res, 403, { error: 'Pas d’accès à la messagerie' });
      return null;
    }
    return u;
  };

  return {
    /**
     * La file : ?scope=all|<creatorId>&tab=&win=&sort=old|recent|spent&q=&paying=1&hide=id,id
     * Réponse : items (300 au plus), compteurs des onglets, nombre de fans à répondre par créatrice (pour la barre de gauche).
     */
    'GET /api/queue': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const p = new URL(req.url, 'http://x').searchParams;
      const hide = new Set(String(p.get('hide') || '').split(',').filter(Boolean));
      const visible = creators().filter((c) => canSee(u, c.id) && !hide.has(c.id)).map((c) => c.id);
      const scope = p.get('scope') && p.get('scope') !== 'all' && visible.includes(p.get('scope')) ? [p.get('scope')] : visible;
      const tab = TABS.includes(p.get('tab')) ? p.get('tab') : 'reply';
      const win = WINDOWS[p.get('win')] ?? WINDOWS['3j'];
      const sort = ['old', 'recent', 'spent'].includes(p.get('sort')) ? p.get('sort') : tab === 'reply' ? 'old' : 'recent';
      const s = String(p.get('q') || '').trim().toLowerCase();
      const paying = p.get('paying') === '1';
      const now = Date.now();
      const metas = metaMap(visible);

      const perCreator = {};
      const counts = { reply: 0, pinned: 0, new: 0, relance: 0, active: 0, all: 0 };
      const rows = [];
      const relCands = [];
      let loading = false;
      for (const cid of visible) {
        const inb = inboxChats(cid);
        if (!inb.complete) loading = true;
        let n = 0;
        const inScope = scope.includes(cid);
        for (const c of inb.chats) {
          const m = metas.get(`${cid}:${c.fanId}`);
          const at = c.last ? Date.parse(c.last.at) || 0 : 0;
          const reply = waiting(c, m) && (!win || at >= now - win);
          if (reply) n++;
          if (!inScope) continue;
          if (paying && !(c.spent > 0)) continue;
          if (s && !`${c.name} ${c.username || ''} ${m?.tags || ''}`.toLowerCase().includes(s)) continue;
          const row = { c, m, cid, at, reply };
          row.isNew = !!c.since && Date.parse(c.since) >= now - 3 * 24 * HOUR;
          row.active = !!c.last && !c.last.fromCreator && at >= now - 10 * MIN;
          counts.all++;
          if (reply) counts.reply++;
          if (m?.pinned) counts.pinned++;
          if (row.isNew) counts.new++;
          if (row.active) counts.active++;
          if (c.last?.fromCreator && c.last.id && at <= now - 5 * MIN && at >= now - 24 * HOUR) relCands.push(c), (row.relCand = true);
          rows.push(row);
        }
        perCreator[cid] = n;
      }
      const rel = relances(relCands);
      counts.relance = rows.filter((r) => r.relCand && rel.has(r.c.last.id)).length;

      const keep = rows.filter((r) =>
        tab === 'reply' ? r.reply : tab === 'pinned' ? !!r.m?.pinned : tab === 'new' ? r.isNew : tab === 'active' ? r.active : tab === 'relance' ? r.relCand && rel.has(r.c.last.id) : true,
      );
      keep.sort((a, b) => (sort === 'spent' ? (b.c.spent || 0) - (a.c.spent || 0) || a.at - b.at : sort === 'old' ? a.at - b.at : b.at - a.at));
      // Épinglés toujours en haut (sauf tri par dépense).
      if (sort !== 'spent') keep.sort((a, b) => (b.m?.pinned || 0) - (a.m?.pinned || 0));
      const items = keep.slice(0, 300).map(({ c, m, cid, reply, isNew, active, relCand }) => ({
        ...c,
        creatorId: cid,
        waiting: reply,
        isNew,
        active,
        pinned: !!m?.pinned,
        pinnedBy: m?.pinned_by || null,
        tags: tagsOf(m?.tags),
        // « Frais » : personne dans l'équipe n'a encore ouvert ce dernier message du fan.
        fresh: !!m?.unread || (reply && !!c.last && !c.last.fromCreator && m?.seen_id !== c.last.id),
        relance: relCand ? rel.get(c.last.id) || null : null,
      }));
      const replyTotal = Object.values(perCreator).reduce((a, b) => a + b, 0);
      send(res, 200, { items, counts, perCreator, replyTotal, more: keep.length > 300, loading });
    },

    'GET /api/fan-meta': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const p = new URL(req.url, 'http://x').searchParams;
      const cid = String(p.get('creatorId') || '');
      if (!canSee(u, cid)) return send(res, 403, { error: 'Pas ta créatrice' });
      const m = one('SELECT * FROM fan_meta WHERE creator_id = ? AND fan_id = ?', cid, String(p.get('fanId') || ''));
      send(res, 200, { pinned: !!m?.pinned, pinnedBy: m?.pinned_by || null, tags: tagsOf(m?.tags), notes: m?.notes || '', notesBy: m?.notes_by || null, notesAt: m?.notes_at || null });
    },
    // Épingle (pour toute l'équipe), tags, notes, « non lu », « vu ».
    'POST /api/fan-meta': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const fid = String(b.fanId || '');
      if (!cid || !fid) return send(res, 400, { error: 'Fan manquant' });
      if (!canSee(u, cid)) return send(res, 403, { error: 'Pas ta créatrice' });
      run('INSERT OR IGNORE INTO fan_meta (creator_id, fan_id, updated_at) VALUES (?, ?, ?)', cid, fid, Date.now());
      const set = (sql, ...v) => run(`UPDATE fan_meta SET ${sql}, updated_at = ? WHERE creator_id = ? AND fan_id = ?`, ...v, Date.now(), cid, fid);
      if (b.pinned !== undefined) set('pinned = ?, pinned_by = ?', b.pinned ? 1 : 0, b.pinned ? u.name : null);
      if (b.tags !== undefined) {
        const tags = [...new Set((Array.isArray(b.tags) ? b.tags : tagsOf(b.tags)).map((t) => String(t).trim().replace(/,/g, ' ').slice(0, 30)).filter(Boolean))].slice(0, 20);
        set('tags = ?', tags.join(','));
      }
      if (b.notes !== undefined) set('notes = ?, notes_by = ?, notes_at = ?', String(b.notes).slice(0, 5000), u.name, Date.now());
      if (b.unread !== undefined) set('unread = ?', b.unread ? 1 : 0);
      if (b.seen !== undefined) set('seen_id = ?, unread = 0', b.seen ? String(b.seen) : null);
      send(res, 200, { ok: true });
    },

    // Cloche : dernières ventes, pourboires et abonnements (Infloww / MyPulse + Substy en direct), 2 derniers jours.
    'GET /api/notifs': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const p = new URL(req.url, 'http://x').searchParams;
      const list = creators().filter((c) => canSee(u, c.id) && (!p.get('scope') || p.get('scope') === 'all' || p.get('scope') === c.id));
      const today = parisDay(Date.now());
      const r = revenue({ from: parisDay(Date.now() - 2 * 24 * HOUR), to: today, creators: list });
      send(res, 200, r.recent);
    },
  };
}

