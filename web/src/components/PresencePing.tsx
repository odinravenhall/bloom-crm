"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { canonicalPath } from "@/lib/v2host";

/**
 * Signale qu'on est en ligne (page ouverte) toutes les 30 s. La messagerie de la v2 le fait elle-même, avec la
 * conversation ouverte (V2Messaging) ; les autres pages envoient seulement leur adresse.
 */
export function PresencePing() {
  const path = usePathname();
  useEffect(() => {
    // Sur bloomcrm.fr les adresses n'ont pas de « /v2 » : le serveur reçoit quand même le chemin officiel
    // (« /v2/chiffres »), le seul qu'il connaisse (« Sur le chat », écran En direct).
    const page = canonicalPath(path, window.location.hostname);
    if (page.startsWith("/v2/messagerie")) return;
    const ping = () => fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ page }) }).catch(() => {});
    ping();
    const t = setInterval(() => document.visibilityState === "visible" && ping(), 30_000);
    return () => clearInterval(t);
  }, [path]);
  return null;
}
