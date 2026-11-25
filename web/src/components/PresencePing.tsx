"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Signale qu'on est en ligne (page ouverte) toutes les 30 s. La messagerie de la v2 le fait elle-même, avec la
 * conversation ouverte (V2Messaging) ; les autres pages envoient seulement leur adresse.
 */
export function PresencePing() {
  const path = usePathname();
  useEffect(() => {
    if (path.startsWith("/v2/messagerie")) return;
    const ping = () => fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page: path }) }).catch(() => {});
    ping();
    const t = setInterval(() => document.visibilityState === "visible" && ping(), 30_000);
    return () => clearInterval(t);
  }, [path]);
  return null;
}
