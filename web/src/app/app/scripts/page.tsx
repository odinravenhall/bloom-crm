import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { Scripts } from "./Scripts";

export const metadata: Metadata = { title: "Scripts & séquences" };
export const dynamic = "force-dynamic";

export default async function ScriptsPage() {
  await requireMe(CHAT_ROLES);
  return <Scripts />;
}
