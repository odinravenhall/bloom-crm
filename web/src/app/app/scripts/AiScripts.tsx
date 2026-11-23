"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, ExternalLink, Lock, Pencil, Plus, Search, Sparkles, Trash2, Users } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import type { Media } from "@/lib/types";
import { BLUE, Modal, btn2, fieldCls, fieldSt } from "./ScriptLibrary";

// Onglet « IA Substy » : les scripts de l'IA de Substy, à voir ET modifier (admins / managers), comme app.substy.ai/scripts.
type T = (s: string) => string;
type Script = { id: string; name: string; description: string; position: number; enabled: boolean; ai: boolean; human: boolean; steps: number; medias: number | null; totalPrice: number | null; minPrice: number | null; maxPrice: number | null };
type Step = { id: string; position: number; name: string; content: string; price: number; pricingMode: "FIXED" | "SMART"; basePrice: number; maxPrice: number; intervalMin: number | null; intervalMax: number | null; aiCaption: boolean; locked: boolean; medias: Media[]; followUps: number };
type Detail = { canEdit: boolean; script: { id: string; name: string; description: string; enabled: boolean; ai: boolean; human: boolean } | null; steps: Step[] };

function Switch({ on, set, disabled }: { on: boolean; set: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} role="switch" aria-checked={on} onClick={() => set(!on)} className="relative h-[22px] w-10 shrink-0 rounded-full disabled:opacity-50" style={{ background: on ? BLUE : "var(--of-line)" }}>
      <span className="absolute top-[3px] size-4 rounded-full bg-white transition-all" style={{ left: on ? 21 : 3 }} />
    </button>
  );
}

export function AiScripts({ t }: { t: T }) {
  const { creatorId } = useCreators();
  const [list, setList] = useState<Script[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Step> | null>(null);
  const [newScript, setNewScript] = useState(false);
  const [info, setInfo] = useState<{ name: string; description: string } | null>(null);
  const loadList = useCallback(() => {
    if (!creatorId) return;
    api<Script[]>("GET", `/api/scripts?creatorId=${encodeURIComponent(creatorId)}`)
      .then((l) => {
        setList(l);
        setOpen((o) => (o && l.some((s) => s.id === o) ? o : l[0]?.id ?? null));
      })
      .catch((e) => toast((e as Error).message, "err"));
  }, [creatorId]);
  const loadDetail = useCallback(() => {
    if (!creatorId || !open) return setD(null);
    api<Detail>("GET", `/api/ai-scripts/steps?creatorId=${encodeURIComponent(creatorId)}&scriptId=${encodeURIComponent(open)}`).then(setD).catch((e) => toast((e as Error).message, "err"));
  }, [creatorId, open]);
  useEffect(() => {
    setList(null);
    setOpen(null);
    loadList();
  }, [loadList]);
  useEffect(() => {
    setD(null);
    loadDetail();
  }, [loadDetail]);

  const post = async (path: string, b: Record<string, unknown>, ok: string) => {
    try {
      await api("POST", path, { creatorId, ...b });
      toast(ok);
      loadList();
      loadDetail();
      return true;
    } catch (e) {
      toast((e as Error).message, "err");
      return false;
    }
  };
  const setScript = (patch: Record<string, unknown>) => d?.script && post("/api/ai-scripts/script", { id: d.script.id, ...patch }, t("Saved on Substy"));
  const shown = (list ?? []).filter((s) => !q || `${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase()));
  const can = !!d?.canEdit;

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="w-full shrink-0 border-r p-3 md:w-[320px]" style={{ borderColor: "var(--of-line)" }}>
        <label className="flex h-9 items-center gap-2 rounded-md px-3 text-[14px]" style={{ background: "var(--of-card)" }}>
          <Search className="size-4" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search scripts")} className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <div className="mt-2 space-y-1">
          {shown.map((s) => (
            <button key={s.id} onClick={() => setOpen(s.id)} className="w-full rounded-md px-3 py-2.5 text-left" style={{ background: open === s.id ? "var(--of-card)" : undefined, opacity: s.enabled ? 1 : 0.55 }}>
              <p className="truncate text-[14px] font-semibold">{s.name}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12px]" style={{ color: "var(--of-muted)" }}>
                <span>{s.steps} {t("steps")}</span>
                {s.ai ? <span className="flex items-center gap-1"><Bot className="size-3" />{t("AI")}</span> : null}
                {s.human ? <span className="flex items-center gap-1"><Users className="size-3" />{t("Chatters")}</span> : null}
                {!s.enabled ? <span>{t("Paused")}</span> : null}
              </p>
            </button>
          ))}
          {list && !shown.length ? <p className="px-3 py-4 text-[13px]" style={{ color: "var(--of-muted)" }}>{t("No Data")}</p> : null}
        </div>
        {d?.canEdit !== false ? <button onClick={() => setNewScript(true)} className="mt-2 flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-[14px]" style={{ color: BLUE }}><Plus className="size-4" /> {t("New script")}</button> : null}
      </aside>

      <section className="min-w-0 flex-1 p-4">
        {d?.script ? (
          <>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 text-[20px] font-semibold">{d.script.name}{can ? <button onClick={() => setInfo({ name: d.script!.name, description: d.script!.description })} title={t("Edit")}><Pencil className="size-4 opacity-60" /></button> : null}</h2>
                {d.script.description ? <p className="mt-1 line-clamp-3 text-[13px] whitespace-pre-wrap" style={{ color: "var(--of-muted)" }}>{d.script.description}</p> : null}
              </div>
              <a href={`https://app.substy.ai/scripts?creatorId=${creatorId}&scriptId=${d.script.id}`} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px]" style={{ borderColor: "var(--of-line)" }}>Substy <ExternalLink className="size-3.5" /></a>
              {can ? <button onClick={() => confirm(t("Delete this AI script on Substy? This cannot be undone.")) && post("/api/ai-scripts/script/delete", { id: d.script!.id, name: d.script!.name }, t("Deleted")).then(() => setOpen(null))} className="grid size-9 place-items-center rounded-md border" style={{ borderColor: "var(--of-line)", color: "#e5484d" }}><Trash2 className="size-4" /></button> : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-5 rounded-lg p-3 text-[14px]" style={{ background: "var(--of-card)" }}>
              <label className="flex items-center gap-2.5"><Switch disabled={!can} on={d.script.enabled} set={(v) => setScript({ enabled: v })} /> {t("Active")}</label>
              <label className="flex items-center gap-2.5"><Switch disabled={!can} on={d.script.ai} set={(v) => setScript({ ai: v })} /> {t("Used by the AI")}</label>
              <label className="flex items-center gap-2.5"><Switch disabled={!can} on={d.script.human} set={(v) => setScript({ human: v })} /> {t("Used by chatters")}</label>
            </div>
            <div className="mt-4 space-y-3">
              {d.steps.map((s, k) => (
                <div key={s.id} className="rounded-lg border p-4" style={{ borderColor: "var(--of-line)", background: "var(--of-card)" }}>
                  <div className="flex items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white" style={{ background: BLUE }}>{k + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                        {s.name || `${t("Step")} ${k + 1}`}
                        {s.price || s.pricingMode === "SMART" ? (
                          <span className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: "rgba(63,191,111,.15)", color: "#3fbf6f" }}>
                            {s.pricingMode === "SMART" ? `Smart $${s.basePrice}–$${s.maxPrice}` : `$${s.price}`}
                          </span>
                        ) : null}
                        {s.aiCaption ? <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]" style={{ background: "rgba(58,109,240,.15)", color: BLUE }}><Sparkles className="size-3" />{t("AI caption")}</span> : null}
                        {s.locked ? <span className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]" style={{ background: "var(--of-page)" }}><Lock className="size-3" />{t("Locked text")}</span> : null}
                        {s.intervalMin != null ? <span className="text-[11px]" style={{ color: "var(--of-muted)" }}>{t("Wait")} {s.intervalMin}–{s.intervalMax ?? s.intervalMin} min</span> : null}
                      </p>
                      {s.content ? <p className="mt-1.5 text-[14px] whitespace-pre-wrap">{s.content}</p> : <p className="mt-1.5 text-[13px] italic" style={{ color: "var(--of-muted)" }}>{t(s.aiCaption ? "The AI writes the caption" : "No text")}</p>}
                      {s.medias.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {s.medias.slice(0, 10).map((m) => <span key={m.id} className="size-12 overflow-hidden rounded" style={{ background: "var(--of-page)" }}>{m.thumb ? <img src={m.thumb} alt="" className="size-full object-cover" /> : null}</span>)}
                        </div>
                      ) : null}
                      {s.followUps ? <p className="mt-1 text-[12px]" style={{ color: "var(--of-muted)" }}>{s.followUps} {t("follow-up message(s) after the media")}</p> : null}
                    </div>
                    {can ? (
                      <span className="flex gap-1.5">
                        <button title={t("Edit")} onClick={() => setEdit(s)} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--of-page)" }}><Pencil className="size-4" /></button>
                        <button title={t("Delete")} onClick={() => confirm(t("Delete this step on Substy?")) && post("/api/ai-scripts/step/delete", { id: s.id, scriptId: d.script!.id }, t("Deleted"))} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--of-page)", color: "#e5484d" }}><Trash2 className="size-4" /></button>
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {can ? <button onClick={() => setEdit({ pricingMode: "FIXED", price: 0, basePrice: 0, maxPrice: 0 })} className="mt-3 flex items-center gap-1.5 rounded-md px-4 py-2 text-[14px] text-white" style={{ background: BLUE }}><Plus className="size-4" /> {t("Add step")}</button> : null}
            <p className="mt-4 text-[12px]" style={{ color: "var(--of-muted)" }}>{t("Changes are saved directly on Substy: the AI uses them right away. Media are changed on Substy.")}</p>
          </>
        ) : (
          <p className="py-16 text-center text-[14px]" style={{ color: "var(--of-muted)" }}>{list && !list.length ? t("No AI scripts for this creator") : "…"}</p>
        )}
      </section>

      {edit && d?.script ? <StepModal step={edit} onClose={() => setEdit(null)} onSave={(b) => post("/api/ai-scripts/step", { scriptId: d.script!.id, id: edit.id, ...b }, t("Saved on Substy")).then((ok) => ok && setEdit(null))} t={t} /> : null}
      {newScript ? <InfoModal title={t("New script")} value={{ name: "", description: "" }} onClose={() => setNewScript(false)} onSave={(v) => post("/api/ai-scripts/script", v, t("Script created on Substy")).then((ok) => ok && setNewScript(false))} t={t} /> : null}
      {info ? <InfoModal title={t("Edit script")} value={info} onClose={() => setInfo(null)} onSave={(v) => Promise.resolve(setScript(v)).then(() => setInfo(null))} t={t} /> : null}
    </div>
  );
}

function InfoModal({ title, value, onClose, onSave, t }: { title: string; value: { name: string; description: string }; onClose: () => void; onSave: (v: { name: string; description: string }) => void; t: T }) {
  const [v, setV] = useState(value);
  return (
    <Modal title={title} onClose={onClose} footer={<><button onClick={onClose} className={btn2} style={{ borderColor: "#444" }}>{t("Cancel")}</button><button disabled={!v.name.trim()} onClick={() => onSave(v)} className="h-9 rounded-md px-4 text-white disabled:opacity-40" style={{ background: BLUE }}>{t("Save")}</button></>}>
      <p>{t("Name")}</p>
      <input value={v.name} maxLength={120} onChange={(e) => setV({ ...v, name: e.target.value })} className={fieldCls} style={fieldSt} />
      <p className="mt-4">{t("Description")} <span className="text-[12px]" style={{ color: "#999" }}>{t("What the AI should know about this script")}</span></p>
      <textarea value={v.description} rows={5} onChange={(e) => setV({ ...v, description: e.target.value })} className={fieldCls} style={fieldSt} />
    </Modal>
  );
}

function StepModal({ step, onClose, onSave, t }: { step: Partial<Step>; onClose: () => void; onSave: (b: Record<string, unknown>) => void; t: T }) {
  const [v, setV] = useState({
    name: step.name ?? "", content: step.content ?? "", pricingMode: step.pricingMode ?? "FIXED", price: String(step.price ?? 0), basePrice: String(step.basePrice ?? 0), maxPrice: String(step.maxPrice ?? 0),
    intervalMin: step.intervalMin == null ? "" : String(step.intervalMin), intervalMax: step.intervalMax == null ? "" : String(step.intervalMax), aiCaption: !!step.aiCaption, locked: !!step.locked,
  });
  const n = (s: string) => s.replace(/[^\d.]/g, "");
  const save = () =>
    onSave({
      name: v.name, content: v.content, pricingMode: v.pricingMode, price: Number(v.price) || 0, basePrice: Number(v.basePrice) || 0, maxPrice: Number(v.maxPrice) || 0,
      intervalMin: v.intervalMin === "" ? null : Number(v.intervalMin), intervalMax: v.intervalMax === "" ? null : Number(v.intervalMax), aiCaption: v.aiCaption, locked: v.locked,
    });
  return (
    <Modal wide title={t(step.id ? "Edit step" : "Add step")} onClose={onClose} footer={<><button onClick={onClose} className={btn2} style={{ borderColor: "#444" }}>{t("Cancel")}</button><button onClick={save} className="h-9 rounded-md px-5 text-white" style={{ background: BLUE }}>{t("Save")}</button></>}>
      <p>{t("Step name")}</p>
      <input value={v.name} maxLength={120} onChange={(e) => setV({ ...v, name: e.target.value })} className={fieldCls} style={fieldSt} />
      <p className="mt-4">{t("Message")}</p>
      <textarea value={v.content} rows={6} onChange={(e) => setV({ ...v, content: e.target.value })} className={fieldCls} style={fieldSt} />
      <div className="mt-3 flex flex-wrap gap-5">
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.aiCaption} onChange={(e) => setV({ ...v, aiCaption: e.target.checked })} /> {t("Let the AI write the caption")}</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.locked} onChange={(e) => setV({ ...v, locked: e.target.checked })} /> {t("Lock the text (the AI sends it word for word)")}</label>
      </div>
      <p className="mt-4">{t("Price")}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {(["FIXED", "SMART"] as const).map((m) => (
          <button key={m} onClick={() => setV({ ...v, pricingMode: m })} className="rounded-full border px-3 py-1 text-[13px]" style={{ borderColor: v.pricingMode === m ? BLUE : "#3a3a3a", color: v.pricingMode === m ? BLUE : undefined }}>{t(m === "FIXED" ? "Fixed price" : "Smart price (the AI adapts)")}</button>
        ))}
      </div>
      {v.pricingMode === "FIXED" ? (
        <label className="mt-2 flex items-center gap-2">$<input value={v.price} onChange={(e) => setV({ ...v, price: n(e.target.value) })} className="w-28 rounded-md border px-2 py-1.5 outline-none" style={fieldSt} /> <span className="text-[12px]" style={{ color: "#999" }}>{t("0 = free")}</span></label>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">{t("From")} $<input value={v.basePrice} onChange={(e) => setV({ ...v, basePrice: n(e.target.value) })} className="w-24 rounded-md border px-2 py-1.5 outline-none" style={fieldSt} /></label>
          <label className="flex items-center gap-2">{t("Up to")} $<input value={v.maxPrice} onChange={(e) => setV({ ...v, maxPrice: n(e.target.value) })} className="w-24 rounded-md border px-2 py-1.5 outline-none" style={fieldSt} /></label>
        </div>
      )}
      <p className="mt-4">{t("Wait before this step")} <span className="text-[12px]" style={{ color: "#999" }}>{t("minutes, optional")}</span></p>
      <div className="mt-1.5 flex items-center gap-2">
        <input value={v.intervalMin} onChange={(e) => setV({ ...v, intervalMin: n(e.target.value) })} placeholder="min" className="w-24 rounded-md border px-2 py-1.5 outline-none" style={fieldSt} /> –
        <input value={v.intervalMax} onChange={(e) => setV({ ...v, intervalMax: n(e.target.value) })} placeholder="max" className="w-24 rounded-md border px-2 py-1.5 outline-none" style={fieldSt} />
      </div>
      {step.medias?.length ? <p className="mt-4 text-[12px]" style={{ color: "#999" }}>{step.medias.length} {t("media kept as they are (change them on Substy)")}</p> : null}
    </Modal>
  );
}
