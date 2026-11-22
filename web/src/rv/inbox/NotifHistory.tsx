"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Gift, Heart, Loader2, Lock, Sparkles, X } from "lucide-react";
import { api } from "@/rv/lib/client";
import { ago, cn, money, curOf } from "@/rv/lib/fmt";
import type { Model } from "./types";

type Item = { id: string; at: string; kind: "sale" | "tip" | "newsub" | "sub" | "other"; amount: number | null; modelId: string; fan: string | null; convId: string | null; chatter: string | null };

const KINDS = [
  { k: "all", label: "Tout" },
  { k: "sale", label: "Ventes" },
  { k: "tip", label: "Pourboires" },
  { k: "newsub", label: "New subs" },
  { k: "sub", label: "Abonnements" },
] as const;

const LOOK: Record<Item["kind"], { icon: typeof Bell; text: string; tone: string }> = {
  sale: { icon: Lock, text: "a acheté un PPV", tone: "bg-primary/20 text-primary-soft" },
  tip: { icon: Gift, text: "a envoyé un pourboire", tone: "bg-amber-400/20 text-amber-300" },
  newsub: { icon: Sparkles, text: "s’est abonné", tone: "bg-emerald-400/20 text-emerald-300" },
  sub: { icon: Heart, text: "a payé un abonnement", tone: "bg-pink-400/20 text-pink-300" },
  other: { icon: Bell, text: "a payé", tone: "bg-white/10 text-muted" },
};

/**
 * Historique des notifications (bouton à gauche des boîtes) : ventes, pourboires, new subs, abonnements payants,
 * pour la modèle affichée (ou toutes dans « Tous »). Clic sur une ligne : ouvre la conversation du fan.
 */
export function NotifHistory({ model, models, onOpen }: { model: string; models: Model[]; onOpen: (convId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]["k"]>("all");
  const [items, setItems] = useState<Item[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const byId = new Map(models.map((m) => [m.id, m]));

  // Le panneau est rendu dans <body> (portail) : dans la colonne de la file, il passait SOUS la conversation.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.min(400, window.innerWidth - 32);
      setPos({ top: r.bottom + 8, left: Math.max(16, Math.min(r.left, window.innerWidth - w - 16)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const load = async (before?: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ kind });
      if (model) p.set("model", model);
      if (before) p.set("before", before);
      const r = await api<{ items: Item[] }>("GET", `/api/notifications?${p}`);
      setItems((x) => (before ? [...(x ?? []), ...r.items] : r.items));
      setMore(r.items.length >= 20);
    } catch {
      if (!before) setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setItems(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, model]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const c = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", k);
    window.addEventListener("mousedown", c);
    return () => {
      window.removeEventListener("keydown", k);
      window.removeEventListener("mousedown", c);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((x) => !x)}
        title="Historique des notifications : ventes, pourboires, new subs, abonnements"
        className={cn("grid size-10 place-items-center rounded-xl border bg-card-2/60 text-muted transition-colors hover:text-fg", open && "border-primary text-fg")}
      >
        <Bell className="size-4" />
      </button>
      {open && pos
        ? createPortal(
        <div ref={panel} style={{ top: pos.top, left: pos.left }} className="pop fixed z-[60] flex max-h-[75dvh] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-2xl backdrop-blur-xl">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
            <p className="text-sm font-bold">Historique{model ? ` · ${byId.get(model)?.displayName ?? ""}` : " · toutes les modèles"}</p>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted hover:bg-card-2 hover:text-fg">
              <X className="size-4" />
            </button>
          </div>
          <div className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-2">
            {KINDS.map((x) => (
              <button key={x.k} onClick={() => setKind(x.k)} className={cn("shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold", kind === x.k ? "bg-primary text-white" : "text-muted hover:bg-card-2 hover:text-fg")}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {!items ? <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted" /> : null}
            {items && !items.length ? <p className="p-8 text-center text-sm text-muted">Rien pour l’instant.</p> : null}
            {items?.map((n) => {
              const l = LOOK[n.kind];
              const m = byId.get(n.modelId);
              return (
                <button
                  key={n.id}
                  disabled={!n.convId}
                  onClick={() => {
                    if (!n.convId) return;
                    onOpen(n.convId);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-3 border-b border-line/50 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] disabled:cursor-default"
                >
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", l.tone)}>
                    <l.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      <b>{n.fan || "Un fan"}</b> {l.text}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {!model && m ? `${m.displayName} · ` : ""}
                      {n.chatter ? `vendu par ${n.chatter} · ` : ""}
                      {ago(n.at)}
                    </span>
                  </span>
                  {n.amount ? <span className="shrink-0 text-sm font-extrabold text-primary-soft tabular-nums">{money(n.amount, 2, curOf(n.modelId))}</span> : null}
                </button>
              );
            })}
            {items?.length && more ? (
              <button onClick={() => load(items[items.length - 1].at)} disabled={loading} className="mx-auto my-3 block rounded-full border bg-card-2 px-4 py-1.5 text-xs text-muted hover:text-fg">
                {loading ? "…" : "Charger plus"}
              </button>
            ) : null}
          </div>
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}
