import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymPlanning } from "../MymPlanning";

export const metadata: Metadata = { title: "Planification · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymPlanning />;
}
