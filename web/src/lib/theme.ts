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
  ["dark", "Noir"],
  ["onyx", "Onyx"],
  ["light", "Clair"],
];
export const ACCENTS: [string, string][] = [
  ["#fafafa", "Blanc"],
  ["#f472b6", "Rose"],
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
export const THEME_DEFAULT: ThemePrefs = { base: "dark", accent: "#fafafa", decor: "none", motion: true };
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
/** Clarté d'une couleur (0 = noir, 1 = blanc) : sert à choisir un texte noir ou blanc dessus. */
export function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Sur fond clair, un accent blanc devient noir (sinon invisible). */
const accentFor = (p: ThemePrefs) => (p.base === "light" && lum(p.accent) > 0.75 ? "#18181b" : p.accent);

export function applyPrefs(p: ThemePrefs) {
  const h = document.documentElement;
  const a = accentFor(p);
  if (p.base === "dark") delete h.dataset.theme;
  else h.dataset.theme = p.base;
  h.dataset.decor = p.decor;
  h.classList.toggle("motion-off", !p.motion);
  h.style.setProperty("--color-primary", a);
  h.style.setProperty("--color-primary-soft", `color-mix(in oklab, ${a} ${p.base === "light" ? "78%, #000" : "62%, #fff"})`);
  h.style.setProperty("--color-on-primary", lum(a) > 0.45 ? "#09090b" : "#ffffff");
}

/** Posé tout en haut de la page : le thème s'applique avant le premier affichage (pas de flash). */
export const themeBootScript = `try{var r=localStorage.getItem("${KEY}"),p={};if(r==="light"||r==="onyx")p={base:r};else if(r&&r[0]==="{")p=JSON.parse(r);var h=document.documentElement,b=p.base==="light"||p.base==="onyx"?p.base:"dark",a=/^#[0-9a-f]{6}$/i.test(p.accent||"")?p.accent:"${THEME_DEFAULT.accent}";function L(x){var n=parseInt(x.slice(1),16),c=[(n>>16)&255,(n>>8)&255,n&255].map(function(v){v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]}if(b==="light"&&L(a)>.75)a="#18181b";if(b!=="dark")h.dataset.theme=b;h.dataset.decor=p.decor||"${THEME_DEFAULT.decor}";if(p.motion===false)h.classList.add("motion-off");h.style.setProperty("--color-primary",a);h.style.setProperty("--color-primary-soft","color-mix(in oklab, "+a+(b==="light"?" 78%, #000)":" 62%, #fff)"));h.style.setProperty("--color-on-primary",L(a)>.45?"#09090b":"#ffffff");}catch(e){}`;

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
