"use client";

import { Bot, Check, Clock, Lock } from "lucide-react";
import { cn, usd } from "@/lib/fmt";
import type { ScriptStep } from "@/lib/types";
import { Pill } from "@/components/ui";

/** « 30 s », « 5 min », « 2 h » pour les délais de relance (Substy les donne en secondes). */
export const wait = (s: number | null) => (s == null ? "" : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);

/** Une séquence affichée comme une frise : chaque étape (message, médias, prix), puis ses relances. */
export function Steps({ steps, action, next }: { steps: ScriptStep[]; action?: (s: ScriptStep) => React.ReactNode; next?: string | null }) {
  return (
    <ol className="relative flex flex-col gap-3 pl-6">
      <span className="absolute top-3 bottom-3 left-[11px] w-px bg-line" />
      {steps.map((s, i) => (
        <li key={s.id} className="relative">
          <span
            className={cn(
              "absolute top-3 -left-6 grid size-[23px] place-items-center rounded-full border text-[11px] font-bold",
              s.purchase === "bought" ? "border-sage bg-sage text-white" : s.sent ? "border-primary bg-petal text-primary-soft" : next === s.id ? "border-primary bg-card text-primary" : "bg-card text-muted",
            )}
          >
            {s.purchase === "bought" ? <Check className="size-3" /> : i + 1}
          </span>
          <div className={cn("rounded-2xl border bg-card p-4", next === s.id && "ring-2 ring-primary/40")}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 font-semibold">{s.name || `Étape ${i + 1}`}</p>
              {s.price > 0 ? (
                <Pill tone="accent">
                  <Lock className="size-3" /> PPV {usd(s.price)}
                </Pill>
              ) : (
                <Pill>gratuit</Pill>
              )}
              {s.purchase === "bought" ? <Pill tone="good">acheté</Pill> : s.purchase === "unpaid" ? <Pill tone="warn">pas encore payé</Pill> : s.sent ? <Pill tone="info">envoyé</Pill> : null}
              {next === s.id ? <Pill tone="accent">étape suivante</Pill> : null}
            </div>
            {s.text ? <p className="mt-2 text-sm whitespace-pre-wrap">{s.text}</p> : s.aiCaption ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted italic">
                <Bot className="size-4" /> Légende écrite par l’IA (à écrire soi-même quand on l’envoie à la main)
              </p>
            ) : null}
            {s.medias.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.medias.slice(0, 8).map((m) => (
                  <a key={m.id} href={m.full || m.thumb || "#"} target="_blank" rel="noreferrer" title={m.context || ""} className="relative block size-16 overflow-hidden rounded-xl bg-card-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {m.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : null}
                    {m.type === "video" ? <span className="absolute bottom-0.5 left-0.5 rounded bg-black/65 px-1 text-[9px] font-bold">▶</span> : null}
                  </a>
                ))}
                {s.medias.length > 8 ? <span className="grid size-16 place-items-center rounded-xl bg-card-2 text-xs font-semibold text-muted">+{s.medias.length - 8}</span> : null}
              </div>
            ) : null}
            {s.followUps.length ? (
              <div className="mt-3 flex flex-col gap-1.5 border-t pt-3">
                {s.followUps.map((f, k) => (
                  <div key={k} className="flex gap-2 text-sm">
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                      <Clock className="size-3" /> {wait(f.wait)}
                    </span>
                    <span className="min-w-0 flex-1">
                      {f.text}
                      <span className="block text-[11px] text-muted">
                        relance{[!f.ifPaid && "pas si le fan a payé", !f.ifReply && "pas s’il a répondu", !f.ifRead && "pas s’il a lu"].filter(Boolean).length ? " · " + [!f.ifPaid && "pas si le fan a payé", !f.ifReply && "pas s’il a répondu", !f.ifRead && "pas s’il a lu"].filter(Boolean).join(", ") : ""}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {action ? <div className="mt-3">{action(s)}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
