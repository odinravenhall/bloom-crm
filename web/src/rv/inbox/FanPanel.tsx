"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, BarChart3, CalendarDays, Check, CreditCard, Database, Gift, Loader2, Lock, Pencil, Search, Sparkles, UserRound, Wallet, Zap, Trash2 } from "lucide-react";
import { api, toast } from "@/rv/lib/client";
import { ago, clock, cn, money, num, pct } from "@/rv/lib/fmt";
import { FAN_FIELDS, firstNameOf, modelSheetText, type ProfileData } from "@/rv/lib/profiles";
import { filterSheet, parseSheet } from "@/rv/lib/modelSheet";
import { Avatar, Pill } from "@/rv/components/ui";
import { FanAvatar } from "@/rv/components/FanAvatar";
import { ScoreCard } from "@/rv/components/ScoreCard";
import { NewSubBadge } from "@/rv/components/NewSub";
import { PpvTimeline } from "./PpvTimeline";
import { FanScripts, FreeMedias } from "./FanScripts";
import { SubstyCard } from "./SubstyCard";
import type { Conv, Model } from "./types";

type Stats = {
  memberCreatedAt?: string;
  firstSubscriptionAt?: string;
  totalSpent?: number;
  tipsTotal?: number;
  highestPurchase?: number;
  lastPaidAt?: string;
  subscriptionExpireAt?: string;
  subscriptionPeriodicity?: string;
  autoRenew?: boolean;
  buyingRate?: { purchased: number; total: number; percentage: number };
  paymentIssues?: { count: number; cause?: string };
  refundAskedTotal?: number;
};
type FanResp = {
  stats: Stats | null;
  platformSpent: number | null;
  insights: { access?: string } | null;
  profile: ProfileData;
  profileUpdated: { at: number; by: string | null } | null;
};

/** « Sur tout Reveal » : construit avec nos données (les Insights officiels de Reveal sont une option payante). */
function PlatformCard({ conv, fan }: { conv: Conv; fan: FanResp | null }) {
  if (!fan) return null;
  const spent = fan.platformSpent;
  const band =
    spent === null ? null : spent <= 0 ? "Aucune dépense" : spent < 5000 ? "Moins de 50 €" : spent < 25000 ? "50 € – 250 €" : spent < 100000 ? "250 € – 1 000 €" : "Plus de 1 000 €";
  const seenMs = conv.lastSeenAt ? Date.now() - Date.parse(conv.lastSeenAt) : null;
  const created = fan.stats?.memberCreatedAt ? Date.parse(fan.stats.memberCreatedAt) : null;
  const isNew = created !== null && Date.now() - created < 7 * 864e5;
  const items: { icon: React.ReactNode; tone: string; label: React.ReactNode; sub?: string }[] = [
    spent !== null
      ? { icon: <Wallet className="size-4" />, tone: spent > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-muted", label: spent > 0 ? "A déjà payé" : "N’a jamais payé" }
      : null,
    band ? { icon: <Database className="size-4" />, tone: "bg-white/5 text-muted", label: `Dépenses : ${band}`, sub: "sur toutes les créatrices" } : null,
    seenMs !== null
      ? {
          icon: <Zap className="size-4" />,
          tone: seenMs < 5 * 60000 ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-muted",
          label: seenMs < 5 * 60000 ? "Connecté en ce moment" : seenMs < 864e5 ? "Connecté aujourd’hui" : `Vu ${ago(conv.lastSeenAt)}`,
        }
      : null,
    {
      icon: <CreditCard className="size-4" />,
      tone: conv.cardVerified ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300",
      label: conv.cardVerified ? (
        <span className="inline-flex items-center gap-1.5">
          CB vérifiée <BadgeCheck className="size-4 text-emerald-400" />
        </span>
      ) : (
        "CB non vérifiée"
      ),
      sub: conv.cardVerified ? undefined : "aucune carte validée sur Reveal",
    },
    created !== null
      ? { icon: <CalendarDays className="size-4" />, tone: isNew ? "bg-sky-500/15 text-sky-300" : "bg-white/5 text-muted", label: isNew ? "Nouveau sur la plateforme" : `Sur Reveal depuis ${new Date(created).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}`, sub: isNew ? "moins de 7 jours" : undefined }
      : null,
  ].filter(Boolean) as { icon: React.ReactNode; tone: string; label: React.ReactNode; sub?: string }[];
  if (!items.length) return null;
  return (
    <div className="w-full rounded-2xl border bg-card/70 p-3 text-left">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Sur tout Reveal</p>
        <span className="rounded-full border border-primary/50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary-soft uppercase">Insights</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((i, k) => (
          <div key={k} className="flex items-center gap-2.5 rounded-xl bg-card-2/60 px-2.5 py-2">
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", i.tone)}>{i.icon}</span>
            <span className="min-w-0 text-sm font-semibold">
              {i.label}
              {i.sub ? <span className="block text-[11px] font-normal text-muted">{i.sub}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
type History = {
  complete: boolean;
  fanMessages: number;
  ourMessages: number;
  firstMessageAt: string | null;
  ppvSent: number;
  ppvPaid: number;
  ppvTotal: number;
  ppv: { id: string; created_at: string; bundle_price: number; bundle_paid: number | null; author_name: string | null; media_count: number; content: string }[];
  tips: { id: string; created_at: string; content: string }[];
};

const TABS = [
  { k: "fiche", label: "Notes", icon: UserRound },
  { k: "modele", label: "Modèle", icon: Sparkles },
  { k: "stats", label: "Stats", icon: BarChart3 },
] as const;

const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");

export function FanPanel({ conv, model, onChanged, admin, onErased }: { conv: Conv; model?: Model; onChanged: () => void; admin?: boolean; onErased?: () => void }) {
  // Chaque conversation s'ouvre sur les Notes (le plus utile pour répondre au fan).
  const [tab, setTab] = useState<(typeof TABS)[number]["k"]>("fiche");
  const [fan, setFan] = useState<FanResp | null>(null);

  useEffect(() => {
    api<FanResp>("GET", `/api/conversations/${conv.id}/fan`)
      .then(setFan)
      .catch(() => setFan({ stats: null, platformSpent: null, insights: null, profile: {}, profileUpdated: null }));
  }, [conv.id]);

  const pick = (k: (typeof TABS)[number]["k"]) => {
    setTab(k);
    try {
      localStorage.setItem("crm.fanTab", k);
    } catch {}
  };

  const s = fan?.stats;
  const spent = s?.totalSpent ?? conv.totalSpent;
  const tier =
    spent >= 50000 ? { label: "Baleine", tone: "warn" as const } : spent >= 10000 ? { label: "Gros payeur", tone: "accent" as const } : spent > 0 ? { label: "Payeur", tone: "good" as const } : { label: "Non payeur", tone: "muted" as const };
  const online = conv.lastSeenAt && Date.now() - Date.parse(conv.lastSeenAt) < 5 * 60000;

  return (
    <div className="flex min-h-full flex-col">
      {/* En-tête */}
      <div className="flex flex-col gap-2 border-b px-3 pt-3 pb-3">
        <div className="flex items-center gap-3">
        <span className="relative shrink-0">
          <FanAvatar src={conv.memberAvatar} name={conv.nickname || conv.memberName} totalSpent={conv.totalSpent} badge={conv.badge} size="size-11" />
          <span className={cn("absolute right-0 bottom-0 size-3 rounded-full border-2 border-bg", online ? "bg-emerald-400" : "bg-zinc-600")} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-extrabold">{firstNameOf(fan?.profile.notes) ? `${firstNameOf(fan?.profile.notes)} · ` : ""}{conv.nickname || conv.memberName}</p>
          <p className="truncate text-xs text-muted">
            @{conv.memberName} · {online ? <span className="text-emerald-300">en ligne</span> : `vu ${ago(conv.lastSeenAt)}`}
          </p>
        </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <NewSubBadge subscribedAt={conv.subscribedAt} className="py-0.5" />
          <Pill tone={tier.tone}>{tier.label}</Pill>
          {conv.vip ? <Pill tone="warn">VIP</Pill> : null}
          {conv.crmTags.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </div>
        <div className="grid w-full grid-cols-2 gap-2">
          <div className="stat stat-accent relative overflow-hidden rounded-xl border border-primary/40 px-3 py-2">
            <p className="text-base font-extrabold tabular-nums">{money(spent)}</p>
            <p className="truncate text-[11px] text-muted">chez {model?.displayName ?? "la modèle"}</p>
          </div>
          <div className="rounded-xl border bg-card/80 px-3 py-2">
            <p className="text-base font-extrabold tabular-nums">{fan?.stats?.tipsTotal ? money(fan.stats.tipsTotal) : "—"}</p>
            <p className="text-[11px] text-muted">en pourboires</p>
          </div>
        </div>
        {conv.score ? <div className="raven-card w-full"><ScoreCard score={conv.score} /></div> : null}
      </div>

      {/* Onglets */}
      <div className="sticky top-0 z-10 flex gap-1 border-b bg-bg/90 p-2 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.k}
            onClick={() => pick(t.k)}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors", tab === t.k ? "bg-card-2 text-fg" : "text-muted hover:text-fg")}
          >
            <t.icon className="size-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4">
        {tab === "fiche" ? (
          <div className="flex flex-col gap-4">
            {/* Où en est le fan dans les scripts : juste au-dessus des notes */}
            <SubstyCard key={`sb-${conv.id}`} convId={conv.id} />
            <FanScripts key={`s-${conv.id}`} convId={conv.id} />
            <FanSheet key={conv.id} conv={conv} fan={fan} onChanged={onChanged} />
          </div>
        ) : null}
        {tab === "modele" ? <ModelSheet key={conv.modelId} modelId={conv.modelId} name={model?.displayName} /> : null}
        {tab === "stats" ? <FanStats key={conv.id} conv={conv} stats={s} /> : null}
      </div>

      {/* Droit à l'effacement (RGPD) : admins seulement */}
    </div>
  );
}

function EraseFan({ conv, onErased }: { conv: Conv; onErased?: () => void }) {
  const [busy, setBusy] = useState(false);
  const name = conv.nickname || conv.memberName || "ce fan";
  const erase = async () => {
    const typed = prompt(
      `Supprimer DÉFINITIVEMENT toutes les données de « ${name} » du CRM ?\n\nConversations, messages, fiche, notes, sur toutes les modèles. Le fan ne sera plus jamais resynchronisé depuis Reveal. Les montants des ventes restent dans les statistiques, sans lien avec lui.\n\nCette action est irréversible. Tape SUPPRIMER pour confirmer :`,
    );
    if (typed?.trim().toUpperCase() !== "SUPPRIMER") return;
    setBusy(true);
    try {
      const r = await api<{ conversations: number; messages: number }>("POST", `/api/conversations/${conv.id}/erase`);
      toast(`Données effacées : ${r.conversations} conversation(s), ${r.messages} message(s)`);
      onErased?.();
    } catch (e) {
      toast((e as Error).message, "err");
      setBusy(false);
    }
  };
  return (
    <div className="border-t px-4 py-4">
      <p className="mb-2 text-[11px] text-muted">Le fan demande la suppression de ses données (via Reveal) : efface aussi la copie du CRM.</p>
      <button onClick={erase} disabled={busy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">
        <Trash2 className="size-3.5" /> Supprimer toutes les données de ce fan
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ Fiche fan (enregistrement auto)

function FanSheet({ conv, fan, onChanged }: { conv: Conv; fan: FanResp | null; onChanged: () => void }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [tags, setTags] = useState(conv.crmTags.join(", "));
  const [rnote, setRnote] = useState(conv.revealNote);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fan && data === null) setData(fan.profile ?? {});
  }, [fan, data]);

  const save = useCallback(
    (next: ProfileData) => {
      if (timer.current) clearTimeout(timer.current);
      setState("saving");
      timer.current = setTimeout(async () => {
        try {
          await api("PUT", `/api/conversations/${conv.id}/fan`, { profile: next });
          setState("saved");
        } catch (e) {
          setState("idle");
          toast((e as Error).message, "err");
        }
      }, 700);
    },
    [conv.id],
  );

  if (!data) return <Loader2 className="mx-auto my-6 size-5 animate-spin text-muted" />;

  const set = (k: string, v: string) => {
    const next = { ...data, [k]: v };
    setData(next);
    save(next);
  };

  const saveTags = async () => {
    const list = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (list.join(",") === conv.crmTags.join(",")) return;
    try {
      await api("POST", `/api/conversations/${conv.id}/action`, { action: "crm", crmTags: list });
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const aiLog = (Array.isArray((data as Record<string, unknown>)._ai) ? (data as Record<string, unknown>)._ai : []) as { l: string; at: number }[];
  const cantPay = typeof (data as Record<string, unknown>)._cantPay === "string";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-[0.1em] text-muted uppercase">Notes</h3>
        <span className="text-[11px] text-muted">
          {state === "saving" ? "Enregistrement…" : state === "saved" ? <span className="inline-flex items-center gap-1 text-emerald-300"><Check className="size-3" /> enregistré</span> : fan?.profileUpdated ? `modifiées ${ago(new Date(fan.profileUpdated.at).toISOString())}${fan.profileUpdated.by ? ` par ${fan.profileUpdated.by}` : ""}` : "vides"}
        </span>
      </div>
      {cantPay ? (
        <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-200">Ne peut pas payer en ce moment — le 📄 part tout seul dès qu’il rachète.</p>
      ) : null}
      <textarea
        value={data.notes ?? ""}
        onChange={(e) => set("notes", e.target.value)}
        placeholder={FAN_FIELDS[0].ph}
        title="Pas de goûts intimes ni de préférences sexuelles dans les notes (règle de l’agence)"
        className="scroll-thin min-h-[46dvh] resize-y rounded-xl border border-input bg-card-2/60 px-3 py-2.5 text-sm leading-relaxed text-fg outline-none placeholder:text-muted/50 focus:border-primary"
      />
      <p className="text-[11px] text-muted">Pas de goûts intimes ni de préférences sexuelles ici : règle de l’agence (RGPD).</p>
      {aiLog.length ? (
        <details className="rounded-xl border bg-card/60 px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-muted">
            <Sparkles className="size-3.5 text-primary-soft" /> {aiLog.length} info{aiLog.length > 1 ? "s" : ""} notée{aiLog.length > 1 ? "s" : ""} par l’IA · {ago(new Date(aiLog[aiLog.length - 1].at).toISOString())}
          </summary>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-muted">
            {aiLog.slice(-12).reverse().map((x, i) => (
              <li key={i} className="truncate">
                {x.l}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
        Tags (visibles dans la file)
        <input value={tags} onChange={(e) => setTags(e.target.value)} onBlur={saveTags} placeholder="baleine, à relancer…" className="h-9 rounded-xl border border-input bg-card-2/60 px-2.5 text-sm font-normal text-fg outline-none placeholder:text-muted/50 focus:border-primary" />
      </label>
    </div>
  );
}

// ------------------------------------------------------------------ Fiche modèle

/** Fiche modèle : un seul texte collé par un admin (la fiche de l'agence), affiché en rubriques lisibles, avec une recherche. */
export function ModelSheet({ modelId, name }: { modelId: string; name?: string }) {
  const [r, setR] = useState<{ profile: ProfileData; updated: { at: number; by: string | null } | null; canEdit: boolean } | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    api<{ profile: ProfileData; updated: { at: number; by: string | null } | null; canEdit: boolean }>("GET", `/api/models/${modelId}/profile`).then(setR).catch(() => {});
  }, [modelId]);

  if (!r) return <Loader2 className="mx-auto my-6 size-5 animate-spin text-muted" />;
  const text = modelSheetText(r.profile);

  if (edit !== null) {
    return (
      <div className="flex flex-col gap-2.5">
        <h3 className="text-xs font-bold tracking-[0.1em] text-muted uppercase">Fiche de {name}</h3>
        <p className="text-[11px] text-muted">Colle la fiche complète telle quelle (emojis, ➡️, ⛔, 🚨…) : elle sera rangée en rubriques toute seule.</p>
        <textarea
          autoFocus
          value={edit}
          onChange={(e) => setEdit(e.target.value)}
          placeholder={"NADIA ⬇️\n🇫🇷 Langue\n➡️ Français\n…\n\n⚠️ Limites de contenu\n⛔ …\n\n🏷️ PRIX MINIMUM\n…"}
          className="scroll-thin min-h-[55dvh] resize-y rounded-xl border border-input bg-card-2/60 px-2.5 py-2 font-mono text-xs leading-relaxed text-fg outline-none placeholder:text-muted/50 focus:border-primary"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted tabular-nums">{edit.length.toLocaleString("fr-FR")} / 20 000</span>
          <div className="flex gap-2">
            <button onClick={() => setEdit(null)} className="h-9 rounded-xl border bg-card-2 px-3 text-xs font-semibold">
              Annuler
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("PUT", `/api/models/${modelId}/profile`, { profile: { sheet: edit } });
                  setR({ ...r, profile: { sheet: edit }, updated: { at: Date.now(), by: "toi" } });
                  setEdit(null);
                  toast("Fiche modèle enregistrée");
                } catch (e) {
                  toast((e as Error).message, "err");
                } finally {
                  setBusy(false);
                }
              }}
              className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const blocks = filterSheet(parseSheet(text), q);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-[0.1em] text-muted uppercase">Fiche de {name}</h3>
        {r.canEdit ? (
          <button onClick={() => setEdit(text)} className="inline-flex h-7 items-center gap-1 rounded-lg border bg-card-2 px-2 text-[11px] font-semibold hover:border-primary/60">
            <Pencil className="size-3" /> {text ? "Modifier" : "Coller la fiche"}
          </button>
        ) : null}
      </div>
      {!text ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted">{r.canEdit ? "Fiche vide : clique sur « Coller la fiche » et colle la fiche complète." : "Pas encore de fiche pour cette modèle."}</p>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher (pointure, prix, limites…)" className="h-8 w-full rounded-lg border border-input bg-card-2/60 pr-2 pl-8 text-xs outline-none focus:border-primary" />
          </div>
          {!blocks.length ? <p className="py-3 text-center text-xs text-muted">Rien trouvé pour « {q} ».</p> : null}
          {blocks.map((b, i) =>
            b.title && !b.lines.length && i === 0 && !q ? (
              <p key={i} className="text-lg font-extrabold">{b.title}</p>
            ) : (
              <div
                key={i}
                className={cn(
                  "rounded-xl border bg-card/70 p-3",
                  b.tone === "danger" && "border-rose-500/35 bg-rose-500/[0.06]",
                  b.tone === "warn" && "border-amber-500/35 bg-amber-500/[0.06]",
                  b.tone === "price" && "border-emerald-500/35 bg-emerald-500/[0.06]",
                  b.tone === "intim" && "border-primary/35 bg-primary/[0.05]",
                )}
              >
                {b.title ? (
                  <p className={cn("mb-1.5 text-[12px] font-bold", b.tone === "danger" ? "text-rose-300" : b.tone === "warn" ? "text-amber-300" : b.tone === "price" ? "text-emerald-300" : b.tone === "intim" ? "text-primary-soft" : "text-fg")}>{b.title}</p>
                ) : null}
                <ul className="flex flex-col gap-1">
                  {b.lines.map((l, k) => (
                    <li
                      key={k}
                      className={cn(
                        "flex gap-1.5 text-[13px] leading-snug",
                        l.kind === "alert" && "rounded-lg bg-amber-500/10 px-2 py-1.5 font-semibold text-amber-100",
                        l.kind === "no" && "font-semibold text-rose-200",
                        l.kind === "ok" && "text-emerald-100",
                        b.tone === "price" && l.kind === "plain" && "font-semibold",
                      )}
                    >
                      <span className="shrink-0 text-muted">{l.kind === "no" ? "⛔" : l.kind === "alert" ? "🚨" : l.kind === "ok" ? "✔️" : l.kind === "item" ? "•" : ""}</span>
                      <span className="min-w-0 break-words whitespace-pre-wrap">{l.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </>
      )}
      {r.updated ? <p className="text-[11px] text-muted">Mise à jour {ago(new Date(r.updated.at).toISOString())}{r.updated.by ? ` par ${r.updated.by}` : ""}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ Stats + timeline PPV

export function FanStats({ conv, stats }: { conv: Conv; stats: Stats | null | undefined }) {
  const [h, setH] = useState<History | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<History>("POST", `/api/conversations/${conv.id}/history`)
      .then(setH)
      .catch((e) => setErr((e as Error).message));
  }, [conv.id]);

  const rows: [string, React.ReactNode][] = [
    ["Abonné depuis", date(stats?.firstSubscriptionAt)],
    ["Premier message", h ? date(h.firstMessageAt) : "…"],
    ["Messages du fan", h ? num(h.fanMessages) : "…"],
    ["Nos messages", h ? num(h.ourMessages) : "…"],
    ["Dernier achat", stats?.lastPaidAt ? `${clock(stats.lastPaidAt)} (${ago(stats.lastPaidAt)})` : "jamais"],
    ["Plus gros achat", stats?.highestPurchase ? money(stats.highestPurchase) : "—"],
    ["PPV achetés", stats?.buyingRate ? `${stats.buyingRate.purchased} / ${stats.buyingRate.total} (${stats.buyingRate.percentage} %)` : h ? `${h.ppvPaid} / ${h.ppvSent} (${pct(h.ppvPaid, h.ppvSent)})` : "…"],
    ["Pourboires", money(stats?.tipsTotal ?? 0)],
    [
      "Fin d’abonnement",
      stats?.subscriptionExpireAt && new Date(stats.subscriptionExpireAt).getFullYear() < 2090 ? `${date(stats.subscriptionExpireAt)}${stats.autoRenew ? " · renouvellement auto" : ""}` : stats?.autoRenew ? "renouvellement auto" : "—",
    ],
  ];
  if (stats?.paymentIssues?.count) rows.push(["Paiements refusés", <span key="p" className="text-rose-300">{stats.paymentIssues.count}</span>]);
  if (stats?.refundAskedTotal) rows.push(["Remboursements demandés", <span key="r" className="text-rose-300">{money(stats.refundAskedTotal)}</span>]);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 rounded-xl border bg-card/70 p-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {err ? <p className="text-sm text-rose-300">{err}</p> : null}
      <PpvTimeline convId={conv.id} />
      <FreeMedias convId={conv.id} />
    </div>
  );
}
