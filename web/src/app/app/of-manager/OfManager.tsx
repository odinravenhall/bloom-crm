"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Expand, KeyRound, Loader2, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/fmt";
import { useCreators } from "@/lib/creators";
import { ofPage } from "@/lib/ofmanager";
import { Avatar } from "@/components/ui";

type Site = { site: string; access: string };
// Fond du site OnlyFans en mode sombre (pour couvrir la marge sans couture).
const OF_BG = "#161618";
const KEY = "bloom.ofb.authorized"; // sessions déjà autorisées dans ce navigateur
const authorized = (site: string) => {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || "[]") as string[]).includes(site);
  } catch {
    return false;
  }
};
const remember = (site: string) => {
  try {
    const l = (JSON.parse(localStorage.getItem(KEY) || "[]") as string[]).filter((x) => x !== site);
    localStorage.setItem(KEY, JSON.stringify([site, ...l].slice(0, 60)));
  } catch {}
};

/**
 * OF Manager (comme Infloww) : à gauche les modèles (OnlyFans), en haut le nom de la page, au centre la page du vrai
 * site OnlyFans de la modèle (site intégré de Substy). Bloom ouvre la session ; ce navigateur l'autorise une fois
 * (connexion Substy de la personne), au plus toutes les 4 h par modèle.
 */
export function OfManager({ page }: { page: string }) {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const p = ofPage(page);
  const [sites, setSites] = useState<Record<string, Site>>({});
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  const [q, setQ] = useState("");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const box = useRef<HTMLDivElement>(null);
  const s = creatorId ? sites[creatorId] : undefined;

  // Messages à répondre par modèle (pastilles de la liste, comme Infloww).
  useEffect(() => {
    const load = () =>
      api<{ counts: Record<string, number> }>("GET", "/api/rv/inbox?tab=reply&window=72")
        .then((r) => setUnread(r.counts || {}))
        .catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(t);
  }, []);

  // Session du site de la modèle choisie (gardée pour revenir vite d'une modèle à l'autre).
  const open = useCallback(
    async (force = false) => {
      if (!creatorId) return;
      if (sites[creatorId] && !force) return;
      setErr("");
      try {
        const r = await api<Site>("GET", `/api/of-browser/open?creatorId=${encodeURIComponent(creatorId)}`);
        setSites((x) => ({ ...x, [creatorId]: r }));
        setOk((x) => ({ ...x, [creatorId]: authorized(r.site) }));
      } catch (e) {
        setErr((e as Error).message);
      }
    },
    [creatorId, sites],
  );
  useEffect(() => {
    open();
  }, [open]);

  const authorize = () => {
    if (!s || !creatorId) return;
    const w = window.open(s.access, "substy-access", "width=520,height=640");
    setTimeout(() => {
      try {
        w?.close();
      } catch {}
      remember(s.site);
      setOk((x) => ({ ...x, [creatorId]: true }));
      setN((x) => x + 1);
    }, 6000);
  };

  const path = p.path.replace("{user}", creator?.username || "");

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return creators.filter((c) => !t || `${c.name} ${c.username || ""}`.toLowerCase().includes(t));
  }, [creators, q]);

  // Le site OnlyFans a son propre menu à gauche (Home, Notifications…) et limite ses pages à 1000 px de contenu.
  // On l'affiche en 1300 px de large (sa grande mise en page : marge 10 + menu 280 + contenu 1000 + marge 10), on fait
  // sortir la marge et le menu à gauche (290 px) : le contenu est collé à gauche.
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    read();
    return () => ro.disconnect();
  }, []);
  // Taille normale (comme Infloww) ; réduit seulement si la place manque. Dans un navigateur, on ne peut pas étirer les
  // pages d'OnlyFans (1000 px de contenu) : l'espace en plus reste à droite.
  const scale = Math.min(1, Math.max(0.6, size.w / 1000));
  const frameStyle: React.CSSProperties = {
    left: 0,
    width: 1300,
    height: size.h / scale,
    transform: `scale(${scale}) translateX(-290px)`,
    transformOrigin: "0 0",
  };

  return (
    <div ref={box} className="flex h-full min-h-0 bg-bg">
      {/* Modèles */}
      <aside className="hidden w-[210px] shrink-0 flex-col border-r bg-panel-strong md:flex">
        <div className="flex gap-2 p-3">
          <div className="relative min-w-0 flex-1">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 w-full rounded-lg border bg-card-2/60 pr-8 pl-3 text-sm outline-none focus:border-primary" />
            <Search className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" />
          </div>
          <button onClick={() => open(true)} title="Rouvrir la session" className="grid size-9 shrink-0 place-items-center rounded-lg border bg-card-2/60 text-muted hover:text-fg">
            <RefreshCw className="size-4" />
          </button>
        </div>
        <p className="px-4 pb-1.5 text-xs font-semibold text-primary-soft">All creators</p>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-2">
          {list.map((c) => {
            const on = c.id === creatorId;
            const u = unread[c.id] || 0;
            return (
              <button key={c.id} onClick={() => setCreator(c.id)} className={cn("flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.04]", on && "bg-white/[0.08]")}>
                <span className="relative">
                  <Avatar src={c.avatar} name={c.name} size="size-9" rounded="rounded-lg" />
                  <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-panel-strong" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                {u ? <span className="rounded-full bg-rose-500/90 px-1.5 text-[10px] leading-4 font-bold text-white tabular-nums">{u > 99 ? "99+" : u}</span> : null}
              </button>
            );
          })}
          {!list.length ? <p className="px-4 py-3 text-xs text-muted">Aucune modèle</p> : null}
        </div>
      </aside>

      {/* Page */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <p.icon className="size-4 text-muted" />
          <h1 className="text-[15px] font-semibold">{p.title}</h1>
          {creator ? <span className="truncate text-xs text-muted">· {creator.name}</span> : null}
          <div className="ml-auto flex items-center gap-1">
            {s ? (
              <button onClick={authorize} title="Si la page ne s’affiche pas : autoriser à nouveau ce navigateur" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-card-2 hover:text-fg">
                <KeyRound className="size-4" />
              </button>
            ) : null}
            <button onClick={() => box.current?.requestFullscreen?.()} title="Plein écran" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-card-2 hover:text-fg">
              <Expand className="size-4" />
            </button>
            <button onClick={() => setN((x) => x + 1)} title="Recharger la page" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-card-2 hover:text-fg">
              <RefreshCw className="size-4" />
            </button>
          </div>
        </div>
        <div ref={area} className="relative min-h-0 flex-1 overflow-hidden" style={{ background: OF_BG }}>
          {!s && !err ? (
            <p className="absolute inset-0 grid place-items-center text-sm text-muted">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Ouverture du compte…
              </span>
            </p>
          ) : null}
          {err ? <p className="absolute inset-x-0 top-10 mx-auto max-w-lg rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-300">{err}</p> : null}
          {s && creatorId && !ok[creatorId] ? (
            <div className="absolute inset-0 grid place-items-center p-6">
              <div className="max-w-md rounded-2xl border bg-card p-6 text-center">
                <KeyRound className="mx-auto size-6" />
                <p className="mt-3 font-semibold">Ouvrir le compte de {creator?.name ?? "la modèle"}</p>
                <p className="mt-1 text-sm text-muted">Une petite fenêtre Substy s’ouvre quelques secondes pour autoriser ce navigateur (il faut être connecté à Substy). À refaire au plus toutes les 4 heures.</p>
                <button onClick={authorize} className="mt-4 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white">
                  Ouvrir le compte
                </button>
              </div>
            </div>
          ) : null}
          {s && creatorId && ok[creatorId] ? (
            <>
              <iframe
                key={`${s.site}${path}-${n}`}
                src={`${s.site}${path}?theme=dark`}
                title={`${p.title} · ${creator?.name ?? ""}`}
                style={frameStyle}
                className="absolute top-0 border-0"
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
