"use client";

import { useEffect, useState } from "react";
import { Check, Eye, FileText, ListOrdered, Loader2, Lock, X } from "lucide-react";
import { api } from "@/rv/lib/client";
import { perfOn } from "@/rv/lib/perf";
import { ago, cn, money } from "@/rv/lib/fmt";
import { MediaTile } from "@/rv/components/MediaTile";
import { MediaViewer } from "@/rv/components/MediaViewer";
import type { Media } from "./types";

type Step = { index: number; id: number; title: string; content: string; note: string | null; price: number | null; medias: Media[]; sent: boolean; sentAt: string | null };
type Script = { id: number; title: string; folder: string; isSequence: boolean; total: number; sent: number; lastAt: string | null; status: "active" | "paused" | "done"; steps: Step[] };

const STATUS = {
  active: { label: "En cours", cls: "bg-primary/20 text-primary-soft" },
  paused: { label: "En pause", cls: "bg-amber-400/15 text-amber-300" },
  done: { label: "Terminé", cls: "bg-emerald-400/15 text-emerald-300" },
};

/** Fiche fan : scripts déjà reçus par ce fan (où il en est), avec le détail étape par étape. */
export function FanScripts({ convId }: { convId: string }) {
  const [list, setList] = useState<Script[] | null>(null);
  const [open, setOpen] = useState<Script | null>(null);
  // Connexion faible : chargé seulement au clic (évite une requête Reveal à chaque fan ouvert).
  const [go, setGo] = useState(() => !perfOn("data"));
  useEffect(() => {
    if (!go) return;
    setList(null);
    api<{ scripts: Script[] }>("GET", `/api/conversations/${convId}/scripts`)
      .then((r) => setList(r.scripts))
      .catch(() => setList([]));
  }, [convId, go]);

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.1em] text-muted uppercase">
        <FileText className="size-3.5" /> Scripts envoyés
        {list?.length ? <span className="ml-auto text-xs normal-case tracking-normal">{list.length}</span> : null}
      </p>
      {!go ? (
        <button onClick={() => setGo(true)} className="rounded-xl border border-dashed px-3 py-2 text-left text-xs text-muted hover:text-fg">
          Mode connexion faible : clique pour voir les scripts envoyés à ce fan.
        </button>
      ) : null}
      {go && !list ? <Loader2 className="mx-auto my-2 size-4 animate-spin text-muted" /> : null}
      {list && !list.length ? <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted">Aucun script envoyé à ce fan pour l’instant.</p> : null}
      {list?.map((s) => {
        const st = STATUS[s.status];
        return (
          <button key={s.id} onClick={() => setOpen(s)} className={cn("group flex flex-col gap-1.5 rounded-xl border bg-card/80 px-3 py-2.5 text-left transition-colors hover:border-primary/50", s.status === "active" && "border-primary/40")}>
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-primary-soft uppercase">{s.title}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", st.cls)}>{st.label}</span>
              <Eye className="size-4 shrink-0 text-muted group-hover:text-fg" />
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-card-2">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(s.sent / s.total) * 100}%` }} />
              </span>
              <span className="text-xs font-bold tabular-nums">
                {s.sent}/{s.total}
              </span>
            </span>
            <span className="text-[11px] text-muted">{s.lastAt ? `dernière étape ${ago(s.lastAt)}` : "envoyé depuis Reveal"}</span>
          </button>
        );
      })}
      {open ? <ScriptDetail s={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function ScriptDetail({ s, onClose }: { s: Script; onClose: () => void }) {
  const [view, setView] = useState<Media | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !view && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, view]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pop flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary-soft">
            <ListOrdered className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold uppercase">{s.title}</p>
            <p className="text-xs text-muted">
              {s.total} étape{s.total > 1 ? "s" : ""} · {s.sent} envoyée{s.sent > 1 ? "s" : ""} à ce fan
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-card-2 hover:text-fg">
            <X className="size-5" />
          </button>
        </div>
        <ol className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {s.steps.map((st, i) => (
            <li key={st.index} className="relative flex gap-3 pb-5">
              {i < s.steps.length - 1 ? <span className={cn("absolute top-8 bottom-0 left-[15px] w-px", st.sent ? "bg-primary/60" : "bg-line")} /> : null}
              <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full", st.sent ? "bg-primary text-white" : "border-2 border-line bg-card text-muted")}>
                {st.sent ? <Check className="size-4" /> : <span className="text-xs font-bold">{st.index}</span>}
              </span>
              <div className={cn("min-w-0 flex-1", !st.sent && "opacity-60")}>
                <p className="mb-1.5 flex flex-wrap items-center gap-x-2 text-xs">
                  <b className="tracking-wide text-muted uppercase">Étape {st.index}</b>
                  {st.title ? <span className="font-semibold text-fg/80">{st.title}</span> : null}
                  {st.sent ? <span className="font-bold text-primary-soft">envoyée</span> : <span className="text-muted">pas encore envoyée</span>}
                  {st.sentAt ? <span className="text-muted">· {ago(st.sentAt)}</span> : null}
                  {st.price ? (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-400/15 px-1.5 py-0.5 font-extrabold text-amber-300">
                      <Lock className="size-3" /> {money(st.price)}
                    </span>
                  ) : null}
                </p>
                {st.note ? <p className="mb-1 inline-block rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-200 uppercase">{st.note}</p> : null}
                {st.content ? <p className="rounded-xl bg-card-2/80 px-3 py-2 text-sm whitespace-pre-wrap">{st.content}</p> : null}
                {st.medias.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {st.medias.map((m) => (
                      <button key={m.id} type="button" onClick={() => setView(m)} title="Voir en grand">
                        <MediaTile m={m} className="size-20 rounded-xl" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
      {view ? <MediaViewer m={view} onClose={() => setView(null)} /> : null}
    </div>
  );
}

type Free = { id: string; at: string; author: string | null; content: string; medias: Media[] };

/** Onglet Stats : médias gratuits déjà envoyés à ce fan (pour ne pas renvoyer les mêmes). */
export function FreeMedias({ convId }: { convId: string }) {
  const [items, setItems] = useState<Free[] | null>(null);
  const [view, setView] = useState<Media | null>(null);
  const [go, setGo] = useState(() => !perfOn("data"));
  useEffect(() => {
    if (!go) return;
    setItems(null);
    api<{ items: Free[] }>("GET", `/api/conversations/${convId}/free-medias`)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, [convId, go]);
  const count = items?.reduce((a, x) => a + x.medias.length, 0) ?? 0;
  return (
    <div>
      <h3 className="mb-2 flex items-center text-xs font-bold tracking-[0.1em] text-muted uppercase">
        Médias gratuits envoyés{items ? <span className="ml-auto normal-case tracking-normal">{count}</span> : null}
      </h3>
      {!go ? (
        <button onClick={() => setGo(true)} className="text-sm text-primary-soft underline">
          Afficher les médias gratuits envoyés
        </button>
      ) : !items ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </p>
      ) : !items.length ? (
        <p className="text-sm text-muted">Aucun média gratuit envoyé.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((x) => (
            <li key={x.id} className="rounded-xl border bg-card/60 p-2.5">
              <p className="mb-1.5 text-[11px] text-muted">
                {new Date(x.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {x.author ? ` · ${x.author}` : ""}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {x.medias.map((m) => (
                  <button key={m.id} type="button" onClick={() => setView(m)} title="Voir en grand">
                    <MediaTile m={m} className="size-14 rounded-lg" />
                  </button>
                ))}
              </div>
              {x.content ? <p className="mt-1.5 line-clamp-2 text-xs text-fg/80">{x.content}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {view ? <MediaViewer m={view} onClose={() => setView(null)} /> : null}
    </div>
  );
}
