import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { ManageEmployees } from "./ManageEmployees";

export const metadata: Metadata = { title: "Manage employees" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(BOSS_ROLES);
  return <ManageEmployees />;
}
