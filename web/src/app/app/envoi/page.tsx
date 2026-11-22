import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { Mass } from "./Mass";

export const metadata: Metadata = { title: "Envoi groupé" };
export const dynamic = "force-dynamic";

export default async function EnvoiPage() {
  const me = await requireMe(CHAT_ROLES);
  return <Mass canSend={me.role !== "chatter"} />;
}
