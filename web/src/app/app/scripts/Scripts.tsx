"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn, usd } from "@/lib/fmt";
import { CreatorTabs, useCreators } from "@/lib/creators";
import type { Script, ScriptStep } from "@/lib/types";
import { Pill, inputCls } from "@/components/ui";
import { Steps } from "./Steps";

/** Scripts & séquences : les scripts de Substy (ceux de l'IA et des chatteurs), étape par étape. */
export function Scripts() {
  const { creatorId, creator } = useCreators();
  const [list, setList] = useState<Script[] | null>(null);
  const [open, setOpen] = useState<Script | null>(null);
  const [steps, setSteps] = useState<ScriptStep[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!creatorId) return;
    setList(null);
    setOpen(null);
    setErr("");
    api<Script[]>("GET", `/api/scripts?creatorId=${encodeURIComponent(creatorId)}`)
      .then((l) => {
        setList(l);
        setOpen(l[0] ?? null);
      })
      .catch((e) => setErr((e as Error).message));
  }, [creatorId]);
  useEffect(() => {
    if (!open || !creatorId) return;
    setSteps(null);
    api<ScriptStep[]>("GET", `/api/scripts/steps?creatorId=${encodeURIComponent(creatorId)}&scriptId=${encodeURIComponent(open.id)}`)
      .then(setSteps)
      .catch(() => setSteps([]));
  }, [open, creatorId]);

  const shown = (list ?? []).filter((s) => !q.trim() || (s.name + " " + s.description).toLowerCase().includes(q.trim().toLowerCase()));
  const who = (s: Script) => (s.ai && s.human ? "IA et chatteurs" : s.ai ? "IA seulement" : "chatteurs");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-6 pb-4 md:px-8">
        <div>
          <h1 className="text-4xl md:text-5xl">Scripts & séquences</h1>
          <p className="mt-1 text-sm text-muted">{creator ? `Les scripts de ${creator.name} sur Substy : les mêmes pour l’IA et pour les chatteurs.` : "Choisis une créatrice."}</p>
        </div>
        <CreatorTabs />
      </div>
      {err ? <p className="mx-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300 md:mx-8">{err}</p> : null}

      <div className="flex min-h-0 flex-1 border-t">
        {/* Liste des scripts */}
        <aside className="flex w-full min-w-0 flex-col border-r bg-panel md:w-[360px] md:shrink-0">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
              <input className={cn(inputCls, "pl-10")} placeholder="Rechercher un script…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
            {shown.map((s) => (
              <button key={s.id} onClick={() => setOpen(s)} className={cn("mb-1 w-full rounded-2xl px-3 py-3 text-left", open?.id === s.id ? "bg-card shadow-sm ring-1 ring-line" : "hover:bg-card-2", !s.enabled && "opacity-60")}>
                <p className="truncate font-semibold">{s.name}</p>
                {s.description ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{s.description}</p> : null}
                <p className="mt-2 flex flex-wrap gap-1">
                  <Pill>{s.steps} étapes</Pill>
                  {s.totalPrice ? <Pill tone="accent">{usd(s.totalPrice, 0)} au total</Pill> : null}
                  <Pill tone={s.ai ? "info" : "muted"}>{who(s)}</Pill>
                  {!s.enabled ? <Pill tone="warn">en pause</Pill> : null}
                </p>
              </button>
            ))}
            {list && !shown.length ? <p className="p-6 text-center text-sm text-muted">Aucun script</p> : null}
            {!list && !err ? <p className="p-6 text-center text-sm text-muted">Chargement…</p> : null}
          </div>
        </aside>

        {/* Détail : la séquence étape par étape */}
        <section className="scroll-thin hidden min-w-0 flex-1 overflow-y-auto px-6 py-6 md:block">
          {open ? (
            <div className="mx-auto max-w-3xl">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-3xl">{open.name}</h2>
                  {open.description ? <p className="mt-1 text-sm text-muted">{open.description}</p> : null}
                </div>
                <a href={`https://app.substy.ai/scripts?creatorId=${creatorId}&scriptId=${open.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm font-semibold hover:border-primary/60">
                  Modifier sur Substy <ExternalLink className="size-3.5" />
                </a>
              </div>
              <p className="mt-3 mb-5 flex flex-wrap gap-1.5">
                <Pill>{open.steps} étapes</Pill>
                {open.medias ? <Pill>{open.medias} médias</Pill> : null}
                {open.minPrice != null && open.maxPrice ? <Pill tone="accent">PPV de {usd(open.minPrice, 0)} à {usd(open.maxPrice, 0)}</Pill> : null}
                <Pill tone="info">{who(open)}</Pill>
              </p>
              {steps ? <Steps steps={steps} /> : <p className="text-sm text-muted">Chargement…</p>}
              <p className="mt-6 text-xs text-muted">Pour l’envoyer à un fan : dans la messagerie, bouton « Scripts » sous la conversation. Bloom montre où en est le fan et prépare l’étape suivante.</p>
            </div>
          ) : (
            <p className="mt-20 text-center text-sm text-muted">Choisis un script</p>
          )}
        </section>
      </div>
    </div>
  );
}
