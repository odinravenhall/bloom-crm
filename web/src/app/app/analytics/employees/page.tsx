import type { Metadata } from "next";
import { BOSS_ROLES, requireMe } from "@/lib/server";
import { EmployeeReports } from "./EmployeeReports";

export const metadata: Metadata = { title: "Employee reports" };
export const dynamic = "force-dynamic";

export default async function EmployeeReportsPage() {
  await requireMe(BOSS_ROLES);
  return <EmployeeReports />;
}
