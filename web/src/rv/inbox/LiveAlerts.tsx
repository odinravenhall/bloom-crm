"use client";

import { useEffect, useState } from "react";
import { BadgeDollarSign, Bot, Clock, X } from "lucide-react";
import { onLive } from "@/rv/lib/liveClient";
import { cn, curOf, money } from "@/rv/lib/fmt";
import { Avatar } from "@/rv/components/ui";
import type { Model } from "./types";

type Alert = { id: string; at: string; kind: "ai_ppv" | "ppv_unpaid" | "sale"; modelId: string; fanId: string | null; fan: string; amount: number; currency?: string };

const LOOK = {
  ai_ppv: { icon: Bot, tone: "bg-card-2 text-fg", ttl: 25_000, title: "L’IA a envoyé un PPV" },
  ppv_unpaid: { icon: Clock, tone: "bg-amber-400/20 text-amber-300", ttl: 90_000, title: "PPV pas payé depuis 3 min" },
  sale: { icon: BadgeDollarSign, tone: "bg-emerald-400/20 text-emerald-300", ttl: 90_000, title: "Le fan a payé" },
} as const;

/**
 * Notifications en direct, en bas à droite de la messagerie : PPV envoyé par l'IA (quel que soit le script),
 * PPV toujours pas payé 3 min après, fan qui paye. Seulement pour la modèle affichée (toutes dans « Tous »).
 * Clic : ouvre la conversation (le chatteur l'épingle pour la reprendre : l'IA est alors coupée).
 */
export function LiveAlerts({ model, models, onOpen }: { model: string; models: Model[]; onOpen: (convId: string) => void }) {
  const [list, setList] = useState<Alert[]>([]);
  const byId = new Map(models.map((m) => [m.id, m]));

  useEffect(
    () =>
      onLive("alert", (d) => {
        const a = d as unknown as Alert;
        if (!a?.id || !LOOK[a.kind] || (model && a.modelId !== model)) return;
        setList((l) => [...l.filter((x) => x.id !== a.id && !(x.kind === "ai_ppv" && a.kind === "ppv_unpaid" && x.fanId === a.fanId)).slice(-4), a]);
        setTimeout(() => setList((l) => l.filter((x) => x.id !== a.id)), LOOK[a.kind].ttl);
      }),
    [model],
  );

  if (!list.length) return null;
  const close = (id: string) => setList((l) => l.filter((x) => x.id !== id));
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2">
      {list.map((a) => {
        const L = LOOK[a.kind];
        const m = byId.get(a.modelId);
        const amount = money(a.amount, 2, a.currency || curOf(a.modelId));
        return (
          <div
            key={a.id}
            role={a.fanId ? "button" : undefined}
            onClick={() => {
              if (!a.fanId) return;
              onOpen(`${a.modelId}~${a.fanId}`);
              close(a.id);
            }}
            className={cn("toast-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-card-2/95 p-3 shadow-2xl backdrop-blur", a.fanId && "cursor-pointer hover:border-primary/60")}
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", L.tone)}>
              <L.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-muted">{L.title}</span>
              <span className="block truncate text-sm font-semibold">
                {a.fan} · {amount}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                {m ? <Avatar src={m.avatar} name={m.displayName} size="size-4" /> : null}
                {m?.displayName ?? "Modèle"}
                {a.fanId ? " · clique pour ouvrir" : ""}
              </span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                close(a.id);
              }}
              className="text-muted hover:text-fg"
              aria-label="Fermer"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
