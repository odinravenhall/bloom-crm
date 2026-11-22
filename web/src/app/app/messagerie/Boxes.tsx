"use client";

import { useEffect, useState } from "react";
import { Boxes as BoxesIcon, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn } from "@/lib/fmt";
import type { Boxes, Creator } from "@/lib/types";
import { PlatformBadge } from "@/lib/creators";
import { btnCls } from "@/components/ui";

/**
 * Boîtes de répartition d'une créatrice (comme Raven) : ses fans sont partagés en N boîtes, toujours les mêmes ;
 * chaque chatteur coche les siennes et ne voit que leurs fans (aucune cochée = toutes).
 * Les team leaders, managers et admins règlent le nombre de boîtes et leurs noms.
 */
export function BoxMenu({ creator, onClose, onChanged }: { creator: Creator; onClose: () => void; onChanged: () => void }) {
  const [b, setB] = useState<Boxes | null>(null);
  const [count, setCount] = useState(0);
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () =>
    api<Boxes>("GET", `/api/boxes?creatorId=${encodeURIComponent(creator.id)}`)
      .then((x) => {
        setB(x);
        setCount(x.count);
        setNames(x.names);
      })
      .catch((e) => toast((e as Error).message, "err"));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creator.id]);

  const pick = async (mine: number[]) => {
    setB((x) => x && { ...x, mine });
    await api("POST", "/api/boxes/mine", { creatorId: creator.id, boxes: mine }).catch(() => {});
    onChanged();
  };
  const save = async () => {
    setBusy(true);
    try {
      await api("POST", "/api/boxes", { creatorId: creator.id, count, names: Array.from({ length: count }, (_, i) => names[i] || "") });
      toast(count ? `${count} boîtes pour ${creator.name}` : `Plus de boîtes pour ${creator.name}`);
      await load();
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute top-full right-0 left-0 z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-2xl border bg-card p-3 text-sm shadow-xl">
      <div className="mb-2 flex items-center gap-2">
        <BoxesIcon className="size-4 text-primary" />
        <b className="flex-1">
          Boîtes · {creator.name} <PlatformBadge c={creator} />
        </b>
        <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-card-2">
          <X className="size-4" />
        </button>
      </div>
      {!b ? <p className="text-muted">Chargement…</p> : null}
      {b && b.count ? (
        <>
          <p className="mb-1 text-xs text-muted">Coche tes boîtes : tu ne verras que leurs fans. Aucune cochée = toutes.</p>
          <div className="flex flex-col gap-1">
            {b.preview.map((p, i) => {
              const on = b.mine.includes(i);
              return (
                <label key={i} className={cn("flex items-center gap-2 rounded-xl border px-3 py-1.5", on ? "border-primary bg-petal" : "hover:bg-card-2")}>
                  <input type="checkbox" checked={on} onChange={() => pick(on ? b.mine.filter((x) => x !== i) : [...b.mine, i])} />
                  <span className="flex-1 font-semibold">{p.name}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {p.reply} à répondre · {p.fans} fans
                  </span>
                </label>
              );
            })}
          </div>
          {b.mine.length ? (
            <button onClick={() => pick([])} className="mt-1 text-xs font-semibold text-primary-soft">
              Tout voir
            </button>
          ) : null}
        </>
      ) : b ? (
        <p className="text-xs text-muted">Pas de boîtes pour cette créatrice : tout le monde voit tous ses fans.</p>
      ) : null}

      {b?.canEdit ? (
        <div className="mt-3 border-t pt-3">
          <p className="mb-1 text-[11px] font-semibold text-muted uppercase">Réglage (managers)</p>
          <div className="flex items-center gap-2">
            <label className="text-xs">Nombre de boîtes</label>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-8 rounded-full border bg-card px-2 text-xs">
              <option value={0}>Aucune</option>
              {Array.from({ length: 19 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          {count ? (
            <div className="mt-2 grid grid-cols-2 gap-1">
              {Array.from({ length: count }, (_, i) => (
                <input
                  key={i}
                  value={names[i] || ""}
                  onChange={(e) => setNames((n) => Object.assign([...n], { [i]: e.target.value }))}
                  placeholder={`Boîte ${i + 1}`}
                  className="h-8 rounded-full border border-input bg-card px-3 text-xs outline-none focus:border-primary"
                />
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-muted">Chaque fan reste toujours dans la même boîte. Changer le nombre de boîtes redistribue les fans.</p>
          <button onClick={save} disabled={busy} className={cn(btnCls.primary, "mt-2 h-8")}>
            Enregistrer
          </button>
        </div>
      ) : null}
    </div>
  );
}
