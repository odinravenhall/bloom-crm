import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { Preferences } from "./Preferences";

export const metadata: Metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

// ?s=… : partie des paramètres ouverte (sans : la page d'accueil des paramètres).
export default async function Parametres({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const me = await requireMe();
  const { s } = await searchParams;
  return <Preferences key={s || "menu"} me={me} section={s || null} />;
}
