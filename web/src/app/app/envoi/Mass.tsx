"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Lock, Plus, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn, eur, num, usd, when } from "@/lib/fmt";
import { CreatorTabs, useCreators } from "@/lib/creators";
import type { FanList, MassMessage, Media } from "@/lib/types";
import { VaultPicker } from "../messagerie/VaultPicker";
import { Pill, btnCls, inputCls } from "@/components/ui";

type Page = { total: number; page: number; pages: number; items: MassMessage[] };

const money = (v: number | null, cur: string) => (v == null ? "—" : cur === "USD" ? usd(v, 0) : eur(v * 100, 0));
const pct = (a: number | null, b: number | null) => (a == null || !b ? null : Math.round((a / b) * 100));

const STATUS: Record<string, [string, "good" | "warn" | "info" | "muted" | "bad"]> = {
  SENT: ["envoyé", "good"],
  SCHEDULED: ["programmé", "info"],
  SENDING: ["en cours", "info"],
  CANCELED: ["annulé", "muted"],
  CANCELLED: ["annulé", "muted"],
  UNSENT: ["retiré", "warn"],
  FAILED: ["échec", "bad"],
};

/** Envoi groupé : l'historique des messages de masse de Substy avec leurs résultats, les listes de fans, et le brouillon d'un nouvel envoi. */
export function Mass({ canSend }: { canSend: boolean }) {
  const { creatorId, creator } = useCreators();
  const [data, setData] = useState<Page | null>(null);
  const [lists, setLists] = useState<FanList[] | null>(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!creatorId) return;
    setLists(null);
    setPage(1);
    setDraft(false);
    api<FanList[]>("GET", `/api/fan-lists?creatorId=${encodeURIComponent(creatorId)}`)
      .then((l) => setLists(l.sort((a, b) => b.fans - a.fans)))
      .catch(() => setLists([]));
  }, [creatorId]);
  useEffect(() => {
    if (!creatorId) return;
    setData(null);
    setErr("");
    api<Page>("GET", `/api/mass?creatorId=${encodeURIComponent(creatorId)}&page=${page}`)
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  }, [creatorId, page, reload]);

  const listName = useMemo(() => new Map((lists ?? []).map((l) => [l.id, l.name])), [lists]);
  const sum = useMemo(() => {
    const it = data?.items ?? [];
    const k = (f: (m: MassMessage) => number | null) => it.reduce((a, m) => a + (f(m) || 0), 0);
    return { recipients: k((m) => m.recipients), viewed: k((m) => m.viewed), purchased: k((m) => m.purchased), revenue: k((m) => m.gross), cur: it[0]?.currency ?? "USD" };
  }, [data]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-6 pb-4 md:px-8">
        <div>
          <h1 className="text-4xl md:text-5xl">Envoi groupé</h1>
          <p className="mt-1 text-sm text-muted">{creator ? `Les messages de masse de ${creator.name} et ce qu’ils ont rapporté.` : "Choisis une créatrice."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CreatorTabs />
          <button onClick={() => setDraft(true)} className={btnCls.primary} disabled={!creatorId || !canSend} title={canSend ? undefined : "Réservé aux team leaders, managers et admins"}>
            <Plus className="size-4" /> Nouveau message groupé
          </button>
        </div>
      </div>
      {err ? <p className="mx-4 mb-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300 md:mx-8">{err}</p> : null}

      <div className="flex min-h-0 flex-1 border-t">
        <section className="scroll-thin min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
          {data ? (
            <>
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Band label="Messages groupés" value={num(data.total)} sub="depuis le début" />
                <Band label="Destinataires" value={num(sum.recipients)} sub={`sur les ${data.items.length} affichés`} />
                <Band label="Achats" value={num(sum.purchased)} sub={sum.viewed ? `${num(sum.viewed)} vus` : undefined} />
                <Band label="Rapporté" value={money(sum.revenue, sum.cur)} sub="brut, sur cette page" accent />
              </div>
              <div className="flex flex-col gap-2">
                {data.items.map((m) => (
                  <Row key={m.id} m={m} listName={listName} />
                ))}
                {!data.items.length ? <p className="p-10 text-center text-sm text-muted">Aucun message groupé pour cette créatrice.</p> : null}
              </div>
              {data.pages > 1 ? (
                <div className="mt-4 flex items-center justify-center gap-3 text-sm">
                  <button className={btnCls.ghost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="size-4" /> Plus récents
                  </button>
                  <span className="text-muted">
                    page {data.page} / {data.pages}
                  </span>
                  <button className={btnCls.ghost} disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                    Plus anciens <ChevronRight className="size-4" />
                  </button>
                </div>
              ) : null}
            </>
          ) : !err ? (
            <p className="p-10 text-center text-sm text-muted">Chargement…</p>
          ) : null}
        </section>

        <aside className="scroll-thin hidden w-[300px] shrink-0 overflow-y-auto border-l bg-panel p-4 lg:block">
          <h2 className="mb-1 text-xl">Listes de fans</h2>
          <p className="mb-3 text-xs text-muted">Les audiences possibles d’un envoi groupé, comme sur Substy.</p>
          {(lists ?? []).map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-card-2">
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
              <span className="text-xs text-muted tabular-nums">{num(l.fans)}</span>
            </div>
          ))}
          {!lists ? <p className="text-sm text-muted">Chargement…</p> : null}
        </aside>
      </div>

      {draft && creatorId ? (
        <Draft
          creatorId={creatorId}
          creatorName={creator?.name ?? ""}
          lists={lists ?? []}
          onClose={() => setDraft(false)}
          onSent={() => {
            setDraft(false);
            setPage(1);
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function Band({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-card px-4 py-3", accent && "border-primary/40")}>
      <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-semibold tabular-nums", accent && "text-primary-soft")}>{value}</p>
      {sub ? <p className="text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

function Row({ m, listName }: { m: MassMessage; listName: Map<string, string> }) {
  const [label, tone] = STATUS[m.status.toUpperCase()] ?? [m.status.toLowerCase() || "—", "muted" as const];
  const names = (ids: string[]) => ids.map((id) => listName.get(id) ?? "liste").join(", ");
  const conv = pct(m.purchased, m.recipients);
  return (
    <article className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{when(m.scheduledAt || m.createdAt)}</span>
        <Pill tone={tone}>{label}</Pill>
        {m.price > 0 ? (
          <Pill tone="accent">
            <Lock className="size-3" /> PPV {usd(m.price)}
          </Pill>
        ) : (
          <Pill>gratuit</Pill>
        )}
        {m.medias ? <Pill>{m.medias} média{m.medias > 1 ? "s" : ""}</Pill> : null}
        {m.onlineOnly ? <Pill tone="info">fans en ligne</Pill> : null}
        {m.revertedBy ? <Pill tone="warn">retiré par {m.revertedBy}</Pill> : null}
      </div>
      {m.text ? <p className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap">{m.text}</p> : <p className="mt-2 text-sm text-muted italic">Sans texte</p>}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Users className="size-3.5" />
        {m.included.length ? names(m.included) : m.fans ? `${m.fans} fan${m.fans > 1 ? "s" : ""} choisis` : "tous les fans"}
        {m.excluded.length ? ` · sauf ${names(m.excluded)}` : ""}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-sm sm:grid-cols-4">
        <Fig label="Destinataires" v={num(m.recipients)} />
        <Fig label="Vus" v={num(m.viewed)} sub={pct(m.viewed, m.recipients) != null ? `${pct(m.viewed, m.recipients)} %` : undefined} />
        <Fig label="Achats" v={num(m.purchased)} sub={conv != null && m.price > 0 ? `${conv} %` : undefined} />
        <Fig label="Rapporté" v={money(m.gross, m.currency)} sub={m.net != null ? `${money(m.net, m.currency)} net` : undefined} />
      </div>
    </article>
  );
}

function Fig({ label, v, sub }: { label: string; v: React.ReactNode; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="font-semibold tabular-nums">
        {v} {sub ? <span className="text-xs font-normal text-muted">{sub}</span> : null}
      </p>
    </div>
  );
}

const UNSEND: [number, string][] = [
  [0, "jamais"],
  [300, "après 5 min"],
  [3600, "après 1 h"],
  [21600, "après 6 h"],
  [86400, "après 24 h"],
];

/** Nouveau message groupé, avec une étape de confirmation avant l'envoi réel. */
function Draft({ creatorId, creatorName, lists, onClose, onSent }: { creatorId: string; creatorName: string; lists: FanList[]; onClose: () => void; onSent: () => void }) {
  const [text, setText] = useState("");
  const [price, setPrice] = useState(0);
  const [inc, setInc] = useState<string[]>([]);
  const [exc, setExc] = useState<string[]>([]);
  const [online, setOnline] = useState(false);
  const [medias, setMedias] = useState<Media[]>([]);
  const [vault, setVault] = useState(false);
  const [later, setLater] = useState("");
  const [unsend, setUnsend] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !vault && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, vault, busy]);
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, other: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    set((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
    other((l) => l.filter((x) => x !== id));
  };
  const most = Math.max(0, ...lists.filter((l) => inc.includes(l.id)).map((l) => l.fans));
  const upTo = lists.filter((l) => inc.includes(l.id)).reduce((a, l) => a + l.fans, 0);
  const problem = !text.trim() && !medias.length ? "Écris un message ou ajoute un média." : price > 0 && !medias.length ? "Un PPV a besoin d’au moins un média." : !inc.length ? "Choisis au moins une liste." : later && new Date(later).getTime() < Date.now() + 60_000 ? "La date programmée doit être dans le futur." : "";
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await api("POST", "/api/mass", { creatorId, text, price, mediaIds: medias.map((m) => m.id), includedListIds: inc, excludedListIds: exc, onlineOnly: online, scheduledAt: later ? new Date(later).toISOString() : null, autoUnsendAfterSeconds: unsend || null });
      onSent();
    } catch (e) {
      setError((e as Error).message);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#2b1a26]/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-[min(760px,92vh)] w-[min(860px,100%)] flex-col overflow-hidden rounded-3xl border bg-card shadow-xl">
        <header className="flex items-center gap-3 border-b px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl">Nouveau message groupé</h2>
            <p className="text-xs text-muted">Le message part à toutes les listes choisies, sauf les fans des listes exclues.</p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card-2">
            <X className="size-4" />
          </button>
        </header>
        <div className="scroll-thin grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold">Message</label>
            <textarea className={cn(inputCls, "min-h-40 py-3")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Le message que recevront les fans…" />
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setVault(true)} className={btnCls.ghost}>
                <ImagePlus className="size-4" /> Médias / PPV
              </button>
              {medias.length ? (
                <span className="text-sm text-muted">
                  {medias.length} média{medias.length > 1 ? "s" : ""} · {price > 0 ? `PPV ${usd(price)}` : "gratuit"}
                  <button onClick={() => (setMedias([]), setPrice(0))} className="ml-2 text-xs font-semibold text-primary-soft">
                    retirer
                  </button>
                </span>
              ) : (
                <span className="text-sm text-muted">Texte seul, gratuit.</span>
              )}
            </div>
            {medias.length ? (
              <div className="flex flex-wrap gap-1.5">
                {medias.slice(0, 10).map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={m.id} src={m.thumb || ""} alt="" className="size-14 rounded-xl bg-card-2 object-cover" />
                ))}
              </div>
            ) : null}
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /> Seulement les fans en ligne
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">Quand</span>
              <input type="datetime-local" className={cn(inputCls, "w-auto")} value={later} onChange={(e) => setLater(e.target.value)} />
              <span className="text-xs text-muted">{later ? "programmé (ton heure)" : "vide = tout de suite"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">Retirer tout seul</span>
              <select className={cn(inputCls, "w-auto")} value={unsend} onChange={(e) => setUnsend(Number(e.target.value))}>
                {UNSEND.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <p className="mb-2 text-sm font-semibold">Destinataires</p>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto rounded-2xl border p-1">
              {lists.map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  <span className="text-xs text-muted tabular-nums">{num(l.fans)}</span>
                  <button onClick={() => toggle(setInc, setExc, l.id)} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", inc.includes(l.id) ? "bg-primary text-white" : "bg-card-2 text-muted")}>
                    inclure
                  </button>
                  <button onClick={() => toggle(setExc, setInc, l.id)} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", exc.includes(l.id) ? "bg-rose-500 text-white" : "bg-card-2 text-muted")}>
                    exclure
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{inc.length ? `Entre ${num(most)} et ${num(upTo)} fans avant exclusions (un fan peut être dans plusieurs listes).` : "Choisis au moins une liste."}</p>
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-3 border-t px-5 py-3">
          {confirm ? (
            <>
              <p className="min-w-0 flex-1 text-sm font-semibold">
                {later ? "Programmer" : "Envoyer maintenant"} pour {creatorName} à {inc.length > 1 ? `entre ${num(most)} et ${num(upTo)}` : num(upTo)} fans{exc.length ? " (moins les exclus)" : ""}{online ? ", seulement ceux en ligne" : ""}
                {price > 0 ? `, en PPV à ${usd(price)}` : ""} ? On ne peut pas l’annuler une fois parti.
              </p>
              <button className={btnCls.secondary} onClick={() => setConfirm(false)} disabled={busy}>
                Revenir
              </button>
              <button className={btnCls.primary} onClick={go} disabled={busy}>
                {busy ? "Envoi…" : "Oui, envoyer"}
              </button>
            </>
          ) : (
            <>
              <p className={cn("min-w-0 flex-1 text-xs", error ? "font-semibold text-rose-400" : "text-muted")}>{error || problem || "Tout est prêt : une confirmation te sera demandée."}</p>
              <button className={btnCls.primary} disabled={!!problem} onClick={() => setConfirm(true)}>
                {later ? "Programmer…" : "Envoyer…"}
              </button>
            </>
          )}
        </footer>
      </div>
      {vault ? (
        <VaultPicker
          creatorId={creatorId}
          initial={medias}
          initialPrice={price}
          onClose={() => setVault(false)}
          onDone={(m, p) => {
            setMedias(m);
            setPrice(m.length ? p : 0);
            setVault(false);
          }}
        />
      ) : null}
    </div>
  );
}
