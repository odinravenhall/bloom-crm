"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AudioLines, Check, ChevronDown, Image as ImageIcon, ListFilter, RefreshCw, Search, Video } from "lucide-react";
import { api, toast } from "@/lib/api";
import type { Media } from "@/rv/inbox/types";

// Vault Pro dans une conversation (Messages Pro, comme Infloww) : listes du vault OnlyFans + catégories Bloom à gauche,
// recherche, filtres, grille ; on coche des médias puis « Add to message ».
type ListT = { id: string; name: string; photos: number; videos: number; audios: number };
type Cat = { id: number; name: string; photos: number; videos: number; audios: number };
type M = { id: string; type: string; thumb: string | null; full: string | null; duration: number | null; createdAt: string | null; caption?: string; notes: string; hashtags: string[] };
type Sel = { kind: "all" } | { kind: "list"; id: string } | { kind: "cat"; id: number };
const BLUE = "#2f6bff";
const toMedia = (m: M): Media => ({ id: m.id, type: (m.type === "video" || m.type === "audio" ? m.type : "photo") as Media["type"], smallUrl: m.thumb ?? undefined, thumbnailUrl: m.thumb ?? undefined, url: m.full ?? m.thumb ?? undefined, durationSeconds: m.duration });

export function VaultProPicker({ creatorId, selected, onPick, onClose, t }: { creatorId: string; selected: Media[]; onPick: (m: Media[]) => void; onClose: () => void; t: (s: string) => string }) {
  const [lists, setLists] = useState<ListT[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [sel, setSel] = useState<Sel>({ kind: "all" });
  const [items, setItems] = useState<M[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState<"caption" | "note" | "hashtag">("caption");
  const [fieldOpen, setFieldOpen] = useState(false);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | "photo" | "video" | "audio">("");
  const [desc, setDesc] = useState(true);
  const [picked, setPicked] = useState<Map<string, Media>>(() => new Map(selected.map((m) => [m.id, m])));

  useEffect(() => {
    api<{ lists: ListT[]; custom: Cat[] }>("GET", `/api/vaultpro/cats?creatorId=${encodeURIComponent(creatorId)}`)
      .then((r) => (setLists(r.lists), setCats(r.custom)))
      .catch((e) => toast((e as Error).message, "err"));
  }, [creatorId]);
  const load = useCallback(
    (more: boolean, c: string | null) => {
      setBusy(true);
      const p = new URLSearchParams({ creatorId, ...(sel.kind === "list" ? { listId: sel.id } : sel.kind === "cat" ? { cat: String(sel.id) } : {}), ...(more && c ? { cursor: c } : {}) });
      api<{ items: M[]; nextCursor: string | null }>("GET", `/api/vaultpro/medias?${p}`)
        .then((r) => (setItems((x) => (more ? [...(x ?? []), ...r.items] : r.items)), setCursor(r.nextCursor)))
        .catch((e) => toast((e as Error).message, "err"))
        .finally(() => setBusy(false));
    },
    [creatorId, sel],
  );
  useEffect(() => {
    setItems(null);
    setCursor(null);
    load(false, null);
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? [])
      .filter((m) => !type || m.type === type)
      .filter((m) => !s || (field === "caption" ? (m.caption || "").toLowerCase().includes(s) : field === "note" ? (m.notes || "").toLowerCase().includes(s) : (m.hashtags || []).some((h) => h.toLowerCase().includes(s.replace(/^#/, "")))))
      .sort((a, b) => ((Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0)) * (desc ? -1 : 1));
  }, [items, q, type, field, desc]);
  const toggle = (m: M) => setPicked((x) => (x.has(m.id) ? (x.delete(m.id), new Map(x)) : new Map(x.set(m.id, toMedia(m)))));
  const counts = (c: { photos: number; videos: number; audios: number }) => (
    <p className="mt-1 flex gap-1 text-[12px]" style={{ color: "var(--of-muted)" }}>
      {c.photos ? <span className="flex items-center gap-0.5"><ImageIcon className="size-3" />{c.photos}</span> : null}
      {c.videos ? <span className="flex items-center gap-0.5">· <Video className="size-3" />{c.videos}</span> : null}
      {c.audios ? <span className="flex items-center gap-0.5">· <AudioLines className="size-3" />{c.audios}</span> : null}
    </p>
  );
  const row = (on: boolean, title: string, c: { photos: number; videos: number; audios: number } | null, fn: () => void, key: string) => (
    <button key={key} onClick={fn} className="block w-full border-b px-4 py-3 text-left" style={{ borderColor: "var(--pro-line)", background: on ? "var(--pro-on)" : undefined }}>
      <p className="truncate text-[14px] font-semibold">{title}</p>
      {c ? counts(c) : null}
    </button>
  );
  const dateTxt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="flex h-[88vh] w-full max-w-[1150px] flex-col overflow-hidden rounded-xl" style={{ background: "var(--pro-pop)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex min-h-0 flex-1">
          <div className="of-scroll w-[210px] shrink-0 overflow-y-auto border-r" style={{ borderColor: "var(--pro-line)" }}>
            <h3 className="border-b px-4 py-4 text-[16px] font-semibold" style={{ borderColor: "var(--pro-line)" }}>{t("Vault Pro")}</h3>
            <p className="flex items-center gap-2 px-4 py-3 text-[13px] font-semibold">{t("Custom")} <ListFilter className="size-4" /></p>
            {row(sel.kind === "all", t("All media"), null, () => setSel({ kind: "all" }), "all")}
            {lists.map((l) => row(sel.kind === "list" && sel.id === l.id, l.name, l, () => setSel({ kind: "list", id: l.id }), `l${l.id}`))}
            {cats.map((c) => row(sel.kind === "cat" && sel.id === c.id, c.name, c, () => setSel({ kind: "cat", id: c.id }), `c${c.id}`))}
          </div>
          <div
            className="of-scroll min-w-0 flex-1 overflow-y-auto p-4"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (cursor && !busy && el.scrollHeight - el.scrollTop - el.clientHeight < 500) load(true, cursor);
            }}
          >
            <div className="flex gap-3">
              <div className="flex h-11 min-w-0 flex-1 items-center rounded-md border" style={{ borderColor: "var(--pro-line)" }}>
                <div className="relative">
                  <button onClick={() => setFieldOpen(!fieldOpen)} className="flex h-11 items-center gap-2 border-r px-4 text-[15px]" style={{ borderColor: "var(--pro-line)", color: BLUE }}>
                    {t(field === "caption" ? "Caption" : field === "note" ? "Note" : "Hashtag")} <ChevronDown className="size-4" />
                  </button>
                  {fieldOpen ? (
                    <div className="absolute top-full left-0 z-30 mt-1 w-36 rounded-md border py-1 shadow-xl" style={{ background: "var(--pro-pop)", borderColor: "var(--pro-line)" }}>
                      {(["caption", "note", "hashtag"] as const).map((f) => (
                        <button key={f} onClick={() => (setField(f), setFieldOpen(false))} className="block w-full px-3 py-1.5 text-left text-[14px]" style={f === field ? { color: BLUE } : undefined}>{t(f === "caption" ? "Caption" : f === "note" ? "Note" : "Hashtag")}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search media by PPV caption")} className="min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none" />
                <Search className="mr-3 size-5" style={{ color: BLUE }} />
              </div>
              <button onClick={() => setDesc(!desc)} className="flex h-11 items-center gap-2 rounded-md border px-4 text-[14px]" style={{ borderColor: "var(--pro-line)" }}>
                {t("Recent")} <ListFilter className="size-4" style={{ transform: desc ? undefined : "scaleY(-1)" }} />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[14px]">
              {t("Media")}:
              {(
                [
                  ["", "All"],
                  ["photo", "Photo"],
                  ["video", "Video"],
                  ["gif", "GIF"],
                  ["audio", "Audio"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} disabled={k === "gif"} onClick={() => k !== "gif" && setType(k)} className="rounded-full border px-4 py-1 disabled:opacity-40" style={type === k ? { borderColor: BLUE, color: BLUE } : { borderColor: "var(--pro-line)" }}>{t(l)}</button>
              ))}
              <button onClick={() => load(false, null)} className="ml-auto" title={t("Refresh")}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /></button>
            </div>
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
              {shown.map((m) => {
                const on = picked.has(m.id);
                return (
                  <button key={m.id} onClick={() => toggle(m)} className="pro-media relative aspect-square overflow-hidden rounded-lg text-left" style={{ background: "#333", outline: on ? `3px solid ${BLUE}` : undefined, outlineOffset: -3 }}>
                    {m.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : <span className="grid size-full place-items-center"><ImageIcon className="size-10 opacity-40" /></span>}
                    <span className="absolute top-2 left-2 grid size-5 place-items-center rounded border-2 bg-black/40" style={{ borderColor: on ? BLUE : "#fff", background: on ? BLUE : undefined }}>
                      {on ? <Check className="size-3.5 text-white" /> : null}
                    </span>
                    {m.createdAt ? <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 text-[12px] text-white">{dateTxt(m.createdAt)}</span> : null}
                    <span className="absolute right-2 bottom-2 grid size-6 place-items-center rounded bg-black/60 text-white">
                      {m.type === "video" ? <Video className="size-3.5" /> : m.type === "audio" ? <AudioLines className="size-3.5" /> : <ImageIcon className="size-3.5" />}
                    </span>
                    {m.duration ? <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 text-[11px] text-white">{String(Math.floor(m.duration / 60)).padStart(2, "0")}:{String(Math.round(m.duration % 60)).padStart(2, "0")}</span> : null}
                  </button>
                );
              })}
            </div>
            {items === null ? <p className="py-10 text-center" style={{ color: "var(--of-muted)" }}>{t("Loading…")}</p> : null}
            {items && !shown.length ? <p className="py-10 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</p> : null}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t px-5 py-3" style={{ borderColor: "var(--pro-line)" }}>
          <span className="mr-auto text-[13px]" style={{ color: "var(--of-muted)" }}>{picked.size} {t("selected")}</span>
          <button onClick={onClose} className="h-9 rounded-md border px-4 text-[14px]" style={{ borderColor: "var(--pro-line)" }}>{t("Close")}</button>
          <button disabled={!picked.size} onClick={() => onPick([...picked.values()])} className="h-9 rounded-md px-4 text-[14px] text-white disabled:opacity-40" style={{ background: BLUE }}>{t("Add to message")}</button>
        </div>
      </div>
    </div>
  );
}
