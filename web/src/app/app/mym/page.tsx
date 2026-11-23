import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymAccounts } from "./MymAccounts";

export const metadata: Metadata = { title: "Mes Comptes · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymAccounts />;
}
