"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { OF_PAGES, ofPage } from "@/lib/ofmanager";
import { OfManager } from "@/app/app/of-manager/OfManager";

// OF Manager dans le cadre de la nouvelle version (25/11/2026). L'écran lui-même est celui de la version actuelle,
// posé tel quel : le vrai site OnlyFans de la modèle, affiché par Substy (voir OfManager.tsx). Il n'est pas encore
// redessiné. Dans la version actuelle, ses pages (Home, Notifications, Vault…) sont dans le menu de gauche ; ici ce
// sont des onglets au-dessus. La page ouverte est gardée dans l'adresse (« ?p=vault »).
export function V2OfManager() {
  const { t } = useT();
  const [page, setPage] = useState("home");
  useEffect(() => {
    setPage(ofPage(new URLSearchParams(window.location.search).get("p") || undefined).key);
  }, []);
  const go = (key: string) => {
    setPage(key);
    const u = new URL(window.location.href);
    if (key === "home") u.searchParams.delete("p");
    else u.searchParams.set("p", key);
    window.history.replaceState(null, "", u);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="v2-noscroll flex shrink-0 items-center gap-1 overflow-x-auto border-b px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
        {OF_PAGES.map((p) => (
          <button key={p.key} onClick={() => go(p.key)} className="v2-chip" data-on={p.key === page}>
            <p.icon className="size-3.5" />
            {t(p.label)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <OfManager page={page} />
      </div>
    </div>
  );
}
