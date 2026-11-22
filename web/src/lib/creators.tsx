"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { api } from "./api";
import type { Creator } from "./types";
import { Avatar } from "@/components/ui";
import { PlatformLogo } from "@/components/PlatformLogo";
import { cn } from "./fmt";
import { usePathname } from "next/navigation";
import { getPf, isCommonPage, type Pf } from "./platform";

type Ctx = { creators: Creator[]; allCreators: Creator[]; pf: Pf; creatorId: string | null; creator: Creator | null; setCreator: (id: string) => void; loaded: boolean };
const C = createContext<Ctx>({ creators: [], allCreators: [], pf: "all", creatorId: null, creator: null, setCreator: () => {}, loaded: false });
const KEY = "bloom.creator";
const RECENT = "bloom.creator.recent";

// ---------------------------------------------------------------- plateforme (OnlyFans / MYM)
export type Platform = "of" | "mym";
export const platformOf = (c: { platform?: string | null } | null | undefined): Platform => (/mym/i.test(c?.platform || "") ? "mym" : "of");
export const PLATFORM: Record<Platform, string> = { of: "OnlyFans", mym: "MYM" };

/** Petite étiquette OF / MYM, à côté du nom de chaque créatrice (deux comptes peuvent avoir le même prénom). */
export function PlatformBadge({ c, className }: { c: { platform?: string | null } | null | undefined; className?: string }) {
  const p = platformOf(c);
  return (
    <span title={PLATFORM[p]} className={cn("inline-flex shrink-0 items-center", className)}>
      <PlatformLogo platform={p === "mym" ? "mym" : "onlyfans"} className="size-4 rounded-[4px]" />
    </span>
  );
}

/** Ordre stable : OnlyFans puis MYM, par nom. */
export const sortCreators = (l: Creator[]) => [...l].sort((a, b) => Number(platformOf(a) === "mym") - Number(platformOf(b) === "mym") || a.name.localeCompare(b.name, "fr"));

/** Créatrices de l'agence + celle choisie (gardée d'une page à l'autre). */
export function CreatorsProvider({ children }: { children: React.ReactNode }) {
  const [allCreators, setCreators] = useState<Creator[]>([]);
  const [pf, setPfState] = useState<Pf>("all");
  useEffect(() => setPfState(getPf()), []);
  // Plateforme choisie en haut du menu : seulement ses créatrices, sauf sur les pages communes (IA, équipe…).
  const path = usePathname() || "";
  const creators = useMemo(() => (isCommonPage(path) || pf === "all" ? allCreators : allCreators.filter((c) => platformOf(c) === pf)), [allCreators, pf, path]);
  const [creatorId, setId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<Creator[]>("GET", "/api/creators")
      .then((raw) => {
        const list = sortCreators(raw);
        setCreators(list);
        let id: string | null = null;
        try {
          id = new URLSearchParams(location.search).get("c") || localStorage.getItem(KEY);
        } catch {}
        setId(list.some((c) => c.id === id) ? id : (list.find((c) => getPf() === "all" || platformOf(c) === getPf())?.id ?? list[0]?.id ?? null));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  const setCreator = useCallback((id: string) => {
    setId(id);
    try {
      localStorage.setItem(KEY, id);
      const r = [id, ...(JSON.parse(localStorage.getItem(RECENT) || "[]") as string[]).filter((x) => x !== id)].slice(0, 5);
      localStorage.setItem(RECENT, JSON.stringify(r));
    } catch {}
  }, []);
  // La créatrice choisie doit être de la plateforme affichée (sinon : la première de la liste).
  const creator = creators.find((c) => c.id === creatorId) ?? creators[0] ?? null;
  return <C.Provider value={{ creators, allCreators, pf, creatorId: creator?.id ?? null, creator, setCreator, loaded }}>{children}</C.Provider>;
}

export const useCreators = () => useContext(C);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Choix de la créatrice (pages par créatrice : messagerie, scripts, vault, envoi groupé, IA).
 * Un seul bouton (photo, nom, OF / MYM) qui ouvre une liste avec recherche, rangée par plateforme, les dernières choisies en haut.
 * Tient avec 30, 50 créatrices ou plus. Clavier : taper pour chercher, ↑ ↓, Entrée, Échap.
 */
export function CreatorTabs({ className, align = "right" }: { className?: string; align?: "left" | "right" }) {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [plat, setPlat] = useState<"all" | Platform>("all");
  const [idx, setIdx] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setIdx(0);
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT) || "[]"));
    } catch {}
    requestAnimationFrame(() => input.current?.focus());
    const out = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [open]);

  const counts = useMemo(() => ({ of: creators.filter((c) => platformOf(c) === "of").length, mym: creators.filter((c) => platformOf(c) === "mym").length }), [creators]);
  // Sections affichées : « Récentes » (sans recherche), puis OnlyFans et MYM.
  const sections = useMemo(() => {
    const s = norm(q.trim());
    const match = (c: Creator) => (plat === "all" || platformOf(c) === plat) && (!s || norm(c.name + " " + (c.username || "")).includes(s));
    const out: { title: string; list: Creator[] }[] = [];
    if (!s && plat === "all" && creators.length > 8) {
      const r = recent.map((id) => creators.find((c) => c.id === id)).filter((c): c is Creator => !!c);
      if (r.length) out.push({ title: "Récentes", list: r });
    }
    for (const p of ["of", "mym"] as Platform[]) {
      const list = creators.filter((c) => platformOf(c) === p && match(c));
      if (list.length) out.push({ title: PLATFORM[p], list });
    }
    return out;
  }, [creators, q, plat, recent]);
  const flat = useMemo(() => sections.flatMap((s) => s.list), [sections]);
  useEffect(() => setIdx(0), [q, plat]);

  if (creators.length < 2) return null;
  const pick = (c: Creator) => {
    setCreator(c.id);
    setOpen(false);
  };
  let k = -1;

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn("flex max-w-full items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-sm font-semibold hover:border-primary/50", open && "border-primary/60")}
        title="Changer de créatrice"
      >
        <Avatar src={creator?.avatar} name={creator?.name} size="size-7" />
        <span className="truncate">{creator?.name ?? "Choisir une créatrice"}</span>
        {creator ? <PlatformBadge c={creator} /> : null}
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className={cn("absolute top-full z-40 mt-2 flex max-h-[min(560px,75vh)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-xl", align === "left" ? "left-0" : "right-0")}>
          <div className="flex flex-col gap-2 border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    if (flat.length) setIdx((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length);
                  } else if (e.key === "Enter" && flat[idx]) pick(flat[idx]);
                }}
                placeholder={`Chercher parmi ${creators.length} créatrices…`}
                className="h-9 w-full rounded-full border border-input bg-card-2/60 pr-3 pl-9 text-sm outline-none focus:border-primary"
              />
            </div>
            {/* Boutons OnlyFans / MYM : seulement quand les deux plateformes sont affichées (vue d'ensemble, pages communes). */}
            {counts.of && counts.mym ? <div className="flex gap-1">
              {(
                [
                  ["all", `Toutes · ${creators.length}`],
                  ["of", `OnlyFans · ${counts.of}`],
                  ["mym", `MYM · ${counts.mym}`],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => (setPlat(v), input.current?.focus())}
                  className={cn("flex-1 rounded-full border px-2 py-1 text-[11px] font-semibold", plat === v ? "border-primary bg-petal text-primary-soft" : "text-muted hover:text-fg")}
                >
                  {l}
                </button>
              ))}
            </div> : null}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1">
            {sections.map((s) => (
              <div key={s.title}>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{s.title}</p>
                {s.list.map((c) => {
                  k++;
                  const i = k;
                  return (
                    <button
                      key={s.title + c.id}
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => pick(c)}
                      className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left", i === idx ? "bg-card-2" : "")}
                    >
                      <Avatar src={c.avatar} name={c.name} size="size-8" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">{c.name}</span>
                          <PlatformBadge c={c} />
                        </span>
                        {c.username ? <span className="block truncate text-[11px] text-muted">@{c.username}</span> : null}
                      </span>
                      {c.id === creatorId ? <Check className="size-4 shrink-0 text-primary" /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
            {!flat.length ? <p className="p-4 text-center text-sm text-muted">Aucune créatrice trouvée</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
