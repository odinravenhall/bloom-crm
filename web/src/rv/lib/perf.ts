/*
 * Mode optimisation (Réglages → Optimisation), enregistré sur le compte du chatteur.
 * Chaque option pose une classe sur <html> ; le CSS et les composants s'adaptent.
 *  - noAnim  : plus aucune animation ni transition
 *  - lite    : plus de fond animé, de flous ni d'ombres (le plus lourd pour un PC faible)
 *  - data    : actualisations deux fois moins fréquentes (connexion faible)
 *  - noMedia : photos du chat chargées seulement au clic
 *  - auto    : active tout seul ces optimisations si l'appareil ou la connexion est faible
 */

export type PerfPrefs = { auto: boolean; noAnim: boolean; lite: boolean; data: boolean; noMedia: boolean; ravenCard: boolean; onlineRing: boolean };
export type PerfKey = Exclude<keyof PerfPrefs, "auto" | "ravenCard" | "onlineRing">;

// ravenCard : Raven Card (score du fan) dans la messagerie. Masquée par défaut (place pour les notes), activable dans Réglages → Préférences.
export const PERF_DEFAULT: PerfPrefs = { auto: true, noAnim: false, lite: false, data: false, noMedia: false, ravenCard: false, onlineRing: false };
const CLASS: Record<PerfKey, string> = { noAnim: "perf-noanim", lite: "perf-lite", data: "perf-data", noMedia: "perf-nomedia" };

export function parsePerf(raw: unknown): PerfPrefs {
  let o: Partial<PerfPrefs> = {};
  try {
    o = typeof raw === "string" ? JSON.parse(raw) : raw && typeof raw === "object" ? (raw as Partial<PerfPrefs>) : {};
  } catch {}
  const b = (k: keyof PerfPrefs) => (typeof o[k] === "boolean" ? (o[k] as boolean) : PERF_DEFAULT[k]);
  return { auto: b("auto"), noAnim: b("noAnim"), lite: b("lite"), data: b("data"), noMedia: b("noMedia"), ravenCard: b("ravenCard"), onlineRing: b("onlineRing") };
}

type Conn = { saveData?: boolean; effectiveType?: string; downlink?: number; rtt?: number; addEventListener?: (t: string, f: () => void) => void };

/*
 * Mesures réelles (gardées sur l'appareil, refaites chaque jour) : fluidité de l'affichage (images / seconde)
 * et temps de réponse du serveur depuis la connexion de la personne. Marche partout (Safari / Firefox
 * n'annoncent ni la mémoire ni le type de connexion).
 */
export type Measure = { fps: number | null; latency: number | null; at: number };
const MEASURE_KEY = "crm.perfMeasure";
export function getMeasure(): Measure | null {
  try {
    const m = JSON.parse(localStorage.getItem(MEASURE_KEY) || "null") as Measure | null;
    return m && Date.now() - m.at < 864e5 ? m : null;
  } catch {
    return null;
  }
}
export function saveMeasure(m: Measure) {
  try {
    localStorage.setItem(MEASURE_KEY, JSON.stringify(m));
  } catch {}
}

/** Images par seconde pendant `ms` (page au repos). */
export function measureFps(ms = 2500): Promise<number> {
  return new Promise((res) => {
    if (typeof requestAnimationFrame === "undefined") return res(60);
    let n = 0;
    const start = performance.now();
    const step = (t: number) => {
      n++;
      if (t - start < ms) requestAnimationFrame(step);
      else res(Math.round((n * 1000) / (t - start)));
    };
    requestAnimationFrame(step);
  });
}

/** Temps de réponse médian du serveur (3 petits appels). */
export async function measureLatency(): Promise<number | null> {
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    try {
      await fetch("/api/ping", { cache: "no-store" });
      times.push(performance.now() - t);
    } catch {}
  }
  if (!times.length) return null;
  times.sort((a, b) => a - b);
  return Math.round(times[Math.floor(times.length / 2)]);
}

/** Ce que l'appareil laisse deviner + ce qu'on a mesuré : PC faible et connexion lente. */
export function detect() {
  if (typeof navigator === "undefined") return { weakDevice: false, slowNet: false, reasons: [] as string[] };
  const n = navigator as Navigator & { deviceMemory?: number; connection?: Conn };
  const reasons: string[] = [];
  const mem = n.deviceMemory;
  const cores = n.hardwareConcurrency;
  const m = getMeasure();
  // Matériel : seulement les vrais petits PC (avant : 4 cœurs suffisaient, trop de faux positifs).
  const tiny = (!!mem && mem <= 2) || (!!cores && cores <= 2) || (!!mem && mem <= 4 && !!cores && cores <= 4);
  if (tiny) reasons.push([mem ? `${mem} Go de mémoire` : "", cores ? `${cores} cœurs` : ""].filter(Boolean).join(", "));
  const jerky = !!m?.fps && m.fps < 40;
  if (jerky) reasons.push(`affichage saccadé (${m!.fps} images/s)`);
  const c = n.connection;
  const netHint = !!c && (!!c.saveData || /(^|-)(2g|3g)$/.test(c.effectiveType || "") || (!!c.downlink && c.downlink < 1.5) || (!!c.rtt && c.rtt > 400));
  if (netHint) reasons.push(c?.saveData ? "économiseur de données" : "connexion lente");
  const laggy = !!m?.latency && m.latency > 900;
  if (laggy) reasons.push(`serveur lent à répondre depuis ta connexion (${m!.latency} ms)`);
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) reasons.push("animations réduites dans le système");
  return { weakDevice: tiny || jerky || reduced, slowNet: netHint || laggy, reasons };
}

/**
 * Actualisation périodique qui s'arrête quand l'onglet est caché (aucune requête pour rien) et rattrape
 * tout de suite au retour sur l'onglet. Intervalle doublé en mode « connexion faible ».
 */
export function everyVisible(fn: () => void, base: number) {
  let last = Date.now();
  const run = () => {
    last = Date.now();
    fn();
  };
  const t = setInterval(() => {
    if (document.visibilityState === "visible" && Date.now() - last >= pollMs(base) - 50) run();
  }, Math.min(5_000, base));
  const onVis = () => {
    if (document.visibilityState === "visible" && Date.now() - last > pollMs(base)) run();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    clearInterval(t);
    document.removeEventListener("visibilitychange", onVis);
  };
}

/** Options réellement actives : choix manuels + ce que le mode auto ajoute. */
export function effective(p: PerfPrefs): Record<PerfKey, boolean> {
  const d = p.auto ? detect() : { weakDevice: false, slowNet: false };
  return {
    noAnim: p.noAnim || d.weakDevice || d.slowNet,
    lite: p.lite || d.weakDevice,
    data: p.data || d.slowNet,
    noMedia: p.noMedia || d.slowNet,
  };
}

/** Applique les options sur la page. */
export function applyPerf(p: PerfPrefs) {
  if (typeof document === "undefined") return;
  const e = effective(p);
  for (const k of Object.keys(CLASS) as PerfKey[]) document.documentElement.classList.toggle(CLASS[k], e[k]);
  document.documentElement.classList.toggle("pref-ravencard", !!p.ravenCard);
  document.documentElement.classList.toggle("pref-onlinering", !!p.onlineRing);
  window.dispatchEvent(new CustomEvent("crm-perf"));
}

export function perfOn(k: PerfKey) {
  return typeof document !== "undefined" && document.documentElement.classList.contains(CLASS[k]);
}

/** Intervalle d'actualisation : doublé en mode « connexion faible ». */
export function pollMs(base: number) {
  return perfOn("data") ? base * 2 : base;
}

/** Script appliqué avant le premier affichage (pas de flash d'animations) : mêmes règles que effective(). */
export function perfBootScript(p: PerfPrefs) {
  return `(function(){try{var p=${JSON.stringify(p)},n=navigator,c=n.connection||{},m=n.deviceMemory,h=n.hardwareConcurrency;
var r=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
var M=null;try{M=JSON.parse(localStorage.getItem("crm.perfMeasure")||"null");if(M&&Date.now()-M.at>864e5)M=null}catch(e){}
var w=p.auto&&((m&&m<=2)||(h&&h<=2)||(m&&m<=4&&h&&h<=4)||r||(M&&M.fps&&M.fps<40));
var s=p.auto&&((M&&M.latency>900)||c.saveData||/(^|-)(2g|3g)$/.test(c.effectiveType||"")||(c.downlink&&c.downlink<1.5)||(c.rtt&&c.rtt>400));
var l=document.documentElement.classList;
l.toggle("perf-noanim",!!(p.noAnim||w||s));l.toggle("perf-lite",!!(p.lite||w));l.toggle("perf-data",!!(p.data||s));l.toggle("perf-nomedia",!!(p.noMedia||s));l.toggle("pref-ravencard",!!p.ravenCard);l.toggle("pref-onlinering",!!p.onlineRing);
}catch(e){}})();`;
}
