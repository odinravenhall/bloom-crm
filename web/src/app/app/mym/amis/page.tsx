import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymFriends } from "../MymFriends";

export const metadata: Metadata = { title: "Liste d'amis · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymFriends />;
}
