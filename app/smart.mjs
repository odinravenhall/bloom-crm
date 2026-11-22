// Growth → Smart Messages (OnlyFans, copie d'Infloww).
//   - Messages de masse OnlyFans : ceux de Substy (liste / création dans chat.mjs) + retrait (unsend) ici.
//   - Messages automatiques : enregistrés et envoyés par Bloom (Substy n'en propose pas).
//       « Subscriber welcome » : nouveaux abonnés (date d'abonnement lue chez Substy), après un délai aléatoire.
//       « Purchases » : relance après l'achat d'un PPV (vente vue en direct chez Substy).
//     Chaque fan reçoit une « collection » (suite de messages) tirée au hasard ; « unsend on reply » : on arrête la
//     suite dès que le fan répond. Les autres déclencheurs d'Infloww (Nudge, Expiring, Expired, Resubscribe,
//     Birthday) arrivent plus tard (le Nudge passera par l'IA de Substy).
import { all, db, getSetting, one, run, setSetting } from './store.mjs';
import { canSee, isBoss } from './team.mjs';
import { inboxChats } from './chat.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS smart_auto (
    id INTEGER PRIMARY KEY, creator_id TEXT NOT NULL, trigger TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    include_lists TEXT NOT NULL DEFAULT '[]', exclude_lists TEXT NOT NULL DEFAULT '[]',
    delay_min INTEGER NOT NULL DEFAULT 1, delay_max INTEGER NOT NULL DEFAULT 2, once INTEGER NOT NULL DEFAULT 1,
    starts_at INTEGER, ends_at INTEGER, unsend_on_reply INTEGER NOT NULL DEFAULT 1,
    collections TEXT NOT NULL DEFAULT '[]', created_by TEXT, created_at INTEGER NOT NULL, published_at INTEGER,
    canceled_by TEXT, canceled_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS smart_runs (
    id INTEGER PRIMARY KEY, auto_id INTEGER NOT NULL, creator_id TEXT NOT NULL, fan_id TEXT NOT NULL, collection INTEGER NOT NULL DEFAULT 0,
    step INTEGER NOT NULL DEFAULT 0, due_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', last_sent_at INTEGER,
    message_ids TEXT NOT NULL DEFAULT '[]', ref TEXT, error TEXT, created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS smart_runs_once ON smart_runs (auto_id, fan_id, ref);
  CREATE INDEX IF NOT EXISTS smart_runs_due ON smart_runs (status, due_at);
`);

const TRIGGERS = ['welcome', 'purchase', 'nudge', 'expiring', 'expired', 'resubscribe', 'birthday'];
const RUNNING = ['welcome', 'purchase']; // déclencheurs que Bloom sait déjà faire tourner
const J = (s, d) => {
  try {
    return JSON.parse(s ?? '');
  } catch {
    return d;
  }
};

function view(a) {
  const cols = J(a.collections, []);
  const st = one(
    `SELECT COUNT(DISTINCT r.fan_id) AS fans, SUM(json_array_length(r.message_ids)) AS sent FROM smart_runs r WHERE r.auto_id = ?`,
    a.id,
  );
  // Achats et gains : PPV de cette automatisation achetés (vente Substy liée au message envoyé).
  const ids = all('SELECT message_ids FROM smart_runs WHERE auto_id = ?', a.id).flatMap((r) => J(r.message_ids, []));
  let purchased = 0;
  let earnings = 0;
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400);
    const s = one(`SELECT COUNT(*) AS n, COALESCE(SUM(gross), 0) AS g FROM rv_live WHERE message_id IN (${part.map(() => '?').join(',')})`, ...part);
    purchased += s?.n || 0;
    earnings += s?.g || 0;
  }
  const first = cols[0]?.messages?.[0] || {};
  return {
    id: a.id,
    creatorId: a.creator_id,
    trigger: a.trigger,
    status: a.status,
    runs: RUNNING.includes(a.trigger),
    include: J(a.include_lists, []),
    exclude: J(a.exclude_lists, []),
    delayMin: a.delay_min,
    delayMax: a.delay_max,
    once: !!a.once,
    startsAt: a.starts_at,
    endsAt: a.ends_at,
    unsendOnReply: !!a.unsend_on_reply,
    collections: cols,
    text: first.text || '',
    medias: (first.medias || []).length,
    price: first.price || 0,
    createdBy: a.created_by,
    createdAt: a.created_at,
    canceledBy: a.canceled_by,
    fans: st?.fans || 0,
    sent: st?.sent || 0,
    purchased,
    earnings: Math.round(earnings) / 100,
  };
}

/** Nettoie une automatisation reçue du navigateur. */
function clean(b) {
  const lists = (x) => (Array.isArray(x) ? x : []).slice(0, 50).map((l) => ({ id: String(l.id ?? l), name: String(l.name ?? '') }));
  const cols = (Array.isArray(b.collections) ? b.collections : []).slice(0, 10).map((c) => ({
    messages: (Array.isArray(c.messages) ? c.messages : []).slice(0, 10).map((m) => ({
      text: String(m.text || '').slice(0, 5000),
      medias: (Array.isArray(m.medias) ? m.medias : []).slice(0, 50).map((x) => ({ id: String(x.id), type: x.type || 'photo', thumb: x.thumb || x.smallUrl || x.thumbnailUrl || null })),
      price: Number(m.price) > 0 ? Math.round(Number(m.price) * 100) / 100 : 0,
      delay: Math.max(0, Math.min(1440, Math.round(Number(m.delay) || 0))),
    })).filter((m) => m.text.trim() || m.medias.length),
  })).filter((c) => c.messages.length);
  return {
    trigger: TRIGGERS.includes(b.trigger) ? b.trigger : 'welcome',
    include: lists(b.include),
    exclude: lists(b.exclude),
    delayMin: Math.max(0, Math.min(1440, Math.round(Number(b.delayMin) || 0))),
    delayMax: Math.max(0, Math.min(1440, Math.round(Number(b.delayMax) || 0))),
    once: b.once !== false,
    startsAt: Number(b.startsAt) || null,
    endsAt: Number(b.endsAt) || null,
    unsendOnReply: b.unsendOnReply !== false,
    collections: cols,
  };
}

export function smartRoutes({ substy, userFrom, send, body }) {
  const auth = (req, res, cid, write = false) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    if (cid && !canSee(u, cid)) return send(res, 403, { error: 'Pas ta créatrice' }), null;
    return u;
  };
  const q = (req) => new URL(req.url, 'http://x').searchParams;

  // ---------------------------------------------------------------- moteur des messages automatiques
  let busy = false;
  const rnd = (a, b) => a + Math.random() * Math.max(0, b - a);
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const now = Date.now();
      const autos = all("SELECT * FROM smart_auto WHERE status = 'active'");
      for (const a of autos) {
        if (a.ends_at && a.ends_at < now) {
          run("UPDATE smart_auto SET status = 'completed' WHERE id = ?", a.id);
          continue;
        }
        if (a.starts_at && a.starts_at > now) continue;
        const cols = J(a.collections, []);
        if (!cols.length) continue;
        const since = Math.max(a.published_at || a.created_at, a.starts_at || 0);
        const enqueue = (fanId, ref, at) => {
          const due = at + rnd(a.delay_min, Math.max(a.delay_min, a.delay_max)) * 60_000;
          run(
            'INSERT OR IGNORE INTO smart_runs (auto_id, creator_id, fan_id, collection, due_at, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            a.id, a.creator_id, String(fanId), Math.floor(Math.random() * cols.length), Math.max(due, now), a.once ? 'once' : ref, now,
          );
        };
        if (a.trigger === 'welcome') {
          for (const c of inboxChats(a.creator_id).chats) {
            const at = Date.parse(c.since || '');
            if (at > since && at > now - 24 * 3600_000 && c.canSend !== false) enqueue(c.fanId, `sub:${c.since}`, at);
          }
        } else if (a.trigger === 'purchase') {
          for (const s of all("SELECT id, fan_id, at FROM rv_live WHERE creator_id = ? AND type = 'ppv' AND at > ? AND fan_id IS NOT NULL", a.creator_id, since)) enqueue(s.fan_id, `sale:${s.id}`, s.at);
        }
      }
      // Envois arrivés à l'heure (un message de la collection à la fois).
      for (const r of all("SELECT * FROM smart_runs WHERE status = 'waiting' AND due_at <= ? ORDER BY due_at LIMIT 10", now)) {
        const a = one('SELECT * FROM smart_auto WHERE id = ?', r.auto_id);
        if (!a || a.status !== 'active') {
          run("UPDATE smart_runs SET status = 'stopped' WHERE id = ?", r.id);
          continue;
        }
        const col = J(a.collections, [])[r.collection] || J(a.collections, [])[0];
        const m = col?.messages?.[r.step];
        if (!m) {
          run("UPDATE smart_runs SET status = 'done' WHERE id = ?", r.id);
          continue;
        }
        // « Unsend on reply » : le fan a répondu depuis le message précédent → on arrête la suite.
        if (r.step > 0 && a.unsend_on_reply) {
          const chat = [...inboxChats(a.creator_id).chats].find((c) => String(c.fanId) === r.fan_id);
          if (chat?.last && !chat.last.fromCreator && Date.parse(chat.last.at) > (r.last_sent_at || 0)) {
            run("UPDATE smart_runs SET status = 'replied' WHERE id = ?", r.id);
            continue;
          }
        }
        run("UPDATE smart_runs SET status = 'sending' WHERE id = ?", r.id);
        try {
          const res = await substy.send(a.creator_id, r.fan_id, { message: m.text, medias: (m.medias || []).map((x) => x.id), price: m.price || undefined });
          const mid = String(res?.id || res?.message?.id || res?.messageId || '');
          const ids = [...J(r.message_ids, []), ...(mid ? [mid] : [])];
          const next = col.messages[r.step + 1];
          run(
            'UPDATE smart_runs SET step = ?, message_ids = ?, last_sent_at = ?, due_at = ?, status = ? WHERE id = ?',
            r.step + 1, JSON.stringify(ids), Date.now(), Date.now() + (next?.delay || 1) * 60_000, next ? 'waiting' : 'done', r.id,
          );
        } catch (e) {
          run("UPDATE smart_runs SET status = 'failed', error = ? WHERE id = ?", String(e.message).slice(0, 300), r.id);
        }
      }
    } catch (e) {
      console.warn('[smart] ', e.message);
    } finally {
      busy = false;
    }
  }
  setInterval(tick, 20_000);

  return {
    'GET /api/smart/auto': async (req, res) => {
      const p = q(req);
      const cid = String(p.get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      send(res, 200, { items: all('SELECT * FROM smart_auto WHERE creator_id = ? ORDER BY created_at DESC LIMIT 500', cid).map(view) });
    },
    // Enregistrer (brouillon « scheduled ») ou publier (« active ») une automatisation.
    'POST /api/smart/auto': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      const a = clean(b);
      if (!a.collections.length) return send(res, 400, { error: 'Ajoute au moins un message' });
      for (const c of a.collections) for (const m of c.messages) if (m.price && !m.medias.length) return send(res, 400, { error: 'Un PPV a besoin d’au moins un média' });
      for (const c of a.collections)
        for (const m of c.messages)
          if (m.text.trim()) {
            const v = await substy.validate(m.text).catch(() => null);
            if (v && (v.valid === false || v.isValid === false || v.bannedWords?.length || v.matches?.length)) return send(res, 400, { error: 'Mot interdit dans un message' });
          }
      const status = b.publish ? 'active' : 'scheduled';
      const vals = [a.trigger, status, JSON.stringify(a.include), JSON.stringify(a.exclude), a.delayMin, Math.max(a.delayMin, a.delayMax), a.once ? 1 : 0, a.startsAt, a.endsAt, a.unsendOnReply ? 1 : 0, JSON.stringify(a.collections)];
      let id = Number(b.id) || null;
      if (id && one('SELECT id FROM smart_auto WHERE id = ? AND creator_id = ?', id, cid)) {
        run(
          'UPDATE smart_auto SET trigger = ?, status = ?, include_lists = ?, exclude_lists = ?, delay_min = ?, delay_max = ?, once = ?, starts_at = ?, ends_at = ?, unsend_on_reply = ?, collections = ?, published_at = COALESCE(published_at, ?) WHERE id = ?',
          ...vals, b.publish ? Date.now() : null, id,
        );
      } else {
        id = Number(run(
          'INSERT INTO smart_auto (trigger, status, include_lists, exclude_lists, delay_min, delay_max, once, starts_at, ends_at, unsend_on_reply, collections, creator_id, created_by, created_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ...vals, cid, u.name, Date.now(), b.publish ? Date.now() : null,
        ).lastInsertRowid);
      }
      send(res, 200, view(one('SELECT * FROM smart_auto WHERE id = ?', id)));
    },
    'POST /api/smart/auto/cancel': async (req, res) => {
      const b = await body(req);
      const a = one('SELECT * FROM smart_auto WHERE id = ?', Number(b.id));
      if (!a) return send(res, 404, { error: 'Introuvable' });
      const u = auth(req, res, a.creator_id, true);
      if (!u) return;
      run("UPDATE smart_auto SET status = 'canceled', canceled_by = ?, canceled_at = ? WHERE id = ?", u.name, Date.now(), a.id);
      run("UPDATE smart_runs SET status = 'stopped' WHERE auto_id = ? AND status = 'waiting'", a.id);
      send(res, 200, { ok: true });
    },

    // ---------------------------------------------------------------- Auto-follow (réglage par compte OnlyFans)
    // Infloww suit automatiquement les fans dont l'abonnement a expiré. Substy ne le permet pas encore (ses
    // automatisations, qui ont une action « follow fan », ne sont pas ouvertes sur le compte) : Bloom garde le réglage.
    'GET /api/autofollow': async (req, res) => {
      const u = auth(req, res, null);
      if (!u) return;
      let on = {};
      try {
        on = JSON.parse(getSetting('autofollow') || '{}');
      } catch {}
      send(res, 200, { on, active: false });
    },
    'POST /api/autofollow': async (req, res) => {
      const u = auth(req, res, null, true);
      if (!u) return;
      const b = await body(req);
      let on = {};
      try {
        on = JSON.parse(getSetting('autofollow') || '{}');
      } catch {}
      on[String(b.account)] = !!b.on;
      setSetting('autofollow', JSON.stringify(on));
      send(res, 200, { on });
    },

    // Retirer un message de masse OnlyFans (si Substy le permet encore).
    'POST /api/mass/unsend': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      const id = String(b.id || '');
      let last = null;
      for (const [proc, input] of [
        ['creators.massMessage.unsend', { creatorId: cid, massMessageId: id }],
        ['creators.massMessage.unsend', { creatorId: cid, id }],
        ['creators.massMessage.revert', { creatorId: cid, massMessageId: id }],
        ['creators.massMessage.cancel', { creatorId: cid, massMessageId: id }],
      ]) {
        try {
          await substy.call(proc, input);
          run('INSERT INTO ai_changes (user_id, creator_id, what, detail, at) VALUES (?, ?, ?, ?, ?)', u.id, cid, 'mass-unsend', JSON.stringify({ id, proc }), Date.now());
          return send(res, 200, { ok: true });
        } catch (e) {
          last = e;
        }
      }
      send(res, 502, { error: `Substy refuse de retirer ce message (${last?.message || 'erreur'})` });
    },
    // Qui a créé chaque envoi de masse depuis Bloom (colonne « Sender »).
    'GET /api/mass/senders': async (req, res) => {
      const cid = String(q(req).get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      send(res, 200, {
        items: all("SELECT c.detail, c.at, u.name FROM ai_changes c LEFT JOIN users u ON u.id = c.user_id WHERE c.creator_id = ? AND c.what = 'mass' ORDER BY c.at DESC LIMIT 500", cid).map((r) => ({ text: J(r.detail, {}).text || '', at: r.at, name: r.name })),
      });
    },
  };
}
