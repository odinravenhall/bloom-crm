import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { StyleLab } from "./StyleLab";
import "./lab.css";

// Labo de styles (25/11/2026) : page PROVISOIRE où l'agence compare quatre directions de design pour la v2 et en
// choisit une. Admins, managers et team leaders seulement. À supprimer une fois la direction retenue construite.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--f-jakarta" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--f-mono" });
const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-outfit" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--f-serif" });
export const metadata: Metadata = { title: "Directions de design · Bloom" };
export const dynamic = "force-dynamic";

export default async function StylesPage() {
  await requireMe(BOSS_ROLES);
  return (
    <div className={`${jakarta.variable} ${mono.variable} ${outfit.variable} ${serif.variable}`}>
      <StyleLab />
    </div>
  );
}
