"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const panel = useRef<HTMLDivElement>(null);
  // La liste est posée par-dessus la page (portail) : dans le menu, elle était coupée par le bord de la colonne.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const width = compact ? 240 : Math.max(r.width, 220);
      setPos(compact ? { top: r.top, left: r.right + 8, width } : { top: r.bottom + 6, left: r.left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, compact]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", out);
      document.removeEventListener("keydown", esc);
    };
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
      {open && pos
        ? createPortal(
        <div ref={panel} style={{ top: pos.top, left: pos.left, width: pos.width }} className="fixed z-[100] overflow-hidden rounded-xl border bg-card p-1 shadow-2xl">
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
          <div className="mx-1 my-1 border-t" />
          <div className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 opacity-55" title="Bientôt">
            <Icon p="reveal" className="size-6" />
            <span className="min-w-0 flex-1 text-sm font-semibold">Reveal</span>
            <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">Bientôt</span>
          </div>
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}
