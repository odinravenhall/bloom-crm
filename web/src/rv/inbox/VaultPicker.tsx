"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, Folder, FolderOpen, Image as ImageIcon, Layers, Loader2, Mic, Play, Search, Video, X } from "lucide-react";
import { MediaViewer } from "@/rv/components/MediaViewer";
import { api, mediaThumb, toast } from "@/rv/lib/client";
import { cn } from "@/rv/lib/fmt";
import type { Media } from "./types";

type Fold = { id: string; name: string; imageCount: number; videoCount: number };
type VMedia = Media & { createdAt?: string };
type VaultResp = { data: VMedia[]; pageInfo: { hasNextPage: boolean; endCursor: string }; totalCount: number; totalImage?: number; totalVideo?: number };

const STATUS: Record<string, string> = { paid: "acheté", dm: "envoyé", massDM: "mass DM", paymentLink: "lien" };
const TYPES = [
  ["All", "Tout", Layers],
  ["Photo", "Photos", ImageIcon],
  ["Video", "Vidéos", Video],
  ["Audio", "Audios", Mic],
] as const;
const clean = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu, "").replace(/\s+/g, " ").trim();
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" }) : "");

/** Navigateur du vault dans le chat : dossiers à gauche, filtres + recherche en haut, grille à droite, sélection multiple. */
export function VaultPicker({ modelId, memberId, selected, onClose, onPick, canEdit = false }: { modelId: string; memberId: string | null; selected: Media[]; onClose: () => void; onPick: (m: Media[]) => void; canEdit?: boolean }) {
  const [preview, setPreview] = useState<Media | null>(null);
  const [folders, setFolders] = useState<Fold[]>([]);
  const [folder, setFolder] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number][0]>("All");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<VMedia[]>([]);
  const [totals, setTotals] = useState<{ all: number; photo: number; video: number } | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<Media[]>(selected);
  const reqId = useRef(0);

  useEffect(() => {
    api<Fold[]>("GET", `/api/models/${modelId}/folders`)
      .then((f) => setFolders(Array.isArray(f) ? f : []))
      .catch(() => {});
  }, [modelId]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = async (next?: string) => {
    const id = ++reqId.current;
    setLoading(true);
    const p = new URLSearchParams({ type });
    if (folder) p.set("folder", folder);
    if (memberId) p.set("memberId", memberId);
    if (search) p.set("search", search);
    if (next) p.set("cursor", next);
    try {
      const r = await api<VaultResp>("GET", `/api/models/${modelId}/vault?${p}`);
      if (id !== reqId.current) return;
      setItems((x) => (next ? [...x, ...r.data] : r.data));
      setCursor(r.pageInfo?.hasNextPage ? r.pageInfo.endCursor : null);
      if (!next && !folder && !search && type === "All") setTotals({ all: r.totalCount, photo: r.totalImage ?? 0, video: r.totalVideo ?? 0 });
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => {
    setItems([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, type, search, modelId, memberId]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const toggle = (m: Media) => setPick((p) => (p.some((x) => x.id === m.id) ? p.filter((x) => x.id !== m.id) : [...p, m]));
  const sorted = useMemo(() => [...folders].sort((a, b) => clean(a.name).localeCompare(clean(b.name), "fr", { numeric: true })), [folders]);

  const Counts = ({ img, vid }: { img: number; vid: number }) => (
    <span className="flex items-center gap-2 text-[11px] text-muted tabular-nums">
      {img ? (
        <span className="inline-flex items-center gap-0.5">
          <ImageIcon className="size-3" /> {img}
        </span>
      ) : null}
      {vid ? (
        <span className="inline-flex items-center gap-0.5">
          <Video className="size-3" /> {vid}
        </span>
      ) : null}
    </span>
  );

  return (
    <div className="pop absolute inset-x-2 bottom-2 top-16 z-20 flex flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-2xl backdrop-blur-xl md:inset-x-6">
      {/* En-tête : recherche + filtres + fermer */}
      <div className="flex flex-wrap items-center gap-2 border-b p-2.5">
        <span className="hidden text-sm font-bold sm:block">Vault</span>
        <select value={folder} onChange={(e) => setFolder(e.target.value)} className="h-8 max-w-40 rounded-lg border bg-card-2 px-2 text-xs sm:hidden">
          <option value="">Tous les dossiers</option>
          {sorted.map((f) => (
            <option key={f.id} value={f.id}>
              {clean(f.name)}
            </option>
          ))}
        </select>
        <div className="relative min-w-36 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher par légende / nom…" className="h-8 w-full rounded-lg border border-input bg-card-2/60 pr-3 pl-9 text-sm outline-none focus:border-primary" />
        </div>
        <div className="flex rounded-lg border bg-card-2 p-0.5">
          {TYPES.map(([k, l, Icon]) => (
            <button key={k} onClick={() => setType(k)} title={l} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold", type === k ? "bg-primary text-white" : "text-muted hover:text-fg")}>
              <Icon className="size-3.5" /> <span className="hidden md:inline">{l}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-card-2 hover:text-fg">
          <X className="size-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Volet gauche : dossiers */}
        <aside className="scroll-thin hidden w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-panel p-2 sm:flex">
          <button onClick={() => setFolder("")} className={cn("flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left", !folder ? "bg-primary/15" : "hover:bg-white/[0.04]")}>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Layers className={cn("size-4", !folder ? "text-primary-soft" : "text-muted")} /> Tous les médias
            </span>
            {totals ? <span className="pl-6"><Counts img={totals.photo} vid={totals.video} /></span> : null}
          </button>
          {sorted.map((f) => (
            <button key={f.id} onClick={() => setFolder(f.id)} className={cn("flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left", folder === f.id ? "bg-primary/15" : "hover:bg-white/[0.04]")}>
              <span className="flex items-center gap-2 text-sm font-semibold">
                {folder === f.id ? <FolderOpen className="size-4 text-primary-soft" /> : <Folder className="size-4 text-muted" />}
                <span className="min-w-0 flex-1 truncate">{clean(f.name) || "Sans nom"}</span>
              </span>
              <span className="pl-6">
                <Counts img={f.imageCount} vid={f.videoCount} />
              </span>
            </button>
          ))}
        </aside>

        {/* Volet droit : grille */}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
            {items.map((m) => {
              const on = pick.some((x) => x.id === m.id);
              const st = (m.status || []).map((s) => STATUS[s] || s);
              return (
                <button key={m.id} onClick={() => toggle(m)} className={cn("group relative aspect-[4/5] overflow-hidden rounded-xl bg-card-2 ring-2 transition-all", on ? "ring-primary" : "ring-transparent hover:ring-line")}>
                  {m.type === "audio" ? (
                    <span className="grid size-full place-items-center text-muted">
                      <Mic className="size-8" />
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaThumb(m)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} className="size-full object-cover transition-transform group-hover:scale-105" />
                  )}
                  {m.createdAt ? <span className="absolute top-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold">{day(m.createdAt)}</span> : null}
                  {m.name || m.description ? (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pt-5 pb-1 text-left text-[10px] leading-tight text-white">
                      {m.name ? <b className="block truncate">{m.name}</b> : null}
                      {m.description ? <span className="line-clamp-2 opacity-85">{m.description}</span> : null}
                    </span>
                  ) : null}
                  {/* Voir en grand (et lire la vidéo / le vocal si la protection est coupée) sans sélectionner */}
                  <span
                    role="button"
                    tabIndex={0}
                    title="Voir en grand"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreview(m);
                    }}
                    className="absolute right-1.5 bottom-1.5 z-10 grid size-7 place-items-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary"
                  >
                    <Eye className="size-3.5" />
                  </span>
                  {m.type === "video" ? (
                    <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-md bg-black/70 px-1 text-[10px] font-bold">
                      <Play className="size-2.5" /> {m.durationSeconds ? `${Math.round(m.durationSeconds)}s` : ""}
                    </span>
                  ) : null}
                  {st.length ? <span className={cn("absolute top-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold", st.includes("acheté") ? "bg-emerald-500/90 text-black" : "bg-amber-400/90 text-black")}>{st[0]}</span> : null}
                  {on ? (
                    <span className="absolute inset-0 grid place-items-center bg-primary/25">
                      <span className="grid size-7 place-items-center rounded-full bg-primary text-white">
                        <Check className="size-4" />
                      </span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {loading ? <Loader2 className="mx-auto my-6 size-6 animate-spin text-muted" /> : null}
          {!loading && !items.length ? <p className="py-10 text-center text-sm text-muted">Aucun média ici.</p> : null}
          {cursor && !loading ? (
            <button onClick={() => load(cursor)} className="mx-auto mt-3 block rounded-full border bg-card-2 px-4 py-1.5 text-xs text-muted hover:text-fg">
              Charger plus
            </button>
          ) : null}
        </div>
      </div>

      {preview ? <MediaViewer m={preview} modelId={modelId} canEdit={canEdit} onClose={() => setPreview(null)} onSaved={(n) => setItems((x) => x.map((y) => (y.id === preview.id ? { ...y, ...n } : y)))} /> : null}

      {/* Bas : sélection + ajouter */}
      <div className="flex items-center gap-3 border-t p-3">
        <p className="min-w-0 flex-1 truncate text-sm text-muted">
          {pick.length} média{pick.length > 1 ? "s" : ""} sélectionné{pick.length > 1 ? "s" : ""}
          {memberId ? " · les badges montrent ce que ce fan a déjà reçu" : ""}
        </p>
        <button onClick={onClose} className="h-9 rounded-xl px-3 text-sm text-muted hover:text-fg">
          Fermer
        </button>
        <button
          onClick={() => {
            onPick(pick);
            onClose();
          }}
          disabled={!pick.length}
          className="inline-flex h-9 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/85 disabled:opacity-40"
        >
          Ajouter au message
        </button>
      </div>
    </div>
  );
}
