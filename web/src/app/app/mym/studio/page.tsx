import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymStudio } from "../MymStudio";

export const metadata: Metadata = { title: "Studio · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymStudio />;
}
