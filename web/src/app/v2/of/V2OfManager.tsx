"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Expand, KeyRound, Loader2, RefreshCw, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { OF_PAGES, ofPage } from "@/lib/ofmanager";
import { Avatar } from "@/rv/components/ui";
import { PALETTE, Ring } from "../kit";

// Bloom v2 → OnlyFans → OF Manager (25/11/2026, « Constellation »). Remplace, dans la v2, `OfManager` (copie
// d'Infloww, qui reste dans la version actuelle). Même fonctionnement : le vrai site OnlyFans de la modèle, affiché
// par Substy (`GET /api/of-browser/open` → `site` + `access`) ; ce navigateur l'autorise une fois en ouvrant quelques
// secondes la petite fenêtre Substy (`access`), au plus toutes les 4 h par modèle (gardé dans `bloom.ofb.authorized`,
// la même clé que l'ancien écran). La page ouverte est dans l'adresse (« ?p=vault »), la modèle aussi (« c= »).
type Site = { site: string; access: string };
const KEY = "bloom.ofb.authorized";
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

export function V2OfManager() {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [page, setPage] = useState("home");
  const [sites, setSites] = useState<Record<string, Site>>({});
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  const [q, setQ] = useState("");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [waiting, setWaiting] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const p = ofPage(page);
  const s = creatorId ? sites[creatorId] : undefined;

  useEffect(() => setPage(ofPage(new URLSearchParams(window.location.search).get("p") || undefined).key), []);
  const go = (key: string) => {
    setPage(key);
    const u = new URL(window.location.href);
    if (key === "home") u.searchParams.delete("p");
    else u.searchParams.set("p", key);
    window.history.replaceState(null, "", u);
  };
  // Fans qui attendent une réponse, par modèle (pastilles de la colonne).
  useEffect(() => {
    const load = () => api<{ counts: Record<string, number> }>("GET", "/api/rv/inbox?tab=reply").then((r) => setUnread(r.counts || {})).catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(t);
  }, []);
  // La session du site de la modèle choisie (gardée pour passer vite d'une modèle à l'autre).
  const open = useCallback(
    async (force = false) => {
      if (!creatorId || (sites[creatorId] && !force)) return;
      setErr("");
      try {
        const r = await api<Site>("GET", `/api/of-browser/open?creatorId=${encodeURIComponent(creatorId)}`);
        setSites((x) => ({ ...x, [creatorId]: r }));
        setOk((x) => ({ ...x, [creatorId]: authorized(r.site) }));
        if (force) setN((x) => x + 1);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ouverture impossible");
      }
    },
    [creatorId, sites],
  );
  useEffect(() => void open(), [open]);
  const authorize = () => {
    if (!s || !creatorId) return;
    const w = window.open(s.access, "substy-access", "width=520,height=640");
    setWaiting(true);
    setTimeout(() => {
      try {
        w?.close();
      } catch {}
      remember(s.site);
      setOk((x) => ({ ...x, [creatorId]: true }));
      setN((x) => x + 1);
      setWaiting(false);
    }, 6000);
  };

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return creators.filter((c) => !t || `${c.name} ${c.username || ""}`.toLowerCase().includes(t));
  }, [creators, q]);
  const colorOf = (id: string) => PALETTE[Math.max(0, creators.findIndex((c) => c.id === id)) % PALETTE.length];
  const path = p.path.replace("{user}", creator?.username || "");

  // Le site OnlyFans fait 1300 px (marge + son menu de 290 px + 1000 px de contenu) : on cache sa marge et son menu
  // à gauche, et on réduit seulement si la place manque (comme l'ancien écran).
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
  const scale = Math.min(1, Math.max(0.6, size.w / 1000));
  const frame: React.CSSProperties = { left: 0, width: 1300, height: size.h / scale, transform: `scale(${scale}) translateX(-290px)`, transformOrigin: "0 0" };

  return (
    <div ref={box} className="flex h-full min-h-0 gap-3 p-3" style={{ background: "var(--color-bg)" }}>
      {/* Les modèles */}
      <aside className="v2-card hidden w-[232px] shrink-0 flex-col p-1.5 md:flex">
        <div className="flex gap-1.5 p-1">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)" }}>
            <Search className="size-4 shrink-0 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une modèle" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
          </label>
          <button onClick={() => void open(true)} title="Rouvrir la session de la modèle" aria-label="Rouvrir la session" className="v2-sq" style={{ width: 36, height: 36 }}><RefreshCw className="size-4" /></button>
        </div>
        <p className="px-2 pt-2 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">Modèles OnlyFans</p>
        <div className="v2-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {list.map((c) => {
            const u = unread[c.id] || 0;
            return (
              <button key={c.id} onClick={() => setCreator(c.id)} className="v2-pick w-full" data-on={c.id === creatorId} aria-pressed={c.id === creatorId}>
                <Ring color={colorOf(c.id)}><Avatar src={c.avatar} name={c.name} size="size-8" /></Ring>
                <span className="min-w-0 flex-1 text-left">
                  <b className="block truncate text-[13px] leading-tight">{c.name}</b>
                  <span className="block truncate text-[11.5px] text-muted">{sites[c.id] ? (ok[c.id] ? "ouvert" : "à autoriser") : c.username ? `@${c.username}` : "OnlyFans"}</span>
                </span>
                {u ? <span className="v2-badge" title={`${u} fan${u > 1 ? "s" : ""} à répondre`}>{u > 99 ? "99+" : u}</span> : null}
              </button>
            );
          })}
          {!list.length ? <p className="px-2 py-3 text-[12px] text-muted">Aucune modèle.</p> : null}
        </div>
      </aside>

      {/* La page d'OnlyFans */}
      <section className="v2-card flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
          <div className="v2-noscroll flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {OF_PAGES.map((x) => (
              <button key={x.key} onClick={() => go(x.key)} className="v2-chip" data-on={x.key === page}><x.icon className="size-3.5" />{LABEL[x.key] ?? x.label}</button>
            ))}
          </div>
          <span className="flex shrink-0 items-center gap-1">
            {creator ? <span className="mr-1 hidden max-w-[160px] truncate text-[12.5px] font-semibold lg:inline">{creator.name}</span> : null}
            {s ? <button onClick={authorize} title="Autoriser ce navigateur à nouveau" aria-label="Autoriser à nouveau" className="v2-sq"><KeyRound className="size-4" /></button> : null}
            <button onClick={() => box.current?.requestFullscreen?.()} title="Plein écran" aria-label="Plein écran" className="v2-sq"><Expand className="size-4" /></button>
            <button onClick={() => setN((x) => x + 1)} title="Recharger la page" aria-label="Recharger" className="v2-sq"><RefreshCw className="size-4" /></button>
          </span>
        </div>
        <div ref={area} className="relative min-h-0 flex-1 overflow-hidden" style={{ background: "#0b0b0d" }}>
          {!s && !err ? <p className="absolute inset-0 grid place-items-center text-[13px] text-muted"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Ouverture du compte…</span></p> : null}
          {err ? <p className="absolute inset-x-4 top-8 mx-auto max-w-lg rounded-xl border px-4 py-3 text-center text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
          {s && creatorId && !ok[creatorId] ? (
            <div className="absolute inset-0 grid place-items-center p-6">
              <div className="v2-card max-w-md p-6 text-center" style={{ background: "#0e0e11" }}>
                <span className="mx-auto grid size-12 place-items-center rounded-2xl" style={{ background: "rgb(59 130 246 / 0.14)", color: "var(--v2-sky)" }}><KeyRound className="size-5" /></span>
                <p className="mt-3 text-[16px] font-bold">Ouvrir le compte de {creator?.name}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">Une petite fenêtre Substy s’ouvre quelques secondes pour autoriser ce navigateur (il faut être connecté à Substy). À refaire au plus toutes les 4 heures.</p>
                <button onClick={authorize} disabled={waiting} className="v2-btn mt-4">{waiting ? "Autorisation…" : "Ouvrir le compte"}</button>
              </div>
            </div>
          ) : null}
          {s && creatorId && ok[creatorId] ? (
            <iframe key={`${s.site}${path}-${n}`} src={`${s.site}${path}?theme=dark`} title={`${LABEL[p.key] ?? p.title} · ${creator?.name ?? ""}`} style={frame} className="absolute top-0 border-0" allow="clipboard-read; clipboard-write; fullscreen" />
          ) : null}
        </div>
      </section>
    </div>
  );
}

// Les pages, en français (les mêmes que dans le menu du site OnlyFans).
const LABEL: Record<string, string> = {
  home: "Accueil", "new-post": "Nouvelle publication", notifications: "Notifications", messages: "Messages", vault: "Vault", queue: "File d’attente",
  collections: "Collections", statements: "Relevés", statistics: "Statistiques", profile: "Mon profil", settings: "Réglages OF", "release-forms": "Formulaires de cession",
};
