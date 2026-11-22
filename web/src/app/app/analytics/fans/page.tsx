import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { FanReports } from "./FanReports";

export const metadata: Metadata = { title: "Fan reports" };
export const dynamic = "force-dynamic";

export default async function FanReportsPage() {
  await requireMe(BOSS_ROLES);
  return <FanReports />;
}
