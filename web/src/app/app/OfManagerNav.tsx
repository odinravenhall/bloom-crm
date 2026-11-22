"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/fmt";
import { OF_PAGES } from "@/lib/ofmanager";
import { OnlyFansLogo } from "@/components/PlatformLogo";

/**
 * Entrée « OF Manager » du menu (comme Infloww) : une seule ligne avec le logo OnlyFans ; un clic ouvre la liste des
 * pages à côté, qui se referme dès qu'on en choisit une.
 */
export function OfManagerNav({ compact }: { compact: boolean }) {
  const path = usePathname() || "";
  const on = path.startsWith("/app/of-manager");
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (!r) return;
      const h = panel.current?.offsetHeight ?? 520;
      setPos({ top: Math.max(8, Math.min(r.top - 6, window.innerHeight - h - 8)), left: r.right + 8 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", out);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <button
        ref={btn}
        onClick={() => setOpen((o) => !o)}
        title={compact ? "OF Manager" : undefined}
        className={cn(
          "group/item flex w-full items-center gap-2.5 rounded-lg py-1.5 text-left text-[13px] transition-colors",
          compact ? "justify-center px-0" : "px-1.5",
          on || open ? "bg-white/[0.06] font-semibold text-fg" : "text-muted hover:bg-white/[0.03] hover:text-fg",
        )}
      >
        <span className={cn("grid size-7 shrink-0 place-items-center overflow-hidden rounded-md", on ? "ring-2 ring-primary" : "")}>
          <OnlyFansLogo className="size-7" />
        </span>
        {compact ? null : (
          <>
            <span className="flex-1 truncate">OF Manager</span>
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </>
        )}
      </button>
      {open
        ? createPortal(
            <div ref={panel} style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }} className="fixed z-[100] w-56 overflow-hidden rounded-xl border bg-card p-1 shadow-2xl">
              {OF_PAGES.map((p) => {
                const cur = path === `/app/of-manager/${p.key}`;
                return (
                  <Link
                    key={p.key}
                    href={`/app/of-manager/${p.key}`}
                    onClick={() => setOpen(false)}
                    className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-card-2", cur ? "bg-card-2 font-semibold text-fg" : "text-muted hover:text-fg")}
                  >
                    <p.icon className="size-4" />
                    {p.label}
                  </Link>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
