import { redirect } from "next/navigation";
import { getState } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getState();
  redirect(s.me ? (s.me.role === "chatter" ? "/app/messagerie" : "/app") : "/connexion");
}
