"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";
import type { Creator } from "./types";
import { Avatar } from "@/components/ui";
import { cn } from "./fmt";

type Ctx = { creators: Creator[]; creatorId: string | null; creator: Creator | null; setCreator: (id: string) => void; loaded: boolean };
const C = createContext<Ctx>({ creators: [], creatorId: null, creator: null, setCreator: () => {}, loaded: false });
const KEY = "bloom.creator";

/** Créatrices de l'agence + celle choisie (gardée d'une page à l'autre). */
export function CreatorsProvider({ children }: { children: React.ReactNode }) {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [creatorId, setId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<Creator[]>("GET", "/api/creators")
      .then((list) => {
        setCreators(list);
        let id: string | null = null;
        try {
          id = new URLSearchParams(location.search).get("c") || localStorage.getItem(KEY);
        } catch {}
        setId(list.some((c) => c.id === id) ? id : (list[0]?.id ?? null));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  const setCreator = useCallback((id: string) => {
    setId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  }, []);
  const creator = creators.find((c) => c.id === creatorId) ?? null;
  return <C.Provider value={{ creators, creatorId, creator, setCreator, loaded }}>{children}</C.Provider>;
}

export const useCreators = () => useContext(C);

/** Onglets des créatrices (pages par créatrice : messagerie, fans, vault). */
export function CreatorTabs({ className }: { className?: string }) {
  const { creators, creatorId, setCreator } = useCreators();
  if (creators.length < 2) return null;
  return (
    <div className={cn("no-scrollbar flex gap-1.5 overflow-x-auto rounded-xl border bg-card/80 p-1 backdrop-blur", className)}>
      {creators.map((c) => (
        <button
          key={c.id}
          onClick={() => setCreator(c.id)}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg py-1 pr-3 pl-1 text-sm font-semibold whitespace-nowrap transition-colors",
            c.id === creatorId ? "bg-primary text-white" : "text-muted hover:bg-card-2 hover:text-fg",
          )}
        >
          <Avatar src={c.avatar} name={c.name} size="size-6" />
          {c.name}
        </button>
      ))}
    </div>
  );
}
