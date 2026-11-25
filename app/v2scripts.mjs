// Bloom v2 → Scripts : UN écran pour OnlyFans et MYM (25/11/2026, design « Constellation »).
// Il remplace, dans la v2, la copie d'Infloww (Scripts : onglets Tag / Sequence) et celle de MyPulse (MymScripts). La
// bibliothèque était déjà commune aux deux (library.mjs, « /api/lib… ») : par modèle, des SCRIPTS qui sont soit une
// séquence (messages dans l'ordre, le chat reprend où en est le fan), soit un dossier (messages prêts, envoyés quand on
// veut — le « tag » d'Infloww, la « banque de messages » de MyPulse), chacun avec ses messages (texte, médias, prix,
// consigne) et les chiffres de ce que Bloom a envoyé (envois, achats, revenus).
// Cette route ne fait que LIRE pour l'écran : les modèles de la plateforme AFFICHÉE (« pf », le cookie du menu étant
// commun à tous les onglets) avec leur nombre de scripts, puis la bibliothèque de la modèle choisie. Créer, modifier,
// ranger, copier, importer : les routes « /api/lib/… » de library.mjs.
import { all } from './store.mjs';
import { isBoss } from './team.mjs';
import { library } from './library.mjs';
import { askOf } from './v2stats.mjs';

export function v2ScriptsRoutes({ userFrom, send, creators }) {
  return {
    // ?pf=of|mym, &creatorId= (sinon la première modèle de la colonne). Toute l'équipe peut lire (les chatteurs
    // envoient ces scripts depuis la messagerie) ; `canEdit` = team leaders, managers et admins.
    'GET /api/v2/scripts': (req, res) => {
      const u = userFrom(req);
      if (!u) return send(res, 401, { error: 'Connecte-toi' });
      if (u.role === 'model') return send(res, 403, { error: 'Page réservée à l’équipe' });
      const { p, pf, mine } = askOf(u, req, creators);
      const counts = new Map(all('SELECT g.creator_id AS cid, COUNT(DISTINCT g.id) AS scripts, COUNT(i.id) AS messages FROM lib_groups g LEFT JOIN lib_items i ON i.group_id = g.id GROUP BY g.creator_id').map((r) => [String(r.cid), r]));
      const list = mine
        .map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar || null, scripts: counts.get(String(c.id))?.scripts || 0, messages: counts.get(String(c.id))?.messages || 0 }))
        .sort((a, b) => b.scripts - a.scripts || b.messages - a.messages || a.name.localeCompare(b.name, 'fr'));
      const asked = p.get('creatorId') || '';
      const creator = mine.find((c) => String(c.id) === asked) || mine.find((c) => String(c.id) === list[0]?.id) || null;
      const cid = creator ? String(creator.id) : null;
      send(res, 200, {
        platform: pf, currency: pf === 'of' ? 'USD' : 'EUR', list, canEdit: isBoss(u),
        model: creator ? { id: cid, name: creator.name, avatar: creator.avatar || null } : null,
        groups: cid ? library(cid) : [],
        // Une modèle « mym-… » a été ajoutée dans Bloom sans Substy : pas de scripts d'IA pour elle.
        onSubsty: !!cid && !cid.startsWith('mym-'),
      });
    },
  };
}
