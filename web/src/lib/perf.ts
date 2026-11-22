"use client";

import { useEffect, useState } from "react";
import { applyPerf, effective, parsePerf, PERF_DEFAULT, perfBootScript, type PerfPrefs } from "@/rv/lib/perf";

/**
 * Optimisation pour les chatteurs (PC lent, connexion lente) : sans animations, version allégée (pas de fond animé,
 * de flous ni d'ombres), connexion faible (actualisations moins fréquentes), photos du chat au clic, et un mode
 * automatique qui active ce qu'il faut selon l'appareil et la connexion. Gardé sur cet ordinateur (« bloom.perf »).
 */
const KEY = "bloom.perf";

/** Appliqué avant le premier affichage (pas de flash d'animations). */
export const bloomPerfBoot = perfBootScript(PERF_DEFAULT).replace(
  `var p=${JSON.stringify(PERF_DEFAULT)}`,
  `var p=Object.assign(${JSON.stringify(PERF_DEFAULT)},(function(){try{return JSON.parse(localStorage.getItem("${KEY}")||"{}")}catch(e){return {}}})())`,
);

export function usePerf() {
  const [prefs, setState] = useState<PerfPrefs>(PERF_DEFAULT);
  useEffect(() => {
    try {
      setState(parsePerf(localStorage.getItem(KEY) || "{}"));
    } catch {}
  }, []);
  const set = (patch: Partial<PerfPrefs>) =>
    setState((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      applyPerf(next);
      return next;
    });
  return { prefs, set, active: effective(prefs) };
}
