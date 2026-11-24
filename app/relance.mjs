// Relance auto des PPV de l'IA : quand l'IA envoie un PPV et que le fan ne l'achète pas, Bloom coupe l'IA sur ce fan
// et lui envoie une petite séquence de messages préparés par l'agence (délais, textes et nombre de messages réglés
// par créatrice dans « Configuration IA »). Les chatteurs n'arrivent qu'ensuite :
//   - le fan achète pendant la relance  → c'est fini (notification « a acheté après la relance ») ;
//   - le fan répond (si l'option est cochée) → la relance s'arrête, un chatteur prend la main (notification) ;
//   - un chatteur épingle le fan          → la relance s'arrête (il a repris la main) ;
//   - dernier message envoyé sans achat  → notification « relance terminée, PPV pas payé » pour un chatteur.
// Les relances en cours sont gardées dans la base : un redémarrage du serveur ne les perd pas.
import { all, db, one, run } from './store.mjs';
import { broadcast, inboxChat, patchInboxChat } from './chat.mjs';
import { canChat, canSee, seesAll } from './team.mjs';
import { refuseBanned } from './journal.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS relance_config (creator_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, cut_ai INTEGER NOT NULL DEFAULT 1, stop_reply INTEGER NOT NULL DEFAULT 1, steps TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL, updated_by TEXT);
  CREATE TABLE IF NOT EXISTS relance_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id TEXT NOT NULL, fan_id TEXT NOT NULL, message_id TEXT NOT NULL, price REAL NOT NULL,
    ppv_at INTEGER NOT NULL, started_at INTEGER, step INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting', ended_at INTEGER, sent_ids TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX IF NOT EXISTS relance_runs_next ON relance_runs (status, next_at);
  CREATE INDEX IF NOT EXISTS relance_runs_fan ON relance_runs (creator_id, fan_id);
`);

const MIN = 60_000;
const MAX_STEPS = 6;
let SUB = null;
let busy = false;

const parse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
};
export function relanceConfig(cid) {
  const r = one('SELECT * FROM relance_config WHERE creator_id = ?', String(cid));
  return { enabled: !!r?.enabled, cutAi: r ? !!r.cut_ai : true, stopOnReply: r ? !!r.stop_reply : true, steps: r ? parse(r.steps) : [], updatedAt: r?.updated_at || null, updatedBy: r?.updated_by || null };
}
/** La relance est-elle active pour cette créatrice (et a-t-elle au moins un message) ? */
export const relanceOn = (cid) => {
  const c = relanceConfig(cid);
  return c.enabled && c.steps.length > 0;
};

const alert = (cid, a) => broadcast(cid, 'bloom_alert', { type: 'bloom_alert', data: { id: `${a.kind}:${a.ref}`, at: new Date().toISOString(), ...a } });
const firstName = (name) => {
  const w = String(name || '').trim().split(/\s+/)[0] || '';
  return /\d|^fan$|^u\d/i.test(w) ? '' : w;
};
/** « {prenom} » est remplacé par le prénom du fan (vide si on ne le connaît pas). */
const fill = (text, c) => String(text).replace(/\{prenom\}/gi, firstName(c?.name)).replace(/\s+([,.])/g, '$1').replace(/ {2,}/g, ' ').trim();

/** Appelé quand l'IA vient d'envoyer un PPV. Renvoie true si une relance est prévue (pas de simple notif « pas payé »). */
export function onAiPpv(cid, fanId, m) {
  const cfg = relanceConfig(cid);
  if (!cfg.enabled || !cfg.steps.length) return false;
  const at = Date.parse(m.at) || Date.now();
  // Un seul PPV suivi par fan : le dernier envoyé remplace celui en attente.
  run("UPDATE relance_runs SET status = 'replaced', ended_at = ? WHERE creator_id = ? AND fan_id = ? AND status = 'waiting'", Date.now(), cid, String(fanId));
  if (one("SELECT 1 FROM relance_runs WHERE creator_id = ? AND fan_id = ? AND status = 'running'", cid, String(fanId))) return true;
  run('INSERT INTO relance_runs (creator_id, fan_id, message_id, price, ppv_at, next_at) VALUES (?, ?, ?, ?, ?, ?)', cid, String(fanId), String(m.id), Number(m.price) || 0, at, at + Math.max(1, Number(cfg.steps[0].wait) || 3) * MIN);
  return true;
}

/** État de la conversation chez Substy : PPV acheté ? le fan a-t-il écrit depuis `since` ? */
async function state(r, since) {
  const res = await SUB.messages(r.creator_id, r.fan_id, { limit: 30 });
  const items = res?.items || [];
  const ppv = items.find((x) => String(x.id) === r.message_id);
  const paid = !!ppv?.isPurchasedByRecipient;
  const mine = new Set(parse(r.sent_ids).map(String));
  const replied = items.some((x) => !x.isSentByCreator && (Date.parse(x.createdAt) || 0) > since && !mine.has(String(x.id)));
  return { paid, replied };
}
const end = (r, status) => run('UPDATE relance_runs SET status = ?, ended_at = ? WHERE id = ?', status, Date.now(), r.id);

async function step(r) {
  const cfg = relanceConfig(r.creator_id);
  const c = inboxChat(r.creator_id, r.fan_id);
  const base = { ref: String(r.id), fanId: r.fan_id, fan: c?.name || 'Un fan', amount: Math.round(r.price * 100) };
  // Relance coupée entre-temps, ou fan repris par un chatteur (épinglé) : on arrête.
  if (!cfg.enabled || !cfg.steps.length) return end(r, 'off');
  if (one('SELECT 1 FROM fan_meta WHERE creator_id = ? AND fan_id = ? AND pinned = 1', r.creator_id, r.fan_id)) return end(r, 'pinned');
  const st = await state(r, r.started_at || Date.now());
  if (st.paid) {
    end(r, 'paid');
    if (r.step > 0) alert(r.creator_id, { kind: 'relance_paid', ...base, step: r.step });
    return;
  }
  if (r.step > 0 && cfg.stopOnReply && st.replied) {
    end(r, 'replied');
    return alert(r.creator_id, { kind: 'relance_reply', ...base, step: r.step });
  }
  if (r.step >= cfg.steps.length) {
    end(r, 'done');
    return alert(r.creator_id, { kind: 'relance_done', ...base, step: r.step });
  }
  // Début : on coupe l'IA sur le fan (elle ne doit pas répondre en même temps que la relance).
  if (r.step === 0) {
    if (cfg.cutAi && c?.ai !== false) {
      await SUB.setAi(r.creator_id, r.fan_id, false);
      patchInboxChat(r.creator_id, r.fan_id, { ai: false });
    }
    run('UPDATE relance_runs SET status = ?, started_at = ? WHERE id = ?', 'running', Date.now(), r.id);
    r.started_at = Date.now();
    alert(r.creator_id, { kind: 'relance_start', ...base, step: 1, steps: cfg.steps.length });
  }
  const text = fill(cfg.steps[r.step].text, c);
  const sent = await SUB.send(r.creator_id, r.fan_id, { message: text });
  const ids = [...parse(r.sent_ids), String(sent?.id || sent?.message?.id || sent?.messageId || '')].filter(Boolean);
  const next = cfg.steps[r.step + 1];
  // Après le dernier message, on attend encore le délai du dernier pour voir s'il achète.
  const wait = Math.max(1, Number(next?.wait ?? cfg.steps[r.step].wait) || 3) * MIN;
  run('UPDATE relance_runs SET step = ?, next_at = ?, sent_ids = ? WHERE id = ?', r.step + 1, Date.now() + wait, JSON.stringify(ids), r.id);
  console.log(`[bloom] relance auto : message ${r.step + 1}/${cfg.steps.length} envoyé au fan ${r.fan_id} (${r.creator_id})`);
}

export async function relanceTick() {
  if (busy || !SUB) return;
  busy = true;
  try {
    for (const r of all("SELECT * FROM relance_runs WHERE status IN ('waiting', 'running') AND next_at <= ? ORDER BY next_at LIMIT 30", Date.now())) {
      try {
        await step(r);
      } catch (e) {
        // Erreur passagère : on réessaie dans 2 min ; au-delà de 6 h après le PPV, on abandonne.
        console.warn(`[bloom] relance auto du fan ${r.fan_id} :`, e.message);
        if (Date.now() - r.ppv_at > 6 * 60 * MIN) end(r, 'error');
        else run('UPDATE relance_runs SET next_at = ? WHERE id = ?', Date.now() + 2 * MIN, r.id);
      }
    }
  } finally {
    busy = false;
  }
}

// ---------------------------------------------------------------- adresses
export function relanceRoutes({ substy, userFrom, send, body, creators }) {
  SUB = substy;
  setInterval(relanceTick, 15_000);
  const auth = (req, res, cid, manage) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!canChat(u) || !canSee(u, cid) || !creators().some((c) => c.id === cid)) return send(res, 403, { error: 'Tu n’as pas accès à cette créatrice.' }), null;
    if (manage && !seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    return u;
  };
  const view = (cid) => {
    const since = Date.now() - 7 * 864e5;
    const rows = all("SELECT status, price FROM relance_runs WHERE creator_id = ? AND ppv_at >= ? AND status NOT IN ('replaced')", cid, since);
    const n = (s) => rows.filter((r) => r.status === s).length;
    const started = rows.filter((r) => r.status !== 'waiting' && r.status !== 'off').length;
    return {
      ...relanceConfig(cid),
      stats: {
        waiting: n('waiting'),
        running: n('running'),
        paid: n('paid'),
        paidAmount: rows.filter((r) => r.status === 'paid').reduce((a, r) => a + r.price, 0),
        replied: n('replied'),
        done: n('done'),
        pinned: n('pinned'),
        started,
      },
    };
  };
  return {
    'GET /api/relance': async (req, res) => {
      const cid = String(new URL(req.url, 'http://x').searchParams.get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      send(res, 200, view(cid));
    },
    'POST /api/relance': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      const steps = (Array.isArray(b.steps) ? b.steps : []).slice(0, MAX_STEPS).map((s) => ({ wait: Math.round(Number(s.wait)), text: String(s.text || '').trim().slice(0, 1000) }));
      if (steps.some((s) => !s.text)) return send(res, 400, { error: 'Chaque message de la relance doit avoir un texte.' });
      // Mots interdits de l'agence (Modération) : rien ne part, le refus est noté.
      for (const s of steps) {
        const refused = refuseBanned(u, cid, null, s.text);
        if (refused) return send(res, 400, { error: refused });
      }
      if (steps.some((s) => !(s.wait >= 1 && s.wait <= 24 * 60))) return send(res, 400, { error: 'Les délais vont de 1 minute à 24 heures.' });
      if (b.enabled && !steps.length) return send(res, 400, { error: 'Ajoute au moins un message avant d’activer la relance.' });
      // Mots interdits : vérifiés une fois ici (comme pour un envoi depuis la messagerie).
      for (const s of steps) {
        const v = await substy.validate(s.text).catch(() => null);
        const bad = v && (v.valid === false || v.isValid === false || (Array.isArray(v.bannedWords) && v.bannedWords.length) || (Array.isArray(v.matches) && v.matches.length));
        if (bad) return send(res, 400, { error: `Mot interdit dans « ${s.text.slice(0, 40)} » : ${(v.bannedWords || v.matches || []).map((w) => String(w.word || w)).join(', ')}` });
      }
      run(
        'INSERT INTO relance_config (creator_id, enabled, cut_ai, stop_reply, steps, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(creator_id) DO UPDATE SET enabled = excluded.enabled, cut_ai = excluded.cut_ai, stop_reply = excluded.stop_reply, steps = excluded.steps, updated_at = excluded.updated_at, updated_by = excluded.updated_by',
        cid, b.enabled ? 1 : 0, b.cutAi === false ? 0 : 1, b.stopOnReply === false ? 0 : 1, JSON.stringify(steps), Date.now(), u.name || null,
      );
      // Désactivée : les relances pas encore commencées sont annulées (celles en cours s'arrêtent au prochain message).
      if (!b.enabled) run("UPDATE relance_runs SET status = 'off', ended_at = ? WHERE creator_id = ? AND status = 'waiting'", Date.now(), cid);
      send(res, 200, view(cid));
    },
  };
}
