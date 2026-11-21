import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireMe } from "@/lib/server";
import { Settings } from "./Settings";

export const metadata: Metadata = { title: "Substy & Discord" };
export const dynamic = "force-dynamic";

export default async function Reglages() {
  const me = await requireMe();
  if (me.role !== "admin") redirect("/app");
  return <Settings />;
}
