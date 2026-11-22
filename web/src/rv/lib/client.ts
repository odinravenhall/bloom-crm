"use client";

export class ClientError extends Error {
  constructor(public status: number, message: string, public warning?: unknown) {
    super(message);
  }
}

/** fetch JSON vers nos routes /api ; redirige vers la connexion si la session a expiré. */
export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  // Dans Bloom, les écrans de Raven parlent aux adresses « /api/rv/… » (même format que Raven, données de Substy).
  if (url.startsWith("/api/") && !url.startsWith("/api/rv/")) url = "/api/rv/" + url.slice(5);
  const r = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; warning?: unknown };
  if (r.status === 401) {
    window.location.href = "/connexion";
    throw new ClientError(401, "Session expirée");
  }
  if (!r.ok) throw new ClientError(r.status, j.error || `Erreur ${r.status}`, j.warning);
  return j;
}

/** Appel Reveal contrôlé (listes de fans, mass DM) pour une modèle. */
export function rv<T = unknown>(modelId: string, method: string, path: string, opts: { query?: Record<string, unknown>; body?: Record<string, unknown> } = {}) {
  return api<T>("POST", "/api/rv", { method, path, modelId, query: opts.query, body: opts.body });
}

// Toasts très simples (événement global, affichés par <Toaster/>).
export type Toast = { id: number; text: string; tone: "ok" | "err" };
let seq = 0;
export function toast(text: string, tone: "ok" | "err" = "ok") {
  window.dispatchEvent(new CustomEvent("crm-toast", { detail: { id: ++seq, text, tone } satisfies Toast }));
}

export function mediaThumb(m: { type?: string; smallUrl?: string; mediumUrl?: string; thumbnailUrl?: string; url?: string }) {
  // Vidéos Reveal en HLS : small/medium pointent vers la playlist .m3u8, l'image est thumbnailUrl.
  const img = (u?: string) => (u && !/\.m3u8(\?|$)/.test(u) ? u : undefined);
  if (m.type === "video") return img(m.thumbnailUrl) || img(m.smallUrl) || img(m.mediumUrl) || "";
  return img(m.smallUrl) || img(m.thumbnailUrl) || img(m.mediumUrl) || img(m.url) || "";
}
