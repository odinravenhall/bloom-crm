"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/fmt";
import type { FanScript, ScriptStep } from "@/lib/types";
import { Pill, btnCls } from "@/components/ui";
import { Steps } from "../scripts/Steps";

/** Scripts du fan ouvert : où il en est dans chaque séquence, et l'étape suivante à préparer en un clic. */
export function ScriptPicker({ creatorId, fanId, fanName, onClose, onPick }: { creatorId: string; fanId: string; fanName: string; onClose: () => void; onPick: (s: ScriptStep) => void }) {
  const [list, setList] = useState<FanScript[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<FanScript | null>(null);
  useEffect(() => {
    api<FanScript[]>("GET", `/api/fan-scripts?creatorId=${encodeURIComponent(creatorId)}&fanId=${encodeURIComponent(fanId)}`)
      .then((l) => setList(l.filter((s) => s.enabled)))
      .catch((e) => setErr((e as Error).message));
  }, [creatorId, fanId]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#2b1a26]/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-[min(760px,92vh)] w-[min(820px,100%)] flex-col overflow-hidden rounded-3xl border bg-card shadow-xl">
        <header className="flex items-center gap-3 border-b px-5 py-3">
          {open ? (
            <button onClick={() => setOpen(null)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card-2" title="Tous les scripts">
              <ChevronLeft className="size-4" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl">{open ? open.name : `Scripts pour ${fanName}`}</h2>
            <p className="text-xs text-muted">{open ? "Prépare une étape : elle arrive dans la zone de message, tu relis puis tu envoies." : "Où en est ce fan dans chaque script."}</p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card-2">
            <X className="size-4" />
          </button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
          {err ? <p className="text-sm font-semibold text-rose-300">{err}</p> : null}
          {!list && !err ? <p className="text-sm text-muted">Chargement…</p> : null}
          {open ? (
            <Steps
              steps={open.steps}
              next={open.next}
              action={(s) => (
                <button onClick={() => onPick(s)} className={cn(s.id === open.next ? btnCls.primary : btnCls.secondary, "h-9")}>
                  <Send className="size-4" /> {s.sent ? "Renvoyer cette étape" : "Préparer cette étape"}
                </button>
              )}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {(list ?? []).map((s) => {
                const done = s.sent >= s.steps.length && s.steps.length > 0;
                return (
                  <button key={s.id} onClick={() => setOpen(s)} className="rounded-2xl border bg-card p-4 text-left hover:border-primary/50">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-semibold">{s.name}</p>
                      {done ? <Pill tone="good">terminé</Pill> : s.sent ? <Pill tone="accent">en cours</Pill> : <Pill>pas commencé</Pill>}
                      {!s.human ? <Pill tone="info">IA seulement</Pill> : null}
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card-2">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${s.steps.length ? (s.sent / s.steps.length) * 100 : 0}%` }} />
                      </div>
                      <span>
                        {s.sent}/{s.steps.length} envoyées{s.bought ? ` · ${s.bought} achetée${s.bought > 1 ? "s" : ""}` : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
              {list && !list.length ? <p className="text-sm text-muted">Aucun script actif pour cette créatrice.</p> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
