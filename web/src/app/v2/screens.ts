// Bloom v2 : la liste des écrans du menu unique (OnlyFans + MYM). Fichier sans composant : il sert au serveur (droits)
// et au navigateur (menu). Le composant affiché pour chaque écran est choisi par plateforme dans V2Screen.tsx.
//  - `group` : « top » = ligne seule en haut du menu ; sinon la rubrique dépliable où l'écran est rangé.
//  - `nav` : nom court dans le menu quand la rubrique dit déjà de quoi on parle (le titre de la page garde `label`).
//  - `pf` : absent = l'écran existe sur les deux plateformes ; "of" ou "mym" = propre à une plateforme (il n'apparaît
//    dans le menu que quand cette plateforme est choisie).
//  - `boss` : réservé aux team leaders, managers et admins.
export type ScreenKey =
  | "messagerie" | "scripts" | "envois" | "fans" | "medias"
  | "chiffres" | "analytique" | "liens"
  | "equipe-messages" | "equipe-ventes" | "shifts" | "activite" | "en-direct" | "moderation" | "acces"
  | "push" | "planification" | "feed" | "amis" | "bons" | "notifications" | "site-mym";
export type GroupKey = "top" | "chat" | "stats" | "team" | "platform";
export type Screen = { key: ScreenKey; label: string; nav?: string; group: GroupKey; boss?: boolean; pf?: "of" | "mym" };

export const SCREENS: Screen[] = [
  { key: "messagerie", label: "Messagerie", group: "top" },
  { key: "scripts", label: "Scripts", group: "chat" },
  { key: "medias", label: "Médias", group: "chat" },
  { key: "fans", label: "Fans", group: "chat" },
  { key: "envois", label: "Envois groupés", nav: "Envoi groupé", group: "chat", boss: true },
  { key: "chiffres", label: "Chiffres", group: "stats", boss: true },
  { key: "analytique", label: "Analytique", group: "stats", boss: true },
  { key: "liens", label: "Liens de suivi", group: "stats", boss: true },
  { key: "equipe-messages", label: "Messages de l’équipe", nav: "Messages", group: "team", boss: true },
  { key: "equipe-ventes", label: "Ventes de l’équipe", nav: "Ventes", group: "team", boss: true },
  { key: "shifts", label: "Shifts", group: "team", boss: true },
  { key: "activite", label: "Activité", group: "team", boss: true },
  { key: "en-direct", label: "En direct", group: "team", boss: true },
  { key: "moderation", label: "Modération", group: "team", boss: true, pf: "mym" },
  { key: "acces", label: "Accès", group: "team", boss: true },
  { key: "push", label: "Push et MoDs", group: "platform", boss: true, pf: "mym" },
  { key: "planification", label: "Planification", group: "platform", pf: "mym" },
  { key: "feed", label: "Feed", group: "platform", pf: "mym" },
  { key: "amis", label: "Liste d’amis", group: "platform", pf: "mym" },
  { key: "bons", label: "Bons de réduction", group: "platform", pf: "mym" },
  { key: "notifications", label: "Notifications MYM", nav: "Notifications", group: "platform", pf: "mym" },
  { key: "site-mym", label: "Site MYM", group: "platform", boss: true, pf: "mym" },
];
export const screenOf = (key: string) => SCREENS.find((s) => s.key === key) ?? null;
