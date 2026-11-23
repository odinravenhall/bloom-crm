import type { Metadata } from "next";
import { MANAGE_ROLES, requireMe } from "@/lib/server";
import { RoleSettings } from "./RoleSettings";

export const metadata: Metadata = { title: "Role settings" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(MANAGE_ROLES);
  return <RoleSettings />;
}
