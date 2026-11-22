"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, Plus, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn, eur, num, usd, when } from "@/lib/fmt";
import { CreatorTabs, useCreators } from "@/lib/creators";
import type { FanList, MassMessage } from "@/lib/types";
import { Pill, btnCls, inputCls } from "@/components/ui";

type Page = { total: number; page: number; pages: number; items: MassMessage[] };

const money = (v: number | null, cur: string) => (v == null ? "â€”" : cur === "USD" ? usd(v, 0) : eur(v * 100, 0));
const pct = (a: number | null, b: number | null) => (a == null || !b ? null : Math.round((a / b) * 100));

const STATUS: Record<string, [string, "good" | "warn" | "info" | "muted" | "bad"]> = {
  SENT: ["envoyÃ©", "good"],
  SCHEDULED: ["programmÃ©", "info"],
  SENDING: ["en cours", "info"],
  CANCELED: ["annulÃ©", "muted"],
  CANCELLED: ["annulÃ©", "muted"],
  UNSENT: ["retirÃ©", "warn"],
  FAILED: ["Ã©chec", "bad"],
};

/** Envoi groupÃ© : l'historique des messages de masse de Substy avec leurs rÃ©sultats, les listes de fans, et le brouillon d'un nouvel envoi. */
export function Mass() {
  const { creatorId, creator } = useCreators();
  const [data, setData] = useState<Page | null>(null);
  const [lists, setLists] = useState<FanList[] | null>(null);
  const [page, setPage] = useState(1);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(false);

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
  }, [creatorId, page]);

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
          <h1 className="text-4xl md:text-5xl">Envoi groupÃ©</h1>
          <p className="mt-1 text-sm text-muted">{creator ? `Les messages de masse de ${creator.name} et ce quâ€™ils ont rapportÃ©.` : "Choisis une crÃ©atrice."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <CreatorTabs />
          <button onClick={() => setDraft(true)} className={btnCls.primary} disabled={!creatorId}>
            <Plus className="size-4" /> Nouveau message groupÃ©
          </button>
        </div>
      </div>
      {err ? <p className="mx-4 mb-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300 md:mx-8">{err}</p> : null}

      <div className="flex min-h-0 flex-1 border-t">
        <section className="scroll-thin min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
          {data ? (
            <>
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Band label="Messages groupÃ©s" value={num(data.total)} sub="depuis le dÃ©but" />
                <Band label="Destinataires" value={num(sum.recipients)} sub={`sur les ${data.items.length} affichÃ©s`} />
                <Band label="Achats" value={num(sum.purchased)} sub={sum.viewed ? `${num(sum.viewed)} vus` : undefined} />
                <Band label="RapportÃ©" value={money(sum.revenue, sum.cur)} sub="brut, sur cette page" accent />
              </div>
              <div className="flex flex-col gap-2">
                {data.items.map((m) => (
                  <Row key={m.id} m={m} listName={listName} />
                ))}
                {!data.items.length ? <p className="p-10 text-center text-sm text-muted">Aucun message groupÃ© pour cette crÃ©atrice.</p> : null}
              </div>
              {data.pages > 1 ? (
                <div className="mt-4 flex items-center justify-center gap-3 text-sm">
                  <button className={btnCls.ghost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="size-4" /> Plus rÃ©cents
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
            <p className="p-10 text-center text-sm text-muted">Chargementâ€¦</p>
          ) : null}
        </section>

        <aside className="scroll-thin hidden w-[300px] shrink-0 overflow-y-auto border-l bg-panel p-4 lg:block">
          <h2 className="mb-1 text-xl">Listes de fans</h2>
          <p className="mb-3 text-xs text-muted">Les audiences possibles dâ€™un envoi groupÃ©, comme sur Substy.</p>
          {(lists ?? []).map((l) => (
            <div key={l.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-card-2">
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
              <span className="text-xs text-muted tabular-nums">{num(l.fans)}</span>
            </div>
          ))}
          {!lists ? <p className="text-sm text-muted">Chargementâ€¦</p> : null}
        </aside>
      </div>

      {draft && creatorId ? <Draft lists={lists ?? []} onClose={() => setDraft(false)} /> : null}
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
  const [label, tone] = STATUS[m.status.toUpperCase()] ?? [m.status.toLowerCase() || "â€”", "muted" as const];
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
        {m.medias ? <Pill>{m.medias} mÃ©dia{m.medias > 1 ? "s" : ""}</Pill> : null}
        {m.onlineOnly ? <Pill tone="info">fans en ligne</Pill> : null}
        {m.revertedBy ? <Pill tone="warn">retirÃ© par {m.revertedBy}</Pill> : null}
      </div>
      {m.text ? <p className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap">{m.text}</p> : <p className="mt-2 text-sm text-muted italic">Sans texte</p>}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Users className="size-3.5" />
        {m.included.length ? names(m.included) : m.fans ? `${m.fans} fan${m.fans > 1 ? "s" : ""} choisis` : "tous les fans"}
        {m.excluded.length ? ` Â· sauf ${names(m.excluded)}` : ""}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-sm sm:grid-cols-4">
        <Fig label="Destinataires" v={num(m.recipients)} />
        <Fig label="Vus" v={num(m.viewed)} sub={pct(m.viewed, m.recipients) != null ? `${pct(m.viewed, m.recipients)} %` : undefined} />
        <Fig label="Achats" v={num(m.purchased)} sub={conv != null && m.price > 0 ? `${conv} %` : undefined} />
        <Fig label="RapportÃ©" v={money(m.gross, m.currency)} sub={m.net != null ? `${money(m.net, m.currency)} net` : undefined} />
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

/** Brouillon d'un envoi groupÃ©. L'envoi depuis Bloom s'ouvrira une fois le format de Substy relevÃ© sur un vrai envoi. */
function Draft({ lists, onClose }: { lists: FanList[]; onClose: () => void }) {
  const [text, setText] = useState("");
  const [price, setPrice] = useState(0);
  const [inc, setInc] = useState<string[]>([]);
  const [exc, setExc] = useState<string[]>([]);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, other: React.Dispatch<React.SetStateAction<string[]>>, id: string) => {
    set((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
    other((l) => l.filter((x) => x !== id));
  };
  const most = Math.max(0, ...lists.filter((l) => inc.includes(l.id)).map((l) => l.fans));
  const upTo = lists.filter((l) => inc.includes(l.id)).reduce((a, l) => a + l.fans, 0);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#2b1a26]/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-[min(760px,92vh)] w-[min(860px,100%)] flex-col overflow-hidden rounded-3xl border bg-card shadow-xl">
        <header className="flex items-center gap-3 border-b px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl">Nouveau message groupÃ©</h2>
            <p className="text-xs text-muted">Le message part Ã  toutes les listes choisies, sauf les fans des listes exclues.</p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card-2">
            <X className="size-4" />
          </button>
        </header>
        <div className="scroll-thin grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold">Message</label>
            <textarea className={cn(inputCls, "min-h-40 py-3")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Le message que recevront les fansâ€¦" />
            <label className="mt-2 text-sm font-semibold">Prix (PPV)</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} step={1} className={cn(inputCls, "w-32")} value={price || ""} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} placeholder="0" />
              <span className="text-sm text-muted">$ â€” 0 = gratuit. Les mÃ©dias sâ€™ajouteront depuis le Vault.</span>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} /> Seulement les fans en ligne
            </label>
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
            <p className="mt-2 text-xs text-muted">{inc.length ? `Entre ${num(most)} et ${num(upTo)} fans avant exclusions (un fan peut Ãªtre dans plusieurs listes).` : "Choisis au moins une liste."}</p>
          </div>
        </div>
        <footer className="flex flex-wrap items-center gap-3 border-t px-5 py-3">
          <p className="min-w-0 flex-1 text-xs text-muted">Lâ€™envoi depuis Bloom sâ€™ouvre bientÃ´t : il faut dâ€™abord valider un premier envoi rÃ©el avec Substy. En attendant, envoie-le depuis Substy.</p>
          <a href="https://app.substy.ai/mass-messages" target="_blank" rel="noreferrer" className={btnCls.secondary}>
            Ouvrir Substy
          </a>
          <button className={btnCls.primary} disabled title="BientÃ´t">
            Envoyer
          </button>
        </footer>
      </div>
    </div>
  );
}
