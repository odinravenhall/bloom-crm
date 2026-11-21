import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { Dashboard } from "./Dashboard";

export const metadata: Metadata = { title: "Vue d’ensemble" };
export const dynamic = "force-dynamic";

export default async function Overview() {
  // Chiffres de l'agence : admins et managers. Les chatteurs vont directement à la messagerie.
  await requireMe(true);
  return <Dashboard />;
}
