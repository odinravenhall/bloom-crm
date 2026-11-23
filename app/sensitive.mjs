// Growth → Sensitive words (copie de la page d'Infloww). Liste de l'agence gardée par Bloom (au départ : l'export d'Infloww,
// `sensitive-words.json`). Chaque envoi depuis Bloom (messagerie, Messages Pro, envoi groupé, Smart Messages, relances)
// passe par `substy.validate()` : un message qui contient un de ces mots est refusé avant même de demander à Substy.
// Un mot = des lettres / chiffres entiers (« animal » n'attrape pas « animals ») ; sans tenir compte des majuscules ni des accents.
import { readFileSync } from 'node:fs';
import { all, db, one, run } from './store.mjs';
import { isBoss } from './team.mjs';
import { setBannedCheck } from './substy.mjs';

db.exec(`CREATE TABLE IF NOT EXISTS sensitive_words (word TEXT PRIMARY KEY COLLATE NOCASE, created_by TEXT, created_at INTEGER NOT NULL)`);
if (!one('SELECT 1 AS x FROM sensitive_words LIMIT 1')) {
  try {
    const seed = JSON.parse(readFileSync(new URL('./sensitive-words.json', import.meta.url), 'utf8'));
    const now = Date.now();
    for (const w of seed) run('INSERT OR IGNORE INTO sensitive_words (word, created_by, created_at) VALUES (?, ?, ?)', w, 'Infloww', now);
  } catch (e) {
    console.warn('[sensitive]', e.message);
  }
}

const MAX = 32;
const fold = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let compiled = null;
function matcher() {
  if (compiled) return compiled;
  const words = all('SELECT word FROM sensitive_words').map((r) => r.word);
  const parts = words.map((w) => ({ w, re: new RegExp(`(?<![\\p{L}\\p{N}])${esc(fold(w))}(?![\\p{L}\\p{N}])`, 'u') }));
  return (compiled = parts);
}
/** Mots de la liste trouvés dans le texte. */
export function findSensitive(text) {
  const t = fold(text || '');
  if (!t.trim()) return [];
  return matcher().filter((p) => p.re.test(t)).map((p) => p.w);
}
setBannedCheck(findSensitive);

export function sensitiveRoutes({ userFrom, send, body }) {
  const who = (req, res, edit) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (edit && !isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    return u;
  };
  return {
    'GET /api/sensitive': (req, res) => {
      const u = who(req, res);
      if (!u) return;
      send(res, 200, { words: all('SELECT word FROM sensitive_words ORDER BY word COLLATE NOCASE').map((r) => r.word), canEdit: isBoss(u) });
    },
    /** Ajout d'un ou plusieurs mots (bouton « Add word » ou import Excel, par paquets). */
    'POST /api/sensitive': async (req, res) => {
      const u = who(req, res, true);
      if (!u) return;
      const b = await body(req);
      const words = [...new Set((Array.isArray(b.words) ? b.words : []).map((w) => String(w).trim()).filter(Boolean))];
      const long = words.filter((w) => [...w].length > MAX);
      if (long.length && !b.import) return send(res, 400, { error: `32 caractères au plus : ${long.slice(0, 3).join(', ')}` });
      let added = 0;
      const now = Date.now();
      for (const w of words.filter((x) => [...x].length <= MAX)) added += run('INSERT OR IGNORE INTO sensitive_words (word, created_by, created_at) VALUES (?, ?, ?)', w, u.name || u.id, now).changes;
      compiled = null;
      send(res, 200, { added, skipped: words.length - added });
    },
    'POST /api/sensitive/delete': async (req, res) => {
      const u = who(req, res, true);
      if (!u) return;
      const b = await body(req);
      for (const w of Array.isArray(b.words) ? b.words : []) run('DELETE FROM sensitive_words WHERE word = ?', String(w));
      compiled = null;
      send(res, 200, { ok: true });
    },
    /** Vérifier un texte (pour prévenir le chatteur avant d'envoyer). */
    'POST /api/sensitive/check': async (req, res) => {
      if (!who(req, res)) return;
      const b = await body(req);
      send(res, 200, { found: findSensitive(String(b.text || '')) });
    },
  };
}
