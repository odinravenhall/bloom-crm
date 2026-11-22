import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { Vault } from "./Vault";

export const metadata: Metadata = { title: "Vault" };
export const dynamic = "force-dynamic";

export default async function VaultRoute() {
  const me = await requireMe(CHAT_ROLES);
  return <Vault canEdit={["admin", "manager", "lead"].includes(me.role)} />;
}
