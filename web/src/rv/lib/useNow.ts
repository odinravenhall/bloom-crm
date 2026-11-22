"use client";

import { useEffect, useState } from "react";

/* Horloge partagée : UN seul minuteur pour toute la page, chaque compteur se met à jour à la seconde. */
const subs = new Set<(n: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    subs.add(setNow);
    if (!timer) timer = setInterval(() => {
      const n = Date.now();
      for (const f of subs) f(n);
    }, ms);
    return () => {
      subs.delete(setNow);
      if (!subs.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, [ms]);
  return now;
}
