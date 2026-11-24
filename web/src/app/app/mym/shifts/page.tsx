import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { MymShifts } from "../MymShifts";

export const metadata: Metadata = { title: "Contrôle des shifts · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(BOSS_ROLES);
  return <MymShifts />;
}
