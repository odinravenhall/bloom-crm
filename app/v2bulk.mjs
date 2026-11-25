// Bloom v2 → Envois groupés : UN écran pour OnlyFans et MYM (25/11/2026, design « Constellation »).
// Il remplace, dans la v2, la copie d'Infloww (Smart Messages) et celle de MyPulse (Mass DM). Les deux plateformes
// n'envoient pas de la même façon, et ça ne change pas :
//  - OnlyFans : un « message de masse » d'OnlyFans, créé chez Substy (`creators.massMessage.create`), envoyé d'un
//    coup à des LISTES d'OnlyFans (incluses / exclues). L'historique, avec vus / achats / revenus, vient de Substy
//    (`creators.massMessage.list`, 20 par page) : on y voit aussi les envois faits depuis OnlyFans ou Infloww.
//    ⚠️ Au 25/11/2026 AUCUN message de masse n'a encore été créé depuis Bloom : le format de création a été relevé
//    sur le site de Substy (requête bloquée avant l'envoi), jamais vérifié sur un vrai envoi.
//  - MYM : le « Mass DM » de Bloom (mymbulk.mjs) : un message privé par fan, l'un après l'autre (≈ 3 000 à l'heure),
//    à partir d'un MESSAGE PRÊT, vers les abonnés / anciens / intéressés joignables, avec groupes, filtres, prix
//    intelligent, retrait des non lus, challenge en 2 temps.
// Cette route ne fait que LIRE et rend les envois dans une même forme. Écrire reste dans les routes d'avant :
//  - OnlyFans : « POST /api/mass », « /api/mass/unsend », automatiques « /api/smart/auto » et « …/cancel » ;
//  - MYM : « /api/mym/massdm/message|message/delete|preview|campaign|campaign/stop|campaign/remove ».
import { all } from './store.mjs';
import { isBoss } from './team.mjs';
import { askOf } from './v2stats.mjs';
import { plain } from './chat.mjs';
import { autoView } from './smart.mjs';
import { massDmState, warmMassDm } from './mymbulk.mjs';

const J = (s, d) => {
  try {
    return JSON.parse(s ?? '');
  } catch {
    return d;
  }
};
const AUD = { active: 'abonnés', old: 'anciens abonnés', interested: 'intéressés' };

// Listes d'OnlyFans d'une créatrice, gardées une minute (elles servent aussi à nommer les listes de l'historique).
const keep = new Map();
function kept(key, ttl, make) {
  const hit = keep.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const p = make();
  keep.set(key, { at: Date.now(), p });
  p.catch(() => keep.get(key)?.p === p && keep.delete(key));
  return p;
}

/** À qui part une campagne MYM, en une phrase. */
function mymAudience(o, groups) {
  const name = (id) => groups.find((g) => String(g.id) === String(id))?.name || 'groupe supprimé';
  const parts = [(o.audiences || []).map((a) => AUD[a] || a).join(' + ') || '—'];
  if (o.include?.length) parts.push(`groupes : ${o.include.map(name).join(', ')}`);
  if (o.exclude?.length) parts.push(`sauf ${o.exclude.map(name).join(', ')}`);
  if (o.newSubsDays) parts.push(`abonnés depuis ${o.newSubsDays} j au plus`);
  if (o.skipActiveMin) parts.push('hors conversations en cours');
  if (o.spendMin != null || o.spendMax != null) parts.push(`dépense de ${o.spendMin ?? 0} à ${o.spendMax ?? '∞'} €`);
  return parts.join(' · ').replace(/^./, (c) => c.toUpperCase());
}
/** Une campagne de Mass DM (`campView` de mymbulk.mjs) → la forme commune. */
function mymSend(c, groups) {
  const open = c.status === 'scheduled' || c.status === 'running';
  return {
    id: String(c.id), title: c.title || '', text: c.text || '', medias: (c.medias || []).length, thumbs: (c.medias || []).slice(0, 4), price: c.price || 0, smart: c.opts?.smart || null,
    audience: mymAudience(c.opts || {}, groups), status: c.status === 'done' ? 'sent' : c.status === 'cancelled' ? 'stopped' : c.status,
    at: c.startedAt ?? c.startAt ?? c.createdAt ?? null, by: c.createdBy || null,
    total: c.total || c.sent + c.pending + c.failed + c.skipped, sent: c.sent, viewed: null, bought: c.sales || 0, revenue: Math.round((c.revenue || 0) * 100),
    failed: c.failed || 0, skipped: c.skipped || 0, removed: c.removed || 0, pending: c.pending || 0,
    canStop: open, canUnsend: false, canWithdraw: !open && !!c.removable && c.sent - c.removed > 0, removeAt: c.removeAt || null, note: c.note || null,
    messageId: c.messageId ?? null, opts: c.opts || {}, included: [], excluded: [], onlineOnly: false,
  };
}
const ofStatus = (s) => {
  const x = String(s || '').toUpperCase();
  return /UNSEN|REVERT/.test(x) ? 'unsent' : /SCHED/.test(x) ? 'scheduled' : /CANCEL/.test(x) ? 'stopped' : /FAIL|ERROR/.test(x) ? 'failed' : x === 'SENT' || !x ? 'sent' : 'running';
};
// Vignette d'un média du vault par son identifiant : cette adresse ne périme pas (voir « Médias v2 »).
const thumbOf = (cid, id) => `/media?p=${encodeURIComponent(`/api/creators/${cid}/medias/${id}/thumb`)}`;
/** Un message de masse d'OnlyFans (Substy) → la forme commune. */
function ofSend(m, names, senders, cid) {
  const text = plain(m.text || '');
  const inc = (m.includedListIds || []).map(String);
  const exc = (m.excludedListIds || []).map(String);
  const label = (ids) => ids.map((id) => names.get(id) || 'liste supprimée').join(', ');
  const fans = (m.userIds || []).length;
  const audience = [inc.length ? label(inc) : fans ? `${fans} fan${fans > 1 ? 's' : ''} choisi${fans > 1 ? 's' : ''}` : '—', exc.length ? `sauf ${label(exc)}` : '', m.includeOnlineFans ? 'fans en ligne seulement' : ''].filter(Boolean).join(' · ');
  const status = ofStatus(m.status);
  return {
    id: String(m.id), title: '', text, medias: (m.mediaIds || []).length, thumbs: (m.mediaIds || []).slice(0, 4).map((id) => ({ id: String(id), type: 'photo', thumb: thumbOf(cid, id) })), price: Number(m.price) || 0, smart: null,
    audience, status, at: Date.parse(m.scheduledAt || m.createdAt || '') || null,
    // Qui l'a créé depuis Bloom (retrouvé par le début du texte) ; sinon il vient d'OnlyFans ou d'un autre outil.
    by: senders.find((s) => s.text && text.startsWith(s.text.slice(0, 60)))?.name || null,
    total: m.recipientCount ?? null, sent: m.sentCount ?? null, viewed: m.viewedCount ?? null, bought: m.purchasedCount ?? 0, revenue: Math.round(Number(m.revenueGrossMinor) || 0),
    failed: 0, skipped: 0, removed: 0, pending: 0,
    canStop: false, canUnsend: !!m.canUnsend, canWithdraw: false, removeAt: null,
    note: m.revertedByName ? `Retiré par ${m.revertedByName}` : m.canUnsend && m.unsendDeadline ? `Peut encore être retiré jusqu’au ${new Date(m.unsendDeadline).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' })}` : null,
    messageId: null, opts: {}, included: inc, excluded: exc, onlineOnly: !!m.includeOnlineFans,
  };
}

export function v2BulkRoutes({ userFrom, send, creators, substy }) {
  return {
    // ?pf=of|mym, &creatorId= (sinon la première modèle), &page= (OnlyFans : l'historique vient de Substy par pages
    // de 20). Toute l'équipe peut lire (sauf les modèles) ; `canSend` = team leaders, managers et admins.
    'GET /api/v2/bulk': async (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' });
      const { p, pf, mine } = askOf(u, req, creators);
      const list = mine.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null })).sort((x, y) => x.name.localeCompare(y.name, 'fr'));
      const asked = p.get('creatorId') || '';
      const creator = mine.find((c) => String(c.id) === asked) || mine.find((c) => String(c.id) === list[0]?.id) || null;
      const cid = creator ? String(creator.id) : null;
      const head = { platform: pf, currency: pf === 'of' ? 'USD' : 'EUR', canSend: isBoss(u), list, model: creator ? { id: cid, name: creator.name, avatar: creator.avatar || null } : null };
      const empty = { sends: [], page: 1, pages: 1, total: 0, lists: [], autos: [], messages: [], counts: { active: 0, old: 0, interested: 0 }, groups: [], error: null };
      if (!cid) return send(res, 200, { ...head, ...empty });
      if (pf === 'mym') {
        warmMassDm(cid);
        const s = massDmState(cid);
        const sends = s.campaigns.map((c) => mymSend(c, s.groups));
        return send(res, 200, { ...head, ...empty, sends, total: sends.length, messages: s.messages, counts: s.counts, groups: s.groups });
      }
      const page = Math.max(1, Number(p.get('page')) || 1);
      const autos = all('SELECT * FROM smart_auto WHERE creator_id = ? ORDER BY created_at DESC LIMIT 200', cid).map(autoView);
      try {
        const [r, lists] = await Promise.all([
          substy.massMessages(cid, page, 20),
          kept(`lists:${cid}`, 60_000, async () => ((await substy.fanLists(cid))?.items || []).map((l) => ({ id: String(l.id), name: String(l.name || ''), type: String(l.type || ''), fans: Number(l.fanCount) || 0 }))),
        ]);
        const names = new Map(lists.map((l) => [l.id, l.name]));
        const senders = all("SELECT c.detail, u.name FROM ai_changes c LEFT JOIN users u ON u.id = c.user_id WHERE c.creator_id = ? AND c.what = 'mass' ORDER BY c.at DESC LIMIT 500", cid).map((x) => ({ text: J(x.detail, {}).text || '', name: x.name || null }));
        send(res, 200, { ...head, ...empty, sends: (r?.items || []).map((m) => ofSend(m, names, senders, cid)), page: r?.page || page, pages: r?.totalPages || 1, total: r?.total || 0, lists, autos });
      } catch (e) {
        send(res, 200, { ...head, ...empty, autos, error: `Substy ne répond pas pour l’instant : ${e.message}` });
      }
    },
  };
}
