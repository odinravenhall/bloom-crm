import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { homeOf, type Me, type Role } from "./types";

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

/** Pages de l'app : connexion obligatoire ; `allow` = rôles autorisés (sinon : page d'arrivée du rôle). */
export async function requireMe(allow?: Role[]) {
  const s = await getState();
  if (!s.me) redirect("/connexion");
  // Page non autorisée : retour à la page d'arrivée du rôle (toujours autorisée pour lui).
  if (allow && !allow.includes(s.me.role)) redirect(homeOf(s.me.role));
  return s.me;
}
export const CHAT_ROLES: Role[] = ["admin", "manager", "lead", "chatter"];
export const BOSS_ROLES: Role[] = ["admin", "manager", "lead"];
export const MANAGE_ROLES: Role[] = ["admin", "manager"];
