import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { StyleLab } from "./StyleLab";
import "./lab.css";

// Labo de styles : page PROVISOIRE où l'agence valide les choix de design de la v2 sur des aperçus (25/11/2026 :
// direction « Constellation » retenue ; en cours, trois propositions pour la messagerie). Admins, managers et team
// leaders seulement. À supprimer une fois la messagerie de /v2 refaite.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--f-jakarta" });
export const metadata: Metadata = { title: "Propositions de design · Bloom" };
export const dynamic = "force-dynamic";

export default async function StylesPage() {
  await requireMe(BOSS_ROLES);
  return (
    <div className={jakarta.variable}>
      <StyleLab />
    </div>
  );
}
