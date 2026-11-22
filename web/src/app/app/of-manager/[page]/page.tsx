import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { ofPage } from "@/lib/ofmanager";
import { OfManager } from "../OfManager";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  return { title: `${ofPage((await params).page).title} · OF Manager` };
}

export default async function OfManagerPage({ params }: { params: Promise<{ page: string }> }) {
  await requireMe(["admin", "manager"]);
  return <OfManager page={ofPage((await params).page).key} />;
}
