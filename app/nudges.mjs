// Nudge IA (Automatisation → Nudge IA) : les automatisations de SUBSTY, pilotées depuis Bloom. OnlyFans et MYM.
// Un « nudge IA » = une automatisation Substy dont le déclencheur est « le fan passe en ligne » : 1 à 3 minutes après,
// l'IA lui écrit un message adapté à la conversation (le texte enregistré sert de base).
// Relevé le 25/11/2026 sur app.substy.ai (CRM → Automations), en lecture :
//  - `creators.automations.getByCreator { creatorId, page, pageSize }` → `{ automations, total, … }`. Une automatisation
//    est une fiche à plat, pas un vrai graphe : `trigger` (FAN_COMES_ONLINE, FAN_SENDS_MESSAGE,
//    FAN_SUBSCRIBES_FIRST_TIME), `enabled`, `effectiveType` (RANDOM_DELAY / IMMEDIATELY), `randomDelayMin` / `Max`
//    (minutes), `frequency` (SEND_ONCE / SEND_EVERY_TIME), filtres (`totalSpendMin` / `Max`, `excludeRecentlyMessaged`
//    + `excludeRecentlyMessagedTime` en secondes, `excludeUnreadMessages`, `fanListsIncluded` / `Excluded`), et
//    `sequences[].messages[]` (`content`, `aiGenerated`, `price`, `medias`, `delay`), plus `totalSent`, `totalEarned`.
//  - lus dans le code du site (jamais appelés pour de vrai par Bloom avant qu'un admin clique) :
//    `toggle { automationId, enabled }`, `duplicate { automationId }`, `duplicateToCreator { automationId, creatorId }`,
//    `delete { automationId }`.
//  - `create { creatorId, data, templateType }` et `update { automationId, data }` : la forme de `data` (filtres,
//    délai, séquences) n'est pas connue avec certitude → Bloom ne crée ni ne modifie le contenu d'un nudge pour
//    l'instant. On part d'un nudge fait une fois dans Substy, que Bloom copie vers les autres modèles.
// Allumer un nudge fait écrire l'IA à de vrais fans : admins et managers seulement, noté dans le journal.
import { canSee, isBoss, seesAll } from './team.mjs';
import { logAction } from './journal.mjs';

const TRIGGER = { FAN_COMES_ONLINE: 'online', FAN_SENDS_MESSAGE: 'message', FAN_SUBSCRIBES_FIRST_TIME: 'subscribe' };
const view = (a) => ({
  id: a.id,
  name: a.name || 'Automatisation',
  enabled: !!a.enabled,
  trigger: TRIGGER[a.trigger] || String(a.trigger || '').toLowerCase(),
  delay: a.effectiveType === 'RANDOM_DELAY' ? { min: a.randomDelayMin ?? null, max: a.randomDelayMax ?? null } : null,
  everyTime: a.frequency === 'SEND_EVERY_TIME',
  spendMin: a.totalSpendMin != null ? Number(a.totalSpendMin) : null,
  spendMax: a.totalSpendMax != null && Number(a.totalSpendMax) > 0 ? Number(a.totalSpendMax) : null,
  skipRecentHours: a.excludeRecentlyMessaged ? Math.round((a.excludeRecentlyMessagedTime || 0) / 360) / 10 : null,
  skipUnread: !!a.excludeUnreadMessages,
  listsIn: (a.fanListsIncluded || []).length,
  listsOut: (a.fanListsExcluded || []).length,
  messages: (a.sequences || []).flatMap((s) => s.messages || []).map((m) => ({ text: String(m.content || '').slice(0, 600), ai: !!m.aiGenerated, price: m.price ? Number(m.price) : 0, medias: (m.medias || []).length })),
  sent: a.totalSent || 0,
  earned: Number(a.totalEarned) || 0,
  createdBy: typeof a.createdByEmployeeId === 'string' && !/^(user_|orgmem_)/.test(a.createdByEmployeeId) ? a.createdByEmployeeId : null,
  createdAt: a.createdAt || null,
  pausedReason: a.autoPausedReason || null,
  endsAt: a.endDate || a.expiryDate || null,
});

export function nudgeRoutes({ substy, userFrom, send, body, creators }) {
  const pick = (req, res, cid, admin = false) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    if (admin && !seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    const c = creators().find((x) => String(x.id) === String(cid || '') && canSee({ ...u, pf: null }, x.id));
    if (!c) return send(res, 404, { error: 'Modèle inconnue' }), null;
    if (String(c.id).startsWith('mym-')) return send(res, 409, { error: 'Cette modèle n’est pas chez Substy : pas de nudge IA pour elle.' }), null;
    return { u, c, cid: String(c.id) };
  };
  const list = async (cid) => ((await substy.call('creators.automations.getByCreator', { creatorId: cid, page: 1, pageSize: 50 }))?.automations || []);
  /** L'automatisation `id` appartient bien à cette modèle (relu chez Substy avant toute action). */
  const own = async (cid, id) => (await list(cid)).find((a) => a.id === String(id || '')) || null;

  return {
    'GET /api/nudges': async (req, res) => {
      const x = pick(req, res, new URL(req.url, 'http://x').searchParams.get('creatorId'));
      if (!x) return;
      const all = (await list(x.cid)).map(view);
      send(res, 200, { canEdit: seesAll(x.u), creator: x.c.name, nudges: all.filter((a) => a.trigger === 'online'), others: all.filter((a) => a.trigger !== 'online') });
    },
    'POST /api/nudges/toggle': async (req, res) => {
      const b = await body(req);
      const x = pick(req, res, b.creatorId, true);
      if (!x) return;
      const a = await own(x.cid, b.id);
      if (!a) return send(res, 404, { error: 'Automatisation introuvable sur cette modèle' });
      await substy.call('creators.automations.toggle', { automationId: a.id, enabled: !!b.enabled });
      logAction(x.u, b.enabled ? 'Nudge IA activé' : 'Nudge IA coupé', { creatorId: x.cid, details: a.name });
      send(res, 200, { ok: true });
    },
    // Copier un nudge d'une modèle vers une autre (y compris d'OnlyFans vers MYM). La copie arrive telle que Substy la
    // crée ; Bloom relit ensuite la liste pour montrer son état.
    'POST /api/nudges/copy': async (req, res) => {
      const b = await body(req);
      const from = pick(req, res, b.creatorId, true);
      if (!from) return;
      const to = pick(req, res, b.to, true);
      if (!to) return;
      const a = await own(from.cid, b.id);
      if (!a) return send(res, 404, { error: 'Automatisation introuvable sur la modèle de départ' });
      if (b.confirm !== true) return send(res, 400, { error: 'Confirmation manquante' });
      await (from.cid === to.cid ? substy.call('creators.automations.duplicate', { automationId: a.id }) : substy.call('creators.automations.duplicateToCreator', { automationId: a.id, creatorId: to.cid }));
      logAction(from.u, 'Nudge IA copié', { creatorId: to.cid, details: `${a.name} (depuis ${from.c.name})` });
      send(res, 200, { ok: true });
    },
    'POST /api/nudges/delete': async (req, res) => {
      const b = await body(req);
      const x = pick(req, res, b.creatorId, true);
      if (!x) return;
      const a = await own(x.cid, b.id);
      if (!a) return send(res, 404, { error: 'Automatisation introuvable sur cette modèle' });
      if (b.confirm !== true) return send(res, 400, { error: 'Confirmation manquante' });
      await substy.call('creators.automations.delete', { automationId: a.id });
      logAction(x.u, 'Nudge IA supprimé', { creatorId: x.cid, details: a.name });
      send(res, 200, { ok: true });
    },
  };
}
