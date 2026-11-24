import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymAnalytics } from "../MymAnalytics";

export const metadata: Metadata = { title: "Analytique · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymAnalytics />;
}
