import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { Team } from "./Team";

export const metadata: Metadata = { title: "Équipe" };
export const dynamic = "force-dynamic";

export default async function Equipe() {
  // Admins et managers (team leaders).
  const me = await requireMe(true);
  return <Team me={me} />;
}
