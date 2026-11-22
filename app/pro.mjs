// Messages Pro (copie de la messagerie d'Infloww) : ce qui n'existe pas déjà dans les adresses « /api/rv/… ».
//   - messages épinglés dans une conversation (épingler un MESSAGE, pas le fan) ;
//   - messages programmés : « Timed message » (dans 1 à 60 min) et « Schedule message » (date et heure), envoyés par Bloom ;
//   - notes par défaut des fans (par créatrice) ;
//   - conversations d'une liste OnlyFans (filtre des listes épinglées) ;
//   - traduction d'un texte (service gratuit sans clé).
import { all, db, getSetting, one, run, setSetting } from './store.mjs';
import { canSee } from './team.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS pro_pins (creator_id TEXT NOT NULL, fan_id TEXT NOT NULL, message_id TEXT NOT NULL, text TEXT, sent_at TEXT, from_fan INTEGER NOT NULL DEFAULT 0,
    pinned_by TEXT, pinned_at INTEGER NOT NULL, PRIMARY KEY (creator_id, fan_id, message_id));
  CREATE TABLE IF NOT EXISTS pro_timed (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, creator_id TEXT NOT NULL, fan_id TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
    medias TEXT NOT NULL DEFAULT '[]', price REAL NOT NULL DEFAULT 0, due_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', error TEXT, created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS pro_timed_due ON pro_timed (status, due_at);
`);

const MAX_AHEAD = 30 * 864e5;
const LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt', 'nl'];

/** « <créatrice>~<fan> » → ids, si la personne voit cette créatrice. */
function convOf(u, id) {
  const [cid, fanId] = String(id || '').split('~');
  if (!cid || !fanId || !canSee(u, cid)) return null;
  return { cid, fanId };
}

/** Traduction (Google Translate, accès public sans clé), langue d'origine détectée. */
async function translate(text, to) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Traduction indisponible (${r.status})`);
  const j = await r.json();
  return { text: (j?.[0] || []).map((x) => x?.[0] || '').join(''), from: j?.[2] || null };
}

export function proRoutes({ substy, userFrom, send, body }) {
  const auth = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    return u;
  };
  const q = (req) => new URL(req.url, 'http://x').searchParams;

  // Envoi des messages programmés arrivés à l'heure (toutes les 15 s).
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      for (const m of all("SELECT * FROM pro_timed WHERE status = 'waiting' AND due_at <= ? ORDER BY due_at LIMIT 10", Date.now())) {
        run("UPDATE pro_timed SET status = 'sending' WHERE id = ?", m.id);
        try {
          const medias = JSON.parse(m.medias || '[]');
          const r = await substy.send(m.creator_id, m.fan_id, { message: m.text, medias, price: m.price || undefined });
          const mid = String(r?.id || r?.message?.id || r?.messageId || '');
          run('INSERT INTO sent_log (user_id, creator_id, fan_id, text, price, at, message_id) VALUES (?, ?, ?, ?, ?, ?, ?)', m.user_id, m.creator_id, m.fan_id, m.text, m.price, Date.now(), mid || null);
          run("UPDATE pro_timed SET status = 'sent' WHERE id = ?", m.id);
        } catch (e) {
          run("UPDATE pro_timed SET status = 'failed', error = ? WHERE id = ?", String(e.message).slice(0, 300), m.id);
        }
      }
    } finally {
      busy = false;
    }
  }, 15_000);

  return {
    // ---------------------------------------------------------------- messages épinglés
    'GET /api/pro/pins': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const c = convOf(u, q(req).get('conv'));
      if (!c) return send(res, 403, { error: 'Pas ta créatrice' });
      send(res, 200, { items: all('SELECT message_id AS id, text, sent_at AS at, from_fan AS fromFan, pinned_by AS by, pinned_at AS pinnedAt FROM pro_pins WHERE creator_id = ? AND fan_id = ? ORDER BY pinned_at DESC', c.cid, c.fanId).map((r) => ({ ...r, fromFan: !!r.fromFan })) });
    },
    'POST /api/pro/pins': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const b = await body(req);
      const c = convOf(u, b.conv);
      if (!c) return send(res, 403, { error: 'Pas ta créatrice' });
      const id = String(b.messageId || '');
      if (!id) return send(res, 400, { error: 'Message manquant' });
      if (b.pin === false) run('DELETE FROM pro_pins WHERE creator_id = ? AND fan_id = ? AND message_id = ?', c.cid, c.fanId, id);
      else
        run(
          'INSERT OR REPLACE INTO pro_pins (creator_id, fan_id, message_id, text, sent_at, from_fan, pinned_by, pinned_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          c.cid, c.fanId, id, String(b.text || '').slice(0, 2000), b.at || null, b.fromFan ? 1 : 0, u.name, Date.now(),
        );
      send(res, 200, { ok: true });
    },

    // ---------------------------------------------------------------- messages programmés
    'GET /api/pro/timed': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const c = convOf(u, q(req).get('conv'));
      if (!c) return send(res, 403, { error: 'Pas ta créatrice' });
      send(res, 200, { items: all("SELECT id, text, price, due_at AS dueAt, status, error FROM pro_timed WHERE creator_id = ? AND fan_id = ? AND (status IN ('waiting', 'sending', 'failed') OR due_at > ?) ORDER BY due_at", c.cid, c.fanId, Date.now() - 864e5) });
    },
    'POST /api/pro/timed': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const b = await body(req);
      const c = convOf(u, b.conv);
      if (!c) return send(res, 403, { error: 'Pas ta créatrice' });
      const text = String(b.text || '').slice(0, 5000);
      const medias = Array.isArray(b.mediaIds) ? b.mediaIds.map(String).slice(0, 50) : [];
      const price = Number(b.price) > 0 ? Math.round(Number(b.price) * 100) / 100 : 0;
      if (!text.trim() && !medias.length) return send(res, 400, { error: 'Message vide' });
      if (price && !medias.length) return send(res, 400, { error: 'Un PPV a besoin d’au moins un média' });
      const due = Number(b.minutes) > 0 ? Date.now() + Math.min(60, Math.max(1, Math.round(Number(b.minutes)))) * 60_000 : Number(b.at);
      if (!(due > Date.now() + 30_000) || due > Date.now() + MAX_AHEAD) return send(res, 400, { error: 'Heure d’envoi invalide (dans le futur, 30 jours au plus)' });
      if (text.trim()) {
        const v = await substy.validate(text).catch(() => null);
        if (v && (v.valid === false || v.isValid === false || v.bannedWords?.length || v.matches?.length)) return send(res, 400, { error: 'Mot interdit dans le message' });
      }
      const r = run('INSERT INTO pro_timed (user_id, creator_id, fan_id, text, medias, price, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', u.id, c.cid, c.fanId, text, JSON.stringify(medias), price, due, Date.now());
      send(res, 200, { id: Number(r.lastInsertRowid), dueAt: due });
    },
    'POST /api/pro/timed/cancel': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const b = await body(req);
      const m = one('SELECT * FROM pro_timed WHERE id = ?', Number(b.id));
      if (!m || !canSee(u, m.creator_id)) return send(res, 404, { error: 'Introuvable' });
      run("UPDATE pro_timed SET status = 'canceled' WHERE id = ? AND status = 'waiting'", m.id);
      send(res, 200, { ok: true });
    },

    // ---------------------------------------------------------------- notes par défaut (modèle des notes d'un fan)
    'GET /api/pro/default-notes': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const cid = String(q(req).get('creatorId') || '');
      if (!canSee(u, cid)) return send(res, 403, { error: 'Pas ta créatrice' });
      send(res, 200, { text: getSetting(`pro_notes:${cid}`) || '' });
    },
    'PUT /api/pro/default-notes': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (!canSee(u, cid)) return send(res, 403, { error: 'Pas ta créatrice' });
      setSetting(`pro_notes:${cid}`, String(b.text || '').slice(0, 5000));
      send(res, 200, { ok: true });
    },

    // ---------------------------------------------------------------- fans d'une liste OnlyFans
    'GET /api/pro/list-fans': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const p = q(req);
      const cid = String(p.get('creatorId') || '');
      if (!canSee(u, cid)) return send(res, 403, { error: 'Pas ta créatrice' });
      const fans = new Set();
      let cursor;
      for (let i = 0; i < 5; i++) {
        const r = await substy.call('chats.list', { creatorId: cid, limit: 100, listId: p.get('listId'), inboxIds: [], aiStatus: 'all', handoffOnly: false, query: '', order: 'recent', languages: [], platformFilters: [], withSpend: true, unreadOnly: false, direction: 'forward', ...(cursor ? { cursor } : {}) }).catch(() => null);
        for (const it of r?.items || []) fans.add(String(it.fan?.fanId ?? it.fanId ?? ''));
        cursor = r?.nextCursor;
        if (!cursor) break;
      }
      fans.delete('');
      send(res, 200, { fans: [...fans] });
    },

    // ---------------------------------------------------------------- traduction
    'POST /api/pro/translate': async (req, res) => {
      const u = auth(req, res);
      if (!u) return;
      const b = await body(req);
      const text = String(b.text || '').slice(0, 3000);
      const to = LANGS.includes(b.to) ? b.to : 'fr';
      if (!text.trim()) return send(res, 200, { text: '', from: null });
      try {
        send(res, 200, await translate(text, to));
      } catch (e) {
        send(res, 502, { error: e.message });
      }
    },
  };
}
