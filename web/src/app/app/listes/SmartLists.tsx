"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Pencil, Plus, RefreshCw, Search, Trash2, UserRoundCheck, Wallet } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";

// Growth → Smart lists (OnlyFans) : copie de la page d'Infloww. Une créatrice à la fois (liste à gauche) ; listes par
// tranche de dépense (« segment », une seule série par créatrice) et listes de nouveaux fans.
type L = { id: number; kind: "spend" | "newfans" | "manual" | "auto"; name: string; icon: string | null; min: number | null; max: number | null; days: number | null; includeExpired: boolean; count: number };
type Resp = { fans: number; lists: L[] };
type Seg = { id?: number; name: string; min: string; max: string };
const BLUE = "#2f6bff";

export function SmartLists({ canEdit }: { canEdit: boolean }) {
  const { t } = useT();
  const { creators, creatorId, setCreator } = useCreators();
  const cid = creatorId ?? creators[0]?.id ?? null;
  const [q, setQ] = useState("");
  const [lq, setLq] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | "create" | "exists" | "spend" | "newfans">(null);
  const [editNew, setEditNew] = useState<L | null>(null);
  const [reply, setReply] = useState<Record<string, number>>({});

  const load = useCallback(() => {
    if (!cid) return;
    setBusy(true);
    api<Resp>("GET", `/api/fanlists?creatorId=${encodeURIComponent(cid)}`)
      .then(setData)
      .catch((e) => toast((e as Error).message, "err"))
      .finally(() => setBusy(false));
  }, [cid]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  useEffect(() => {
    api<{ counts: Record<string, number> }>("GET", "/api/rv/inbox?tab=reply").then((r) => setReply(r.counts || {})).catch(() => {});
  }, []);
  const call = async (path: string, payload: Record<string, unknown>) => {
    if (!cid) return;
    try {
      setData(await api<Resp>("POST", `/api/fanlists/${path}`, { creatorId: cid, ...payload }));
      return true;
    } catch (e) {
      toast((e as Error).message, "err");
      return false;
    }
  };
  const lists = (data?.lists ?? []).filter((l) => l.kind === "spend" || l.kind === "newfans");
  const shown = lists
    .filter((l) => !lq || l.name.toLowerCase().includes(lq.toLowerCase()))
    .sort((a, b) => (a.kind === b.kind ? (a.kind === "newfans" ? (b.days ?? 0) - (a.days ?? 0) : (a.min ?? 0) - (b.min ?? 0)) : a.kind === "newfans" ? -1 : 1));
  const spend = lists.filter((l) => l.kind === "spend");
  const crit = (l: L) =>
    l.kind === "newfans" ? `${t("Subscription less than")} ${l.days ?? 0} ${t("day(s)")}` : `${t("Total spend")}: $${l.min ?? 0}-${l.max != null ? `$${l.max}` : t("no upper limit")}`;
  const cur = creators.find((c) => c.id === cid);
  const del = async (l: L) => {
    if (!window.confirm(`${t("Delete the list")} « ${l.name} » ?`)) return;
    await call("delete", { id: l.id });
  };

  return (
    <div className="flex min-h-full gap-3 p-3" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      {/* Créatrices */}
      <div className="flex w-[184px] shrink-0 flex-col gap-2">
        <h1 className="flex h-9 items-center px-1 text-[16px] font-semibold">{t("Smart lists")}</h1>
        <div className="flex gap-2">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-1 rounded-md border px-2.5" style={{ borderColor: "var(--of-line)", background: "var(--of-field)" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
            <Search className="size-4 shrink-0" style={{ color: "var(--of-muted)" }} />
          </label>
          <button onClick={load} title={t("Refresh")} className="grid size-10 place-items-center rounded-md border" style={{ borderColor: "var(--of-line)", background: "var(--of-field)" }}>
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex h-8 items-center justify-between rounded-md px-3 text-[14px]" style={{ background: "var(--of-pick-bar)", color: BLUE }}>
          {t("All creators")} <ChevronDown className="size-3.5" style={{ color: "var(--of-muted)" }} />
        </div>
        <div className="of-scroll flex max-h-[calc(100vh-140px)] flex-col overflow-y-auto rounded-md" style={{ background: "var(--of-pick-list)" }}>
          {creators
            .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()))
            .map((c) => (
              <button key={c.id} onClick={() => setCreator(c.id)} className="flex items-center gap-2.5 px-3 py-3.5 text-left text-[14px] font-medium" style={c.id === cid ? { background: "var(--of-pick)" } : undefined}>
                <span className="relative shrink-0">
                  <Avatar src={c.avatar} name={c.name} size="size-9" rounded="rounded-md" />
                  <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 bg-emerald-500" style={{ borderColor: "var(--of-pick-list)" }} />
                </span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {reply[c.id] ? <span className="rounded-full px-1.5 text-[10px] leading-4 font-bold text-white" style={{ background: "#f26b6b" }}>{reply[c.id] > 99 ? "99+" : reply[c.id]}</span> : null}
              </button>
            ))}
        </div>
      </div>

      {/* Listes */}
      <div className="min-w-0 flex-1 pt-11">
        <div className="flex justify-end gap-3">
          <label className="flex h-10 w-[200px] items-center gap-2 rounded-md border px-3" style={{ borderColor: "var(--of-line)" }}>
            <input value={lq} onChange={(e) => setLq(e.target.value)} placeholder={t("Search list name")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
            <Search className="size-4" style={{ color: "var(--of-muted)" }} />
          </label>
          {canEdit ? (
            <button onClick={() => setModal("create")} className="flex h-10 items-center gap-2 rounded-md px-4 text-[14px] text-white" style={{ background: BLUE }}>
              <Plus className="size-4" /> {t("Create list")}
            </button>
          ) : null}
        </div>
        <div className="of-scroll mt-4 overflow-x-auto rounded-md">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="text-left" style={{ background: "var(--of-line)" }}>
                {["List name", "Criteria", "Incl. expired", "Fans", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-4 font-medium">{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                  <td className="px-4 py-4">{l.icon ? `${l.icon} ` : ""}{l.name}</td>
                  <td className="px-4">{crit(l)}</td>
                  <td className="px-4">
                    <span className="rounded px-1.5 py-0.5 text-[12px] font-semibold" style={l.includeExpired ? { background: "#16352c", color: "#2ec4a6" } : { background: "#3a1c20", color: "#f26b6b" }}>
                      {t(l.includeExpired ? "Includes" : "Excludes")}
                    </span>
                  </td>
                  <td className="px-4">{l.count}</td>
                  <td className="px-4">
                    {canEdit ? (
                      <span className="flex gap-5">
                        <button onClick={() => (l.kind === "spend" ? setModal("spend") : (setEditNew(l), setModal("newfans")))} title={t("Edit")}><Pencil className="size-4.5" /></button>
                        <button onClick={() => del(l)} title={t("Delete")}><Trash2 className="size-4.5" /></button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {data && !shown.length ? (
                <tr><td colSpan={5} className="py-14 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {modal === "create" ? (
        <Modal title={<>{t("Create smart list for")} <span style={{ color: "#f28c5b" }}>{cur?.name}</span></>} onClose={() => setModal(null)} footer={<Btn onClick={() => setModal(null)}>{t("Cancel")}</Btn>}>
          <div className="grid grid-cols-2 gap-3 p-4">
            {(
              [
                ["spend", Wallet, "Segment by total spend", "Group fans by their spending power"],
                ["newfans", UserRoundCheck, "New fans", "Group fans by how long it's been since they recently subscribed"],
              ] as const
            ).map(([k, I, title, sub]) => (
              <button
                key={k}
                onClick={() => (k === "spend" ? setModal(spend.length ? "exists" : "spend") : (setEditNew(null), setModal("newfans")))}
                className="rounded-lg border p-5 text-center hover:border-[#2f6bff]"
                style={{ borderColor: "var(--of-line)", background: "var(--of-page)" }}
              >
                <I className="mx-auto size-8" style={{ color: k === "newfans" ? "#2ec4a6" : undefined }} />
                <p className="mt-3 text-[15px] font-semibold">{t(title)}</p>
                <p className="mt-2 text-[13px]" style={{ color: "var(--of-muted)" }}>{t(sub)}</p>
              </button>
            ))}
          </div>
        </Modal>
      ) : null}
      {modal === "exists" ? (
        <Modal title={t("Segment already exists (total spend)")} onClose={() => setModal(null)} footer={<><Btn onClick={() => setModal(null)}>{t("Cancel")}</Btn><Btn primary onClick={() => setModal("spend")}>{t("Edit segment")}</Btn></>}>
          <p className="px-5 py-4 text-[14px]">{t("You can only create one segment of the same type. Do you want to edit the segment?")}</p>
        </Modal>
      ) : null}
      {modal === "spend" ? <SpendModal lists={spend} onBack={() => setModal("create")} onClose={() => setModal(null)} onSave={async (segs, inc) => (await call("segments", { segments: segs, includeExpired: inc })) && setModal(null)} t={t} /> : null}
      {modal === "newfans" ? (
        <NewFansModal
          list={editNew}
          onBack={() => setModal(editNew ? null : "create")}
          onClose={() => setModal(null)}
          onSave={async (name, days) => (await call("save", { list: { ...(editNew ? { id: editNew.id } : {}), kind: "newfans", name, days, includeExpired: false } })) && setModal(null)}
          t={t}
        />
      ) : null}
    </div>
  );
}

function Modal({ title, children, footer, onClose }: { title: React.ReactNode; children: React.ReactNode; footer: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[640px] overflow-hidden rounded-xl" style={{ background: "var(--of-pop)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center gap-2 border-b px-5 py-4 text-[16px] font-semibold" style={{ borderColor: "var(--of-line)" }}>{title}</h3>
        {children}
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--of-line)" }}>{footer}</div>
      </div>
    </div>
  );
}
function Btn({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="h-9 rounded-md border px-4 text-[14px] disabled:opacity-40" style={primary ? { background: BLUE, borderColor: BLUE, color: "#fff" } : { borderColor: "var(--of-line)" }}>
      {children}
    </button>
  );
}

/** « Segmented smart list (total spend) » : tranches nom + $min (inclus) – $max (exclu, vide = sans limite). */
function SpendModal({ lists, onBack, onClose, onSave, t }: { lists: L[]; onBack: () => void; onClose: () => void; onSave: (segs: { id?: number; name: string; min: number; max: number | null }[], includeExpired: boolean) => void; t: (s: string) => string }) {
  const init: Seg[] = lists.length
    ? [...lists].sort((a, b) => (a.min ?? 0) - (b.min ?? 0)).map((l) => ({ id: l.id, name: `${l.icon ? `${l.icon} ` : ""}${l.name}`, min: String(l.min ?? 0), max: l.max != null ? String(l.max) : "" }))
    : [{ name: "+1$", min: "1", max: "100" }];
  const [segs, setSegs] = useState<Seg[]>(init);
  const [inc, setInc] = useState(lists.length ? lists[0].includeExpired : true);
  const set = (i: number, o: Partial<Seg>) => setSegs((s) => s.map((x, j) => (j === i ? { ...x, ...o } : x)));
  const ok = useMemo(() => segs.every((s) => s.name.trim() && s.min !== "" && (s.max === "" || Number(s.max) > Number(s.min))), [segs]);
  return (
    <Modal
      title={<><button onClick={onBack}><ChevronLeft className="size-5" /></button>{t("Segmented smart list (total spend)")}</>}
      onClose={onClose}
      footer={<><Btn onClick={onClose}>{t("Cancel")}</Btn><Btn primary disabled={!ok} onClick={() => onSave(segs.map((s) => ({ id: s.id, name: s.name.trim(), min: Number(s.min), max: s.max === "" ? null : Number(s.max) })), inc)}>{t("Save")}</Btn></>}
    >
      <div className="px-5 py-4">
        <div className="grid grid-cols-[1fr_auto] gap-x-6 text-[14px]">
          <p className="mb-3">{t("Segment name")}</p>
          <p className="mb-3">{t("Spending range")}</p>
        </div>
        {segs.map((s, i) => (
          <div key={i} className="mb-3 flex items-center gap-3">
            <input value={s.name} onChange={(e) => set(i, { name: e.target.value })} className="h-10 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-[14px] outline-none" style={{ borderColor: "var(--of-line)", background: "var(--of-field)" }} />
            <span>$</span>
            <label className="flex h-10 w-32 items-center rounded-md border px-2" style={{ borderColor: "var(--of-line)" }}>
              <input value={s.min} onChange={(e) => set(i, { min: e.target.value.replace(/[^\d.]/g, "") })} className="min-w-0 flex-1 bg-transparent outline-none" />
              <span className="text-[11px]" style={{ color: "var(--of-muted)" }}>{t("inclusive")}</span>
            </label>
            <span>—</span>
            <input value={s.max} onChange={(e) => set(i, { max: e.target.value.replace(/[^\d.]/g, "") })} placeholder={t("No limit")} className="h-10 w-28 rounded-md border bg-transparent px-2 outline-none" style={{ borderColor: "var(--of-line)" }} />
            {i ? (
              <button onClick={() => setSegs((x) => x.filter((_, j) => j !== i))} title={t("Delete")}><Trash2 className="size-5" style={{ color: "#f26b6b" }} /></button>
            ) : <span className="w-5" />}
          </div>
        ))}
        {segs.length < 20 ? (
          <button onClick={() => setSegs((x) => [...x, { name: "", min: x[x.length - 1]?.max || "0", max: "" }])} className="flex items-center gap-1 text-[13px]" style={{ color: BLUE }}>
            <Plus className="size-4" /> {t("Add a segment")}
          </button>
        ) : null}
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" checked={inc} onChange={(e) => setInc(e.target.checked)} /> {t("Include expired fans")}
        </label>
      </div>
    </Modal>
  );
}

function NewFansModal({ list, onBack, onClose, onSave, t }: { list: L | null; onBack: () => void; onClose: () => void; onSave: (name: string, days: number) => void; t: (s: string) => string }) {
  const [name, setName] = useState(list?.name ?? "");
  const [days, setDays] = useState(String(list?.days ?? 0));
  const ok = name.trim() && Number(days) > 0;
  return (
    <Modal
      title={<><button onClick={onBack}><ChevronLeft className="size-5" /></button>{t("New fans")}</>}
      onClose={onClose}
      footer={<><Btn onClick={onClose}>{t("Cancel")}</Btn><Btn primary disabled={!ok} onClick={() => onSave(name.trim(), Number(days))}>{t(list ? "Save" : "Create")}</Btn></>}
    >
      <div className="px-5 py-4 text-[14px]">
        <p>{t("List name")}</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Enter list name")} className="mt-2 h-11 w-full rounded-md border bg-transparent px-3 outline-none" style={{ borderColor: "var(--of-line)" }} />
        <p className="mt-5">{t("Subscribed for less than")}</p>
        <label className="mt-2 flex h-11 items-center rounded-md border px-3" style={{ borderColor: "var(--of-line)" }}>
          <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 4))} className="min-w-0 flex-1 bg-transparent outline-none" />
          {t("day(s)")}
        </label>
      </div>
    </Modal>
  );
}
