import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { Fans } from "./Fans";

export const metadata: Metadata = { title: "Fans" };
export const dynamic = "force-dynamic";

export default async function FansPage() {
  await requireMe();
  return <Fans />;
}
