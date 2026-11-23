"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Cloud, FolderPlus, Image as ImageIcon, Mic, Play, Plus, Search, Upload, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";

// MYM → Médias → Studio : copie de « Votre Studio » de MyPulse, en direct avec le mym.cloud de la modèle (compte MYM
// relié) : tous les médias, les collections de MYM, les vocaux. Ranger des médias et créer une collection se font chez MYM.
type Folder = { id: string; name: string; total: number; photos: number; videos: number };
type M = { id: string; type: string; thumb: string | null; full: string | null; duration: number | null; name?: string; usedPublic?: boolean; usedPrivate?: boolean };
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const dur = (s: number | null) => (s ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

export function MymStudio() {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sel, setSel] = useState("");
  const [items, setItems] = useState<M[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [type, setType] = useState<"" | "photo" | "video" | "audio">("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [fq, setFq] = useState("");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState(false);
  const [view, setView] = useState<M | null>(null);
  const loadFolders = useCallback(() => {
    if (!creatorId) return;
    api<{ collections: Folder[] }>("GET", `/api/mym/cloud/collections?creatorId=${encodeURIComponent(creatorId)}`).then((r) => (setFolders(r.collections), setErr(""))).catch((e) => (setFolders([]), setErr((e as Error).message)));
  }, [creatorId]);
  const loadMedias = useCallback(
    async (more: string | null) => {
      if (!creatorId) return;
      setBusy(true);
      const p = new URLSearchParams({ creatorId });
      if (sel) p.set("collectionId", sel);
      if (type) p.set("type", type);
      if (search && !sel) p.set("search", search);
      if (more) p.set("cursor", more);
      try {
        const r = await api<{ items: M[]; nextCursor: string | null }>("GET", `/api/mym/cloud/medias?${p}`);
        setItems((cur) => (more ? [...(cur ?? []), ...r.items] : r.items));
        setCursor(r.nextCursor);
      } catch (e) {
        setItems((cur) => cur ?? []);
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [creatorId, sel, type, search],
  );
  useEffect(() => {
    setSel("");
    loadFolders();
  }, [loadFolders]);
  useEffect(() => {
    setItems(null);
    setCursor(null);
    setPicked(new Set());
    loadMedias(null);
  }, [loadMedias]);
  // La recherche part chez MYM une demi-seconde après la dernière touche.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 500);
    return () => clearTimeout(t);
  }, [q]);
  const title = sel ? folders.find((f) => f.id === sel)?.name : "Bibliothèque";
  const shown = (items ?? []).filter((m) => !sel || !q || `${m.name ?? ""} ${m.id}`.toLowerCase().includes(q.toLowerCase()));
  const newCollection = async () => {
    const name = prompt("Nom de la nouvelle collection (créée dans le mym.cloud)");
    if (!name?.trim()) return;
    try {
      await api("POST", "/api/mym/cloud/collections", { creatorId, name });
      toast("Collection créée chez MYM");
      loadFolders();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const row = (on: boolean) => (on ? { background: "rgba(64,81,137,.35)", boxShadow: "inset 3px 0 0 #405189" } : undefined);

  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="overflow-hidden rounded-lg" style={card}>
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--mp-line)" }}>
          <h1 className="text-[16px] font-semibold" style={{ color: "var(--mp-head)" }}>Votre Studio</h1>
          <span className="flex h-8 items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}>
            <Avatar src={creator?.avatar} name={creator?.name} size="size-5" />
            <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="bg-transparent outline-none">
              {creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}
            </select>
          </span>
          <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>En direct de MYM</span>
          <span className="flex-1" />
          <button onClick={() => (loadFolders(), loadMedias(null))} className="h-8 rounded-md px-3 text-[12px] font-medium text-white" style={{ background: "#f7b84b" }}>Actualiser</button>
          <Link href="/app/mym/importer" className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px]" style={{ borderColor: "#405189", color: "#6f86d6" }}><Upload className="size-3.5" /> Importer des médias</Link>
        </div>
        {err ? <p className="border-b px-4 py-2 text-[12.5px]" style={{ borderColor: "var(--mp-line)", color: "var(--mp-down)" }}>{err}</p> : null}
        <div className="flex min-h-[70vh] flex-col md:flex-row">
          <aside className="w-full shrink-0 border-r p-3 md:w-[240px]" style={{ borderColor: "var(--mp-line)" }}>
            <label className="flex h-8 items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}><Search className="size-3.5" /><input value={fq} onChange={(e) => setFq(e.target.value)} placeholder="Rechercher une collection" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
            <button onClick={newCollection} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px]" style={{ background: "var(--mp-card-2)", color: "#6f86d6" }}><Plus className="size-3.5" /> Nouvelle collection</button>
            <div className="mt-3">
              <button onClick={() => setSel("")} className="w-full rounded-md px-3 py-2 text-left" style={row(!sel)}>
                <p className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}><Cloud className="size-3.5" /> MYM Cloud</p>
                <p className="text-[11px]" style={{ color: "var(--mp-muted)" }}>Tous les médias</p>
              </button>
              <p className="mt-3 flex justify-between px-3 text-[10.5px] font-semibold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>Collections<span>{folders.length}</span></p>
              {folders.filter((f) => !fq || f.name.toLowerCase().includes(fq.toLowerCase())).map((f) => (
                <button key={f.id} onClick={() => setSel(f.id)} className="w-full rounded-md px-3 py-2 text-left" style={row(sel === f.id)}>
                  <p className="truncate text-[12.5px] font-semibold uppercase" style={{ color: "var(--mp-head)" }}>{f.name}</p>
                  <p className="mt-0.5 flex gap-2.5 text-[11px]" style={{ color: "var(--mp-muted)" }}><span className="flex items-center gap-1"><ImageIcon className="size-3" />{f.photos}</span><span className="flex items-center gap-1"><Play className="size-3" />{f.videos}</span><span>{f.total} média(s)</span></p>
                </button>
              ))}
            </div>
          </aside>
          <section className="min-w-0 flex-1 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full" style={{ background: "var(--mp-card-2)" }}><Cloud className="size-5" /></span>
              <div>
                <p className="text-[16px] font-semibold" style={{ color: "var(--mp-head)" }}>{title}</p>
                <p className="text-[12px]" style={{ color: "var(--mp-muted)" }}>{items ? `${shown.length} média(s) affiché(s)${cursor ? " · plus à charger" : ""}` : "…"}</p>
              </div>
              <span className="flex-1" />
              <div>
                <label className="flex h-8 w-[260px] items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}><Search className="size-3.5" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={sel ? "Rechercher dans la collection" : "Rechercher (description, référence, tag)"} className="min-w-0 flex-1 bg-transparent outline-none" /></label>
                <div className="mt-2 flex overflow-hidden rounded-md border text-[12px]" style={{ borderColor: "#405189" }}>
                  {([["", "Tous"], ["photo", "Photos"], ["video", "Vidéos"], ["audio", "Vocaux"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setType(k)} className="flex-1 px-3 py-1" style={type === k ? { background: "#405189", color: "#fff" } : { color: "#6f86d6" }}>{l}</button>
                  ))}
                </div>
              </div>
              <span className="flex gap-2">
                {picking && picked.size ? <button onClick={() => setMoveTo(true)} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] text-white" style={{ background: "#405189" }}><FolderPlus className="size-3.5" /> Ranger ({picked.size})</button> : null}
                <button onClick={() => (setPicking(!picking), setPicked(new Set()))} className="h-8 rounded-md border px-3 text-[12px]" style={{ borderColor: "#405189", color: "#6f86d6" }}>{picking ? "Annuler" : "Sélectionner"}</button>
              </span>
            </div>
            <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
              {shown.map((m) => {
                const on = picked.has(m.id);
                return (
                  <button key={m.id} onClick={() => (picking && m.type !== "audio" ? setPicked((s) => (s.has(m.id) ? (s.delete(m.id), new Set(s)) : new Set(s.add(m.id)))) : setView(m))} className="text-left">
                    <span className="relative block aspect-[4/3.4] overflow-hidden rounded-md" style={{ background: "var(--mp-card-2)", outline: on ? "2px solid #0ab39c" : undefined }}>
                      {m.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : <span className="grid size-full place-items-center px-1 text-center text-[10.5px]">{m.type === "audio" ? <span><Mic className="mx-auto size-5" />{m.name}</span> : <ImageIcon className="size-6" />}</span>}
                      {m.type === "video" ? <Play className="absolute inset-0 m-auto size-7 rounded-full bg-black/45 p-1.5 text-white" /> : null}
                      {m.usedPublic || m.usedPrivate ? <span className="absolute top-1 left-1 rounded px-1.5 text-[9.5px] font-semibold text-white" style={{ background: "rgba(0,0,0,.6)" }}>{m.usedPublic ? "posté en public" : "posté en privé"}</span> : null}
                      {on ? <Check className="absolute top-1 right-1 size-5 rounded-full p-0.5 text-white" style={{ background: "#0ab39c" }} /> : null}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1 text-[10.5px]">
                      <span className="rounded px-1.5" style={{ background: m.type === "video" ? "rgba(247,184,75,.18)" : "rgba(64,81,137,.3)", color: m.type === "video" ? "#f7b84b" : "#6f86d6" }}>{m.type === "audio" ? "vocal" : m.type}</span>
                      {m.duration ? <span className="rounded bg-black px-1.5 font-semibold text-white">{dur(m.duration)}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {items && !shown.length ? <p className="py-16 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>Aucun média</p> : null}
            {cursor ? <div className="mt-5 text-center"><button disabled={busy} onClick={() => loadMedias(cursor)} className="h-9 rounded-md px-5 text-[13px] text-white disabled:opacity-50" style={{ background: "#405189" }}>{busy ? "Chargement…" : "Charger plus"}</button></div> : null}
            {!items ? <p className="py-16 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>Lecture du mym.cloud…</p> : null}
          </section>
        </div>
      </div>
      {moveTo && creatorId ? <MoveModal creatorId={creatorId} folders={folders} ids={[...picked]} onClose={() => setMoveTo(false)} onDone={() => (setMoveTo(false), setPicking(false), setPicked(new Set()), loadFolders(), loadMedias(null))} /> : null}
      {view ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onMouseDown={() => setView(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]" onMouseDown={(e) => e.stopPropagation()}>
            <button onClick={() => setView(null)} className="absolute -top-9 right-0 text-white"><X className="size-6" /></button>
            {view.type === "video" && view.full ? <HlsVideo key={view.id} src={view.full} poster={view.thumb} /> : view.type === "audio" && view.full ? <audio src={view.full} controls autoPlay /> : <img src={view.full || view.thumb || ""} alt="" className="max-h-[85vh] max-w-[90vw] rounded-md" />}
            <p className="mt-2 text-[12px] text-white/80">{view.name || view.id}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type HlsLib = { isSupported: () => boolean; new (): { loadSource: (u: string) => void; attachMedia: (v: HTMLVideoElement) => void; destroy: () => void; on: (e: string, f: (e: unknown, d: { fatal?: boolean; details?: string }) => void) => void } };
let hlsLoading: Promise<HlsLib | null> | null = null;
/** hls.js (copié dans /public) chargé une seule fois, à la première vidéo. */
const loadHls = () =>
  (hlsLoading ??= new Promise((ok) => {
    const w = window as unknown as { Hls?: HlsLib };
    if (w.Hls) return ok(w.Hls);
    const s = document.createElement("script");
    s.src = "/hls.light.min.js";
    s.onload = () => ok(w.Hls ?? null);
    s.onerror = () => ok(null);
    document.head.appendChild(s);
  }));

/** Vidéo du mym.cloud : MYM la sert en flux (HLS), relayé par Bloom. */
function HlsVideo({ src, poster }: { src: string; poster: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const proxied = /\.m3u8(\?|$)/.test(src) ? `/api/mym/hls?u=${btoa(src).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}` : src;
    if (proxied === src) {
      v.src = src;
      return;
    }
    let hls: InstanceType<HlsLib> | null = null;
    let off = false;
    loadHls().then((Hls) => {
      if (off) return;
      if (Hls?.isSupported()) {
        hls = new Hls();
        hls.on("hlsError", (_e, d) => d.fatal && setErr("Lecture impossible : le lien de MYM a peut-être expiré. Clique sur « Actualiser » puis rouvre la vidéo."));
        hls.loadSource(proxied);
        hls.attachMedia(v);
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) v.src = proxied;
      else setErr("Ce navigateur ne sait pas lire cette vidéo.");
    });
    return () => {
      off = true;
      hls?.destroy();
    };
  }, [src]);
  return (
    <>
      <video ref={ref} poster={poster ?? undefined} controls autoPlay playsInline className="max-h-[85vh] max-w-[90vw] rounded-md bg-black" />
      {err ? <p className="mt-2 text-[12.5px]" style={{ color: "#f06548" }}>{err}</p> : null}
    </>
  );
}

function MoveModal({ creatorId, folders, ids, onClose, onDone }: { creatorId: string; folders: Folder[]; ids: string[]; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState(folders[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await api("POST", "/api/mym/cloud/collections/add", { creatorId, collectionId: to, mediaIds: ids });
      toast(`${ids.length} média(s) rangé(s) dans la collection`);
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mp-font fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[420px] overflow-hidden rounded-lg" style={{ background: "#262a2f" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="px-4 py-3 text-[15px] font-semibold" style={{ background: "#2b3a4a", color: "var(--mp-head)" }}>Ranger {ids.length} média(s)</h3>
        <div className="px-4 py-4 text-[13px]">
          <p className="font-semibold" style={{ color: "var(--mp-head)" }}>Collection du mym.cloud</p>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1.5 h-10 w-full rounded-md px-3 outline-none" style={{ background: "#2f343a", color: "var(--mp-head)" }}>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {!folders.length ? <p className="mt-2" style={{ color: "var(--mp-muted)" }}>Aucune collection : crée-en une d’abord.</p> : null}
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button onClick={onClose} className="h-9 rounded-md px-4" style={{ background: "#2f343a" }}>Fermer</button>
          <button disabled={busy || !to} onClick={go} className="h-9 rounded-md px-4 text-white disabled:opacity-50" style={{ background: "#0ab39c" }}>Ranger</button>
        </div>
      </div>
    </div>
  );
}
