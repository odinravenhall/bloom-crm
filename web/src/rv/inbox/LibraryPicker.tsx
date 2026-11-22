"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Folder, Image as ImageIcon, Layers, ListOrdered, Lock, MessageSquare, Mic, Play, Search, SkipForward, X } from "lucide-react";
import { MediaNotes, MediaTile, mediaSummary } from "@/rv/components/MediaTile";
import { cn, money } from "@/rv/lib/fmt";
import { Pill } from "@/rv/components/ui";
import { conv as convRate, type Lib, type LibScript, type LibSequence } from "./scriptTypes";

type Tab = "tags" | "seq";
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

/**
 * Sélecteur de scripts dans le chat, présenté comme Infloww : deux onglets (Dossiers / Séquences),
 * la liste à gauche avec ses stats, et chaque script en ligne propre à droite (nom · message · médias · prix).
 */
export function LibraryPicker({ lib, onClose, onScript, onSequence }: { lib: Lib | null; onClose: () => void; onScript: (s: LibScript) => void; onSequence: (q: LibSequence, at?: number) => void }) {
  const [tab, setTab] = useState<Tab>("tags");
  const [folder, setFolder] = useState<string | null>(null);
  const [seqId, setSeqId] = useState<number | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const byId = useMemo(() => new Map((lib?.scripts ?? []).map((s) => [s.id, s])), [lib]);

  // --- Onglet Dossiers : les étapes (messages) regroupées par dossier.
  const folders = useMemo(() => {
    const m = new Map<string, { steps: LibScript[]; sales: number; ppvSent: number; revenue: number }>();
    for (const s of lib?.scripts ?? []) {
      const f = s.tags[0] || "Général";
      const g = m.get(f) ?? { steps: [], sales: 0, ppvSent: 0, revenue: 0 };
      g.steps.push(s);
      g.sales += s.sales;
      g.ppvSent += s.price ? s.uses : 0;
      g.revenue += s.revenue;
      m.set(f, g);
    }
    return [...m.entries()].sort((a, b) => (a[0] === "Général" ? -1 : b[0] === "Général" ? 1 : a[0].localeCompare(b[0], "fr", { numeric: true })));
  }, [lib]);

  // --- Onglet Séquences : les scripts marqués « séquence ».
  const seqs = useMemo(() => (lib?.sequences ?? []).filter((s) => s.isSequence && s.steps.length), [lib]);
  const currentSeq = seqs.find((s) => s.id === seqId) ?? seqs[0] ?? null;

  const search = q.trim().toLowerCase();
  const match = (s: LibScript) => !search || (s.title || "").toLowerCase().includes(search) || s.content.toLowerCase().includes(search);

  // Lignes affichées à droite
  const tagRows = useMemo(() => {
    const steps = folder ? folders.find(([f]) => f === folder)?.[1].steps ?? [] : folders.flatMap(([, g]) => g.steps);
    return steps.filter(match);
  }, [folders, folder, search]);
  const seqRows = useMemo(() => (currentSeq ? currentSeq.steps.map((id) => byId.get(id)).filter((x): x is LibScript => !!x).filter(match) : []), [currentSeq, byId, search]);

  const totalScripts = lib?.scripts.length ?? 0;

  return (
    <div className="pop absolute inset-x-2 bottom-2 top-16 z-20 flex flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-2xl backdrop-blur-xl md:inset-x-6">
      {/* En-tête : onglets + recherche */}
      <div className="flex flex-wrap items-center gap-2 border-b p-2.5">
        <div className="flex rounded-lg border bg-card-2 p-0.5">
          <TabBtn on={tab === "tags"} onClick={() => setTab("tags")} icon={<Layers className="size-3.5" />} label="Dossiers" />
          <TabBtn on={tab === "seq"} onClick={() => setTab("seq")} icon={<ListOrdered className="size-3.5" />} label="Séquences" />
        </div>
        {/* sélecteur mobile du dossier / de la séquence */}
        {tab === "tags" ? (
          <select value={folder ?? ""} onChange={(e) => setFolder(e.target.value || null)} className="h-8 max-w-40 rounded-lg border bg-card-2 px-2 text-xs sm:hidden">
            <option value="">Tous ({totalScripts})</option>
            {folders.map(([f, g]) => (
              <option key={f} value={f}>
                {f} ({g.steps.length})
              </option>
            ))}
          </select>
        ) : (
          <select value={currentSeq?.id ?? ""} onChange={(e) => { const q = seqs.find((x) => x.id === Number(e.target.value)); if (q) onSequence(q); }} className="h-8 max-w-44 rounded-lg border bg-card-2 px-2 text-xs sm:hidden">
            {seqs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
        <div className="relative min-w-36 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un script, un texte…" className="h-8 w-full rounded-lg border border-input bg-card-2/60 pr-3 pl-9 text-sm outline-none focus:border-primary" />
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-card-2 hover:text-fg">
          <X className="size-5" />
        </button>
      </div>

      {lib && !totalScripts ? (
        <p className="p-8 text-center text-sm text-muted">
          Aucun script pour cette modèle.{" "}
          <Link href="/app/scripts" className="text-primary-soft underline">
            Importer ou en créer
          </Link>
        </p>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Volet gauche : dossiers (onglet Dossiers) ou séquences (onglet Séquences) */}
          <aside className="scroll-thin hidden w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-panel p-2 sm:flex">
            {tab === "tags" ? (
              <>
                <SideRow on={folder === null} onClick={() => setFolder(null)} icon={<Layers className="size-4" />} name="Tous les scripts" count={totalScripts} />
                {folders.map(([f, g]) => (
                  <SideRow key={f} on={folder === f} onClick={() => setFolder(f)} icon={<Folder className="size-4" />} name={f} count={g.steps.length} conv={convRate(g.sales, g.ppvSent)} revenue={g.revenue} />
                ))}
              </>
            ) : seqs.length ? (
              seqs.map((s) => (
                <SideRow key={s.id} on={currentSeq?.id === s.id} onClick={() => { setSeqId(s.id); onSequence(s); }} icon={<ListOrdered className="size-4" />} name={s.title} count={s.steps.length} conv={convRate(s.sales, s.ppvSent)} revenue={s.revenue} />
              ))
            ) : (
              <p className="p-3 text-xs text-muted">Aucune séquence. Active « Séquence » sur un script dans la page Scripts.</p>
            )}
          </aside>

          {/* Volet droit : les scripts en lignes */}
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {tab === "seq" && currentSeq ? (
              <div className="flex items-center justify-between gap-2 border-b bg-card-2/40 px-3 py-2">
                <span className="min-w-0 truncate text-sm font-bold">{currentSeq.title}</span>
                <button onClick={() => onSequence(currentSeq)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white">
                  <Play className="size-3.5" /> {lib?.progress.some((p) => p.sequenceId === currentSeq.id) ? "Reprendre" : "Démarrer"}
                </button>
              </div>
            ) : null}

            {(tab === "tags" ? tagRows : seqRows).map((s, i) => (
              <ScriptRow key={`${s.id}-${i}`} s={s} index={tab === "seq" ? i + 1 : null} onClick={() => (tab === "seq" && currentSeq ? onSequence(currentSeq, i) : onScript(s))} />
            ))}
            {!(tab === "tags" ? tagRows : seqRows).length ? <p className="p-8 text-center text-sm text-muted">{search ? "Aucun script ne correspond." : "Vide."}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold", on ? "bg-primary text-white" : "text-muted hover:text-fg")}>
      {icon} {label}
    </button>
  );
}

function SideRow({ on, onClick, icon, name, count, conv, revenue }: { on: boolean; onClick: () => void; icon: React.ReactNode; name: string; count: number; conv?: number | null; revenue?: number }) {
  return (
    <button onClick={onClick} className={cn("flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors", on ? "bg-primary/15" : "hover:bg-white/[0.04]")}>
      <span className="flex items-center gap-2">
        <span className={on ? "text-primary-soft" : "text-muted"}>{icon}</span>
        <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", on ? "text-fg" : "text-fg/85")}>{name}</span>
      </span>
      <span className="flex items-center gap-2 pl-6 text-[11px] text-muted tabular-nums">
        <span className="inline-flex items-center gap-0.5">
          <MessageSquare className="size-3" /> {count}
        </span>
        {conv !== undefined ? <span>{pct(conv)}</span> : null}
        {revenue ? <span className="font-semibold text-emerald-300">{money(revenue, 0)}</span> : null}
      </span>
    </button>
  );
}

/** Une ligne de script façon Infloww : à gauche son nom/code, à droite le message + médias + prix + consigne. */
function ScriptRow({ s, index, onClick }: { s: LibScript; index: number | null; onClick: () => void }) {
  const thumbs = s.medias.slice(0, 5);
  return (
    <button onClick={onClick} className={cn("flex w-full gap-3 border-b border-line/50 px-3 py-2.5 text-left hover:bg-white/[0.03]", s.usedWithFan && "opacity-70")}>
      <span className="w-14 shrink-0 pt-0.5 text-[11px] font-bold text-muted tabular-nums">
        {index !== null ? (
          <span className="flex flex-col items-start gap-1">
            <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-primary-soft">{String(index).padStart(2, "0")}</span>
            {s.title ? <span className="line-clamp-2 break-words">{s.title}</span> : null}
          </span>
        ) : (
          <span className="line-clamp-2 break-words">{s.title || "—"}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        {s.note ? <span className="mb-1 inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-200 uppercase">{s.note}</span> : null}
        {s.content ? <span className="block text-sm whitespace-pre-wrap text-fg/90">{s.content}</span> : s.medias.length ? <span className="block text-xs text-muted italic">Sans texte · {mediaSummary(s.medias)}</span> : null}
        {thumbs.length ? (
          <span className="mt-1.5 flex items-center gap-1">
            {thumbs.map((m) => (
              <MediaTile key={m.id} m={m} />
            ))}
            {s.medias.length > 5 ? <span className="grid size-12 place-items-center rounded-md bg-card-2 text-xs font-bold text-muted">+{s.medias.length - 5}</span> : null}
          </span>
        ) : null}
        <MediaNotes list={s.medias} />
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {s.price ? (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-primary-soft">
            <Lock className="size-3" /> {money(s.price)}
          </span>
        ) : null}
        {s.medias.length ? (
          <Pill>
            {s.medias.every((m) => m.type === "audio") ? <Mic className="size-3" /> : <ImageIcon className="size-3" />} {s.medias.length}
          </Pill>
        ) : null}
        {s.usedWithFan ? <SentInfo s={s} /> : null}
      </span>
    </button>
  );
}

/** Barre de séquence au-dessus de la zone de message : étape courante, précédente / suivante, envoyer, passer. */
export function SequenceBar({
  seq,
  step,
  scripts,
  sending,
  onStep,
  onSend,
  onEdit,
  onClose,
}: {
  seq: LibSequence;
  step: number;
  scripts: Map<number, LibScript>;
  sending: boolean;
  onStep: (n: number) => void;
  onSend: (s: LibScript) => void;
  onEdit: (s: LibScript) => void;
  onClose: () => void;
}) {
  const [small, setSmall] = useState(false);
  const total = seq.steps.length;
  const done = step >= total;
  const s = done ? null : scripts.get(seq.steps[step]);
  return (
    <div className="pop mb-2 overflow-hidden rounded-2xl border border-primary/40 bg-card/90">
      <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2">
        <ListOrdered className="size-4 text-primary-soft" />
        <span className="min-w-0 flex-1 truncate text-xs font-bold tracking-wide uppercase">{seq.title}</span>
        <button onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0} className="rounded-md p-0.5 text-muted hover:text-fg disabled:opacity-30" title="Étape précédente">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-xs font-bold tabular-nums">
          {Math.min(step + 1, total)}
          <span className="text-muted"> / {total}</span>
        </span>
        <button onClick={() => onStep(Math.min(total, step + 1))} disabled={done} className="rounded-md p-0.5 text-muted hover:text-fg disabled:opacity-30" title="Étape suivante">
          <ChevronRight className="size-4" />
        </button>
        <button onClick={() => setSmall((x) => !x)} className="rounded-md p-0.5 text-muted hover:text-fg" title={small ? "Déplier" : "Replier"}>
          {small ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
        <button onClick={onClose} className="rounded-md p-0.5 text-muted hover:text-fg" title="Fermer la séquence">
          <X className="size-4" />
        </button>
      </div>
      {!small ? (
        done ? (
          <p className="flex items-center gap-1.5 px-3 py-3 text-sm text-muted">
            <CheckCircle2 className="size-4 text-emerald-300" /> Séquence terminée pour ce fan
          </p>
        ) : s ? (
          <div className="flex gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              {s.title ? <p className="mb-0.5 text-[11px] font-bold tracking-wide text-primary-soft uppercase">{s.title}</p> : null}
              {s.note ? <p className="mb-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-200 uppercase">{s.note}</p> : null}
              {s.content ? <p className="line-clamp-3 text-sm whitespace-pre-wrap">{s.content}</p> : <p className="text-xs text-muted italic">Sans texte : seuls les médias sont envoyés</p>}
              {s.medias.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.medias.slice(0, 6).map((m) => (
                    <MediaTile key={m.id} m={m} className="size-11" />
                  ))}
                  {s.medias.length > 6 ? <span className="grid size-11 place-items-center rounded-md bg-card-2 text-xs font-bold text-muted">+{s.medias.length - 6}</span> : null}
                </div>
              ) : null}
              <MediaNotes list={s.medias} />
              <div className="mt-1 flex flex-wrap gap-1">
                {s.price ? (
                  <Pill tone="accent">
                    <Lock className="size-3" /> PPV {money(s.price)}
                  </Pill>
                ) : null}
                {s.medias.length ? <Pill>{mediaSummary(s.medias)}</Pill> : null}
                {s.usedWithFan ? (
                  <Pill tone="good">
                    déjà envoyé{s.usedBy ? ` par ${s.usedBy}` : ""}
                    {s.usedWithFan !== "reveal" ? ` · ${sentWhen(s.usedWithFan)}` : ""}
                  </Pill>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <button onClick={() => onSend(s)} disabled={sending} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-white disabled:opacity-50">
                <Play className="size-3.5" /> Envoyer
              </button>
              <button onClick={() => onStep(step + 1)} className="inline-flex h-7 items-center justify-center gap-1 rounded-lg px-3 text-xs text-muted hover:text-fg">
                <SkipForward className="size-3.5" /> Passer
              </button>
              <button onClick={() => onEdit(s)} className="h-7 rounded-lg px-3 text-xs text-muted hover:text-fg">
                Modifier
              </button>
            </div>
          </div>
        ) : (
          <p className="px-3 py-3 text-sm text-muted">Étape introuvable (script supprimé).</p>
        )
      ) : null}
    </div>
  );
}

const sentWhen = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Coche « déjà envoyé à ce fan » + par qui et quand. */
function SentInfo({ s }: { s: LibScript }) {
  return (
    <span className="flex flex-col items-end gap-0.5 text-right" title={`Déjà envoyé à ce fan${s.usedBy ? ` par ${s.usedBy}` : ""}${s.usedWithFan && s.usedWithFan !== "reveal" ? ` le ${sentWhen(s.usedWithFan)}` : ""}`}>
      <CheckCircle2 className="size-4 text-emerald-300" />
      <span className="max-w-24 truncate text-[10px] leading-tight font-semibold text-emerald-300/90">{s.usedBy ?? "envoyé"}</span>
      {s.usedWithFan && s.usedWithFan !== "reveal" ? <span className="text-[10px] leading-tight text-muted tabular-nums">{sentWhen(s.usedWithFan)}</span> : <span className="text-[10px] leading-tight text-muted">sur Reveal</span>}
    </span>
  );
}
