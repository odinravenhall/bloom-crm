import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { Lists } from "./Lists";

export const metadata: Metadata = { title: "Listes" };
export const dynamic = "force-dynamic";

export default async function ListesPage() {
  const me = await requireMe(CHAT_ROLES);
  return <Lists canEdit={["admin", "manager", "lead"].includes(me.role)} />;
}
