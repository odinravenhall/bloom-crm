"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "onyx";
export const THEMES: [Theme, string][] = [
  ["light", "Clair"],
  ["dark", "Sombre"],
  ["onyx", "Onyx"],
];
const KEY = "bloom.theme";

/** Posé tout en haut de la page : le bon thème s'applique avant le premier affichage (pas de flash). */
export const themeBootScript = `try{var t=localStorage.getItem("${KEY}");if(t==="dark"||t==="onyx")document.documentElement.dataset.theme=t;}catch(e){}`;

export function useTheme() {
  const [theme, setT] = useState<Theme>("light");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setT(t === "dark" || t === "onyx" ? t : "light");
  }, []);
  const setTheme = (t: Theme) => {
    setT(t);
    if (t === "light") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(KEY, t);
    } catch {}
  };
  return { theme, setTheme };
}
