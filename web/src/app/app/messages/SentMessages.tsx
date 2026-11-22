"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, CalendarDays, ChevronLeft, ChevronRight, CornerDownRight, Image as ImageIcon, Loader2, Lock, MessageSquare, RefreshCw, Search, Trash2, UserRound, UsersRound, Workflow } from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn, dur, num } from "@/lib/fmt";
import { useCreators, PlatformBadge } from "@/lib/creators";
import { Avatar, Pill } from "@/components/ui";

type Row = {
  id: string;
  creatorId: string;
  fanId: string;
  fan: string;
  fanAvatar: string | null;
  at: number;
  text: string | null;
  medias: number;
  price: number;
  paid: boolean | null;
  kind: string | null;
  by: string | null;
  replyMs: number | null;
  replyTo: string | null;
  deleted: boolean;
};
type BySender = { key: string; kind: string | null; name: string | null; messages: number; avgMs: number | null; ppv: number; paid: number; paidAmount: number; fans: number };
type Resp = { rows: Row[]; total: number; page: number; pages: number; since: number | null; kpi: { messages: number; avgMs: number | null; ppv: number; paid: number; paidAmount: number; slow: number }; bySender: BySender[] };
type F = { sender: string; model: string; range: string; day: string; q: string; ppv: string; slow: boolean; deleted: boolean; sort: string; page: number };

const RANGES: [string, string][] = [
  ["1h", "1 h"],
  ["today", "Aujourd’hui"],
  ["7d", "7 j"],
  ["30d", "30 j"],
  ["all", "Tout"],
];
const KEY = "bloom.sent.filters";
const DEF: F = { sender: "team", model: "", range: "today", day: "", q: "", ppv: "", slow: false, deleted: false, sort: "recent", page: 1 };

/** Nom affiché d'un expéditeur. */
function senderLabel(kind: string | null, name: string | null) {
  if (kind === "ai") return "IA Substy";
  if (kind === "auto" || kind === "script") return "Automatisations";
  if (kind === "creator") return "Compte de la modèle";
  return name || "Chatteur";
}
const senderIcon = (kind: string | null) => (kind === "ai" ? Bot : kind === "auto" || kind === "script" ? Workflow : kind === "creator" ? UserRound : null);

/** Temps de réponse : vert < 2 min, orange < 10 min, rouge au-delà (comme Raven). */
const respTone = (ms: number) => (ms < 2 * 60000 ? "text-emerald-400" : ms < 10 * 60000 ? "text-amber-400" : "text-rose-400");
function fmtResp(ms: number) {
  if (ms < 60000) return `${Math.round(ms / 1000)} s`;
  if (ms < 3600e3) return `${Math.floor(ms / 60000)} min ${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;
  return dur(ms);
}

/**
 * Messages envoyés (pour les team leaders) : tous les messages envoyés aux fans, filtrables par expéditeur (l'IA, tous les
 * chatteurs, un chatteur précis, automatisations, compte de la modèle), modèle, période, texte, PPV ; avec le temps de
 * réponse, l'achat du PPV, « aller à la conversation » et « supprimer le message ». Se met à jour toutes les 30 s.
 */
export function SentMessages() {
  const { creators } = useCreators();
  const [f, setF] = useState<F>(DEF);
  const [q, setQ] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const byId = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);

  // Filtres gardés sur l'ordinateur (sauf la page).
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null");
      if (s) (setF({ ...DEF, ...s, page: 1 }), setQ(s.q || ""));
    } catch {}
  }, []);
  const set = (patch: Partial<F>) =>
    setF((x) => {
      const n = { ...x, page: 1, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...n, page: 1 }));
      } catch {}
      return n;
    });

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      const p = new URLSearchParams({ range: f.range, page: String(f.page) });
      if (f.sender) p.set("sender", f.sender);
      if (f.model) p.set("model", f.model);
      if (f.range === "day" && f.day) p.set("day", f.day);
      if (f.q) p.set("q", f.q);
      if (f.ppv) p.set("ppv", f.ppv);
      if (f.slow) p.set("slow", "1");
      if (f.deleted) p.set("deleted", "1");
      if (f.sort === "slow") p.set("sort", "slow");
      try {
        setData(await api<Resp>("GET", `/api/sent?${p}`));
      } catch (e) {
        if (!quiet) toast((e as Error).message, "err");
      } finally {
        setLoading(false);
      }
    },
    [f],
  );
  useEffect(() => {
    load();
    // En direct : relu toutes les 30 s sur la première page.
    const t = setInterval(() => f.page === 1 && document.visibilityState === "visible" && load(true), 30_000);
    return () => clearInterval(t);
  }, [load, f.page]);

  const del = async (r: Row) => {
    if (!confirm(`Supprimer ce message chez ${r.fan} ? Il disparaîtra aussi de la conversation du fan.`)) return;
    setBusy(r.id);
    try {
      await api("POST", "/api/sent/delete", { id: r.id });
      toast("Message supprimé chez le fan");
      setData((d) => (d ? { ...d, rows: f.deleted ? d.rows.map((x) => (x.id === r.id ? { ...x, deleted: true } : x)) : d.rows.filter((x) => x.id !== r.id) } : d));
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  };

  const k = data?.kpi;
  const chatters = (data?.bySender ?? []).filter((s) => s.key.startsWith("n:"));
  const cur = (cid: string) => (/mym/i.test(byId.get(cid)?.platform || "") ? "€" : "$");
  const amount = (v: number, cid?: string) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${cid ? cur(cid) : f.model ? cur(f.model) : "$/€"}`;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">Équipe</p>
          <h1 className="mt-1 text-2xl md:text-3xl">Messages envoyés</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Tout ce qui est envoyé aux fans, message par message : l’IA, chaque chatteur, les automatisations. Filtre, vérifie le temps de réponse, va sur la conversation ou supprime un message.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Kpi label="Messages" value={num(k?.messages ?? 0)} />
          <Kpi label="Réponse moyenne" value={k?.avgMs == null ? "—" : fmtResp(k.avgMs)} title="Temps entre le premier message du fan resté sans réponse et la réponse (hors relances de plus de 24 h)" />
          <Kpi label="Réponses lentes" value={num(k?.slow ?? 0)} title="Plus de 10 min" />
          <Kpi label="PPV envoyés" value={num(k?.ppv ?? 0)} />
          <Kpi label="PPV achetés" value={k?.ppv ? `${num(k.paid)} · ${Math.round((k.paid / k.ppv) * 100)} %` : "—"} accent />
        </div>
      </header>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2">
        <form
          className="relative min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: q.trim() });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== f.q && set({ q: q.trim() })} placeholder="Rechercher dans les messages…" className="h-10 w-full rounded-xl border border-input bg-card-2/60 pr-3 pl-9 text-sm outline-none focus:border-primary" />
        </form>
        <label className="relative flex h-10 items-center gap-2 rounded-xl border bg-card-2/60 pl-3 text-sm">
          <UsersRound className="size-4 text-muted" />
          <select value={f.sender} onChange={(e) => set({ sender: e.target.value })} className="h-full appearance-none bg-transparent pr-3 font-semibold outline-none">
            <option value="">Tout le monde</option>
            <option value="team">Tous les chatteurs</option>
            <option value="ai">L’IA Substy</option>
            <option value="auto">Automatisations et scripts</option>
            <option value="creator">Compte de la modèle (Infloww, site)</option>
            {chatters.length ? (
              <optgroup label="Un chatteur">
                {chatters.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name} ({s.messages})
                  </option>
                ))}
              </optgroup>
            ) : null}
            {f.sender.startsWith("n:") && !chatters.some((s) => s.key === f.sender) ? <option value={f.sender}>{f.sender.slice(2)}</option> : null}
          </select>
        </label>
        <select value={f.model} onChange={(e) => set({ model: e.target.value })} className="h-10 rounded-xl border bg-card-2/60 px-3 text-sm font-semibold outline-none">
          <option value="">Toutes les modèles</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {/mym/i.test(c.platform || "") ? "MYM" : "OF"}
            </option>
          ))}
        </select>
        <div className="scroll-thin flex h-10 max-w-full items-center overflow-x-auto rounded-xl border bg-card-2/60 p-1">
          {RANGES.map(([v, l]) => (
            <button key={v} onClick={() => set({ range: v, day: "" })} className={cn("h-full rounded-lg px-3 text-xs font-semibold whitespace-nowrap", f.range === v ? "bg-primary text-white" : "text-muted hover:text-fg")}>
              {l}
            </button>
          ))}
          <label className={cn("relative ml-1 flex h-full cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold", f.range === "day" ? "bg-primary text-white" : "text-muted hover:text-fg")} title="Choisir un jour">
            <CalendarDays className="size-4" />
            {f.range === "day" && f.day ? new Date(f.day + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null}
            <input type="date" value={f.day} onChange={(e) => e.target.value && set({ range: "day", day: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
        <select value={f.ppv} onChange={(e) => set({ ppv: e.target.value })} className="h-10 rounded-xl border bg-card-2/60 px-3 text-sm font-semibold outline-none">
          <option value="">Tous les messages</option>
          <option value="1">PPV seulement</option>
          <option value="unpaid">PPV pas achetés</option>
        </select>
        <Chip on={f.slow} onClick={() => set({ slow: !f.slow })}>
          Réponses lentes
        </Chip>
        <Chip on={f.sort === "slow"} onClick={() => set({ sort: f.sort === "slow" ? "recent" : "slow" })}>
          Plus lents d’abord
        </Chip>
        <Chip on={f.deleted} onClick={() => set({ deleted: !f.deleted })}>
          Supprimés
        </Chip>
        <button onClick={() => load()} title="Actualiser" className="grid size-10 place-items-center rounded-xl border bg-card-2/60 text-muted hover:text-fg">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        </button>
      </div>

      {/* Par expéditeur */}
      {data?.bySender.length ? (
        <section className="min-w-0 overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b bg-card-2/50">
                <tr className="text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                  <th className="px-4 py-2.5">Par expéditeur</th>
                  <th className="px-3 py-2.5 text-right">Messages</th>
                  <th className="px-3 py-2.5 text-right">Fans</th>
                  <th className="px-3 py-2.5 text-right">Réponse moy.</th>
                  <th className="px-3 py-2.5 text-right">PPV</th>
                  <th className="px-3 py-2.5 text-right">Achetés</th>
                  <th className="px-4 py-2.5 text-right">Ventes PPV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {data.bySender.map((s) => {
                  const Icon = senderIcon(s.kind);
                  return (
                    <tr key={s.key} onClick={() => set({ sender: f.sender === s.key ? "" : s.key })} className={cn("cursor-pointer hover:bg-card-2/60", f.sender === s.key && "bg-card-2")}>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2 font-semibold">
                          {Icon ? (
                            <span className="grid size-7 place-items-center rounded-lg bg-card-2">
                              <Icon className="size-3.5" />
                            </span>
                          ) : (
                            <Avatar name={s.name} size="size-7" />
                          )}
                          {senderLabel(s.kind, s.name)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(s.messages)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(s.fans)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{s.avgMs == null ? <span className="text-muted">—</span> : <span className={respTone(s.avgMs)}>{fmtResp(s.avgMs)}</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(s.ppv)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.ppv ? `${num(s.paid)} · ${Math.round((s.paid / s.ppv) * 100)} %` : "—"}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{s.paidAmount ? amount(s.paidAmount) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Messages */}
      <section className="min-w-0 overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead className="border-b bg-card-2/50">
              <tr className="text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                <th className="px-4 py-3">Expéditeur</th>
                <th className="px-3 py-3">Message</th>
                <th className="px-3 py-3">Envoyé</th>
                <th className="px-3 py-3 text-right">Temps de réponse</th>
                <th className="px-3 py-3 text-right">Prix</th>
                <th className="px-3 py-3 text-center">Acheté</th>
                <th className="px-3 py-3">Fan</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {data?.rows.map((m) => {
                const Icon = senderIcon(m.kind);
                const c = byId.get(m.creatorId);
                const sent = new Date(m.at);
                const conv = `/app/messagerie?c=${encodeURIComponent(`${m.creatorId}~${m.fanId}`)}`;
                return (
                  <tr key={m.id} className={cn("align-top hover:bg-card-2/40", m.deleted && "opacity-50")}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        {Icon ? (
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card-2">
                            <Icon className="size-4" />
                          </span>
                        ) : (
                          <Avatar name={m.by} size="size-8" />
                        )}
                        <span className="block max-w-36 truncate font-semibold">{senderLabel(m.kind, m.by)}</span>
                      </span>
                    </td>
                    <td className="max-w-[460px] px-3 py-3">
                      {m.replyTo ? (
                        <p className="truncate text-xs text-muted" title={m.replyTo}>
                          {m.replyTo}
                        </p>
                      ) : null}
                      <p className="mt-0.5 flex items-start gap-1.5 font-semibold">
                        <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-muted" />
                        <span className="line-clamp-2 break-words">{m.text || <span className="font-normal text-muted italic">{m.price ? "[PPV sans texte]" : m.medias ? "[média sans texte]" : m.text === null ? "[texte pas enregistré]" : "[vide]"}</span>}</span>
                        {m.medias && !m.price ? <ImageIcon className="mt-0.5 size-3.5 shrink-0 text-muted" /> : null}
                      </p>
                      {m.deleted ? <Pill tone="bad" className="mt-1">supprimé</Pill> : null}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="font-semibold tabular-nums">{sent.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
                      <p className="text-xs text-muted">{sent.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold whitespace-nowrap tabular-nums">{m.replyMs != null ? <span className={respTone(m.replyMs)}>{fmtResp(m.replyMs)}</span> : <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                      {m.price ? (
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Lock className="size-3" /> {amount(m.price, m.creatorId)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">{m.paid === null ? <span className="text-muted">—</span> : m.paid ? <Pill tone="good">acheté</Pill> : <Pill>non</Pill>}</td>
                    <td className="px-3 py-3">
                      <Link href={conv} className="group flex items-center gap-2">
                        <Avatar src={m.fanAvatar} name={m.fan} size="size-7" />
                        <span className="min-w-0">
                          <span className="block max-w-40 truncate font-semibold group-hover:underline">{m.fan}</span>
                          <span className="flex max-w-40 items-center gap-1 truncate text-[11px] text-muted">
                            {c ? <PlatformBadge c={c} /> : null} {c?.name ?? "Modèle"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center justify-end gap-1.5">
                        <Link href={conv} title="Aller sur la conversation" className="grid size-8 place-items-center rounded-lg border bg-card-2 hover:border-primary/60">
                          <MessageSquare className="size-4" />
                        </Link>
                        {!m.deleted ? (
                          <button disabled={busy === m.id} onClick={() => del(m)} title="Supprimer le message chez le fan" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-rose-500/15 hover:text-rose-400 disabled:opacity-50">
                            {busy === m.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          </button>
                        ) : (
                          <span className="size-8" />
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {data && !data.rows.length ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-muted">
                    Aucun message sur ce filtre.
                  </td>
                </tr>
              ) : null}
              {!data ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-muted">
                    Chargement…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
          <span className="text-muted">
            Page {data?.page ?? 1} sur {data?.pages ?? 1} · {num(data?.total ?? 0)} message{(data?.total ?? 0) > 1 ? "s" : ""}
            {data?.since ? ` · textes enregistrés depuis le ${new Date(data.since).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""}
          </span>
          <span className="flex gap-2">
            <button disabled={!data || data.page <= 1} onClick={() => setF((x) => ({ ...x, page: x.page - 1 }))} className="inline-flex h-9 items-center gap-1 rounded-xl border bg-card-2 px-3 text-sm font-semibold disabled:opacity-40">
              <ChevronLeft className="size-4" /> Précédent
            </button>
            <button disabled={!data || data.page >= data.pages} onClick={() => setF((x) => ({ ...x, page: x.page + 1 }))} className="inline-flex h-9 items-center gap-1 rounded-xl border bg-card-2 px-3 text-sm font-semibold disabled:opacity-40">
              Suivant <ChevronRight className="size-4" />
            </button>
          </span>
        </footer>
      </section>
    </div>
  );
}

function Kpi({ label, value, accent, title }: { label: string; value: string; accent?: boolean; title?: string }) {
  return (
    <div title={title} className={cn("min-w-[130px] rounded-2xl border bg-card px-4 py-3", accent && "border-primary/60")}>
      <p className="text-[11px] font-semibold text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("h-10 rounded-xl border px-3 text-sm font-semibold whitespace-nowrap", on ? "border-primary bg-primary text-white" : "bg-card-2/60 text-muted hover:text-fg")}>
      {children}
    </button>
  );
}
