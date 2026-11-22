"use client";

import { useState } from "react";
import { ChevronDown, Wifi } from "lucide-react";
import { cn } from "@/rv/lib/fmt";

type Rank = "diamond" | "gold" | "silver" | "bronze" | "unranked";
export type ScoreData = { rank: Rank; top: number | null; lastPaidAt: string | null; paidWeek: boolean };

// Une carte bancaire par rang (dégradés CSS, pas d'image).
const RANKS: Record<Rank, { label: string; text: string; card: string; advice: string }> = {
  diamond: {
    label: "Diamond",
    text: "text-sky-200",
    card: "bg-[linear-gradient(135deg,#1e1b4b,#312e81_45%,#0e7490)] ring-1 ring-cyan-300/70 shadow-[0_0_18px_-4px_rgba(103,232,249,.7)]",
    advice: "Priorité absolue : réponds vite et propose le meilleur.",
  },
  gold: { label: "Gold", text: "text-amber-300", card: "bg-[linear-gradient(135deg,#fde68a,#d4a017_50%,#a16207)] ring-1 ring-amber-200/60", advice: "Dépense souvent : entretiens-le et monte en gamme." },
  silver: { label: "Silver", text: "text-zinc-200", card: "bg-[linear-gradient(135deg,#f4f4f5,#a1a1aa_55%,#71717a)] ring-1 ring-white/40", advice: "Petit payeur actif : fais-le monter avec des offres régulières." },
  bronze: { label: "Bronze", text: "text-orange-300", card: "bg-[linear-gradient(135deg,#fdba74,#c2410c_55%,#7c2d12)] ring-1 ring-orange-200/40", advice: "A payé puis disparu : relance-le avec une offre de retour." },
  unranked: { label: "Unranked", text: "text-muted", card: "border border-dashed border-white/30 bg-transparent", advice: "N’a jamais payé : la barrière de la carte est à franchir." },
};

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 864e5));
const since = (iso: string) => {
  const d = days(iso);
  return d === 0 ? "aujourd’hui" : d === 1 ? "hier" : `il y a ${d} j`;
};

/** Petite carte à côté du nom dans la file. */
export function MiniCard({ score }: { score: ScoreData }) {
  const r = RANKS[score.rank];
  return (
    <span
      title={`Score : ${r.label}${score.top ? ` · top ${score.top} %` : ""}${score.lastPaidAt ? ` · dernier achat ${since(score.lastPaidAt)}` : ""}`}
      className={cn("relative inline-block h-3 w-[18px] shrink-0 rounded-[3px]", r.card)}
    >
      {score.rank !== "unranked" ? <span className="absolute top-[3px] left-[3px] h-[4px] w-[5px] rounded-[1px] bg-black/25" /> : null}
    </span>
  );
}

/** Carte du score dans la fiche du fan, avec l'explication des rangs. */
export function ScoreCard({ score }: { score: ScoreData }) {
  const [open, setOpen] = useState(false);
  const r = RANKS[score.rank];
  return (
    <div className="w-full self-stretch rounded-2xl border bg-card/70 p-3.5 text-left">
      <p className="mb-2.5 text-[11px] font-bold tracking-[0.1em] text-muted uppercase">Score du fan</p>
      <div className="flex items-center gap-3.5">
        {/* la carte : puce, sans contact, reflet */}
        <div className={cn("relative aspect-[1.586] w-[46%] max-w-[150px] shrink-0 overflow-hidden rounded-xl p-2.5", r.card)}>
          {score.rank !== "unranked" ? (
            <>
              <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,.35)_45%,transparent_60%)]" />
              <span className="flex items-center justify-between">
                <span className="text-[9px] font-extrabold tracking-[0.2em] text-black/55">RAVEN</span>
                <Wifi className="size-3.5 rotate-90 text-black/45" />
              </span>
              <span className="mt-2 block h-[18%] w-[22%] rounded-[4px] bg-[linear-gradient(135deg,rgba(0,0,0,.18),rgba(0,0,0,.32))] ring-1 ring-black/10" />
              <span className="absolute bottom-2 left-2.5 text-[10px] font-extrabold tracking-wider text-black/60 uppercase">{r.label}</span>
            </>
          ) : (
            <span className="grid h-full place-items-center text-center text-[10px] font-bold tracking-wide text-muted">AUCUN ACHAT</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-2xl leading-none font-extrabold", r.text)}>{r.label}</p>
          {score.top ? <span className={cn("mt-1.5 inline-block rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-bold", r.text)}>Top {score.top} %</span> : null}
          <p className="mt-1.5 text-xs leading-snug text-fg/75">{r.advice}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/[0.03] px-2.5 py-2 text-[11px]">
        {score.lastPaidAt ? (
          <>
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <span className={cn("size-2 rounded-full", score.paidWeek ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]" : "bg-orange-400")} />
              {score.paidWeek ? "A payé cette semaine" : "Pas d’achat depuis 7 j"}
            </span>
            <span className="text-muted">Dernier achat {since(score.lastPaidAt)}</span>
          </>
        ) : (
          <span className="text-muted">{score.rank === "unranked" ? "N’a encore rien acheté chez nous" : "A déjà payé, achats trop anciens pour être datés"}</span>
        )}
      </div>
      <button onClick={() => setOpen((o) => !o)} className="mt-2 flex w-full items-center justify-between border-t border-line/70 pt-2 text-[11px] font-semibold text-muted hover:text-fg">
        Comment lire le score
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="text-[11px] text-muted">Rang selon ce qu’il a dépensé récemment chez toutes nos modèles. Un achat compte pour moitié au bout de 30 jours.</p>
          {(Object.keys(RANKS) as Rank[]).map((k) => (
            <div key={k} className={cn("flex items-center gap-2 rounded-lg px-1.5 py-1 text-[11px]", k === score.rank && "bg-white/[0.05]")}>
              <span className={cn("inline-block h-3 w-[18px] shrink-0 rounded-[3px]", RANKS[k].card)} />
              <span className={cn("w-16 shrink-0 font-bold", RANKS[k].text)}>{RANKS[k].label}</span>
              <span className="min-w-0 flex-1 text-fg/75">{RANKS[k].advice}</span>
              {k === score.rank ? <span className="shrink-0 text-muted">ce fan</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
