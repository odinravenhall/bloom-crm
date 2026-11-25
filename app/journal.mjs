// Journal des actions de l'équipe (MYM → Pilotage d'équipe → Activité) et mots interdits de l'agence (Modération).
// Ce fichier ne dépend que de la base : tout le monde peut l'importer sans boucle.
//  - `bl_actions` : une ligne par action faite DANS Bloom (60 jours). Rempli à un seul endroit, après chaque requête
//    réussie qui modifie quelque chose (`journalRequest`, appelé par server.mjs), d'après la table `ACTIONS` ci-dessous ;
//    plus quelques appels directs (`logAction`) : message bloqué par un mot interdit, message suspect, retrait.
//  - `bl_banned` : les mots que l'équipe n'a pas le droit d'envoyer, pour TOUTES les modèles (MYM et OnlyFans) ;
//    `bl_refused` : les envois bloqués (60 jours). Les déguisements simples tombent avec le mot : majuscules, accents,
//    ponctuation ou espaces entre les lettres (« t.e.l »), chiffres à la place des lettres (« t3l »), lettres répétées.
import { all, db, one, run } from './store.mjs';

db.exec('CREATE TABLE IF NOT EXISTS bl_actions (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, user_id INTEGER, user_name TEXT, creator_id TEXT, fan_id TEXT, action TEXT NOT NULL, details TEXT)');
db.exec('CREATE INDEX IF NOT EXISTS bl_actions_at ON bl_actions (at)');
db.exec('CREATE TABLE IF NOT EXISTS bl_banned (id INTEGER PRIMARY KEY, word TEXT NOT NULL, variants TEXT NOT NULL DEFAULT \'[]\', by_name TEXT, at INTEGER NOT NULL)');
db.exec('CREATE TABLE IF NOT EXISTS bl_refused (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, user_name TEXT, creator_id TEXT, fan_id TEXT, word TEXT, found TEXT, text TEXT)');

const KEEP = 60 * 864e5;
let pruned = 0;
export function logAction(u, action, { creatorId = null, fanId = null, details = null } = {}) {
  try {
    run('INSERT INTO bl_actions (at, user_id, user_name, creator_id, fan_id, action, details) VALUES (?, ?, ?, ?, ?, ?, ?)', Date.now(), u?.id ?? null, u?.name ?? null, creatorId ? String(creatorId) : null, fanId ? String(fanId) : null, action, details ? String(details).slice(0, 600) : null);
    if (Date.now() - pruned > 3600_000) {
      pruned = Date.now();
      run('DELETE FROM bl_actions WHERE at < ?', Date.now() - KEEP);
      run('DELETE FROM bl_refused WHERE at < ?', Date.now() - KEEP);
    }
  } catch (e) {
    console.warn('[bloom] journal des actions :', e.message);
  }
}

// Requête réussie → action. `null` = ne rien noter. Une fonction reçoit le corps de la requête.
const conv = (b) => ({ read: 'Conversation lue', unread: 'Conversation marquée non lue', pin: 'Conversation épinglée ou désépinglée' })[b?.action] || null;
const ACTIONS = [
  ['POST', /^\/api\/rv\/conversations\/[^/]+\/action$/, conv],
  ['DELETE', /^\/api\/rv\/conversations\/[^/]+\/messages\/[^/]+$/, 'Message supprimé (unsend)'],
  ['POST', /^\/api\/sent\/delete$/, 'Message supprimé (unsend)'],
  ['PUT', /^\/api\/rv\/conversations\/[^/]+\/fan$/, 'Fiche fan modifiée'],
  ['POST', /^\/api\/rv\/conversations\/[^/]+\/erase$/, 'Historique d’une conversation effacé'],
  ['POST', /^\/api\/rv\/conversations\/[^/]+\/sequence$/, 'Séquence de scripts lancée'],
  ['POST', /^\/api\/(fan-meta|mym\/fans\/edit|mym\/fan|v2\/fans\/sheet)$/, 'Fiche fan modifiée'],
  ['POST', /^\/api\/(mym\/fans\/add-to-list|fanlists\/member)$/, 'Ajout à un groupe'],
  ['POST', /^\/api\/v2\/fans\/members$/, (b) => (b?.add === false ? 'Fans retirés d’un groupe' : 'Ajout à un groupe')],
  ['POST', /^\/api\/vaultpro\/(meta|cats)$/, 'Fiche ou catégorie de média modifiée'],
  ['POST', /^\/api\/mym\/cloud\/(upload|collections|collections\/add)$/, 'Médias MYM ajoutés ou rangés'],
  ['POST', /^\/api\/(fanlists\/save|mym\/fans\/lists|fanlists\/duplicate)$/, 'Groupe créé ou modifié'],
  ['POST', /^\/api\/fanlists\/delete$/, 'Groupe supprimé'],
  ['POST', /^\/api\/ai$/, 'IA activée ou coupée sur un fan'],
  ['POST', /^\/api\/ai-config\//, 'Réglages de l’IA modifiés'],
  ['POST', /^\/api\/(mass|relance)$/, 'Envoi groupé'],
  ['POST', /^\/api\/mass\/unsend$/, 'Envoi groupé retiré (unsend)'],
  ['POST', /^\/api\/mym\/massdm\/campaign$/, 'Mass DM envoyé'],
  ['POST', /^\/api\/mym\/massdm\/campaign\/stop$/, 'Envoi groupé annulé'],
  ['POST', /^\/api\/mym\/massdm\/campaign\/remove$/, 'Envoi groupé retiré (unsend)'],
  ['POST', /^\/api\/mym\/massdm\/message$/, 'Message de Mass DM créé ou modifié'],
  ['POST', /^\/api\/mym\/massdm\/message\/delete$/, 'Message de Mass DM supprimé'],
  ['POST', /^\/api\/mym\/push$/, 'Push envoyé'],
  ['POST', /^\/api\/mym\/push\/delete$/, 'Push programmé annulé'],
  ['POST', /^\/api\/mym\/plan$/, 'Publication programmée'],
  ['POST', /^\/api\/mym\/plan\/(cancel|clear)$/, 'Publication programmée annulée'],
  ['POST', /^\/api\/mym\/friends\/add$/, 'Amie ajoutée au profil MYM'],
  ['POST', /^\/api\/mym\/friends\/remove$/, 'Amie retirée du profil MYM'],
  ['POST', /^\/api\/mym\/friends\/order$/, 'Ordre des amies du profil MYM changé'],
  ['POST', /^\/api\/mym\/vouchers$/, 'Bon de réduction créé'],
  ['POST', /^\/api\/mym\/vouchers\/delete$/, 'Bon de réduction supprimé'],
  ['POST', /^\/api\/(pro\/timed|smart\/auto)$/, 'Message programmé'],
  ['POST', /^\/api\/(pro\/timed|smart\/auto)\/cancel$/, 'Message programmé annulé'],
  ['POST', /^\/api\/(staff\/employee|staff\/batch|staff\/creators|team\/access)$/, 'Droits modifiés'],
  ['POST', /^\/api\/staff\/roles$/, 'Rôle modifié'],
  ['POST', /^\/api\/team\/active$/, 'Accès accordé ou retiré'],
  ['POST', /^\/api\/lib\/(item|group|import|item\/share|group\/copy)$/, 'Script créé ou modifié'],
  ['POST', /^\/api\/lib\/(item|group)\/delete$/, 'Script supprimé'],
  ['POST', /^\/api\/mym\/track\/create$/, 'Lien de suivi créé'],
  ['POST', /^\/api\/mym\/track\/delete$/, 'Lien de suivi supprimé'],
  ['POST', /^\/api\/mym\/track\/share$/, 'Partage externe créé'],
  ['POST', /^\/api\/mym\/track\/share\/delete$/, 'Partage externe supprimé'],
  ['POST', /^\/api\/mym\/link$/, 'Compte MYM relié'],
  ['POST', /^\/api\/mym\/unlink$/, 'Compte MYM délié'],
  ['POST', /^\/api\/mym\/mod\/banned$/, 'Liste des mots interdits modifiée'],
  ['POST', /^\/api\/mym\/mod\/allow$/, 'Sortie autorisée modifiée'],
];
const SAFE = ['action', 'type', 'name', 'title', 'enabled', 'on', 'active', 'role', 'word'];
/** Appelé par le serveur après chaque requête : note l'action si elle a réussi et qu'elle est dans la table. */
export function journalRequest(req, path, status, userFrom) {
  if (req.method === 'GET' || status < 200 || status >= 300) return;
  const hit = ACTIONS.find(([m, re]) => m === req.method && re.test(path));
  if (!hit) return;
  const u = userFrom(req);
  if (!u) return;
  const b = req._json && typeof req._json === 'object' ? req._json : {};
  const label = typeof hit[2] === 'function' ? hit[2](b) : hit[2];
  if (!label) return;
  // Conversation « <créatrice>~<fan> » dans l'adresse, sinon dans le corps.
  const cv = /\/conversations\/([^/]+)/.exec(path)?.[1];
  const [cid, fid] = cv ? decodeURIComponent(cv).split('~') : [b.creatorId, b.fanId];
  const details = SAFE.filter((k) => b[k] != null && typeof b[k] !== 'object').map((k) => `${k}: ${String(b[k]).slice(0, 80)}`).join(' · ');
  logAction(u, label, { creatorId: cid || null, fanId: fid || null, details: details || null });
}

// ---------------------------------------------------------------- mots interdits
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '€': 'e' };
/** Texte → suite de mots comparables (sans accents, chiffres-lettres remis, lettres répétées réduites). */
export function norm(text) {
  const t = String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[013457@$€]/g, (c) => LEET[c]).replace(/[^a-z0-9]+/g, ' ').replace(/(.)\1+/g, '$1').trim();
  // « t e l » → « tel » : une suite de lettres seules est recollée.
  return t.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (m) => m.replace(/ /g, ''));
}
let cache = null;
const terms = () => {
  if (cache) return cache;
  cache = [];
  for (const r of all('SELECT word, variants FROM bl_banned')) {
    let extra = [];
    try {
      extra = JSON.parse(r.variants || '[]');
    } catch {}
    for (const w of [r.word, ...extra]) {
      const n = norm(w);
      if (n) cache.push({ word: r.word, found: w, n, glued: n.replace(/ /g, '') });
    }
  }
  return cache;
};
export const bannedChanged = () => void (cache = null);
/** Premier mot interdit trouvé dans le texte : { word, found } ou null. */
export function bannedIn(text) {
  const n = ` ${norm(text)} `;
  if (n.trim() === '') return null;
  for (const t of terms()) if (n.includes(` ${t.n} `) || n.includes(` ${t.n}s `) || (t.n.includes(' ') && n.includes(` ${t.glued} `))) return { word: t.word, found: t.found };
  return null;
}
/**
 * À appeler avant un envoi : renvoie le message d'erreur si le texte contient un mot interdit (et note le refus),
 * sinon null.
 */
export function refuseBanned(u, creatorId, fanId, text) {
  const hit = bannedIn(text);
  if (!hit) return null;
  try {
    run('INSERT INTO bl_refused (at, user_name, creator_id, fan_id, word, found, text) VALUES (?, ?, ?, ?, ?, ?, ?)', Date.now(), u?.name ?? null, creatorId ? String(creatorId) : null, fanId ? String(fanId) : null, hit.word, hit.found, String(text).slice(0, 500));
  } catch {}
  logAction(u, 'Message bloqué (mot interdit)', { creatorId, fanId, details: `mot : ${hit.word}` });
  return `Mot interdit par l’agence dans le message : « ${hit.word} ». Le message n’est pas parti.`;
}
export const bannedCount = () => one('SELECT COUNT(*) AS n FROM bl_banned')?.n || 0;
