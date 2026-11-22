import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { AutoFollow } from "./AutoFollow";

export const metadata: Metadata = { title: "Auto-follow" };
export const dynamic = "force-dynamic";

export default async function AutoFollowPage() {
  const me = await requireMe(BOSS_ROLES);
  return <AutoFollow canEdit={["admin", "manager", "lead"].includes(me.role)} />;
}
