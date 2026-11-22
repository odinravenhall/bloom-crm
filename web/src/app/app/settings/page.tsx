import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { Settings } from "./Settings";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await requireMe();
  return <Settings me={me} />;
}
