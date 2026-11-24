import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { MymDirect } from "../MymDirect";

export const metadata: Metadata = { title: "Accès MYM (Direct)" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(BOSS_ROLES);
  return <MymDirect />;
}
