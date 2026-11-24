import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymMassDm } from "../MymMassDm";

export const metadata: Metadata = { title: "Mass DM · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymMassDm />;
}
