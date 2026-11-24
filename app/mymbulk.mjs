// MYM → Envois groupés. Première étape : lecture brute des adresses « push » de MYM (pour caler les formats).
import { API, isLinked, mym } from './mym.mjs';
import { canSee, seesAll } from './team.mjs';

const shape = (o, d = 0) =>
  Array.isArray(o) ? [o.length, o.length ? shape(o[0], d + 1) : null]
  : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).slice(0, 40).map(([k, v]) => [k, d < 4 ? shape(v, d + 1) : '…']))
  : typeof o === 'string' ? (o.length > 40 ? `str(${o.length})` : o)
  : o;

export function mymBulkRoutes({ userFrom, send, creators }) {
  return {
    'GET /api/mym/push/raw': async (req, res) => {
      const u = userFrom(req);
      if (!u || !seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' });
      const cid = new URL(req.url, 'http://x').searchParams.get('creatorId');
      const c = creators().find((x) => x.id === cid && canSee({ ...u, pf: null }, x.id));
      if (!c || !isLinked(c.id)) return send(res, 404, { error: 'Modèle MYM inconnue ou pas reliée' });
      const out = {};
      for (const p of ['/v2/pushes', '/creators/me/audience', '/v2/pushes/calendar/restrictions', '/v2/pushes/calendar', '/v2/pushes/prices', '/v2/pushes/discount-durations']) {
        out[p] = await mym(c.id, p, { base: API }).then(shape, (e) => ({ error: e.message }));
      }
      send(res, 200, out);
    },
  };
}
