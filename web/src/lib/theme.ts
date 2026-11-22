"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "onyx";
export const THEMES: [Theme, string][] = [
  ["light", "Clair"],
  ["dark", "Sombre"],
  ["onyx", "Onyx"],
];
const KEY = "bloom.theme";
// Comme Raven : sombre par défaut (sans attribut), « light » et « onyx » posés sur <html data-theme>.

/** Posé tout en haut de la page : le bon thème s'applique avant le premier affichage (pas de flash). */
export const themeBootScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="onyx")document.documentElement.dataset.theme=t;}catch(e){}`;

export function useTheme() {
  const [theme, setT] = useState<Theme>("dark");
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setT(t === "light" || t === "onyx" ? t : "dark");
  }, []);
  const setTheme = (t: Theme) => {
    setT(t);
    if (t === "dark") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem(KEY, t);
    } catch {}
  };
  return { theme, setTheme };
}
