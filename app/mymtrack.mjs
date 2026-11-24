// MYM → Stats → « Liens de suivi » (copie de MyPulse), pour les comptes reliés. Relevé le 24/11/2026 sur le site de MYM :
//  - les liens de suivi sont une fonction de MYM (studio → tracking links) : page `/app/settings/promotions` (HTML).
//    Une carte par lien : `data-link-id`, nom (h3), et des blocs `data-testid="tracking-link-…"` : created-date,
//    subscribers, clicks, conversion-rate, ppv-revenue-value, ppv-count, subscription-revenue-value,
//    combined-revenue-value ; l'adresse est dans `<input id="url-<id>" value="https://mym.fans/app/t/…">` ;
//  - créer : `POST /app/api/creator/tracking-links/create` corps JSON `{ name }` (lettres, chiffres, - et _ seulement) ;
//  - supprimer : `DELETE /app/api/creator/tracking-links/<id>`.
//    ⚠️ Création et suppression : formats lus dans le code du site, pas encore vérifiés sur une vraie action.
//  - MYM ne donne que les TOTAUX de chaque lien, pas le détail par jour : Bloom relève ces totaux toutes les 10 minutes
//    et garde la dernière valeur de chaque jour de Paris (`mym_track_daily`). « Daily » = différence entre deux jours.
//    Pas de courbe avant le premier relevé (24/11/2026).
// Partages externes : une page publique (`/partage/<jeton>`) qui montre les chiffres de quelques liens, avec mot de
// passe et date de fin facultatifs. Le jeton n'est gardé que haché ; le mot de passe aussi (scrypt).
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { all, db, one, run } from './store.mjs';
import { isLinked, mymSiteRaw } from './mym.mjs';
import { canSee, seesAll } from './team.mjs';
import { parisDay } from './revenue.mjs';
import { moneyCents } from './mymincome.mjs';

db.exec('CREATE TABLE IF NOT EXISTS mym_track_links (creator_id TEXT NOT NULL, link_id TEXT NOT NULL, name TEXT, url TEXT, created TEXT, clicks INTEGER, subs INTEGER, ppv INTEGER, ppv_n INTEGER, sub_rev INTEGER, total INTEGER, at INTEGER, gone INTEGER, PRIMARY KEY (creator_id, link_id))');
db.exec('CREATE TABLE IF NOT EXISTS mym_track_daily (creator_id TEXT NOT NULL, link_id TEXT NOT NULL, day TEXT NOT NULL, clicks INTEGER, subs INTEGER, ppv INTEGER, ppv_n INTEGER, sub_rev INTEGER, total INTEGER, PRIMARY KEY (creator_id, link_id, day))');
db.exec('CREATE TABLE IF NOT EXISTS mym_track_shares (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, creator_id TEXT NOT NULL, name TEXT, pw TEXT, expires INTEGER, links TEXT, by_name TEXT, at INTEGER)');

const DAY = 864e5;
const addDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const sha = (t) => createHash('sha256').update(t).digest('hex');
const strip = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const int = (s) => Number(String(s || '').replace(/[^\d]/g, '')) || 0;
// « 3,115.04 € Last updated: 11/14/26 » → on ne garde que le montant.
const money = (s) => moneyCents(/-?[\d\s.,]*\d\s*[€$]|[€$]\s*-?[\d\s.,]*\d/.exec(String(s || ''))?.[0] || '0');
/** « Aug 06, 2026 » ou « 6 août 2026 » → 2026-08-06 (sinon le texte tel quel). */
function dayOf(t) {
  const s = String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const y = /(20\d\d)/.exec(s)?.[1];
  const d = /(\d{1,2})/.exec(s.replace(y || '', ''))?.[1];
  const w = /[a-z]{3,}/.exec(s)?.[0] || '';
  const order = [['jan'], ['fev', 'feb'], ['mar'], ['avr', 'apr'], ['mai', 'may'], ['juin', 'jun'], ['juil', 'jul'], ['aou', 'aug'], ['sep'], ['oct'], ['nov'], ['dec']];
  // « juil » avant « juin » : on prend le préfixe le plus long qui correspond.
  let mo = -1;
  let best = 0;
  order.forEach((l, i) => l.forEach((p) => w.startsWith(p) && p.length > best && ((mo = i), (best = p.length))));
  return y && d && mo >= 0 ? `${y}-${String(mo + 1).padStart(2, '0')}-${d.padStart(2, '0')}` : t || null;
}

/** Les liens de la page « tracking links » de MYM. */
export function parseLinks(html) {
  const parts = String(html).split(/class="tracking-links__card"/).slice(1);
  const out = [];
  for (const seg of parts) {
    const id = /data-link-id="(\d+)"/.exec(seg)?.[1];
    if (!id) continue;
    // Un bloc par « data-testid » : le texte qui suit, jusqu'au bloc suivant.
    const blocks = {};
    const re = /data-testid="tracking-link-([a-z-]+?)(?:-\d+)?"/g;
    const marks = [];
    let m;
    while ((m = re.exec(seg))) marks.push({ k: m[1], i: m.index + m[0].length });
    marks.forEach((k, i) => {
      const chunk = seg.slice(k.i, marks[i + 1]?.i ?? seg.length);
      if (!(k.k in blocks)) blocks[k.k] = strip(chunk.slice(chunk.indexOf('>') + 1).replace(/<[^>]*$/, ''));
    });
    const tail = (k) => {
      const v = /list-item__value[^>]*>([\s\S]*?)<\//.exec(seg.slice(marks.find((x) => x.k === k)?.i ?? seg.length))?.[1];
      return strip(v ?? '');
    };
    const url = new RegExp(`value="([^"]+)"[^>]*id="url-${id}"`).exec(seg)?.[1] || new RegExp(`id="url-${id}"[^>]*value="([^"]+)"`).exec(seg)?.[1] || null;
    out.push({
      id,
      name: strip(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(seg)?.[1] || '') || `Lien ${id}`,
      url,
      created: dayOf(tail('created-date')),
      subs: int(tail('subscribers')),
      clicks: int(tail('clicks')),
      ppv: money(blocks['ppv-revenue-value'] || tail('ppv-revenue')),
      ppvN: int(/\d[\d\s.,]*/.exec(blocks['ppv-count'] || '')?.[0]),
      subRev: money(blocks['subscription-revenue-value'] || tail('subscription-revenue')),
      total: money(blocks['combined-revenue-value'] || tail('combined-revenue')),
    });
  }
  return out;
}

const state = new Map(); // cid -> { at, error }
async function sync(cid) {
  const s = state.get(cid) || {};
  state.set(cid, { ...s, at: Date.now() });
  try {
    const r = await mymSiteRaw(cid, '/app/settings/promotions');
    if (r.status !== 200) throw new Error(`MYM a répondu ${r.status} sur les liens de suivi`);
    if (!/tracking-links/.test(r.text)) throw new Error('Page des liens de suivi non reconnue chez MYM');
    const links = parseLinks(r.text);
    const now = Date.now();
    const day = parisDay(now);
    run('UPDATE mym_track_links SET gone = 1 WHERE creator_id = ?', cid);
    for (const l of links) {
      run('INSERT INTO mym_track_links (creator_id, link_id, name, url, created, clicks, subs, ppv, ppv_n, sub_rev, total, at, gone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0) ON CONFLICT (creator_id, link_id) DO UPDATE SET name = excluded.name, url = excluded.url, created = excluded.created, clicks = excluded.clicks, subs = excluded.subs, ppv = excluded.ppv, ppv_n = excluded.ppv_n, sub_rev = excluded.sub_rev, total = excluded.total, at = excluded.at, gone = 0', cid, l.id, l.name, l.url, l.created, l.clicks, l.subs, l.ppv, l.ppvN, l.subRev, l.total, now);
      run('INSERT INTO mym_track_daily (creator_id, link_id, day, clicks, subs, ppv, ppv_n, sub_rev, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (creator_id, link_id, day) DO UPDATE SET clicks = excluded.clicks, subs = excluded.subs, ppv = excluded.ppv, ppv_n = excluded.ppv_n, sub_rev = excluded.sub_rev, total = excluded.total', cid, l.id, day, l.clicks, l.subs, l.ppv, l.ppvN, l.subRev, l.total);
    }
    state.set(cid, { at: now, ok: now, error: null });
  } catch (e) {
    state.set(cid, { at: Date.now(), ok: s.ok || 0, error: e.message });
    throw e;
  }
}

export function startMymTrack(creators) {
  const tick = async () => {
    for (const c of creators().filter((x) => /mym/i.test(x.platform || '') && isLinked(x.id))) await sync(String(c.id)).catch(() => {});
  };
  setTimeout(tick, 35_000);
  setInterval(tick, 10 * 60_000);
}

const linkView = (l) => ({ id: l.link_id, name: l.name, url: l.url, created: l.created, clicks: l.clicks || 0, subs: l.subs || 0, ppv: (l.ppv || 0) / 100, ppvN: l.ppv_n || 0, subRev: (l.sub_rev || 0) / 100, total: (l.total || 0) / 100 });
/** Liens + relevés par jour (un jour avant `from` compris, pour calculer le « daily » du premier jour). */
function dataOf(cid, from, to, only = null) {
  const links = all('SELECT * FROM mym_track_links WHERE creator_id = ? AND COALESCE(gone, 0) = 0 ORDER BY created, name', cid).filter((l) => !only || only.includes(l.link_id));
  const days = all('SELECT link_id, day, clicks, subs, ppv, ppv_n, sub_rev, total FROM mym_track_daily WHERE creator_id = ? AND day >= ? AND day <= ? ORDER BY day', cid, addDay(from, -1), to)
    .filter((d) => links.some((l) => l.link_id === d.link_id))
    .map((d) => ({ id: d.link_id, day: d.day, clicks: d.clicks || 0, subs: d.subs || 0, ppv: (d.ppv || 0) / 100, ppvN: d.ppv_n || 0, total: (d.total || 0) / 100 }));
  return { links: links.map(linkView), days, since: one('SELECT MIN(day) AS d FROM mym_track_daily WHERE creator_id = ?', cid)?.d || null, at: state.get(cid)?.ok || links[0]?.at || null };
}
const period = (p) => {
  const today = parisDay(Date.now());
  const ok = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : null);
  let to = ok(p.to) || today;
  if (to > today) to = today;
  let from = ok(p.from) || addDay(to, -29);
  if (from > to) from = to;
  if (Date.parse(to) - Date.parse(from) > 400 * DAY) from = addDay(to, -400);
  return { from, to, today };
};

const tries = new Map(); // jeton haché -> [heures des mots de passe refusés]
export function mymTrackRoutes({ userFrom, send, body, creators }) {
  const pickC = (req, res, cid, admin = false) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' }), null;
    if (admin && !seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    const c = creators().find((x) => x.id === String(cid || '') && /mym/i.test(x.platform || '') && canSee({ ...u, pf: null }, x.id));
    if (!c) return send(res, 404, { error: 'Modèle MYM inconnue' }), null;
    if (!isLinked(c.id)) return send(res, 409, { error: 'Le compte MYM de cette modèle n’est pas relié à Bloom.' }), null;
    return { u, c, cid: String(c.id) };
  };
  const qs = (req) => Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const shareView = (s) => ({ id: s.id, name: s.name, hasPassword: !!s.pw, expires: s.expires || null, links: JSON.parse(s.links || '[]'), by: s.by_name, at: s.at });
  return {
    'GET /api/mym/track': async (req, res) => {
      const q = qs(req);
      const x = pickC(req, res, q.creatorId);
      if (!x) return;
      let error = null;
      // Relu chez MYM si le dernier relevé a plus de 2 minutes (ou à la demande).
      if (q.fresh === '1' || Date.now() - (state.get(x.cid)?.at || 0) > 120_000) await sync(x.cid).catch((e) => (error = e.message));
      const { from, to, today } = period(q);
      send(res, 200, { from, to, today, ...dataOf(x.cid, from, to), error, canEdit: seesAll(x.u) });
    },
    'POST /api/mym/track/create': async (req, res) => {
      const b = await body(req);
      const x = pickC(req, res, b.creatorId, true);
      if (!x) return;
      const name = String(b.name || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,60}$/.test(name)) return send(res, 400, { error: 'Lettres, chiffres, tiret (-) et tiret bas (_) uniquement : MYM refuse les espaces, les accents et la ponctuation.' });
      // Un seul essai, jamais de deuxième tout seul.
      const r = await mymSiteRaw(x.cid, '/app/api/creator/tracking-links/create', { json: { name }, xhr: true });
      if (r.status < 200 || r.status >= 300) {
        let msg = '';
        try {
          const j = JSON.parse(r.text);
          msg = (j.errors || []).map((e) => e.message || e).join(' ') || j.message || j.error || '';
        } catch {}
        return send(res, 502, { error: `MYM a refusé la création (${r.status})${msg ? ` : ${String(msg).slice(0, 200)}` : ''}` });
      }
      await sync(x.cid).catch(() => {});
      send(res, 200, { ok: true });
    },
    'POST /api/mym/track/delete': async (req, res) => {
      const b = await body(req);
      const x = pickC(req, res, b.creatorId, true);
      if (!x) return;
      const l = one('SELECT link_id FROM mym_track_links WHERE creator_id = ? AND link_id = ? AND COALESCE(gone, 0) = 0', x.cid, String(b.id || ''));
      if (!l) return send(res, 404, { error: 'Lien inconnu' });
      if (b.confirm !== true) return send(res, 400, { error: 'Confirmation manquante' });
      const r = await mymSiteRaw(x.cid, `/app/api/creator/tracking-links/${encodeURIComponent(l.link_id)}`, { method: 'DELETE', xhr: true });
      if (r.status < 200 || r.status >= 300) return send(res, 502, { error: `MYM a refusé la suppression (${r.status})` });
      await sync(x.cid).catch(() => {});
      send(res, 200, { ok: true });
    },
    'GET /api/mym/track/shares': (req, res) => {
      const x = pickC(req, res, qs(req).creatorId, true);
      if (!x) return;
      send(res, 200, { shares: all('SELECT * FROM mym_track_shares WHERE creator_id = ? ORDER BY at DESC', x.cid).map(shareView) });
    },
    'POST /api/mym/track/share': async (req, res) => {
      const b = await body(req);
      const x = pickC(req, res, b.creatorId, true);
      if (!x) return;
      const known = new Set(all('SELECT link_id FROM mym_track_links WHERE creator_id = ? AND COALESCE(gone, 0) = 0', x.cid).map((l) => l.link_id));
      const links = (Array.isArray(b.links) ? b.links : []).map(String).filter((id) => known.has(id));
      if (!links.length) return send(res, 400, { error: 'Choisis au moins un lien.' });
      const name = String(b.name || '').trim().slice(0, 80) || 'Partage';
      const expires = Number(b.expires) > Date.now() ? Number(b.expires) : null;
      const password = String(b.password || '');
      if (password.length > 200) return send(res, 400, { error: 'Mot de passe trop long.' });
      let pw = null;
      if (password) {
        const salt = randomBytes(16);
        pw = `${salt.toString('hex')}:${scryptSync(password, salt, 32).toString('hex')}`;
      }
      const token = randomBytes(24).toString('base64url');
      run('INSERT INTO mym_track_shares (id, token_hash, creator_id, name, pw, expires, links, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', randomBytes(8).toString('hex'), sha(token), x.cid, name, pw, expires, JSON.stringify(links), x.u.name || x.u.username || null, Date.now());
      // Le jeton n'est montré qu'une fois (seul son hachage est gardé).
      send(res, 200, { ok: true, token });
    },
    'POST /api/mym/track/share/delete': async (req, res) => {
      const b = await body(req);
      const x = pickC(req, res, b.creatorId, true);
      if (!x) return;
      run('DELETE FROM mym_track_shares WHERE creator_id = ? AND id = ?', x.cid, String(b.id || ''));
      send(res, 200, { ok: true });
    },
    // Page publique d'un partage : sans compte. Mot de passe demandé s'il y en a un (10 essais par quart d'heure).
    'POST /api/public/track': async (req, res) => {
      const b = await body(req);
      const h = sha(String(b.token || ''));
      const s = one('SELECT * FROM mym_track_shares WHERE token_hash = ?', h);
      if (!s || (s.expires && s.expires < Date.now())) return send(res, 404, { error: 'Ce partage n’existe pas ou a expiré.' });
      if (s.pw) {
        const password = String(b.password || '');
        if (!password) return send(res, 401, { needPassword: true, name: s.name });
        const bad = (tries.get(h) || []).filter((t) => t > Date.now() - 15 * 60_000);
        if (bad.length >= 10) return send(res, 429, { needPassword: true, error: 'Trop d’essais. Réessaie dans un quart d’heure.' });
        const [salt, hash] = s.pw.split(':');
        const got = scryptSync(password.slice(0, 200), Buffer.from(salt, 'hex'), 32);
        if (!timingSafeEqual(got, Buffer.from(hash, 'hex'))) {
          tries.set(h, [...bad, Date.now()]);
          return send(res, 401, { needPassword: true, error: 'Mot de passe incorrect.' });
        }
      }
      const { from, to, today } = period(b);
      const d = dataOf(s.creator_id, from, to, JSON.parse(s.links || '[]'));
      // Rien d'autre que les chiffres des liens choisis (pas d'adresse interne, pas de nom de modèle).
      send(res, 200, { name: s.name, from, to, today, links: d.links, days: d.days, since: d.since, at: d.at });
    },
  };
}
