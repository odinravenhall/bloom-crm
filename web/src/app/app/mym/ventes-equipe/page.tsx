import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { MymTeamSales } from "../MymTeamSales";

export const metadata: Metadata = { title: "Ventes équipe · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(BOSS_ROLES);
  return <MymTeamSales />;
}
