import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymNotifs } from "../MymNotifs";

export const metadata: Metadata = { title: "Notifications MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymNotifs />;
}
