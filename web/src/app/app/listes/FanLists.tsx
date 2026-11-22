"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Award, BadgeDollarSign, Bell, ChevronDown, Clock, Copy, Crown, Flame, Gamepad2, Gem, Gift, Heart, Laugh, Lightbulb, Loader2, Mail, Medal,
  MessageCircle, MessageSquare, Palette, Pencil, Plus, Search, Smile, Sparkles, Star, Trash2, Trophy, UserPlus, UserRound, UsersRound, VolumeX, X, Zap,
  type LucideIcon,
} from "lucide-react";
import { api, toast } from "@/lib/api";
import { ago, cn, num } from "@/lib/fmt";
import { CreatorTabs, useCreators } from "@/lib/creators";
import { Avatar, Pill, btnCls, inputCls } from "@/components/ui";

type L = {
  id: number;
  kind: "spend" | "newfans" | "manual" | "auto";
  name: string;
  color: string | null;
  icon: string | null;
  min: number | null;
  max: number | null;
  days: number | null;
  includeExpired: boolean;
  noPay: boolean;
  ppvOnly: boolean;
  ageMin: number | null;
  ageMax: number | null;
  rateMin: number | null;
  rateMax: number | null;
  ratePpv: number | null;
  reset: "never" | "daily" | "weekly" | "monthly";
  count: number;
  active: number;
  expired: number;
};
type Resp = { platform: "of" | "mym"; fans: number; lists: L[] };
type Member = { fanId: string; name: string; username: string | null; avatar: string | null; total: number; since: number | null; expired: boolean; rate: number | null; addedBy: string | null };

// Icônes des groupes MYM (comme MyPulse).
const ICONS: Record<string, LucideIcon> = {
  user: UserRound, users: UsersRound, star: Star, heart: Heart, crown: Crown, dollar: BadgeDollarSign, trophy: Trophy, medal: Medal, award: Award, gem: Gem,
  flame: Flame, mute: VolumeX, game: Gamepad2, palette: Palette, gift: Gift, chat: MessageCircle, msg: MessageSquare, mail: Mail, bell: Bell, smile: Smile,
  laugh: Laugh, idea: Lightbulb, zap: Zap, sparkles: Sparkles,
};
const RESETS: [L["reset"], string, string][] = [
  ["never", "Jamais", "Le groupe garde ses fans jusqu’à ce que quelqu’un les retire."],
  ["daily", "Chaque jour", "Le groupe est vidé tous les jours à minuit."],
  ["weekly", "Chaque semaine", "Le groupe est vidé tous les lundis."],
  ["monthly", "Chaque mois", "Le groupe est vidé le 1er du mois."],
];
// Tranches proposées par défaut (comme le modèle d'Infloww).
const DEFAULT_SEGMENTS = [
  { name: "💰 +1$ (Petit spender)", min: 1, max: 100 },
  { name: "⭐ +100$ (Mid spender)", min: 100, max: 300 },
  { name: "👁️ +300$ (Big spender)", min: 300, max: 600 },
  { name: "🐬 +600$ (Baleine)", min: 600, max: 1000 },
  { name: "🐳 BIG Baleine ⚠️", min: 1000, max: null as number | null },
];
const fmtAmount = (v: number | null, cur: string) => (v == null ? "∞" : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${cur}`);

/**
 * Listes de fans d'une créatrice, selon la plateforme choisie en haut du menu :
 * OnlyFans → « Smart lists » (dépense totale en tranches, nouveaux fans) ; MYM → « Groupes » (manuels ou automatiques par CA).
 */
export function FanLists({ canEdit }: { canEdit: boolean }) {
  const { creatorId, creator, pf } = useCreators();
  const [data, setData] = useState<Resp | null>(null);
  const [modal, setModal] = useState<null | "choose" | "spend" | "newfans" | { group: Partial<L> } | { newfans: Partial<L> }>(null);
  const [open, setOpen] = useState<number | null>(null);
  const cur = pf === "mym" ? "€" : "$";

  const load = useCallback(() => {
    if (!creatorId) return;
    api<Resp>("GET", `/api/fanlists?creatorId=${encodeURIComponent(creatorId)}`)
      .then(setData)
      .catch((e) => toast((e as Error).message, "err"));
  }, [creatorId]);
  useEffect(() => {
    setData(null);
    setOpen(null);
    load();
  }, [load]);

  const post = async (path: string, payload: Record<string, unknown>, ok: string) => {
    try {
      setData(await api<Resp>("POST", `/api/fanlists/${path}`, { creatorId, ...payload }));
      toast(ok);
      return true;
    } catch (e) {
      toast((e as Error).message, "err");
      return false;
    }
  };
  const mym = pf === "mym";
  const lists = data?.lists ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1300px] min-w-0 flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">{mym ? "MYM" : "OnlyFans"}</p>
          <h1 className="mt-1 text-2xl md:text-3xl">{mym ? "Groupes" : "Smart lists"}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            {mym
              ? "Les fans rangés en groupes : à la main, ou automatiquement selon leur CA cumulé, leur ancienneté et leur taux d’achats."
              : "Les fans rangés automatiquement selon leur dépense totale, ou selon le temps depuis leur abonnement."}
            {creator ? ` ${creator.name} · ${num(data?.fans ?? 0)} fans.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CreatorTabs />
          {canEdit ? (
            <button onClick={() => setModal(mym ? { group: { kind: "manual", color: "#3b5bdb", icon: "user", reset: "never" } } : "choose")} className={btnCls.primary}>
              <Plus className="size-4" /> {mym ? "Créer un groupe" : "Créer une liste"}
            </button>
          ) : null}
        </div>
      </header>

      <section className="min-w-0 overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b bg-card-2/50">
              <tr className="text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                <th className="px-4 py-3">{mym ? "Nom" : "Liste"}</th>
                {mym ? <th className="px-3 py-3">Type</th> : null}
                <th className="px-3 py-3">{mym ? "Bornes CA cumulé" : "Critère"}</th>
                <th className="px-3 py-3">{mym ? "Membres" : "Expirés"}</th>
                {!mym ? <th className="px-3 py-3 text-right">Fans</th> : null}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {lists.map((l) => {
                const Icon = ICONS[l.icon || ""] ?? UsersRound;
                return (
                  <FragmentRow key={l.id} open={open === l.id}>
                    <tr className="cursor-pointer hover:bg-card-2/40" onClick={() => setOpen(open === l.id ? null : l.id)}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5 font-semibold">
                          {mym ? (
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: (l.color || "#666") + "33", color: l.color || undefined }}>
                              <Icon className="size-4" />
                            </span>
                          ) : null}
                          {l.name}
                          <ChevronDown className={cn("size-4 text-muted transition-transform", open === l.id && "rotate-180")} />
                        </span>
                      </td>
                      {mym ? (
                        <td className="px-3 py-3">
                          <Pill tone={l.kind === "auto" ? "info" : "accent"}>{l.kind === "auto" ? "Automatique" : "Manuel"}</Pill>
                        </td>
                      ) : null}
                      <td className="px-3 py-3">
                        <span className="flex flex-wrap gap-1.5">
                          {l.kind === "spend" ? <span>Dépense totale : {fmtAmount(l.min, cur)} – {l.max == null ? "sans limite" : fmtAmount(l.max, cur)}</span> : null}
                          {l.kind === "newfans" ? <span>Abonné depuis moins de {l.days} jour{(l.days ?? 0) > 1 ? "s" : ""}</span> : null}
                          {l.kind === "manual" ? <span className="text-muted">— {l.reset !== "never" ? `(vidé ${RESETS.find((r) => r[0] === l.reset)?.[1].toLowerCase()})` : ""}</span> : null}
                          {l.kind === "auto" ? (
                            <>
                              <Chip>{l.noPay ? "Sans paiement" : `${fmtAmount(l.min, cur)} → ${fmtAmount(l.max, cur)}${l.ppvOnly ? " (PPV + pourboires)" : ""}`}</Chip>
                              {l.ageMin != null || l.ageMax != null ? (
                                <Chip>
                                  <Clock className="size-3" /> Ancienneté {l.ageMin != null ? `≥ ${l.ageMin} j` : ""} {l.ageMax != null ? `≤ ${l.ageMax} j` : ""}
                                </Chip>
                              ) : null}
                              {l.rateMin != null || l.rateMax != null ? (
                                <Chip>
                                  Achats {l.rateMin != null ? `≥ ${l.rateMin} %` : ""} {l.rateMax != null ? `≤ ${l.rateMax} %` : ""} ({"≥"} {l.ratePpv || 1} PPV)
                                </Chip>
                              ) : null}
                            </>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {mym ? (
                          <span className="flex flex-col text-xs">
                            <span className="font-semibold text-emerald-400">Abonnés ({num(l.active)})</span>
                            {l.expired ? <span className="font-semibold text-amber-400">Anciens ({num(l.expired)})</span> : null}
                          </span>
                        ) : l.kind === "newfans" || !l.includeExpired ? (
                          <Pill tone="bad">Exclus</Pill>
                        ) : (
                          <Pill tone="good">Inclus</Pill>
                        )}
                      </td>
                      {!mym ? <td className="px-3 py-3 text-right font-semibold tabular-nums">{num(l.count)}</td> : null}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {canEdit ? (
                          <span className="flex justify-end gap-1">
                            <IconBtn title="Modifier" onClick={() => setModal(l.kind === "spend" ? "spend" : l.kind === "newfans" ? { newfans: l } : { group: l })}>
                              <Pencil className="size-4" />
                            </IconBtn>
                            {mym ? (
                              <IconBtn title="Dupliquer" onClick={() => post("duplicate", { id: l.id }, "Groupe dupliqué")}>
                                <Copy className="size-4" />
                              </IconBtn>
                            ) : null}
                            <IconBtn title="Supprimer" danger onClick={() => confirm(`Supprimer « ${l.name} » ?`) && post("delete", { id: l.id }, "Supprimé")}>
                              <Trash2 className="size-4" />
                            </IconBtn>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                    {open === l.id && creatorId ? (
                      <tr>
                        <td colSpan={mym ? 5 : 5} className="bg-bg/40 px-4 py-3">
                          <Members creatorId={creatorId} list={l} cur={cur} onChanged={load} />
                        </td>
                      </tr>
                    ) : null}
                  </FragmentRow>
                );
              })}
              {data && !lists.length ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-sm text-muted">
                    {mym ? "Aucun groupe pour cette modèle." : "Aucune smart list pour cette modèle."}
                    {canEdit ? (
                      <button onClick={() => setModal(mym ? { group: { kind: "manual", color: "#3b5bdb", icon: "user", reset: "never" } } : "choose")} className="ml-1 font-semibold text-fg underline">
                        En créer une
                      </button>
                    ) : null}
                  </td>
                </tr>
              ) : null}
              {!data ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-sm text-muted">
                    Chargement…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modal === "choose" ? (
        <Modal title={`Créer une smart list pour ${creator?.name ?? ""}`} onClose={() => setModal(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => setModal("spend")} className="flex flex-col items-center gap-2 rounded-xl border bg-card-2/50 p-5 text-center hover:border-primary/60">
              <BadgeDollarSign className="size-7" />
              <span className="font-semibold">Par dépense totale</span>
              <span className="text-xs text-muted">Range les fans selon ce qu’ils ont dépensé</span>
            </button>
            <button onClick={() => setModal({ newfans: { kind: "newfans" } })} className="flex flex-col items-center gap-2 rounded-xl border bg-card-2/50 p-5 text-center hover:border-primary/60">
              <UserPlus className="size-7" />
              <span className="font-semibold">Nouveaux fans</span>
              <span className="text-xs text-muted">Range les fans selon le temps depuis leur abonnement</span>
            </button>
          </div>
        </Modal>
      ) : null}
      {modal === "spend" ? <SpendModal lists={lists.filter((l) => l.kind === "spend")} cur={cur} onClose={() => setModal(null)} onSave={(p) => post("segments", p, "Smart lists enregistrées")} /> : null}
      {modal && typeof modal === "object" && "newfans" in modal ? (
        <NewFansModal list={modal.newfans} onBack={modal.newfans.id ? null : () => setModal("choose")} onClose={() => setModal(null)} onSave={(list) => post("save", { list }, list.id ? "Liste modifiée" : "Liste créée")} />
      ) : null}
      {modal && typeof modal === "object" && "group" in modal ? <GroupModal group={modal.group} onClose={() => setModal(null)} onSave={(list) => post("save", { list }, list.id ? "Groupe modifié" : "Groupe créé")} /> : null}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode; open: boolean }) {
  return <>{children}</>;
}
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold">{children}</span>;
}
function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} className={cn("grid size-8 place-items-center rounded-lg text-muted hover:bg-card-2 hover:text-fg", danger && "hover:bg-rose-500/15 hover:text-rose-400")}>
      {children}
    </button>
  );
}
function Modal({ title, children, onClose, footer, onBack }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void; footer?: React.ReactNode; onBack?: (() => void) | null }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b px-5 py-4">
          {onBack ? (
            <button onClick={onBack} className="text-muted hover:text-fg" aria-label="Retour">
              <ArrowLeft className="size-4" />
            </button>
          ) : null}
          <h2 className="flex-1 text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto p-5">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
const field = (label: React.ReactNode, input: React.ReactNode, hint?: string) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-xs font-semibold text-muted">{label}</span>
    {input}
    {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
  </label>
);
const nOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const str = (v: number | null | undefined) => (v == null ? "" : String(v));

/** OnlyFans : toutes les tranches de dépense d'un coup (comme « Segment by total spend » d'Infloww). */
function SpendModal({ lists, cur, onClose, onSave }: { lists: L[]; cur: string; onClose: () => void; onSave: (p: Record<string, unknown>) => Promise<boolean> }) {
  const [rows, setRows] = useState(() => (lists.length ? lists.map((l) => ({ id: l.id as number | undefined, name: l.name, min: str(l.min), max: str(l.max) })) : DEFAULT_SEGMENTS.map((s) => ({ id: undefined, name: s.name, min: str(s.min), max: str(s.max) }))));
  const [inclExp, setInclExp] = useState(lists.length ? lists[0].includeExpired : true);
  const [busy, setBusy] = useState(false);
  const set = (i: number, p: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <Modal
      title="Smart lists par dépense totale"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={btnCls.ghost}>
            Annuler
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await onSave({ includeExpired: inclExp, segments: rows.map((r) => ({ id: r.id, name: r.name, min: nOrNull(r.min), max: nOrNull(r.max) })) });
              setBusy(false);
              if (ok) onClose();
            }}
            className={btnCls.primary}
          >
            Enregistrer
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_14rem] gap-2 text-xs font-semibold text-muted">
        <span>Nom de la tranche</span>
        <span>Dépense ({cur}) : de … à</span>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto_6.5rem_auto] items-center gap-2">
            <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Nom" className={inputCls} />
            <input type="number" min={0} value={r.min} onChange={(e) => set(i, { min: e.target.value })} className={cn(inputCls, "px-3")} title="inclus" />
            <span className="text-muted">–</span>
            <input type="number" min={0} value={r.max} placeholder="Sans limite" onChange={(e) => set(i, { max: e.target.value })} className={cn(inputCls, "px-3")} />
            <button onClick={() => setRows((x) => x.filter((_, j) => j !== i))} title="Retirer" className="text-muted hover:text-rose-400">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={() => setRows((x) => [...x, { id: undefined, name: "", min: x.length ? x[x.length - 1].max || "" : "1", max: "" }])} className={cn(btnCls.ghost, "mt-3")}>
        <Plus className="size-4" /> Ajouter une tranche
      </button>
      <p className="mt-2 text-[11px] text-muted">Le minimum est inclus, le maximum exclu (100 $ va dans « 100 – 300 »). Laisse le maximum vide pour « sans limite ». Abonnements non comptés.</p>
      <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={inclExp} onChange={(e) => setInclExp(e.target.checked)} className="size-4" /> Inclure les fans expirés
      </label>
    </Modal>
  );
}

/** OnlyFans : « Nouveaux fans » (abonné depuis moins de N jours), comme Infloww. */
function NewFansModal({ list, onBack, onClose, onSave }: { list: Partial<L>; onBack: (() => void) | null; onClose: () => void; onSave: (l: Partial<L>) => Promise<boolean> }) {
  const [name, setName] = useState(list.name ?? "");
  const [days, setDays] = useState(str(list.days ?? null));
  return (
    <Modal
      title="Nouveaux fans"
      onBack={onBack}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={btnCls.ghost}>
            Annuler
          </button>
          <button onClick={async () => (await onSave({ id: list.id, kind: "newfans", name, days: Number(days) })) && onClose()} className={btnCls.primary}>
            {list.id ? "Enregistrer" : "Créer"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {field("Nom de la liste", <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. 3 last days" className={inputCls} />)}
        {field(
          "Abonné depuis moins de",
          <div className="relative">
            <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} placeholder="0" className={cn(inputCls, "pr-16")} />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">jour(s)</span>
          </div>,
          "Les fans expirés ne sont pas comptés.",
        )}
      </div>
    </Modal>
  );
}

/** MYM : créer / modifier un groupe (comme MyPulse). */
function GroupModal({ group, onClose, onSave }: { group: Partial<L>; onClose: () => void; onSave: (l: Partial<L>) => Promise<boolean> }) {
  const [g, setG] = useState<Partial<L>>(group);
  const [s, setS] = useState({ min: str(group.min), max: str(group.max), ageMin: str(group.ageMin), ageMax: str(group.ageMax), rateMin: str(group.rateMin), rateMax: str(group.rateMax), ratePpv: str(group.ratePpv) });
  const auto = g.kind === "auto";
  const toggle = (on: boolean, set: (v: boolean) => void, label: string, hint: string) => (
    <div className="flex items-start gap-3 rounded-xl border p-3">
      <button role="switch" aria-checked={on} onClick={() => set(!on)} className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-line")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </button>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-muted">{hint}</span>
      </span>
    </div>
  );
  const save = () =>
    onSave({
      ...g,
      min: auto && !g.noPay ? nOrNull(s.min) : null,
      max: auto && !g.noPay ? nOrNull(s.max) : null,
      ageMin: auto ? nOrNull(s.ageMin) : null,
      ageMax: auto ? nOrNull(s.ageMax) : null,
      rateMin: auto ? nOrNull(s.rateMin) : null,
      rateMax: auto ? nOrNull(s.rateMax) : null,
      ratePpv: auto ? nOrNull(s.ratePpv) : null,
    }).then((ok) => ok && onClose());
  return (
    <Modal
      title={g.id ? "Modifier le groupe" : "Créer un groupe"}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={btnCls.ghost}>
            Fermer
          </button>
          <button onClick={save} className={btnCls.primary}>
            {g.id ? "Enregistrer" : "Créer ce groupe"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {field("Nom", <input value={g.name ?? ""} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Nom du groupe" className={inputCls} />)}
        {field("Couleur", <input type="color" value={g.color || "#3b5bdb"} onChange={(e) => setG({ ...g, color: e.target.value })} className="h-9 w-full cursor-pointer rounded-lg border bg-transparent" />)}
        {field(
          "Icône",
          <div className="grid grid-cols-8 gap-1.5">
            {Object.entries(ICONS).map(([k, I]) => (
              <button key={k} onClick={() => setG({ ...g, icon: k })} className={cn("grid aspect-square place-items-center rounded-lg border hover:border-primary/60", g.icon === k && "border-primary bg-card-2")}>
                <I className="size-4" />
              </button>
            ))}
          </div>,
        )}
        {toggle(auto, (v) => setG({ ...g, kind: v ? "auto" : "manual" }), "Groupe automatique par CA cumulé (€)", "Les fans y entrent et en sortent tout seuls selon les règles ci-dessous.")}
        {auto ? (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={!!g.noPay} onChange={(e) => setG({ ...g, noPay: e.target.checked })} className="mt-1 size-4" />
              <span>
                <b>Sans paiement</b>
                <span className="block text-[11px] text-muted">Abonnés actifs qui n’ont rien payé (aucun achat). Les bornes sont désactivées.</span>
              </span>
            </label>
            {!g.noPay ? (
              <div className="grid grid-cols-2 gap-3">
                {field("Min (€)", <input type="number" min={0} value={s.min} onChange={(e) => setS({ ...s, min: e.target.value })} placeholder="ex. 0" className={inputCls} />)}
                {field("Max (€) · vide = ∞", <input type="number" min={0} value={s.max} onChange={(e) => setS({ ...s, max: e.target.value })} placeholder="ex. 99" className={inputCls} />)}
              </div>
            ) : null}
            {!g.noPay ? toggle(!!g.ppvOnly, (v) => setG({ ...g, ppvOnly: v }), "PPV et pourboires seulement", "La fourchette se lit sur ce que le fan a dépensé en PPV et en pourboires, sans l’abonnement.") : null}
            <p className="text-xs font-semibold text-muted">Critères en plus (facultatifs) — laisse vide pour ne pas filtrer.</p>
            <div className="grid grid-cols-2 gap-3">
              {field("Ancienneté : au moins (jours)", <input type="number" min={0} value={s.ageMin} onChange={(e) => setS({ ...s, ageMin: e.target.value })} className={inputCls} />)}
              {field("Ancienneté : au plus (jours)", <input type="number" min={0} value={s.ageMax} onChange={(e) => setS({ ...s, ageMax: e.target.value })} className={inputCls} />)}
              {field("Taux d’achats : au moins (%)", <input type="number" min={0} max={100} value={s.rateMin} onChange={(e) => setS({ ...s, rateMin: e.target.value })} className={inputCls} />)}
              {field("Taux d’achats : au plus (%)", <input type="number" min={0} max={100} value={s.rateMax} onChange={(e) => setS({ ...s, rateMax: e.target.value })} className={inputCls} />)}
            </div>
            {field(
              "Sur au moins … PPV envoyés",
              <input type="number" min={1} value={s.ratePpv} onChange={(e) => setS({ ...s, ratePpv: e.target.value })} className={cn(inputCls, "w-32")} />,
              "Un fan qui a reçu moins de PPV n’entre pas dans un groupe qui filtre le taux.",
            )}
          </>
        ) : (
          field(
            "Remise à zéro automatique",
            <select value={g.reset ?? "never"} onChange={(e) => setG({ ...g, reset: e.target.value as L["reset"] })} className={inputCls}>
              {RESETS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>,
            RESETS.find((r) => r[0] === (g.reset ?? "never"))?.[2],
          )
        )}
      </div>
    </Modal>
  );
}

/** Les fans d'une liste ; pour un groupe manuel : ajouter / retirer des fans. */
function Members({ creatorId, list, cur, onChanged }: { creatorId: string; list: L; cur: string; onChanged: () => void }) {
  const [rows, setRows] = useState<Member[] | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Member[]>([]);
  const [show, setShow] = useState<"active" | "expired">("active");
  const load = useCallback(
    () =>
      api<Member[]>("GET", `/api/fanlists/members?creatorId=${encodeURIComponent(creatorId)}&id=${list.id}`)
        .then(setRows)
        .catch((e) => toast((e as Error).message, "err")),
    [creatorId, list.id],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (list.kind !== "manual" || q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => api<Member[]>("GET", `/api/fanlists/search?creatorId=${encodeURIComponent(creatorId)}&q=${encodeURIComponent(q.trim())}`).then(setFound).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, creatorId, list.kind]);
  const member = async (fanId: string, add: boolean) => {
    try {
      await api("POST", "/api/fanlists/member", { creatorId, id: list.id, fanId, add });
      toast(add ? "Fan ajouté au groupe" : "Fan retiré du groupe");
      load();
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  if (!rows) return <Loader2 className="mx-auto size-4 animate-spin text-muted" />;
  const shown = rows.filter((r) => (show === "expired" ? r.expired : !r.expired));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["active", "expired"] as const).map((k) => (
          <button key={k} onClick={() => setShow(k)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", show === k ? "border-primary bg-primary text-white" : "text-muted")}>
            {k === "active" ? "Abonnés" : "Anciens"} ({rows.filter((r) => (k === "expired" ? r.expired : !r.expired)).length})
          </button>
        ))}
        {list.kind === "manual" ? (
          <div className="relative ml-auto w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter un fan au groupe…" className={cn(inputCls, "h-9 pl-9")} />
            {found.length ? (
              <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border bg-card p-1 shadow-xl">
                {found.map((f) => (
                  <button key={f.fanId} onClick={() => (member(f.fanId, true), setQ(""))} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-card-2">
                    <Avatar src={f.avatar} name={f.name} size="size-6" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted">{fmtAmount(f.total, cur)}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {!shown.length ? <p className="py-3 text-center text-sm text-muted">Aucun fan.</p> : null}
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.slice(0, 300).map((m) => (
          <div key={m.fanId} className="flex items-center gap-2 rounded-xl border bg-card px-2.5 py-1.5">
            <Avatar src={m.avatar} name={m.name} size="size-8" />
            <Link href={`/app/messagerie?c=${encodeURIComponent(`${creatorId}~${m.fanId}`)}`} className="min-w-0 flex-1 hover:underline">
              <span className="block truncate text-sm font-semibold">{m.name}</span>
              <span className="block truncate text-[11px] text-muted">
                {fmtAmount(m.total, cur)}
                {m.since ? ` · abonné ${ago(m.since).replace("il y a ", "depuis ")}` : ""}
                {m.rate != null ? ` · achats ${m.rate} %` : ""}
              </span>
            </Link>
            {list.kind === "manual" ? (
              <button title="Retirer du groupe" onClick={() => member(m.fanId, false)} className="text-muted hover:text-rose-400">
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {shown.length > 300 ? <p className="text-center text-xs text-muted">+ {shown.length - 300} autres fans</p> : null}
    </div>
  );
}
