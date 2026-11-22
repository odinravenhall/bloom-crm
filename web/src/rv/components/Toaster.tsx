"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { Toast } from "@/rv/lib/client";
import { cn } from "@/rv/lib/fmt";

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setList((l) => [...l.slice(-3), t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), t.tone === "err" ? 6000 : 3200);
    };
    window.addEventListener("crm-toast", on);
    return () => window.removeEventListener("crm-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          className={cn(
            "toast-in flex items-center gap-2 rounded-xl border bg-card-2/95 px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur",
            t.tone === "err" ? "border-rose-500/40" : "border-emerald-500/30",
          )}
        >
          {t.tone === "err" ? <AlertTriangle className="size-4 text-rose-300" /> : <CheckCircle2 className="size-4 text-emerald-300" />}
          {t.text}
        </div>
      ))}
    </div>
  );
}
