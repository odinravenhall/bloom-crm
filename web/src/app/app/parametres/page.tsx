import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { Preferences } from "./Preferences";

export const metadata: Metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

export default async function Parametres() {
  const me = await requireMe();
  return <Preferences me={me} />;
}
