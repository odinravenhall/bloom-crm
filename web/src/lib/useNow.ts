"use client";

import { useEffect, useState } from "react";

/*
 * Horloge partagée : UN minuteur par rythme (à la seconde pour les chronos, à la minute pour les listes…),
 * quel que soit le nombre de compteurs à l'écran. Chaque rythme a le sien : un abonné « à la minute »
 * ne ralentit plus les chronos « à la seconde ».
 */
const clocks = new Map<number, { subs: Set<(n: number) => void>; timer: ReturnType<typeof setInterval> }>();

export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let c = clocks.get(ms);
    if (!c) {
      const subs = new Set<(n: number) => void>();
      c = {
        subs,
        timer: setInterval(() => {
          const n = Date.now();
          for (const f of subs) f(n);
        }, ms),
      };
      clocks.set(ms, c);
    }
    c.subs.add(setNow);
    setNow(Date.now());
    return () => {
      const k = clocks.get(ms);
      if (!k) return;
      k.subs.delete(setNow);
      if (!k.subs.size) {
        clearInterval(k.timer);
        clocks.delete(ms);
      }
    };
  }, [ms]);
  return now;
}
