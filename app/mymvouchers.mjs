// MYM → Messages → « Bon de réduction » (copie de « Gestion des Vouchers » de MyPulse), en direct avec le compte MYM relié.
// Relevé le 23/11/2026 sur creators.mym.fans (formulaire lu, AUCUN bon créé pour l'essai) :
//  - page de création : GET /app/account/tools/voucher/create → formulaire « voucher » envoyé en POST sur la même adresse
//    (application/x-www-form-urlencoded) : voucher[code] (25 caractères au plus, facultatif), voucher[duration]
//    (3hours, 6hours, 12hours, 1days, 2days, 7days, 1months, 3months, UNLIMITED), voucher[product] (subscription, media,
//    booking), voucher[discountUnit] (currency, percent), voucher[discount], voucher[maxOfUse] (facultatif), voucher[_token].
//  - suppression : /app/account/tools/voucher/delete/<code>.
//  - la liste de MYM n'a pas pu être relevée (le compte n'avait aucun bon) : Bloom affiche les bons créés depuis Bloom.
// ⚠️ Création et suppression pas encore vérifiées sur un vrai bon : MYM répond par une redirection quand c'est accepté.
import { all, db, one, run } from './store.mjs';
import { canSee, seesAll } from './team.mjs';
import { isLinked, mymSiteRaw } from './mym.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS mym_vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id TEXT NOT NULL, code TEXT NOT NULL, duration TEXT NOT NULL, product TEXT NOT NULL, unit TEXT NOT NULL,
    discount REAL NOT NULL, max_use INTEGER, created_by TEXT, created_at INTEGER NOT NULL, deleted_at INTEGER
  );
`);

const DURATIONS = { '3hours': 3 * 3600e3, '6hours': 6 * 3600e3, '12hours': 12 * 3600e3, '1days': 864e5, '2days': 2 * 864e5, '7days': 7 * 864e5, '1months': 30 * 864e5, '3months': 90 * 864e5, UNLIMITED: 0 };
const PRODUCTS = ['subscription', 'media', 'booking'];
const PATH = '/app/account/tools/voucher';
const unhtml = (s) => String(s).replace(/<[^>]*>/g, ' ').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function mymVoucherRoutes({ userFrom, send, body, creators }) {
  const pick = (req, res, cid, edit) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' }), null;
    if (edit && !seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    const c = creators().find((x) => x.id === String(cid || '') && /mym/i.test(x.platform || '') && canSee({ ...u, pf: null }, x.id));
    if (!c) return send(res, 404, { error: 'Modèle MYM inconnue' }), null;
    if (!isLinked(c.id)) return send(res, 409, { error: 'Le compte MYM de cette modèle n’est pas relié à Bloom.' }), null;
    return { u, c };
  };
  const view = (v) => ({ id: v.id, code: v.code, duration: v.duration, product: v.product, unit: v.unit, discount: v.discount, maxUse: v.max_use, createdBy: v.created_by, createdAt: v.created_at, expiresAt: DURATIONS[v.duration] ? v.created_at + DURATIONS[v.duration] : null });

  return {
    'GET /api/mym/vouchers': (req, res) => {
      const x = pick(req, res, new URL(req.url, 'http://x').searchParams.get('creatorId'));
      if (!x) return;
      send(res, 200, { canEdit: seesAll(x.u), vouchers: all('SELECT * FROM mym_vouchers WHERE creator_id = ? AND deleted_at IS NULL ORDER BY created_at DESC', x.c.id).map(view) });
    },
    /** Crée le bon chez MYM (le formulaire du site), puis le note dans Bloom. */
    'POST /api/mym/vouchers': async (req, res) => {
      const b = await body(req);
      const x = pick(req, res, b.creatorId, true);
      if (!x) return;
      const code = String(b.code || '').trim();
      const discount = Number(String(b.discount ?? '').replace(',', '.'));
      const unit = b.unit === 'percent' ? 'percent' : 'currency';
      const maxUse = Number(b.maxUse) > 0 ? Math.round(Number(b.maxUse)) : null;
      if (!/^[A-Za-z0-9_-]{3,25}$/.test(code)) return send(res, 400, { error: 'Code : 3 à 25 lettres ou chiffres, sans espace.' });
      if (!(b.duration in DURATIONS) || !PRODUCTS.includes(b.product)) return send(res, 400, { error: 'Choisis une durée et un produit.' });
      if (!(discount > 0) || (unit === 'percent' && discount > 100)) return send(res, 400, { error: 'Réduction invalide.' });
      try {
        const page = await mymSiteRaw(x.c.id, `${PATH}/create`);
        const token = /name="voucher\[_token\]"[^>]*value="([^"]+)"/.exec(page.text)?.[1] || /value="([^"]+)"[^>]*name="voucher\[_token\]"/.exec(page.text)?.[1];
        if (!token) return send(res, 502, { error: 'MYM n’a pas donné le formulaire de création (session refusée ?). Rien n’a été créé.' });
        const form = new URLSearchParams({ 'voucher[code]': code, 'voucher[duration]': b.duration, 'voucher[product]': b.product, 'voucher[discountUnit]': unit, 'voucher[discount]': String(discount), 'voucher[maxOfUse]': maxUse ? String(maxUse) : '', 'voucher[_token]': token });
        const r = await mymSiteRaw(x.c.id, `${PATH}/create`, { form, cookies: page.cookies });
        // Accepté = MYM renvoie vers la liste ; sinon il réaffiche le formulaire avec l'erreur.
        if (r.status < 300 || r.status >= 400) {
          const why = unhtml(/class="[^"]*(?:form-error|invalid-feedback|error)[^"]*"[^>]*>([\s\S]{0,300}?)<\//.exec(r.text)?.[1] || '');
          return send(res, 400, { error: `MYM a refusé ce bon${why ? ` : ${why}` : ' (code déjà pris, ou réduction non autorisée).'}` });
        }
        run('INSERT INTO mym_vouchers (creator_id, code, duration, product, unit, discount, max_use, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', x.c.id, code, b.duration, b.product, unit, discount, maxUse, x.u.name, Date.now());
        send(res, 200, { ok: true });
      } catch (e) {
        send(res, 502, { error: e.message });
      }
    },
    'POST /api/mym/vouchers/delete': async (req, res) => {
      const b = await body(req);
      const v = one('SELECT * FROM mym_vouchers WHERE id = ? AND deleted_at IS NULL', Number(b.id));
      if (!v) return send(res, 404, { error: 'Bon inconnu' });
      const x = pick(req, res, v.creator_id, true);
      if (!x) return;
      try {
        const r = await mymSiteRaw(x.c.id, `${PATH}/delete/${encodeURIComponent(v.code)}`);
        if (r.status >= 400) return send(res, 502, { error: `MYM a refusé la suppression (${r.status}).` });
        run('UPDATE mym_vouchers SET deleted_at = ? WHERE id = ?', Date.now(), v.id);
        send(res, 200, { ok: true });
      } catch (e) {
        send(res, 502, { error: e.message });
      }
    },
  };
}
