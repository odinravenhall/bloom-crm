import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { Settings } from "./Settings";

export const metadata: Metadata = { title: "Branchements" };
export const dynamic = "force-dynamic";

export default async function Reglages() {
  await requireMe(["admin"]);
  return <Settings />;
}
