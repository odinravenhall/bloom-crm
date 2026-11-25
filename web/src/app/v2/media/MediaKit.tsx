"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownUp, AudioLines, Check, Eye, Folder, Image as ImageIcon, Layers, ListOrdered, Mic, Play, Search, StickyNote, Tag, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import type { Pf } from "@/lib/platform";
import { cash, int, Modal } from "../kit";

// Bloom v2 → Médias : les pièces communes à l'écran « Médias » et à la fenêtre de choix des médias (messagerie,
// scripts). Une seule lecture pour OnlyFans et MYM : `GET /api/v2/medias` (modèles, dossiers) et
// `GET /api/v2/medias/items` (une page de médias), voir app/v2medias.mjs.
export type MediaItem = {
  id: string; type: "photo" | "video" | "audio"; thumb: string | null; full: string | null; duration: number | null; createdAt: string | null;
  /** Nom du fichier (MYM) ; description : celle de MYM, ou ce que l'IA de Substy a noté (OnlyFans). */
  name: string; caption: string;
  /** Mots-clés de l'IA de Substy, scripts de l'IA qui envoient ce média, étapes concernées. */
  tags: string[]; ai: string[]; steps: string[];
  /** OnlyFans, quand on a donné un fan : il l'a déjà acheté. MYM : déjà publié sur le compte. */
  bought: boolean; usedPublic: boolean; usedPrivate: boolean;
  /** Adresses qui ne périment pas (OnlyFans) : celles qu'on garde dans un script ou une catégorie. */
  keepThumb: string | null; keepFull: string | null;
  /** La fiche que l'équipe remplit dans Bloom, et le nombre de scripts de Bloom qui utilisent le média. */
  note: string; labels: string[]; price: number | null; catId: number | null; by: string | null; at: number | null; scripts: number;
};
export type MediaFolder = { id: string; name: string; photos: number; videos: number; audios: number; total: number; system: boolean };
export type MediaCat = { id: number; name: string; count: number };
export type MediaHead = {
  platform: Pf; currency: string; canEdit: boolean; onSubsty: boolean; error: string | null;
  list: { id: string; name: string; avatar: string | null; fiches: number }[];
  model: { id: string; name: string; avatar: string | null } | null;
  folders: MediaFolder[]; cats: MediaCat[];
};
export type MediaType = "" | "photo" | "video" | "audio";
export type MediaQuery = { folder: string; cat: number; type: MediaType; q: string; sort: "new" | "old"; scripts: "" | "with" | "without" };
export const EMPTY_QUERY: MediaQuery = { folder: "", cat: 0, type: "", q: "", sort: "new", scripts: "" };
/** Un média choisi, dans la forme que gardent les scripts (`lib_items.medias`). */
export type PickedMedia = { id: string; type: string; thumb: string | null; full: string | null; duration: number | null };

export const plural = (n: number, one: string, many = `${one}s`) => `${int(n)} ${n > 1 ? many : one}`;
export const errText = (e: unknown) => (e instanceof Error ? e.message : "Action impossible");
export const clockOf = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
export const TYPE_NAME: Record<MediaItem["type"], string> = { photo: "Photo", video: "Vidéo", audio: "Vocal" };
export const priceOf = (p: number, cur: string) => cash(Math.round(p * 100), cur, Number.isInteger(p) ? 0 : 2);
export const countsOf = (f: { photos: number; videos: number; audios: number; total: number }) =>
  [f.photos ? plural(f.photos, "photo") : "", f.videos ? plural(f.videos, "vidéo") : "", f.audios ? plural(f.audios, "vocal", "vocaux") : ""].filter(Boolean).join(" · ") || (f.total ? plural(f.total, "média") : "vide");

/** La valeur, une fois qu'on a arrêté de taper depuis `ms`. */
export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Les modèles de la plateforme affichée, puis les dossiers et catégories de la modèle choisie. */
export function useMediaHead(pf: Pf, creatorId: string) {
  const [data, setData] = useState<{ key: string; head: MediaHead } | null>(null);
  const [err, setErr] = useState("");
  const seq = useRef(0);
  const reload = useCallback(
    (fresh = false) => {
      const id = ++seq.current;
      return api<MediaHead>("GET", `/api/v2/medias?pf=${pf}${creatorId ? `&creatorId=${encodeURIComponent(creatorId)}` : ""}${fresh ? "&fresh=1" : ""}`)
        .then((head) => void (id === seq.current && (setData({ key: creatorId, head }), setErr(""))))
        .catch((e) => void (id === seq.current && setErr(errText(e))));
    },
    [pf, creatorId],
  );
  useEffect(() => void reload(), [reload]);
  return { head: data?.head ?? null, stale: !!data && data.key !== creatorId, err, reload };
}

/** Les médias qui répondent à `query`, page après page. `items` vaut null tant que la première page n'est pas là. */
export function useMediaItems(pf: Pf, creatorId: string, query: MediaQuery, fanId = "") {
  const key = creatorId ? JSON.stringify([pf, creatorId, query, fanId]) : "";
  const [st, setSt] = useState<{ key: string; items: MediaItem[]; next: string | null; total: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef(0);
  const fetchPage = useCallback(
    async (cursor: string | null) => {
      if (!key) return;
      const id = ++seq.current;
      setBusy(true);
      const p = new URLSearchParams({ pf, creatorId });
      if (query.cat) p.set("cat", String(query.cat));
      else if (query.folder) p.set("folder", query.folder);
      if (query.type) p.set("type", query.type);
      if (query.q) p.set("q", query.q);
      if (query.sort === "old") p.set("sort", "old");
      if (query.scripts) p.set("scripts", query.scripts);
      if (fanId) p.set("fanId", fanId);
      if (cursor) p.set("cursor", cursor);
      try {
        const r = await api<{ items: MediaItem[]; next: string | null; total: number | null }>("GET", `/api/v2/medias/items?${p}`);
        if (id !== seq.current) return;
        setSt((cur) => {
          if (!cursor || !cur || cur.key !== key) return { key, items: r.items, next: r.next, total: r.total };
          const seen = new Set(cur.items.map((i) => i.id));
          return { key, items: [...cur.items, ...r.items.filter((i) => !seen.has(i.id))], next: r.next, total: cur.total };
        });
        setErr("");
      } catch (e) {
        if (id !== seq.current) return;
        setErr(errText(e));
        if (!cursor) setSt({ key, items: [], next: null, total: null });
      } finally {
        if (id === seq.current) setBusy(false);
      }
    },
    // `query` et `fanId` sont dans `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  useEffect(() => void fetchPage(null), [fetchPage]);
  const cur = st && st.key === key ? st : null;
  return {
    items: cur ? cur.items : null, next: cur?.next ?? null, total: cur?.total ?? null, busy, err,
    more: () => void (cur?.next && !busy && fetchPage(cur.next)),
    reload: () => fetchPage(null),
    /** Reporte tout de suite une fiche enregistrée sur les médias affichés. */
    patch: (ids: string[], part: Partial<MediaItem>) => setSt((x) => (x ? { ...x, items: x.items.map((i) => (ids.includes(i.id) ? { ...i, ...part } : i)) } : x)),
  };
}

/** Appelle `onEnd` quand le bas de la liste approche (dans la page, ou dans `root` si la liste défile dans un cadre). */
export function useEndReached(onEnd: () => void, active: boolean, dep: unknown, root?: React.RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onEnd);
  cb.current = onEnd;
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && cb.current(), { root: root?.current ?? null, rootMargin: "500px" });
    io.observe(el);
    return () => io.disconnect();
    // `dep` : après chaque page reçue on regarde de nouveau (la page peut ne pas avoir rempli l'écran).
  }, [active, dep, root]);
  return ref;
}

// ---------------------------------------------------------------- un média dans la grille
export function MediaTile({ m, cur, on = false, selecting = false, onMain, onToggle, onPreview }: {
  m: MediaItem; cur: string; on?: boolean; selecting?: boolean; onMain: () => void; onToggle?: () => void; onPreview?: () => void;
}) {
  const used = m.scripts + m.ai.length;
  const about = [
    TYPE_NAME[m.type] + (m.duration ? ` de ${clockOf(m.duration)}` : ""),
    m.name,
    m.bought ? "déjà acheté par ce fan" : "",
    used ? `utilisé dans ${plural(used, "script")}` : "",
    m.usedPublic ? "déjà posté en public" : m.usedPrivate ? "déjà posté en privé" : "",
    m.price ? `prix conseillé ${priceOf(m.price, cur)}` : "",
    m.note ? `note : ${m.note}` : "",
  ].filter(Boolean).join(" · ");
  const pill = "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] leading-none font-bold";
  const dark = { background: "rgb(0 0 0 / 0.62)", color: "#fff" };
  return (
    <div className="group relative overflow-hidden rounded-[12px]" style={{ aspectRatio: "4 / 5", background: "var(--color-card-2)" }}>
      <button type="button" onClick={onMain} aria-pressed={onToggle ? on : undefined} title={about} className="absolute inset-0 block size-full text-left">
        {m.type === "audio" ? (
          <span className="grid size-full place-items-center px-2 text-center">
            <span className="min-w-0">
              <span className="mx-auto grid size-10 place-items-center rounded-full" style={{ background: "rgb(59 130 246 / 0.16)", color: "var(--v2-sky)" }}><Mic className="size-5" /></span>
              <span className="mt-2 line-clamp-2 block text-[11.5px] leading-snug font-semibold break-words">{m.name || "Vocal"}</span>
            </span>
          </span>
        ) : m.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.thumb} alt="" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.visibility = "hidden")} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
        ) : (
          <span className="grid size-full place-items-center text-muted"><ImageIcon className="size-7" /></span>
        )}
      </button>
      {on ? <span className="pointer-events-none absolute inset-0 rounded-[12px]" style={{ boxShadow: "inset 0 0 0 2px var(--v2-blue)", background: "rgb(59 130 246 / 0.18)" }} /> : null}
      <span className="pointer-events-none absolute top-1.5 left-1.5 flex max-w-[calc(100%-40px)] flex-wrap gap-1">
        {m.bought ? <span className={pill} style={{ background: "rgb(52 211 153 / 0.95)", color: "#04130d" }}>Déjà acheté</span> : null}
        {used ? <span className={pill} style={dark}><ListOrdered className="size-3" />{used}</span> : null}
        {m.note || m.labels.length ? <span className={pill} style={dark}><StickyNote className="size-3" /></span> : null}
        {m.usedPublic || m.usedPrivate ? <span className={pill} style={dark}>{m.usedPublic ? "Posté" : "Posté · privé"}</span> : null}
      </span>
      <span className={`pointer-events-none absolute bottom-1.5 left-1.5 flex items-end justify-between gap-1 ${onPreview ? "right-10" : "right-1.5"}`}>
        {m.type !== "photo" && m.duration ? <span className={pill} style={dark}>{m.type === "video" ? <Play className="size-2.5 fill-current" /> : <AudioLines className="size-3" />}<span className="v2-num">{clockOf(m.duration)}</span></span> : m.type === "video" ? <span className={pill} style={dark}><Play className="size-2.5 fill-current" />Vidéo</span> : <span />}
        {m.price ? <span className={`${pill} v2-num`} style={{ background: "rgb(0 0 0 / 0.7)", color: "var(--v2-up)" }}>{priceOf(m.price, cur)}</span> : null}
      </span>
      {onPreview ? (
        <button type="button" onClick={onPreview} title="Voir en grand" aria-label="Voir en grand" className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" style={{ background: "rgb(0 0 0 / 0.7)" }}><Eye className="size-3.5" /></button>
      ) : null}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={on ? "Retirer de la sélection" : "Ajouter à la sélection"}
          className={`absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full transition-opacity ${on || selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
          style={on ? { background: "var(--v2-blue)", color: "#fff" } : { background: "rgb(0 0 0 / 0.45)", boxShadow: "inset 0 0 0 1.5px rgb(255 255 255 / 0.8)" }}
        >
          {on ? <Check className="size-3.5" /> : null}
        </button>
      ) : null}
    </div>
  );
}

/** La grille, ses états (chargement, vide, erreur) et le chargement de la suite. */
export function MediaGrid({ lib, min = 150, empty, root, children }: {
  lib: ReturnType<typeof useMediaItems>; min?: number; empty: React.ReactNode; root?: React.RefObject<HTMLElement | null>; children: (m: MediaItem) => React.ReactNode;
}) {
  const end = useEndReached(lib.more, !!lib.next && !lib.busy, lib.items?.length ?? 0, root);
  if (lib.items === null) return <p className="py-16 text-center text-[13px] text-muted">Chargement des médias…</p>;
  return (
    <>
      {lib.err ? (
        <p className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>
          <span className="min-w-0 flex-1">{lib.err}</span>
          <button type="button" onClick={() => void lib.reload()} className="v2-seg border" style={{ borderColor: "rgb(244 63 94 / 0.35)", color: "inherit" }}>Réessayer</button>
        </p>
      ) : null}
      {lib.items.length ? <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>{lib.items.map((m) => <div key={m.id}>{children(m)}</div>)}</div> : lib.err ? null : lib.next ? null : <div className="py-14 text-center text-[13px] text-muted">{empty}</div>}
      <div ref={end} />
      {lib.next ? <p className="py-5 text-center"><button type="button" disabled={lib.busy} onClick={lib.more} className="v2-btn" data-kind="ghost" style={{ height: 34 }}>{lib.busy ? "Chargement…" : "Charger la suite"}</button></p> : null}
    </>
  );
}

// ---------------------------------------------------------------- dossiers
/** Une ligne de la colonne des dossiers. */
export function FolderRow({ on, icon, name, sub, onClick, right }: { on: boolean; icon: React.ReactNode; name: string; sub?: string; onClick: () => void; right?: React.ReactNode }) {
  return (
    <div className="group/row flex items-center rounded-[10px]" style={on ? { background: "rgb(59 130 246 / 0.13)", boxShadow: "inset 2px 0 0 var(--v2-blue)" } : undefined}>
      <button type="button" onClick={onClick} aria-pressed={on} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg border" style={{ borderColor: "var(--color-line)", color: on ? "var(--v2-sky)" : "var(--color-muted)" }}>{icon}</span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[12.5px] leading-tight">{name}</b>
          {sub ? <span className="mt-0.5 block truncate text-[11px] text-muted">{sub}</span> : null}
        </span>
      </button>
      {right}
    </div>
  );
}

/**
 * La colonne des dossiers : « Tous les médias », les dossiers de la plateforme (listes du vault OnlyFans, collections
 * du compte MYM), puis les catégories de Bloom (OnlyFans). `tools` : les boutons de l'écran Médias (créer, renommer).
 */
export function MediaFolders({ head, query, onPick, tools }: {
  head: MediaHead; query: MediaQuery; onPick: (part: Pick<MediaQuery, "folder" | "cat">) => void;
  tools?: { newFolder?: React.ReactNode; newCat?: React.ReactNode; cat?: (c: MediaCat) => React.ReactNode };
}) {
  const [fq, setFq] = useState("");
  const word = fq.trim().toLowerCase();
  const hit = (name: string) => !word || name.toLowerCase().includes(word);
  const mine = head.folders.filter((f) => !f.system && hit(f.name));
  const auto = head.folders.filter((f) => f.system && hit(f.name));
  const cats = head.cats.filter((c) => hit(c.name));
  const mym = head.platform === "mym";
  const label = "flex items-center justify-between px-2 pt-3 pb-1 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase";
  return (
    <div>
      {head.folders.length + head.cats.length > 8 ? (
        <label className="mb-1.5 flex h-8 items-center gap-2 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)" }}><Search className="size-3.5 shrink-0 text-muted" /><input value={fq} onChange={(e) => setFq(e.target.value)} placeholder="Chercher un dossier" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#5d5d66]" /></label>
      ) : null}
      <FolderRow on={!query.folder && !query.cat} icon={<Layers className="size-3.5" />} name="Tous les médias" sub={mym ? "Tout le MYM Cloud" : "Tout le vault"} onClick={() => onPick({ folder: "", cat: 0 })} />
      <p className={label}><span>{mym ? "Collections MYM" : "Listes OnlyFans"}</span>{tools?.newFolder}</p>
      <div className="space-y-0.5">
        {mine.map((f) => <FolderRow key={f.id} on={query.folder === f.id && !query.cat} icon={<Folder className="size-3.5" />} name={f.name || "Sans nom"} sub={countsOf(f)} onClick={() => onPick({ folder: f.id, cat: 0 })} />)}
        {!mine.length ? <p className="px-2 py-1.5 text-[12px] text-muted">{word ? "Aucun dossier à ce nom." : mym ? "Aucune collection sur ce compte." : "Aucune liste créée dans OnlyFans."}</p> : null}
      </div>
      {auto.length ? (
        <>
          <p className={label} title="OnlyFans range lui-même ici ce qui a été envoyé en message, posté, mis en story…"><span>Rangés par OnlyFans</span></p>
          <div className="space-y-0.5">{auto.map((f) => <FolderRow key={f.id} on={query.folder === f.id && !query.cat} icon={<Folder className="size-3.5" />} name={f.name} sub={countsOf(f)} onClick={() => onPick({ folder: f.id, cat: 0 })} />)}</div>
        </>
      ) : null}
      {!mym && (head.cats.length || tools?.newCat) ? (
        <>
          <p className={label} title="Des dossiers propres à Bloom, pour ranger les médias sans toucher au vault d’OnlyFans"><span>Catégories Bloom</span>{tools?.newCat}</p>
          <div className="space-y-0.5">
            {cats.map((c) => <FolderRow key={c.id} on={query.cat === c.id} icon={<Tag className="size-3.5" />} name={c.name} sub={c.count ? plural(c.count, "média") : "vide"} onClick={() => onPick({ folder: "", cat: c.id })} right={tools?.cat?.(c)} />)}
            {!cats.length ? <p className="px-2 py-1.5 text-[12px] text-muted">{word ? "Aucune catégorie à ce nom." : "Aucune pour l’instant."}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- recherche et filtres
export function MediaFilters({ head, query, set, q, setQ, children }: {
  head: MediaHead; query: MediaQuery; set: (part: Partial<MediaQuery>) => void; q: string; setQ: (s: string) => void; children?: React.ReactNode;
}) {
  const mym = head.platform === "mym";
  const types: [MediaType, string][] = [["", "Tous"], ["photo", "Photos"], ["video", "Vidéos"], ["audio", mym ? "Vocaux" : "Audios"]];
  // Vocaux MYM : rangés à part dans le cloud, pas dans les collections. Une catégorie Bloom se lit en une fois.
  const noAudio = mym && !!query.folder;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)" }}>
        <Search className="size-3.5 shrink-0 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={query.cat ? "Chercher dans les notes et mots-clés" : mym ? "Chercher (description, référence, tag)" : "Chercher (description, mot-clé de l’IA)"} className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#5d5d66]" />
        {q ? <button type="button" onClick={() => setQ("")} aria-label="Effacer la recherche" className="text-muted hover:text-(--color-fg)"><X className="size-3.5" /></button> : null}
      </label>
      <div className="v2-segbar">
        {types.filter(([k]) => k !== "audio" || !noAudio).map(([k, l]) => <button key={k || "all"} type="button" className="v2-seg" data-on={query.type === k} onClick={() => set({ type: k })}>{l}</button>)}
      </div>
      {!mym && !query.cat ? (
        <>
          <button type="button" onClick={() => set({ sort: query.sort === "new" ? "old" : "new" })} className="v2-select" title="Changer l’ordre"><ArrowDownUp className="size-3.5 text-muted" />{query.sort === "new" ? "Récents d’abord" : "Anciens d’abord"}</button>
          {head.onSubsty ? (
            <select value={query.scripts} onChange={(e) => set({ scripts: e.target.value as MediaQuery["scripts"] })} className="v2-select bg-transparent outline-none" style={{ colorScheme: "dark" }} title="Médias que l’IA de Substy envoie déjà dans un de ses scripts, ou pas encore" aria-label="Scripts de l’IA">
              <option value="" style={{ background: "#121215" }}>IA : tous</option>
              <option value="with" style={{ background: "#121215" }}>IA : déjà dans un script</option>
              <option value="without" style={{ background: "#121215" }}>IA : dans aucun script</option>
            </select>
          ) : null}
        </>
      ) : null}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- voir un média en grand
type HlsLib = { isSupported: () => boolean; new (): { loadSource: (u: string) => void; attachMedia: (v: HTMLVideoElement) => void; destroy: () => void; on: (e: string, f: (e: unknown, d: { fatal?: boolean }) => void) => void } };
let hlsLoading: Promise<HlsLib | null> | null = null;
/** hls.js (copié dans /public) chargé une seule fois, à la première vidéo de MYM. */
const loadHls = () =>
  (hlsLoading ??= new Promise((ok) => {
    const w = window as unknown as { Hls?: HlsLib };
    if (w.Hls) return ok(w.Hls);
    const s = document.createElement("script");
    s.src = "/hls.light.min.js";
    s.onload = () => ok(w.Hls ?? null);
    s.onerror = () => ok(null);
    document.head.appendChild(s);
  }));

/** Une vidéo : fichier simple (OnlyFans, relayé par Bloom) ou flux HLS de MYM (relayé par « /api/mym/hls »). */
function Video({ src, poster }: { src: string; poster: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!/\.m3u8(\?|$)/.test(src)) {
      v.src = src;
      return;
    }
    const relay = `/api/mym/hls?u=${btoa(src).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    let hls: InstanceType<HlsLib> | null = null;
    let off = false;
    void loadHls().then((Hls) => {
      if (off) return;
      if (Hls?.isSupported()) {
        hls = new Hls();
        hls.on("hlsError", (_e, d) => d.fatal && setErr("Lecture impossible : le lien de MYM a peut-être expiré. Ferme, actualise la liste puis rouvre la vidéo."));
        hls.loadSource(relay);
        hls.attachMedia(v);
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) v.src = relay;
      else setErr("Ce navigateur ne sait pas lire cette vidéo.");
    });
    return () => {
      off = true;
      hls?.destroy();
    };
  }, [src]);
  return (
    <>
      <video ref={ref} poster={poster ?? undefined} controls playsInline onError={() => setErr((x) => x || "Lecture impossible pour l’instant.")} className="size-full rounded-lg bg-black object-contain" />
      {err ? <p className="absolute inset-x-3 bottom-3 rounded-lg px-3 py-2 text-center text-[12.5px]" style={{ background: "rgb(0 0 0 / 0.78)", color: "var(--v2-down)" }}>{err}</p> : null}
    </>
  );
}

/** Photo, vidéo ou vocal en grand : remplit le cadre que lui donne le parent (qui doit avoir une hauteur). */
export function MediaView({ m }: { m: Pick<MediaItem, "id" | "type" | "thumb" | "full" | "name"> & { keepFull?: string | null } }) {
  // Une photo entière passe par Bloom (quelques secondes) : on montre la vignette tout de suite, puis le fichier dès
  // qu'il est là. Si son adresse a péri (page restée ouverte longtemps), on prend celle par identifiant.
  const [big, setBig] = useState<string | null>(null);
  const [wait, setWait] = useState(false);
  useEffect(() => {
    setBig(null);
    setWait(false);
    if (m.type !== "photo") return;
    const tries = [m.full, m.keepFull].filter((u, i, a): u is string => !!u && a.indexOf(u) === i);
    if (!tries.length) return;
    let off = false;
    setWait(true);
    const load = (k: number) => {
      if (off) return;
      if (k >= tries.length) return setWait(false);
      const im = new Image();
      im.onload = () => void (!off && (setBig(tries[k]), setWait(false)));
      im.onerror = () => load(k + 1);
      im.src = tries[k];
    };
    load(0);
    return () => {
      off = true;
    };
  }, [m.id, m.type, m.full, m.keepFull]);
  const src = big || m.thumb;
  return (
    <div className="relative flex size-full items-center justify-center overflow-hidden">
      {m.type === "video" && m.full ? (
        <Video key={`${m.id}:${m.full}`} src={m.full} poster={m.thumb} />
      ) : m.type === "audio" ? (
        m.full ? (
          <div className="w-full px-5 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full" style={{ background: "rgb(59 130 246 / 0.16)", color: "var(--v2-sky)" }}><Mic className="size-7" /></span>
            {m.name ? <p className="mt-3 text-[13.5px] font-semibold">{m.name}</p> : null}
            <audio key={m.id} src={m.full} controls className="mx-auto mt-4 w-full max-w-[420px]" />
          </div>
        ) : <p className="text-[13px] text-muted">Écoute indisponible pour ce vocal.</p>
      ) : src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className={`max-w-full rounded-lg object-contain ${big ? "max-h-full" : "h-full"}`} />
          {wait ? <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11.5px] font-semibold text-white" style={{ background: "rgb(0 0 0 / 0.72)" }}>Chargement de la photo…</span> : null}
        </>
      ) : <p className="text-[13px] text-muted">{wait ? "Chargement de la photo…" : "Aperçu indisponible."}</p>}
    </div>
  );
}

/** Un média en plein écran, par-dessus une fenêtre (aperçu dans la fenêtre de choix). */
export function Lightbox({ m, onClose }: { m: MediaItem; onClose: () => void }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => setHost(document.querySelector(".v2")), []);
  useEffect(() => {
    // En phase de capture : Échap ferme l'aperçu, pas la fenêtre qui est dessous.
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    document.addEventListener("keydown", esc, true);
    return () => document.removeEventListener("keydown", esc, true);
  }, [onClose]);
  if (!host) return null;
  return createPortal(
    <div className="v2-fade-in fixed inset-0 z-[96] grid place-items-center p-4" style={{ background: "rgb(0 0 0 / 0.86)" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <button type="button" onClick={onClose} aria-label="Fermer l’aperçu" className="v2-sq absolute top-4 right-4" style={{ background: "#121215" }}><X className="size-4" /></button>
      <div className="w-full max-w-[1100px]" style={{ height: "86vh" }}><MediaView m={m} /></div>
    </div>,
    host,
  );
}

// ---------------------------------------------------------------- la fenêtre de choix des médias
/**
 * Choisir des médias d'une modèle (messagerie, scripts) : mêmes dossiers, même grille et mêmes filtres que l'écran
 * « Médias ». `keep` : les médias seront GARDÉS (script) → on rend des adresses qui ne périment pas (OnlyFans : par
 * identifiant ; MYM : une copie de la vignette faite par Bloom, et pas d'adresse du fichier). `fanId` (OnlyFans) :
 * marque ce que ce fan a déjà acheté.
 */
export function MediaPicker({ pf, creatorId, fanId, selected, max, keep = false, onPick, onClose }: {
  pf: Pf; creatorId: string; fanId?: string; selected: PickedMedia[]; max?: number; keep?: boolean; onPick: (list: PickedMedia[]) => void; onClose: () => void;
}) {
  const { head, err } = useMediaHead(pf, creatorId);
  const [base, setBase] = useState<MediaQuery>(EMPTY_QUERY);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 400);
  const query = useMemo(() => ({ ...base, q: dq }), [base, dq]);
  const lib = useMediaItems(pf, creatorId, query, pf === "of" ? fanId : "");
  const [picked, setPicked] = useState<Map<string, PickedMedia>>(() => new Map(selected.map((m) => [m.id, m])));
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const cur = head?.currency ?? (pf === "mym" ? "EUR" : "USD");
  const toPicked = (m: MediaItem): PickedMedia => (keep ? { id: m.id, type: m.type, thumb: m.keepThumb ?? m.thumb, full: pf === "mym" ? null : m.keepFull ?? m.full, duration: m.duration } : { id: m.id, type: m.type, thumb: m.thumb, full: m.full, duration: m.duration });
  const toggle = (m: MediaItem) => {
    const next = new Map(picked);
    if (next.has(m.id)) next.delete(m.id);
    else if (max && next.size >= max) return toast(`${max} médias au plus par message`, "err");
    else next.set(m.id, toPicked(m));
    setPicked(next);
  };
  const confirm = async () => {
    let list = [...picked.values()];
    if (keep && pf === "mym") {
      // Les adresses d'images de MYM expirent au bout d'une heure : Bloom garde une copie de chaque vignette.
      const signed = list.filter((m) => /^https:\/\//.test(m.thumb || ""));
      setBusy(true);
      try {
        for (let i = 0; i < signed.length; i += 10) {
          const r = await api<{ thumbs: Record<string, string> }>("POST", "/api/mym/cloud/keep", { creatorId, medias: signed.slice(i, i + 10).map((m) => ({ id: m.id, thumb: m.thumb })) });
          list = list.map((m) => (r.thumbs[m.id] ? { ...m, thumb: r.thumbs[m.id] } : m));
        }
      } catch {}
      setBusy(false);
    }
    onPick(list);
  };
  const place = head ? (query.cat ? head.cats.find((c) => c.id === query.cat)?.name : query.folder ? head.folders.find((f) => f.id === query.folder)?.name : "Tous les médias") : "";
  const n = picked.size;
  return (
    <Modal title="Choisir des médias" sub={head?.model ? `Dans ${pf === "mym" ? "le MYM Cloud" : "le vault"} de ${head.model.name}${max ? ` · ${max} au plus` : ""}${pf === "of" && fanId ? " · « Déjà acheté » = ce fan l’a déjà payé" : ""}` : undefined} width={1100} onClose={onClose}>
      {err ? <p className="mb-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      {head?.error ? <p className="mb-3 text-[12.5px]" style={{ color: "#fbbf24" }}>{head.error}</p> : null}
      <div className="flex flex-col gap-3 md:h-[min(62vh,600px)] md:flex-row">
        {head ? (
          <>
            <aside className="v2-scroll hidden shrink-0 overflow-y-auto pr-1 md:block md:w-[224px]"><MediaFolders head={head} query={query} onPick={(part) => setBase((b) => ({ ...b, ...part, type: part.folder && pf === "mym" && b.type === "audio" ? "" : b.type }))} /></aside>
            <div className="md:hidden">
              <select value={query.cat ? `c${query.cat}` : query.folder} onChange={(e) => setBase((b) => (e.target.value.startsWith("c") ? { ...b, folder: "", cat: Number(e.target.value.slice(1)) } : { ...b, folder: e.target.value, cat: 0, type: e.target.value && pf === "mym" && b.type === "audio" ? "" : b.type }))} className="v2-field" style={{ colorScheme: "dark" }} aria-label="Dossier">
                <option value="" style={{ background: "#121215" }}>Tous les médias</option>
                {head.folders.map((f) => <option key={f.id} value={f.id} style={{ background: "#121215" }}>{f.name}</option>)}
                {head.cats.map((c) => <option key={c.id} value={`c${c.id}`} style={{ background: "#121215" }}>Catégorie : {c.name}</option>)}
              </select>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <MediaFilters head={head} query={query} set={(part) => setBase((b) => ({ ...b, ...part }))} q={q} setQ={setQ} />
              <p className="mt-2 truncate text-[12px] text-muted"><b style={{ color: "var(--color-fg)" }}>{place}</b>{lib.items ? ` · ${plural(lib.items.length, "média")} affiché${lib.items.length > 1 ? "s" : ""}${lib.next ? ", la suite arrive en descendant" : ""}` : ""}</p>
              <div ref={box} className="v2-scroll mt-2 max-h-[52vh] min-h-0 flex-1 overflow-y-auto pr-1 md:max-h-none">
                <MediaGrid lib={lib} min={116} root={box} empty={query.q || query.type || query.scripts ? "Aucun média ne correspond." : "Aucun média ici."}>
                  {(m) => <MediaTile m={m} cur={cur} on={picked.has(m.id)} selecting onMain={() => toggle(m)} onToggle={() => toggle(m)} onPreview={() => setPreview(m)} />}
                </MediaGrid>
              </div>
            </div>
          </>
        ) : err ? null : <p className="m-auto py-16 text-[13px] text-muted">Chargement…</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[12.5px] text-muted">{n ? <><b style={{ color: "var(--color-fg)" }}>{plural(n, "média")}</b> choisi{n > 1 ? "s" : ""}</> : "Clique sur les médias à ajouter."}{n ? <button type="button" onClick={() => setPicked(new Map())} className="ml-2 underline-offset-2 hover:underline">Tout retirer</button> : null}</p>
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void confirm()} disabled={busy || (!n && !selected.length)} className="v2-btn">{busy ? "Un instant…" : n ? `Ajouter ${plural(n, "média")}` : selected.length ? "Retirer les médias" : "Ajouter"}</button>
      </div>
      {preview ? <Lightbox m={preview} onClose={() => setPreview(null)} /> : null}
    </Modal>
  );
}
