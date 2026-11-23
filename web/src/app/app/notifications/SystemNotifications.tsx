"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { BloomMark } from "@/components/ui";

// System Notifications (copie d'Infloww) : « Permissions updated » quand un admin change les accès d'une personne.
type N = { id: number; kind: string; title: string; body: string; at: number; read: boolean };
const ORANGE = "#f28c5b";

function ago(at: number, t: (s: string) => string) {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return t("just now");
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return `${d} ${t(d > 1 ? "days ago" : "day ago")}`;
}

export function SystemNotifications() {
  const { t } = useT();
  const router = useRouter();
  const [items, setItems] = useState<N[] | null>(null);
  useEffect(() => {
    api<{ items: N[] }>("GET", "/api/notifs")
      .then((r) => {
        setItems(r.items);
        if (r.items.some((n) => !n.read)) api("POST", "/api/notifs/read").catch(() => {});
      })
      .catch((e) => toast((e as Error).message, "err"));
  }, []);
  const clear = async () => {
    await api("POST", "/api/notifs/clear").catch(() => {});
    setItems([]);
  };
  return (
    <div className="min-h-full" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: "var(--of-line)" }}>
        <button onClick={() => router.back()} className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[14px]" style={{ background: "var(--of-card)" }}><ArrowLeft className="size-4" /> {t("Back")}</button>
        <h1 className="text-[22px] font-semibold">{t("System Notifications")}</h1>
        <span className="flex-1" />
        {items?.length ? <button onClick={clear} className="rounded-md px-2.5 py-1 text-[14px] text-white" style={{ background: ORANGE }}>{t("Clear all")}</button> : null}
      </div>
      {(items ?? []).map((n) => (
        <div key={n.id} className="flex items-center gap-4 border-b px-5 py-4" style={{ borderColor: "var(--of-line)" }}>
          <span className="relative">
            {!n.read ? <span className="absolute -top-1 -left-1 size-2 rounded-full" style={{ background: ORANGE }} /> : null}
            <span className="grid size-11 place-items-center rounded-full" style={{ background: "#000" }}><BloomMark className="size-6" /></span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold">{t(n.title)}</p>
            <p className="text-[15px]" style={{ color: "var(--of-muted)" }}>{t(n.body)}</p>
            <p className="text-[12px]" style={{ color: "var(--of-muted)" }}>{ago(n.at, t)}</p>
          </div>
          {n.kind === "perms" ? <button onClick={() => location.assign("/app")} className="text-[16px] font-semibold" style={{ color: ORANGE }}>{t("Refresh Now")}</button> : null}
        </div>
      ))}
      <p className="py-5 text-center text-[12px]" style={{ color: "var(--of-muted)" }}>{items && !items.length ? t("No notifications") : t("Only information from the last 30 days will be displayed")}</p>
    </div>
  );
}
