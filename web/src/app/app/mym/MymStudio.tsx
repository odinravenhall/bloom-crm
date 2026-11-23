"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Check, Cloud, FolderPlus, Image as ImageIcon, Mic, Play, Plus, Search, Upload, Video, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";

// MYM → Médias → Studio : copie de « Votre Studio » de MyPulse. Le vault de la modèle chez Substy (ses dossiers =
// collections), et en plus nos collections Bloom. Ranger des médias dans un dossier se fait chez Substy.
type Folder = { id: string; name: string; photos: number; videos: number; audios: number; total: number };
type Custom = { id: number; name: string; count: number; photos: number; videos: number; audios: number };
type M = { id: string; type: string; thumb: string | null; full: string | null; duration: number | null; createdAt: string | null; caption: string; lists: string[]; catId: number | null };
type Sel = { kind: "all" } | { kind: "list"; id: string } | { kind: "cat"; id: number };
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const dur = (s: number | null) => (s ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

export function MymStudio() {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [custom, setCustom] = useState<Custom[]>([]);
  const [sel, setSel] = useState<Sel>({ kind: "all" });
  const [items, setItems] = useState<M[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<"" | "photo" | "video" | "audio">("");
  const [q, setQ] = useState("");
  const [fq, setFq] = useState("");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState(false);
  const [view, setView] = useState<M | null>(null);
  const loadFolders = useCallback(() => {
    if (!creatorId) return;
    api<{ lists: Folder[]; custom: Custom[] }>("GET", `/api/vaultpro/cats?creatorId=${encodeURIComponent(creatorId)}`)
      .then((r) => (setFolders(r.lists), setCustom(r.custom)))
      .catch((e) => toast((e as Error).message, "err"));
  }, [creatorId]);
  const loadMedias = useCallback(
    async (more = false) => {
      if (!creatorId) return;
      setBusy(true);
      const p = new URLSearchParams({ creatorId });
      if (sel.kind === "list") p.set("listId", sel.id);
      if (sel.kind === "cat") p.set("cat", String(sel.id));
      if (type && sel.kind !== "cat") p.set("type", type.toUpperCase());
      if (more && cursor) p.set("cursor", cursor);
      try {
        const r = await api<{ items: M[]; nextCursor: string | null }>("GET", `/api/vaultpro/medias?${p}`);
        setItems((cur) => (more ? [...(cur ?? []), ...r.items] : r.items));
        setCursor(r.nextCursor);
      } catch (e) {
        toast((e as Error).message, "err");
      } finally {
        setBusy(false);
      }
    },
    [creatorId, sel, cursor, type],
  );
  useEffect(() => {
    setSel({ kind: "all" });
    loadFolders();
  }, [loadFolders]);
  useEffect(() => {
    setItems(null);
    setCursor(null);
    setPicked(new Set());
    loadMedias(false);
  }, [creatorId, sel, type]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = folders.reduce((a, f) => a + f.total, 0);
  const shown = useMemo(() => (items ?? []).filter((m) => (!type || sel.kind !== "cat" || m.type === type) && (!q || `${m.caption} ${m.id} ${m.lists.join(" ")}`.toLowerCase().includes(q.toLowerCase()))), [items, type, q, sel]);
  const title = sel.kind === "all" ? "Bibliothèque" : sel.kind === "list" ? folders.find((f) => f.id === sel.id)?.name : custom.find((c) => c.id === sel.id)?.name;
  const newCollection = async () => {
    const name = prompt("Nom de la nouvelle collection (gardée par Bloom)");
    if (!name?.trim()) return;
    try {
      const r = await api<{ custom: Custom[] }>("POST", "/api/vaultpro/cats", { creatorId, name });
      setCustom(r.custom);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const Folder = ({ on, name, counts, onClick }: { on: boolean; name: string; counts: [number, number, number] | number; onClick: () => void }) => (
    <button onClick={onClick} className="w-full rounded-md px-3 py-2 text-left" style={on ? { background: "rgba(64,81,137,.35)", boxShadow: "inset 3px 0 0 #405189" } : undefined}>
      <p className="truncate text-[12.5px] font-semibold uppercase" style={{ color: "var(--mp-head)" }}>{name}</p>
      <p className="mt-0.5 flex gap-2.5 text-[11px]" style={{ color: "var(--mp-muted)" }}>
        {typeof counts === "number" ? (
          <span className="flex items-center gap-1"><ImageIcon className="size-3" /><Video className="size-3" />{counts} média(s)</span>
        ) : (
          <>
            <span className="flex items-center gap-1"><ImageIcon className="size-3" />{counts[0]}</span><span className="flex items-center gap-1"><Video className="size-3" />{counts[1]}</span>{counts[2] ? <span className="flex items-center gap-1"><Mic className="size-3" />{counts[2]}</span> : null}
          </>
        )}
      </p>
    </button>
  );

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
          <span className="flex-1" />
          <button onClick={() => (loadFolders(), loadMedias(false))} className="h-8 rounded-md px-3 text-[12px] font-medium text-white" style={{ background: "#f7b84b" }}>Actualiser</button>
          <Link href="/app/mym/importer" className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px]" style={{ borderColor: "#405189", color: "#6f86d6" }}><Upload className="size-3.5" /> Importer des médias</Link>
        </div>
        <div className="flex min-h-[70vh] flex-col md:flex-row">
          <aside className="w-full shrink-0 border-r p-3 md:w-[240px]" style={{ borderColor: "var(--mp-line)" }}>
            <label className="flex h-8 items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}><Search className="size-3.5" /><input value={fq} onChange={(e) => setFq(e.target.value)} placeholder="Rechercher une collection" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
            <button onClick={newCollection} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px]" style={{ background: "var(--mp-card-2)", color: "#6f86d6" }}><Plus className="size-3.5" /> Nouvelle collection</button>
            <div className="mt-3">
              <button onClick={() => setSel({ kind: "all" })} className="w-full rounded-md px-3 py-2 text-left" style={sel.kind === "all" ? { background: "rgba(64,81,137,.35)", boxShadow: "inset 3px 0 0 #405189" } : undefined}>
                <p className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}><Cloud className="size-3.5" /> Tous les médias</p>
                <p className="text-[11px]" style={{ color: "var(--mp-muted)" }}>{total} média(s)</p>
              </button>
              <p className="mt-3 px-3 text-[10.5px] font-semibold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>Collections</p>
              {folders.filter((f) => !fq || f.name.toLowerCase().includes(fq.toLowerCase())).map((f) => (
                <Folder key={f.id} on={sel.kind === "list" && sel.id === f.id} name={f.name} counts={f.total} onClick={() => setSel({ kind: "list", id: f.id })} />
              ))}
              {custom.length ? <p className="mt-3 px-3 text-[10.5px] font-semibold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>Collections Bloom</p> : null}
              {custom.filter((c) => !fq || c.name.toLowerCase().includes(fq.toLowerCase())).map((c) => (
                <Folder key={c.id} on={sel.kind === "cat" && sel.id === c.id} name={c.name} counts={[c.photos, c.videos, c.audios]} onClick={() => setSel({ kind: "cat", id: c.id })} />
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
                <label className="flex h-8 w-[260px] items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}><Search className="size-3.5" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (description, collection, id)" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
                <div className="mt-2 flex overflow-hidden rounded-md border text-[12px]" style={{ borderColor: "#405189" }}>
                  {([["", "Tous"], ["photo", "Photos"], ["video", "Vidéos"], ["audio", "Audios"]] as const).map(([k, l]) => (
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
                  <button key={m.id} onClick={() => (picking ? setPicked((s) => (s.has(m.id) ? (s.delete(m.id), new Set(s)) : new Set(s.add(m.id)))) : setView(m))} className="text-left">
                    <span className="relative block aspect-[4/3.4] overflow-hidden rounded-md" style={{ background: "var(--mp-card-2)", outline: on ? "2px solid #0ab39c" : undefined }}>
                      {m.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : <span className="grid size-full place-items-center">{m.type === "audio" ? <Mic className="size-6" /> : <ImageIcon className="size-6" />}</span>}
                      {m.type === "video" ? <Play className="absolute inset-0 m-auto size-7 rounded-full bg-black/45 p-1.5 text-white" /> : null}
                      {m.lists[0] ? <span className="absolute top-1 left-1 max-w-[90%] truncate rounded px-1.5 text-[9.5px] font-semibold text-white" style={{ background: "rgba(0,0,0,.6)" }}>{m.lists[0]}</span> : null}
                      {on ? <Check className="absolute top-1 right-1 size-5 rounded-full p-0.5 text-white" style={{ background: "#0ab39c" }} /> : null}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1 text-[10.5px]">
                      <span className="rounded px-1.5" style={{ background: m.type === "video" ? "rgba(247,184,75,.18)" : "rgba(64,81,137,.3)", color: m.type === "video" ? "#f7b84b" : "#6f86d6" }}>{m.type}</span>
                      {m.duration ? <span className="rounded bg-black px-1.5 font-semibold text-white">{dur(m.duration)}</span> : null}
                    </span>
                    <span className="mt-1 block rounded border px-1.5 text-[10.5px]" style={{ borderColor: "#e83e8c55", color: "#e83e8c" }}>{m.id}</span>
                    {m.createdAt ? <span className="mt-1 flex items-center gap-1 text-[10.5px]" style={{ color: "var(--mp-muted)" }}><Calendar className="size-3" />{new Date(m.createdAt).toLocaleDateString("fr-FR")}</span> : null}
                  </button>
                );
              })}
            </div>
            {items && !shown.length ? <p className="py-16 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>Aucun média</p> : null}
            {cursor ? <div className="mt-5 text-center"><button disabled={busy} onClick={() => loadMedias(true)} className="h-9 rounded-md px-5 text-[13px] text-white disabled:opacity-50" style={{ background: "#405189" }}>{busy ? "Chargement…" : "Charger plus"}</button></div> : null}
            {!items ? <p className="py-16 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>…</p> : null}
          </section>
        </div>
      </div>
      {moveTo && creatorId ? <MoveModal creatorId={creatorId} folders={folders} custom={custom} ids={[...picked]} medias={(items ?? []).filter((m) => picked.has(m.id))} onClose={() => setMoveTo(false)} onDone={() => (setMoveTo(false), setPicking(false), setPicked(new Set()), loadFolders(), loadMedias(false))} /> : null}
      {view ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onMouseDown={() => setView(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]" onMouseDown={(e) => e.stopPropagation()}>
            <button onClick={() => setView(null)} className="absolute -top-9 right-0 text-white"><X className="size-6" /></button>
            {view.type === "video" && view.full ? <video src={view.full} controls autoPlay className="max-h-[85vh] max-w-[90vw] rounded-md" /> : view.type === "audio" && view.full ? <audio src={view.full} controls autoPlay /> : <img src={view.full || view.thumb || ""} alt="" className="max-h-[85vh] max-w-[90vw] rounded-md" />}
            <p className="mt-2 text-[12px] text-white/80">{view.id}{view.lists.length ? ` · ${view.lists.join(", ")}` : ""}{view.caption ? ` · ${view.caption}` : ""}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MoveModal({ creatorId, folders, custom, ids, medias, onClose, onDone }: { creatorId: string; folders: Folder[]; custom: Custom[]; ids: string[]; medias: M[]; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState(folders[0] ? `l:${folders[0].id}` : custom[0] ? `c:${custom[0].id}` : "");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      if (to.startsWith("l:")) {
        const r = await api<{ ok: number; failed: number }>("POST", "/api/vaultpro/list-media", { creatorId, listId: to.slice(2), mediaIds: ids });
        toast(`${r.ok} média(s) rangé(s)${r.failed ? ` · ${r.failed} échec(s)` : ""}`);
      } else {
        await api("POST", "/api/vaultpro/meta", { creatorId, medias, patch: { catId: Number(to.slice(2)) } });
        toast(`${ids.length} média(s) rangé(s)`);
      }
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
          <p className="font-semibold" style={{ color: "var(--mp-head)" }}>Collection</p>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1.5 h-10 w-full rounded-md px-3 outline-none" style={{ background: "#2f343a", color: "var(--mp-head)" }}>
            {folders.length ? <optgroup label="Collections du vault (Substy)">{folders.map((f) => <option key={f.id} value={`l:${f.id}`}>{f.name}</option>)}</optgroup> : null}
            {custom.length ? <optgroup label="Collections Bloom">{custom.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}</optgroup> : null}
          </select>
        </div>
        <div className="flex justify-end gap-2 px-4 pb-4">
          <button onClick={onClose} className="h-9 rounded-md px-4" style={{ background: "#2f343a" }}>Fermer</button>
          <button disabled={busy || !to} onClick={go} className="h-9 rounded-md px-4 text-white disabled:opacity-50" style={{ background: "#0ab39c" }}>Ranger</button>
        </div>
      </div>
    </div>
  );
}
