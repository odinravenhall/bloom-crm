"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, DollarSign, Eye, FileText, Lock, X } from "lucide-react";
import { api, toast } from "@/rv/lib/client";
import { ago, cn, money } from "@/rv/lib/fmt";

type Step = { id: string; index: number; name: string; text: string; price: number; medias: number; sent: boolean; bought: boolean };
type Script = { id: string; name: string; total: number; sent: number; bought: number; lastAt: string | null; status: "active" | "paused" | "done"; steps: Step[] };
type Resp = { ai: boolean; sales: { amount: number; count: number }; scripts: Script[] };

/** Prévient le reste de la messagerie (bouton IA du chat) quand l'IA change sur un fan. */
export const AI_EVENT = "bloom-ai";

const STATUS: Record<Script["status"], [string, string]> = {
  active: ["• EN COURS", "bg-primary/20 text-primary-soft"],
  paused: ["EN PAUSE", "bg-amber-500/20 text-amber-300"],
  done: ["TERMINÉ", "bg-emerald-500/20 text-emerald-300"],
};

/** Bloc « Substy » de la fiche du fan : l'IA (on / off), ce qu'elle a vendu à ce fan, et les scripts de Substy envoyés. */
export function SubstyCard({ convId }: { convId: string }) {
  const [d, setD] = useState<Resp | null>(null);
  const [open, setOpen] = useState<Script | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<Resp>("GET", `/api/conversations/${convId}/substy`)
      .then(setD)
      .catch(() => setD(null));
  }, [convId]);
  useEffect(() => {
    setD(null);
    load();
  }, [load]);
  // Le bouton IA du chat a changé l'état : on suit.
  useEffect(() => {
    const on = (e: Event) => {
      const x = (e as CustomEvent<{ id: string; on: boolean }>).detail;
      if (x?.id === convId) setD((v) => v && { ...v, ai: x.on });
    };
    window.addEventListener(AI_EVENT, on);
    return () => window.removeEventListener(AI_EVENT, on);
  }, [convId]);

  const toggle = async () => {
    if (!d || busy) return;
    const on = !d.ai;
    setBusy(true);
    setD({ ...d, ai: on });
    try {
      await api("POST", `/api/conversations/${convId}/action`, { action: "ai", on });
      window.dispatchEvent(new CustomEvent(AI_EVENT, { detail: { id: convId, on } }));
      toast(on ? "IA Substy rallumée sur ce fan" : "IA Substy coupée : tu réponds à la main");
    } catch (e) {
      setD((v) => v && { ...v, ai: !on });
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card/70 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-lg bg-primary text-[11px] font-extrabold text-white">S</span>
        <p className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">Substy</p>
      </div>
      {!d ? (
        <p className="py-2 text-xs text-muted">Chargement…</p>
      ) : (
        <div className="flex flex-col gap-2">
          <button onClick={toggle} disabled={busy} className="flex items-center gap-2.5 rounded-xl bg-card-2/60 px-3 py-2.5 text-left">
            <Bot className="size-5 shrink-0 text-primary-soft" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">IA Substy</span>
              <span className="block text-[11px] text-muted">{d.ai ? "Le bot répond automatiquement" : "Coupée : l’équipe répond à la main"}</span>
            </span>
            <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", d.ai ? "bg-primary" : "bg-line")}>
              <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", d.ai ? "left-[22px]" : "left-0.5")} />
            </span>
          </button>
          <div className="flex items-center gap-2.5 rounded-xl bg-card-2/60 px-3 py-2.5">
            <DollarSign className="size-4 shrink-0 text-muted" />
            <span className="flex-1 text-sm text-muted">Ventes Substy</span>
            <b className="text-sm text-primary-soft tabular-nums" title={`${d.sales.count} achat(s) après un message de l’IA`}>
              {money(d.sales.amount)}
            </b>
          </div>
          <div className="rounded-xl bg-card-2/60 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <FileText className="size-4 shrink-0 text-muted" />
              <span className="flex-1 text-sm text-muted">
                Scripts envoyés {d.scripts.length ? <span className="text-[11px]">· clique pour le détail</span> : null}
              </span>
              <b className="text-sm tabular-nums">{d.scripts.length}</b>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {d.scripts.map((s) => {
                const [label, tone] = STATUS[s.status];
                return (
                  <button key={s.id} onClick={() => setOpen(s)} className={cn("rounded-xl border px-3 py-2 text-left hover:border-primary/50", s.status === "active" ? "border-primary/40 bg-primary/5" : "bg-card/60")}>
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-xs leading-snug font-extrabold break-words uppercase">{s.name}</span>
                      <Eye className="mt-0.5 size-3.5 shrink-0 text-muted" />
                    </span>
                    <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", tone)}>{label}</span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${s.total ? (s.sent / s.total) * 100 : 0}%` }} />
                      </span>
                      <span className="text-[11px] font-bold tabular-nums">
                        {s.sent}/{s.total}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] text-muted">
                      {s.lastAt ? `dernière étape ${ago(s.lastAt)}` : "envoyé par Substy"}
                      {s.bought ? ` · ${s.bought} acheté${s.bought > 1 ? "s" : ""}` : ""}
                    </span>
                  </button>
                );
              })}
              {!d.scripts.length ? <p className="text-[11px] text-muted">Aucun script de Substy envoyé à ce fan.</p> : null}
            </div>
          </div>
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="flex max-h-[85vh] w-[min(560px,100%)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
            <header className="flex items-center gap-2 border-b px-4 py-3">
              <p className="min-w-0 flex-1 truncate font-extrabold uppercase">{open.name}</p>
              <span className="text-xs text-muted tabular-nums">
                {open.sent}/{open.total} envoyées
              </span>
              <button onClick={() => setOpen(null)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-card-2">
                <X className="size-4" />
              </button>
            </header>
            <ol className="scroll-thin flex flex-col gap-2 overflow-y-auto p-4">
              {open.steps.map((st) => (
                <li key={st.id} className={cn("rounded-xl border p-3", !st.sent && "opacity-55")}>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={cn("grid size-6 place-items-center rounded-full font-bold", st.bought ? "bg-emerald-500 text-white" : st.sent ? "bg-primary text-white" : "bg-card-2 text-muted")}>{st.index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{st.name}</span>
                    {st.price ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 font-bold text-amber-300">
                        <Lock className="size-3" /> {money(st.price)}
                      </span>
                    ) : null}
                    <span className={cn("font-semibold", st.bought ? "text-emerald-300" : st.sent ? "text-primary-soft" : "text-muted")}>{st.bought ? "acheté" : st.sent ? "envoyé" : "pas encore"}</span>
                  </div>
                  {st.text ? <p className="mt-1.5 text-sm whitespace-pre-wrap">{st.text}</p> : st.medias ? <p className="mt-1.5 text-xs text-muted italic">Légende écrite par l’IA</p> : null}
                  {st.medias ? <p className="mt-1 text-[11px] text-muted">{st.medias} média{st.medias > 1 ? "s" : ""}</p> : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
