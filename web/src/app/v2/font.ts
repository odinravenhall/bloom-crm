import { Plus_Jakarta_Sans } from "next/font/google";

// Police de la nouvelle version : Plus Jakarta Sans, celle de Raven CRM (la version actuelle de Bloom garde Geist).
// Dans son fichier à elle : le cadre de la v2 et la page de connexion de bloomcrm.fr s'en servent tous les deux.
export const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-v2" });
