import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { AiConfig } from "./AiConfig";

export const metadata: Metadata = { title: "Configuration IA" };
export const dynamic = "force-dynamic";

export default async function Ia() {
  await requireMe(["admin", "manager"]);
  return <AiConfig />;
}
