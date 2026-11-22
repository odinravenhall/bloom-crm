import { redirect } from "next/navigation";
import { getState } from "@/lib/server";
import { homeOf } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getState();
  redirect(s.me ? (homeOf(s.me.role)) : "/connexion");
}
