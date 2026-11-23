import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymChat } from "../MymChat";

export const metadata: Metadata = { title: "Switchboard · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymChat switchboard />;
}
