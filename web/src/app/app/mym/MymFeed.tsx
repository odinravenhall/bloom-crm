"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Calendar, Clock, Eye, Heart, Image as ImageIcon, Lock, RefreshCw, Users, Video } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";

// MYM → Médias → Feed : copie de « Votre Feed » de MyPulse. Les posts publiés sur le profil MYM de la modèle (date,
// public / privé, likes, vues), relus chez MYM avec « Actualiser » (Bloom garde la dernière lecture).
type Post = { id: string; type: "photo" | "video"; isPublic: boolean; caption: string; publishedAt: number | null; likes: number; views: number; duration: string | null; thumb: string };
type Data = { items: Post[]; syncedAt: number | null; error: string | null; syncing: { done: number; total: number } | null };
type SortKey = "publishedAt" | "likes" | "views";
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };

export function MymFeed() {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "publishedAt", desc: true });
  const [vis, setVis] = useState<"" | "public" | "private">("");
  const load = useCallback(() => {
    if (!creatorId) return;
    api<Data>("GET", `/api/mym/feed?creatorId=${encodeURIComponent(creatorId)}`).then((r) => (setD(r), setErr(""))).catch((e) => (setD(null), setErr((e as Error).message)));
  }, [creatorId]);
  useEffect(() => {
    setD(null);
    load();
  }, [load]);
  // Pendant une relecture chez MYM : on regarde l'avancement toutes les 3 s.
  useEffect(() => {
    if (!d?.syncing) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [d, load]);
  const refresh = async () => {
    try {
      await api("POST", "/api/mym/feed/refresh", { creatorId });
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const shown = useMemo(() => {
    const l = (d?.items ?? []).filter((p) => !vis || (vis === "public") === p.isPublic);
    return [...l].sort((a, b) => ((a[sort.key] ?? 0) - (b[sort.key] ?? 0)) * (sort.desc ? -1 : 1));
  }, [d, vis, sort]);
  const SortBtn = ({ k, label, icon: Icon }: { k: SortKey; label: string; icon: typeof Heart }) => (
    <button onClick={() => setSort({ key: k, desc: sort.key === k ? !sort.desc : true })} className="flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px]" style={{ background: sort.key === k ? "#405189" : "rgba(64,81,137,.25)", color: sort.key === k ? "#fff" : "#6f86d6" }}>
      <Icon className="size-3.5" /> {label} {sort.key === k && !sort.desc ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
    </button>
  );

  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="rounded-lg" style={card}>
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--mp-line)" }}>
          <h1 className="text-[16px] font-semibold" style={{ color: "var(--mp-head)" }}>Votre Feed</h1>
          <span className="flex h-8 items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}>
            <Avatar src={creator?.avatar} name={creator?.name} size="size-5" />
            <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="bg-transparent outline-none">
              {creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}
            </select>
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--mp-muted)" }}>
            <Clock className="size-3.5" />
            {d?.syncing ? `Lecture chez MYM… ${d.syncing.done} / ${d.syncing.total || "?"}` : d?.syncedAt ? `Dernière mise à jour : ${new Date(d.syncedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : "Jamais mis à jour"}
          </span>
          <button disabled={!!d?.syncing || !!err} onClick={refresh} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium text-white disabled:opacity-50" style={{ background: "#f7b84b" }}><RefreshCw className={`size-3.5 ${d?.syncing ? "animate-spin" : ""}`} /> Actualiser</button>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-1.5">
            <SortBtn k="publishedAt" label="Date" icon={Calendar} />
            <SortBtn k="likes" label="Likes" icon={Heart} />
            <SortBtn k="views" label="Vues" icon={Eye} />
          </div>
          <div className="mt-5 flex justify-center gap-2 text-[13px] font-semibold">
            {([["", "Tous", null], ["public", "Public", Users], ["private", "Privée", Lock]] as const).map(([k, l, I]) => (
              <button key={k} onClick={() => setVis(k)} className="flex h-9 items-center gap-1.5 rounded-md px-4" style={vis === k ? { background: "#405189", color: "#fff" } : { color: "var(--mp-head)" }}>{I ? <I className="size-3.5" /> : null}{l}</button>
            ))}
          </div>
          {err ? <p className="py-16 text-center text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
          {d?.error ? <p className="mt-4 rounded-md p-3 text-[12.5px]" style={{ background: "rgba(240,101,72,.1)", color: "var(--mp-down)" }}>La dernière lecture chez MYM a échoué : {d.error}. Clique sur « Actualiser » pour réessayer.</p> : null}
          <div className="mt-5 grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
            {shown.map((p) => (
              <div key={p.id}>
                <div className="relative aspect-square overflow-hidden rounded-md" style={{ background: "var(--mp-card-2)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumb} alt="" loading="lazy" className="size-full object-cover" />
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1" style={{ color: "var(--mp-muted)" }}><Calendar className="size-3" />{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("fr-FR") : "—"}</span>
                  <span className="flex items-center gap-1 font-semibold" style={{ color: p.isPublic ? "var(--mp-up)" : "var(--mp-down)" }}>{p.isPublic ? <Users className="size-3" /> : <Lock className="size-3" />}{p.isPublic ? "Public" : "Privé"}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 rounded px-1.5 py-0.5" style={p.type === "video" ? { background: "rgba(247,184,75,.18)", color: "#f7b84b" } : { background: "rgba(64,81,137,.3)", color: "#6f86d6" }}>{p.type === "video" ? <Video className="size-3" /> : <ImageIcon className="size-3" />}{p.type === "video" ? "Vidéo" : "Photo"}</span>
                  {p.duration ? <span className="rounded bg-black px-1.5 py-0.5 font-semibold text-white">{p.duration}</span> : null}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[12px] font-semibold">
                  <span className="flex items-center gap-1" style={{ color: "#f06548" }}><Heart className="size-3 fill-current" />{p.likes}</span>
                  <span className="flex items-center gap-1" style={{ color: "#299cdb" }}><Eye className="size-3" />{p.views}</span>
                </div>
                {p.caption ? <p className="mt-1 line-clamp-2 text-[11.5px]" style={{ color: "var(--mp-muted)" }} title={p.caption}>{p.caption}</p> : null}
              </div>
            ))}
          </div>
          {d && !shown.length && !err ? <p className="py-16 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>{d.syncing ? "Première lecture du feed chez MYM, ça prend une minute ou deux…" : "Aucun post."}</p> : null}
          {!d && !err ? <p className="py-16 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>…</p> : null}
        </div>
      </div>
    </div>
  );
}
