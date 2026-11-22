"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronLeft, ListOrdered, Lock, Search, Send, Tags, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn, usd, when } from "@/lib/fmt";
import type { LibGroup, LibItem, Library } from "@/lib/types";
import { Pill, btnCls, inputCls } from "@/components/ui";

type Tab = "tag" | "sequence";

/** Scripts de Bloom pour le fan ouvert : tags (n'importe quel script) et séquences (où en est le fan, étape suivante). */
export function LibraryPicker({
  creatorId,
  fanId,
  fanName,
  onClose,
  onPick,
  onSubsty,
}: {
  creatorId: string;
  fanId: string;
  fanName: string;
  onClose: () => void;
  onPick: (i: LibItem, where: string) => void;
  onSubsty: () => void;
}) {
  const [lib, setLib] = useState<Library | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("sequence");
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<Library>("GET", `/api/lib?creatorId=${encodeURIComponent(creatorId)}&fanId=${encodeURIComponent(fanId)}`)
      .then((l) => {
        setLib(l);
        // Pas de séquence mais des tags : on ouvre directement les tags.
        if (!l.groups.some((g) => g.kind === "sequence" && g.items.length) && l.groups.some((g) => g.kind === "tag")) setTab("tag");
      })
      .catch((e) => setErr((e as Error).message));
  }, [creatorId, fanId]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const groups = useMemo(() => (lib?.groups ?? []).filter((g) => g.kind === tab && g.items.length), [lib, tab]);
  const group = groups.find((g) => g.id === open) ?? null;
  const next = (g: LibGroup) => g.items.find((i) => !i.sent) ?? null;
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return null;
    return (lib?.groups ?? []).flatMap((g) => g.items.filter((i) => (i.name + " " + i.text).toLowerCase().includes(s)).map((i) => ({ i, g })));
  }, [q, lib]);

  const item = (i: LibItem, g: LibGroup, k: number, highlight = false) => (
    <div key={i.id} className={cn("flex gap-3 rounded-2xl border bg-card p-3", highlight && "ring-2 ring-primary/40", i.sent && !highlight && "opacity-70")}>
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
          i.sent?.bought ? "border-sage bg-sage text-white" : i.sent ? "border-primary bg-petal text-primary-soft" : highlight ? "border-primary text-primary" : "text-muted",
        )}
      >
        {i.sent ? <Check className="size-3.5" /> : g.kind === "sequence" ? k + 1 : "•"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted">{i.name}</span>
          {i.price > 0 ? (
            <Pill tone="accent">
              <Lock className="size-3" /> PPV {usd(i.price)}
            </Pill>
          ) : null}
          {i.medias.length ? <Pill>{i.medias.length} média{i.medias.length > 1 ? "s" : ""}</Pill> : null}
          {i.note ? <Pill tone="info">{i.note}</Pill> : null}
          {highlight ? <Pill tone="accent">étape suivante</Pill> : null}
        </div>
        {i.text ? <p className="mt-1 text-sm whitespace-pre-wrap">{i.text}</p> : null}
        {i.sent ? (
          <p className="mt-1 text-[11px] text-muted">
            {i.sent.bought ? "acheté · " : ""}déjà envoyé{i.sent.by ? ` par ${i.sent.by}` : ""} {when(new Date(i.sent.at).toISOString())}
          </p>
        ) : null}
      </div>
      <button onClick={() => onPick(i, `${g.name} · ${i.name}`)} className={cn(highlight ? btnCls.primary : btnCls.secondary, "h-9 shrink-0 self-center")}>
        <Send className="size-4" /> {i.sent ? "Renvoyer" : "Préparer"}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#2b1a26]/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-[min(780px,92vh)] w-[min(880px,100%)] flex-col overflow-hidden rounded-3xl border bg-card shadow-xl">
        <header className="flex items-center gap-3 border-b px-5 py-3">
          {group ? (
            <button onClick={() => setOpen(null)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card-2" title="Retour">
              <ChevronLeft className="size-4" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl">{group ? group.name : `Scripts pour ${fanName}`}</h2>
            <p className="text-xs text-muted">Le script arrive dans la zone de message : tu relis, puis tu envoies.</p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card-2">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex flex-wrap items-center gap-1 border-b px-4 py-2">
          {(
            [
              ["sequence", "Séquences", ListOrdered],
              ["tag", "Tags", Tags],
            ] as const
          ).map(([k, l, Icon]) => (
            <button key={k} onClick={() => (setTab(k), setOpen(null), setQ(""))} className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold", tab === k && !q ? "bg-petal text-primary-soft" : "text-muted hover:text-fg")}>
              <Icon className="size-4" /> {l}
            </button>
          ))}
          <button onClick={onSubsty} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-muted hover:text-fg">
            <Bot className="size-4" /> IA Substy
          </button>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input className={cn(inputCls, "h-9 w-56 pl-9")} placeholder="Chercher un script…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
          {err ? <p className="text-sm font-semibold text-rose-400">{err}</p> : null}
          {!lib && !err ? <p className="text-sm text-muted">Chargement…</p> : null}
          {found ? (
            <div className="flex flex-col gap-2">
              {found.map(({ i, g }) => item(i, g, g.items.indexOf(i)))}
              {!found.length ? <p className="text-sm text-muted">Aucun script trouvé.</p> : null}
            </div>
          ) : group ? (
            <div className="flex flex-col gap-2">{group.items.map((i, k) => item(i, group, k, group.kind === "sequence" && next(group)?.id === i.id))}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((g) => {
                const sent = g.items.filter((i) => i.sent).length;
                const n = next(g);
                return (
                  <button key={g.id} onClick={() => setOpen(g.id)} className="rounded-2xl border bg-card p-4 text-left hover:border-primary/50">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-semibold">{g.name}</p>
                      {g.kind === "sequence" ? (
                        sent >= g.items.length ? <Pill tone="good">terminée</Pill> : sent ? <Pill tone="accent">en cours</Pill> : <Pill>pas commencée</Pill>
                      ) : (
                        <Pill>{g.items.length} scripts</Pill>
                      )}
                    </div>
                    {g.kind === "sequence" ? (
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card-2">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(sent / g.items.length) * 100}%` }} />
                        </div>
                        <span>
                          {sent}/{g.items.length}
                          {n ? ` · suivante : ${n.name}` : ""}
                        </span>
                      </div>
                    ) : null}
                  </button>
                );
              })}
              {lib && !groups.length ? (
                <p className="text-sm text-muted">
                  {tab === "sequence" ? "Aucune séquence pour cette créatrice." : "Aucun tag pour cette créatrice."} Elles se créent dans la page Scripts.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
