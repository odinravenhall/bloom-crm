import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { VaultPage } from "./VaultPage";

export const metadata: Metadata = { title: "Vault" };
export const dynamic = "force-dynamic";

export default async function Vault() {
  await requireMe(CHAT_ROLES);
  return <VaultPage />;
}
