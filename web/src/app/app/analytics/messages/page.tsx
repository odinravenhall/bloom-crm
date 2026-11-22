import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { MessageDashboard } from "./MessageDashboard";

export const metadata: Metadata = { title: "Message dashboard" };
export const dynamic = "force-dynamic";

export default async function MessageDashboardPage() {
  await requireMe(BOSS_ROLES);
  return <MessageDashboard />;
}
