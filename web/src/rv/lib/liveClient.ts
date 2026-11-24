"use client";

/*
 * Temps réel côté navigateur : une seule connexion (EventSource) partagée par toute la page.
 * Dans Bloom, le flux est « /api/live » (événements de Substy) : chaque nouveau message devient un événement
 * « conv » ({ id: "<créatrice>~<fan>", modelId }), comme dans Raven. onLive("open", fn) à chaque (re)connexion.
 */
import { useEffect, useState } from "react";

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
    // L'IA de Substy a répondu : elle n'écrit plus.
    if (e.type === "new_message" && e.fanId && !e.message?.fromFan) setWriting(`${e.creatorId}~${e.fanId}`, false);
    if (e.type === "ai_generation_status" && e.data?.fanId) setWriting(`${e.creatorId}~${e.data.fanId}`, e.data.status === "started");
    if (e.type === "new_message" && e.fanId) emit("conv", { id: `${e.creatorId}~${e.fanId}`, modelId: e.creatorId, fromFan: !!e.message?.fromFan });
    // Notifications de Bloom (PPV envoyé par l'IA, PPV pas payé après 3 min, vente) : en bas à droite de la messagerie.
    else if (e.type === "bloom_alert" && e.data) emit("alert", { ...e.data, modelId: e.creatorId });
    else if (e.type === "ai_generation_status" && e.data?.fanId) emit("ai", { id: `${e.creatorId}~${e.data.fanId}`, modelId: e.creatorId, status: e.data.status });
  };
}

// ---------------------------------------------------------------- « L'IA écrit… »
// Substy annonce quand son IA commence (« started ») et finit (« finished ») de rédiger une réponse pour un fan, sur
// OnlyFans comme sur MYM. On garde la liste des conversations concernées ; une entrée s'efface seule après 90 s si
// la fin n'arrive pas.
const writing = new Map<string, number>();
const writingSubs = new Set<() => void>();
function setWriting(id: string, on: boolean) {
  if (on) writing.set(id, Date.now());
  else if (!writing.delete(id)) return;
  for (const fn of writingSubs) fn();
}
if (typeof window !== "undefined")
  setInterval(() => {
    let changed = false;
    for (const [id, t] of writing) if (Date.now() - t > 90_000) (writing.delete(id), (changed = true));
    if (changed) for (const fn of writingSubs) fn();
  }, 10_000);
/** Les conversations (« <créatrice>~<fan> ») où l'IA de Substy est en train d'écrire. */
export function useAiWriting(): ReadonlySet<string> {
  const [set, setSet] = useState<ReadonlySet<string>>(() => new Set(writing.keys()));
  useEffect(() => {
    const fn = () => setSet(new Set(writing.keys()));
    writingSubs.add(fn);
    ensure();
    fn();
    return () => void writingSubs.delete(fn);
  }, []);
  return set;
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
