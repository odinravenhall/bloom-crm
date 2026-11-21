import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Me } from "./types";

const API = process.env.API_URL || "http://api:3000";

export type State = { setup: boolean; discord: boolean; oauth?: boolean; me: Me | null };

/** État de Bloom vu par le serveur (cookie de session transmis à l'API). */
export async function getState(): Promise<State> {
  const jar = await cookies();
  const cookie = jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  try {
    const r = await fetch(`${API}/api/state`, { headers: { cookie }, cache: "no-store" });
    if (r.ok) return (await r.json()) as State;
  } catch {}
  return { setup: true, discord: true, me: null };
}

/** Pages de l'app : connexion obligatoire. `boss` = admins et managers seulement. */
export async function requireMe(boss?: boolean) {
  const s = await getState();
  if (!s.me) redirect("/connexion");
  if (boss && s.me.role !== "admin" && s.me.role !== "lead") redirect("/app/messagerie");
  return s.me;
}
