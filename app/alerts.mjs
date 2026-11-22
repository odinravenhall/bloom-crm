// Notifications en direct de la messagerie (en bas à droite), pour l'équipe qui chatte sur la créatrice :
//   - ai_ppv     : l'IA vient d'envoyer un média payant (PPV), quel que soit le script ;
//   - ppv_unpaid : 3 min après, le fan n'a toujours pas payé ce PPV ;
//   - sale       : un fan vient de payer (PPV, post, pourboire…).
// Elles passent par le flux temps réel « /api/live » (type « bloom_alert »), donc chacun ne reçoit que ses créatrices.
import { all, one } from './store.mjs';
import { broadcast, inboxChat, inboxChats } from './chat.mjs';

const UNPAID_AFTER = 3 * 60_000;
let SUB = null;
const seen = new Set(); // PPV déjà signalés (id du message)

const send = (cid, a) => broadcast(cid, 'bloom_alert', { type: 'bloom_alert', data: { id: `${a.kind}:${a.ref}`, at: new Date().toISOString(), ...a } });
const nameOf = (cid, fanId) => inboxChat(cid, fanId)?.name || 'Un fan';

/** Appelé pour chaque nouveau message vu en direct (déjà mis au format de Bloom). */
export function onMessageAlert(cid, fanId, m) {
  if (!fanId || m.fromFan || m.by?.kind !== 'ai' || !(m.price > 0)) return;
  const ref = String(m.id);
  if (seen.has(ref)) return;
  seen.add(ref);
  if (seen.size > 5000) seen.delete(seen.values().next().value);
  const base = { ref, fanId: String(fanId), fan: nameOf(cid, fanId), amount: Math.round(m.price * 100) };
  send(cid, { kind: 'ai_ppv', ...base });
  setTimeout(() => checkPaid(cid, String(fanId), ref, Date.parse(m.at) || Date.now()).then((paid) => paid === false && send(cid, { kind: 'ppv_unpaid', ...base, fan: nameOf(cid, fanId) })), UNPAID_AFTER);
}

/** Le PPV a-t-il été payé ? true / false, ou null si on ne sait pas. */
async function checkPaid(cid, fanId, msgId, sentAt) {
  try {
    const r = await SUB?.messages(cid, fanId, { limit: 30 });
    const m = (r?.items || []).find((x) => String(x.id) === msgId);
    if (m) return !!m.isPurchasedByRecipient;
  } catch {}
  // Sinon : une vente de ce fan vue depuis l'envoi.
  if (one("SELECT 1 FROM rv_live WHERE creator_id = ? AND fan_id = ? AND at >= ? AND COALESCE(type, '') NOT LIKE '%sub%'", cid, fanId, sentAt - 5000)) return true;
  return SUB ? false : null;
}

// ---------------------------------------------------------------- ventes (lues chez Substy toutes les 30 s)
let lastSeen = Date.now();
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
/** Retrouve le fan d'une vente : par identifiant, sinon par nom s'il est le seul de la créatrice à le porter. */
function fanOfSale(cid, id, name) {
  if (id && inboxChat(cid, id)) return String(id);
  const n = norm(name);
  if (!n) return null;
  const hits = [...inboxChats(cid).chats].filter((c) => norm(c.name) === n || norm(c.username) === n);
  return hits.length === 1 ? hits[0].fanId : null;
}
function salesTick() {
  const rows = all("SELECT * FROM rv_live WHERE first_seen > ? AND COALESCE(type, '') NOT LIKE '%sub%' ORDER BY first_seen", lastSeen);
  for (const r of rows) {
    lastSeen = Math.max(lastSeen, r.first_seen);
    // Ventes anciennes remontées d'un coup (redémarrage) : pas de notification.
    if (Date.now() - r.at > 15 * 60_000) continue;
    const fanId = fanOfSale(r.creator_id, r.fan_id, r.fan_name);
    send(r.creator_id, { kind: 'sale', ref: String(r.id), fanId, fan: (fanId && inboxChat(r.creator_id, fanId)?.name) || r.fan_name || 'Un fan', amount: r.gross, currency: r.currency, type: r.type || null });
  }
}

export function startAlerts(substy) {
  SUB = substy;
  setInterval(salesTick, 10_000);
}
