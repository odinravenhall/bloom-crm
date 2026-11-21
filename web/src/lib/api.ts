"use client";

/** Appel à l'API de Bloom (même site). Lève une erreur lisible (en français) si ça échoue. */
export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { error?: string; details?: unknown };
  if (r.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/login")) window.location.href = "/connexion";
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { status: r.status, details: j.details });
  return j as T;
}

export type Toast = { id: number; text: string; tone: "ok" | "err" };
let n = 0;
export function toast(text: string, tone: "ok" | "err" = "ok") {
  window.dispatchEvent(new CustomEvent<Toast>("bloom-toast", { detail: { id: ++n, text, tone } }));
}
