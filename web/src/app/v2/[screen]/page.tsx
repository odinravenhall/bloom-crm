import { notFound, redirect } from "next/navigation";
import { BOSS_ROLES, CHAT_ROLES, requireMe } from "@/lib/server";
import { screenOf } from "../screens";
import { V2Screen } from "../V2Screen";

export async function generateMetadata({ params }: { params: Promise<{ screen: string }> }) {
  return { title: screenOf((await params).screen)?.label ?? "Bloom" };
}

export default async function V2ScreenPage({ params }: { params: Promise<{ screen: string }> }) {
  const s = screenOf((await params).screen);
  if (!s) notFound();
  const me = await requireMe(CHAT_ROLES);
  if (s.boss && !BOSS_ROLES.includes(me.role)) redirect("/v2");
  // Le site de MYM : admins et managers seulement.
  if (s.key === "site-mym" && me.role !== "admin" && me.role !== "manager") redirect("/v2");
  return <V2Screen screen={s.key} label={s.label} only={s.pf ?? null} canEdit={BOSS_ROLES.includes(me.role)} />;
}
