import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { CreatorReports } from "./CreatorReports";

export const metadata: Metadata = { title: "Creator reports" };
export const dynamic = "force-dynamic";

export default async function CreatorReportsPage() {
  await requireMe(BOSS_ROLES);
  return <CreatorReports />;
}
