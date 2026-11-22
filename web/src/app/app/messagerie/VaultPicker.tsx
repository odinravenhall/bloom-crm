"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/fmt";
import type { Media } from "@/lib/types";
import { btnCls, inputCls } from "@/components/ui";

export type VaultList = { id: string; name: string; photos: number; videos: number; audios: number };

/** Vault de la créatrice : choisir des médias (gratuits ou en PPV) à joindre au message. */
export function VaultPicker({
  creatorId,
  initial,
  initialPrice,
  onClose,
  onDone,
}: {
  creatorId: string;
  initial: Media[];
  initialPrice: number;
  onClose: () => void;
  onDone: (m: Media[], price: number) => void;
}) {
  const [picked, setPicked] = useState(() => new Map(initial.map((m) => [m.id, m])));
  const [price, setPrice] = useState(initialPrice ? String(initialPrice) : "");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#2b1a26]/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-[min(720px,92vh)] w-[min(1000px,100%)] flex-col overflow-hidden rounded-(--radius-card) border bg-card">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <b>Vault</b>
          <span className="text-xs text-muted">{picked.size ? `${picked.size} sélectionné${picked.size > 1 ? "s" : ""}` : ""}</span>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-card-2 hover:text-fg">
            <X className="size-4" />
          </button>
        </header>
        <VaultBrowser
          creatorId={creatorId}
          picked={picked}
          onPick={(m) =>
            setPicked((p) => {
              const n = new Map(p);
              if (n.has(m.id)) n.delete(m.id);
              else n.set(m.id, m);
              return n;
            })
          }
        />
        <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
          <label className="text-xs font-semibold text-muted">Prix du PPV ($, vide = gratuit)</label>
          <input className={cn(inputCls, "w-28")} type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
          <button className={cn(btnCls.primary, "ml-auto")} onClick={() => onDone([...picked.values()], Math.max(0, Number(price) || 0))}>
            Ajouter au message
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Listes du vault à gauche, médias en grille (sélection optionnelle). Sert aussi à la page Vault. */
export function VaultBrowser({ creatorId, picked, onPick, onOpen }: { creatorId: string; picked?: Map<string, Media>; onPick?: (m: Media) => void; onOpen?: (m: Media) => void }) {
  const [lists, setLists] = useState<VaultList[] | null>(null);
  const [list, setList] = useState<string | null>(null);
  const [items, setItems] = useState<Media[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    setLists(null);
    setList(null);
    api<VaultList[]>("GET", `/api/vault/lists?creatorId=${encodeURIComponent(creatorId)}`)
      .then(setLists)
      .catch(() => setLists([]));
  }, [creatorId]);

  const load = async (reset: boolean) => {
    const p = new URLSearchParams({ creatorId });
    if (list) p.set("listId", list);
    if (!reset && cursor) p.set("cursor", cursor);
    if (reset) setState("loading");
    try {
      const r = await api<{ items: Media[]; nextCursor: string | null }>("GET", "/api/vault/medias?" + p);
      setItems((old) => (reset ? r.items : [...old, ...r.items]));
      setCursor(r.nextCursor);
      setState("ok");
    } catch (e) {
      setState((e as Error).message);
    }
  };
  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, list]);

  const btn = (id: string | null, name: string, sub?: string) => (
    <button key={id ?? "all"} onClick={() => setList(id)} className={cn("w-full rounded-xl px-3 py-2 text-left text-sm", list === id ? "bg-petal font-semibold text-primary-soft" : "hover:bg-card-2")}>
      {name}
      {sub ? <span className="block text-[11px] text-muted">{sub}</span> : null}
    </button>
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[230px_1fr]">
      <div className="scroll-thin hidden overflow-y-auto border-r p-2 md:block">
        {btn(null, "Tous les médias")}
        {(lists ?? []).map((l) => btn(l.id, l.name, `${l.photos} photos · ${l.videos} vidéos${l.audios ? ` · ${l.audios} vocaux` : ""}`))}
      </div>
      <div className="scroll-thin min-h-0 overflow-y-auto p-3">
        {state === "loading" ? <p className="text-sm text-muted">Chargement…</p> : null}
        {state !== "loading" && state !== "ok" ? <p className="text-sm font-semibold text-rose-300">{state}</p> : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
          {items.map((m) => {
            const on = picked?.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => (onPick ? onPick(m) : onOpen?.(m))}
                className={cn("relative aspect-square overflow-hidden rounded-xl border-2 bg-card-2", on ? "border-primary" : "border-transparent hover:border-line")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : null}
                {onPick ? (
                  <span className={cn("absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full", on ? "bg-primary" : "bg-black/55")}>{on ? <Check className="size-3.5" /> : null}</span>
                ) : null}
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1.5 text-[10px] font-bold">{m.type === "video" ? "▶ vidéo" : m.type === "audio" ? "🎤 vocal" : "photo"}</span>
                {m.price ? <span className="absolute right-1.5 bottom-1.5 rounded bg-black/65 px-1.5 text-[10px] font-bold text-emerald-300">${m.price}</span> : null}
              </button>
            );
          })}
        </div>
        {state === "ok" && !items.length ? <p className="text-sm text-muted">Aucun média</p> : null}
        {cursor ? (
          <button onClick={() => load(false)} className="mx-auto mt-3 block rounded-lg bg-card-2 px-3 py-1.5 text-xs font-semibold text-muted hover:text-fg">
            Charger plus
          </button>
        ) : null}
      </div>
    </div>
  );
}
