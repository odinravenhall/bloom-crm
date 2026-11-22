import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { FanLists } from "./FanLists";

export const metadata: Metadata = { title: "Listes" };
export const dynamic = "force-dynamic";

export default async function ListesPage() {
  const me = await requireMe(CHAT_ROLES);
  return <FanLists canEdit={["admin", "manager", "lead"].includes(me.role)} />;
}
