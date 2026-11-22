import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { SmartMessages } from "./SmartMessages";

export const metadata: Metadata = { title: "Smart Messages" };
export const dynamic = "force-dynamic";

export default async function SmartMessagesPage() {
  await requireMe(BOSS_ROLES);
  return <SmartMessages />;
}
