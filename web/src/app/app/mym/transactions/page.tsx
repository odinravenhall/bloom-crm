import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymTransactions } from "../MymTransactions";

export const metadata: Metadata = { title: "Transactions · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymTransactions />;
}
