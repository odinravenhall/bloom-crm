"use client";

import { useEffect, useState } from "react";

/**
 * Thèmes de Bloom (propres à Bloom) : une base (nuit / onyx / clair), une couleur d'accent, un fond animé et les
 * animations. Gardés sur cet ordinateur (localStorage « bloom.theme »), appliqués avant le premier affichage.
 */
export type Theme = "dark" | "onyx" | "light";
export type Decor = "none" | "aurora" | "petals" | "fireflies" | "waves";
export type ThemePrefs = { base: Theme; accent: string; decor: Decor; motion: boolean };

export const THEMES: [Theme, string][] = [
  ["dark", "Aurore"],
  ["onyx", "Onyx"],
  ["light", "Clair"],
];
export const ACCENTS: [string, string][] = [
  ["#f472b6", "Aurore"],
  ["#a78bfa", "Lavande"],
  ["#2dd4bf", "Menthe"],
  ["#38bdf8", "Ciel"],
  ["#ff7a59", "Corail"],
  ["#fbbf24", "Or"],
  ["#4ade80", "Jade"],
  ["#f43f5e", "Cerise"],
];
export const DECORS: [Decor, string, string][] = [
  ["aurora", "Aurore", "Des lueurs douces qui glissent lentement"],
  ["petals", "Pétales", "Quelques pétales qui tombent, la touche Bloom"],
  ["fireflies", "Lucioles", "De petits points lumineux qui flottent"],
  ["waves", "Vagues", "Des ondes lentes en bas de l’écran"],
  ["none", "Aucun", "Fond uni, le plus sobre"],
];
export const THEME_DEFAULT: ThemePrefs = { base: "dark", accent: "#f472b6", decor: "aurora", motion: true };
const KEY = "bloom.theme";
const HEX = /^#[0-9a-f]{6}$/i;

export function readPrefs(raw: string | null): ThemePrefs {
  try {
    if (raw === "dark" || raw === "onyx" || raw === "light") return { ...THEME_DEFAULT, base: raw }; // ancien format
    const o = JSON.parse(raw || "{}");
    return {
      base: o.base === "onyx" || o.base === "light" ? o.base : "dark",
      accent: HEX.test(o.accent || "") ? o.accent.toLowerCase() : THEME_DEFAULT.accent,
      decor: DECORS.some(([d]) => d === o.decor) ? o.decor : THEME_DEFAULT.decor,
      motion: o.motion !== false,
    };
  } catch {
    return THEME_DEFAULT;
  }
}

/** Applique les préférences sur <html> (base, accent, fond, animations). Même logique que le script de démarrage. */
export function applyPrefs(p: ThemePrefs) {
  const h = document.documentElement;
  if (p.base === "dark") delete h.dataset.theme;
  else h.dataset.theme = p.base;
  h.dataset.decor = p.decor;
  h.classList.toggle("motion-off", !p.motion);
  h.style.setProperty("--color-primary", p.accent);
  h.style.setProperty("--color-primary-soft", `color-mix(in oklab, ${p.accent} ${p.base === "light" ? "78%, #000" : "62%, #fff"})`);
}

/** Posé tout en haut de la page : le thème s'applique avant le premier affichage (pas de flash). */
export const themeBootScript = `try{var r=localStorage.getItem("${KEY}"),p={};if(r==="light"||r==="onyx")p={base:r};else if(r&&r[0]==="{")p=JSON.parse(r);var h=document.documentElement,b=p.base==="light"||p.base==="onyx"?p.base:"dark",a=/^#[0-9a-f]{6}$/i.test(p.accent||"")?p.accent:"${THEME_DEFAULT.accent}";if(b!=="dark")h.dataset.theme=b;h.dataset.decor=p.decor||"${THEME_DEFAULT.decor}";if(p.motion===false)h.classList.add("motion-off");h.style.setProperty("--color-primary",a);h.style.setProperty("--color-primary-soft","color-mix(in oklab, "+a+(b==="light"?" 78%, #000)":" 62%, #fff)"));}catch(e){}`;

export function useThemePrefs() {
  const [prefs, setPrefsState] = useState<ThemePrefs>(THEME_DEFAULT);
  useEffect(() => {
    try {
      setPrefsState(readPrefs(localStorage.getItem(KEY)));
    } catch {}
  }, []);
  const setPrefs = (patch: Partial<ThemePrefs>) =>
    setPrefsState((cur) => {
      const next = { ...cur, ...patch };
      applyPrefs(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  return { prefs, setPrefs };
}

/** Compatibilité (ancien sélecteur clair / sombre / onyx). */
export function useTheme() {
  const { prefs, setPrefs } = useThemePrefs();
  return { theme: prefs.base, setTheme: (t: Theme) => setPrefs({ base: t }) };
}
