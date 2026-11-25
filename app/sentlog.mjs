// « Messages envoyés » (comme sur Raven CRM) : tous les messages envoyés aux fans, message par message, pour que les
// team leaders surveillent l'équipe : qui (IA, un chatteur, tous les chatteurs, automatisations, compte de la modèle),
// sur quelle modèle, quand, en combien de temps après le fan, PPV acheté ou non ; avec « aller à la conversation »
// et « supprimer le message ».
// Source : le journal des messages vus en temps réel (msg_log, gardé 120 jours), complété ici par le texte,
// le temps de réponse, l'achat du PPV et la suppression.
import { all, db, one, run } from './store.mjs';
import { img, inboxChat, plain } from './chat.mjs';
import { canSee, isBoss } from './team.mjs';
import { parisMidnight } from './revenue.mjs';

for (const sql of [
  'ALTER TABLE msg_log ADD COLUMN text TEXT',
  'ALTER TABLE msg_log ADD COLUMN reply_ms INTEGER',
  'ALTER TABLE msg_log ADD COLUMN reply_text TEXT',
  'ALTER TABLE msg_log ADD COLUMN paid INTEGER',
  'ALTER TABLE msg_log ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE msg_log ADD COLUMN checked_at INTEGER',
]) {
  try {
    db.exec(sql);
  } catch {}
}
db.exec('CREATE INDEX IF NOT EXISTS msg_out_at ON msg_log (from_fan, at)');
db.exec('CREATE INDEX IF NOT EXISTS msg_fan_at ON msg_log (creator_id, fan_id, at)');
try {
  db.exec('CREATE INDEX IF NOT EXISTS sent_msg ON sent_log (message_id)'); // filtre « script » du Message dashboard
} catch {}

const DAY = 864e5;
const REPLY_MAX = DAY; // au-delà, ce n'est plus une réponse mais une relance

/** Appelé pour chaque message vu en direct (après son enregistrement dans msg_log). */
export function enrichMessage(cid, fanId, m) {
  if (!fanId) return;
  const id = String(m.id);
  const at = Date.parse(m.at) || Date.now();
  const text = String(m.text || '').slice(0, 2000);
  if (m.fromFan) return void run('UPDATE msg_log SET text = ? WHERE id = ? AND text IS NULL', text, id);
  // Temps de réponse : depuis le premier message du fan resté sans réponse.
  const lastOut = one('SELECT MAX(at) AS t FROM msg_log WHERE creator_id = ? AND fan_id = ? AND from_fan = 0 AND at < ? AND id != ?', cid, String(fanId), at, id)?.t || 0;
  const first = one('SELECT at, text, medias FROM msg_log WHERE creator_id = ? AND fan_id = ? AND from_fan = 1 AND at > ? AND at <= ? ORDER BY at LIMIT 1', cid, String(fanId), lastOut, at);
  const ms = first && at - first.at <= REPLY_MAX ? Math.max(0, at - first.at) : null;
  const ctx = first ? (first.text || (first.medias ? '[média du fan]' : '')).slice(0, 300) : null;
  run('UPDATE msg_log SET text = ?, reply_ms = ?, reply_text = ? WHERE id = ?', text, ms, ctx, id);
}

// ---------------------------------------------------------------- PPV achetés / messages supprimés (tâche de fond)
// Substy ne prévient pas quand un PPV est acheté : on relit les derniers messages des fans à qui on a envoyé un PPV
// (1 min après, puis toutes les 10 min pendant 2 h, puis toutes les heures pendant 3 jours).
let SUB = null;
let busy = false;
async function paidTick() {
  if (busy || !SUB) return;
  busy = true;
  try {
    const now = Date.now();
    const rows = all(
      `SELECT creator_id, fan_id, MIN(at) AS at FROM msg_log
       WHERE from_fan = 0 AND price > 0 AND COALESCE(paid, 0) = 0 AND deleted = 0 AND at > ? AND at < ?
         AND (checked_at IS NULL OR checked_at < ? - CASE WHEN ? - at < 7200000 THEN 600000 ELSE 3600000 END)
       GROUP BY creator_id, fan_id ORDER BY MAX(at) DESC LIMIT 15`,
      now - 3 * DAY, now - 60_000, now, now,
    );
    for (const r of rows) {
      try {
        const res = await SUB.messages(r.creator_id, r.fan_id, { limit: 30 });
        for (const m of res?.items || []) {
          if (m.isPurchasedByRecipient) run('UPDATE msg_log SET paid = 1 WHERE id = ?', String(m.id));
          if (m.reverted || m.isReverted || m.revertedAt) run('UPDATE msg_log SET deleted = 1 WHERE id = ?', String(m.id));
        }
      } catch {}
      run('UPDATE msg_log SET checked_at = ? WHERE creator_id = ? AND fan_id = ? AND from_fan = 0 AND price > 0 AND COALESCE(paid, 0) = 0', now, r.creator_id, r.fan_id);
    }
  } finally {
    busy = false;
  }
}

// ---------------------------------------------------------------- filtres
const PAGE = 50;
function bounds(range, day) {
  const now = Date.now();
  if (range === 'all') return [0, now + DAY];
  if (range === '1h') return [now - 3600_000, now + DAY];
  if (range === '7d') return [now - 7 * DAY, now + DAY];
  if (range === '30d') return [now - 30 * DAY, now + DAY];
  if (range === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(day || '')) {
    const s = parisMidnight(day);
    return [s, s + DAY];
  }
  return [parisMidnight(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })), now + DAY];
}
// Expéditeur : « ai », « team » (tous les chatteurs), « auto » (scripts et automatisations), « creator » (compte de la
// modèle : envoi direct sur la plateforme / Infloww), « n:<nom> » (un chatteur précis).
function senderSql(s) {
  if (s === 'ai') return ["m.kind = 'ai'", []];
  if (s === 'team') return ["m.kind IN ('bloom', 'employee')", []];
  if (s === 'auto') return ["m.kind IN ('auto', 'script')", []];
  if (s === 'creator') return ["m.kind = 'creator'", []];
  if (s?.startsWith('n:')) return ["m.kind IN ('bloom', 'employee') AND m.by_name = ?", [s.slice(2)]];
  return [null, []];
}

export function sentRoutes({ substy, userFrom, send, body, creators }) {
  SUB = substy;
  setInterval(paidTick, 30_000);
  const boss = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    return u;
  };

  return {
    'GET /api/sent': async (req, res) => {
      const u = boss(req, res);
      if (!u) return;
      const p = new URL(req.url, 'http://x').searchParams;
      const visible = creators().filter((c) => canSee(u, c.id)).map((c) => c.id);
      const model = p.get('model');
      const cids = model && visible.includes(model) ? [model] : visible;
      if (!cids.length) return send(res, 200, { rows: [], total: 0, page: 1, pages: 1, kpi: {}, senders: [], bySender: [] });
      // Période : « range » (raccourcis) ou, pour le Message dashboard, début / fin exacts en millisecondes.
      const st = Number(p.get('start'));
      const en = Number(p.get('end'));
      const [from, to] = st > 0 && en > st ? [st, en] : bounds(p.get('range') || 'today', p.get('day'));
      const base = [`m.from_fan = 0`, `m.creator_id IN (${cids.map(() => '?').join(',')})`, 'm.at >= ?', 'm.at < ?'];
      const args = [...cids, from, to];
      const status = p.get('status');
      if (status === 'sent') base.push('m.deleted = 0');
      else if (status === 'unsent') base.push('m.deleted = 1');
      else if (status !== 'all' && p.get('deleted') !== '1') base.push('m.deleted = 0');
      // Sans le filtre d'expéditeur : sert à la liste des expéditeurs et au tableau par expéditeur.
      const baseNoSender = [...base];
      const argsNoSender = [...args];
      const [ss, sa] = senderSql(p.get('sender'));
      if (ss) base.push(ss), args.push(...sa);
      if (p.get('ppv') === '1') base.push('m.price > 0');
      if (p.get('ppv') === 'unpaid') base.push('m.price > 0 AND COALESCE(m.paid, 0) = 0');
      const q = String(p.get('q') || '').trim().toLowerCase();
      if (q) base.push('LOWER(COALESCE(m.text, \'\')) LIKE ?'), args.push(`%${q.replace(/[%_]/g, '')}%`);
      if (p.get('slow') === '1') base.push('m.reply_ms >= 600000');
      // Filtres du Message dashboard (Infloww) : destinataire, prix, acheté, script.
      const fan = String(p.get('fan') || '');
      if (fan.includes('~')) base.push('m.creator_id = ? AND m.fan_id = ?'), args.push(...fan.split('~', 2));
      const pmin = Number(p.get('pmin'));
      const pmax = Number(p.get('pmax'));
      if (p.get('pmin') && Number.isFinite(pmin)) base.push('m.price >= ?'), args.push(pmin);
      if (p.get('pmax') && Number.isFinite(pmax)) base.push('m.price <= ?'), args.push(pmax);
      if (p.get('purchased') === 'paid') base.push('m.price > 0 AND m.paid = 1');
      if (p.get('purchased') === 'unpaid') base.push('m.price > 0 AND COALESCE(m.paid, 0) = 0');
      const SCRIPT = "(m.kind = 'script' OR EXISTS (SELECT 1 FROM sent_log s WHERE s.message_id = m.id AND s.lib_item IS NOT NULL))";
      if (p.get('type') === 'script') base.push(SCRIPT);
      if (p.get('type') === 'noscript') base.push(`NOT ${SCRIPT}`);
      const where = base.join(' AND ');

      const total = one(`SELECT COUNT(*) AS n FROM msg_log m WHERE ${where}`, ...args).n;
      const pages = Math.max(1, Math.ceil(total / Math.min(200, Math.max(10, Number(p.get('size')) || PAGE))));
      const page = Math.min(pages, Math.max(1, Number(p.get('page')) || 1));
      const sort = p.get('sort') === 'slow' ? 'm.reply_ms DESC NULLS LAST, m.at DESC' : 'm.at DESC';
      const size = Math.min(200, Math.max(10, Number(p.get('size')) || PAGE));
      const rows = all(`SELECT m.*, ${SCRIPT} AS is_script FROM msg_log m WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`, ...args, size, (page - 1) * size).map((m) => {
        const c = inboxChat(m.creator_id, m.fan_id);
        return {
          id: m.id,
          creatorId: m.creator_id,
          fanId: m.fan_id,
          fan: c?.name || 'Fan',
          fanAvatar: img(c?.avatar) || null,
          at: m.at,
          text: m.text != null ? plain(m.text) : null,
          medias: m.medias,
          price: m.price || 0,
          paid: m.price > 0 ? !!m.paid : null,
          kind: m.kind,
          by: m.by_name || null,
          replyMs: m.reply_ms,
          replyTo: m.reply_text,
          deleted: !!m.deleted,
          script: !!m.is_script,
        };
      });
      // Destinataires de la période (liste « Sent to »).
      const recipients =
        p.get('recipients') === '1'
          ? all(`SELECT m.creator_id, m.fan_id, COUNT(*) AS n FROM msg_log m WHERE ${baseNoSender.join(' AND ')} GROUP BY 1, 2 ORDER BY n DESC LIMIT 300`, ...argsNoSender).map((r) => {
              const c = inboxChat(r.creator_id, r.fan_id);
              return { key: `${r.creator_id}~${r.fan_id}`, name: c?.name || 'Fan', fanId: r.fan_id, creatorId: r.creator_id };
            })
          : undefined;
      const k = one(
        `SELECT COUNT(*) AS messages, AVG(m.reply_ms) AS avgMs, SUM(m.price > 0) AS ppv, SUM(m.price > 0 AND m.paid = 1) AS paid, SUM(CASE WHEN m.paid = 1 THEN m.price ELSE 0 END) AS paidAmount, SUM(m.reply_ms >= 600000) AS slow FROM msg_log m WHERE ${where}`,
        ...args,
      );
      // Par expéditeur (sur les mêmes modèles et la même période) : pour comparer l'IA, chaque chatteur, etc.
      const by = all(
        `SELECT m.kind, CASE WHEN m.kind IN ('bloom', 'employee') THEN m.by_name END AS name, COUNT(*) AS messages, AVG(m.reply_ms) AS avgMs,
           SUM(m.price > 0) AS ppv, SUM(m.price > 0 AND m.paid = 1) AS paid, SUM(CASE WHEN m.paid = 1 THEN m.price ELSE 0 END) AS paidAmount, COUNT(DISTINCT m.creator_id || ':' || m.fan_id) AS fans
         FROM msg_log m WHERE ${baseNoSender.join(' AND ')} GROUP BY 1, 2 ORDER BY messages DESC`,
        ...argsNoSender,
      ).map((r) => ({
        key: r.kind === 'ai' ? 'ai' : r.kind === 'creator' ? 'creator' : r.kind === 'auto' || r.kind === 'script' ? 'auto' : r.name ? `n:${r.name}` : 'team',
        kind: r.kind,
        name: r.name,
        messages: r.messages,
        avgMs: r.avgMs == null ? null : Math.round(r.avgMs),
        ppv: r.ppv || 0,
        paid: r.paid || 0,
        paidAmount: r.paidAmount || 0,
        fans: r.fans,
      }));
      // « auto » et « script » regroupés.
      const merged = [];
      for (const r of by) {
        const hit = merged.find((x) => x.key === r.key);
        if (!hit) merged.push({ ...r });
        else {
          hit.avgMs = hit.avgMs == null ? r.avgMs : r.avgMs == null ? hit.avgMs : Math.round((hit.avgMs * hit.messages + r.avgMs * r.messages) / (hit.messages + r.messages));
          for (const f of ['messages', 'ppv', 'paid', 'paidAmount', 'fans']) hit[f] += r[f];
        }
      }
      send(res, 200, {
        rows,
        total,
        page,
        pages,
        since: one('SELECT MIN(at) AS t FROM msg_log WHERE text IS NOT NULL')?.t || null,
        kpi: { messages: k.messages || 0, avgMs: k.avgMs == null ? null : Math.round(k.avgMs), ppv: k.ppv || 0, paid: k.paid || 0, paidAmount: k.paidAmount || 0, slow: k.slow || 0 },
        bySender: merged,
        recipients,
      });
    },

    // Supprimer un message chez le fan (« unsend » de Substy).
    'POST /api/sent/delete': async (req, res) => {
      const u = boss(req, res);
      if (!u) return;
      const b = await body(req);
      const m = one('SELECT * FROM msg_log WHERE id = ? AND from_fan = 0', String(b.id || ''));
      if (!m) return send(res, 404, { error: 'Message introuvable' });
      if (!canSee({ ...u, pf: null }, m.creator_id)) return send(res, 403, { error: 'Pas ta créatrice' });
      await SUB.unsend(m.creator_id, m.fan_id, m.id);
      run('UPDATE msg_log SET deleted = 1 WHERE id = ?', m.id);
      console.log(`[bloom] message ${m.id} supprimé chez le fan ${m.fan_id} par ${u.name}`);
      send(res, 200, { ok: true });
    },
  };
}
