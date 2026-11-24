import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymTrack } from "../MymTrack";

export const metadata: Metadata = { title: "Liens de suivi · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymTrack />;
}
