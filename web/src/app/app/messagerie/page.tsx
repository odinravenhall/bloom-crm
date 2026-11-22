import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { RvMessagerie } from "@/rv/RvMessagerie";

export const metadata: Metadata = { title: "Messagerie" };
export const dynamic = "force-dynamic";

export default async function Messagerie() {
  await requireMe(CHAT_ROLES);
  return <RvMessagerie />;
}
