"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { usd } from "@/lib/fmt";
import type { Fan } from "@/lib/types";
import { Avatar, Pill } from "@/components/ui";

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Fiche du fan (dépenses, abonnement, listes) à droite de la conversation, sur grand écran. */
export function FanPanel({ creatorId, fanId, onLoaded }: { creatorId: string; fanId: string; onLoaded: (f: Fan) => void }) {
  const [f, setF] = useState<Fan | null>(null);
  const [err, setErr] = useState("");
  const cb = useRef(onLoaded);
  cb.current = onLoaded;
  useEffect(() => {
    let off = false;
    setF(null);
    api<Fan>("GET", `/api/fan?creatorId=${encodeURIComponent(creatorId)}&fanId=${encodeURIComponent(fanId)}`)
      .then((x) => {
        if (off) return;
        setF(x);
        cb.current(x);
      })
      .catch((e) => !off && setErr((e as Error).message));
    return () => {
      off = true;
    };
  }, [creatorId, fanId]);

  const kv = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-2 border-b border-line/60 py-1.5 text-[13px]">
      <span className="text-muted">{k}</span>
      <b className="tabular-nums">{v}</b>
    </div>
  );
  const h = (t: string) => <p className="mt-4 mb-1 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{t}</p>;

  return (
    <aside className="scroll-thin hidden w-[300px] shrink-0 overflow-y-auto border-l bg-panel p-4 backdrop-blur-xl xl:block">
      {!f ? (
        <p className="text-sm text-muted">{err || "Chargement…"}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Avatar src={f.avatar} name={f.name} size="size-12" />
            <div className="min-w-0">
              <p className="truncate font-bold">{f.name}</p>
              <p className="truncate text-xs text-muted">{f.username ? "@" + f.username : ""}</p>
            </div>
          </div>
          {h("Dépenses")}
          <p className="text-2xl font-extrabold tabular-nums">{usd(f.spend.net)}</p>
          <p className="text-xs text-muted">
            net · {f.spend.purchases || 0} achat{f.spend.purchases > 1 ? "s" : ""}
            {f.spend.last ? " · dernier le " + d(f.spend.last) : ""}
          </p>
          <div className="mt-2">
            {kv("Messages / PPV", usd(f.breakdown.messages))}
            {kv("Pourboires", usd(f.breakdown.tips))}
            {kv("Abonnements", usd(f.breakdown.subscriptions))}
            {kv("Posts", usd(f.breakdown.posts))}
          </div>
          {f.subscription ? (
            <>
              {h("Abonnement")}
              {kv("Statut", f.subscription.status)}
              {kv("Depuis", d(f.subscription.since))}
              {kv("Renouvellement", f.subscription.canceled ? "annulé" : d(f.subscription.renews))}
              {kv("Prix", usd(f.subscription.price))}
            </>
          ) : null}
          {f.lists.length ? (
            <>
              {h("Listes")}
              <div className="flex flex-wrap gap-1">
                {f.lists.map((l) => (
                  <Pill key={l}>{l}</Pill>
                ))}
              </div>
            </>
          ) : null}
          {f.lastPpv ? (
            <>
              {h("Dernier PPV acheté")}
              <p className="text-sm">{d(f.lastPpv)}</p>
            </>
          ) : null}
        </>
      )}
    </aside>
  );
}
