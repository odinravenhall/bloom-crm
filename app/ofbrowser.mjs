// « OF Manager » (comme Infloww) : le vrai site OnlyFans / MYM de la créatrice, affiché dans Bloom.
// Substy a un site intégré (« Browser », of.substy.ai) : une session par créatrice, valable 4 h.
// Le serveur de Bloom ouvre (ou reprend) la session ; le navigateur de la personne l'autorise avec SA connexion Substy
// (page d'accès de Substy, une fois par session), puis Bloom affiche of.substy.ai dans un cadre.
// Relayer le site par Bloom ne marche pas : le script de Substy ne fonctionne que sur son propre domaine.
// Réservé aux admins et managers (les chatteurs n'ont jamais accès à l'OF Manager).
import { creatorsOf, seesAll } from './team.mjs';

const ok = (u, cid) => {
  if (!u || !seesAll(u)) return false;
  const s = creatorsOf(u);
  return s === null || s.has(String(cid));
};

export function ofBrowserRoutes({ substy, userFrom, send }) {
  return {
    routes: {
      'GET /api/of-browser/open': async (req, res) => {
        const u = userFrom(req);
        if (!u) return send(res, 401, { error: 'Connecte-toi' });
        const cid = String(new URL(req.url, 'http://x').searchParams.get('creatorId') || '');
        if (!ok(u, cid)) return send(res, 403, { error: 'Réservé aux admins et managers' });
        const s = await substy.browserSession(cid);
        if (!s?.sessionToken) return send(res, 502, { error: s?.url ? 'Substy propose d’ouvrir ce compte dans un nouvel onglet.' : 'Substy n’a pas ouvert le site de cette créatrice.', url: s?.url || null });
        const origin = /^https:\/\/[a-z0-9.-]+\.substy\.ai$/.test(s.accessOrigin || '') ? s.accessOrigin : 'https://of.substy.ai';
        const t = encodeURIComponent(s.sessionToken);
        send(res, 200, {
          site: `${origin}/s/${t}`,
          access: `https://app.substy.ai/browser/sessions/${t}/access?origin=${encodeURIComponent(origin)}`,
        });
      },
    },
  };
}
