import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { canOpen } from "@/lib/perms";
import { BOSS_ROLES, CHAT_ROLES, requireMe } from "@/lib/server";
import { v2BaseOf, v2Url } from "@/lib/v2host";
import { screenOf } from "../screens";
import { V2Screen } from "../V2Screen";

export async function generateMetadata({ params }: { params: Promise<{ screen: string }> }) {
  return { title: screenOf((await params).screen)?.label ?? "Bloom" };
}

export default async function V2ScreenPage({ params }: { params: Promise<{ screen: string }> }) {
  const s = screenOf((await params).screen);
  if (!s) notFound();
  const me = await requireMe(CHAT_ROLES);
  // L'accueil de la nouvelle version sur cette adresse : « / » sur bloomcrm.fr, « /v2 » sur l'adresse principale.
  const home = v2Url(v2BaseOf((await headers()).get("host")));
  if (s.boss && !BOSS_ROLES.includes(me.role)) redirect(home);
  // Le site de MYM et OF Manager : admins et managers seulement.
  if (s.manage && me.role !== "admin" && me.role !== "manager") redirect(home);
  // OF Manager garde la case d'accès de son rôle (« OF Manager »), comme dans la version actuelle.
  if (s.key === "of-manager" && !canOpen(me, "/app/of-manager")) redirect(home);
  return <V2Screen screen={s.key} label={s.label} only={s.pf ?? null} canEdit={BOSS_ROLES.includes(me.role)} />;
}
