// Scripts → onglet « IA Substy » : voir ET modifier les scripts de l'IA de Substy (comme app.substy.ai/scripts),
// et leurs chiffres (Analytics). Admins et managers seulement : un script change ce que l'IA envoie aux fans.
// Bloom relit toujours le script / l'étape chez Substy juste avant d'écrire, et ne change que les champs touchés.
// Chaque modification est notée dans `ai_changes` (affichée en bas de la page IA).
import { all, run } from './store.mjs';
import { canSee, seesAll } from './team.mjs';
import { mediaView, plain } from './chat.mjs';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const MEDIA_TYPE = (t) => (/video/i.test(t) ? 'VIDEO' : /audio/i.test(t) ? 'AUDIO' : 'PHOTO');

/** Étape telle que Substy l'attend, à partir de l'étape lue (les champs inconnus sont laissés de côté). */
function templateOf(t) {
  return {
    name: String(t.name ?? ''),
    price: num(t.price),
    scriptId: String(t.scriptId),
    content: String(t.content ?? ''),
    medias: (t.medias || []).map((m) => ({ ...m, id: String(m.id), price: num(m.price), type: MEDIA_TYPE(m.type), files: m.files || {}, createdAt: String(m.createdAt || new Date().toISOString()) })),
    basePrice: num(t.basePrice),
    maxPrice: num(t.maxPrice),
    // Les relances se lisent avec « media » (liste) et s'écrivent avec « medias » : on recopie la même liste.
    postMediaMessages: (t.postMediaMessages || []).map((f) => ({ ...f, waitTime: num(f.waitTime), medias: f.medias || f.media || [] })),
    pricingMode: t.pricingMode === 'SMART' ? 'SMART' : 'FIXED',
    ...(t.intervalMin != null ? { intervalMin: num(t.intervalMin) } : {}),
    ...(t.intervalMax != null ? { intervalMax: num(t.intervalMax) } : {}),
    isAiCaption: !!t.isAiCaption,
    isLockedText: !!t.isLockedText,
    ...(t.language ? { language: String(t.language) } : {}),
    creatorTags: t.creatorTags || [],
  };
}
const scriptInput = (s) => ({
  name: String(s.name ?? ''),
  description: String(s.description ?? ''),
  // Plage horaire : Substy la rend vide (null) mais veut un texte à l'écriture ; « » = pas de plage (vérifié le 23/11/2026).
  startTime: s.startTime ?? '',
  endTime: s.endTime ?? '',
  enabled: !!s.enabled,
  isCustom: !!s.isCustom,
  isAi: !!s.isAi,
  isHuman: !!s.isHuman,
  targetFanListIds: s.targetFanListIds || [],
});

export function aiScriptRoutes({ substy, userFrom, send, body }) {
  const auth = (req, res, cid, edit) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (u.role === 'model' || !canSee({ ...u, pf: null }, cid)) return send(res, 403, { error: 'Tu n’as pas accès à cette créatrice.' }), null;
    if (edit && !seesAll(u)) return send(res, 403, { error: 'Seuls les admins et managers modifient les scripts de l’IA.' }), null;
    return u;
  };
  const log = (u, cid, what, detail) => run('INSERT INTO ai_changes (user_id, creator_id, what, detail, at) VALUES (?, ?, ?, ?, ?)', u.id, cid, what, JSON.stringify(detail), Date.now());
  const fail = (res, e) => send(res, e.status && e.status < 500 ? 400 : 502, { error: `Substy : ${e.message || 'erreur'}` });
  const scriptsOf = async (cid) => (await substy.scripts(cid)) || [];

  return {
    /** Étapes d'un script avec tout ce qui se modifie (texte, prix, mode de prix, délais, légende IA…). */
    'GET /api/ai-scripts/steps': async (req, res) => {
      const p = new URL(req.url, 'http://x').searchParams;
      const cid = String(p.get('creatorId') || '');
      const u = auth(req, res, cid);
      if (!u) return;
      try {
        const steps = (await substy.scriptSteps(cid, String(p.get('scriptId')))) || [];
        const s = (await scriptsOf(cid)).find((x) => x.id === p.get('scriptId'));
        send(res, 200, {
          canEdit: seesAll(u),
          script: s ? { id: s.id, name: plain(s.name), description: plain(s.description), enabled: !!s.enabled, ai: !!s.isAi, human: !!s.isHuman } : null,
          steps: steps
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((t) => ({
              id: t.id,
              position: t.position ?? 0,
              name: plain(t.name),
              content: String(t.content ?? ''),
              price: num(t.price),
              pricingMode: t.pricingMode === 'SMART' ? 'SMART' : 'FIXED',
              basePrice: num(t.basePrice),
              maxPrice: num(t.maxPrice),
              intervalMin: t.intervalMin ?? null,
              intervalMax: t.intervalMax ?? null,
              aiCaption: !!t.isAiCaption,
              locked: !!t.isLockedText,
              medias: (t.medias || []).map((m) => mediaView({ ...m, files: { thumb: m.files?.thumb || m.files?.preview, full: m.files?.full } })),
              followUps: (t.postMediaMessages || []).length,
            })),
        });
      } catch (e) {
        fail(res, e);
      }
    },
    /** Créer un script, ou modifier nom / description / activé / IA / chatteurs. */
    'POST /api/ai-scripts/script': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      try {
        if (!b.id) {
          const name = String(b.name || '').trim();
          if (!name) return send(res, 400, { error: 'Donne un nom au script' });
          const r = await substy.createScript({ creatorId: cid, name, ...(b.description ? { description: String(b.description) } : {}) });
          log(u, cid, 'script', { created: name });
          return send(res, 200, { id: r?.id ?? null });
        }
        const cur = (await scriptsOf(cid)).find((x) => x.id === b.id);
        if (!cur) return send(res, 404, { error: 'Script introuvable chez Substy' });
        const next = scriptInput(cur);
        const changed = {};
        for (const [k, key] of [['name', 'name'], ['description', 'description'], ['enabled', 'enabled'], ['ai', 'isAi'], ['human', 'isHuman']])
          if (b[k] !== undefined && b[k] !== next[key]) (changed[key] = [next[key], b[k]]), (next[key] = typeof next[key] === 'boolean' ? !!b[k] : String(b[k]));
        if (!next.name.trim()) return send(res, 400, { error: 'Le nom est obligatoire' });
        if (Object.keys(changed).length) {
          await substy.updateScript({ creatorId: cid, id: cur.id, ...next });
          log(u, cid, 'script', { id: cur.id, name: next.name, changed });
        }
        send(res, 200, { ok: true });
      } catch (e) {
        fail(res, e);
      }
    },
    'POST /api/ai-scripts/script/delete': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      try {
        await substy.deleteScript(cid, String(b.id));
        log(u, cid, 'script', { deleted: String(b.name || b.id) });
        send(res, 200, { ok: true });
      } catch (e) {
        fail(res, e);
      }
    },
    /** Créer ou modifier une étape (texte, prix, mode de prix, délais, légende IA, texte verrouillé). */
    'POST /api/ai-scripts/step': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const sid = String(b.scriptId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      try {
        const steps = (await substy.scriptSteps(cid, sid)) || [];
        const cur = b.id ? steps.find((t) => t.id === b.id) : null;
        if (b.id && !cur) return send(res, 404, { error: 'Étape introuvable chez Substy' });
        const t = cur ? templateOf({ ...cur, scriptId: cur.scriptId || sid }) : templateOf({ scriptId: sid, name: '', content: '', price: 0, basePrice: 0, maxPrice: 0, medias: [], postMediaMessages: [] });
        const changed = {};
        const set = (k, v) => {
          if (v === undefined || v === t[k]) return;
          changed[k] = [t[k], v];
          t[k] = v;
        };
        if (b.name !== undefined) set('name', String(b.name).slice(0, 120));
        if (b.content !== undefined) set('content', String(b.content).slice(0, 5000));
        if (b.price !== undefined) set('price', Math.max(0, num(b.price)));
        if (b.pricingMode !== undefined) set('pricingMode', b.pricingMode === 'SMART' ? 'SMART' : 'FIXED');
        if (b.basePrice !== undefined) set('basePrice', Math.max(0, num(b.basePrice)));
        if (b.maxPrice !== undefined) set('maxPrice', Math.max(0, num(b.maxPrice)));
        if (b.intervalMin !== undefined && b.intervalMin !== null) set('intervalMin', Math.max(0, num(b.intervalMin)));
        if (b.intervalMax !== undefined && b.intervalMax !== null) set('intervalMax', Math.max(0, num(b.intervalMax)));
        if (b.aiCaption !== undefined) set('isAiCaption', !!b.aiCaption);
        if (b.locked !== undefined) set('isLockedText', !!b.locked);
        if (t.pricingMode === 'SMART' && t.maxPrice && t.basePrice > t.maxPrice) return send(res, 400, { error: 'Prix de départ plus haut que le prix max' });
        if (!t.content.trim() && !t.medias.length && !t.isAiCaption) return send(res, 400, { error: 'Écris un message (ou laisse l’IA écrire la légende)' });
        if (cur) {
          if (!Object.keys(changed).length) return send(res, 200, { ok: true });
          await substy.updateTemplate(cid, cur.id, t);
        } else await substy.createTemplate(cid, t);
        log(u, cid, 'script-step', { scriptId: sid, step: cur?.id || 'new', name: t.name, changed: Object.keys(changed) });
        send(res, 200, { ok: true });
      } catch (e) {
        fail(res, e);
      }
    },
    'POST /api/ai-scripts/step/delete': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      try {
        await substy.deleteTemplate(cid, String(b.id));
        log(u, cid, 'script-step', { scriptId: String(b.scriptId || ''), deleted: String(b.id) });
        send(res, 200, { ok: true });
      } catch (e) {
        fail(res, e);
      }
    },
    /** Analytics des scripts de l'IA (chiffres de Substy) sur une période. */
    'GET /api/ai-scripts/stats': async (req, res) => {
      const p = new URL(req.url, 'http://x').searchParams;
      const cid = String(p.get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      try {
        const d = (await substy.scriptStats(cid, { start: p.get('start') || undefined, end: p.get('end') || undefined, sortBy: p.get('sortBy') || 'revenue' })) || {};
        const scripts = await scriptsOf(cid).catch(() => []);
        const meta = new Map(scripts.map((s) => [s.id, s]));
        send(res, 200, {
          currency: d.currency || 'USD',
          totals: { sent: num(d.totalSent), paid: num(d.totalPaid), unlockRate: num(d.unlockRate), revenue: num(d.totalRevenue) },
          daily: (d.dailySeries || []).map((x) => ({ date: x.date, sent: num(x.sent), paid: num(x.paid), revenue: num(x.revenue) })),
          scripts: (d.scripts || []).map((x) => ({ id: x.id, name: plain(x.name), sent: num(x.totalSent), paid: num(x.totalPaid), unlockRate: num(x.unlockRate), revenue: num(x.revenue), enabled: !!meta.get(x.id)?.enabled, ai: !!meta.get(x.id)?.isAi, human: !!meta.get(x.id)?.isHuman, steps: meta.get(x.id)?._count?.messageTemplates ?? null })),
          // Scripts jamais envoyés sur la période (pour les voir aussi).
          idle: scripts.filter((s) => !(d.scripts || []).some((x) => x.id === s.id)).map((s) => ({ id: s.id, name: plain(s.name), enabled: !!s.enabled, ai: !!s.isAi, human: !!s.isHuman, steps: s._count?.messageTemplates ?? null })),
          changes: all("SELECT a.what, a.detail, a.at, u.name FROM ai_changes a LEFT JOIN users u ON u.id = a.user_id WHERE a.creator_id = ? AND a.what LIKE 'script%' ORDER BY a.at DESC LIMIT 15", cid),
        });
      } catch (e) {
        fail(res, e);
      }
    },
  };
}
