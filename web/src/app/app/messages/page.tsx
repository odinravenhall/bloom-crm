import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { SentMessages } from "./SentMessages";

export const metadata: Metadata = { title: "Messages envoyés" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  await requireMe(BOSS_ROLES);
  return <SentMessages />;
}
