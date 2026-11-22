"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, Lock, Megaphone, Play, Unlock } from "lucide-react";
import { api, mediaThumb } from "@/rv/lib/client";
import { cn, money } from "@/rv/lib/fmt";
import type { Media } from "./types";

type Bundle = { id: string; price: number; isPaid: boolean; createdAt: string; massDM: boolean; content: string | null; author: string | null; medias: Media[] };
type Resp = { buyRate: { purchased: number; total: number; percentage: number } | null; highestPrice: number | null; lowestPrice: number | null; bundles: Bundle[] };

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

/** Timeline PPV façon Infloww : taux d'achat, prix min/max, chaque PPV avec date, médias, texte complet et « copier en brouillon ». */
export function PpvTimeline({ convId }: { convId: string }) {
  const [r, setR] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setR(null);
    api<Resp>("GET", `/api/conversations/${convId}/ppv`)
      .then(setR)
      .catch((e) => setErr((e as Error).message));
  }, [convId]);

  const draft = (b: Bundle) =>
    window.dispatchEvent(new CustomEvent("crm-draft", { detail: { convId, content: b.content ?? "", medias: b.medias, price: b.price } }));

  return (
    <div>
      <h3 className="mb-2 text-xs font-bold tracking-[0.1em] text-muted uppercase">Timeline PPV</h3>
      {err ? <p className="text-sm text-rose-300">{err}</p> : null}
      {!r && !err ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Chargement des PPV…
        </p>
      ) : null}
      {r ? (
        <>
          <p className="text-sm font-bold">
            Taux d’achat : {r.buyRate ? `${r.buyRate.purchased}/${r.buyRate.total} (${r.buyRate.percentage} %)` : "—"}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-card-2/50 p-2.5">
              <p className="text-lg font-extrabold tabular-nums">{r.highestPrice ? money(r.highestPrice) : "—"}</p>
              <p className="text-[11px] text-muted">Prix le plus haut</p>
            </div>
            <div className="rounded-xl border bg-card-2/50 p-2.5">
              <p className="text-lg font-extrabold tabular-nums">{r.lowestPrice ? money(r.lowestPrice) : "—"}</p>
              <p className="text-[11px] text-muted">Prix le plus bas</p>
            </div>
          </div>
          {!r.bundles.length ? <p className="mt-3 text-sm text-muted">Aucun PPV envoyé à ce fan.</p> : null}
          <ol className="mt-3 flex flex-col gap-4">
            {r.bundles.map((b) => {
              const isOpen = !!open[b.id];
              const shown = isOpen ? b.medias : b.medias.slice(0, 6);
              return (
                <li key={b.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums", b.isPaid ? "bg-emerald-500/20 text-emerald-300" : "bg-pink-500/90 text-white")}>
                      {b.isPaid ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />} {money(b.price)}
                    </span>
                    <span className="text-sm font-bold">{when(b.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                    {b.isPaid ? <span className="font-semibold text-emerald-300">acheté</span> : <span>pas acheté</span>}
                    {b.massDM ? (
                      <span className="inline-flex items-center gap-1">
                        · <Megaphone className="size-3" /> envoi groupé
                      </span>
                    ) : null}
                    {b.author ? <span>· {b.author}</span> : null}
                  </p>
                  <div className="mt-2 rounded-2xl border bg-card-2/40 p-2">
                    {b.medias.length ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {shown.map((m, i) => (
                          <span key={m.id} className="relative block aspect-square overflow-hidden rounded-lg bg-card-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mediaThumb(m)} alt="" loading="lazy" className="size-full object-cover" />
                            {!b.isPaid ? (
                              <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-md bg-black/55">
                                <Lock className="size-3" />
                              </span>
                            ) : null}
                            {m.type === "video" ? (
                              <span className="absolute bottom-1 left-1 grid size-5 place-items-center rounded-md bg-black/60">
                                <Play className="size-3" />
                              </span>
                            ) : null}
                            {!isOpen && i === 5 && b.medias.length > 6 ? (
                              <span className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-bold">+{b.medias.length - 6}</span>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {b.content ? <p className={cn("mt-2 text-xs whitespace-pre-wrap text-fg/85", !isOpen && "line-clamp-2")}>{b.content}</p> : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {b.content || b.medias.length > 6 ? (
                        <button onClick={() => setOpen((o) => ({ ...o, [b.id]: !isOpen }))} className="text-xs font-bold text-orange-300 hover:text-orange-200">
                          {isOpen ? "Réduire" : "Lire la suite"}
                        </button>
                      ) : (
                        <span />
                      )}
                      <button onClick={() => draft(b)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold hover:bg-white/15" title="Mettre ce PPV (texte, médias, prix) dans le message, sans l’envoyer">
                        <Copy className="size-3.5" /> Copier en brouillon
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
    </div>
  );
}
