import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { Soon } from "./Soon";

export const metadata: Metadata = { title: "Bientôt" };
export const dynamic = "force-dynamic";

export default async function SoonPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requireMe();
  return <Soon name={String((await searchParams).f || "Soon").slice(0, 60)} />;
}
