"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Signale qu'on est en ligne (page ouverte) toutes les 30 s. La messagerie le fait elle-même, avec la conversation ouverte. */
export function PresencePing() {
  const path = usePathname();
  useEffect(() => {
    if (path.startsWith("/app/messagerie")) return;
    const ping = () => fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: path }) }).catch(() => {});
    ping();
    const t = setInterval(() => document.visibilityState === "visible" && ping(), 30_000);
    return () => clearInterval(t);
  }, [path]);
  return null;
}
