"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Download, Folder, GitBranch, ImagePlus, ListOrdered, Pause, Pencil, Play, Plus, Search, Share2, Smile, StickyNote, Trash2, Upload, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { useT } from "@/lib/i18n";
import type { Pf } from "@/lib/platform";
import type { Media } from "@/lib/types";
import { Avatar } from "@/rv/components/ui";
import { CloudPicker } from "@/app/app/mym/MymScripts";
import { AiAnalytics } from "@/app/app/scripts/AiAnalytics";
import { AiScripts } from "@/app/app/scripts/AiScripts";
import { QUICK } from "@/app/pro/emojis";
import { VaultProPicker } from "@/app/pro/VaultProPicker";
import { cash, downloadCsv, int, Layer, Modal, PALETTE, pct, Ring, Switch } from "../kit";

// Bloom v2 → Scripts : le MÊME écran pour OnlyFans et MYM (25/11/2026, « Constellation »). Il remplace, dans la v2, la
// copie d'Infloww (Scripts : Tag / Sequence) et celle de MyPulse (MymScripts). La bibliothèque est commune
// (app/library.mjs) : par modèle, des SCRIPTS qui sont soit une séquence (messages dans l'ordre), soit un dossier
// (messages prêts, envoyés quand on veut), chacun avec ses messages. Lecture : `GET /api/v2/scripts` ; écriture : les
// routes « /api/lib/… ». Encore à l'ancien affichage, posés tels quels : le choix des médias (vault OnlyFans, MYM
// Cloud) et les scripts de l'IA de Substy.
type Item = {
  id: number; name: string; text: string; note: string | null; price: number; medias: Media[]; groupId: number; tags: number[]; cond: "" | "bought" | "not_bought"; creatorTags: string[];
  uses: number; fans: number; ppvSent: number; sales: number; revenue: number; currency: string | null;
};
type Group = { id: number; kind: "tag" | "sequence"; name: string; position: number; descr: string | null; active: boolean; threshold: number | null; updatedAt: number; items: Item[] };
type ModelRow = { id: string; name: string; avatar: string | null; scripts: number; messages: number };
type Data = { platform: "of" | "mym"; currency: string; list: ModelRow[]; canEdit: boolean; model: { id: string; name: string; avatar: string | null } | null; groups: Group[]; onSubsty: boolean };
type View = "lib" | "perf" | "ai";
type Filter = "all" | "sequence" | "tag" | "off";
type Win =
  | null
  | { kind: "script"; group: Group | null }
  | { kind: "message"; group: Group; item: Item | null }
  | { kind: "clone"; group: Group }
  | { kind: "share"; item: Item }
  | { kind: "import" }
  | { kind: "confirm"; title: string; text: string; button: string; go: () => Promise<unknown> };

const KIND = { sequence: { label: "Séquence", many: "Séquences", hint: "Les messages s’envoient dans cet ordre : le chat reprend là où en est chaque fan.", Icon: ListOrdered }, tag: { label: "Dossier", many: "Dossiers", hint: "Des messages prêts à l’emploi : l’équipe choisit lequel envoyer, sans ordre imposé.", Icon: Folder } } as const;
const COND = { "": "Toujours", bought: "Seulement si le précédent est acheté", not_bought: "Seulement si le précédent n’est pas acheté" } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${int(n)} ${n > 1 ? many : one}`;
const message = (e: unknown) => (e instanceof Error ? e.message : "Action impossible");

/** Le texte d'un message, avec le prénom du fan mis en avant ({name}, {prenom}, {prénom}). */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\{\s*(?:name|pr[ée]nom)\s*\})/gi);
  return <>{parts.map((p, i) => (/^\{/.test(p) ? <span key={i} className="rounded px-1 font-semibold" style={{ background: "rgb(59 130 246 / 0.18)", color: "var(--v2-sky)" }}>prénom du fan</span> : p))}</>;
}

/** Vignettes des médias d'un message ; une note vocale se lit sur place. */
function Thumbs({ medias }: { medias: Media[] }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  if (!medias.length) return null;
  const play = (m: Media) => {
    if (playing === m.id) return audio.current?.pause(), setPlaying(null);
    audio.current?.pause();
    if (!m.full) return toast("Écoute indisponible pour ce média", "err");
    audio.current = new Audio(m.full);
    audio.current.onended = () => setPlaying(null);
    audio.current.play().then(() => setPlaying(m.id)).catch(() => toast("Écoute impossible", "err"));
  };
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {medias.slice(0, 8).map((m) =>
        /audio/i.test(m.type) ? (
          <button key={m.id} onClick={() => play(m)} className="flex h-14 items-center gap-2 rounded-lg border px-3 text-[12px]" style={{ borderColor: "var(--color-line)" }}>
            {playing === m.id ? <Pause className="size-4" /> : <Play className="size-4" />} {m.duration ? `${Math.round(m.duration)} s` : "Vocal"}
          </button>
        ) : (
          <span key={m.id} className="relative size-14 overflow-hidden rounded-lg" style={{ background: "var(--color-card-2)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {m.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : null}
            {/video/i.test(m.type) ? <Play className="absolute inset-0 m-auto size-4 text-white drop-shadow" /> : null}
          </span>
        ),
      )}
      {medias.length > 8 ? <span className="grid size-14 place-items-center rounded-lg text-[12px] text-muted" style={{ background: "var(--color-card-2)" }}>+{medias.length - 8}</span> : null}
    </div>
  );
}

/** `pf` = la plateforme affichée par cet onglet (envoyée au serveur : le cookie du menu est commun aux onglets). */
export function V2Scripts({ pf }: { pf: Pf }) {
  const modelKey = `bloom.v2.scripts.model.${pf}`;
  const [model, setModel] = useState(() => {
    try {
      return localStorage.getItem(modelKey) || "";
    } catch {
      return "";
    }
  });
  const [view, setView] = useState<View>("lib");
  const [data, setData] = useState<{ key: string; s: Data } | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [win, setWin] = useState<Win>(null);
  const seq = useRef(0);
  const load = useCallback(() => {
    const id = ++seq.current;
    return api<Data>("GET", `/api/v2/scripts?pf=${pf}${model ? `&creatorId=${encodeURIComponent(model)}` : ""}`)
      .then((s) => void (id === seq.current && (setData({ key: model, s }), setErr(""))))
      .catch((e) => void (id === seq.current && setErr(message(e))));
  }, [pf, model]);
  useEffect(() => void load(), [load]);
  const pickModel = (id: string) => {
    setModel(id);
    setSel(null);
    setQ("");
    setFilter("all");
    try {
      localStorage.setItem(modelKey, id);
    } catch {}
  };

  const s = data?.s ?? null;
  const m = s?.model ?? null;
  const mid = m?.id ?? "";
  const stale = !!data && data.key !== model;
  const cur = s?.currency ?? (pf === "mym" ? "EUR" : "USD");
  const sym = cur === "USD" ? "$" : "€";
  const pfName = pf === "mym" ? "MYM" : "OnlyFans";
  const canEdit = !!s?.canEdit;
  const groups = useMemo(() => (m && s ? s.groups : []), [m, s]);
  const price = (p: number) => cash(Math.round(p * 100), cur);
  const colorOf = (id: string) => PALETTE[Math.max(0, (s?.list ?? []).findIndex((x) => x.id === id)) % PALETTE.length];
  const count = (f: Filter) => groups.filter((g) => (f === "all" ? true : f === "off" ? !g.active : g.kind === f)).length;
  const shown = useMemo(() => {
    const word = q.trim().toLowerCase();
    return groups.filter((g) => (filter === "all" ? true : filter === "off" ? !g.active : g.kind === filter) && (!word || g.name.toLowerCase().includes(word) || g.items.some((i) => `${i.name} ${i.text}`.toLowerCase().includes(word))));
  }, [groups, filter, q]);
  const cur0 = shown.find((g) => g.id === sel) ?? shown[0] ?? null;

  /** Une écriture : on envoie, on dit ce qui s'est passé, on relit. */
  const post = async <T,>(path: string, body: unknown, ok?: string): Promise<T | null> => {
    try {
      const r = await api<T>("POST", path, body);
      if (ok) toast(ok);
      await load();
      return r;
    } catch (e) {
      toast(message(e), "err");
      return null;
    }
  };
  const moveGroup = (g: Group, by: -1 | 1) => {
    const ids = groups.filter((x) => x.kind === g.kind).map((x) => x.id);
    const i = ids.indexOf(g.id);
    if (i + by < 0 || i + by >= ids.length) return;
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    void post("/api/lib/group/order", { creatorId: mid, ids });
  };
  const moveItem = (g: Group, it: Item, by: -1 | 1) => {
    const ids = g.items.filter((i) => i.groupId === g.id).map((i) => i.id);
    const i = ids.indexOf(it.id);
    if (i < 0 || i + by < 0 || i + by >= ids.length) return;
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    void post("/api/lib/item/order", { groupId: g.id, ids });
  };
  const exportCsv = () => {
    if (!m) return;
    const rows = groups.flatMap((g) => g.items.filter((i) => i.groupId === g.id).map((i) => [g.name, i.text, i.medias.map((x) => x.id).join(","), String(i.price || 0), i.name]));
    downloadCsv(`bloom-scripts-${m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "modele"}.csv`, ["Script", "Message", "Media", "Price", "Title"], rows);
  };
  const others = (s?.list ?? []).filter((x) => x.id !== mid);

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Chatting · {pfName}</p>
          <h1 className="v2-h1 mt-1">Scripts</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <div className="v2-segbar">
            <button className="v2-seg" data-on={view === "lib"} onClick={() => setView("lib")}>Bibliothèque</button>
            <button className="v2-seg" data-on={view === "perf"} onClick={() => setView("perf")} title="Ce que chaque message a été envoyé, acheté et a rapporté">Performances</button>
            {s?.onSubsty ? <button className="v2-seg" data-on={view === "ai"} onClick={() => setView("ai")} title="Les scripts que l’IA de Substy déroule toute seule">IA Substy</button> : null}
          </div>
          {m && groups.length ? <button onClick={exportCsv} className="v2-select" title="Télécharger tous les scripts de cette modèle (fichier pour Excel, réimportable)"><Download className="size-4 text-muted" />Exporter</button> : null}
          {m && canEdit ? <button onClick={() => setWin({ kind: "import" })} className="v2-select" title="Importer des scripts depuis un fichier CSV (export de Bloom ou de MyPulse)"><Upload className="size-4 text-muted" />Importer</button> : null}
          {m && canEdit ? <button onClick={() => setWin({ kind: "script", group: null })} className="v2-btn" style={{ height: 36 }}><Plus className="size-4" />Nouveau script</button> : null}
        </div>
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* La colonne des modèles */}
        <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 1 }}>
          <div className="v2-card p-1.5">
            <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Modèles</p>
            <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:max-h-[calc(100dvh-200px)] lg:space-y-0.5 lg:overflow-y-auto">
              {(s?.list ?? []).map((x) => (
                <button key={x.id} onClick={() => pickModel(x.id)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={mid === x.id} aria-pressed={mid === x.id} title={`Voir les scripts de ${x.name}`}>
                  <Ring color={colorOf(x.id)}><Avatar src={x.avatar} name={x.name} size="size-8" /></Ring>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] leading-tight">{x.name}</b>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted">{x.scripts ? `${plural(x.scripts, "script")} · ${plural(x.messages, "message")}` : "aucun script"}</span>
                  </span>
                </button>
              ))}
              {s && !s.list.length ? <p className="px-2 py-3 text-[12.5px] text-muted">Aucune modèle {pfName}.</p> : null}
              {!s ? <p className="px-2 py-3 text-[12.5px] text-muted">Chargement…</p> : null}
            </div>
          </div>
        </aside>

        <div className="min-w-0" style={{ opacity: stale ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
          {s && !m ? <div className="v2-card v2-rise p-8 text-center text-[13.5px] text-muted">Aucune modèle {pfName} pour l’instant.</div> : null}
          {!s && !err ? <div className="v2-card p-8 text-center text-[13.5px] text-muted">Chargement…</div> : null}

          {s && m && view === "lib" ? (
            !groups.length ? (
              <div className="v2-card v2-rise p-8 text-center">
                <p className="text-[15px] font-bold">Aucun script pour {m.name}</p>
                <p className="mx-auto mt-2 max-w-[560px] text-[13px] text-muted">Un script, c’est une suite de messages écrits une fois (accroche, relance, vente…) que l’équipe envoie ensuite depuis la messagerie. Une <b>séquence</b> se déroule dans l’ordre, fan par fan ; un <b>dossier</b> range des messages prêts à l’emploi.</p>
                {canEdit ? <p className="mt-4 flex flex-wrap justify-center gap-2"><button onClick={() => setWin({ kind: "script", group: null })} className="v2-btn"><Plus className="size-4" />Créer le premier script</button><button onClick={() => setWin({ kind: "import" })} className="v2-btn" data-kind="ghost"><Upload className="size-4" />Importer un fichier</button></p> : null}
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                {/* Les scripts de la modèle */}
                <section className="v2-card v2-rise min-w-0 p-2 xl:sticky xl:top-4 xl:self-start" style={{ ["--i" as string]: 2 }}>
                  <label className="flex h-9 items-center gap-2 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)" }}><Search className="size-3.5 shrink-0 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un script ou un message" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#5d5d66]" /></label>
                  <div className="v2-noscroll mt-2 flex gap-1 overflow-x-auto">
                    {([["all", "Tous"], ["sequence", "Séquences"], ["tag", "Dossiers"], ["off", "Inactifs"]] as [Filter, string][]).filter(([k]) => k !== "off" || count("off") > 0).map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className="v2-chip" data-on={filter === k}>{l}<b>{count(k)}</b></button>)}
                  </div>
                  <div className="v2-scroll mt-2 space-y-0.5 xl:max-h-[calc(100dvh-290px)] xl:overflow-y-auto">
                    {shown.map((g) => {
                      const K = KIND[g.kind];
                      const paid = g.items.filter((i) => i.price > 0);
                      return (
                        <div key={g.id} className="group flex items-center rounded-[10px]" data-on={cur0?.id === g.id} style={cur0?.id === g.id ? { background: "rgb(59 130 246 / 0.13)", boxShadow: "inset 2px 0 0 var(--v2-blue)" } : undefined}>
                          <button onClick={() => setSel(g.id)} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left" style={{ opacity: g.active ? 1 : 0.55 }}>
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ borderColor: "var(--color-line)", color: g.kind === "sequence" ? "var(--v2-sky)" : "#c4b5fd" }}><K.Icon className="size-4" /></span>
                            <span className="min-w-0 flex-1">
                              <b className="block truncate text-[13px] leading-tight">{g.name}</b>
                              <span className="mt-0.5 block truncate text-[11.5px] text-muted">{K.label} · {plural(g.items.length, "message")}{paid.length ? ` · ${price(paid.reduce((a, i) => a + i.price, 0))}` : ""}{g.active ? "" : " · inactif"}</span>
                            </span>
                          </button>
                          {canEdit && filter !== "off" && !q ? (
                            <span className="hidden shrink-0 flex-col pr-1 text-muted group-hover:flex">
                              <button onClick={() => moveGroup(g, -1)} title="Monter dans la liste" className="hover:text-(--color-fg)"><ArrowUp className="size-3.5" /></button>
                              <button onClick={() => moveGroup(g, 1)} title="Descendre dans la liste" className="hover:text-(--color-fg)"><ArrowDown className="size-3.5" /></button>
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                    {!shown.length ? <p className="px-2 py-6 text-center text-[12.5px] text-muted">Aucun script ne correspond.</p> : null}
                  </div>
                </section>

                {/* Le script choisi et ses messages */}
                {cur0 ? <ScriptView key={cur0.id} g={cur0} groups={groups} canEdit={canEdit} price={price} cur={cur} setWin={setWin} post={post} moveItem={moveItem} afterDelete={() => setSel(null)} /> : <div className="v2-card p-8 text-center text-[13px] text-muted">Choisis un script dans la liste.</div>}
              </div>
            )
          ) : null}

          {s && m && view === "perf" ? <Perf groups={groups} cur={cur} price={price} /> : null}
          {s && m && view === "ai" ? <AiView creatorId={m.id} name={m.name} /> : null}
        </div>
      </div>

      {win?.kind === "script" && m ? <ScriptForm creatorId={m.id} group={win.group} onClose={() => setWin(null)} onDone={(id) => (setWin(null), setFilter("all"), setQ(""), setSel(id), void load())} /> : null}
      {win?.kind === "message" && m ? <MessageForm pf={pf} creatorId={m.id} sym={sym} group={win.group} item={win.item} folders={groups.filter((g) => g.kind === "tag")} others={others} onClose={() => setWin(null)} onDone={() => (setWin(null), void load())} /> : null}
      {win?.kind === "clone" && m ? <CloneForm group={win.group} creatorId={m.id} name={m.name} others={others} onClose={() => setWin(null)} onDone={() => (setWin(null), void load())} /> : null}
      {win?.kind === "share" ? <ShareForm item={win.item} others={others} onClose={() => setWin(null)} onDone={() => (setWin(null), void load())} /> : null}
      {win?.kind === "import" && m ? <ImportForm creatorId={m.id} name={m.name} onClose={() => setWin(null)} onDone={() => (setWin(null), void load())} /> : null}
      {win?.kind === "confirm" ? <Confirm w={win} onClose={() => setWin(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- le script choisi
function ScriptView({ g, groups, canEdit, price, cur, setWin, post, moveItem, afterDelete }: {
  g: Group; groups: Group[]; canEdit: boolean; price: (p: number) => string; cur: string; setWin: (w: Win) => void;
  post: <T,>(path: string, body: unknown, ok?: string) => Promise<T | null>; moveItem: (g: Group, it: Item, by: -1 | 1) => void; afterDelete: () => void;
}) {
  const K = KIND[g.kind];
  const paid = g.items.filter((i) => i.price > 0);
  const sum = (f: (i: Item) => number) => g.items.reduce((a, i) => a + f(i), 0);
  const [sent, sales, revenue, ppv] = [sum((i) => i.uses), sum((i) => i.sales), sum((i) => i.revenue), sum((i) => i.ppvSent)];
  const tiles: [string, string, string?][] = [
    ["Messages", int(g.items.length), paid.length ? `dont ${plural(paid.length, "payant")}` : "tous gratuits"],
    ["Médias", int(sum((i) => i.medias.length))],
    ["Prix cumulé", paid.length ? price(paid.reduce((a, i) => a + i.price, 0)) : "—", paid.length ? "si le fan achète tout" : undefined],
    ["Envois", int(sent), sent ? "depuis Bloom" : "pas encore"],
    ["Achats", int(sales), ppv ? `${pct(sales, ppv)} % des payants envoyés` : undefined],
    ["Revenus", cash(revenue, cur)],
  ];
  const del = (i: Item) => setWin({ kind: "confirm", title: "Supprimer ce message ?", text: `« ${i.name || i.text.slice(0, 60)} » sera retiré du script. Ses chiffres d’envoi ne seront plus affichés.`, button: "Supprimer le message", go: () => post("/api/lib/item/delete", { id: i.id }, "Message supprimé") });
  const delGroup = () => setWin({ kind: "confirm", title: "Supprimer ce script ?", text: g.kind === "tag" ? `Le dossier « ${g.name} » sera supprimé, avec les messages qui ne sont rangés que dans celui-ci (${plural(g.items.filter((i) => i.tags.length < 2).length, "message")}).` : `La séquence « ${g.name} » et ses ${plural(g.items.length, "message")} seront supprimés.`, button: "Supprimer le script", go: () => post("/api/lib/group/delete", { id: g.id }, "Script supprimé").then(afterDelete) });
  return (
    <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 3 }}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border" style={{ borderColor: "var(--color-line)", color: g.kind === "sequence" ? "var(--v2-sky)" : "#c4b5fd" }}><K.Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2"><b className="text-[19px] leading-tight tracking-[-0.02em]">{g.name}</b><span className="v2-tag">{K.label}</span>{g.active ? null : <span className="v2-tag" style={{ color: "#fbbf24", background: "rgb(245 158 11 / 0.12)" }}>Inactif</span>}{g.threshold ? <span className="v2-tag" title="Part des messages envoyés à un fan à partir de laquelle le script compte comme déroulé pour lui">seuil {g.threshold} %</span> : null}</p>
          <p className="mt-1 text-[12.5px] text-muted">{g.descr || K.hint}</p>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="mr-1 flex items-center gap-2 text-[12px] text-muted"><Switch on={g.active} onChange={(v) => void post("/api/lib/group", { id: g.id, active: v }, v ? "Script activé : il réapparaît dans la messagerie" : "Script désactivé : il disparaît du bouton Scripts de la messagerie")} title={g.active ? "Actif : proposé dans la messagerie" : "Inactif : caché dans la messagerie"} />{g.active ? "Actif" : "Inactif"}</span>
            <button onClick={() => setWin({ kind: "script", group: g })} title="Modifier le nom, la description, le seuil" className="v2-sq" style={{ width: 32, height: 32 }}><Pencil className="size-4" /></button>
            <button onClick={() => setWin({ kind: "clone", group: g })} title="Dupliquer, ici ou chez une autre modèle" className="v2-sq" style={{ width: 32, height: 32 }}><Copy className="size-4" /></button>
            <button onClick={delGroup} title="Supprimer ce script" className="v2-sq" style={{ width: 32, height: 32 }}><Trash2 className="size-4" /></button>
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-6">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="min-w-0 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--color-line)", background: "rgb(255 255 255 / 0.02)" }}>
            <p className="truncate text-[11.5px] text-muted">{label}</p>
            <p className="v2-num mt-1 truncate text-[17px] leading-tight font-bold">{value}</p>
            {sub ? <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">{g.kind === "sequence" ? "Les messages, dans l’ordre" : "Les messages du dossier"}</p>
        {canEdit ? <button onClick={() => setWin({ kind: "message", group: g, item: null })} className="v2-btn" data-kind="ghost" style={{ height: 34 }}><Plus className="size-4" />Ajouter un message</button> : null}
      </div>
      <div className="mt-3">
        {g.items.map((i, n) => {
          const own = i.groupId === g.id;
          const also = i.tags.filter((id) => id !== g.id).map((id) => groups.find((x) => x.id === id)?.name).filter(Boolean);
          return (
            <div key={i.id} className={g.kind === "sequence" ? "relative pl-11" : ""}>
              {g.kind === "sequence" ? (
                <>
                  {n < g.items.length - 1 ? <span className="absolute top-9 bottom-0 left-[15px] w-px" style={{ background: "var(--color-line)" }} /> : null}
                  <span className="absolute top-3 left-0 grid size-8 place-items-center rounded-full text-[12.5px] font-bold text-white" style={{ background: i.cond ? "#7c3aed" : "var(--v2-blue-strong)" }} title={COND[i.cond]}>{i.cond ? <GitBranch className="size-4" /> : n + 1}</span>
                </>
              ) : null}
              <div className="mb-2.5 rounded-xl border p-3.5" style={{ borderColor: "var(--color-line)", background: "rgb(255 255 255 / 0.02)" }}>
                <div className="flex flex-wrap items-start gap-2">
                  <p className="flex min-h-7 min-w-0 flex-1 flex-wrap items-center gap-2">
                    {/^\d*$/.test(i.name.trim()) ? (g.kind === "sequence" ? null : <b className="text-[14px] text-muted">Message {n + 1}</b>) : <b className="text-[14px]">{i.name}</b>}
                    {i.price ? <span className="v2-delta" data-dir="up" title="Contenu payant">{price(i.price)}</span> : null}
                    {i.cond ? <span className="v2-tag" style={{ color: "#c4b5fd", background: "rgb(124 58 237 / 0.16)" }}>{i.cond === "bought" ? "si le précédent est acheté" : "si le précédent n’est pas acheté"}</span> : null}
                  </p>
                  {canEdit ? (
                    <span className="flex shrink-0 gap-0.5">
                      {own && g.items.length > 1 ? <><button onClick={() => moveItem(g, i, -1)} disabled={n === 0} title="Monter" className="grid size-7 place-items-center rounded-md text-muted transition disabled:opacity-25 hover:bg-white/[0.07] hover:text-(--color-fg)"><ArrowUp className="size-3.5" /></button><button onClick={() => moveItem(g, i, 1)} disabled={n === g.items.length - 1} title="Descendre" className="grid size-7 place-items-center rounded-md text-muted transition disabled:opacity-25 hover:bg-white/[0.07] hover:text-(--color-fg)"><ArrowDown className="size-3.5" /></button></> : null}
                      <button onClick={() => setWin({ kind: "message", group: g, item: i })} title="Modifier ce message" className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><Pencil className="size-3.5" /></button>
                      <button onClick={() => setWin({ kind: "share", item: i })} title="Copier ce message chez d’autres modèles" className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><Share2 className="size-3.5" /></button>
                      <button onClick={() => del(i)} title="Supprimer ce message" className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><Trash2 className="size-3.5" /></button>
                    </span>
                  ) : null}
                </div>
                {i.text ? <p className="mt-2 text-[13.5px] leading-relaxed whitespace-pre-wrap"><Rich text={i.text} /></p> : null}
                <Thumbs medias={i.medias} />
                {i.note ? <p className="mt-2.5 flex items-start gap-1.5 text-[12px]" style={{ color: "#fbbf24" }} title="Consigne pour l’équipe : jamais envoyée au fan"><StickyNote className="mt-0.5 size-3.5 shrink-0" /><span>{i.note}</span></p> : null}
                {also.length || i.creatorTags.length ? <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">{also.length ? <>aussi dans {also.map((x) => <span key={x} className="v2-tag">{x}</span>)}</> : null}{i.creatorTags.map((x) => <span key={x} className="v2-tag">@{x}</span>)}</p> : null}
                {i.uses || i.sales || i.revenue ? (
                  <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2.5 text-[11.5px] text-muted" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>
                    <span>Envoyé <b className="v2-num" style={{ color: "var(--color-fg)" }}>{int(i.uses)}</b> fois{i.fans ? ` à ${plural(i.fans, "fan")}` : ""}</span>
                    {i.price || i.sales ? <span>Acheté <b className="v2-num" style={{ color: "var(--color-fg)" }}>{int(i.sales)}</b> fois{i.ppvSent ? ` (${pct(i.sales, i.ppvSent)} %)` : ""}</span> : null}
                    {i.revenue ? <span>Rapporté <b className="v2-num" style={{ color: "var(--color-fg)" }}>{cash(i.revenue, cur)}</b></span> : null}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
        {!g.items.length ? <p className="rounded-xl border border-dashed py-8 text-center text-[13px] text-muted" style={{ borderColor: "var(--color-line)" }}>Pas encore de message dans ce script.{canEdit ? " Commence par le premier." : ""}</p> : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- performances
function Perf({ groups, cur, price }: { groups: Group[]; cur: string; price: (p: number) => string }) {
  const rows = [...new Map(groups.flatMap((g) => g.items.filter((i) => i.uses && i.groupId === g.id).map((i) => [i.id, { g, i }] as const))).values()].sort((a, b) => b.i.revenue - a.i.revenue || b.i.uses - a.i.uses);
  const sum = (f: (i: Item) => number) => rows.reduce((a, r) => a + f(r.i), 0);
  const [sent, sales, revenue, ppv] = [sum((i) => i.uses), sum((i) => i.sales), sum((i) => i.revenue), sum((i) => i.ppvSent)];
  const tiles: [string, string][] = [["Messages utilisés", int(rows.length)], ["Envois", int(sent)], ["Achats", int(sales)], ["Revenus", cash(revenue, cur)], ["Payants achetés", ppv ? `${pct(sales, ppv)} %` : "—"], ["Revenu par envoi", sent ? cash(revenue / sent, cur) : "—"]];
  return (
    <section className="v2-card v2-rise min-w-0 p-4" style={{ ["--i" as string]: 2 }}>
      <p className="v2-card-title">Performances des messages</p>
      <p className="mt-0.5 text-[11.5px] text-muted">Les envois faits depuis la messagerie de Bloom et les achats qui ont suivi, depuis que Bloom les enregistre.</p>
      {rows.length ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-6">
            {tiles.map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--color-line)", background: "rgb(255 255 255 / 0.02)" }}>
                <p className="truncate text-[11.5px] text-muted">{label}</p>
                <p className="v2-num mt-1 truncate text-[17px] leading-tight font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div className="v2-scroll mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] tracking-[0.1em] text-muted uppercase">
                  <th className="py-2 font-semibold">Message</th><th className="py-2 font-semibold">Script</th>{["Prix", "Envois", "Fans", "Achats", "Taux d’achat", "Revenus"].map((h) => <th key={h} className="py-2 pl-4 text-right font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map(({ g, i }) => (
                  <tr key={i.id} className="border-t" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                    <td className="py-2.5 pr-3"><b className="block max-w-[280px] truncate text-[13.5px]">{i.name || i.text.slice(0, 40)}</b>{i.medias.length ? <span className="text-[11.5px] text-muted">{plural(i.medias.length, "média")}</span> : null}</td>
                    <td className="py-2.5 pr-3"><span className="v2-tag">{g.name}</span></td>
                    <td className="v2-num py-2.5 pl-4 text-right">{i.price ? price(i.price) : "—"}</td>
                    <td className="v2-num py-2.5 pl-4 text-right">{int(i.uses)}</td>
                    <td className="v2-num py-2.5 pl-4 text-right">{int(i.fans)}</td>
                    <td className="v2-num py-2.5 pl-4 text-right">{int(i.sales)}</td>
                    <td className="v2-num py-2.5 pl-4 text-right">{i.ppvSent ? `${pct(i.sales, i.ppvSent)} %` : "—"}</td>
                    <td className="v2-num py-2.5 pl-4 text-right font-bold">{cash(i.revenue, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="py-10 text-center text-[13px] text-muted">Aucun message de ces scripts n’a encore été envoyé depuis la messagerie de Bloom.</p>}
    </section>
  );
}

// ---------------------------------------------------------------- scripts de l'IA de Substy (composants d'avant, posés tels quels)
function AiView({ creatorId, name }: { creatorId: string; name: string }) {
  const { t } = useT();
  const { creators, creatorId: chosen, setCreator, loaded } = useCreators();
  const [tab, setTab] = useState<"scripts" | "stats">("scripts");
  const known = creators.some((c) => c.id === creatorId);
  // Ces deux composants lisent la modèle « en cours » du reste de Bloom : on la met sur celle de l'écran.
  useEffect(() => {
    if (known && chosen !== creatorId) setCreator(creatorId);
  }, [known, chosen, creatorId, setCreator]);
  return (
    <section className="v2-card v2-rise min-w-0 overflow-hidden" style={{ ["--i" as string]: 2 }}>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
        <div className="min-w-0 flex-1">
          <p className="v2-card-title">Scripts de l’IA de Substy · {name}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">Ce que l’IA déroule toute seule dans les conversations. Affichage d’avant, en attendant sa refonte.</p>
        </div>
        <div className="v2-segbar">
          <button className="v2-seg" data-on={tab === "scripts"} onClick={() => setTab("scripts")}>Scripts</button>
          <button className="v2-seg" data-on={tab === "stats"} onClick={() => setTab("stats")}>Chiffres</button>
        </div>
      </div>
      {!loaded ? <p className="p-8 text-center text-[13px] text-muted">Chargement…</p> : !known ? <p className="p-8 text-center text-[13px] text-muted">Pour voir les scripts de l’IA de {name}, choisis d’abord sa plateforme en haut du menu.</p> : chosen !== creatorId ? <p className="p-8 text-center text-[13px] text-muted">Chargement…</p> : (
        // Leurs fenêtres se placent en position fixe : ce cadre (hauteur de l'écran, « transform ») les garde en vue.
        <div className="v2-scroll overflow-y-auto" style={{ height: "calc(100dvh - 250px)", minHeight: 420, transform: "translateZ(0)" }}>
          {tab === "scripts" ? <AiScripts t={t} /> : <AiAnalytics t={t} />}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- fenêtres
function Confirm({ w, onClose }: { w: Extract<Win, { kind: "confirm" }>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={w.title} onClose={onClose}>
      <p className="text-[13px] leading-relaxed text-muted">{w.text}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button disabled={busy} onClick={() => (setBusy(true), void w.go().finally(onClose))} className="v2-btn" data-kind="danger">{busy ? "Suppression…" : w.button}</button>
      </div>
    </Modal>
  );
}

/** Créer un script, ou modifier son nom, sa description et son seuil. */
function ScriptForm({ creatorId, group, onClose, onDone }: { creatorId: string; group: Group | null; onClose: () => void; onDone: (id: number) => void }) {
  const [v, setV] = useState({ name: group?.name ?? "", descr: group?.descr ?? "", kind: (group?.kind ?? "sequence") as Group["kind"], threshold: group?.threshold ? String(group.threshold) : "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ id: number }>("POST", "/api/lib/group", { id: group?.id, creatorId, kind: v.kind, name: v.name, descr: v.descr, threshold: v.threshold });
      toast(group ? "Script modifié" : "Script créé : ajoute maintenant ses messages");
      onDone(r.id);
    } catch (e) {
      setErr(message(e));
    }
    setBusy(false);
  };
  return (
    <Modal sticky title={group ? "Modifier le script" : "Nouveau script"} sub="Le nom est celui que l’équipe voit dans le bouton Scripts de la messagerie." onClose={onClose}>
      <label className="v2-label" htmlFor="sc-name">Nom du script</label>
      <input id="sc-name" autoFocus value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && v.name.trim() && !busy && void save()} placeholder="Ex : Découverte du fan" className="v2-field" />
      <label className="v2-label mt-3" htmlFor="sc-descr">Description pour l’équipe <span className="font-normal">(facultatif)</span></label>
      <textarea id="sc-descr" value={v.descr} maxLength={1000} rows={2} onChange={(e) => setV({ ...v, descr: e.target.value })} placeholder="Quand l’utiliser, pour quel fan, ce qu’il vend…" className="v2-field" style={{ height: "auto", paddingTop: 8, paddingBottom: 8 }} />
      <p className="v2-label mt-3">Façon de l’envoyer{group ? <span className="font-normal"> (ne se change plus une fois le script créé)</span> : null}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["sequence", "tag"] as const).map((k) => {
          const K = KIND[k];
          const on = v.kind === k;
          return (
            <button key={k} type="button" disabled={!!group} onClick={() => setV({ ...v, kind: k })} aria-pressed={on} className="rounded-xl border p-3 text-left disabled:cursor-default" style={{ borderColor: on ? "var(--v2-blue)" : "var(--color-line)", background: on ? "rgb(59 130 246 / 0.1)" : undefined, opacity: group && !on ? 0.4 : 1 }}>
              <span className="flex items-center gap-2 text-[13.5px] font-bold"><K.Icon className="size-4" style={{ color: k === "sequence" ? "var(--v2-sky)" : "#c4b5fd" }} />{K.label}</span>
              <span className="mt-1 block text-[11.5px] leading-snug text-muted">{K.hint}</span>
            </button>
          );
        })}
      </div>
      <label className="v2-label mt-3" htmlFor="sc-th">Seuil « utilisé », en % <span className="font-normal">(facultatif)</span></label>
      <input id="sc-th" value={v.threshold} onChange={(e) => setV({ ...v, threshold: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" placeholder="60" className="v2-field" style={{ width: 120 }} />
      <p className="mt-1 text-[11.5px] text-muted">Part des messages envoyés à un fan à partir de laquelle le script compte comme déroulé pour lui. Gardé pour information.</p>
      {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button onClick={save} disabled={busy || !v.name.trim()} className="v2-btn">{busy ? "Enregistrement…" : group ? "Enregistrer" : "Créer le script"}</button>
      </div>
    </Modal>
  );
}

/** Écrire ou modifier un message d'un script : texte, prix, médias, consigne. */
function MessageForm({ pf, creatorId, sym, group, item, folders, others, onClose, onDone }: { pf: Pf; creatorId: string; sym: string; group: Group; item: Item | null; folders: Group[]; others: ModelRow[]; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const [v, setV] = useState({ name: item?.name ?? "", text: item?.text ?? "", note: item?.note ?? "", paid: (item?.price ?? 0) > 0, price: item?.price ? String(item.price) : "", cond: item?.cond ?? "", tags: item?.tags?.length ? item.tags : [group.id], creatorTags: item?.creatorTags ?? [] });
  const [medias, setMedias] = useState<Media[]>(item?.medias ?? []);
  const [vault, setVault] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [shareTo, setShareTo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  const mym = pf === "mym";
  const insert = (x: string) => {
    const el = ta.current;
    const a = el?.selectionStart ?? v.text.length;
    const b = el?.selectionEnd ?? v.text.length;
    setV({ ...v, text: v.text.slice(0, a) + x + v.text.slice(b) });
    requestAnimationFrame(() => el?.focus());
  };
  const amount = Number(v.price.replace(",", ".")) || 0;
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ id: number }>("POST", "/api/lib/item", { id: item?.id, groupId: group.id, name: v.name, text: v.text, note: v.note, price: v.paid ? amount : 0, medias, cond: group.kind === "sequence" ? v.cond : "", tags: group.kind === "tag" ? v.tags : undefined, creatorTags: v.creatorTags });
      if (!item && shareTo.length) await api("POST", "/api/lib/item/share", { id: r.id, toCreatorIds: shareTo });
      toast(item ? "Message modifié" : "Message ajouté");
      onDone();
    } catch (e) {
      setErr(message(e));
    }
    setBusy(false);
  };
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <>
      <Modal wide sticky title={item ? "Modifier le message" : "Nouveau message"} sub={`Dans « ${group.name} » (${KIND[group.kind].label.toLowerCase()}).`} onClose={onClose}>
        <label className="v2-label" htmlFor="ms-name">Titre <span className="font-normal">(repère pour l’équipe, jamais envoyé au fan)</span></label>
        <input id="ms-name" autoFocus value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ex : Accroche, Relance du soir, Vidéo 12 $" className="v2-field" />

        <div className="mt-3 flex items-end justify-between gap-2">
          <label className="v2-label" htmlFor="ms-text" style={{ marginBottom: 0 }}>Message</label>
          <span className="relative flex items-center gap-1.5">
            <button type="button" onClick={() => insert("{prénom}")} className="v2-seg border" style={{ borderColor: "var(--color-line)" }} title="Sera remplacé par le prénom du fan à l’envoi">+ prénom du fan</button>
            <button type="button" onClick={() => setEmoji(!emoji)} className="v2-sq" style={{ width: 28, height: 28 }} title="Émojis" aria-expanded={emoji}><Smile className="size-3.5" /></button>
            {emoji ? <span className="v2-menu right-0 grid w-[288px] grid-cols-8 gap-1" style={{ top: "calc(100% + 6px)" }}>{QUICK.map((e) => <button key={e} type="button" onClick={() => (insert(e), setEmoji(false))} className="rounded text-[18px] hover:bg-white/10">{e}</button>)}</span> : null}
          </span>
        </div>
        <textarea id="ms-text" ref={ta} value={v.text} maxLength={5000} rows={5} onChange={(e) => setV({ ...v, text: e.target.value })} placeholder="Ce que le fan lira…" className="v2-field mt-1.5" style={{ height: "auto", paddingTop: 8, paddingBottom: 8, resize: "vertical" }} />
        <p className="mt-1 flex justify-between text-[11.5px] text-muted"><span>« {"{prénom}"} » est remplacé par le prénom du fan.</span><span className="v2-num">{v.text.length} / 5000</span></p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="v2-label">Prix</p>
            <div className="flex items-center gap-2">
              <div className="v2-segbar">
                <button type="button" className="v2-seg" data-on={!v.paid} onClick={() => setV({ ...v, paid: false })}>Gratuit</button>
                <button type="button" className="v2-seg" data-on={v.paid} onClick={() => setV({ ...v, paid: true })}>Payant</button>
              </div>
              <label className="flex h-[34px] items-center gap-1.5 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)", opacity: v.paid ? 1 : 0.4 }}><input disabled={!v.paid} value={v.price} onChange={(e) => setV({ ...v, price: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="0" className="w-16 bg-transparent text-right text-[13px] outline-none" aria-label="Prix" /><span className="text-[12.5px] text-muted">{sym}</span></label>
            </div>
            <p className="mt-1 text-[11.5px]" style={{ color: v.paid && (!medias.length || amount < 3) ? "#fbbf24" : "var(--color-muted)" }}>Payant : avec au moins un média, 3 {sym} au minimum.</p>
          </div>
          {group.kind === "sequence" ? (
            <div>
              <label className="v2-label" htmlFor="ms-cond">Quand l’envoyer</label>
              <select id="ms-cond" value={v.cond} onChange={(e) => setV({ ...v, cond: e.target.value as Item["cond"] })} className="v2-field" style={{ colorScheme: "dark" }}>
                {(Object.keys(COND) as Item["cond"][]).map((k) => <option key={k || "always"} value={k} style={{ background: "#121215" }}>{COND[k]}</option>)}
              </select>
            </div>
          ) : folders.length > 1 ? (
            <div>
              <p className="v2-label">Rangé dans</p>
              <div className="flex flex-wrap gap-1.5">{folders.map((f) => { const on = v.tags.includes(f.id); return <button key={f.id} type="button" aria-pressed={on} onClick={() => setV({ ...v, tags: on && v.tags.length < 2 ? v.tags : toggle(v.tags, f.id) })} className="v2-seg border" data-on={on} style={{ borderColor: "var(--color-line)" }}>{f.name}</button>; })}</div>
            </div>
          ) : null}
        </div>

        <p className="v2-label mt-3">Médias {mym ? <span className="font-normal">(5 au plus, choisis dans le MYM Cloud)</span> : null}</p>
        {medias.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {medias.map((x) => (
              <span key={x.id} className="relative size-14 overflow-hidden rounded-lg" style={{ background: "var(--color-card-2)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {x.thumb ? <img src={x.thumb} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[10.5px] text-muted">{/audio/i.test(x.type) ? "Vocal" : x.type}</span>}
                <button type="button" onClick={() => setMedias(medias.filter((y) => y.id !== x.id))} title="Retirer ce média" className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-black/75 text-white"><X className="size-3" /></button>
              </span>
            ))}
          </div>
        ) : null}
        {mym ? <CloudPicker creatorId={creatorId} selected={medias} onChange={setMedias} /> : <button type="button" onClick={() => setVault(true)} className="v2-btn" data-kind="ghost" style={{ height: 34 }}><ImagePlus className="size-4" />{medias.length ? "Changer les médias" : "Choisir dans le vault"}</button>}

        <label className="v2-label mt-3" htmlFor="ms-note">Consigne pour l’équipe <span className="font-normal">(facultatif, jamais envoyée au fan)</span></label>
        <input id="ms-note" value={v.note} maxLength={500} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Quand l’envoyer, quoi répondre ensuite…" className="v2-field" />

        {!mym && others.length ? (
          <>
            <p className="v2-label mt-3">Modèles taguées <span className="font-normal">(facultatif : celles qui apparaissent dans les médias)</span></p>
            <div className="flex flex-wrap gap-1.5">{others.map((o) => { const on = v.creatorTags.includes(o.name); return <button key={o.id} type="button" aria-pressed={on} onClick={() => setV({ ...v, creatorTags: toggle(v.creatorTags, o.name) })} className="v2-seg border" data-on={on} style={{ borderColor: "var(--color-line)" }}>@{o.name}</button>; })}</div>
          </>
        ) : null}
        {!item && others.length ? (
          <>
            <p className="v2-label mt-3">Copier aussi chez <span className="font-normal">(facultatif : le texte et la consigne seulement, pas les médias ni le prix)</span></p>
            <div className="flex flex-wrap gap-1.5">{others.map((o) => { const on = shareTo.includes(o.id); return <button key={o.id} type="button" aria-pressed={on} onClick={() => setShareTo(toggle(shareTo, o.id))} className="v2-seg border" data-on={on} style={{ borderColor: "var(--color-line)" }}>{o.name}</button>; })}</div>
          </>
        ) : null}

        {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
          <button onClick={save} disabled={busy || (!v.text.trim() && !medias.length)} className="v2-btn">{busy ? "Enregistrement…" : item ? "Enregistrer" : "Ajouter le message"}</button>
        </div>
      </Modal>
      {vault ? (
        <Layer className="pro">
          <VaultProPicker
            creatorId={creatorId}
            selected={medias.map((x) => ({ id: x.id, type: /video/i.test(x.type) ? "video" : /audio/i.test(x.type) ? "audio" : "photo", thumbnailUrl: x.thumb ?? undefined, url: x.full ?? undefined }))}
            onPick={(list) => (setMedias(list.map((x) => ({ id: x.id, type: x.type, thumb: x.thumbnailUrl || x.smallUrl || null, full: x.url || x.largeUrl || x.mediumUrl || null, duration: null }))), setVault(false))}
            onClose={() => setVault(false)}
            t={t}
          />
        </Layer>
      ) : null}
    </>
  );
}

/** Dupliquer un script chez la même modèle (avec médias et prix) ou le copier chez une autre (texte seulement). */
function CloneForm({ group, creatorId, name, others, onClose, onDone }: { group: Group; creatorId: string; name: string; others: ModelRow[]; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState(creatorId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ mediasDropped: boolean }>("POST", "/api/lib/group/copy", { id: group.id, toCreatorId: to });
      toast(r.mediasDropped ? "Script copié, sans les médias ni les prix" : "Script dupliqué");
      onDone();
    } catch (e) {
      setErr(message(e));
    }
    setBusy(false);
  };
  return (
    <Modal title="Dupliquer le script" sub={`« ${group.name} » et ses ${plural(group.items.length, "message")}.`} onClose={onClose}>
      <label className="v2-label" htmlFor="cl-to">Où le mettre</label>
      <select id="cl-to" value={to} onChange={(e) => setTo(e.target.value)} className="v2-field" style={{ colorScheme: "dark" }}>
        <option value={creatorId} style={{ background: "#121215" }}>Chez {name} (copie complète)</option>
        {others.map((o) => <option key={o.id} value={o.id} style={{ background: "#121215" }}>Chez {o.name}</option>)}
      </select>
      <p className="mt-2 text-[11.5px] text-muted">Chez une autre modèle, les médias et les prix ne suivent pas : chaque modèle a ses propres médias. Il faudra les remettre.</p>
      {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button onClick={go} disabled={busy} className="v2-btn">{busy ? "Copie…" : "Dupliquer"}</button>
      </div>
    </Modal>
  );
}

/** Copier UN message chez d'autres modèles (dans un script du même nom, créé s'il manque). */
function ShareForm({ item, others, onClose, onDone }: { item: Item; others: ModelRow[]; onClose: () => void; onDone: () => void }) {
  const [on, setOn] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("POST", "/api/lib/item/share", { id: item.id, toCreatorIds: on });
      toast(`Message copié chez ${plural(on.length, "modèle")}`);
      onDone();
    } catch (e) {
      setErr(message(e));
    }
    setBusy(false);
  };
  return (
    <Modal title="Copier ce message chez d’autres modèles" sub={`« ${item.name || item.text.slice(0, 50)} »`} onClose={onClose}>
      <p className="text-[12.5px] text-muted">Le texte et la consigne sont copiés dans un script du même nom (créé s’il n’existe pas). Les médias et le prix restent ici.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {others.map((o) => { const sel = on.includes(o.id); return <button key={o.id} type="button" aria-pressed={sel} onClick={() => setOn(sel ? on.filter((x) => x !== o.id) : [...on, o.id])} className="v2-seg border" data-on={sel} style={{ borderColor: "var(--color-line)", height: 32 }}>{o.name}</button>; })}
        {!others.length ? <p className="text-[12.5px] text-muted">Il n’y a pas d’autre modèle sur cette plateforme.</p> : null}
      </div>
      {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button onClick={go} disabled={busy || !on.length} className="v2-btn">{busy ? "Copie…" : "Copier"}</button>
      </div>
    </Modal>
  );
}

/** Lecture d'un CSV « ; » avec guillemets (un message peut contenir des retours à la ligne). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") (row.push(cell), (cell = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

type ImportRow = { script: string; text: string; media: string; price: number; title: string };
/** Importer des scripts depuis un fichier CSV (celui de « Exporter », ou l'export de MyPulse). */
function ImportForm({ creatorId, name, onClose, onDone }: { creatorId: string; name: string; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [kind, setKind] = useState<Group["kind"]>("sequence");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const read = async (f: File | undefined) => {
    if (!f) return;
    const all = parseCsv(await f.text());
    const head = (all[0] || []).map((x) => x.trim().toLowerCase());
    const at = (n: string, d: number) => (head.includes(n) ? head.indexOf(n) : d);
    const [cs, cm, cmd, cp, ct] = [at("script", 0), at("message", 1), at("media", 2), at("price", 3), at("title", 4)];
    setRows(all.slice(head.includes("script") ? 1 : 0).map((r) => ({ script: r[cs] || "", text: r[cm] || "", media: r[cmd] || "", price: Number(String(r[cp] || "0").replace(",", ".")) || 0, title: r[ct] || "" })).filter((r) => r.script));
  };
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ scripts: number; items: number; mediasDropped: number }>("POST", "/api/lib/import", { creatorId, kind, rows });
      toast(`${plural(r.scripts, "script")} et ${plural(r.items, "message")} importés${r.mediasDropped ? ` · ${plural(r.mediasDropped, "média")} à remettre à la main` : ""}`);
      onDone();
    } catch (e) {
      setErr(message(e));
    }
    setBusy(false);
  };
  const scripts = rows ? new Set(rows.map((r) => r.script)).size : 0;
  return (
    <Modal title="Importer des scripts" sub={`Pour ${name}. Chaque nom de script du fichier devient un nouveau script : rien n’est remplacé.`} onClose={onClose}>
      <p className="text-[12.5px] text-muted">Un fichier CSV, une ligne par message : <b style={{ color: "var(--color-fg)" }}>Script ; Message ; Media ; Price ; Title</b>. C’est le fichier du bouton « Exporter » de Bloom, ou l’export de MyPulse.</p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => void read(e.target.files?.[0])} className="v2-field mt-3 py-1.5 text-[12.5px]" style={{ height: "auto" }} />
      {rows ? <p className="mt-2 text-[12.5px]" style={{ color: rows.length ? "var(--v2-up)" : "var(--v2-down)" }}>{rows.length ? `${plural(scripts, "script")} et ${plural(rows.length, "message")} lus dans le fichier.` : "Aucune ligne lisible dans ce fichier."}</p> : null}
      <p className="v2-label mt-3">Les importer comme</p>
      <div className="v2-segbar">{(["sequence", "tag"] as const).map((k) => <button key={k} type="button" className="v2-seg" data-on={kind === k} onClick={() => setKind(k)}>{KIND[k].many}</button>)}</div>
      <p className="mt-2 text-[11.5px] text-muted">Les médias et les prix ne suivent pas (les médias du fichier ne sont pas ceux de Bloom) : leur numéro et le prix prévu sont gardés en consigne sur chaque message, pour les remettre à la main.</p>
      {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button onClick={go} disabled={busy || !rows?.length} className="v2-btn">{busy ? "Import…" : "Importer"}</button>
      </div>
    </Modal>
  );
}
