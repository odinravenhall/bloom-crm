// Bloom v2 → Médias : UN écran pour OnlyFans et MYM (25/11/2026, design « Constellation »).
// Il remplace, dans la v2, la copie d'Infloww (Vault Pro) et celle de MyPulse (Votre Studio), et il sert aussi de
// fenêtre de choix des médias (messagerie, scripts). Ces routes ne font que LIRE, dans une même forme des deux côtés :
//  - OnlyFans : le vault d'OnlyFans lu chez Substy (`medias.getLists`, `medias.getMedias`, `medias.getMedia`, relevés
//    le 25/11/2026 sur app.substy.ai/vault). Substy donne en plus, pour chaque média, ce que son IA en sait : une
//    description (`context`), des mots-clés (`tags`), les scripts de l'IA qui l'envoient (`scriptNames`,
//    `messageTemplateNames`), et, si on donne un fan (`fanId`), s'il l'a déjà acheté (`purchasedByFan`).
//  - MYM : le mym.cloud du compte relié, en direct (mymmedia.mjs : collections, médias, vocaux). Pour une modèle qui
//    est aussi chez Substy (mêmes identifiants de médias), la fiche d'un média ajoute ce que l'IA de Substy en sait.
// Dans les deux cas Bloom ajoute ce qu'il garde lui-même (`vault_meta`, vaultpro.mjs) : la fiche du média (note pour
// l'équipe, mots-clés, prix conseillé, catégorie) et les scripts de Bloom qui l'utilisent (`lib_items`).
// Écrire : fiche et catégories « /api/vaultpro/meta|cats » ; côté MYM « /api/mym/cloud/upload|collections|collections/add ».
import { all } from './store.mjs';
import { isBoss } from './team.mjs';
import { askOf } from './v2stats.mjs';
import { mediaView } from './chat.mjs';
import { metaOf, vaultCats } from './vaultpro.mjs';
import { cloudCollections, cloudPage } from './mymmedia.mjs';

const J = (s, d) => {
  try {
    return JSON.parse(s ?? '');
  } catch {
    return d;
  }
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Nom d'un dossier sans ses émojis (pour le tri et pour reconnaître les dossiers d'OnlyFans). */
const plain = (s) => String(s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu, '').replace(/\s+/g, ' ').trim();
// Les dossiers qu'OnlyFans remplit tout seul (d'où vient le média), à côté de ceux que l'agence a créés.
const SYSTEM = /^(messages|posts|stories|streams|uploads|archived?)$/i;

// Réponses gardées un court moment (changer de dossier ou revenir sur une modèle ne redemande pas tout).
const keep = new Map();
function kept(key, ttl, fresh, make) {
  const hit = keep.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttl) return hit.p;
  const p = make();
  keep.set(key, { at: Date.now(), p });
  p.catch(() => keep.get(key)?.p === p && keep.delete(key));
  if (keep.size > 300) for (const [k, v] of keep) if (Date.now() - v.at > 10 * 60_000) keep.delete(k);
  return p;
}

/**
 * Adresse d'un fichier du vault OnlyFans par son IDENTIFIANT : elle ne périme pas (vérifié le 25/11/2026), au
 * contraire des adresses « …/medias/view?url=… » des listes, qui portent une signature à durée limitée. C'est elle
 * qu'on garde quand un média est rangé dans un script ou une catégorie.
 */
const stable = (cid, id, size) => `/media?p=${encodeURIComponent(`/api/creators/${cid}/medias/${id}/${size}`)}`;
const kind = (t) => (t === 'video' ? 'video' : t === 'audio' ? 'audio' : 'photo');

/** Un média du vault OnlyFans (Substy) → la forme commune. */
function ofItem(cid, m) {
  const v = mediaView(m);
  const id = String(m.id);
  return {
    id, type: kind(v.type), thumb: v.thumb || stable(cid, id, 'thumb'), full: v.full || stable(cid, id, 'full'), duration: Number(m.duration) || null,
    createdAt: m.createdAt || null, name: '', caption: String(m.context || ''),
    tags: (m.tags || []).map(String), ai: [...new Set((m.scriptNames || []).map(String))], steps: [...new Set((m.messageTemplateNames || []).map(String))],
    bought: m.purchasedByFan === true, usedPublic: false, usedPrivate: false,
    keepThumb: stable(cid, id, 'thumb'), keepFull: stable(cid, id, 'full'),
  };
}
/** Un média du mym.cloud (`cloudItem` de mymmedia.mjs) → la forme commune. */
const mymItem = (m) => ({
  id: String(m.id), type: kind(m.type), thumb: m.thumb || null, full: m.full || null, duration: m.duration || null,
  createdAt: m.createdAt || null, name: m.name || '', caption: m.caption || '',
  tags: [], ai: [], steps: [], bought: false, usedPublic: !!m.usedPublic, usedPrivate: !!m.usedPrivate, keepThumb: null, keepFull: null,
});

// Les scripts de Bloom qui utilisent chaque média d'une modèle (relu au plus toutes les 15 s).
const usedHit = new Map();
function usedInScripts(cid) {
  const hit = usedHit.get(cid);
  if (hit && Date.now() - hit.at < 15_000) return hit.map;
  const map = new Map();
  for (const r of all("SELECT i.name, i.position, i.medias, g.name AS script FROM lib_items i JOIN lib_groups g ON g.id = i.group_id WHERE g.creator_id = ? AND i.medias != '[]' ORDER BY g.position, i.position", cid)) {
    for (const m of J(r.medias, [])) {
      const id = String(m?.id ?? '');
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ script: String(r.script || ''), message: /^\d*$/.test(String(r.name || '').trim()) ? `message ${Number(r.position) + 1}` : String(r.name) });
    }
  }
  usedHit.set(cid, { at: Date.now(), map });
  return map;
}

/** Ajoute à chaque média sa fiche Bloom et le nombre de scripts de Bloom qui l'utilisent. */
function withFiche(cid, items) {
  const meta = metaOf(cid, items.map((i) => i.id));
  const used = usedInScripts(cid);
  return items.map((i) => {
    const r = meta.get(i.id);
    return { ...i, note: r?.notes || '', labels: J(r?.hashtags, []), price: r?.price ?? null, catId: r?.cat_id ?? null, by: r?.updated_by || null, at: r?.updated_at || null, scripts: (used.get(i.id) || []).length };
  });
}

/** Dossiers d'une modèle : listes du vault OnlyFans (celles de l'agence d'abord) ou collections du mym.cloud. */
async function foldersOf(pf, cid, substy, cloud) {
  if (pf === 'mym') return (await cloud.collections(cid)).map((c) => ({ id: String(c.id), name: c.name || '', photos: c.photos || 0, videos: c.videos || 0, audios: 0, total: c.total || 0, system: false }));
  const r = await substy.vaultLists(cid);
  const lists = (r?.lists || []).map((l) => {
    const n = { photos: l.photosCount || 0, videos: l.videosCount || 0, audios: l.audiosCount || 0 };
    return { id: String(l.id), name: l.name || '', ...n, total: n.photos + n.videos + n.audios, system: SYSTEM.test(plain(l.name)) };
  });
  return [...lists.filter((l) => !l.system).sort((a, b) => plain(a.name).localeCompare(plain(b.name), 'fr', { numeric: true })), ...lists.filter((l) => l.system).sort((a, b) => b.total - a.total)];
}

export function v2MediasRoutes({ userFrom, send, creators, substy, cloud = { collections: cloudCollections, page: cloudPage } }) {
  /** La personne (toute l'équipe sauf les modèles) et ce qu'elle demande : plateforme affichée, modèles visibles. */
  const start = (req, res) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' }), null;
    return { u, ...askOf(u, req, creators) };
  };
  const one = (res, mine, id) => {
    const c = mine.find((x) => String(x.id) === String(id || ''));
    if (!c) send(res, 404, { error: 'Modèle inconnue sur cette plateforme' });
    return c || null;
  };
  const source = (pf) => (pf === 'mym' ? 'MYM' : 'Substy');

  return {
    // ?pf=of|mym, &creatorId= (sinon la première modèle), &fresh=1 (redemande les dossiers). Les modèles de la
    // plateforme affichée, puis les dossiers et les catégories de la modèle choisie.
    'GET /api/v2/medias': async (req, res) => {
      const a = start(req, res);
      if (!a) return;
      const { u, p, pf, mine } = a;
      const fiches = new Map(all("SELECT creator_id AS cid, COUNT(*) AS n FROM vault_meta WHERE COALESCE(notes, '') != '' OR hashtags != '[]' OR price IS NOT NULL OR cat_id IS NOT NULL GROUP BY creator_id").map((r) => [String(r.cid), r.n]));
      const list = mine.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null, fiches: fiches.get(String(c.id)) || 0 })).sort((x, y) => x.name.localeCompare(y.name, 'fr'));
      const asked = p.get('creatorId') || '';
      const creator = mine.find((c) => String(c.id) === asked) || mine.find((c) => String(c.id) === list[0]?.id) || null;
      const cid = creator ? String(creator.id) : null;
      let folders = [];
      let error = null;
      if (cid) {
        try {
          folders = await kept(`folders:${pf}:${cid}`, 60_000, p.get('fresh') === '1', () => foldersOf(pf, cid, substy, cloud));
        } catch (e) {
          error = `${source(pf)} ne répond pas pour l’instant : ${e.message}`;
        }
      }
      send(res, 200, {
        platform: pf, currency: pf === 'of' ? 'USD' : 'EUR', list, canEdit: isBoss(u),
        model: creator ? { id: cid, name: creator.name, avatar: creator.avatar || null } : null,
        folders,
        // Catégories de Bloom : côté OnlyFans seulement (Bloom ne range pas dans le vault d'OnlyFans ; côté MYM on
        // range dans les vraies collections du compte).
        cats: cid && pf === 'of' ? vaultCats(cid) : [],
        // Une modèle « mym-… » a été ajoutée dans Bloom sans Substy : son IA n'existe pas.
        onSubsty: !!cid && !cid.startsWith('mym-'),
        error,
      });
    },

    // Une page de médias : &creatorId, &folder= (liste OnlyFans ou collection MYM), &cat= (catégorie Bloom, OnlyFans),
    // &type=photo|video|audio, &q= (recherche), &sort=old (OnlyFans), &scripts=with|without (scripts de l'IA, OnlyFans),
    // &fanId= (OnlyFans : dit si ce fan a déjà acheté le média), &cursor= (page suivante).
    'GET /api/v2/medias/items': async (req, res) => {
      const a = start(req, res);
      if (!a) return;
      const { p, pf, mine } = a;
      const c = one(res, mine, p.get('creatorId'));
      if (!c) return;
      const cid = String(c.id);
      const type = ['photo', 'video', 'audio'].includes(p.get('type')) ? p.get('type') : '';
      const q = String(p.get('q') || '').trim().slice(0, 80);
      const word = q.toLowerCase();
      const folder = String(p.get('folder') || '');
      const cursor = String(p.get('cursor') || '');
      try {
        if (pf === 'of') {
          const cat = Number(p.get('cat')) || 0;
          if (cat) {
            // Une catégorie de Bloom : les médias qu'on y a rangés (leur adresse par identifiant ne périme pas).
            const rows = all('SELECT media_id, snapshot FROM vault_meta WHERE creator_id = ? AND cat_id = ? ORDER BY updated_at DESC', cid, cat);
            const items = withFiche(cid, rows.map((r) => {
              const s = J(r.snapshot, {});
              const id = String(r.media_id);
              return { id, type: kind(s.type), thumb: stable(cid, id, 'thumb'), full: stable(cid, id, 'full'), duration: Number(s.duration) || null, createdAt: s.createdAt || null, name: '', caption: String(s.caption || ''), tags: [], ai: [], steps: [], bought: false, usedPublic: false, usedPrivate: false, keepThumb: stable(cid, id, 'thumb'), keepFull: stable(cid, id, 'full') };
            }));
            return send(res, 200, { items: items.filter((i) => (!type || i.type === type) && (!word || `${i.note} ${i.labels.join(' ')} ${i.caption}`.toLowerCase().includes(word))), next: null, total: null });
          }
          const scripts = p.get('scripts');
          const hasScripts = scripts === 'with' ? true : scripts === 'without' ? false : undefined;
          const fan = String(p.get('fanId') || '');
          let fanId = /^[\w-]{1,40}$/.test(fan) ? fan : undefined;
          const got = [];
          let cur = cursor || undefined;
          let next = null;
          // « Avec / sans script » : Substy filtre page par page, une page peut donc revenir vide → on avance un peu.
          for (let k = 0; k < (hasScripts === undefined ? 1 : 5); k++) {
            const ask = { listId: folder || undefined, cursor: cur, limit: 60, type: type ? type.toUpperCase() : undefined, search: q || undefined, oldest: p.get('sort') === 'old', hasScripts };
            let r;
            try {
              r = await substy.vaultMedias(cid, { ...ask, fanId });
            } catch (e) {
              // Substy refuse un fan qui n'est pas à cette créatrice : « déjà acheté » est un plus, pas une condition.
              if (!fanId) throw e;
              fanId = undefined;
              r = await substy.vaultMedias(cid, ask);
            }
            got.push(...(r?.medias || []));
            next = r?.hasMore && r.nextCursor ? String(r.nextCursor) : null;
            if (!next || got.length >= 24) break;
            cur = next;
          }
          return send(res, 200, { items: withFiche(cid, got.map((m) => ofItem(cid, m))), next, total: null });
        }
        if (folder && !UUID.test(folder)) return send(res, 400, { error: 'Collection inconnue' });
        const got = [];
        let cur = cursor;
        let next = null;
        let total = null;
        // Dans une collection, MYM ne filtre ni par type ni par mot : Bloom le fait, et avance tant que la page est vide.
        const local = !!folder && !!(word || type);
        for (let k = 0; k < (local ? 5 : 1); k++) {
          const r = await cloud.page(cid, { collectionId: folder, type, search: folder ? '' : q, cursor: cur });
          got.push(...(folder && word ? r.items.filter((m) => `${m.name || ''} ${m.caption || ''} ${m.id}`.toLowerCase().includes(word)) : r.items));
          next = r.nextCursor || null;
          if (r.total != null) total = r.total;
          if (!next || got.length >= 12) break;
          cur = next;
        }
        send(res, 200, { items: withFiche(cid, got.map(mymItem)), next, total: cursor ? null : total });
      } catch (e) {
        send(res, 502, { error: `${source(pf)} : ${e.message}` });
      }
    },

    // La fiche d'un média : ce que l'IA de Substy en sait (description, mots-clés, scripts qui l'envoient), les scripts
    // de Bloom qui l'utilisent et, côté OnlyFans, des adresses fraîches pour le voir en grand.
    'GET /api/v2/medias/one': async (req, res) => {
      const a = start(req, res);
      if (!a) return;
      const { p, pf, mine } = a;
      const c = one(res, mine, p.get('creatorId'));
      if (!c) return;
      const cid = String(c.id);
      const id = String(p.get('id') || '');
      if (!/^[\w-]{1,64}$/.test(id)) return send(res, 400, { error: 'Média inconnu' });
      let ai = null;
      let item = null;
      if (!cid.startsWith('mym-')) {
        const m = await substy.vaultMedia(cid, id).catch(() => null);
        if (m && typeof m === 'object') {
          const v = { context: String(m.context || ''), tags: (m.tags || []).map(String), scripts: [...new Set((m.scriptNames || []).map(String))], steps: [...new Set((m.messageTemplateNames || []).map(String))] };
          if (v.context || v.tags.length || v.scripts.length || v.steps.length) ai = v;
          if (pf === 'of' && m.id != null) item = withFiche(cid, [ofItem(cid, m)])[0];
        }
      }
      send(res, 200, { id, ai, item, bloom: usedInScripts(cid).get(id) || [] });
    },
  };
}
