import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { MymLive } from "../MymLive";

export const metadata: Metadata = { title: "En direct · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(BOSS_ROLES);
  return <MymLive />;
}
