"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ImageIcon, Sparkles } from "lucide-react";
import { api, toast } from "@/rv/lib/client";
import { cn, money } from "@/rv/lib/fmt";
import { BADGE_ICONS, tierOf, type Badge } from "@/rv/lib/tiers";

/** Choisir l'icône (palier auto, vraie photo ou icône) et l'étiquette d'un fan, pour toute l'équipe. */
export function BadgePicker({ anchor, convId, totalSpent, badge, onClose, onSaved }: { anchor: HTMLElement; convId: string; totalSpent: number; badge: Badge; onClose: () => void; onSaved: (b: Badge) => void }) {
  const [icon, setIcon] = useState<string | null>(badge.icon);
  const [label, setLabel] = useState(badge.label ?? "");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const r = anchor.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 16);
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const auto = tierOf(totalSpent);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [anchor, onClose]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api<{ badge: Badge }>("POST", `/api/conversations/${convId}/action`, { action: "badge", icon, label });
      onSaved(res.badge);
      toast("Fan marqué pour toute l’équipe");
      onClose();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const opt = (v: string | null, content: React.ReactNode, title: string) => (
    <button key={v ?? "auto"} type="button" title={title} onClick={() => setIcon(v)} className={cn("grid size-10 place-items-center rounded-xl border text-xl transition-colors", icon === v ? "border-primary bg-primary/20" : "bg-card-2/60 hover:border-primary/50")}>
      {content}
    </button>
  );

  return createPortal(
    <div ref={box} style={{ top: r.bottom + 8, left, width: w }} className="pop fixed z-[60] rounded-2xl border bg-card p-3 shadow-2xl">
      <p className="text-xs font-bold tracking-wide text-muted uppercase">Icône du fan</p>
      <p className="mt-0.5 text-[11px] text-muted">
        Palier auto : {auto ? `${auto.icon} ${auto.label}` : "aucun"} ({money(totalSpent)} dépensés)
      </p>
      <div className="mt-2.5 grid grid-cols-6 gap-1.5">
        {opt(null, <Sparkles className="size-4 text-primary-soft" />, "Automatique (palier selon ses achats)")}
        {opt("photo", <ImageIcon className="size-4 text-muted" />, "Sa vraie photo")}
        {BADGE_ICONS.map((i) => opt(i, i, i))}
      </div>
      <label className="mt-3 block text-xs font-bold tracking-wide text-muted uppercase">
        Étiquette
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value.slice(0, 24))}
          placeholder={auto?.label ?? "Gros dépensier, à relancer…"}
          className="mt-1.5 h-9 w-full rounded-xl border border-input bg-card-2/60 px-3 text-sm font-semibold tracking-normal text-fg normal-case outline-none focus:border-primary"
        />
      </label>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="h-9 rounded-xl px-3 text-sm text-muted hover:text-fg">
          Annuler
        </button>
        <button type="button" disabled={busy} onClick={save} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
          <Check className="size-4" /> Enregistrer
        </button>
      </div>
    </div>,
    document.body,
  );
}
