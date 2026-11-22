"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, LayoutGrid, ListFilter, Mail, Percent, ScrollText, Search, StickyNote, Waypoints, X } from "lucide-react";
import { mediaThumb } from "@/rv/lib/client";
import type { Lib, LibScript, LibSequence } from "@/rv/inbox/scriptTypes";

// Scripts de Messages Pro (Infloww) : onglets « Tag » (scripts rangés par tag) et « Sequence » (étapes dans l'ordre,
// avec « Sent … by … » quand l'étape a déjà été envoyée à ce fan, note de l'étape, médias et prix du pack).
const BLUE = "#2f6bff";

export function ProScripts({ lib, onPick, onClose, t }: { lib: Lib | null; onPick: (s: LibScript) => void; onClose: () => void; t: (s: string) => string }) {
  const [mode, setMode] = useState<"tag" | "seq">("tag");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [tag, setTag] = useState<string>("__all");
  const [seq, setSeq] = useState<number | null>(null);
  const scripts = lib?.scripts ?? [];
  const byId = useMemo(() => new Map(scripts.map((s) => [s.id, s])), [scripts]);
  const tags = useMemo(() => {
    const m = new Map<string, LibScript[]>();
    for (const s of scripts) for (const tg of s.tags.length ? s.tags : []) m.set(tg, [...(m.get(tg) ?? []), s]);
    return [...m.entries()];
  }, [scripts]);
  const seqs = (lib?.sequences ?? []).filter((x) => x.steps.length);
  useEffect(() => {
    if (seq == null && seqs.length) setSeq(seqs[0].id);
  }, [seqs, seq]);
  const match = (s: LibScript) => !q || `${s.title} ${s.content}`.toLowerCase().includes(q.toLowerCase());
  const stat = (list: LibScript[]) => {
    const uses = list.reduce((a, s) => a + s.uses, 0);
    const sales = list.reduce((a, s) => a + s.sales, 0);
    return { n: list.length, rate: uses ? (sales / uses) * 100 : 0, rev: list.reduce((a, s) => a + s.revenue, 0) / 100 };
  };
  const tagList = tag === "__all" ? scripts : (tags.find(([k]) => k === tag)?.[1] ?? []);
  const cur = seqs.find((x) => x.id === seq) ?? null;

  return (
    <div className="absolute inset-x-0 bottom-full z-40 mb-1 flex h-[620px] max-h-[75vh] flex-col overflow-hidden rounded-lg border shadow-2xl" style={{ background: "var(--pro-pop)", borderColor: "var(--pro-line)" }}>
      <div className="flex items-center gap-6 border-b px-4" style={{ borderColor: "var(--pro-line)" }}>
        {(
          [
            ["tag", "Tag", ListFilter],
            ["seq", "Sequence", Waypoints],
          ] as const
        ).map(([k, l, I]) => (
          <button key={k} onClick={() => setMode(k)} className="flex items-center gap-2 border-b-2 py-3 text-[16px] font-semibold" style={mode === k ? { borderColor: BLUE, color: BLUE } : { borderColor: "transparent" }}>
            <I className="size-5" /> {t(l)}
          </button>
        ))}
        <label className="ml-2 flex h-9 flex-1 items-center gap-2 rounded-md px-3" style={{ background: "var(--pro-page)" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search script names and text")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          <Search className="size-4" style={{ color: "var(--of-muted)" }} />
        </label>
        <span className="flex items-center gap-2 text-[13px]">
          {t("Expanded view")}
          <button role="switch" aria-checked={expanded} onClick={() => setExpanded(!expanded)} className="relative h-6 w-11 rounded-full" style={{ background: expanded ? BLUE : "#555" }}>
            <span className="absolute top-0.5 size-5 rounded-full bg-white transition-all" style={{ left: expanded ? 22 : 2 }} />
          </button>
        </span>
        <a href="/app/scripts" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 border-l pl-4 text-[14px]" style={{ color: BLUE, borderColor: "var(--pro-line)" }}>
          <LayoutGrid className="size-4" /> {t("Manage")}
        </a>
        <button onClick={onClose} title={t("Close")}>
          <X className="size-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* Colonne de gauche */}
        <div className="of-scroll w-[240px] shrink-0 overflow-y-auto border-r" style={{ borderColor: "var(--pro-line)" }}>
          <p className="px-4 py-3 text-[13px] font-semibold">{t("Custom")}</p>
          {mode === "tag" ? (
            <>
              <Group on={tag === "__all"} title={t("All scripts")} s={stat(scripts)} onClick={() => setTag("__all")} />
              {tags.map(([k, list]) => (
                <Group key={k} on={tag === k} title={k} s={stat(list)} onClick={() => setTag(k)} />
              ))}
            </>
          ) : (
            seqs.map((x) => (
              <Group key={x.id} on={seq === x.id} title={x.title} s={{ n: x.steps.length, rate: x.ppvSent ? (x.sales / x.ppvSent) * 100 : 0, rev: x.revenue / 100 }} onClick={() => setSeq(x.id)} />
            ))
          )}
          {!lib ? <p className="px-4 py-3 text-[13px]" style={{ color: "var(--of-muted)" }}>{t("Loading…")}</p> : null}
        </div>
        {/* Scripts */}
        <div className="of-scroll min-w-0 flex-1 overflow-y-auto p-2">
          {mode === "tag"
            ? tagList.filter(match).map((s) => <ScriptRow key={s.id} s={s} label={s.title} expanded={expanded} onPick={onPick} t={t} />)
            : cur
              ? cur.steps
                  .map((id, i) => [i, byId.get(id)] as const)
                  .filter(([, s]) => s && match(s))
                  .map(([i, s]) => <ScriptRow key={`${cur.id}-${i}`} s={s!} label={String(i + 1).padStart(2, "0")} expanded={expanded} onPick={onPick} t={t} seq />)
              : null}
          {lib && ((mode === "tag" && !tagList.length) || (mode === "seq" && !cur)) ? <p className="py-10 text-center text-[14px]" style={{ color: "var(--of-muted)" }}>{t("No scripts yet")}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Group({ on, title, s, onClick }: { on: boolean; title: string; s: { n: number; rate: number; rev: number }; onClick: () => void }) {
  return (
    <button onClick={onClick} className="block w-full border-l-4 px-3 py-2.5 text-left" style={on ? { background: "var(--pro-on)", borderColor: BLUE } : { borderColor: "transparent" }}>
      <p className="truncate text-[15px] font-semibold">{title}</p>
      <p className="mt-1 flex justify-between text-[12px]" style={{ color: "var(--of-muted)" }}>
        <span className="flex items-center gap-1"><ScrollText className="size-3.5" /> {s.n}</span>
        <span className="flex items-center gap-1"><Percent className="size-3.5" /> {s.rate.toFixed(2).replace(/\.00$/, "")}%</span>
        <span className="flex items-center gap-1"><Database className="size-3.5" /> ${Math.round(s.rev)}</span>
      </p>
    </button>
  );
}

function ScriptRow({ s, label, expanded, onPick, t, seq }: { s: LibScript; label: string; expanded: boolean; onPick: (s: LibScript) => void; t: (s: string) => string; seq?: boolean }) {
  const sent = !!s.usedWithFan;
  return (
    <div className="relative">
      {seq ? <span className="absolute top-full left-[38px] z-0 h-3 w-px" style={{ background: "var(--of-muted)" }} /> : null}
      <button
        onClick={() => onPick(s)}
        className="relative mb-3 flex w-full gap-4 rounded-lg border px-4 py-3 text-left hover:border-[#2f6bff]"
        style={{ background: "var(--pro-panel)", borderColor: "var(--pro-line)", opacity: sent ? 0.75 : 1 }}
      >
        {sent ? (
          <span className="absolute -top-2.5 right-2 flex items-center gap-1 rounded-full border px-2 text-[11px]" style={{ background: "var(--pro-pop)", borderColor: "var(--pro-line)" }}>
            <Mail className="size-3" /> {t("Sent")} {new Date(s.usedWithFan!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} {s.usedBy ? `${t("by")} ${s.usedBy}` : ""}
          </span>
        ) : null}
        <span className="w-[70px] shrink-0 truncate border-r pr-3 text-[14px]" style={{ borderColor: "var(--pro-line)", color: "var(--of-muted)" }}>{label}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[15px] font-semibold ${expanded ? "" : "truncate"}`}>{s.content || s.title}</span>
          {expanded && s.medias.length ? (
            <span className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md p-1.5" style={{ background: "var(--pro-page)" }}>
              {s.medias.slice(0, 10).map((m) => (
                <span key={m.id} className="pro-media relative size-[72px] overflow-hidden rounded-md" style={{ background: "#333" }}>
                  {mediaThumb(m) ? <img src={mediaThumb(m)} alt="" className="size-full object-cover" /> : null}
                  {s.price ? <span className="absolute top-1 left-1 rounded px-1 text-[10px] font-bold text-white" style={{ background: "#e06b6b" }}>🔒 ${(s.price / 100).toFixed(2)}</span> : null}
                </span>
              ))}
              {s.price ? <span className="ml-2 text-[13px]" style={{ color: "#f7a14a" }}>$ {+(s.price / 100).toFixed(2)}</span> : null}
            </span>
          ) : null}
          {expanded && s.note ? (
            <span className="mt-2 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] uppercase" style={{ background: "var(--pro-page)", color: "var(--of-muted)" }}>
              <StickyNote className="size-3.5" /> {s.note}
            </span>
          ) : null}
        </span>
      </button>
    </div>
  );
}

export type { LibSequence };
