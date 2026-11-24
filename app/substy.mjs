// Pont Bloom ↔ Substy : la session du compte agence (cookie Clerk « __client ») est gardée chiffrée sur le serveur.
// Toutes les minutes, Bloom en tire un jeton court (≈ 1 min) et appelle l'API interne de app.substy.ai avec
// `Authorization: Bearer <jeton>` (vérifié le 21/11/2026 : accepté sans cookies). Rien de Substy ne va au navigateur.
import { randomUUID } from 'node:crypto';

const APP = 'https://app.substy.ai';
const FAPI = 'https://clerk.substy.ai';
const CLERK_Q = '__clerk_api_version=2026-11-18&_clerk_js_version=6.46.2';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36';

/** Contrôle local des mots sensibles de l'agence (branché par `sensitive.mjs`). */
let bannedCheck = () => [];
export const setBannedCheck = (f) => (bannedCheck = f);

export class SubstyError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Nouvelle valeur du cookie __client si Clerk le fait tourner (Set-Cookie). */
function rotated(res) {
  const all = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  for (const c of all) {
    const m = /(?:^|\s)__client=([^;]+)/.exec(c);
    if (m && m[1] && m[1] !== '""') return m[1];
  }
  return null;
}

async function fapi(path, client, { method = 'GET', form = null } = {}) {
  const res = await fetch(`${FAPI}${path}${path.includes('?') ? '&' : '?'}${CLERK_Q}`, {
    method,
    headers: {
      cookie: `__client=${client}`,
      origin: APP,
      referer: `${APP}/`,
      'user-agent': UA,
      ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const next = rotated(res);
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const msg = body?.errors?.[0]?.long_message || body?.errors?.[0]?.message || `Clerk ${res.status}`;
    throw new SubstyError(res.status === 401 || res.status === 404 ? 401 : 502, msg, body?.errors?.[0]?.code ?? null);
  }
  return { body, next };
}

/**
 * Une session Substy. `load()` / `save()` lisent et écrivent le cookie (chiffré) là où le serveur le garde.
 * Le cookie peut tourner : on enregistre toujours la dernière valeur.
 */
export class SubstySession {
  constructor({ load, save, onState }) {
    this.load = load;
    this.save = save;
    this.onState = onState || (() => {});
    this.jwt = null;
    this.jwtExp = 0;
    this.sid = null;
    this.org = null;
    this.user = null;
    this.inflight = null;
  }

  /** Lit le client Clerk : session active, organisation (agence), utilisateur. */
  async inspect(client = this.load()) {
    if (!client) throw new SubstyError(401, 'Aucun compte Substy relié');
    const { body, next } = await fapi('/v1/client', client);
    if (next) this.save(next);
    const c = body?.response;
    const sessions = (c?.sessions || []).filter((s) => s.status === 'active');
    const s = sessions.find((x) => x.id === c?.last_active_session_id) || sessions[0];
    if (!s) throw new SubstyError(401, 'Session Substy expirée ou déconnectée : relie à nouveau le compte');
    const u = s.user || {};
    const email = (u.email_addresses || []).find((e) => e.id === u.primary_email_address_id)?.email_address || u.email_addresses?.[0]?.email_address || null;
    this.sid = s.id;
    this.org = s.last_active_organization_id || null;
    this.user = { id: u.id, email, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || email };
    return { sid: this.sid, org: this.org, user: this.user };
  }

  /** Jeton court pour l'API de app.substy.ai (renouvelé un peu avant expiration). */
  async token() {
    if (this.jwt && Date.now() < this.jwtExp - 10_000) return this.jwt;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        if (!this.sid) await this.inspect();
        const client = this.load();
        const { body, next } = await fapi(`/v1/client/sessions/${this.sid}/tokens`, client, {
          method: 'POST',
          form: this.org ? { organization_id: this.org } : {},
        });
        if (next) this.save(next);
        const jwt = body?.jwt;
        if (!jwt) throw new SubstyError(502, 'Clerk n’a pas renvoyé de jeton');
        const exp = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).exp * 1000;
        this.jwt = jwt;
        this.jwtExp = exp;
        this.onState({ ok: true, at: Date.now() });
        return jwt;
      } catch (e) {
        this.jwt = null;
        if (e.status === 401) this.sid = null;
        this.onState({ ok: false, at: Date.now(), error: e.message });
        throw e;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** Appel tRPC (format batch du site). */
  async call(proc, input, meta) {
    // Modèle MYM ajoutée dans Bloom sans Substy (« mym-… ») : rien à demander à Substy.
    if (typeof input?.creatorId === 'string' && input.creatorId.startsWith('mym-')) throw new SubstyError(409, 'Cette modèle n’est pas chez Substy (pas d’IA Substy pour elle).', 'NOT_ON_SUBSTY');
    const go = async () => {
      const jwt = await this.token();
      return fetch(`${APP}/api/trpc/${proc}?batch=1`, {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json', origin: APP, referer: `${APP}/`, 'user-agent': UA },
        body: JSON.stringify({ 0: input === undefined ? { json: null, meta: { values: ['undefined'], v: 1 } } : meta ? { json: input, meta } : { json: input } }),
        signal: AbortSignal.timeout(30_000),
      });
    };
    let res = await go();
    if (res.status === 401) {
      this.jwt = null;
      res = await go();
    }
    let body = null;
    try { body = await res.json(); } catch {}
    const r = Array.isArray(body) ? body[0] : body;
    if (r?.error) {
      const e = r.error.json || r.error;
      throw new SubstyError(e?.data?.httpStatus || res.status || 500, e?.message || 'Erreur Substy', e?.data?.code || null);
    }
    if (!res.ok) throw new SubstyError(res.status, `Substy ${res.status}`);
    return r?.result?.data?.json;
  }

  // --- Raccourcis (formats relevés sur le site le 21/11/2026) ---
  me() { return this.call('auth.me'); }
  creators() { return this.call('creators.getCreators', { fetchSettings: true }); }
  chats(creatorId, { limit = 30, cursor, query = '', unreadOnly = false, aiStatus = 'all', handoffOnly = false } = {}) {
    return this.call('chats.list', { creatorId, limit, listId: null, inboxIds: [], aiStatus, handoffOnly, query, order: 'recent', languages: [], platformFilters: [], withSpend: true, unreadOnly, direction: 'forward', ...(cursor ? { cursor } : {}) });
  }
  messages(creatorId, fanId, { limit = 30, cursor } = {}) {
    return this.call('chats.messages', { creatorId, fanId, limit, isUnread: false, direction: 'forward', ...(cursor ? { cursor } : {}) });
  }
  fan(creatorId, fanId) { return this.call('fans.get', { creatorId, fanId }); }
  /** Photo, nom et pseudo de chaque créatrice sur sa plateforme (OnlyFans / MYM). */
  /**
   * Statistiques des « employés » de Substy, IA comprises (page Statistiques → Employés) : pour chaque IA, ses ventes,
   * PPV envoyés / achetés, messages, taux de déblocage, et une courbe par jour (ia / employés). Montants dans `currency`.
   */
  employeesStats({ startDate, endDate, creatorIds } = {}) { return this.call('agency.employees.getEmployeesStats', { startDate, endDate, ...(creatorIds?.length ? { creatorIds } : {}) }); }
  platformDetails(creatorIds) { return this.call('creators.getCreatorPlatformDetails', { creatorIds }); }
  validate(content) {
    const hit = bannedCheck(content);
    if (hit.length) return Promise.resolve({ valid: false, bannedWords: hit });
    return this.call('agency.bannedWords.validateContent', { content });
  }
  vaultLists(creatorId) { return this.call('medias.getLists', { creatorId }); }
  /** `type` : 'PHOTO' | 'VIDEO' | 'AUDIO' (filtre fait par Substy, vérifié le 23/11/2026). */
  vaultMedias(creatorId, { listId, cursor, limit = 40, type } = {}) {
    return this.call('medias.getMedias', { creatorId, limit, sortOrder: 'newest', direction: 'forward', ...(listId ? { listId } : {}), ...(cursor ? { cursor } : {}), ...(type ? { type } : {}) });
  }
  /** Image / vidéo via le relais de Substy (chemins « /api/creators/<id>/medias/… » fournis par leur API). */
  async media(path) {
    // Deux formes : « …/medias/view?url=… » (messages, vault) et « …/medias/<id>/thumb|full|preview » (étapes des scripts).
    if (!/^\/api\/creators\/[\w-]+\/medias\/(view\?|[\w-]+\/(thumb|full|preview)(\?|$))/.test(path)) throw new SubstyError(400, 'Chemin de média invalide');
    const jwt = await this.token();
    return fetch(`${APP}${path}`, { headers: { authorization: `Bearer ${jwt}`, 'user-agent': UA }, signal: AbortSignal.timeout(30_000) });
  }
  /** Configuration de l'IA d'une créatrice (réglages + personnalité choisie). Lecture seule. */
  aiSettings(creatorId) { return this.call('settings.getSettings', { creatorId }); }
  /** Personnalités disponibles (fournies par Substy + créées par l'agence). Lecture seule. */
  voicePresets(creatorId) { return this.call('settings.voicePreset.getAll', { creatorId }); }
  // --- Scripts (les mêmes pour l'IA et les chatteurs). Lecture seule.
  scripts(creatorId) { return this.call('scripts.getScripts', { creatorId }); }
  scriptSteps(creatorId, scriptId) { return this.call('scripts.templates.getTemplates', { creatorId, scriptId }); }
  /** Scripts d'un fan, avec pour chaque étape : déjà envoyée ? achetée ? */
  fanScripts(creatorId, fanId) { return this.call('creators.fans.getFanScripts', { creatorId, fanId }); }
  // --- Scripts de l'IA : écriture (formats relevés le 23/11/2026 sur les erreurs de validation de Substy, sans rien modifier).
  //  updateScript : {creatorId, id, name, description, startTime, endTime, enabled, isCustom, isAi, isHuman, targetFanListIds}
  //  templates.updateTemplate : {creatorId, id, template: {name, price, scriptId, content, medias, basePrice, maxPrice,
  //    postMediaMessages, pricingMode FIXED|SMART, intervalMin, intervalMax, isAiCaption, isLockedText, language, creatorTags}}
  //  Média : {id, price, type PHOTO|VIDEO|AUDIO, files, createdAt} ; relance (postMediaMessages) : {waitTime, medias, …}.
  updateScript(input) { return this.call('scripts.updateScript', input); }
  createScript(input) { return this.call('scripts.createScript', input); }
  deleteScript(creatorId, id) { return this.call('scripts.deleteScript', { creatorId, id }); }
  updateTemplate(creatorId, id, template) { return this.call('scripts.templates.updateTemplate', { creatorId, id, template }); }
  createTemplate(creatorId, template) { return this.call('scripts.templates.createTemplate', { creatorId, template }); }
  deleteTemplate(creatorId, id) { return this.call('scripts.templates.deleteTemplate', { creatorId, id }); }
  /** Stats des scripts (page Scripts → Analytics de Substy) : envoyés, payés, taux, revenus, courbe par jour, par script. */
  scriptStats(creatorId, { start, end, page = 1, pageSize = 50, sortBy = 'revenue', search } = {}) {
    const input = { creatorId, page, pageSize, sortBy, ...(search ? { search } : {}) };
    const values = {};
    if (start) (input.startDate = new Date(start).toISOString()), (values.startDate = ['Date']);
    if (end) (input.endDate = new Date(end).toISOString()), (values.endDate = ['Date']);
    return this.call('scripts.globalStats', input, Object.keys(values).length ? { values } : undefined);
  }
  // --- Envois groupés (format relevé sur le site de Substy le 22/11/2026, requête bloquée avant envoi).
  /** Historique des messages groupés : `{items, total, page, pageSize, totalPages}`. */
  massMessages(creatorId, page = 1, pageSize = 20) { return this.call('creators.massMessage.list', { creatorId, page, pageSize }); }
  /** Listes de fans de la créatrice (Fans, Recent, paliers de dépense…) avec leur nombre de fans. */
  fanLists(creatorId) { return this.call('fans.lists.list', { creatorId, limit: 100, isChat: false }); }
  /** Nouveau message groupé. `scheduledAt` (ISO) et `autoUnsendAfterSeconds` seulement s'ils sont donnés, comme le site. */
  createMass(creatorId, { text, price = 0, mediaIds = [], includedListIds = [], excludedListIds = [], userIds = [], includeOnlineFans = false, scheduledAt, autoUnsendAfterSeconds }) {
    const input = { creatorId, text, lockedText: false, price, mediaIds, previewIds: [], includedListIds, excludedListIds, userIds, includeOnlineFans, tags: [] };
    if (scheduledAt) input.scheduledAt = scheduledAt;
    if (autoUnsendAfterSeconds) input.autoUnsendAfterSeconds = autoUnsendAfterSeconds;
    return this.call('creators.massMessage.create', input);
  }

  // --- Écriture de la configuration IA (formats relevés sur de vrais enregistrements du site, 22/11/2026) ---
  /** Réglages du chatteur IA : on envoie exactement les champs que le site de Substy envoie. */
  updateSettings(creatorId, s) {
    const KEYS = ['enable', 'mode', 'transitionTimingMode', 'transitionMessage', 'standardEmojis', 'sextingEmojis', 'enableFanSpendLimit', 'maxFanSpend', 'fanSpendOperator', 'enableSubscriptionLimit', 'maxSubscriptionDurationValue', 'maxSubscriptionDurationUnit', 'subscriptionDurationOperator', 'allowedSubscriptionTypes', 'aiMode', 'aiScheduleMode', 'scriptRotationIntervalHours', 'includedFanLists', 'excludedFanLists'];
    return this.call('settings.updateSettings', { ...Object.fromEntries(KEYS.map((k) => [k, s[k] ?? null])), creatorId });
  }
  /** Personnalité de l'IA. */
  setVoicePreset(creatorId, voicePresetId) { return this.call('settings.updateVoicePresets', { creatorId, voicePresetId }); }
  /** Fiche de la créatrice : la fiche complète, comme le site. */
  updateCreator(c) {
    const KEYS = ['name', 'age', 'gender', 'label', 'timezone', 'primaryLanguage', 'otherLanguages', 'description', 'birthday', 'weight', 'shoeSize', 'braCupSize', 'ethnicity', 'profession', 'appearance', 'hairColor', 'eyeColor', 'living', 'pseudo', 'isNearby', 'physicalCustomAttributes', 'interestsCustomAttributes'];
    return this.call('creators.updateCreator', { ...Object.fromEntries(KEYS.map((k) => [k, c[k] ?? null])), id: c.id });
  }
  /** Revenus d'une période (dates AAAA-MM-JJ ; creatorIds vide = toute l'agence). */
  revenue(creatorIds, startDate, endDate, earningsMode = 'net') { return this.call('revenue.overview', { creatorIds, startDate, endDate, earningsMode }); }
  /** Dernières ventes de l'agence (PPV, pourboires, posts), comme « Live latest purchases » de Substy. */
  recentSales() { return this.call('agency.getRecentSales'); }
  aiLogs(creatorId, fanId, limit = 50) { return this.call('creators.fans.getFanAiLogs', { creatorId, fanId, limit }); }
  /**
   * Site OnlyFans / MYM intégré de Substy (« Browser », 4 h) : ouvre ou reprend la session d'une créatrice.
   * Renvoie { sessionToken, accessOrigin } (format relevé sur le site de Substy le 22/11/2026). L'autorisation se fait
   * ensuite dans le navigateur de la personne, connectée à Substy (page …/browser/sessions/<jeton>/access de Substy).
   */
  browserSession(creatorId) { return this.call('agency.browser.getOrCreateSession', { creatorId, label: 'Bloom CRM' }); }
  /**
   * Supprimer (« unsend ») un message envoyé au fan. `messageId` = l'identifiant OnlyFans du message (un nombre), pas
   * l'identifiant provisoire (uuid) que Substy donne juste après l'envoi : avec celui-là, Substy répond « Internal server
   * error ». Possible seulement tant que `cancelSeconds` du message n'est pas à 0 (24 h sur OnlyFans).
   */
  /** Marquer la conversation lue chez Substy (procédure vue dans le code du site). */
  markRead(creatorId, fanId, messageId) { return this.call('messages.markRead', { creatorId, fanId: String(fanId), messageId: String(messageId) }); }
  unsend(creatorId, fanId, messageId) { return this.call('messages.unsend', { creatorId, fanId: String(fanId), messageId: String(messageId) }); }
  setAi(creatorId, fanId, on) { return this.call(on ? 'fans.ai.enable' : 'fans.ai.disable', { creatorId, fanId }); }
  send(creatorId, fanId, { message = '', medias = [], price, replyId = null, templateId } = {}) {
    return this.call('messages.send', {
      creatorId, fanId, message, previews: [], replyId, idempotencyKey: randomUUID(),
      ...(medias.length ? { medias } : {}), ...(price ? { price } : {}), ...(templateId ? { templateId } : {}),
    });
  }

  /**
   * Flux temps réel d'une créatrice (SSE `creators.onMessage`). Reconnexion automatique.
   * `onEvent(type, data)` reçoit chaque événement ; renvoie une fonction pour arrêter.
   */
  stream(creatorId, onEvent, onStatus = () => {}) {
    let stop = false;
    let ctrl = null;
    const loop = async () => {
      let wait = 2000;
      while (!stop) {
        try {
          const jwt = await this.token();
          ctrl = new AbortController();
          const url = `${APP}/api/trpc/creators.onMessage?input=${encodeURIComponent(JSON.stringify({ json: { creatorId } }))}`;
          const res = await fetch(url, { headers: { authorization: `Bearer ${jwt}`, accept: 'text/event-stream', origin: APP, 'user-agent': UA }, signal: ctrl.signal });
          if (!res.ok || !res.body) throw new SubstyError(res.status, `Flux ${res.status}`);
          onStatus({ live: true, at: Date.now() });
          wait = 2000;
          const dec = new TextDecoder();
          let buf = '';
          let ev = 'message';
          for await (const chunk of res.body) {
            buf += dec.decode(chunk, { stream: true });
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i).replace(/\r$/, '');
              buf = buf.slice(i + 1);
              if (line.startsWith('event:')) ev = line.slice(6).trim();
              else if (line.startsWith('data:')) {
                let data = line.slice(5).trim();
                try { data = JSON.parse(data); } catch {}
                try { onEvent(ev, data?.json ?? data); } catch {}
              } else if (line === '') ev = 'message';
            }
          }
          // Le serveur ferme le flux (le jeton a expiré au bout d'une minute) : on se reconnecte tout de suite.
          onStatus({ live: false, at: Date.now(), reason: 'fermé' });
        } catch (e) {
          if (stop) break;
          onStatus({ live: false, at: Date.now(), reason: e.message });
          await new Promise((r) => setTimeout(r, wait));
          wait = Math.min(wait * 2, 60_000);
        }
      }
    };
    loop();
    return () => {
      stop = true;
      ctrl?.abort();
    };
  }
}
