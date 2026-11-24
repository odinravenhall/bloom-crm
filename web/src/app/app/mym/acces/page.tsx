import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { MymAccess } from "../MymAccess";

export const metadata: Metadata = { title: "Accès & équipe · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(BOSS_ROLES);
  return <MymAccess />;
}
