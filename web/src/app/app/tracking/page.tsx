import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { TrackingLinks } from "./TrackingLinks";

export const metadata: Metadata = { title: "Tracking links" };
export const dynamic = "force-dynamic";

export default async function TrackingPage() {
  await requireMe(BOSS_ROLES);
  return <TrackingLinks />;
}
