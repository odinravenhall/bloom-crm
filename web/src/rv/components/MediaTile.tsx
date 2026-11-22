"use client";

import { Mic } from "lucide-react";
import { mediaThumb } from "@/rv/lib/client";
import { cn } from "@/rv/lib/fmt";

type M = { id: string; type?: string; smallUrl?: string; mediumUrl?: string; thumbnailUrl?: string; url?: string; durationSeconds?: number | null; name?: string | null; description?: string | null };

const tip = (m: M, fallback: string) => [m.name, m.description].filter(Boolean).join(" — ") || fallback;

const dur = (s?: number | null) => (s && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

/**
 * Vignette d'un média de script / du composeur : photo, vidéo (badge ▶) ou vocal (micro + durée).
 * Les vocaux du vault n'ont pas d'image : sans ça on voyait un carré vide.
 */
export function MediaTile({ m, className = "size-12", blurred = false }: { m: M; className?: string; blurred?: boolean }) {
  if (m.type === "audio") {
    return (
      <span title={tip(m, "Message vocal")} className={cn("flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-primary/40 bg-primary/15 text-primary-soft", className)}>
        <Mic className="size-4" />
        <span className="text-[9px] leading-none font-bold">{dur(m.durationSeconds) || "Vocal"}</span>
      </span>
    );
  }
  const src = mediaThumb(m);
  return (
    <span title={tip(m, "")} className={cn("relative block shrink-0 overflow-hidden rounded-md bg-card-2", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} className={cn("size-full object-cover", blurred && "scale-110 blur-xl")} />
      ) : (
        <span className="grid size-full place-items-center text-[10px] font-semibold text-muted">{m.type === "video" ? "Vidéo" : "Photo"}</span>
      )}
      {m.type === "video" ? <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[9px] font-bold text-white">▶{dur(m.durationSeconds) ? ` ${dur(m.durationSeconds)}` : ""}</span> : null}
    </span>
  );
}

/** Résumé lisible des médias : « 🎤 vocal · 2 photos · 1 vidéo ». */
export function mediaSummary(list: { type?: string }[]) {
  const n = (t: string) => list.filter((m) => m.type === t).length;
  const a = n("audio"), p = n("photo"), v = n("video");
  return [a ? `🎤 ${a > 1 ? `${a} vocaux` : "vocal"}` : "", p ? `${p} photo${p > 1 ? "s" : ""}` : "", v ? `${v} vidéo${v > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
}

/** Descriptions des médias (ce que dit le vocal, quand l'envoyer…) : une ligne par média décrit. */
export function MediaNotes({ list, className }: { list: { id: string; type?: string; name?: string | null; description?: string | null }[]; className?: string }) {
  const withNote = list.filter((m) => m.description || m.name);
  if (!withNote.length) return null;
  return (
    <span className={cn("mt-1 flex flex-col gap-0.5", className)}>
      {withNote.map((m) => (
        <span key={m.id} className="text-[11px] leading-snug text-fg/75">
          {m.type === "audio" ? "🎤 " : m.type === "video" ? "🎬 " : "📷 "}
          {m.name ? <b className="text-fg/90">{m.name}</b> : null}
          {m.name && m.description ? " · " : ""}
          {m.description ? <span className="italic">« {m.description} »</span> : null}
        </span>
      ))}
    </span>
  );
}
