"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, MessageCircle, Pin, Plus, RefreshCw, Search, ShoppingBag, Sparkles, StickyNote, UserPlus, UserRoundX, Users, UsersRound, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { getPf, type Pf } from "@/lib/platform";
import { Avatar } from "@/rv/components/ui";
import { GROUP_ICONS, groupIcon } from "@/app/app/mym/groupIcons";
import { cash, Confirm, int, Modal, PALETTE, pct, Ring, RowMenu, Switch } from "../kit";
import { errText, FolderRow, plural, useDebounced } from "../media/MediaKit";

// Bloom v2 → Fans : le MÊME écran pour OnlyFans et MYM (25/11/2026, « Constellation »). Il remplace, dans la v2, la
// copie d'Infloww (Smart lists) et celle de MyPulse (Abonnés / Anciens / Intéressés, Mes groupes). À gauche les
// modèles, puis les vues rapides et les groupes ; à droite les fans de la modèle (ceux avec qui une conversation
// existe) : statut, dépense, contenus payants achetés, ancienneté, dernier message. Un clic ouvre la fiche du fan,
// la même que dans la messagerie (surnom, note, étiquettes) avec son profil et ses groupes.
// Lecture : « /api/v2/fans… » (app/v2fans.mjs). Écriture : « /api/v2/fans/sheet », « /api/v2/fans/members », et les
// groupes par « /api/fanlists/save|delete|duplicate » (team leaders et plus).
type Status = "active" | "old" | "interested";
type Kind = "manual" | "auto" | "spend" | "newfans";
type Chip = { id: number; name: string; color: string | null; icon: string | null; kind: Kind };
type Row = {
  fanId: string; name: string; nickname: string | null; username: string | null; avatar: string | null; status: Status; since: number | null;
  total: number; ppvSent: number; ppvBought: number; lastAt: number | null; lastFromFan: boolean; hasNote: boolean; tags: string[]; pinned: boolean; ai: boolean; groups: Chip[];
};
type Group = Chip & {
  min: number | null; max: number | null; days: number | null; includeExpired: boolean; noPay: boolean; ppvOnly: boolean;
  ageMin: number | null; ageMax: number | null; rateMin: number | null; rateMax: number | null; ratePpv: number | null;
  reset: string; resetDay: number | null; resetHour: string | null; stayHours: number | null; count: number; active: number; spent: number;
};
type Stats = { fans: number; active: number; old: number; interested: number; buyers: number; spent: number };
type Data = {
  platform: Pf; currency: string; canEdit: boolean; sources: string[]; newDays: number;
  list: { id: string; name: string; avatar: string | null; fans: number }[];
  model: { id: string; name: string; avatar: string | null } | null;
  views: { id: string; name: string; count: number }[]; groups: Group[];
  all?: number; dated?: boolean; stats: Stats | null; total: number; page: number; per: number; rows: Row[];
};
type Live = { status: string | null; since: number | null; expires: number | null; renews: number | null; canceled: boolean; price: number | null; purchases: number; lastPurchase: number | null; link: string | null; channel: string | null };
type Official = { active: number; old: number; interested: number };
type SortKey = "spent" | "recent" | "last" | "name" | "rate";
type One = {
  fan: Row;
  sheet: { nickname: string; notes: string; notesBy: string | null; notesAt: number | null; tags: string[]; oldNotes: string; age: string; gender: string; source: string; lang: string; promise: string };
  groups: (Chip & { member: boolean })[];
  buys: { at: number; type: string; amount: number; pending: boolean }[];
  convId: string;
};
type Win =
  | null
  | { kind: "fan"; id: string }
  | { kind: "group"; group: Group | null }
  | { kind: "add" }
  | { kind: "confirm"; title: string; text: string; button: string; go: () => Promise<unknown> };

const STATUS: Record<Status, { one: string; many: string; style: React.CSSProperties }> = {
  active: { one: "Abonné", many: "Abonnés", style: { color: "var(--v2-up)", background: "rgb(16 185 129 / 0.14)" } },
  old: { one: "Ancien", many: "Anciens", style: { color: "var(--color-muted)", background: "rgb(255 255 255 / 0.06)" } },
  interested: { one: "Intéressé", many: "Intéressés", style: { color: "var(--v2-sky)", background: "rgb(59 130 246 / 0.14)" } },
};
const VIEW_ICON: Record<string, React.ReactNode> = { "v:buyers": <ShoppingBag className="size-3.5" />, "v:never": <UserRoundX className="size-3.5" />, "v:new": <UserPlus className="size-3.5" />, "v:pinned": <Pin className="size-3.5" /> };
const BUY: Record<string, string> = { sub: "Abonnement", renew: "Renouvellement", ppv: "Contenu payant", mod: "Média à la demande", push: "Push", tip: "Pourboire", post: "Publication", stream: "Live", refund: "Remboursement", other: "Autre" };
const money = (cents: number, cur: string) => cash(cents, cur, cents % 100 ? 2 : 0);
const sym = (cur: string) => (cur === "USD" ? "$" : "€");
const day = (t: number | null) => (t ? new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const ago = (t: number | null) => {
  if (!t) return "—";
  const s = Math.max(0, Date.now() - t) / 1000;
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.round(s / 86400)} j`;
  return day(t);
};
const amount = (v: number | null, cur: string) => (v == null ? "∞" : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${sym(cur)}`);
const WEEK = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** La règle d'un groupe, en une phrase. */
function ruleOf(g: Group, cur: string) {
  if (g.kind === "manual") {
    if (g.reset === "after_add") return `Rempli à la main · chaque fan en sort après ${g.stayHours ?? "?"} h`;
    if (g.reset === "daily") return `Rempli à la main · vidé chaque jour à ${g.resetHour || "00:00"}`;
    if (g.reset === "weekly") return `Rempli à la main · vidé chaque ${WEEK[g.resetDay || 1]}`;
    if (g.reset === "monthly") return `Rempli à la main · vidé le ${g.resetDay || 1} du mois`;
    return "Rempli à la main";
  }
  if (g.kind === "newfans") return `Abonnés depuis moins de ${g.days ?? 0} jours`;
  if (g.kind === "spend") return `Dépense de ${amount(g.min ?? 0, cur)} à moins de ${amount(g.max, cur)}${g.includeExpired ? "" : " · anciens exclus"}`;
  const parts = [g.noPay ? "Abonnés sans aucun achat" : `Dépense${g.ppvOnly ? " hors abonnement" : ""} de ${amount(g.min ?? 0, cur)} à ${amount(g.max, cur)}`];
  if (g.ageMin != null || g.ageMax != null) parts.push(`abonné depuis ${g.ageMin != null ? `au moins ${g.ageMin} j` : ""}${g.ageMin != null && g.ageMax != null ? " et " : ""}${g.ageMax != null ? `au plus ${g.ageMax} j` : ""}`);
  if (g.rateMin != null || g.rateMax != null) parts.push(`achète ${g.rateMin != null ? `au moins ${g.rateMin} %` : ""}${g.rateMin != null && g.rateMax != null ? " et " : ""}${g.rateMax != null ? `au plus ${g.rateMax} %` : ""} des contenus payants`);
  return parts.join(" · ");
}

function GroupDot({ g, size = "size-3.5" }: { g: { color: string | null; icon: string | null }; size?: string }) {
  const I = groupIcon(g.icon);
  return <I className={size} style={{ color: g.color || "var(--v2-sky)" }} />;
}
function Chips({ list, max = 3 }: { list: Chip[]; max?: number }) {
  if (!list.length) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {list.slice(0, max).map((g) => <span key={g.id} className="v2-tag max-w-[130px]" title={g.kind === "manual" ? "Groupe manuel" : "Groupe automatique"}><GroupDot g={g} size="size-3 shrink-0" /><span className="truncate">{g.name}</span></span>)}
      {list.length > max ? <span className="v2-tag">+{list.length - max}</span> : null}
    </span>
  );
}

/** `pf` = la plateforme affichée par cet onglet (envoyée au serveur : le cookie du menu est commun aux onglets). */
export function V2Fans({ pf }: { pf: Pf }) {
  const modelKey = `bloom.v2.fans.model.${pf}`;
  const [model, setModel] = useState(() => {
    try {
      return localStorage.getItem(modelKey) || "";
    } catch {
      return "";
    }
  });
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState<"" | Status>("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 350);
  const [sort, setSort] = useState<{ key: SortKey; rev: boolean }>({ key: "spent", rev: false });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ key: string; d: Data } | null>(null);
  const [err, setErr] = useState("");
  const [official, setOfficial] = useState<{ key: string; v: Official } | null>(null);
  const [picked, setPicked] = useState<Map<string, Row>>(new Map());
  const [win, setWin] = useState<Win>(null);
  const [spin, setSpin] = useState(false);
  const seq = useRef(0);
  const load = useCallback(() => {
    const id = ++seq.current;
    const p = new URLSearchParams({ pf, sort: sort.key });
    if (model) p.set("creatorId", model);
    if (group) p.set("group", group);
    if (status) p.set("status", status);
    if (dq) p.set("q", dq);
    if (sort.rev) p.set("dir", "asc");
    if (page > 1) p.set("page", String(page));
    return api<Data>("GET", `/api/v2/fans?${p}`)
      .then((d) => void (id === seq.current && (setData({ key: model, d }), setErr(""))))
      .catch((e) => void (id === seq.current && setErr(errText(e))));
  }, [pf, model, group, status, dq, sort, page]);
  useEffect(() => void load(), [load]);
  useEffect(() => setPage(1), [dq]);

  const d = data?.d ?? null;
  const m = d?.model ?? null;
  const mid = m?.id ?? "";
  const stale = !!data && data.key !== model;
  const mym = pf === "mym";
  const pfName = mym ? "MYM" : "OnlyFans";
  const cur = d?.currency ?? (mym ? "EUR" : "USD");
  const canEdit = !!d?.canEdit;
  const groups = d?.groups ?? [];
  // Ce que MYM compte lui-même : Bloom n'affiche que les fans avec qui une conversation existe.
  useEffect(() => {
    if (!mym || !mid) return;
    let off = false;
    api<{ official: Official | null }>("GET", `/api/v2/fans/official?pf=mym&creatorId=${encodeURIComponent(mid)}`)
      .then((r) => void (!off && r.official && setOfficial({ key: mid, v: r.official })))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [mym, mid]);
  const off = official && official.key === mid ? official.v : null;

  const reset = () => (setPage(1), setPicked(new Map()));
  const pickModel = (id: string) => {
    setModel(id);
    setGroup("");
    setStatus("");
    setQ("");
    reset();
    try {
      localStorage.setItem(modelKey, id);
    } catch {}
  };
  const pickGroup = (id: string) => (setGroup(id), setStatus(""), reset());
  const sortBy = (key: SortKey) => (setSort((s) => (s.key === key ? { key, rev: !s.rev } : { key, rev: false })), setPage(1));
  const toggle = (r: Row) => {
    const next = new Map(picked);
    if (next.has(r.fanId)) next.delete(r.fanId);
    else next.set(r.fanId, r);
    setPicked(next);
  };
  const refresh = async () => {
    setSpin(true);
    await load();
    setSpin(false);
  };
  const colorOf = (id: string) => PALETTE[Math.max(0, (d?.list ?? []).findIndex((x) => x.id === id)) % PALETTE.length];
  const view = d?.views.find((v) => v.id === group) ?? null;
  const cur0 = groups.find((g) => String(g.id) === group) ?? null;
  const title = view ? view.name : cur0 ? cur0.name : "Tous les fans";
  const st = d?.stats ?? null;
  const rows = d?.rows ?? [];
  const n = picked.size;
  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.fanId));
  const pages = d ? Math.max(1, Math.ceil(d.total / d.per)) : 1;
  const manual = groups.filter((g) => g.kind === "manual");
  const chatOk = pf === getPf();
  // Dates d'abonnement connues ? (OnlyFans : Substy ne les donne que dans la fiche d'un fan.)
  const dated = d?.dated !== false;
  const th = (k: SortKey, label: string, right = false) => {
    const on = sort.key === k;
    // Par défaut : du plus grand au plus petit (et de A à Z pour le nom) ; un second clic inverse.
    const up = k === "name" ? !sort.rev : sort.rev;
    return (
      <th key={k} className={`px-3 py-2.5 font-semibold ${right ? "text-right" : "text-left"}`}>
        <button type="button" onClick={() => sortBy(k)} className={`inline-flex items-center gap-1 transition-colors hover:text-(--color-fg) ${on ? "text-(--color-fg)" : ""}`} title="Trier">
          {label}{on ? up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
        </button>
      </th>
    );
  };
  const tile = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
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
          <p className="v2-eyebrow">Chatting · {pfName}</p>
          <h1 className="v2-h1 mt-1">Fans</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {m ? <button onClick={() => void refresh()} disabled={spin} className="v2-select" title="Relire la liste"><RefreshCw className={`size-4 text-muted ${spin ? "animate-spin" : ""}`} />Actualiser</button> : null}
          {m && canEdit ? <button onClick={() => setWin({ kind: "group", group: null })} className="v2-btn" style={{ height: 36 }}><Plus className="size-4" />Nouveau groupe</button> : null}
        </div>
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* La colonne des modèles */}
        <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 1 }}>
          <div className="v2-card p-1.5">
            <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Modèles</p>
            <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:max-h-[calc(100dvh-200px)] lg:space-y-0.5 lg:overflow-y-auto">
              {(d?.list ?? []).map((x) => (
                <button key={x.id} onClick={() => pickModel(x.id)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={mid === x.id} aria-pressed={mid === x.id} title={`Voir les fans de ${x.name}`}>
                  <Ring color={colorOf(x.id)}><Avatar src={x.avatar} name={x.name} size="size-8" /></Ring>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] leading-tight">{x.name}</b>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted">{x.fans ? plural(x.fans, "fan") : "aucun fan connu"}</span>
                  </span>
                </button>
              ))}
              {d && !d.list.length ? <p className="px-2 py-3 text-[12.5px] text-muted">Aucune modèle {pfName}.</p> : null}
              {!d ? <p className="px-2 py-3 text-[12.5px] text-muted">Chargement…</p> : null}
            </div>
          </div>
        </aside>

        <div className="min-w-0" style={{ opacity: stale ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
          {d && !m ? <div className="v2-card v2-rise p-8 text-center text-[13.5px] text-muted">{mym ? "Aucun compte MYM relié pour l’instant." : "Aucune modèle OnlyFans pour l’instant."}</div> : null}
          {!d && !err ? <div className="v2-card p-8 text-center text-[13.5px] text-muted">Chargement…</div> : null}

          {d && m ? (
            <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
              {/* Vues rapides et groupes */}
              <section className="v2-rise min-w-0 xl:sticky xl:top-4 xl:self-start" style={{ ["--i" as string]: 2 }}>
                <div className="v2-card v2-scroll p-2 xl:max-h-[calc(100dvh-110px)] xl:overflow-y-auto">
                  <FolderRow on={!group} icon={<Users className="size-3.5" />} name="Tous les fans" sub={plural(d.all ?? 0, "fan connu", "fans connus")} onClick={() => pickGroup("")} />
                  <p className="px-2 pt-3 pb-1 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">Vues rapides</p>
                  <div className="space-y-0.5">
                    {d.views.filter((v) => v.id !== "v:new" || dated).map((v) => <FolderRow key={v.id} on={group === v.id} icon={VIEW_ICON[v.id] ?? <Users className="size-3.5" />} name={v.name} sub={v.count ? plural(v.count, "fan") : "personne"} onClick={() => pickGroup(v.id)} />)}
                  </div>
                  <p className="flex items-center justify-between px-2 pt-3 pb-1 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">
                    <span>Groupes</span>
                    {canEdit ? <button type="button" onClick={() => setWin({ kind: "group", group: null })} title="Nouveau groupe" aria-label="Nouveau groupe" className="grid size-5 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><Plus className="size-3.5" /></button> : null}
                  </p>
                  <div className="space-y-0.5">
                    {groups.map((g) => (
                      <FolderRow
                        key={g.id}
                        on={group === String(g.id)}
                        icon={<GroupDot g={g} />}
                        name={g.name}
                        sub={`${g.count ? plural(g.count, "fan") : "vide"} · ${g.kind === "manual" ? "manuel" : "automatique"}`}
                        onClick={() => pickGroup(String(g.id))}
                        right={canEdit ? (
                          <RowMenu
                            name={`grp-${g.id}`}
                            items={[
                              ...(g.kind === "manual" || g.kind === "auto" ? [{ label: "Modifier", go: () => setWin({ kind: "group", group: g }) }] : []),
                              { label: "Dupliquer", go: () => void api("POST", "/api/fanlists/duplicate", { creatorId: mid, id: g.id }).then(() => (toast("Groupe dupliqué"), load())).catch((e) => toast(errText(e), "err")) },
                              {
                                label: "Supprimer", danger: true,
                                go: () => setWin({
                                  kind: "confirm", title: `Supprimer « ${g.name} » ?`, button: "Supprimer le groupe",
                                  text: `Le groupe disparaît partout où il sert (cet écran, les envois groupés). Ses ${plural(g.count, "fan")} ne sont pas touchés.`,
                                  go: async () => {
                                    await api("POST", "/api/fanlists/delete", { creatorId: mid, id: g.id });
                                    toast("Groupe supprimé");
                                    if (group === String(g.id)) setGroup("");
                                    await load();
                                  },
                                }),
                              },
                            ]}
                          />
                        ) : undefined}
                      />
                    ))}
                    {!groups.length ? <p className="px-2 py-1.5 text-[12px] leading-relaxed text-muted">Aucun groupe pour l’instant.{canEdit ? " Crée-en un pour ranger les fans (gros acheteurs, à relancer…)." : ""}</p> : null}
                  </div>
                  <p className="mt-3 border-t px-2 pt-2.5 pb-1 text-[11.5px] leading-relaxed text-muted" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>Un groupe automatique se remplit tout seul selon sa règle ; un groupe manuel se remplit à la main.</p>
                </div>
              </section>

              {/* Les fans */}
              <section className="v2-rise min-w-0" style={{ ["--i" as string]: 3 }}>
                <div className="v2-card p-3">
                  <div className="px-1 pb-3">
                    <h2 className="truncate text-[16px] font-bold tracking-[-0.01em]">{title}</h2>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {cur0 ? ruleOf(cur0, cur) : view ? "Vue calculée par Bloom, à jour en permanence." : `Les fans de ${m.name} avec qui une conversation existe.`}
                      {!group && off ? ` Compteurs de MYM : ${int(off.active)} abonnés, ${int(off.old)} anciens, ${int(off.interested)} intéressés (son décompte diffère un peu, et il compte aussi les fans sans conversation).` : ""}
                    </p>
                  </div>
                  {st ? (
                    <div className="grid grid-cols-2 gap-2 pb-3 md:grid-cols-4">
                      {tile("Fans", int(st.fans), mym ? `${int(st.interested)} intéressé${st.interested > 1 ? "s" : ""} · ${int(st.old)} ancien${st.old > 1 ? "s" : ""}` : `${int(st.old)} ancien${st.old > 1 ? "s" : ""}`)}
                      {tile("Abonnés", int(st.active), st.fans ? `${pct(st.active, st.fans)} % de la liste` : undefined)}
                      {tile("Ont acheté", int(st.buyers), st.fans ? `${pct(st.buyers, st.fans)} % de la liste` : undefined)}
                      {tile(mym ? "Dépensé (hors abonnements)" : "Dépensé", cash(st.spent, cur, 0), st.buyers ? `${money(Math.round(st.spent / st.buyers), cur)} par acheteur` : undefined)}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)" }}>
                      <Search className="size-3.5 shrink-0 text-muted" />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un fan (nom, surnom, pseudo)" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#5d5d66]" />
                      {q ? <button type="button" onClick={() => setQ("")} aria-label="Effacer la recherche" className="text-muted hover:text-(--color-fg)"><X className="size-3.5" /></button> : null}
                    </label>
                    <div className="v2-segbar">
                      <button type="button" className="v2-seg" data-on={!status} onClick={() => (setStatus(""), reset())}>Tous</button>
                      {(["active", "old", ...(mym ? (["interested"] as Status[]) : [])] as Status[]).map((k) => (
                        <button key={k} type="button" className="v2-seg" data-on={status === k} onClick={() => (setStatus(k), reset())}>{STATUS[k].many}{st ? <b className="v2-num font-bold opacity-70">{int(st[k])}</b> : null}</button>
                      ))}
                    </div>
                  </div>

                  <div className="v2-scroll mt-3 overflow-x-auto">
                    <table className="w-full min-w-[820px] text-[12.5px]">
                      <thead>
                        <tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}>
                          <th className="w-9 py-2.5 pl-2 text-left">
                            <button type="button" onClick={() => setPicked(allOn ? new Map([...picked].filter(([id]) => !rows.some((r) => r.fanId === id))) : new Map([...picked, ...rows.map((r): [string, Row] => [r.fanId, r])]))} className="v2-check" data-on={allOn} aria-label={allOn ? "Tout désélectionner sur cette page" : "Tout sélectionner sur cette page"}>{allOn ? <Check className="size-3" /> : null}</button>
                          </th>
                          {th("name", "Fan")}
                          <th className="px-3 py-2.5 text-left font-semibold">Statut</th>
                          {th("spent", "Dépensé", true)}
                          {th("rate", "Contenus achetés", true)}
                          {dated ? th("recent", "Abonné depuis") : null}
                          {th("last", "Dernier message")}
                          <th className="px-3 py-2.5 text-left font-semibold">Groupes</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const on = picked.has(r.fanId);
                          return (
                            <tr key={r.fanId} onClick={() => setWin({ kind: "fan", id: r.fanId })} className="cursor-pointer border-b transition-colors hover:bg-white/[0.03]" style={{ borderColor: "rgb(255 255 255 / 0.05)", background: on ? "rgb(59 130 246 / 0.08)" : undefined }}>
                              <td className="py-2 pl-2">
                                <button type="button" onClick={(e) => (e.stopPropagation(), toggle(r))} className="v2-check" data-on={on} aria-label={on ? `Retirer ${r.name} de la sélection` : `Sélectionner ${r.name}`}>{on ? <Check className="size-3" /> : null}</button>
                              </td>
                              <td className="px-3 py-2">
                                <span className="flex min-w-0 items-center gap-2.5">
                                  <Avatar src={r.avatar} name={r.name} size="size-8" />
                                  <span className="min-w-0">
                                    <b className="flex items-center gap-1.5 text-[13px] leading-tight">
                                      <span className="max-w-[180px] truncate">{r.nickname || r.name}</span>
                                      {r.pinned ? <Pin className="size-3 shrink-0" style={{ color: "#fbbf24" }} aria-label="Épinglé par l’équipe" /> : null}
                                      {r.hasNote ? <StickyNote className="size-3 shrink-0 text-muted" aria-label="A une note" /> : null}
                                    </b>
                                    <span className="mt-0.5 block max-w-[200px] truncate text-[11.5px] text-muted">{r.nickname ? `${r.name}${r.username && r.username !== r.name ? ` · @${r.username}` : ""}` : r.username && r.username !== r.name ? `@${r.username}` : " "}</span>
                                  </span>
                                </span>
                              </td>
                              <td className="px-3"><span className="v2-tag" style={STATUS[r.status].style}>{STATUS[r.status].one}</span></td>
                              <td className="v2-num px-3 text-right text-[13px] font-bold" style={{ color: r.total ? undefined : "var(--color-muted)" }}>{r.total ? money(r.total, cur) : "—"}</td>
                              <td className="v2-num px-3 text-right" title={r.ppvSent ? `${r.ppvBought} contenus payants achetés sur ${r.ppvSent} envoyés` : "Aucun contenu payant envoyé à ce fan (vu par Bloom)"}>{r.ppvSent ? <>{r.ppvBought} / {r.ppvSent}<span className="ml-1.5 text-muted">{pct(r.ppvBought, r.ppvSent)} %</span></> : <span className="text-muted">—</span>}</td>
                              {dated ? <td className="px-3 whitespace-nowrap text-muted">{day(r.since)}</td> : null}
                              <td className="px-3 whitespace-nowrap" style={{ color: r.lastFromFan ? undefined : "var(--color-muted)" }} title={r.lastAt ? (r.lastFromFan ? "Le dernier message vient du fan" : "Le dernier message vient de nous") : undefined}>{ago(r.lastAt)}</td>
                              <td className="px-3"><Chips list={r.groups} /></td>
                              <td className="pr-2 text-right">
                                {chatOk ? <a href={`/v2/messagerie?c=${encodeURIComponent(`${mid}~${r.fanId}`)}`} onClick={(e) => e.stopPropagation()} title={`Ouvrir la conversation avec ${r.nickname || r.name}`} aria-label="Ouvrir la conversation" className="inline-grid size-7 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><MessageCircle className="size-4" /></a> : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!rows.length ? <p className="py-12 text-center text-[13px] text-muted">{q || status ? "Aucun fan ne correspond." : cur0?.kind === "manual" ? "Ce groupe est vide. Sélectionne des fans dans « Tous les fans » puis « Ajouter à un groupe »." : "Aucun fan ici pour l’instant."}</p> : null}
                  {d.total > d.per ? (
                    <div className="flex flex-wrap items-center gap-2 px-1 pt-3 text-[12.5px] text-muted">
                      <span className="v2-num flex-1">{int((d.page - 1) * d.per + 1)}–{int(Math.min(d.page * d.per, d.total))} sur {int(d.total)}</span>
                      <button type="button" disabled={d.page <= 1} onClick={() => setPage(d.page - 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}><ChevronLeft className="size-4" />Précédents</button>
                      <span className="v2-num">{d.page} / {pages}</span>
                      <button type="button" disabled={d.page >= pages} onClick={() => setPage(d.page + 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}>Suivants<ChevronRight className="size-4" /></button>
                    </div>
                  ) : null}
                </div>
                {n ? (
                  <div className="sticky bottom-4 z-20 mt-4 px-2">
                    <div className="v2-card mx-auto flex max-w-[760px] flex-wrap items-center gap-2 px-3.5 py-2.5" style={{ background: "#121215", borderColor: "rgb(59 130 246 / 0.45)", boxShadow: "0 24px 60px -18px rgb(0 0 0 / 0.95)" }}>
                      <b className="text-[13px]">{plural(n, "fan")} choisi{n > 1 ? "s" : ""}</b>
                      <button type="button" onClick={() => setPicked(new Map())} className="v2-tool">Tout désélectionner</button>
                      <span className="flex-1" />
                      {cur0?.kind === "manual" ? (
                        <button type="button" onClick={() => void api("POST", "/api/v2/fans/members", { creatorId: mid, groupId: cur0.id, fanIds: [...picked.keys()], add: false }).then(() => (toast(`${plural(n, "fan")} retiré${n > 1 ? "s" : ""} de « ${cur0.name} »`), setPicked(new Map()), load())).catch((e) => toast(errText(e), "err"))} className="v2-btn" data-kind="ghost" style={{ height: 34 }}>Retirer de ce groupe</button>
                      ) : null}
                      <button type="button" onClick={() => setWin({ kind: "add" })} className="v2-btn" style={{ height: 34 }}><UsersRound className="size-4" />Ajouter à un groupe</button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}
        </div>
      </div>

      {win?.kind === "fan" && d ? <FanSheet pf={pf} creatorId={mid} fanId={win.id} cur={cur} sources={d.sources} chatOk={chatOk} onClose={() => setWin(null)} onSaved={() => (setWin(null), void load())} /> : null}
      {win?.kind === "group" && d && m ? <GroupForm creatorId={mid} model={m.name} cur={cur} mym={mym} group={win.group} onClose={() => setWin(null)} onDone={() => (setWin(null), void load())} /> : null}
      {win?.kind === "add" ? <AddToGroup creatorId={mid} fanIds={[...picked.keys()]} groups={manual} canEdit={canEdit} onClose={() => setWin(null)} onDone={() => (setWin(null), setPicked(new Map()), void load())} /> : null}
      {win?.kind === "confirm" ? <Confirm title={win.title} text={win.text} button={win.button} go={win.go} onClose={() => setWin(null)} /> : null}
    </div>
  );
}

/** La fiche d'un fan : ses chiffres, ses derniers achats, et ce que l'équipe note sur lui (comme dans la messagerie). */
function FanSheet({ pf, creatorId, fanId, cur, sources, chatOk, onClose, onSaved }: { pf: Pf; creatorId: string; fanId: string; cur: string; sources: string[]; chatOk: boolean; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<One | null>(null);
  const [err, setErr] = useState("");
  const [v, setV] = useState({ nickname: "", notes: "", tags: "", age: "", gender: "", source: "", lang: "", promise: "" });
  const [mine, setMine] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  useEffect(() => {
    let off = false;
    api<{ live: Live | null }>("GET", `/api/v2/fans/live?pf=${pf}&creatorId=${encodeURIComponent(creatorId)}&fanId=${encodeURIComponent(fanId)}`).then((r) => void (!off && setLive(r.live))).catch(() => {});
    return () => {
      off = true;
    };
  }, [pf, creatorId, fanId]);
  useEffect(() => {
    let off = false;
    api<One>("GET", `/api/v2/fans/one?pf=${pf}&creatorId=${encodeURIComponent(creatorId)}&fanId=${encodeURIComponent(fanId)}`)
      .then((r) => {
        if (off) return;
        setD(r);
        setV({ nickname: r.sheet.nickname, notes: r.sheet.notes, tags: r.sheet.tags.join(", "), age: r.sheet.age, gender: r.sheet.gender, source: r.sheet.source, lang: r.sheet.lang, promise: r.sheet.promise });
        setMine(new Set(r.groups.filter((g) => g.member && g.kind === "manual").map((g) => g.id)));
      })
      .catch((e) => void (!off && setErr(errText(e))));
    return () => {
      off = true;
    };
  }, [pf, creatorId, fanId]);
  const f = d?.fan ?? null;
  const save = async () => {
    if (!d) return;
    setBusy(true);
    const changed = d.groups.filter((g) => g.kind === "manual" && g.member !== mine.has(g.id)).map((g) => ({ id: g.id, on: mine.has(g.id) }));
    try {
      await api("POST", "/api/v2/fans/sheet", { creatorId, fanId, patch: { nickname: v.nickname, notes: v.notes, tags: v.tags.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean), age: v.age, gender: v.gender, source: v.source, lang: v.lang, promise: v.promise }, groups: changed });
      toast("Fiche enregistrée");
      onSaved();
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy(false);
  };
  const line = (label: string, value: React.ReactNode) => <p className="flex items-baseline justify-between gap-3 border-b py-1.5 text-[12.5px]" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}><span className="text-muted">{label}</span><b className="v2-num text-right">{value}</b></p>;
  const autos = d?.groups.filter((g) => g.kind !== "manual" && g.member) ?? [];
  const manuals = d?.groups.filter((g) => g.kind === "manual") ?? [];
  return (
    <Modal title={f ? f.nickname || f.name : "Fiche du fan"} sub={f ? [f.nickname ? f.name : "", f.username && f.username !== f.name ? `@${f.username}` : ""].filter(Boolean).join(" · ") || undefined : undefined} width={940} onClose={onClose}>
      {err ? <p className="text-[13px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      {!d && !err ? <p className="py-16 text-center text-[13px] text-muted">Chargement…</p> : null}
      {d && f ? (
        <>
          <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Avatar src={f.avatar} name={f.name} size="size-14" />
                <div className="min-w-0">
                  <span className="v2-tag" style={STATUS[f.status].style}>{STATUS[f.status].one}</span>
                  <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px] text-muted">
                    {f.pinned ? <span className="flex items-center gap-1" style={{ color: "#fbbf24" }}><Pin className="size-3" />épinglé par l’équipe</span> : null}
                    {f.ai ? <span className="flex items-center gap-1" style={{ color: "var(--v2-sky)" }}><Sparkles className="size-3" />IA active</span> : null}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                {line(pf === "mym" ? "Dépensé (hors abonnements)" : "Dépensé", f.total ? money(f.total, cur) : "rien pour l’instant")}
                {line("Contenus payants achetés", f.ppvSent ? `${f.ppvBought} sur ${f.ppvSent} (${pct(f.ppvBought, f.ppvSent)} %)` : "aucun vu par Bloom")}
                {line("Abonné depuis", live?.since || f.since ? day(live?.since || f.since) : "date inconnue")}
                {live && f.status === "active" && (live.price != null || live.renews || live.expires) ? line("Abonnement", [live.price != null ? (live.price ? money(live.price, cur) : "gratuit") : "", live.canceled && live.expires && live.expires - Date.now() < 400 * 864e5 ? `s’arrête le ${day(live.expires)}` : !live.canceled && live.renews && live.renews - Date.now() < 400 * 864e5 ? `renouvelé le ${day(live.renews)}` : ""].filter(Boolean).join(" · ") || "—") : null}
                {live?.link ? line("Arrivé par le lien", live.link) : null}
                {line("Dernier message", f.lastAt ? `${ago(f.lastAt)} · ${f.lastFromFan ? "de lui" : "de nous"}` : "—")}
              </div>
              <p className="v2-label mt-4">Derniers achats</p>
              {d.buys.length ? (
                <div className="space-y-1">
                  {d.buys.map((b, i) => (
                    <p key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]" style={{ background: "rgb(255 255 255 / 0.03)" }}>
                      <span className="min-w-0 flex-1 truncate">{BUY[b.type] ?? "Achat"}{b.pending ? <span className="ml-1.5 text-muted">à confirmer</span> : null}</span>
                      <span className="shrink-0 text-muted">{day(b.at)}</span>
                      <b className="v2-num w-16 shrink-0 text-right" style={{ color: b.type === "refund" ? "var(--v2-down)" : b.amount ? undefined : "var(--color-muted)" }}>{b.amount ? money(b.amount, cur) : "gratuit"}</b>
                    </p>
                  ))}
                </div>
              ) : <p className="text-[12.5px] text-muted">Aucun achat vu par Bloom.</p>}
              {chatOk ? <a href={`/v2/messagerie?c=${encodeURIComponent(d.convId)}`} className="v2-btn mt-4 w-full" data-kind="ghost" style={{ height: 36 }}><MessageCircle className="size-4" />Ouvrir la conversation</a> : null}
            </div>

            <div className="min-w-0">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="v2-label" htmlFor="fan-nick">Surnom <span className="font-normal">(pour l’équipe)</span></label>
                  <input id="fan-nick" value={v.nickname} maxLength={60} onChange={(e) => setV({ ...v, nickname: e.target.value })} placeholder={f.name} className="v2-field" />
                </div>
                <div>
                  <label className="v2-label" htmlFor="fan-tags">Étiquettes <span className="font-normal">(séparées par des virgules)</span></label>
                  <input id="fan-tags" value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} placeholder="vip, vocaux, paie le 5" className="v2-field" />
                </div>
              </div>
              <label className="v2-label mt-3" htmlFor="fan-notes">Note <span className="font-normal">(la même que dans la messagerie)</span></label>
              <textarea id="fan-notes" value={v.notes} maxLength={5000} rows={6} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder={"Métier, passions, en couple ?, jour de paye, ce qu’il aime…"} className="v2-field" style={{ height: "auto", paddingTop: 8, paddingBottom: 8, resize: "vertical" }} />
              {d.sheet.notesBy && d.sheet.notesAt ? <p className="mt-1 text-[11px] text-muted">Dernière modification : {d.sheet.notesBy}, le {day(d.sheet.notesAt)}.</p> : null}
              {d.sheet.oldNotes && !v.notes ? (
                <p className="mt-2 rounded-lg border px-3 py-2 text-[12px] leading-relaxed" style={{ borderColor: "rgb(251 191 36 / 0.3)", background: "rgb(251 191 36 / 0.07)" }}>
                  Une note avait été écrite dans l’ancien écran Fans. <button type="button" onClick={() => setV({ ...v, notes: d.sheet.oldNotes })} className="font-semibold underline underline-offset-2">La reprendre ici</button>
                </p>
              ) : null}

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="v2-label" htmlFor="fan-age">Âge</label>
                  <input id="fan-age" value={v.age} maxLength={10} onChange={(e) => setV({ ...v, age: e.target.value })} className="v2-field" />
                </div>
                <div>
                  <label className="v2-label" htmlFor="fan-gender">Genre</label>
                  <select id="fan-gender" value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })} className="v2-field" style={{ colorScheme: "dark" }}>
                    {["", "Masculin", "Féminin"].map((x) => <option key={x || "none"} value={x} style={{ background: "#121215" }}>{x || "—"}</option>)}
                  </select>
                </div>
                <div>
                  <label className="v2-label" htmlFor="fan-lang">Langue</label>
                  <input id="fan-lang" value={v.lang} maxLength={30} onChange={(e) => setV({ ...v, lang: e.target.value })} placeholder="français" className="v2-field" />
                </div>
                <div>
                  <label className="v2-label" htmlFor="fan-source">Provenance</label>
                  <select id="fan-source" value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} className="v2-field" style={{ colorScheme: "dark" }}>
                    <option value="" style={{ background: "#121215" }}>Inconnue</option>
                    {sources.map((x) => <option key={x} value={x} style={{ background: "#121215" }}>{x}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="v2-label" htmlFor="fan-promise">Promesse d’achat <span className="font-normal">(le jour où il a dit qu’il achèterait)</span></label>
                  <input id="fan-promise" type="date" value={v.promise} onChange={(e) => setV({ ...v, promise: e.target.value })} className="v2-field" style={{ colorScheme: "dark" }} />
                </div>
              </div>

              <p className="v2-label mt-3">Groupes</p>
              <div className="flex flex-wrap gap-1.5">
                {manuals.map((g) => {
                  const on = mine.has(g.id);
                  return <button key={g.id} type="button" aria-pressed={on} onClick={() => setMine((s) => { const x = new Set(s); if (on) x.delete(g.id); else x.add(g.id); return x; })} className="v2-seg border" data-on={on} style={{ borderColor: "var(--color-line)" }}><GroupDot g={g} size="size-3" />{g.name}</button>;
                })}
                {autos.map((g) => <span key={g.id} className="v2-tag" style={{ height: 26, padding: "0 9px" }} title="Groupe automatique : le fan y entre et en sort tout seul"><GroupDot g={g} size="size-3" />{g.name} · auto</span>)}
                {!manuals.length && !autos.length ? <span className="text-[12.5px] text-muted">Aucun groupe pour cette modèle.</span> : null}
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Fermer</button>
            <button type="button" onClick={() => void save()} disabled={busy} className="v2-btn">{busy ? "Enregistrement…" : "Enregistrer la fiche"}</button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

/** Créer ou modifier un groupe : manuel (rempli à la main) ou automatique (une règle sur la dépense du fan). */
const numOf = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s.replace(",", "."))) ? null : Number(s.replace(",", ".")));
const strOf = (n: number | null | undefined) => (n == null ? "" : String(n));
const RESETS: [string, string, string][] = [
  ["never", "Jamais", "Le groupe garde ses fans jusqu’à ce que quelqu’un les retire."],
  ["daily", "Chaque jour", "Le groupe est vidé chaque jour à l’heure choisie."],
  ["weekly", "Chaque semaine", "Le groupe est vidé chaque semaine, le jour et à l’heure choisis."],
  ["monthly", "Chaque mois", "Le groupe est vidé chaque mois, le jour et à l’heure choisis."],
  ["after_add", "Quelques heures après l’ajout de chaque fan", "Chaque fan sort du groupe après le nombre d’heures choisi."],
];
function GroupForm({ creatorId, model, cur, mym, group, onClose, onDone }: { creatorId: string; model: string; cur: string; mym: boolean; group: Group | null; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({
    name: group?.name ?? "", color: group?.color ?? PALETTE[0], icon: group?.icon ?? "star", auto: group ? group.kind === "auto" : true, noPay: !!group?.noPay,
    min: group ? strOf(group.min) : "100", max: strOf(group?.max), ppvOnly: !!group?.ppvOnly, ageMin: strOf(group?.ageMin), ageMax: strOf(group?.ageMax),
    rateMin: strOf(group?.rateMin), rateMax: strOf(group?.rateMax), ratePpv: strOf(group?.ratePpv), reset: group?.reset ?? "never", resetDay: strOf(group?.resetDay ?? 1), resetHour: group?.resetHour ?? "00:00", stayHours: strOf(group?.stayHours),
  });
  const [more, setMore] = useState(!!group && [group.ageMin, group.ageMax, group.rateMin, group.rateMax].some((x) => x != null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (part: Partial<typeof v>) => setV((x) => ({ ...x, ...part }));
  const s = sym(cur);
  const save = async () => {
    if (!v.name.trim()) return setErr("Donne un nom au groupe.");
    setBusy(true);
    setErr("");
    const a = v.auto;
    try {
      await api("POST", "/api/fanlists/save", {
        creatorId,
        list: {
          id: group?.id, kind: a ? "auto" : "manual", name: v.name.trim(), color: v.color, icon: v.icon, noPay: a && v.noPay, min: a && !v.noPay ? numOf(v.min) ?? 0 : null, max: a && !v.noPay ? numOf(v.max) : null, ppvOnly: a && v.ppvOnly,
          ageMin: a ? numOf(v.ageMin) : null, ageMax: a ? numOf(v.ageMax) : null, rateMin: a ? numOf(v.rateMin) : null, rateMax: a ? numOf(v.rateMax) : null, ratePpv: a ? numOf(v.ratePpv) : null,
          reset: a ? "never" : v.reset, resetDay: numOf(v.resetDay), resetHour: v.resetHour, stayHours: numOf(v.stayHours),
        },
      });
      toast(group ? "Groupe enregistré" : "Groupe créé");
      onDone();
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  };
  const small = "v2-field";
  const pair = (label: string, lo: keyof typeof v, hi: keyof typeof v, unit: string) => (
    <div>
      <p className="v2-label">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex h-[38px] items-center gap-1.5 rounded-[10px] border px-3" style={{ borderColor: "var(--color-line)", background: "rgb(255 255 255 / 0.03)" }}><span className="shrink-0 text-[12px] text-muted">au moins</span><input value={v[lo] as string} onChange={(e) => set({ [lo]: e.target.value.replace(/[^\d.,]/g, "") } as Partial<typeof v>)} inputMode="decimal" className="min-w-0 flex-1 bg-transparent text-right text-[13.5px] outline-none" /><span className="shrink-0 text-[12px] text-muted">{unit}</span></label>
        <label className="flex h-[38px] items-center gap-1.5 rounded-[10px] border px-3" style={{ borderColor: "var(--color-line)", background: "rgb(255 255 255 / 0.03)" }}><span className="shrink-0 text-[12px] text-muted">au plus</span><input value={v[hi] as string} onChange={(e) => set({ [hi]: e.target.value.replace(/[^\d.,]/g, "") } as Partial<typeof v>)} inputMode="decimal" placeholder="∞" className="min-w-0 flex-1 bg-transparent text-right text-[13.5px] outline-none placeholder:text-[#5d5d66]" /><span className="shrink-0 text-[12px] text-muted">{unit}</span></label>
      </div>
    </div>
  );
  return (
    <Modal sticky wide title={group ? "Modifier le groupe" : "Nouveau groupe"} sub={`Pour les fans de ${model}. Un groupe sert à retrouver ces fans d’un clic${mym ? ", et à choisir à qui envoyer un Mass DM" : ""}.`} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <label className="v2-label" htmlFor="grp-name">Nom</label>
          <input id="grp-name" autoFocus value={v.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="Ex : Gros acheteurs, À relancer, Nouveaux" className={small} />

          <p className="v2-label mt-3">Comment il se remplit</p>
          <div className="v2-segbar">
            <button type="button" className="v2-seg" data-on={v.auto} onClick={() => set({ auto: true })}>Tout seul, selon une règle</button>
            <button type="button" className="v2-seg" data-on={!v.auto} onClick={() => set({ auto: false })}>À la main</button>
          </div>

          {v.auto ? (
            <div className="mt-3 space-y-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-[13px]"><Switch on={v.noPay} onChange={(x) => set({ noPay: x })} /><span><b>Abonnés qui n’ont jamais rien acheté</b><span className="mt-0.5 block text-[11.5px] text-muted">Les abonnés actifs dont la dépense est à zéro. Les montants ci-dessous ne comptent plus.</span></span></label>
              <div style={{ opacity: v.noPay ? 0.4 : 1, pointerEvents: v.noPay ? "none" : undefined }}>
                {pair(`Ce que le fan a dépensé (${s})`, "min", "max", s)}
                <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 text-[13px]"><Switch on={v.ppvOnly} onChange={(x) => set({ ppvOnly: x })} /><span><b>Sans compter l’abonnement</b><span className="mt-0.5 block text-[11.5px] text-muted">Seulement les contenus payants et les pourboires.</span></span></label>
              </div>
              {more ? (
                <>
                  {pair("Abonné depuis (jours)", "ageMin", "ageMax", "j")}
                  {pair("Part des contenus payants qu’il achète (%)", "rateMin", "rateMax", "%")}
                  <label className="flex items-center gap-2 text-[12.5px] text-muted">Seulement s’il en a reçu au moins<input value={v.ratePpv} onChange={(e) => set({ ratePpv: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="1" className="h-8 w-16 rounded-lg border bg-transparent px-2 text-right text-[13px] outline-none" style={{ borderColor: "var(--color-line)", color: "var(--color-fg)" }} /></label>
                </>
              ) : <button type="button" onClick={() => setMore(true)} className="text-[12.5px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--v2-sky)" }}>+ Ajouter un critère (ancienneté, part de contenus achetés)</button>}
            </div>
          ) : (
            <div className="mt-3">
              <label className="v2-label" htmlFor="grp-reset">Vider le groupe automatiquement</label>
              <select id="grp-reset" value={v.reset} onChange={(e) => set({ reset: e.target.value })} className={small} style={{ colorScheme: "dark" }}>
                {RESETS.map(([k, l]) => <option key={k} value={k} style={{ background: "#121215" }}>{l}</option>)}
              </select>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {v.reset === "weekly" ? <select value={v.resetDay} onChange={(e) => set({ resetDay: e.target.value })} className={small} style={{ colorScheme: "dark" }} aria-label="Jour de la semaine">{WEEK.slice(1).map((x, i) => <option key={x} value={i + 1} style={{ background: "#121215" }}>{x}</option>)}</select> : null}
                {v.reset === "monthly" ? <label className="flex h-[38px] items-center gap-2 rounded-[10px] border px-3 text-[12.5px] text-muted" style={{ borderColor: "var(--color-line)" }}>le<input value={v.resetDay} onChange={(e) => set({ resetDay: e.target.value.replace(/\D/g, "").slice(0, 2) })} inputMode="numeric" className="w-10 bg-transparent text-center text-[13.5px] outline-none" style={{ color: "var(--color-fg)" }} />du mois (1 à 28)</label> : null}
                {["daily", "weekly", "monthly"].includes(v.reset) ? <input type="time" value={v.resetHour} onChange={(e) => set({ resetHour: e.target.value })} className={small} style={{ colorScheme: "dark" }} aria-label="Heure (heure de Paris)" /> : null}
                {v.reset === "after_add" ? <label className="flex h-[38px] items-center gap-2 rounded-[10px] border px-3 text-[12.5px] text-muted sm:col-span-2" style={{ borderColor: "var(--color-line)" }}>Chaque fan sort après<input value={v.stayHours} onChange={(e) => set({ stayHours: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" className="w-14 bg-transparent text-center text-[13.5px] outline-none" style={{ color: "var(--color-fg)" }} />heures</label> : null}
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{RESETS.find((r) => r[0] === v.reset)?.[2]}{v.reset !== "never" ? " Les fans sont seulement retirés du groupe : rien ne leur est envoyé." : ""}</p>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="v2-label">Couleur</p>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...PALETTE, v.color])].map((c) => <button key={c} type="button" onClick={() => set({ color: c })} aria-label={`Couleur ${c}`} aria-pressed={v.color === c} className="size-6 rounded-full transition-transform hover:scale-110" style={{ background: c, boxShadow: v.color === c ? "0 0 0 2px #0e0e11, 0 0 0 4px #fff" : undefined }} />)}
          </div>
          <p className="v2-label mt-3">Icône</p>
          <div className="grid grid-cols-8 gap-1">
            {GROUP_ICONS.map(([k, I]) => <button key={k} type="button" onClick={() => set({ icon: k })} aria-pressed={v.icon === k} aria-label={`Icône ${k}`} className="grid aspect-square place-items-center rounded-lg border transition-colors" style={{ borderColor: v.icon === k ? "var(--v2-blue)" : "var(--color-line)", background: v.icon === k ? "rgb(59 130 246 / 0.16)" : undefined, color: v.icon === k ? v.color : "var(--color-muted)" }}><I className="size-4" /></button>)}
          </div>
        </div>
      </div>
      {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void save()} disabled={busy || !v.name.trim()} className="v2-btn">{busy ? "Enregistrement…" : group ? "Enregistrer" : "Créer le groupe"}</button>
      </div>
    </Modal>
  );
}

/** Mettre les fans choisis dans un groupe manuel (existant, ou créé sur place par un team leader). */
function AddToGroup({ creatorId, fanIds, groups, canEdit, onClose, onDone }: { creatorId: string; fanIds: string[]; groups: Group[]; canEdit: boolean; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const add = async (id: number, label: string) => {
    await api("POST", "/api/v2/fans/members", { creatorId, groupId: id, fanIds });
    toast(`${plural(fanIds.length, "fan")} ajouté${fanIds.length > 1 ? "s" : ""} à « ${label} »`);
    onDone();
  };
  const go = async (key: string, f: () => Promise<void>) => {
    setBusy(key);
    try {
      await f();
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy("");
  };
  const create = () =>
    go("new", async () => {
      const r = await api<{ lists: { id: number; name: string; kind: string }[] }>("POST", "/api/fanlists/save", { creatorId, list: { kind: "manual", name: name.trim(), color: PALETTE[0], icon: "users", reset: "never" } });
      const made = [...r.lists].reverse().find((l) => l.kind === "manual" && l.name === name.trim());
      if (!made) throw new Error("Groupe créé, mais introuvable : recharge la page.");
      await add(made.id, made.name);
    });
  return (
    <Modal title={`Ajouter ${plural(fanIds.length, "fan")} à un groupe`} sub="Dans un groupe manuel (les groupes automatiques se remplissent tout seuls)." onClose={onClose}>
      <div className="v2-scroll max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
        {groups.map((g) => (
          <button key={g.id} type="button" disabled={!!busy} onClick={() => void go(String(g.id), () => add(g.id, g.name))} className="v2-menu-item border" style={{ borderColor: "var(--color-line)" }}>
            <GroupDot g={g} size="size-4 shrink-0" />
            <span className="min-w-0 flex-1"><b className="block truncate">{g.name}</b><span className="block text-[11.5px] font-normal text-muted">{g.count ? plural(g.count, "fan") : "vide"}</span></span>
            {busy === String(g.id) ? <span className="text-[11.5px] text-muted">Un instant…</span> : null}
          </button>
        ))}
      </div>
      {!groups.length ? <p className="text-[12.5px] text-muted">Aucun groupe manuel pour cette modèle.{canEdit ? "" : " Demande à un team leader d’en créer un."}</p> : null}
      {canEdit ? (
        <>
          <label className="v2-label mt-4" htmlFor="add-new">Ou dans un nouveau groupe manuel</label>
          <div className="flex gap-2">
            <input id="add-new" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && !busy && void create()} placeholder="Nom du groupe" className="v2-field" />
            <button type="button" onClick={() => void create()} disabled={!!busy || !name.trim()} className="v2-btn" style={{ height: 38 }}>{busy === "new" ? "Un instant…" : "Créer et ajouter"}</button>
          </div>
        </>
      ) : null}
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
      </div>
    </Modal>
  );
}
