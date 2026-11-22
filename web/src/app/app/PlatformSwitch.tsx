"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/fmt";
import { platformOf, useCreators } from "@/lib/creators";
import { PlatformLogo } from "@/components/PlatformLogo";
import { PF_LABEL, setPf, type Pf } from "@/lib/platform";

const Icon = ({ p, className = "size-5" }: { p: Pf | "reveal"; className?: string }) =>
  p === "reveal" ? (
    <span className={cn("grid shrink-0 place-items-center rounded-[5px] bg-card-2 text-[10px] font-black", className)}>R</span>
  ) : (
    <PlatformLogo platform={p === "mym" ? "mym" : "onlyfans"} className={cn("rounded-[5px]", className)} />
  );

/**
 * Choix de la plateforme, sous l'Accueil : OnlyFans ou MYM, une seule à la fois (Reveal bientôt).
 * Tout le CRM ne montre que les modèles de cette plateforme ; seuls l'Accueil (toute l'agence), l'IA et l'équipe sont communs.
 */
export function PlatformSwitch({ compact }: { compact: boolean }) {
  const { allCreators, pf } = useCreators();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [open]);

  const count = (p: Pf) => allCreators.filter((c) => platformOf(c) === p).length;
  const choose = (p: Pf) => {
    setOpen(false);
    if (p === pf) return;
    setPf(p);
    // Tout est rechargé pour la nouvelle plateforme (listes, chiffres, temps réel).
    window.location.reload();
  };
  const OPTIONS: { p: Pf; sub: string }[] = [
    { p: "of", sub: `${count("of")} modèle${count("of") > 1 ? "s" : ""}` },
    { p: "mym", sub: `${count("mym")} modèle${count("mym") > 1 ? "s" : ""}` },
  ];

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={compact ? PF_LABEL[pf] : "Changer de plateforme"}
        className={cn("flex w-full items-center gap-2.5 rounded-xl border bg-card text-left text-sm font-semibold hover:border-primary/50", compact ? "justify-center p-2" : "px-3 py-2.5", open && "border-primary/60")}
      >
        <Icon p={pf} />
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1 truncate">{PF_LABEL[pf]}</span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
          </>
        )}
      </button>
      {open ? (
        <div className={cn("absolute z-50 mt-2 w-60 overflow-hidden rounded-xl border bg-card p-1 shadow-xl", compact ? "top-0 left-full ml-2 mt-0" : "top-full left-0")}>
          {OPTIONS.map((o) => (
            <button key={o.p} onClick={() => choose(o.p)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-card-2", pf === o.p && "bg-card-2")}>
              <Icon p={o.p} className="size-6" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{PF_LABEL[o.p]}</span>
                <span className="block text-[11px] text-muted">{o.sub}</span>
              </span>
              {pf === o.p ? <Check className="size-4 shrink-0" /> : null}
            </button>
          ))}
          <div className="mt-1 flex cursor-not-allowed items-center gap-2.5 rounded-lg border-t px-2.5 py-2 opacity-55" title="Bientôt">
            <Icon p="reveal" className="size-6" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Reveal</span>
              <span className="block text-[11px] text-muted">Pas encore branché</span>
            </span>
            <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">Bientôt</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
