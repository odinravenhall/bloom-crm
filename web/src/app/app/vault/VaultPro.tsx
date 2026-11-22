"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines, BookOpen, Check, ChevronDown, FolderInput, Image as ImageIcon, LayoutGrid, List, ListFilter, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Tag, Trash2, Video, X,
} from "lucide-react";
import { api, toast } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";

// Growth → Vault Pro (OnlyFans) : copie de la page d'Infloww. Listes et médias du vault OnlyFans (via Substy), plus les
// catégories, hashtags, notes et prix suggérés gardés par Bloom. Envoyer un média depuis l'ordinateur : pas via Substy.
type ListT = { id: string; name: string; photos: number; videos: number; audios: number };
type Cat = { id: number; name: string; count: number; photos: number; videos: number; audios: number };
type M = {
  id: string; type: string; thumb: string | null; full: string | null; duration: number | null; createdAt: string | null; caption?: string;
  catId: number | null; hashtags: string[]; notes: string; price: number | null; updatedBy: string | null; updatedAt: number | null;
};
type Sel = { kind: "all" } | { kind: "list"; id: string } | { kind: "cat"; id: number };
const BLUE = "#2f6bff";
const dateTxt = (s: string | null | number) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const dur = (s: number | null) => (s ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const TypeIcon = ({ type, className }: { type: string; className?: string }) => (type === "video" ? <Video className={className} /> : type === "audio" ? <AudioLines className={className} /> : <ImageIcon className={className} />);

export function VaultPro({ canEdit }: { canEdit: boolean }) {
  const { t } = useT();
  const { creators, creatorId, setCreator } = useCreators();
  const cid = creatorId ?? creators[0]?.id ?? null;
  const [lists, setLists] = useState<ListT[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [sel, setSel] = useState<Sel>({ kind: "all" });
  const [items, setItems] = useState<M[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [field, setField] = useState<"caption" | "note" | "hashtag">("caption");
  const [q, setQ] = useState("");
  const [lq, setLq] = useState("");
  const [type, setType] = useState<"" | "photo" | "video" | "audio">("");
  const [desc, setDesc] = useState(true);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<M | null>(null);
  const [modal, setModal] = useState<null | "newcat" | "batch" | "addcat" | "add" | "sort" | "field">(null);
  const [target, setTarget] = useState<M[]>([]);

  const loadCats = useCallback(() => {
    if (!cid) return;
    api<{ lists: ListT[]; custom: Cat[] }>("GET", `/api/vaultpro/cats?creatorId=${encodeURIComponent(cid)}`)
      .then((r) => (setLists(r.lists), setCats(r.custom)))
      .catch((e) => toast((e as Error).message, "err"));
  }, [cid]);
  const load = useCallback(
    (more = false) => {
      if (!cid) return;
      setBusy(true);
      const p = new URLSearchParams({ creatorId: cid, ...(sel.kind === "list" ? { listId: sel.id } : sel.kind === "cat" ? { cat: String(sel.id) } : {}), ...(more && cursor ? { cursor } : {}) });
      api<{ items: M[]; nextCursor: string | null }>("GET", `/api/vaultpro/medias?${p}`)
        .then((r) => (setItems((x) => (more ? [...(x ?? []), ...r.items] : r.items)), setCursor(r.nextCursor)))
        .catch((e) => toast((e as Error).message, "err"))
        .finally(() => setBusy(false));
    },
    [cid, sel, cursor],
  );
  useEffect(() => {
    setSel({ kind: "all" });
    loadCats();
  }, [loadCats]);
  useEffect(() => {
    setItems(null);
    setCursor(null);
    setPicked(new Set());
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, sel]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? [])
      .filter((m) => !type || m.type === type)
      .filter((m) => !s || (field === "caption" ? (m.caption || "").toLowerCase().includes(s) : field === "note" ? m.notes.toLowerCase().includes(s) : m.hashtags.some((h) => h.toLowerCase().includes(s.replace(/^#/, "")))))
      .sort((a, b) => ((Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0)) * (desc ? -1 : 1));
  }, [items, q, type, field, desc]);
  const catName = (id: number | null) => cats.find((c) => c.id === id)?.name ?? "";
  const save = async (medias: M[], patch: Record<string, unknown>) => {
    if (!cid) return false;
    try {
      const r = await api<{ custom: Cat[] }>("POST", "/api/vaultpro/meta", { creatorId: cid, medias, patch });
      setCats(r.custom);
      setItems((x) => (x ?? []).map((m) => (medias.some((y) => y.id === m.id) ? { ...m, ...patch } as M : m)));
      toast(t("Saved"));
      return true;
    } catch (e) {
      toast((e as Error).message, "err");
      return false;
    }
  };
  const box = useRef<HTMLDivElement>(null);
  const toggle = (id: string) => setPicked((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  const pickedM = (items ?? []).filter((m) => picked.has(m.id));

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="flex shrink-0 items-center gap-4 border-b px-4 py-3" style={{ borderColor: "var(--of-line)" }}>
        <h1 className="text-[17px] font-semibold">{t("Vault Pro")}</h1>
        <select value={cid ?? ""} onChange={(e) => setCreator(e.target.value)} className="h-9 w-[170px] rounded-md border bg-transparent px-2 text-[14px] outline-none" style={{ borderColor: "var(--of-line)" }}>
          {creators.map((c) => (
            <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>
          ))}
        </select>
        <span className="ml-auto flex items-center gap-1.5 text-[14px]" style={{ color: BLUE }}><BookOpen className="size-4" /> {t("Learn")}</span>
        <button onClick={() => setModal("add")} className="flex h-9 items-center gap-1.5 rounded-md px-4 text-[14px] text-white" style={{ background: BLUE }}><Plus className="size-4" /> {t("Add media")}</button>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* Catégories */}
        <div className="of-scroll w-[210px] shrink-0 overflow-y-auto border-r" style={{ borderColor: "var(--of-line)", background: "var(--of-pick-list)" }}>
          <div className="flex items-center gap-2 px-3 py-3 text-[13px] font-semibold">
            {t("Custom")} <ListFilter className="size-4" />
            <label className="ml-auto flex items-center"><Search className="size-4" /></label>
            {canEdit ? <button onClick={() => setModal("newcat")} title={t("New category")}><Plus className="size-4" /></button> : null}
          </div>
          <input value={lq} onChange={(e) => setLq(e.target.value)} placeholder={t("Search")} className="mx-3 mb-2 h-8 w-[calc(100%-24px)] rounded border bg-transparent px-2 text-[13px] outline-none" style={{ borderColor: "var(--of-line)" }} />
          <CatRow on={sel.kind === "all"} title={t("All media")} onClick={() => setSel({ kind: "all" })} />
          {lists.filter((l) => !lq || l.name.toLowerCase().includes(lq.toLowerCase())).map((l) => (
            <CatRow key={l.id} on={sel.kind === "list" && sel.id === l.id} title={l.name} counts={l} onClick={() => setSel({ kind: "list", id: l.id })} />
          ))}
          {cats.length ? <p className="px-3 pt-3 pb-1 text-[11px] uppercase" style={{ color: "var(--of-muted)" }}>{t("Bloom categories")}</p> : null}
          {cats.filter((c) => !lq || c.name.toLowerCase().includes(lq.toLowerCase())).map((c) => (
            <CatRow
              key={c.id}
              on={sel.kind === "cat" && sel.id === c.id}
              title={c.name}
              counts={c}
              onClick={() => setSel({ kind: "cat", id: c.id })}
              menu={canEdit ? async (a) => {
                if (!cid) return;
                if (a === "rename") {
                  const n = window.prompt(t("Category"), c.name);
                  if (!n) return;
                  setCats((await api<{ custom: Cat[] }>("POST", "/api/vaultpro/cats", { creatorId: cid, id: c.id, name: n })).custom);
                } else if (window.confirm(`${t("Delete the category")} « ${c.name} » ?`)) {
                  setCats((await api<{ custom: Cat[] }>("POST", "/api/vaultpro/cats", { creatorId: cid, id: c.id, delete: true })).custom);
                  if (sel.kind === "cat" && sel.id === c.id) setSel({ kind: "all" });
                }
              } : undefined}
            />
          ))}
        </div>

        {/* Médias */}
        <div ref={box} className="of-scroll min-w-0 flex-1 overflow-y-auto p-4" onScroll={(e) => {
          const el = e.currentTarget;
          if (cursor && !busy && el.scrollHeight - el.scrollTop - el.clientHeight < 600) load(true);
        }}>
          <div className="flex gap-3">
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-md border" style={{ borderColor: BLUE }}>
              <div className="relative">
                <button onClick={() => setModal(modal === "field" ? null : "field")} className="flex h-11 items-center gap-2 border-r px-4 text-[15px]" style={{ borderColor: "var(--of-line)", color: BLUE }}>
                  {t(field === "caption" ? "Caption" : field === "note" ? "Note" : "Hashtag")} <ChevronDown className="size-4" />
                </button>
                {modal === "field" ? (
                  <Pop onClose={() => setModal(null)}>
                    {(["caption", "note", "hashtag"] as const).map((f) => (
                      <button key={f} onClick={() => (setField(f), setModal(null))} className="block w-full px-3 py-1.5 text-left text-[14px]" style={f === field ? { color: BLUE } : undefined}>{t(f === "caption" ? "Caption" : f === "note" ? "Note" : "Hashtag")}</button>
                    ))}
                  </Pop>
                ) : null}
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(field === "caption" ? "Search media by PPV caption" : field === "note" ? "Search media by note" : "Search media by hashtag")} className="min-w-0 flex-1 bg-transparent px-3 text-[15px] outline-none" />
              <Search className="mr-3 size-5" style={{ color: BLUE }} />
            </div>
            <div className="relative">
              <button onClick={() => setModal(modal === "sort" ? null : "sort")} className="flex h-11 items-center gap-2 rounded-md border px-4 text-[14px]" style={{ borderColor: "var(--of-line)" }}>{t("Recent")} <ListFilter className="size-4" /></button>
              {modal === "sort" ? (
                <Pop onClose={() => setModal(null)} right>
                  <Radio on label={t("All time")} />
                  <div className="my-1 border-t" style={{ borderColor: "var(--of-line)" }} />
                  <Radio on label={t("Recent")} />
                  <Radio label={t("Most liked")} disabled />
                  <Radio label={t("Highest tips")} disabled />
                  <div className="my-1 border-t" style={{ borderColor: "var(--of-line)" }} />
                  <Radio on={!desc} label={t("Ascending")} onClick={() => setDesc(false)} />
                  <Radio on={desc} label={t("Descending")} onClick={() => setDesc(true)} />
                </Pop>
              ) : null}
            </div>
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
              <button key={k} disabled={k === "gif"} onClick={() => k !== "gif" && setType(k)} className="rounded-full border px-4 py-1 disabled:opacity-40" style={type === k ? { borderColor: BLUE, color: BLUE } : { borderColor: "var(--of-line)" }}>{t(l)}</button>
            ))}
            <span className="ml-auto flex items-center gap-3">
              <button onClick={() => (loadCats(), load(false))} title={t("Refresh")}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /></button>
              <span className="flex overflow-hidden rounded border" style={{ borderColor: "var(--of-line)" }}>
                <button onClick={() => setView("grid")} title={t("Grid view")} className="px-2 py-1" style={view === "grid" ? { background: "var(--of-line)" } : undefined}><LayoutGrid className="size-4" /></button>
                <button onClick={() => setView("table")} title={t("Table view")} className="px-2 py-1" style={view === "table" ? { background: "var(--of-line)" } : undefined}><List className="size-4" /></button>
              </span>
            </span>
          </div>

          {view === "grid" ? (
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {shown.map((m) => (
                <div key={m.id} className="pro-media group relative aspect-[1/1.05] cursor-pointer overflow-hidden rounded-lg" style={{ background: "#222" }} onClick={() => setDetail(m)}>
                  {m.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : <div className="grid size-full place-items-center"><TypeIcon type={m.type} className="size-10 opacity-50" /></div>}
                  {m.createdAt ? <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 text-[12px] text-white">{dateTxt(m.createdAt)}</span> : null}
                  {canEdit ? (
                    <button onClick={(e) => (e.stopPropagation(), toggle(m.id))} className="absolute top-2 right-2 grid size-5 place-items-center rounded border bg-black/40" style={{ borderColor: "#fff" }}>
                      {picked.has(m.id) ? <Check className="size-3.5 text-white" /> : null}
                    </button>
                  ) : null}
                  <span className="absolute right-2 bottom-8 grid size-6 place-items-center rounded bg-black/60 text-white"><TypeIcon type={m.type} className="size-3.5" /></span>
                  {m.duration ? <span className="absolute bottom-8 left-2 rounded bg-black/60 px-1.5 text-[11px] text-white">{dur(m.duration)}</span> : null}
                  <span className="absolute inset-x-0 bottom-0 flex h-7 items-center gap-1.5 bg-gradient-to-t from-black/70 px-2 text-[11px] text-white">
                    <Tag className="size-3.5" /> {[catName(m.catId), ...m.hashtags.map((h) => `#${h}`)].filter(Boolean).join(" · ")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="of-scroll mt-4 overflow-x-auto rounded-md">
              <table className="w-full min-w-[1100px] text-[14px]">
                <thead>
                  <tr className="text-left" style={{ background: "var(--of-line)" }}>
                    {["Media", "Category", "Tagged Creators", "Hashtags", "Notes", "Suggested price", "Uploaded by", "Upload time", "Actions"].map((h) => (
                      <th key={h} className="px-3 py-3.5 font-medium">{t(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((m) => (
                    <tr key={m.id} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-3">
                          {canEdit ? (
                            <button onClick={() => toggle(m.id)} className="grid size-5 place-items-center rounded-full border" style={{ borderColor: picked.has(m.id) ? BLUE : "var(--of-muted)", background: picked.has(m.id) ? BLUE : "transparent" }}>
                              {picked.has(m.id) ? <Check className="size-3 text-white" /> : null}
                            </button>
                          ) : null}
                          <span className="pro-media relative h-[90px] w-[90px] overflow-hidden rounded-md" style={{ background: "#222" }}>
                            {m.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : null}
                            {m.createdAt ? <span className="absolute top-1 left-1 rounded-full bg-black/60 px-1.5 text-[10px] text-white">{dateTxt(m.createdAt)}</span> : null}
                          </span>
                        </span>
                      </td>
                      <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{catName(m.catId) || "--"}</td>
                      <td className="border-l px-3 text-[12px]" style={{ borderColor: "var(--of-line)", color: "var(--of-muted)" }}>--<br />{t("Not synced yet")}</td>
                      <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{m.hashtags.length ? m.hashtags.map((h) => `#${h}`).join(" ") : "--"}</td>
                      <td className="max-w-[200px] truncate border-l px-3" style={{ borderColor: "var(--of-line)" }}>{m.notes || "--"}</td>
                      <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{m.price ? `$${m.price}` : "--"}</td>
                      <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{m.updatedBy || "--"}</td>
                      <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{dateTxt(m.createdAt) || "--"}</td>
                      <td className="px-3">
                        <span className="flex gap-4" style={{ color: BLUE }}>
                          <button onClick={() => setDetail(m)} title={t("Edit")}><Pencil className="size-4.5" /></button>
                          {canEdit ? <button onClick={() => (setTarget([m]), setModal("addcat"))} title={t("Add to category")}><FolderInput className="size-4.5" /></button> : null}
                          {canEdit && m.catId ? <button onClick={() => save([m], { catId: null })} title={t("Remove from category")}><Trash2 className="size-4.5" style={{ color: "#f26b6b" }} /></button> : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {items === null ? <p className="py-10 text-center" style={{ color: "var(--of-muted)" }}>{t("Loading…")}</p> : null}
          {items && !shown.length ? <p className="py-10 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</p> : null}
          {cursor ? <button onClick={() => load(true)} className="mx-auto mt-4 block text-[13px]" style={{ color: BLUE }}>{busy ? t("Loading…") : t("Load more")}</button> : null}
        </div>
      </div>

      {/* Barre de sélection */}
      {picked.size ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex w-[min(900px,90vw)] -translate-x-1/2 items-center gap-4 rounded-lg bg-white px-5 py-2.5 text-[13px] text-black shadow-2xl">
          {t("Selected")} {picked.size}
          <button onClick={() => setPicked(new Set())}><X className="size-4" style={{ color: BLUE }} /></button>
          <span className="ml-auto flex items-center gap-4">
            <button onClick={() => setModal("batch")} title={t("Batch edit media")}><Pencil className="size-5" /></button>
            <button onClick={() => (setTarget(pickedM), setModal("addcat"))} title={t("Add to category")}><FolderInput className="size-5" /></button>
          </span>
        </div>
      ) : null}

      {detail ? <Details m={detail} cats={cats} canEdit={canEdit} onClose={() => setDetail(null)} onSave={async (patch) => (await save([detail], patch)) && setDetail(null)} t={t} /> : null}
      {modal === "newcat" ? <NewCat onClose={() => setModal(null)} onSave={async (name) => {
        if (!cid) return;
        try {
          setCats((await api<{ custom: Cat[] }>("POST", "/api/vaultpro/cats", { creatorId: cid, name })).custom);
          setModal(null);
        } catch (e) {
          toast((e as Error).message, "err");
        }
      }} t={t} /> : null}
      {modal === "addcat" ? <AddCat cats={cats} onClose={() => setModal(null)} onPick={async (id) => (await save(target, { catId: id })) && (setModal(null), setPicked(new Set()))} t={t} /> : null}
      {modal === "batch" ? <Batch cats={cats} count={picked.size} onClose={() => setModal(null)} onSave={async (patch) => (await save(pickedM, patch)) && (setModal(null), setPicked(new Set()))} t={t} /> : null}
      {modal === "add" ? (
        <Modal title={t("Add media")} onClose={() => setModal(null)} footer={<Btn onClick={() => setModal(null)}>{t("Close")}</Btn>}>
          <p className="px-5 py-5 text-[14px]">{t("Uploading media from your computer is not possible through Substy yet. Add the media to the creator's OnlyFans vault: it shows up here right away, then add a category, hashtags, notes and a price.")}</p>
        </Modal>
      ) : null}
      <span className="hidden"><Avatar name="" /></span>
    </div>
  );
}

function CatRow({ on, title, counts, onClick, menu }: { on: boolean; title: string; counts?: { photos: number; videos: number; audios: number }; onClick: () => void; menu?: (a: "rename" | "delete") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={onClick} className="block w-full border-b px-3 py-3 text-left" style={{ borderColor: "var(--of-line)", background: on ? "var(--of-pick)" : undefined }}>
        <p className="truncate pr-6 text-[14px] font-semibold">{title}</p>
        {counts ? (
          <p className="mt-1 flex gap-1 text-[12px]" style={{ color: "var(--of-muted)" }}>
            {counts.photos ? <span className="flex items-center gap-0.5"><ImageIcon className="size-3" />{counts.photos}</span> : null}
            {counts.videos ? <span className="flex items-center gap-0.5">· <Video className="size-3" />{counts.videos}</span> : null}
            {counts.audios ? <span className="flex items-center gap-0.5">· <AudioLines className="size-3" />{counts.audios}</span> : null}
          </p>
        ) : null}
      </button>
      {menu ? (
        <>
          <button onClick={() => setOpen(!open)} className="absolute top-3 right-2"><MoreHorizontal className="size-4" /></button>
          {open ? (
            <Pop onClose={() => setOpen(false)} right>
              <button onClick={() => (setOpen(false), menu("rename"))} className="block w-full px-3 py-1.5 text-left text-[13px]">{"✏️"} Rename</button>
              <button onClick={() => (setOpen(false), menu("delete"))} className="block w-full px-3 py-1.5 text-left text-[13px]" style={{ color: "#f26b6b" }}>{"🗑"} Delete</button>
            </Pop>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Pop({ children, onClose, right }: { children: React.ReactNode; onClose: () => void; right?: boolean }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={onClose} />
      <div className={`absolute top-full z-40 mt-1 min-w-[170px] rounded-md border py-1 shadow-xl ${right ? "right-0" : "left-0"}`} style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>{children}</div>
    </>
  );
}
function Radio({ on, label, onClick, disabled }: { on?: boolean; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] disabled:opacity-40" style={on ? { color: BLUE } : undefined}>
      <span className="grid size-3.5 place-items-center rounded-full border" style={{ borderColor: on ? BLUE : "var(--of-muted)" }}>{on ? <span className="size-1.5 rounded-full" style={{ background: BLUE }} /> : null}</span>
      {label}
    </button>
  );
}
function Modal({ title, children, footer, onClose, wide }: { title: string; children: React.ReactNode; footer: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl ${wide ? "max-w-[1500px]" : "max-w-[520px]"}`} style={{ background: "var(--of-pop)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        {title ? <h3 className="border-b px-5 py-4 text-[16px] font-semibold" style={{ borderColor: "var(--of-line)" }}>{title}</h3> : null}
        <div className="of-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--of-line)" }}>{footer}</div>
      </div>
    </div>
  );
}
function Btn({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className="h-9 rounded-md border px-4 text-[14px] disabled:opacity-40" style={primary ? { background: BLUE, borderColor: BLUE, color: "#fff" } : { borderColor: "var(--of-line)" }}>{children}</button>;
}

function Fields({ cats, v, set, show, t }: { cats: Cat[]; v: { catId: number | null; hashtags: string; notes: string; price: string }; set: (o: Partial<{ catId: number | null; hashtags: string; notes: string; price: string }>) => void; show: { cat: boolean; tags: boolean; notes: boolean; price: boolean }; t: (s: string) => string }) {
  const inp = "mt-2 w-full rounded-md border bg-transparent px-3 py-2 text-[14px] outline-none";
  return (
    <>
      {show.cat ? (
        <label className="block text-[14px]">
          {t("Category")}
          <select value={v.catId ?? ""} onChange={(e) => set({ catId: e.target.value ? Number(e.target.value) : null })} className={inp} style={{ borderColor: "var(--of-line)" }}>
            <option value="" style={{ background: "#222" }}>--</option>
            {cats.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}
          </select>
        </label>
      ) : null}
      {show.tags ? (
        <label className="mt-4 block text-[14px]">
          {t("Hashtags")}
          <input value={v.hashtags} onChange={(e) => set({ hashtags: e.target.value })} placeholder={t("Select hashtags (separate with commas)")} className={inp} style={{ borderColor: "var(--of-line)" }} />
        </label>
      ) : null}
      {show.notes ? (
        <label className="mt-4 block text-[14px]">
          {t("Notes")}
          <textarea value={v.notes} onChange={(e) => set({ notes: e.target.value.slice(0, 256) })} rows={3} placeholder={t("Briefly describe the media content")} className={inp} style={{ borderColor: "var(--of-line)" }} />
          <span className="block text-right text-[12px]" style={{ color: "var(--of-muted)" }}>{v.notes.length} / 256</span>
        </label>
      ) : null}
      {show.price ? (
        <label className="mt-2 block text-[14px]">
          {t("Suggested price")}
          <span className="mt-2 flex items-center rounded-md border px-3" style={{ borderColor: "var(--of-line)" }}>$<input value={v.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, "") })} className="min-w-0 flex-1 bg-transparent px-2 py-2 outline-none" /></span>
        </label>
      ) : null}
    </>
  );
}
const toPatch = (v: { catId: number | null; hashtags: string; notes: string; price: string }, show: { cat: boolean; tags: boolean; notes: boolean; price: boolean }) => ({
  ...(show.cat ? { catId: v.catId } : {}),
  ...(show.tags ? { hashtags: v.hashtags.split(/[,\s]+/).map((h) => h.replace(/^#/, "")).filter(Boolean) } : {}),
  ...(show.notes ? { notes: v.notes } : {}),
  ...(show.price ? { price: Number(v.price) || null } : {}),
});

/** « Media details » : grand aperçu + infos du média. */
function Details({ m, cats, canEdit, onClose, onSave, t }: { m: M; cats: Cat[]; canEdit: boolean; onClose: () => void; onSave: (patch: Record<string, unknown>) => void; t: (s: string) => string }) {
  const [v, setV] = useState({ catId: m.catId, hashtags: m.hashtags.join(", "), notes: m.notes, price: m.price ? String(m.price) : "" });
  const all = { cat: true, tags: true, notes: true, price: true };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onMouseDown={onClose}>
      <div className="flex h-[88vh] w-full max-w-[1500px] overflow-hidden rounded-xl" style={{ background: "var(--of-pop)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="pro-media relative grid min-w-0 flex-1 place-items-center bg-black">
          {m.createdAt ? <span className="absolute top-5 left-5 rounded-full bg-black/60 px-2.5 py-0.5 text-[12px] text-white">{dateTxt(m.createdAt)}</span> : null}
          {m.type === "video" && m.full ? <video src={m.full} controls className="max-h-full max-w-full" /> : m.type === "audio" && m.full ? <audio src={m.full} controls /> : m.full || m.thumb ? <img src={m.full || m.thumb || ""} alt="" className="max-h-full max-w-full object-contain" /> : null}
        </div>
        <div className="flex w-[330px] shrink-0 flex-col">
          <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--of-line)" }}>
            <h3 className="text-[16px] font-semibold">{t("Media details")}</h3>
            <button onClick={onClose}><X className="size-5" /></button>
          </div>
          <div className="of-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="text-[14px]">{t("Tag other Creator(s)")}</p>
            <button onClick={() => toast(t("Tagging creators is not available with Substy yet"), "err")} className="mt-2 rounded-full border px-3 py-1 text-[13px]" style={{ borderColor: BLUE, color: BLUE }}>+ {t("Add Creator")}</button>
            <div className="mt-5">
              <Fields cats={cats} v={v} set={(o) => setV((x) => ({ ...x, ...o }))} show={all} t={t} />
            </div>
            {m.caption ? <p className="mt-4 text-[13px]"><b>{t("Caption")}</b><br />{m.caption}</p> : null}
            <p className="mt-4 text-[14px]">{t("Uploaded by")}</p>
            <span className="mt-2 inline-block rounded-full border px-4 py-1 text-[13px]" style={{ borderColor: "var(--of-line)" }}>{m.updatedBy || "--"}</span>
            <p className="mt-4 text-[14px]">{t("Upload time")}</p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--of-muted)" }}>{m.createdAt ? new Date(m.createdAt).toLocaleString() : "--"}</p>
          </div>
          {canEdit ? (
            <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--of-line)" }}>
              <Btn onClick={onClose}>{t("Cancel")}</Btn>
              <Btn primary onClick={() => onSave(toPatch(v, all))}>{t("Save")}</Btn>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NewCat({ onClose, onSave, t }: { onClose: () => void; onSave: (name: string) => void; t: (s: string) => string }) {
  const [name, setName] = useState("");
  return (
    <Modal title={t("New category")} onClose={onClose} footer={<><Btn onClick={onClose}>{t("Cancel")}</Btn><Btn primary disabled={!name.trim()} onClick={() => onSave(name.trim())}>{t("Save")}</Btn></>}>
      <div className="px-5 py-4 text-[14px]">
        <p><span style={{ color: "#f26b6b" }}>*</span>{t("Category")}</p>
        <label className="mt-2 flex h-10 items-center rounded-md border px-3" style={{ borderColor: BLUE }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 64))} placeholder={t("Enter category name")} className="min-w-0 flex-1 bg-transparent outline-none" />
          <span className="text-[12px]" style={{ color: "var(--of-muted)" }}>{name.length} / 64</span>
        </label>
      </div>
    </Modal>
  );
}

function AddCat({ cats, onClose, onPick, t }: { cats: Cat[]; onClose: () => void; onPick: (id: number) => void; t: (s: string) => string }) {
  return (
    <Modal title={t("Add to category")} onClose={onClose} footer={<Btn onClick={onClose}>{t("Cancel")}</Btn>}>
      {cats.map((c) => (
        <button key={c.id} onClick={() => onPick(c.id)} className="flex w-full items-center gap-3 border-b px-5 py-3 text-left" style={{ borderColor: "var(--of-line)" }}>
          <span className="size-4 rounded-full border" style={{ borderColor: "var(--of-muted)" }} />
          <span>
            <span className="block text-[14px] font-semibold">{c.name}</span>
            <span className="text-[12px]" style={{ color: "var(--of-muted)" }}>{c.count} {t("media")}</span>
          </span>
        </button>
      ))}
      {!cats.length ? <p className="px-5 py-6 text-[13px]" style={{ color: "var(--of-muted)" }}>{t("Create a category first (+ next to Custom).")}</p> : null}
    </Modal>
  );
}

/** « Batch edit media » : critères à modifier pour toute la sélection. */
function Batch({ cats, count, onClose, onSave, t }: { cats: Cat[]; count: number; onClose: () => void; onSave: (patch: Record<string, unknown>) => void; t: (s: string) => string }) {
  const [show, setShow] = useState({ cat: false, tags: true, notes: true, price: false });
  const [v, setV] = useState({ catId: null as number | null, hashtags: "", notes: "", price: "" });
  const allOn = show.cat && show.tags && show.notes && show.price;
  const chip = (on: boolean, label: string, fn: () => void) => <button onClick={fn} className="rounded-full border px-4 py-1.5 text-[14px]" style={on ? { background: BLUE, borderColor: BLUE, color: "#fff" } : { borderColor: "var(--of-line)" }}>{label}</button>;
  return (
    <Modal title={`${t("Batch edit media")} (${count})`} onClose={onClose} footer={<><Btn onClick={onClose}>{t("Cancel")}</Btn><Btn primary disabled={!show.cat && !show.tags && !show.notes && !show.price} onClick={() => onSave(toPatch(v, show))}>{t("Save")}</Btn></>}>
      <div className="border-b px-5 py-4" style={{ borderColor: "var(--of-line)" }}>
        <p className="text-[14px] font-semibold">{t("Select criteria")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {chip(allOn, t("All"), () => setShow({ cat: !allOn, tags: !allOn, notes: !allOn, price: !allOn }))}
          {chip(show.cat, t("Category"), () => setShow((s) => ({ ...s, cat: !s.cat })))}
          {chip(show.tags, t("Hashtags"), () => setShow((s) => ({ ...s, tags: !s.tags })))}
          {chip(show.notes, t("Notes"), () => setShow((s) => ({ ...s, notes: !s.notes })))}
          {chip(show.price, t("Price"), () => setShow((s) => ({ ...s, price: !s.price })))}
        </div>
      </div>
      <div className="px-5 py-4">
        <p className="mb-3 text-[14px] font-semibold">{t("Edit")}</p>
        <Fields cats={cats} v={v} set={(o) => setV((x) => ({ ...x, ...o }))} show={show} t={t} />
      </div>
      <p className="mx-5 mb-4 rounded-md px-3 py-2 text-[13px]" style={{ background: "#3a1c20", color: "#f26b6b" }}>{t("Saving will update the details for all selected media")}</p>
    </Modal>
  );
}
