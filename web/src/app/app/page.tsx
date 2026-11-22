import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { Dashboard } from "./Dashboard";

export const metadata: Metadata = { title: "Vue d’ensemble" };
export const dynamic = "force-dynamic";

export default async function Overview() {
  // Chiffres : admins, managers, team leaders (leurs créatrices) et modèles (leur propre chiffre). Les chatteurs vont à la messagerie.
  const me = await requireMe(["admin", "manager", "lead", "model"]);
  return <Dashboard role={me.role} />;
}
