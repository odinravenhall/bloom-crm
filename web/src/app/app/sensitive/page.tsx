import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { SensitiveWords } from "./SensitiveWords";

export const metadata: Metadata = { title: "Sensitive words" };
export const dynamic = "force-dynamic";

export default async function SensitivePage() {
  await requireMe(CHAT_ROLES);
  return <SensitiveWords />;
}
