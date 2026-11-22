"use client";

import { useEffect, useState } from "react";
import { Loader2, Mic, Pencil, Play, X } from "lucide-react";
import { api, mediaThumb, toast } from "@/rv/lib/client";
import { Watermark } from "@/rv/components/MediaGuard";
import { VideoPlayer } from "@/rv/components/VideoPlayer";

type M = { id: string; type?: string; url?: string; smallUrl?: string; mediumUrl?: string; largeUrl?: string; thumbnailUrl?: string; durationSeconds?: number | null; name?: string | null; description?: string | null };

const isHls = (u?: string) => !!u && u.includes("/api/media/hls");
const dur = (s?: number | null) => (s && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

/**
 * Grand aperçu d'un média (vault, scripts). Protection active : aperçu réduit + filigrane, pas de lecture.
 * Protection coupée par un admin (Configuration) : photo pleine taille, vidéo et vocal lisibles.
 */
export function MediaViewer({ m, onClose, title, modelId, canEdit, onSaved }: { m: M; onClose: () => void; title?: string | null; modelId?: string; canEdit?: boolean; onSaved?: (n: { name: string | null; description: string | null }) => void }) {
  const [name, setName] = useState(m.name ?? "");
  const [desc, setDesc] = useState(m.description ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!modelId) return;
    setSaving(true);
    try {
      const r = await api<{ name: string | null; description: string | null; reveal: boolean }>("PATCH", `/api/models/${modelId}/media/${m.id}`, { name, description: desc });
      m.name = r.name;
      m.description = r.description;
      onSaved?.({ name: r.name, description: r.description });
      setEditing(false);
      toast(r.reveal ? "Description enregistrée (CRM + Reveal)" : "Description enregistrée dans le CRM (Reveal n’a pas répondu)");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const videoSrc = m.type === "video" ? [m.url, m.mediumUrl, m.smallUrl].find(isHls) : undefined;
  const audioSrc = m.type === "audio" ? m.url || m.mediumUrl || m.smallUrl : undefined;
  const open = !!videoSrc || !!audioSrc || (m.type === "photo" && !!m.largeUrl);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button onClick={onClose} className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Fermer">
        <X className="size-5" />
      </button>
      <div className="flex max-h-full max-w-[94vw] flex-col items-center gap-3">
        <div className={videoSrc ? "relative" : "pop relative overflow-hidden rounded-2xl"}>
          {videoSrc ? (
            // Taille normale : la vidéo remplit la hauteur de l'écran, commandes du navigateur (lecture, avance, volume, plein écran).
            <VideoPlayer src={videoSrc} poster={mediaThumb(m) || undefined} className="h-[78dvh] w-auto max-w-[94vw] rounded-2xl bg-black object-contain" />
          ) : m.type === "audio" ? (
            <div className="flex h-60 w-80 flex-col items-center justify-center gap-4 bg-card-2 text-muted">
              <Mic className="size-12" />
              {audioSrc ? <audio src={audioSrc} controls autoPlay className="w-64" /> : null}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.type === "photo" ? m.largeUrl || m.mediumUrl || mediaThumb(m) : mediaThumb(m)} alt="" className="max-h-[82dvh] max-w-full object-contain" />
          )}
          {!open ? <Watermark /> : null}
          {!open && m.type !== "photo" ? (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-bold text-white">
              <Play className="size-3.5" /> {dur(m.durationSeconds) || (m.type === "video" ? "vidéo" : "audio")} · aperçu protégé
            </span>
          ) : null}
        </div>
        {/* Nom + description (ce que dit le vocal, quand l'envoyer…) */}
        {editing ? (
          <div className="flex w-[min(560px,92vw)] flex-col gap-2 rounded-2xl border bg-card/95 p-3">
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} placeholder="Nom (ex. PPV2, vocal bonjour…)" className="h-9 rounded-lg border border-input bg-card-2 px-3 text-sm outline-none focus:border-primary" />
            <textarea value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 500))} rows={4} autoFocus placeholder="Description : ce qu’elle dit dans le vocal, ce qu’on voit, quand l’envoyer…" className="scroll-thin resize-y rounded-lg border border-input bg-card-2 p-3 text-sm outline-none focus:border-primary" />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted">{desc.length} / 500 · enregistrée dans le CRM et sur Reveal</span>
              <span className="flex-1" />
              <button onClick={() => setEditing(false)} className="h-8 rounded-lg px-3 text-sm text-muted hover:text-fg">Annuler</button>
              <button onClick={save} disabled={saving} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Enregistrer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex max-w-[min(560px,92vw)] flex-col items-center gap-1 text-center">
            {title || m.name ? <p className="text-sm font-bold text-white">{title || m.name}</p> : null}
            {m.description ? <p className="text-sm whitespace-pre-wrap text-white/80">{m.description}</p> : null}
            {canEdit && modelId ? (
              <button onClick={() => setEditing(true)} className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
                <Pencil className="size-3.5" /> {m.description || m.name ? "Modifier la description" : "Ajouter une description"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
