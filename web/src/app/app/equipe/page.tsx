import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { Team } from "./Team";

export const metadata: Metadata = { title: "Équipe" };
export const dynamic = "force-dynamic";

export default async function Equipe() {
  // Admins, managers et team leaders.
  const me = await requireMe(BOSS_ROLES);
  return <Team me={me} />;
}
