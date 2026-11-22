import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { OfDashboard } from "./OfDashboard";

export const metadata: Metadata = { title: "Dashboard · OnlyFans" };
export const dynamic = "force-dynamic";

export default async function OfDashboardPage() {
  await requireMe(BOSS_ROLES);
  return <OfDashboard />;
}
