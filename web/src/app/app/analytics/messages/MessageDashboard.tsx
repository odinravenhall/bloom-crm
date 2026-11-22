"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, CornerUpRight, Download, Image as ImageIcon, Info, MessageSquareText, Mic, RefreshCw, Search, Undo2, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn } from "@/lib/fmt";
import { useT } from "@/lib/i18n";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";
import { DateRange } from "../creators/CreatorReports";

// Analytics → Message dashboard (OnlyFans) : copie de la page d'Infloww. Chaque message envoyé aux fans (messages
// directs), avec qui l'a envoyé, sur quelle créatrice, à qui, en combien de temps, prix, achat, statut ;
// « aller à la conversation » et « retirer le message » (unsend). Source : /api/sent (journal des messages de Bloom).
type Row = {
  id: string; creatorId: string; fanId: string; fan: string; at: number; text: string | null; medias: number; price: number; paid: boolean | null;
  kind: string; by: string | null; replyMs: number | null; replyTo: string | null; deleted: boolean; script: boolean;
};
type Res = {
  rows: Row[]; total: number; page: number; pages: number;
  bySender: { key: string; kind: string; name: string | null }[];
  recipients?: { key: string; name: string; fanId: string; creatorId: string }[];
};
type F = { q: string; sender: string; creator: string; fan: string; pmin: string; pmax: string; purchased: string; status: string; type: string };
const EMPTY: F = { q: "", sender: "", creator: "", fan: "", pmin: "", pmax: "", purchased: "", status: "", type: "" };

const BLUE = "#2f6bff";
const DAY = 864e5;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(`${s}T00:00:00`);
const addDays = (s: string, n: number) => iso(new Date(new Date(`${s}T12:00:00`).getTime() + n * DAY));
const SIZE = 50;
const KIND: Record<string, string> = { ai: "AI", bloom: "Employee", employee: "Employee", auto: "Automation", script: "Automation", creator: "Creator" };

export function MessageDashboard() {
  const { t, lang } = useT();
  const loc = lang === "en" ? "en-US" : lang;
  const { creators } = useCreators();
  const today = iso(new Date());
  const [range, setRange] = useState({ from: today, to: today });
  const [draft, setDraft] = useState<F>(EMPTY);
  const [f, setF] = useState<F>(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  const [fresh, setFresh] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [senders, setSenders] = useState<{ key: string; label: string }[]>([]);
  const [recipients, setRecipients] = useState<{ key: string; name: string; fanId: string }[]>([]);

  const qs = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams({ start: String(parse(range.from).getTime()), end: String(parse(addDays(range.to, 1)).getTime()), size: String(SIZE), status: f.status || "all" });
      if (f.q) p.set("q", f.q);
      if (f.sender) p.set("sender", f.sender);
      if (f.creator) p.set("model", f.creator);
      if (f.fan) p.set("fan", f.fan);
      if (f.pmin) p.set("pmin", f.pmin);
      if (f.pmax) p.set("pmax", f.pmax);
      if (f.purchased) p.set("purchased", f.purchased);
      if (f.type) p.set("type", f.type);
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p.toString();
    },
    [range, f],
  );
  const load = useCallback(() => {
    setBusy(true);
    api<Res>("GET", `/api/sent?${qs({ page: String(page), recipients: "1" })}`)
      .then((r) => {
        setData(r);
        setUpdated(Date.now());
        setFresh(0);
        if (r.recipients) setRecipients(r.recipients);
        setSenders(
          r.bySender.map((s) => ({ key: s.key, label: s.key === "ai" ? "AI" : s.key === "auto" ? t("Automation") : s.key === "creator" ? t("Creator") : s.key === "team" ? t("Employees") : (s.name ?? s.key) })),
        );
      })
      .catch((e) => toast((e as Error).message, "err"))
      .finally(() => setBusy(false));
  }, [qs, page, t]);
  useEffect(() => {
    load();
  }, [load]);
  // « N new messages » : on regarde toutes les 30 s s'il y a de nouveaux messages pour ces filtres.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible" || !data) return;
      api<Res>("GET", `/api/sent?${qs({ page: "1", size: "10" })}`)
        .then((r) => setFresh(Math.max(0, r.total - data.total)))
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [qs, data]);

  const cr = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);
  const set = (k: keyof F, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const search = () => (setPage(1), setF(draft));
  const reset = () => (setDraft(EMPTY), setF(EMPTY), setPage(1));
  const unsend = async (m: Row) => {
    if (!window.confirm(t("Unsend this message? The fan will no longer see it."))) return;
    try {
      await api("POST", "/api/sent/delete", { id: m.id });
      toast(t("Message unsent"), "ok");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const when = (at: number) => {
    const d = new Date(at);
    return [d.toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" }), d.toLocaleDateString(loc, { month: "short", day: "numeric", year: "numeric" })];
  };
  const dur = (ms: number | null) => (ms == null ? "--" : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`);
  const conv = (m: Row) => `/app/messagerie?c=${encodeURIComponent(`${m.creatorId}~${m.fanId}`)}`;

  const exportCsv = (all: boolean) => {
    const p = new URLSearchParams(all ? { start: String(parse(range.from).getTime()), end: String(parse(addDays(range.to, 1)).getTime()), status: "all" } : Object.fromEntries(new URLSearchParams(qs())));
    p.set("size", "200");
    const esc = (x: string) => (/[",;\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
    (async () => {
      const lines = [["Sender", "Creator", "Fan message", "Message", "Sent time", "Reply time (s)", "Price", "Purchased", "Source", "Status", "Sent to", "Script"]];
      for (let pg = 1; pg <= 50; pg++) {
        p.set("page", String(pg));
        const r = await api<Res>("GET", `/api/sent?${p}`);
        for (const m of r.rows)
          lines.push([m.by || KIND[m.kind] || m.kind, cr.get(m.creatorId)?.name || "", m.replyTo || "", m.text || "", new Date(m.at).toISOString(), m.replyMs == null ? "" : String(Math.round(m.replyMs / 1000)), m.price ? String(m.price) : "", m.price ? (m.paid ? "Paid" : "Unpaid") : "", KIND[m.kind] || m.kind, m.deleted ? "Unsent" : "Sent", `${m.fan} (u${m.fanId})`, m.script ? "Script" : ""]);
        if (pg >= r.pages) break;
      }
      const blob = new Blob(["﻿" + lines.map((l) => l.map(esc).join(",")).join("\n")], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `message-dashboard-${range.from}-${range.to}.csv`;
      a.click();
    })().catch((e) => toast((e as Error).message, "err"));
    setShowExport(false);
  };

  return (
    <div className="min-h-full p-4 md:p-5" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--of-line)" }}>
        <h1 className="flex items-center gap-3 text-[17px] font-semibold">
          {t("Message dashboard")}
          <span className="text-[13px] font-normal" style={{ color: "var(--of-muted)" }}>UTC+01:00</span>
          <Info className="size-4" style={{ color: "var(--of-muted)" }} />
        </h1>
        <span className="flex items-center gap-1.5 text-[14px]" style={{ color: BLUE }}>
          <BookOpen className="size-4" /> {t("Learn")}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-md px-3 py-2.5 text-[14px]" style={{ background: "var(--of-side)" }}>
        <Info className="size-4 shrink-0" />
        {t("Message dashboard currently displays data for direct messages only")}
      </div>

      {/* Filtres */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex h-9 w-full max-w-[320px] items-center gap-2 rounded-md border px-3" style={{ borderColor: "var(--of-line)" }}>
          <input value={draft.q} onChange={(e) => set("q", e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder={t("Search for Creator message")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          <Search className="size-4" style={{ color: "var(--of-muted)" }} />
        </label>
        <DateRange range={range} setRange={(r) => (setRange(r), setPage(1))} lang={loc} t={t} />
      </div>
      <div className="mt-4 grid max-w-[1300px] grid-cols-1 items-center gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2 xl:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_auto]">
        <span>{t("Sender")}:</span>
        <Pick value={draft.sender} set={(v) => set("sender", v)} t={t} options={[["", t("All")], ...senders.map((s) => [s.key, s.label] as [string, string])]} />
        <span>{t("Creator")}:</span>
        <Pick value={draft.creator} set={(v) => set("creator", v)} t={t} options={[["", t("All")], ...creators.map((c) => [c.id, c.name] as [string, string])]} />
        <span>{t("Sent to")}:</span>
        <Pick value={draft.fan} set={(v) => set("fan", v)} t={t} placeholder={t("Select recipient")} options={[["", t("All")], ...recipients.map((r) => [r.key, `${r.name} (u${r.fanId})`] as [string, string])]} search />
        <span>{t("Price")}:</span>
        <span className="flex items-center gap-2">
          <Money value={draft.pmin} set={(v) => set("pmin", v)} /> - <Money value={draft.pmax} set={(v) => set("pmax", v)} />
        </span>
        <span>{t("Purchased")}:</span>
        <Pick value={draft.purchased} set={(v) => set("purchased", v)} t={t} options={[["", t("All")], ["paid", t("Paid")], ["unpaid", t("Unpaid")]]} />
        <span>{t("Status")}:</span>
        <Pick value={draft.status} set={(v) => set("status", v)} t={t} options={[["", t("All")], ["sent", t("Sent")], ["unsent", t("Unsent")]]} />
        <span>{t("Type")}:</span>
        <Pick value={draft.type} set={(v) => set("type", v)} t={t} options={[["", t("All")], ["script", t("With Script")], ["noscript", t("No Script")]]} />
        <span className="flex gap-2 xl:col-span-2">
          <button onClick={reset} className="h-9 rounded-md border px-4" style={{ borderColor: "var(--of-line)" }}>
            {t("Reset")}
          </button>
          <button onClick={search} className="h-9 rounded-md px-4 text-white" style={{ background: BLUE }}>
            {t("Search")}
          </button>
        </span>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <div className="text-right text-[12px]">
          <button onClick={load} style={{ color: BLUE }} className="text-[13px]">
            {fresh ? `${fresh} ${t("new messages")}` : t("No new messages")}
          </button>
          {updated ? (
            <p style={{ color: "var(--of-muted)" }}>
              {t("Last updated")}: {new Date(updated).toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" })} {t("on")} {new Date(updated).toLocaleDateString(loc, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          ) : null}
        </div>
        <button onClick={load} title={t("Refresh")} className="grid size-9 place-items-center rounded-md border" style={{ borderColor: "var(--of-line)" }}>
          <RefreshCw className={cn("size-4", busy && "animate-spin")} />
        </button>
        <button onClick={() => setShowExport(true)} title={t("Export")} className="grid size-9 place-items-center rounded-md border" style={{ borderColor: "var(--of-line)" }}>
          <Download className="size-4" />
        </button>
      </div>

      {/* Tableau */}
      <div className="of-scroll mt-3 overflow-x-auto rounded-md">
        <table className="w-full min-w-[1500px] text-[14px]">
          <thead>
            <tr className="text-left" style={{ background: "var(--of-line)" }}>
              {[
                ["Sender", 120],
                ["Creator", 180],
                ["Message", 500, "The fan's message (grey) and the reply sent"],
                ["Sent time", 130],
                ["Reply time", 110, "Time between the fan's message and this reply"],
                ["Price", 100, "PPV price"],
                ["Purchased", 100],
                ["Source", 100],
                ["Status", 100],
                ["Sent to", 180],
                ["Actions", 90],
              ].map(([h, w, tip]) => (
                <th key={h as string} className="px-2 py-3 font-medium" style={{ width: w as number }}>
                  <span className="flex items-center gap-1">
                    {t(h as string)}
                    {tip ? (
                      <span title={t(tip as string)}>
                        <Info className="size-3.5" style={{ color: "var(--of-muted)" }} />
                      </span>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((m) => {
              const c = cr.get(m.creatorId);
              const [h, d] = when(m.at);
              return (
                <tr key={m.id} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                  <td className="px-2 py-3">{m.by || (m.kind === "ai" ? "AI" : t(KIND[m.kind] || m.kind))}</td>
                  <td className="px-2 py-3">
                    <span className="flex items-center gap-2.5">
                      <Avatar src={c?.avatar} name={c?.name} size="size-8" />
                      <span className="truncate">{c?.name ?? "—"}</span>
                    </span>
                  </td>
                  <td className="border-l px-3 py-3" style={{ borderColor: "var(--of-line)" }}>
                    <p className="line-clamp-2 text-[13px]" style={{ color: "var(--of-muted)" }}>{m.replyTo || "--"}</p>
                    <div className="flex items-end justify-between gap-3">
                      <p className="flex min-w-0 items-start gap-1.5 font-semibold">
                        <CornerUpRight className="mt-1 size-3.5 shrink-0" style={{ color: "var(--of-muted)" }} />
                        <span className={cn("line-clamp-2 break-words", m.deleted && "line-through opacity-60")}>{m.text || (m.medias ? "" : "--")}</span>
                      </p>
                      <span className="flex shrink-0 items-center gap-1 text-[12px]" style={{ color: "var(--of-muted)" }}>
                        {m.medias ? (
                          <>
                            {m.medias === 1 && /audio|vocal/i.test(m.text || "") ? <Mic className="size-3.5" /> : <ImageIcon className="size-3.5" />} {m.medias}
                          </>
                        ) : null}
                        {m.script ? <span>{m.medias ? " · " : "· "}Script</span> : null}
                      </span>
                    </div>
                  </td>
                  <td className="border-l px-2 py-3 leading-tight whitespace-nowrap" style={{ borderColor: "var(--of-line)" }}>
                    {h}
                    <br />
                    <span style={{ color: "var(--of-muted)" }}>{d}</span>
                  </td>
                  <td className="border-l px-2 py-3" style={{ borderColor: "var(--of-line)" }}>{dur(m.replyMs)}</td>
                  <td className="border-l px-2 py-3" style={{ borderColor: "var(--of-line)" }}>{m.price ? `$${m.price.toFixed(2)}` : "--"}</td>
                  <td className="border-l px-2 py-3" style={{ borderColor: "var(--of-line)" }}>{m.price ? <span style={{ color: m.paid ? "#2ec4a6" : undefined }}>{t(m.paid ? "Paid" : "Unpaid")}</span> : "--"}</td>
                  <td className="border-l px-2 py-3" style={{ borderColor: "var(--of-line)" }}>{m.kind === "ai" ? "AI" : t(KIND[m.kind] || m.kind)}</td>
                  <td className="border-l px-2 py-3" style={{ borderColor: "var(--of-line)" }}>{t(m.deleted ? "Unsent" : "Sent")}</td>
                  <td className="border-l px-2 py-3" style={{ borderColor: "var(--of-line)" }}>
                    <Link href={conv(m)} className="line-clamp-1 max-w-[170px]" style={{ color: BLUE }} title={`${m.fan} (u${m.fanId})`}>
                      {m.fan} (u{m.fanId})
                    </Link>
                  </td>
                  <td className="px-2 py-3">
                    <span className="flex items-center gap-3">
                      <Link href={conv(m)} title={t("Go to the conversation")} style={{ color: BLUE }}>
                        <MessageSquareText className="size-4.5" />
                      </Link>
                      <span className="h-4 w-px" style={{ background: "var(--of-line)" }} />
                      <button onClick={() => unsend(m)} disabled={m.deleted} title={t("Unsend")} style={{ color: BLUE }} className="disabled:opacity-30">
                        <Undo2 className="size-4.5" />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {data && !data.rows.length ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center" style={{ color: "var(--of-muted)" }}>
                  {t("No data available")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]" style={{ color: "var(--of-muted)" }}>
        <span className="flex items-center gap-1.5">
          <Info className="size-3.5" /> {t("Report data only tracks messages sent through Substy and Bloom")}
        </span>
        {data ? <Pager page={data.page} pages={data.pages} set={setPage} /> : null}
      </div>

      {showExport ? <ExportModal t={t} loc={loc} range={range} onClose={() => setShowExport(false)} onExport={exportCsv} /> : null}
    </div>
  );
}

function Pick({ value, set, options, t, placeholder, search }: { value: string; set: (v: string) => void; options: [string, string][]; t: (s: string) => string; placeholder?: string; search?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [open]);
  const cur = options.find((o) => o[0] === value);
  return (
    <div ref={box} className="relative w-full xl:w-[210px]">
      <button onClick={() => setOpen(!open)} className="flex h-9 w-full items-center justify-between rounded-md border px-3 text-left" style={{ borderColor: open ? BLUE : "var(--of-line)", background: "var(--of-field)" }}>
        <span className="truncate" style={{ color: value || !placeholder ? undefined : "var(--of-muted)" }}>{value ? cur?.[1] : (placeholder ?? cur?.[1])}</span>
        <ChevronDown className="size-4 shrink-0" style={{ color: "var(--of-muted)" }} />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full min-w-[210px] rounded-md border p-1 shadow-xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
          {search ? <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search")} className="mb-1 h-8 w-full rounded px-2 text-[13px] outline-none" style={{ background: "var(--of-page)" }} /> : null}
          <div className="of-scroll max-h-64 overflow-y-auto">
            {options
              .filter((o) => !q || o[1].toLowerCase().includes(q.toLowerCase()))
              .map(([k, l]) => (
                <button key={k} onClick={() => (set(k), setOpen(false))} className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[13px]" style={value === k ? { background: "var(--of-line)" } : undefined}>
                  <span className="truncate">{l}</span>
                  {value === k ? <Check className="size-3.5 shrink-0" style={{ color: BLUE }} /> : null}
                </button>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Money({ value, set }: { value: string; set: (v: string) => void }) {
  return (
    <label className="flex h-9 w-24 items-center gap-1 rounded-md border px-2" style={{ borderColor: "var(--of-line)", background: "var(--of-field)" }}>
      <span style={{ color: "var(--of-muted)" }}>$</span>
      <input value={value} onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className="min-w-0 flex-1 bg-transparent outline-none" />
    </label>
  );
}

function Pager({ page, pages, set }: { page: number; pages: number; set: (p: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) if (i <= 5 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
  const list = nums.flatMap((n, i) => (i && typeof n === "number" && typeof nums[i - 1] === "number" && n - (nums[i - 1] as number) > 1 ? ["…" as const, n] : [n]));
  return (
    <span className="flex items-center gap-1" style={{ color: "var(--of-text)" }}>
      <button onClick={() => set(Math.max(1, page - 1))} disabled={page <= 1} className="grid size-7 place-items-center disabled:opacity-30">
        <ChevronLeft className="size-4" />
      </button>
      {list.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-1">•••</span>
        ) : (
          <button key={n} onClick={() => set(n)} className="grid h-7 min-w-7 place-items-center rounded-md border px-1.5" style={n === page ? { borderColor: BLUE, color: BLUE } : { borderColor: "transparent" }}>
            {n}
          </button>
        ),
      )}
      <button onClick={() => set(Math.min(pages, page + 1))} disabled={page >= pages} className="grid size-7 place-items-center disabled:opacity-30">
        <ChevronRight className="size-4" />
      </button>
    </span>
  );
}

function ExportModal({ t, loc, range, onClose, onExport }: { t: (s: string) => string; loc: string; range: { from: string; to: string }; onClose: () => void; onExport: (all: boolean) => void }) {
  const [all, setAll] = useState(true);
  const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(loc, { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[600px] rounded-2xl p-6" style={{ background: "var(--of-card)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="text-[22px] font-semibold">{t("Export message dashboard report")}</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--of-line)" }}>
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-5 text-[15px]" style={{ color: "var(--of-muted)" }}>{t("Report period")}</p>
        <p className="mt-1 text-[15px] font-semibold">
          {fmt(range.from)} 12:00am - {fmt(addDays(range.to, 1))} 12:00am <span className="font-normal" style={{ color: "var(--of-muted)" }}>(UTC+01:00)</span>
        </p>
        <p className="mt-5 text-[15px]" style={{ color: "var(--of-muted)" }}>{t("Data type")}</p>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[15px]">
          <input type="radio" checked={all} onChange={() => setAll(true)} style={{ accentColor: "#f28c5b" }} /> {t("All data")}
        </label>
        <label className="mt-2 flex cursor-pointer items-start gap-2 text-[15px]">
          <input type="radio" checked={!all} onChange={() => setAll(false)} className="mt-1" style={{ accentColor: "#f28c5b" }} />
          <span>
            {t("Selected fields")}
            <br />
            <span className="text-[13px]" style={{ color: "var(--of-muted)" }}>{t("As selected in filter")}</span>
          </span>
        </label>
        <p className="mt-5 text-[13px]" style={{ color: "var(--of-muted)" }}>{t("The report is downloaded right away as a CSV file (Excel, Google Sheets).")}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[15px]" style={{ background: "var(--of-line)" }}>
            {t("Cancel")}
          </button>
          <button onClick={() => onExport(all)} className="rounded-lg px-4 py-2 text-[15px] text-white" style={{ background: "#f28c5b" }}>
            {t("Export")}
          </button>
        </div>
      </div>
    </div>
  );
}
