"use client";

/*
 * Temps réel côté navigateur : une seule connexion (EventSource) partagée par toute la page.
 * Dans Bloom, le flux est « /api/live » (événements de Substy) : chaque nouveau message devient un événement
 * « conv » ({ id: "<créatrice>~<fan>", modelId }), comme dans Raven. onLive("open", fn) à chaque (re)connexion.
 */
type Fn = (d: { id?: string; modelId?: string | null; [k: string]: unknown }) => void;
const subs = new Map<string, Set<Fn>>();
let es: EventSource | null = null;

const emit = (type: string, d: Parameters<Fn>[0]) => {
  for (const fn of subs.get(type) ?? []) fn(d);
};

function ensure() {
  if (es || typeof window === "undefined" || typeof EventSource === "undefined") return;
  es = new EventSource("/api/live");
  es.onopen = () => emit("open", {});
  es.onmessage = (ev) => {
    let e: { creatorId?: string; type?: string; fanId?: string; message?: { fromFan?: boolean }; data?: { fanId?: string; status?: string; [k: string]: unknown } };
    try {
      e = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!e.creatorId) return;
    if (e.type === "new_message" && e.fanId) emit("conv", { id: `${e.creatorId}~${e.fanId}`, modelId: e.creatorId, fromFan: !!e.message?.fromFan });
    // Notifications de Bloom (PPV envoyé par l'IA, PPV pas payé après 3 min, vente) : en bas à droite de la messagerie.
    else if (e.type === "bloom_alert" && e.data) emit("alert", { ...e.data, modelId: e.creatorId });
    else if (e.type === "ai_generation_status" && e.data?.fanId) emit("ai", { id: `${e.creatorId}~${e.data.fanId}`, modelId: e.creatorId, status: e.data.status });
  };
}

export function onLive(type: string, fn: Fn) {
  if (!subs.has(type)) subs.set(type, new Set());
  subs.get(type)!.add(fn);
  ensure();
  return () => {
    subs.get(type)?.delete(fn);
  };
}

/** Regroupe les appels rapprochés (une rafale d'événements = un seul rechargement). */
export function debounce<T extends unknown[]>(fn: (...a: T) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...a: T) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
