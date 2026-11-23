import type { Metadata } from "next";
import { MANAGE_ROLES, requireMe } from "@/lib/server";
import { ManageCreators } from "./ManageCreators";

export const metadata: Metadata = { title: "Manage creators" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requireMe(MANAGE_ROLES);
  return <ManageCreators />;
}
