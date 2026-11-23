import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { MymImport } from "../MymImport";

export const metadata: Metadata = { title: "Importer des médias · MYM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(CHAT_ROLES);
  return <MymImport />;
}
