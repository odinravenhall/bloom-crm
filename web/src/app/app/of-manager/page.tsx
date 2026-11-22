import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { OfManager } from "./OfManager";

export const metadata: Metadata = { title: "OF Manager" };
export const dynamic = "force-dynamic";

export default async function OfManagerPage() {
  await requireMe(["admin", "manager"]);
  return <OfManager />;
}
