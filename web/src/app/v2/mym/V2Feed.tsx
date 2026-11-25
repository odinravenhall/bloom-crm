"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, Eye, Heart, Image as ImageIcon, Lock, Play, RefreshCw, Users } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/rv/components/ui";
import { int, Modal, PALETTE, Ring } from "../kit";
import { errText, plural } from "../media/MediaKit";

// Bloom v2 → MYM → Feed (25/11/2026, « Constellation »). Remplace, dans la v2, la copie de MyPulse (`MymFeed`). Même
// route (`GET /api/mym/feed`, mymmedia.mjs) : les publications du profil MYM (public / privé, likes, vues) que Bloom a
// relues sur le site de MYM ; « Actualiser » les relit (`POST /api/mym/feed/refresh`, lecture seule chez MYM).
type Post = { id: string; type: "photo" | "video"; isPublic: boolean; caption: string; publishedAt: number | null; likes: number; views: number; duration: string | null; thumb: string };
type Data = { items: Post[]; syncedAt: number | null; error: string | null; syncing: { done: number; total: number } | null };
type LinkRow = { creatorId: string; name: string; username: string | null; linked: boolean };
type Sort = "recent" | "likes" | "views";
type Show = "" | "public" | "private" | "photo" | "video";
const SORTS: [Sort, string][] = [["recent", "Récents"], ["likes", "Plus aimés"], ["views", "Plus vus"]];
const SHOWS: [Show, string][] = [["", "Tout"], ["public", "Public"], ["private", "Privé"], ["photo", "Photos"], ["video", "Vidéos"]];
const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(new Date(ms).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) }) : "date inconnue");

export function V2Feed() {
  const { creators } = useCreators();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [cur, setCur] = useState("");
  const [data, setData] = useState<{ key: string; d: Data } | null>(null);
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [show, setShow] = useState<Show>("");
  const [open, setOpen] = useState<Post | null>(null);
  useEffect(() => {
    api<{ links: LinkRow[] }>("GET", "/api/mym/links").then((r) => setLinks(r.links)).catch((e) => setErr(errText(e)));
  }, []);
  const models = links ?? [];
  const m = models.find((x) => x.creatorId === cur) ?? models.find((x) => x.linked) ?? models[0] ?? null;
  const mid = m?.creatorId ?? "";
  const load = useCallback(() => {
    if (!mid) return;
    api<Data>("GET", `/api/mym/feed?creatorId=${encodeURIComponent(mid)}`)
      .then((d) => (setData({ key: mid, d }), setErr("")))
      .catch((e) => setErr(errText(e)));
  }, [mid]);
  useEffect(() => void load(), [load]);
  const d = data && data.key === mid ? data.d : null;
  // Pendant une relecture chez MYM : l'avancement toutes les 3 s.
  useEffect(() => {
    if (!d?.syncing) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [d, load]);
  const refresh = async () => {
    try {
      await api("POST", "/api/mym/feed/refresh", { creatorId: mid });
      load();
    } catch (e) {
      toast(errText(e), "err");
    }
  };
  const all = useMemo(() => d?.items ?? [], [d]);
  const shown = useMemo(() => {
    const l = all.filter((p) => !show || (show === "public" ? p.isPublic : show === "private" ? !p.isPublic : p.type === show));
    const k = (p: Post) => (sort === "likes" ? p.likes : sort === "views" ? p.views : p.publishedAt ?? 0);
    return [...l].sort((a, b) => k(b) - k(a));
  }, [all, show, sort]);
  const st = useMemo(() => {
    const pub = all.filter((p) => p.isPublic).length;
    const likes = all.reduce((n, p) => n + p.likes, 0);
    const views = all.reduce((n, p) => n + p.views, 0);
    return { pub, priv: all.length - pub, likes, views, videos: all.filter((p) => p.type === "video").length };
  }, [all]);
  const avatarOf = (id: string) => creators.find((c) => c.id === id)?.avatar ?? null;
  const tile = (label: string, value: React.ReactNode, sub?: string) => (
    <div className="min-w-0 rounded-[12px] border px-3.5 py-2.5" style={{ borderColor: "var(--color-line)" }}>
      <p className="truncate text-[11.5px] font-semibold text-muted">{label}</p>
      <p className="v2-num mt-0.5 truncate text-[20px] leading-tight font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub ?? " "}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">MYM · Profil public</p>
          <h1 className="v2-h1 mt-1">Feed</h1>
          <p className="mt-1 text-[13px] text-muted">Les publications du profil MYM, avec leurs likes et leurs vues.</p>
        </div>
        {m?.linked ? (
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-muted">{d?.syncing ? `Lecture chez MYM… ${d.syncing.done} / ${d.syncing.total || "?"}` : d?.syncedAt ? `Mis à jour le ${new Date(d.syncedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            <button onClick={() => void refresh()} disabled={!!d?.syncing} className="v2-select" title="Relire les publications chez MYM"><RefreshCw className={`size-4 text-muted ${d?.syncing ? "animate-spin" : ""}`} />Actualiser</button>
          </div>
        ) : null}
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {!links && !err ? <p className="py-20 text-center text-[13px] text-muted">Chargement…</p> : null}

      {m ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
          <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 1 }}>
            <div className="v2-card p-1.5">
              <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Comptes MYM</p>
              <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
                {models.map((x, i) => (
                  <button key={x.creatorId} onClick={() => (setCur(x.creatorId), setShow(""))} className="v2-pick w-auto shrink-0 lg:w-full" data-on={mid === x.creatorId} aria-pressed={mid === x.creatorId}>
                    <Ring color={PALETTE[i % PALETTE.length]}><Avatar src={avatarOf(x.creatorId)} name={x.name} size="size-8" /></Ring>
                    <span className="min-w-0 flex-1 text-left">
                      <b className="block truncate text-[13px] leading-tight">{x.name}</b>
                      <span className="block truncate text-[11.5px] text-muted">{x.linked ? (x.username ? `@${x.username}` : "relié") : "pas relié à Bloom"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="v2-rise min-w-0" style={{ ["--i" as string]: 2 }}>
            <div className="v2-card p-3">
              {!m.linked ? (
                <p className="p-6 text-center text-[13px] text-muted">Le compte MYM de {m.name} n’est pas relié à Bloom : relie-le dans MYM → Compte Creator pour lire son feed.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 pb-3 md:grid-cols-4">
                    {tile("Publications", d ? int(all.length) : "…", d ? `${st.pub} publiques · ${st.priv} privées` : undefined)}
                    {tile("Likes", d ? int(st.likes) : "…", all.length ? `${int(Math.round(st.likes / all.length))} en moyenne` : undefined)}
                    {tile("Vues", d ? int(st.views) : "…", all.length ? `${int(Math.round(st.views / all.length))} en moyenne` : undefined)}
                    {tile("Vidéos", d ? int(st.videos) : "…", d ? `${all.length - st.videos} photos` : undefined)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 pb-3">
                    <div className="v2-segbar">{SORTS.map(([k, l]) => <button key={k} onClick={() => setSort(k)} className="v2-seg" data-on={sort === k}>{l}</button>)}</div>
                    <div className="flex flex-wrap gap-1">{SHOWS.map(([k, l]) => <button key={k || "all"} onClick={() => setShow(k)} className="v2-chip" data-on={show === k}>{l}</button>)}</div>
                    <span className="flex-1" />
                    <span className="text-[12px] text-muted">{plural(shown.length, "publication")}</span>
                  </div>
                  {d?.error ? <p className="mb-3 rounded-[10px] border px-3 py-2 text-[12.5px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", color: "var(--v2-down)" }}>La dernière lecture chez MYM a échoué ({d.error}). « Actualiser » réessaie.</p> : null}
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
                    {shown.map((p) => (
                      <button key={p.id} onClick={() => setOpen(p)} className="group overflow-hidden rounded-[12px] border text-left transition hover:border-white/20" style={{ borderColor: "var(--color-line)" }}>
                        <span className="relative block aspect-square overflow-hidden" style={{ background: "var(--color-card-2)" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.thumb} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                          <span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold" style={p.isPublic ? { background: "rgb(0 0 0 / 0.62)", color: "#fff" } : { background: "rgb(167 139 250 / 0.9)", color: "#120a24" }}>{p.isPublic ? <Users className="size-3" /> : <Lock className="size-3" />}{p.isPublic ? "Public" : "Privé"}</span>
                          {p.type === "video" ? <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: "rgb(0 0 0 / 0.62)" }}><Play className="size-2.5 fill-current" />{p.duration || "Vidéo"}</span> : null}
                        </span>
                        <span className="flex items-center gap-3 px-2.5 py-2 text-[12px]">
                          <span className="v2-num flex items-center gap-1 font-semibold" style={{ color: "#f472b6" }}><Heart className="size-3 fill-current" />{int(p.likes)}</span>
                          <span className="v2-num flex items-center gap-1 font-semibold" style={{ color: "var(--v2-sky)" }}><Eye className="size-3" />{int(p.views)}</span>
                          <span className="flex-1 truncate text-right text-muted">{date(p.publishedAt)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {d && !shown.length ? <p className="py-16 text-center text-[13px] text-muted">{d.syncing ? "Première lecture du feed chez MYM, ça prend une minute ou deux…" : all.length ? "Aucune publication avec ce filtre." : "Aucune publication."}</p> : null}
                  {!d && !err ? <p className="py-16 text-center text-[13px] text-muted">Chargement…</p> : null}
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {open ? (
        <Modal title={open.isPublic ? "Publication publique" : "Publication privée"} sub={`${open.type === "video" ? `Vidéo${open.duration ? ` de ${open.duration}` : ""}` : "Photo"} · publiée le ${date(open.publishedAt)}`} width={720} onClose={() => setOpen(null)}>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="grid place-items-center overflow-hidden rounded-[12px] bg-black" style={{ maxHeight: "62vh" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={open.thumb} alt="" className="max-h-[62vh] w-auto max-w-full object-contain" />
            </div>
            <div className="space-y-2.5 text-[13px]">
              <p className="flex items-center gap-2"><Heart className="size-4" style={{ color: "#f472b6" }} /><b className="v2-num">{int(open.likes)}</b> likes</p>
              <p className="flex items-center gap-2"><Eye className="size-4" style={{ color: "var(--v2-sky)" }} /><b className="v2-num">{int(open.views)}</b> vues</p>
              <p className="flex items-center gap-2"><Calendar className="size-4 text-muted" />{date(open.publishedAt)}</p>
              <p className="flex items-center gap-2">{open.type === "video" ? <Play className="size-4 text-muted" /> : <ImageIcon className="size-4 text-muted" />}{open.type === "video" ? "Vidéo" : "Photo"}</p>
              {open.caption ? <p className="border-t pt-2.5 leading-relaxed whitespace-pre-wrap text-muted" style={{ borderColor: "var(--color-line)" }}>{open.caption}</p> : <p className="border-t pt-2.5 text-muted" style={{ borderColor: "var(--color-line)" }}>Sans légende.</p>}
              {open.type === "video" ? <p className="text-[11.5px] text-muted">Bloom garde l’image de la vidéo, pas la vidéo elle-même.</p> : null}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
