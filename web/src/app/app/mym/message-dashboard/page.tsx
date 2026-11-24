import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { MymMessages } from "../MymMessages";

export const metadata: Metadata = { title: "Message Dashboard · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(BOSS_ROLES);
  return <MymMessages />;
}
