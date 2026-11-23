import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymVouchers } from "../MymVouchers";

export const metadata: Metadata = { title: "Bon de réduction · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymVouchers />;
}
