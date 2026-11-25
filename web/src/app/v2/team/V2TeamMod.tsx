"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, CreditCard, Globe, Link2, MessagesSquare, Phone, ShieldCheck, Trash2, Upload } from "lucide-react";
import { api, toast } from "@/lib/api";
import type { Pf } from "@/lib/platform";
import { Confirm, int } from "../kit";
import { errText, plural } from "../media/MediaKit";
import { dateOf, ThreadModal, timeOf, WhoTag, type TeamModel, type Who } from "./TeamKit";

// Bloom v2 → Équipe → Modération (25/11/2026, « Constellation »), pour OnlyFans et MYM (avant : MYM seulement).
//  - Détection : les messages envoyés aux fans que des RÈGLES jugent suspects (numéro, autre réseau, autre plateforme,
//    lien, paiement hors plateforme), avec les règles de la plateforme affichée : `GET /api/v2/team/mod`.
//  - Mots interdits de l'agence (pour toutes les modèles) et envois bloqués : « /api/mym/mod/banned ».
//  - Sorties autorisées : un motif accepté sur une modèle (`POST /api/v2/team/mod/allow`).
//  - Retirer des messages déjà partis (MYM seulement, admins et managers) : « /api/mym/mod/find » ne fait que chercher,
//    « /api/mym/mod/retire » supprime chez MYM, définitivement, après une confirmation.
type Alert = { id: string; at: number; cid: string; model: string; fid: string | null; fan: string | null; who: Who; cats: string[]; severity: "high" | "medium"; text: string; deleted: boolean };
type Mod = {
  platform: Pf; cats: Record<string, string>; hours: number; models: TeamModel[]; canAct: boolean; banned: number; refused: number; total: number; high: number; fans: number; counts: Record<string, number>;
  authors: (Who & { alerts: number; high: number; cats: string[]; last: number; models: string[] })[]; alerts: Alert[]; allowed: { cid: string; model: string; cat: string; by: string | null; at: number }[];
};
type Found = { id: string; at: number; creator: string; fan: string | null; text: string; sender: Who };
type Banned = { canEdit: boolean; words: { id: number; word: string; variants: string[] }[]; refused: { at: number; user: string | null; creator: string; word: string; found: string; text: string }[] };
type Tab = "detect" | "words" | "allowed" | "retire";
type Preset = { rows?: Found[]; person?: string } | null;

const ICON: Record<string, React.ReactNode> = { phone: <Phone className="size-3.5" />, social: <AtSign className="size-3.5" />, platform: <Globe className="size-3.5" />, link: <Link2 className="size-3.5" />, pay: <CreditCard className="size-3.5" /> };
const HOURS: [number, string][] = [[24, "24 h"], [168, "7 jours"], [720, "30 jours"]];
const when = (t: number) => `${dateOf(t)} · ${timeOf(t)}`;
const RED: React.CSSProperties = { color: "var(--v2-down)", background: "rgb(244 63 94 / 0.13)" };
const AMBER: React.CSSProperties = { color: "#fbbf24", background: "rgb(245 158 11 / 0.14)" };

/** `pf` = la plateforme affichée par cet onglet (envoyée au serveur : le cookie du menu est commun aux onglets). */
export function V2TeamMod({ pf }: { pf: Pf }) {
  const [tab, setTab] = useState<Tab>("detect");
  const [hours, setHours] = useState(168);
  const [d, setD] = useState<Mod | null>(null);
  const [err, setErr] = useState("");
  const [cat, setCat] = useState("");
  const [thread, setThread] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>(null);
  const mym = pf === "mym";
  const pfName = mym ? "MYM" : "OnlyFans";
  const load = useCallback(() => api<Mod>("GET", `/api/v2/team/mod?pf=${pf}&hours=${hours}`).then((r) => (setD(r), setErr(""))).catch((e) => setErr(errText(e))), [pf, hours]);
  useEffect(() => void load(), [load]);
  const allow = async (cid: string, c: string, on: boolean) => {
    try {
      await api("POST", "/api/v2/team/mod/allow", { creatorId: cid, cat: c, on });
      toast(on ? "Ce motif n’est plus signalé sur cette modèle" : "Autorisation retirée");
      await load();
    } catch (e) {
      toast(errText(e), "err");
    }
  };
  const retire = (p: Preset) => (setPreset(p), setTab("retire"));
  const alerts = (d?.alerts ?? []).filter((a) => !cat || a.cats.includes(cat));
  const tile = (label: string, value: string | null, sub: React.ReactNode, i: number, style?: React.CSSProperties) => (
    <div className="v2-card v2-rise min-w-0 p-3.5" style={{ ["--i" as string]: i + 2 }}>
      <p className="truncate text-[12px] text-muted">{label}</p>
      <p className="v2-num mt-1 truncate text-[22px] leading-tight font-bold" style={style}>{value ?? <span className="text-muted">…</span>}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub}</p>
    </div>
  );
  const chips = (list: string[]) => <span className="flex flex-wrap gap-1">{list.map((c) => <span key={c} className="v2-tag">{ICON[c]}{d?.cats[c] ?? c}</span>)}</span>;

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Équipe · {pfName}</p>
          <h1 className="v2-h1 mt-1">Modération</h1>
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
          <span className="v2-tag" style={{ color: "var(--v2-up)", background: "rgb(16 185 129 / 0.14)", padding: "3px 8px" }}><ShieldCheck className="size-3.5" />Détection active</span>
          {d ? <span className="v2-tag" style={{ padding: "3px 8px" }}>{plural(d.models.length, "modèle")} {pfName}</span> : null}
          {d ? <span className="v2-tag" style={{ padding: "3px 8px" }}>{plural(d.banned, "mot interdit", "mots interdits")}</span> : null}
        </p>
      </div>
      <div className="v2-rise v2-noscroll mt-4 overflow-x-auto border-b" style={{ borderColor: "var(--color-line)", ["--i" as string]: 1 }}>
        <div className="v2-tabs">
          <button type="button" className="v2-tab" data-on={tab === "detect"} onClick={() => setTab("detect")}>Détection<span className="v2-num ml-1.5 opacity-60">{d ? int(d.total) : ""}</span></button>
          <button type="button" className="v2-tab" data-on={tab === "words"} onClick={() => setTab("words")}>Mots interdits<span className="v2-num ml-1.5 opacity-60">{d ? int(d.banned) : ""}</span></button>
          <button type="button" className="v2-tab" data-on={tab === "allowed"} onClick={() => setTab("allowed")}>Sorties autorisées<span className="v2-num ml-1.5 opacity-60">{d ? int(d.allowed.length) : ""}</span></button>
          {mym ? <button type="button" className="v2-tab" data-on={tab === "retire"} onClick={() => (setPreset(null), setTab("retire"))}>Retirer des messages</button> : null}
        </div>
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      {tab === "detect" ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="v2-segbar">{HOURS.map(([h, l]) => <button key={h} type="button" className="v2-seg" data-on={hours === h} onClick={() => setHours(h)}>{l}</button>)}</div>
            <div className="v2-noscroll flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
              {Object.entries(d?.cats ?? {}).map(([k, label]) => {
                const n = d?.counts[k] ?? 0;
                const on = cat === k;
                return <button key={k} type="button" aria-pressed={on} onClick={() => setCat(on ? "" : k)} className="v2-seg shrink-0 border" data-on={on} style={{ borderColor: "var(--color-line)", opacity: n || on ? 1 : 0.5 }}>{ICON[k]}{label}<b className="v2-num">{int(n)}</b></button>;
              })}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            {tile("Alertes", d ? int(d.total) : null, "messages jugés suspects", 0)}
            {tile("Gravité haute", d ? int(d.high) : null, "numéro, lien, paiement ou invitation", 1, d?.high ? { color: "var(--v2-down)" } : undefined)}
            {tile("Auteurs signalés", d ? int(d.authors.length) : null, "au moins une alerte", 2)}
            {tile("Fans concernés", d ? int(d.fans) : null, "ont reçu un de ces messages", 3)}
            {tile("Envois bloqués", d ? int(d.refused) : null, <button type="button" onClick={() => setTab("words")} className="underline-offset-2 hover:underline">par un mot interdit · voir</button>, 4)}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
            <section className="v2-card v2-rise min-w-0 p-3.5 lg:self-start" style={{ ["--i" as string]: 8 }}>
              <p className="v2-card-title">Auteurs signalés</p>
              <p className="mt-0.5 text-[12px] text-muted">Les plus graves d’abord.</p>
              <div className="mt-2.5 space-y-2">
                {(d?.authors ?? []).map((a) => (
                  <div key={a.key} className="rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)" }}>
                    <p className="flex items-center gap-2 text-[13px]"><span className="min-w-0 flex-1"><WhoTag w={a} pf={pf} strong /></span><b className="v2-num shrink-0">{int(a.alerts)}</b>{a.high ? <span className="v2-tag shrink-0" style={RED}>{a.high} haute{a.high > 1 ? "s" : ""}</span> : null}</p>
                    <p className="mt-1 truncate text-[11.5px] text-muted">{a.models.join(", ")} · dernière le {when(a.last)}</p>
                    <div className="mt-2">{chips(a.cats)}</div>
                    {mym && d?.canAct && a.type === "human" && a.key.startsWith("n:") ? <button type="button" onClick={() => retire({ person: a.name })} className="mt-2 text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--v2-sky)" }}>Retirer ses messages…</button> : null}
                  </div>
                ))}
                {d && !d.authors.length ? <p className="py-6 text-center text-[12.5px] text-muted">Aucune alerte sur cette période.</p> : null}
              </div>
            </section>
            <section className="v2-card v2-rise min-w-0 p-3.5" style={{ ["--i" as string]: 9 }}>
              <p className="v2-card-title">Alertes récentes</p>
              <p className="mt-0.5 text-[12px] text-muted">{d ? (d.total > d.alerts.length ? `Les ${int(d.alerts.length)} dernières sur ${int(d.total)}.` : plural(alerts.length, "alerte")) : " "}{cat && d ? ` Motif : ${d.cats[cat]}.` : ""}</p>
              <div className="mt-2.5 space-y-2">
                {alerts.map((a) => (
                  <div key={a.id} className="rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)", borderLeft: `3px solid ${a.severity === "high" ? "var(--v2-down)" : "#f59e0b"}`, opacity: a.deleted ? 0.55 : 1 }}>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
                      <span className="v2-tag" style={a.severity === "high" ? RED : AMBER}>Gravité {a.severity === "high" ? "haute" : "moyenne"}</span>
                      <span>{when(a.at)}</span><span>· {a.model}</span>{a.deleted ? <span className="v2-tag">retiré chez le fan</span> : null}
                    </p>
                    <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12.5px]"><WhoTag w={a.who} pf={pf} strong /><span className="text-muted">→ {a.fan ?? "fan inconnu"}</span></p>
                    <p className="mt-1 text-[13px] leading-relaxed break-words whitespace-pre-wrap">{a.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {chips(a.cats)}
                      <span className="flex-1" />
                      {a.fid ? <button type="button" onClick={() => setThread(`id=${encodeURIComponent(a.id)}`)} className="v2-tool"><MessagesSquare className="size-3.5" />Conversation</button> : null}
                      {mym && d?.canAct && !a.deleted ? <button type="button" onClick={() => retire({ rows: [{ id: a.id, at: a.at, creator: a.model, fan: a.fan, text: a.text, sender: a.who }] })} className="v2-tool">Retirer…</button> : null}
                      {d?.canAct ? <button type="button" onClick={() => void allow(a.cid, a.cats[0], true)} title={`Ne plus signaler « ${d.cats[a.cats[0]]} » sur ${a.model} (par exemple son compte officiel)`} className="v2-tool">Autoriser sur {a.model}</button> : null}
                    </div>
                  </div>
                ))}
                {d && !alerts.length ? <p className="py-10 text-center text-[13px] text-muted">Rien à signaler.</p> : null}
              </div>
            </section>
          </div>
          <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-muted">
            Détection par règles (mots et formes reconnus), pas par une IA : elle ne juge pas le sens et ne repère pas une arnaque écrite avec d’autres mots. Tous les messages envoyés aux fans sont relus, y compris ceux écrits hors de Bloom ; les alertes sont gardées 60 jours.
            {mym ? "" : " Côté OnlyFans, parler d’OnlyFans ou donner un lien onlyfans.com n’est pas signalé. Un message déjà parti se retire depuis l’écran Messages, pendant 24 heures."}
          </p>
        </>
      ) : null}

      {tab === "words" ? <Words /> : null}

      {tab === "allowed" ? (
        <section className="v2-card v2-rise mt-4 max-w-[860px] p-4">
          <p className="v2-card-title">Sorties autorisées</p>
          <p className="mt-0.5 text-[12.5px] text-muted">Un motif accepté sur une modèle n’y est plus signalé (par exemple son Instagram officiel). On l’ajoute depuis une alerte, bouton « Autoriser sur… ».</p>
          <div className="mt-3 space-y-1.5">
            {(d?.allowed ?? []).map((a) => (
              <p key={`${a.cid}:${a.cat}`} className="flex items-center gap-3 rounded-[10px] border px-3 py-2 text-[12.5px]" style={{ borderColor: "var(--color-line)" }}>
                <b className="min-w-0 truncate text-[13px]">{a.model}</b>
                <span className="v2-tag shrink-0">{ICON[a.cat]}{d?.cats[a.cat] ?? a.cat}</span>
                <span className="min-w-0 flex-1 truncate text-muted">par {a.by || "—"} le {when(a.at)}</span>
                {d?.canAct ? <button type="button" onClick={() => void allow(a.cid, a.cat, false)} title="Signaler de nouveau ce motif sur cette modèle" aria-label="Retirer cette autorisation" className="grid size-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--v2-down)"><Trash2 className="size-4" /></button> : null}
              </p>
            ))}
            {d && !d.allowed.length ? <p className="py-8 text-center text-[13px] text-muted">Aucune sortie autorisée pour les modèles {pfName}.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "retire" && mym ? <Retire key={JSON.stringify(preset)} canAct={!!d?.canAct} models={d?.models ?? []} preset={preset} onDone={() => void load()} /> : null}
      {thread ? <ThreadModal query={thread} onClose={() => setThread(null)} /> : null}
    </div>
  );
}

/** Les mots que l'équipe n'a pas le droit d'envoyer (toutes les modèles, les deux plateformes) et les envois bloqués. */
function Words() {
  const [d, setD] = useState<Banned | null>(null);
  const [word, setWord] = useState("");
  const [variants, setVariants] = useState("");
  const [busy, setBusy] = useState(false);
  const [drop, setDrop] = useState<{ id: number; word: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(() => api<Banned>("GET", "/api/mym/mod/banned").then(setD).catch((e) => toast(errText(e), "err")), []);
  useEffect(() => void load(), [load]);
  const post = async (body: unknown, ok: string) => {
    setBusy(true);
    try {
      await api("POST", "/api/mym/mod/banned", body);
      toast(ok);
      await load();
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy(false);
  };
  const add = async () => {
    await post({ word: word.trim(), variants: variants.split("\n").map((x) => x.trim()).filter(Boolean) }, "Mot ajouté à la liste");
    setWord("");
    setVariants("");
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const words = [...new Set((await f.text()).split(/[\n;,]+/).map((x) => x.replace(/["']/g, "").trim()).filter((x) => x.length >= 2))].slice(0, 200);
    if (!words.length) return toast("Aucun mot trouvé dans ce fichier", "err");
    await post({ words }, `${plural(words.length, "mot")} lu${words.length > 1 ? "s" : ""} dans le fichier`);
    if (file.current) file.current.value = "";
  };
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="v2-card v2-rise min-w-0 p-4 lg:self-start">
        <p className="flex items-center justify-between gap-2"><span className="v2-card-title">Mots interdits par l’agence</span><span className="v2-tag v2-num">{d ? `${d.words.length} / 200` : "…"}</span></p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">La liste vaut pour TOUTES les modèles, OnlyFans et MYM, quand on écrit depuis Bloom : le message ne part pas. Les déguisements simples tombent avec le mot : inutile de saisir « t3l » ou « t.e.l ».</p>
        {d?.canEdit ? (
          <>
            <label className="v2-label mt-3" htmlFor="bw-word">Mot interdit</label>
            <input id="bw-word" value={word} maxLength={60} onChange={(e) => setWord(e.target.value)} placeholder="Téléphone, Snapchat, rencontre…" className="v2-field" />
            <label className="v2-label mt-3" htmlFor="bw-var">Autres écritures à bloquer <span className="font-normal">(une par ligne, facultatif)</span></label>
            <textarea id="bw-var" value={variants} rows={3} onChange={(e) => setVariants(e.target.value)} placeholder={"tel\nnumero\nphone"} className="v2-field" style={{ height: "auto", paddingTop: 8, paddingBottom: 8, resize: "vertical" }} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void add()} disabled={busy || word.trim().length < 2} className="v2-btn" style={{ height: 36 }}>Ajouter à la liste</button>
              <button type="button" onClick={() => file.current?.click()} disabled={busy} className="v2-btn" data-kind="ghost" style={{ height: 36 }} title="Un fichier texte ou CSV, un mot par ligne"><Upload className="size-4" />Importer un fichier</button>
              <input ref={file} type="file" accept=".txt,.csv" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
            </div>
          </>
        ) : <p className="mt-3 text-[12.5px] text-muted">Seuls les admins et managers modifient la liste.</p>}
        <div className="mt-4 space-y-1">
          {(d?.words ?? []).map((w) => (
            <p key={w.id} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]" style={{ background: "rgb(255 255 255 / 0.03)" }}>
              <b style={{ color: "var(--v2-down)" }}>{w.word}</b>
              <span className="min-w-0 flex-1 truncate text-muted">{w.variants.join(", ")}</span>
              {d?.canEdit ? <button type="button" onClick={() => setDrop({ id: w.id, word: w.word })} title="Retirer de la liste" aria-label={`Retirer « ${w.word} » de la liste`} className="grid size-6 shrink-0 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--v2-down)"><Trash2 className="size-3.5" /></button> : null}
            </p>
          ))}
          {d && !d.words.length ? <p className="py-4 text-center text-[12.5px] text-muted">Aucun mot interdit pour l’instant.</p> : null}
        </div>
      </section>
      <section className="v2-card v2-rise min-w-0 p-3">
        <p className="flex items-center justify-between gap-2 px-1"><span className="v2-card-title">Envois bloqués</span><span className="v2-tag v2-num">{d ? int(d.refused.length) : "…"}</span></p>
        <p className="mt-0.5 px-1 text-[12px] text-muted">Qui a employé un mot interdit, et dans quel message. Gardé 60 jours.</p>
        <div className="v2-scroll mt-2 overflow-x-auto" hidden={!d?.refused.length}>
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead><tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}><th className="px-3 py-2.5 text-left font-semibold">Quand</th><th className="px-3 py-2.5 text-left font-semibold">Qui</th><th className="px-3 py-2.5 text-left font-semibold">Modèle</th><th className="px-3 py-2.5 text-left font-semibold">Mot</th><th className="px-3 py-2.5 text-left font-semibold">Message tenté</th></tr></thead>
            <tbody>
              {(d?.refused ?? []).map((r, i) => (
                <tr key={i} className="border-b align-top" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                  <td className="px-3 py-2 whitespace-nowrap text-muted">{when(r.at)}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 font-bold">{r.user ?? "—"}</td>
                  <td className="max-w-[140px] truncate px-3 py-2">{r.creator || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><span className="v2-tag" style={RED}>{r.word}</span>{r.found && r.found !== r.word ? <span className="v2-tag ml-1" style={AMBER}>{r.found}</span> : null}</td>
                  <td className="px-3 py-2"><span className="line-clamp-2 max-w-[420px] break-words">{r.text}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d && !d.refused.length ? <p className="py-10 text-center text-[13px] text-muted">Aucun envoi bloqué.</p> : null}
      </section>
      {drop ? <Confirm title={`Retirer « ${drop.word} » de la liste ?`} text="Ce mot pourra de nouveau être envoyé aux fans depuis Bloom." button="Retirer le mot" go={() => post({ delete: drop.id }, "Mot retiré de la liste")} onClose={() => setDrop(null)} /> : null}
    </div>
  );
}

/**
 * Retirer chez MYM des messages déjà partis (outil d'incident : arnaque, compte compromis). On CHERCHE d'abord (rien
 * ne part), on relit la liste, puis on retire la sélection par paquets de 100. Texte seulement : MYM refuse de retirer
 * un message qui porte un média. Définitif.
 */
function Retire({ canAct, models, preset, onDone }: { canAct: boolean; models: TeamModel[]; preset: Preset; onDone: () => void }) {
  const [mode, setMode] = useState<"text" | "person">(preset?.person ? "person" : "text");
  const [text, setText] = useState("");
  const [person, setPerson] = useState(preset?.person ?? "");
  const [hours, setHours] = useState(48);
  const [people, setPeople] = useState<{ name: string; n: number }[]>([]);
  const [rows, setRows] = useState<Found[] | null>(preset?.rows ?? null);
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set((preset?.rows ?? []).map((r) => r.id)));
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [result, setResult] = useState<{ done: number; failed: { id: string; error: string }[]; running: boolean } | null>(null);
  const stop = useRef(false);
  useEffect(() => {
    if (!canAct) return;
    api<{ chatters: { name: string; n: number }[] }>("GET", "/api/mym/mod/chatters").then((r) => setPeople(r.chatters)).catch(() => {});
  }, [canAct]);
  if (!canAct) return <div className="v2-card v2-rise mt-4 p-8 text-center text-[13.5px] text-muted">Le retrait de messages est réservé aux admins et managers.</div>;
  const find = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api<{ rows: Found[]; more: boolean }>("POST", "/api/mym/mod/find", mode === "text" ? { text } : { chatter: person, hours });
      setRows(r.rows);
      setMore(r.more);
      setPicked(new Set(r.rows.map((x) => x.id)));
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy(false);
  };
  const run = async () => {
    const ids = [...picked];
    stop.current = false;
    setBusy(true);
    let done = 0;
    const failed: { id: string; error: string }[] = [];
    setResult({ done, failed, running: true });
    try {
      for (let i = 0; i < ids.length && !stop.current; i += 100) {
        const r = await api<{ done: number; failed: { id: string; error: string }[] }>("POST", "/api/mym/mod/retire", { ids: ids.slice(i, i + 100), confirm: true, reason: mode === "person" ? `messages de ${person}` : "texte recherché" });
        done += r.done;
        failed.push(...r.failed);
        setResult({ done, failed: [...failed], running: true });
      }
    } catch (e) {
      toast(errText(e), "err");
    }
    setResult({ done, failed, running: false });
    setRows(null);
    setPicked(new Set());
    setBusy(false);
    onDone();
  };
  const toggle = (id: string) => setPicked((s) => {
    const x = new Set(s);
    if (x.has(id)) x.delete(id);
    else x.add(id);
    return x;
  });
  return (
    <div className="mt-4 max-w-[980px] space-y-3">
      <p className="v2-rise rounded-[12px] border px-4 py-3 text-[12.5px] leading-relaxed" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)" }}>
        <b style={{ color: "var(--v2-down)" }}>Outil d’incident (arnaque, compte compromis).</b> La suppression est immédiate et définitive côté MYM. Les messages avec média ne peuvent pas être retirés (MYM le refuse). Rien ne part sans toi : la recherche ne fait que VÉRIFIER. Relis la liste, ajuste les cases, puis retire la sélection.
      </p>
      <section className="v2-card v2-rise p-4">
        <p className="text-[12px] text-muted">Recherche dans les comptes MYM reliés : {models.map((m) => m.name).join(", ") || "aucun"}.</p>
        <div className="v2-segbar mt-3">
          <button type="button" className="v2-seg" data-on={mode === "text"} onClick={() => (setMode("text"), setRows(null))}>Un texte précis</button>
          <button type="button" className="v2-seg" data-on={mode === "person"} onClick={() => (setMode("person"), setRows(null))}>Tout ce qu’une personne a envoyé</button>
        </div>
        {mode === "text" ? (
          <>
            <label className="v2-label mt-3" htmlFor="rt-text">Texte du message à retrouver</label>
            <textarea id="rt-text" value={text} rows={4} onChange={(e) => setText(e.target.value)} placeholder="Colle le message tel qu’il a été envoyé (les retours à la ligne et les majuscules sont tolérés)…" className="v2-field" style={{ height: "auto", paddingTop: 8, paddingBottom: 8, resize: "vertical" }} />
            <p className="mt-1.5 text-[12px] text-muted">Cherche dans les messages texte envoyés aux fans sur les 48 dernières heures (depuis Bloom ou non) : tous ceux qui contiennent ce texte.</p>
          </>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
              <div>
                <label className="v2-label" htmlFor="rt-who">Personne</label>
                <select id="rt-who" value={person} onChange={(e) => setPerson(e.target.value)} className="v2-field" style={{ colorScheme: "dark" }}>
                  <option value="" style={{ background: "#121215" }}>Choisir une personne de l’équipe…</option>
                  {[...new Set([...(person ? [person] : []), ...people.map((p) => p.name)])].map((n) => <option key={n} value={n} style={{ background: "#121215" }}>{n}{people.find((p) => p.name === n) ? ` (${int(people.find((p) => p.name === n)!.n)} messages sur 30 j)` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="v2-label" htmlFor="rt-hours">Période</label>
                <select id="rt-hours" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="v2-field" style={{ colorScheme: "dark" }}>{[[24, "24 heures"], [48, "48 heures"], [168, "7 jours"], [720, "30 jours"]].map(([h, l]) => <option key={h} value={h} style={{ background: "#121215" }}>{l}</option>)}</select>
              </div>
            </div>
            <p className="mt-1.5 text-[12px] text-muted">Seuls les messages qu’elle a envoyés depuis Bloom sont concernés : Bloom ne sait pas qui a écrit les autres.</p>
          </>
        )}
        <button type="button" onClick={() => void find()} disabled={busy || (mode === "text" ? text.trim().length < 4 : !person)} className="v2-btn mt-3" style={{ height: 36 }}>{busy && !result?.running ? "Recherche…" : "Chercher (rien n’est retiré)"}</button>
      </section>
      {result ? (
        <p className="rounded-[12px] border px-4 py-3 text-[13px]" style={{ borderColor: "var(--color-line)" }}>
          {plural(result.done, "message")} retiré{result.done > 1 ? "s" : ""} chez MYM.{result.failed.length ? ` ${plural(result.failed.length, "refus", "refus")} : ${result.failed[0].error}.` : ""}{result.running ? " En cours…" : ""}
          {result.running ? <button type="button" onClick={() => (stop.current = true)} className="ml-3 font-semibold underline underline-offset-2">Arrêter</button> : null}
        </p>
      ) : null}
      {rows ? (
        <section className="v2-card v2-rise p-3">
          <div className="flex flex-wrap items-center gap-2 px-1">
            <p className="v2-card-title min-w-0 flex-1">{plural(rows.length, "message trouvé", "messages trouvés")}{more ? " (les 1 000 premiers)" : ""}</p>
            <button type="button" onClick={() => setPicked(new Set(rows.map((r) => r.id)))} className="v2-tool">Tout cocher</button>
            <button type="button" onClick={() => setPicked(new Set())} className="v2-tool">Tout décocher</button>
            <button type="button" onClick={() => setAsk(true)} disabled={busy || !picked.size} className="v2-btn" data-kind="danger" style={{ height: 34 }}>Retirer la sélection ({int(picked.size)})</button>
          </div>
          <div className="v2-scroll mt-2 max-h-[460px] space-y-1 overflow-y-auto pr-1">
            {rows.map((r) => {
              const on = picked.has(r.id);
              return (
                <label key={r.id} className="flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2" style={{ borderColor: on ? "rgb(244 63 94 / 0.4)" : "var(--color-line)" }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(r.id)} className="mt-1 size-3.5 accent-(--v2-down)" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted">{when(r.at)} · {r.creator} · <WhoTag w={r.sender} pf="mym" /> → {r.fan ?? "fan"}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-relaxed break-words whitespace-pre-wrap">{r.text}</span>
                  </span>
                </label>
              );
            })}
            {!rows.length ? <p className="py-8 text-center text-[13px] text-muted">Aucun message texte ne correspond.</p> : null}
          </div>
        </section>
      ) : null}
      {ask ? <Confirm title={`Retirer ${plural(picked.size, "message")} ?`} text="Ils seront supprimés chez les fans, sur MYM, tout de suite. C’est définitif : impossible de les remettre." button="Retirer définitivement" go={async () => void run()} onClose={() => setAsk(false)} /> : null}
    </div>
  );
}
