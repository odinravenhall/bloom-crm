import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymFans } from "../MymFans";

export const metadata: Metadata = { title: "Abonnés · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymFans tab="active" />;
}
