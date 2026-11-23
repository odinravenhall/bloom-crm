"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, GitBranch, ImagePlus, Pause, Pencil, Play, Plus, Search, Share2, Smile, StickyNote, Trash2, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import type { Media } from "@/lib/types";
import { VaultProPicker } from "@/app/pro/VaultProPicker";
import { QUICK } from "@/app/pro/emojis";

// Scripts façon Infloww : onglet « Tag » (scripts rangés dans des tags, un script peut être dans plusieurs tags) et
// onglet « Sequence » (étapes dans l'ordre, normales ou conditionnelles). Stats Sent / Bought / Earned de chaque script.
export const BLUE = "#3a6df0";
type T = (s: string) => string;
export type Item = {
  id: number; name: string; text: string; note: string | null; price: number; medias: Media[]; groupId: number; tags: number[]; cond: "" | "bought" | "not_bought"; creatorTags: string[];
  uses: number; fans: number; ppvSent: number; sales: number; revenue: number; currency: string | null;
};
type Group = { id: number; kind: "tag" | "sequence"; name: string; position: number; items: Item[] };
type Lib = { groups: Group[]; canEdit: boolean };
const money = (v: number) => "$" + (v / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function useLib(creatorId: string | null) {
  const [lib, setLib] = useState<Lib | null>(null);
  const load = useCallback(() => {
    if (!creatorId) return;
    api<Lib>("GET", `/api/lib?creatorId=${encodeURIComponent(creatorId)}`).then(setLib).catch((e) => toast((e as Error).message, "err"));
  }, [creatorId]);
  useEffect(() => {
    setLib(null);
    load();
  }, [load]);
  return { lib, load };
}

/** Texte d'un script avec {name} mis en avant. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\{\s*(?:name|pr[ée]nom)\s*\})/gi);
  return <>{parts.map((p, i) => (/^\{/.test(p) ? <span key={i} className="rounded px-1" style={{ background: "rgba(58,109,240,.18)", color: BLUE }}>{"{name}"}</span> : p))}</>;
}

/** Vignettes des médias ; les notes vocales se lisent sur place. */
function Medias({ medias }: { medias: Media[] }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  if (!medias.length) return null;
  const play = (m: Media) => {
    if (playing === m.id) return audio.current?.pause(), setPlaying(null);
    audio.current?.pause();
    if (!m.full) return toast("Écoute indisponible pour ce média", "err");
    audio.current = new Audio(m.full);
    audio.current.onended = () => setPlaying(null);
    audio.current.play().then(() => setPlaying(m.id)).catch(() => toast("Écoute impossible", "err"));
  };
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {medias.slice(0, 8).map((m) =>
        /audio/i.test(m.type) ? (
          <button key={m.id} onClick={() => play(m)} className="flex h-14 items-center gap-2 rounded-md px-3 text-[12px]" style={{ background: "var(--of-page)" }}>
            {playing === m.id ? <Pause className="size-4" /> : <Play className="size-4" />} {m.duration ? `${Math.round(m.duration)}s` : "Audio"}
          </button>
        ) : (
          <span key={m.id} className="relative size-14 overflow-hidden rounded-md" style={{ background: "var(--of-page)" }}>
            {m.thumb ? <img src={m.thumb} alt="" className="size-full object-cover" /> : null}
            {/video/i.test(m.type) ? <Play className="absolute inset-0 m-auto size-4 text-white drop-shadow" /> : null}
          </span>
        ),
      )}
      {medias.length > 8 ? <span className="grid size-14 place-items-center rounded-md text-[12px]" style={{ background: "var(--of-page)" }}>+{medias.length - 8}</span> : null}
    </div>
  );
}

function Stats({ i, t }: { i: Item; t: T }) {
  return (
    <span className="flex gap-4 text-[12px]" style={{ color: "var(--of-muted)" }}>
      <span>{t("Sent")} <b style={{ color: "var(--of-text)" }}>{i.uses}</b></span>
      <span>{t("Bought")} <b style={{ color: "var(--of-text)" }}>{i.sales}</b></span>
      <span>{t("Earned")} <b style={{ color: "var(--of-text)" }}>{money(i.revenue)}</b></span>
    </span>
  );
}

export function ScriptLibrary({ kind, t }: { kind: "tag" | "sequence"; t: T }) {
  const { creatorId, creators } = useCreators();
  const { lib, load } = useLib(creatorId);
  const [sel, setSel] = useState<number | "all" | null>(null);
  const [q, setQ] = useState("");
  const [order, setOrder] = useState(false);
  const [edit, setEdit] = useState<{ groupId: number; item: Partial<Item> } | null>(null);
  const [share, setShare] = useState<Item | null>(null);
  const [nameModal, setNameModal] = useState<{ id?: number; name: string } | null>(null);
  const groups = useMemo(() => (lib?.groups ?? []).filter((g) => g.kind === kind), [lib, kind]);
  const canEdit = !!lib?.canEdit;
  useEffect(() => {
    if (sel === null && lib) setSel(kind === "tag" ? "all" : groups[0]?.id ?? null);
  }, [lib, groups, sel, kind]);
  useEffect(() => setSel(null), [creatorId, kind]);
  const cur = typeof sel === "number" ? groups.find((g) => g.id === sel) ?? null : null;
  const items = useMemo(() => {
    const list = sel === "all" ? [...new Map(groups.flatMap((g) => g.items).map((i) => [i.id, i])).values()] : cur?.items ?? [];
    return list.filter((i) => !q || `${i.name} ${i.text}`.toLowerCase().includes(q.toLowerCase()));
  }, [groups, cur, sel, q]);

  const post = async (path: string, b: Record<string, unknown>, ok?: string) => {
    try {
      const r = await api<{ id?: number }>("POST", path, b);
      if (ok) toast(ok);
      load();
      return r;
    } catch (e) {
      toast((e as Error).message, "err");
      return null;
    }
  };
  const moveGroup = (id: number, d: -1 | 1) => {
    const ids = groups.map((g) => g.id);
    const k = ids.indexOf(id);
    if (k + d < 0 || k + d >= ids.length) return;
    [ids[k], ids[k + d]] = [ids[k + d], ids[k]];
    post("/api/lib/group/order", { creatorId, ids });
  };
  const moveItem = (id: number, d: -1 | 1) => {
    if (!cur) return;
    const ids = cur.items.filter((i) => i.groupId === cur.id).map((i) => i.id);
    const k = ids.indexOf(id);
    if (k < 0 || k + d < 0 || k + d >= ids.length) return;
    [ids[k], ids[k + d]] = [ids[k + d], ids[k]];
    post("/api/lib/item/order", { groupId: cur.id, ids });
  };
  const del = (i: Item) => confirm(t("Delete this script?")) && post("/api/lib/item/delete", { id: i.id }, t("Deleted"));
  const saveGroup = async (name: string) => {
    if (!nameModal) return;
    const r = await post("/api/lib/group", nameModal.id ? { id: nameModal.id, name } : { creatorId, kind, name });
    if (r?.id && !nameModal.id) setSel(r.id);
    setNameModal(null);
  };
  const W = kind === "tag" ? { add: "Add tag", item: "Add script", none: "No tags yet" } : { add: "Add sequence", item: "Add step", none: "No sequences yet" };

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* Tags / séquences */}
      <aside className="w-full shrink-0 border-r p-3 md:w-[260px]" style={{ borderColor: "var(--of-line)" }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: "var(--of-muted)" }}>{t(kind === "tag" ? "Tags" : "Sequences")}</span>
          {canEdit ? <button onClick={() => setOrder(!order)} className="text-[12px]" style={{ color: order ? BLUE : "var(--of-muted)" }}>{order ? t("Done") : t("Customize order")}</button> : null}
        </div>
        {kind === "tag" ? (
          <button onClick={() => setSel("all")} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[14px]" style={{ background: sel === "all" ? "var(--of-card)" : undefined }}>
            {t("All")} <span style={{ color: "var(--of-muted)" }}>{new Set(groups.flatMap((g) => g.items.map((i) => i.id))).size}</span>
          </button>
        ) : null}
        {groups.map((g) => (
          <div key={g.id} className="group flex items-center rounded-md" style={{ background: sel === g.id ? "var(--of-card)" : undefined }}>
            <button onClick={() => setSel(g.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-[14px]">{g.name}</button>
            {order ? (
              <span className="flex pr-1">
                <button onClick={() => moveGroup(g.id, -1)} className="grid size-6 place-items-center"><ArrowUp className="size-3.5" /></button>
                <button onClick={() => moveGroup(g.id, 1)} className="grid size-6 place-items-center"><ArrowDown className="size-3.5" /></button>
              </span>
            ) : (
              <>
                <span className="pr-2 text-[12px] group-hover:hidden" style={{ color: "var(--of-muted)" }}>{g.items.length}</span>
                {canEdit ? (
                  <span className="hidden pr-1 group-hover:flex">
                    <button title={t("Rename")} onClick={() => setNameModal({ id: g.id, name: g.name })} className="grid size-6 place-items-center"><Pencil className="size-3.5" /></button>
                    <button title={t("Delete")} onClick={() => confirm(t(kind === "tag" ? "Delete this tag and the scripts that are only in it?" : "Delete this sequence and its steps?")) && post("/api/lib/group/delete", { id: g.id }).then(() => setSel(null))} className="grid size-6 place-items-center"><Trash2 className="size-3.5" /></button>
                  </span>
                ) : null}
              </>
            )}
          </div>
        ))}
        {lib && !groups.length ? <p className="px-3 py-4 text-[13px]" style={{ color: "var(--of-muted)" }}>{t(W.none)}</p> : null}
        {canEdit ? <button onClick={() => setNameModal({ name: "" })} className="mt-2 flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-[14px]" style={{ color: BLUE }}><Plus className="size-4" /> {t(W.add)}</button> : null}
      </aside>

      {/* Scripts / étapes */}
      <section className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[18px] font-semibold">{sel === "all" ? t("All scripts") : cur?.name ?? ""}</h2>
          <span className="flex-1" />
          <label className="flex h-9 w-[260px] items-center gap-2 rounded-md px-3 text-[14px]" style={{ background: "var(--of-card)" }}>
            <Search className="size-4" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search scripts")} className="min-w-0 flex-1 bg-transparent outline-none" />
          </label>
          {canEdit && (cur || (kind === "tag" && groups.length)) ? (
            <button onClick={() => setEdit({ groupId: cur?.id ?? groups[0].id, item: { cond: "", tags: cur ? [cur.id] : [] } })} className="flex h-9 items-center gap-1 rounded-md px-4 text-[14px] text-white" style={{ background: BLUE }}><Plus className="size-4" /> {t(W.item)}</button>
          ) : null}
        </div>
        {cur && kind === "sequence" ? (
          <p className="mt-1 text-[13px]" style={{ color: "var(--of-muted)" }}>{t("Steps are sent in order. A conditional step is only sent if the previous PPV was bought (or not).")}</p>
        ) : null}
        <div className={kind === "sequence" ? "mt-4 space-y-0" : "mt-4 grid gap-3"} style={kind === "tag" ? { gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" } : undefined}>
          {items.map((i, k) => (
            <div key={i.id} className={kind === "sequence" ? "relative pl-10" : ""}>
              {kind === "sequence" ? (
                <>
                  <span className="absolute top-0 bottom-0 left-[15px] w-px" style={{ background: "var(--of-line)", display: k === items.length - 1 ? "none" : undefined }} />
                  <span className="absolute top-3 left-0 grid size-8 place-items-center rounded-full text-[13px] font-semibold text-white" style={{ background: i.cond ? "#9b59d0" : BLUE }}>{i.cond ? <GitBranch className="size-4" /> : k + 1}</span>
                </>
              ) : null}
              <div className="mb-3 rounded-lg border p-4" style={{ borderColor: "var(--of-line)", background: "var(--of-card)" }}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                      {i.name || `#${k + 1}`}
                      {kind === "sequence" ? (
                        <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: i.cond ? "rgba(155,89,208,.18)" : "rgba(58,109,240,.15)", color: i.cond ? "#b07ee0" : BLUE }}>
                          {i.cond === "bought" ? t("Conditional · if bought") : i.cond === "not_bought" ? t("Conditional · if not bought") : t("Normal")}
                        </span>
                      ) : null}
                      {i.price ? <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: "rgba(63,191,111,.15)", color: "#3fbf6f" }}>${i.price}</span> : null}
                    </p>
                    {kind === "tag" && sel === "all" ? (
                      <p className="mt-1 flex flex-wrap gap-1">{i.tags.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean).map((n) => <span key={n} className="rounded px-1.5 text-[11px]" style={{ background: "var(--of-page)" }}>{n}</span>)}</p>
                    ) : null}
                  </div>
                  {order && cur && i.groupId === cur.id ? (
                    <span className="flex">
                      <button onClick={() => moveItem(i.id, -1)} className="grid size-7 place-items-center"><ArrowUp className="size-4" /></button>
                      <button onClick={() => moveItem(i.id, 1)} className="grid size-7 place-items-center"><ArrowDown className="size-4" /></button>
                    </span>
                  ) : null}
                </div>
                {i.text ? <p className="mt-2 text-[14px] whitespace-pre-wrap"><Rich text={i.text} /></p> : null}
                <Medias medias={i.medias} />
                {i.note ? <p className="mt-2 flex items-start gap-1.5 text-[12px]" style={{ color: "var(--of-muted)" }}><StickyNote className="mt-0.5 size-3.5 shrink-0" /> {i.note}</p> : null}
                {i.creatorTags.length ? <p className="mt-1 text-[12px]" style={{ color: "var(--of-muted)" }}>@ {i.creatorTags.join(", ")}</p> : null}
                <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--of-line)" }}>
                  <Stats i={i} t={t} />
                  <span className="flex-1" />
                  {canEdit ? (
                    <>
                      <button title={t("Edit")} onClick={() => setEdit({ groupId: i.groupId, item: i })} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--of-page)" }}><Pencil className="size-4" /></button>
                      <button title={t("Share")} onClick={() => setShare(i)} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--of-page)" }}><Share2 className="size-4" /></button>
                      <button title={t("Delete")} onClick={() => del(i)} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--of-page)", color: "#e5484d" }}><Trash2 className="size-4" /></button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        {lib && !items.length ? <p className="py-16 text-center text-[14px]" style={{ color: "var(--of-muted)" }}>{t("No Data")}</p> : null}
        {!lib ? <p className="py-16 text-center text-[14px]" style={{ color: "var(--of-muted)" }}>…</p> : null}
      </section>

      {edit && creatorId ? <ScriptModal creatorId={creatorId} kind={kind} groups={groups} groupId={edit.groupId} item={edit.item} creatorNames={creators.filter((c) => c.id !== creatorId).map((c) => c.name)} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), load())} t={t} /> : null}
      {share ? <ShareModal item={share} others={creators.filter((c) => c.id !== creatorId)} onClose={() => setShare(null)} onShare={(ids) => post("/api/lib/item/share", { id: share.id, toCreatorIds: ids }, t("Shared")).then(() => setShare(null))} t={t} /> : null}
      {nameModal ? <NameModal title={t(nameModal.id ? "Rename" : W.add)} value={nameModal.name} onClose={() => setNameModal(null)} onSave={saveGroup} t={t} /> : null}
    </div>
  );
}

export function Modal({ title, children, onClose, footer, wide }: { title: string; children: React.ReactNode; onClose: () => void; footer: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className={`w-full rounded-lg ${wide ? "max-w-[720px]" : "max-w-[480px]"}`} style={{ background: "#222", color: "#eee" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between border-b px-5 py-3.5 text-[16px] font-semibold" style={{ borderColor: "#333" }}>{title}<button onClick={onClose}><X className="size-4" /></button></h3>
        <div className="of-scroll max-h-[72vh] overflow-y-auto px-5 py-4 text-[14px]">{children}</div>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "#333" }}>{footer}</div>
      </div>
    </div>
  );
}
export const btn2 = "h-9 rounded-md border px-4 text-[14px]";
export const fieldCls = "mt-1.5 w-full rounded-md border px-3 py-2 outline-none";
export const fieldSt = { background: "#2c2c2c", borderColor: "#3a3a3a" };

function NameModal({ title, value, onClose, onSave, t }: { title: string; value: string; onClose: () => void; onSave: (v: string) => void; t: T }) {
  const [v, setV] = useState(value);
  return (
    <Modal title={title} onClose={onClose} footer={<><button onClick={onClose} className={btn2} style={{ borderColor: "#444" }}>{t("Cancel")}</button><button disabled={!v.trim()} onClick={() => onSave(v.trim())} className="h-9 rounded-md px-4 text-white disabled:opacity-40" style={{ background: BLUE }}>{t("Save")}</button></>}>
      <p>{t("Name")}</p>
      <input autoFocus value={v} maxLength={80} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && v.trim() && onSave(v.trim())} className={fieldCls} style={fieldSt} />
    </Modal>
  );
}

function ShareModal({ item, others, onClose, onShare, t }: { item: Item; others: { id: string; name: string }[]; onClose: () => void; onShare: (ids: string[]) => void; t: T }) {
  const [on, setOn] = useState<string[]>([]);
  return (
    <Modal title={t("Share with other creators")} onClose={onClose} footer={<><button onClick={onClose} className={btn2} style={{ borderColor: "#444" }}>{t("Cancel")}</button><button disabled={!on.length} onClick={() => onShare(on)} className="h-9 rounded-md px-4 text-white disabled:opacity-40" style={{ background: BLUE }}>{t("Share")}</button></>}>
      <p className="mb-2 font-semibold">{item.name || item.text.slice(0, 40)}</p>
      <p className="mb-3 text-[12px]" style={{ color: "#999" }}>{t("The text and the note are copied into a tag with the same name. Media and price stay with this creator (each vault is separate).")}</p>
      {others.map((c) => (
        <label key={c.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={on.includes(c.id)} onChange={() => setOn(on.includes(c.id) ? on.filter((x) => x !== c.id) : [...on, c.id])} /> {c.name}</label>
      ))}
    </Modal>
  );
}

/** Ajouter / modifier un script (ou une étape de séquence), comme la fenêtre d'Infloww. */
function ScriptModal({ creatorId, kind, groups, groupId, item, creatorNames, onClose, onSaved, t }: { creatorId: string; kind: "tag" | "sequence"; groups: Group[]; groupId: number; item: Partial<Item>; creatorNames: string[]; onClose: () => void; onSaved: () => void; t: T }) {
  const [v, setV] = useState({ name: item.name ?? "", text: item.text ?? "", note: item.note ?? "", price: item.price ? String(item.price) : "", cond: item.cond ?? "", tags: item.tags?.length ? item.tags : [groupId], creatorTags: item.creatorTags ?? [] });
  const [medias, setMedias] = useState<Media[]>(item.medias ?? []);
  const [vault, setVault] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [shareTo, setShareTo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { creators } = useCreators();
  const ta = useRef<HTMLTextAreaElement>(null);
  const insert = (s: string) => {
    const el = ta.current;
    const a = el?.selectionStart ?? v.text.length, b = el?.selectionEnd ?? v.text.length;
    setV({ ...v, text: v.text.slice(0, a) + s + v.text.slice(b) });
    requestAnimationFrame(() => el?.focus());
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: number }>("POST", "/api/lib/item", { id: item.id, groupId, name: v.name, text: v.text, note: v.note, price: Number(v.price) || 0, medias, cond: v.cond, tags: kind === "tag" ? v.tags : undefined, creatorTags: v.creatorTags });
      if (shareTo.length) await api("POST", "/api/lib/item/share", { id: r.id, toCreatorIds: shareTo });
      toast(t("Saved"));
      onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Modal
        wide
        title={t(item.id ? (kind === "tag" ? "Edit script" : "Edit step") : kind === "tag" ? "Add script" : "Add step")}
        onClose={onClose}
        footer={<><button onClick={onClose} className={btn2} style={{ borderColor: "#444" }}>{t("Cancel")}</button><button disabled={busy} onClick={save} className="h-9 rounded-md px-5 text-white disabled:opacity-40" style={{ background: BLUE }}>{t("Save")}</button></>}
      >
        <p>{t("Script name")}</p>
        <input value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} className={fieldCls} style={fieldSt} />
        {kind === "tag" ? (
          <>
            <p className="mt-4">{t("Tags")}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {groups.map((g) => {
                const on = v.tags.includes(g.id);
                return (
                  <button key={g.id} onClick={() => setV({ ...v, tags: on ? (v.tags.length > 1 ? v.tags.filter((x) => x !== g.id) : v.tags) : [...v.tags, g.id] })} className="flex items-center gap-1 rounded-full border px-3 py-1 text-[13px]" style={{ borderColor: on ? BLUE : "#3a3a3a", color: on ? BLUE : undefined }}>
                    {on ? <Check className="size-3.5" /> : null}{g.name}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p className="mt-4">{t("Step type")}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {([["", "Normal"], ["bought", "Conditional · if bought"], ["not_bought", "Conditional · if not bought"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setV({ ...v, cond: k })} className="rounded-full border px-3 py-1 text-[13px]" style={{ borderColor: v.cond === k ? BLUE : "#3a3a3a", color: v.cond === k ? BLUE : undefined }}>{t(l)}</button>
              ))}
            </div>
          </>
        )}
        <p className="mt-4 flex items-center justify-between">{t("Message")} <button onClick={() => insert("{name}")} className="rounded px-2 py-0.5 text-[12px]" style={{ background: "rgba(58,109,240,.18)", color: BLUE }}>+ {"{name}"}</button></p>
        <div className="mt-1.5 rounded-md border" style={fieldSt}>
          <textarea ref={ta} value={v.text} onChange={(e) => setV({ ...v, text: e.target.value })} rows={5} placeholder={t("Write a message… {name} is replaced by the fan's first name")} className="w-full resize-y bg-transparent px-3 py-2 outline-none" />
          <div className="relative flex items-center gap-1 border-t px-2 py-1.5" style={{ borderColor: "#3a3a3a" }}>
            <button onClick={() => setEmoji(!emoji)} className="grid size-8 place-items-center rounded"><Smile className="size-4" /></button>
            <button onClick={() => setVault(true)} className="flex h-8 items-center gap-1.5 rounded px-2 text-[13px]"><ImagePlus className="size-4" /> {t("Add media")}{medias.length ? ` (${medias.length})` : ""}</button>
            <span className="flex-1" />
            <label className="flex items-center gap-1.5 text-[13px]">{t("Price")} $<input value={v.price} onChange={(e) => setV({ ...v, price: e.target.value.replace(/[^\d.]/g, "") })} placeholder={t("Free")} className="w-20 rounded bg-black/30 px-2 py-1 outline-none" /></label>
            {emoji ? (
              <div className="absolute bottom-10 left-0 z-10 grid w-72 grid-cols-8 gap-1 rounded-md border p-2" style={{ background: "#2c2c2c", borderColor: "#3a3a3a" }}>
                {QUICK.map((e) => <button key={e} onClick={() => (insert(e), setEmoji(false))} className="text-[18px]">{e}</button>)}
              </div>
            ) : null}
          </div>
        </div>
        {medias.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {medias.map((m) => (
              <span key={m.id} className="relative size-14 overflow-hidden rounded-md bg-black/40">
                {m.thumb ? <img src={m.thumb} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[11px]">{/audio/i.test(m.type) ? "Audio" : m.type}</span>}
                <button onClick={() => setMedias(medias.filter((x) => x.id !== m.id))} className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-black/70"><X className="size-3" /></button>
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-4">{t("Tag creators")} <span className="text-[12px]" style={{ color: "#999" }}>{t("Optional")}</span></p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {creatorNames.map((n) => {
            const on = v.creatorTags.includes(n);
            return <button key={n} onClick={() => setV({ ...v, creatorTags: on ? v.creatorTags.filter((x) => x !== n) : [...v.creatorTags, n] })} className="rounded-full border px-3 py-1 text-[13px]" style={{ borderColor: on ? BLUE : "#3a3a3a", color: on ? BLUE : undefined }}>@{n}</button>;
          })}
        </div>
        <p className="mt-4">{t("Internal notes")} <span className="text-[12px]" style={{ color: "#999" }}>{t("Only the team sees them")}</span></p>
        <textarea value={v.note} maxLength={500} onChange={(e) => setV({ ...v, note: e.target.value })} rows={2} placeholder={t("e.g. Send if the fan replies")} className={fieldCls} style={fieldSt} />
        {!item.id ? (
          <>
            <p className="mt-4">{t("Share with other creators")} <span className="text-[12px]" style={{ color: "#999" }}>{t("Optional")}</span></p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {creators.filter((c) => c.id !== creatorId).map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={shareTo.includes(c.id)} onChange={() => setShareTo(shareTo.includes(c.id) ? shareTo.filter((x) => x !== c.id) : [...shareTo, c.id])} /> {c.name}</label>
              ))}
            </div>
          </>
        ) : null}
      </Modal>
      {vault ? (
        <div className="pro">
          <VaultProPicker
            creatorId={creatorId}
            selected={medias.map((m) => ({ id: m.id, type: /video/i.test(m.type) ? "video" : /audio/i.test(m.type) ? "audio" : "photo", thumbnailUrl: m.thumb ?? undefined, url: m.full ?? undefined }))}
            onPick={(list) => (setMedias(list.map((m) => ({ id: m.id, type: m.type, thumb: m.thumbnailUrl || m.smallUrl || null, full: m.url || m.largeUrl || m.mediumUrl || null, duration: null }))), setVault(false))}
            onClose={() => setVault(false)}
            t={t}
          />
        </div>
      ) : null}
    </>
  );
}
