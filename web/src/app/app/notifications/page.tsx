import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { SystemNotifications } from "./SystemNotifications";

export const metadata: Metadata = { title: "System Notifications" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe();
  return <SystemNotifications />;
}
