"use client";

import { createContext, useCallback, useContext } from "react";
import { v2Url } from "@/lib/v2host";

// Le début des adresses de la nouvelle version, sur l'adresse où l'on est : « /v2 » sur l'adresse principale, rien sur
// bloomcrm.fr (voir lib/v2host.ts). C'est le serveur qui le donne (layout.tsx lit l'adresse demandée), donc la page
// envoyée et le navigateur écrivent les mêmes liens.
// ⚠️ Un lien vers un écran de la nouvelle version passe TOUJOURS par `useV2Url()` : jamais « /v2/… » écrit en dur.
const Base = createContext("/v2");

export function V2Nav({ base, children }: { base: string; children: React.ReactNode }) {
  return <Base.Provider value={base}>{children}</Base.Provider>;
}

/** « » sur bloomcrm.fr (le site entier est la nouvelle version), « /v2 » sur l'adresse principale. */
export const useV2Base = () => useContext(Base);

/** `to("/chiffres")` = l'adresse de l'écran Chiffres ici ; `to()` = l'accueil. */
export function useV2Url() {
  const base = useContext(Base);
  return useCallback((path = "") => v2Url(base, path), [base]);
}
