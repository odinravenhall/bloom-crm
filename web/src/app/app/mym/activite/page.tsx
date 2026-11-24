import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { MymActivity } from "../MymActivity";

export const metadata: Metadata = { title: "Activité · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(BOSS_ROLES);
  return <MymActivity />;
}
