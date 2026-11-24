import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { MymModeration } from "../MymModeration";

export const metadata: Metadata = { title: "Modération · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(BOSS_ROLES);
  return <MymModeration />;
}
