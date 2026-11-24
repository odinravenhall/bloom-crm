import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymStats } from "../MymStats";

export const metadata: Metadata = { title: "Statistiques Globales · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymStats />;
}
