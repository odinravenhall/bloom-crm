import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { MymNudges } from "../MymNudges";

export const metadata: Metadata = { title: "Nudge IA · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(BOSS_ROLES);
  return <MymNudges />;
}
