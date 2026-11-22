import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { Performance } from "./Performance";

export const metadata: Metadata = { title: "Performances" };
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  await requireMe(BOSS_ROLES);
  return <Performance />;
}
