"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, CircleDot, Copy, Download, Feather, GitBranch, Image as ImageIcon, Layers, MessageCircle, MoreVertical, Plus, Route, Search, Tag, Trash2, Upload, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { useT } from "@/lib/i18n";
import type { Media } from "@/lib/types";
import { download } from "@/lib/xlsx";
import { VaultProPicker } from "@/app/pro/VaultProPicker";
import { Avatar } from "@/components/ui";

// MYM → Messages → Script : copie de « Scripts (Gestion) » de MyPulse sur la bibliothèque de Bloom (`/api/lib`).
// Séquence = le chat déroule le script fan par fan ; Banque de messages = messages choisis à la main, sans ordre.
// Pas (encore) repris : les embranchements et le brief pour l'IA (Substy garde ses propres scripts d'IA).
type Item = { id: number; name: string; text: string; note: string | null; price: number; medias: Media[]; uses: number; fans: number; ppvSent: number; sales: number; revenue: number };
type Group = { id: number; kind: "tag" | "sequence"; name: string; descr: string | null; active: boolean; threshold: number | null; updatedAt: number; items: Item[] };
type Filter = "all" | "on" | "off" | "sequence" | "tag";
const LIME = { background: "var(--mp-accent)", color: "var(--mp-on-accent)" };
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const kindLabel = (k: Group["kind"]) => (k === "sequence" ? "Séquence" : "Banque de messages");
const csvCell = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Lecture d'un CSV « ; » avec guillemets (les messages peuvent contenir des retours à la ligne). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ";") (row.push(cur), (cur = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export function MymScripts() {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [studio, setStudio] = useState<{ id: number | null } | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [clone, setClone] = useState<Group | null>(null);
  const [importing, setImporting] = useState(false);
  const load = useCallback(() => {
    if (!creatorId) return;
    return api<{ groups: Group[]; canEdit: boolean }>("GET", `/api/lib?creatorId=${encodeURIComponent(creatorId)}`).then((r) => (setGroups(r.groups), setCanEdit(r.canEdit))).catch((e) => toast((e as Error).message, "err"));
  }, [creatorId]);
  useEffect(() => {
    setGroups(null);
    load();
  }, [load]);
  const all = useMemo(() => groups ?? [], [groups]);
  const count = (f: Filter) => all.filter((g) => (f === "all" ? true : f === "on" ? g.active : f === "off" ? !g.active : g.kind === f)).length;
  const shown = all.filter((g) => (filter === "all" ? true : filter === "on" ? g.active : filter === "off" ? !g.active : g.kind === filter) && (!q || g.name.toLowerCase().includes(q.toLowerCase())));
  const post = async (url: string, body: unknown, ok?: string) => {
    try {
      await api("POST", url, body);
      if (ok) toast(ok);
      await load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const move = (g: Group, by: number) => {
    const same = all.filter((x) => x.kind === g.kind).map((x) => x.id);
    const i = same.indexOf(g.id);
    const j = i + by;
    if (j < 0 || j >= same.length) return;
    [same[i], same[j]] = [same[j], same[i]];
    post("/api/lib/group/order", { creatorId, ids: same });
  };
  const exportCsv = () => {
    const lines = ["Script;Message;Media;Price;Title"];
    for (const g of all) for (const i of g.items) lines.push([g.name, i.text, i.medias.map((m) => m.id).join(","), String(i.price || 0), i.name].map(csvCell).join(";"));
    download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `scripts_${(creator?.name || "bloom").replace(/\W+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`);
  };
  const pills: [string, string | number][] = [["Actifs", count("on")], ["Séquences", count("sequence")], ["Banques", count("tag")], ["Messages", all.reduce((a, g) => a + g.items.length, 0)]];

  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="rounded-xl p-6" style={{ ...card, background: "linear-gradient(100deg, #10140c 0%, #171c12 70%, #26331a 100%)" }}>
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> Scripts de conversation</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold" style={{ color: "var(--mp-head)" }}>Vos scripts, du premier message à la vente</h1>
            <p className="mt-1 max-w-[600px] text-[13px]">Écrivez une conversation une fois — questions, réactions, médias offerts, ventes — et l’équipe la déroule ensuite dans le chat, fan par fan.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--mp-head)" }}>
              <span className="flex h-8 items-center gap-2 rounded-full border px-2" style={{ borderColor: "var(--mp-line)" }}>
                <Avatar src={creator?.avatar} name={creator?.name} size="size-5" />
                <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="bg-transparent outline-none">{creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}</select>
              </span>
              {pills.map(([l, n]) => <span key={l} className="rounded-full border px-3 py-1.5" style={{ borderColor: "var(--mp-line)" }}>{l} : {n}</span>)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportCsv} disabled={!all.length} className="flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold disabled:opacity-40" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><Download className="size-4" /> Exporter CSV</button>
            {canEdit ? <button onClick={() => setImporting(true)} className="flex h-10 items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><Upload className="size-4" /> Importer CSV</button> : null}
            {canEdit ? <button onClick={() => setStudio({ id: null })} className="flex h-10 items-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold" style={LIME}><Plus className="size-4" /> Nouveau script</button> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg p-1" style={card}>
          {([["all", "Tous", null], ["on", "Actifs", CircleDot], ["off", "Inactifs", CircleDot], ["sequence", "Séquences", Route], ["tag", "Banques de messages", Layers]] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setFilter(k)} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold" style={filter === k ? LIME : undefined}>{I ? <I className="size-3.5" /> : null}{l}<span className="rounded px-1.5 text-[11px]" style={{ background: "rgba(255,255,255,.08)" }}>{count(k)}</span></button>
          ))}
        </div>
        <span className="flex-1" />
        <label className="flex h-9 w-[240px] items-center gap-2 rounded-md px-3 text-[12.5px]" style={card}><Search className="size-3.5" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un script…" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
      </div>

      <div className="mt-3 space-y-2.5">
        {!groups ? <p className="py-14 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>…</p> : null}
        {groups && !shown.length ? <p className="rounded-xl py-14 text-center text-[13px]" style={{ ...card, color: "var(--mp-muted)" }}>{all.length ? "Aucun script dans ce filtre." : "Aucun script pour cette modèle. Crée le premier, ou importe le CSV exporté de MyPulse."}</p> : null}
        {shown.map((g) => {
          const paid = g.items.filter((i) => i.price > 0);
          const medias = g.items.flatMap((i) => i.medias);
          return (
            <div key={g.id} className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-3" style={{ ...card, boxShadow: `inset 3px 0 0 ${g.active ? "var(--mp-accent)" : "#3a4047"}`, opacity: g.active ? 1 : 0.7 }}>
              {canEdit ? <span className="flex flex-col" style={{ color: "var(--mp-muted)" }}><button onClick={() => move(g, -1)} title="Monter"><ArrowUp className="size-3.5" /></button><button onClick={() => move(g, 1)} title="Descendre"><ArrowDown className="size-3.5" /></button></span> : null}
              <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{g.kind === "sequence" ? <Route className="size-4" /> : <Layers className="size-4" />}</span>
              <button onClick={() => setStudio({ id: g.id })} className="min-w-0 flex-1 text-left">
                <p className="flex items-center gap-2 truncate text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}>{g.name}<span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>{kindLabel(g.kind)}</span></p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--mp-muted)" }}>
                  <span className="max-w-[640px] truncate">{g.descr || "Pas de description"}</span>
                  {g.threshold ? <span className="rounded-full border px-2" style={{ borderColor: "var(--mp-line)" }} title="Seuil « utilisé »">{g.threshold} %</span> : null}
                  <span className="rounded-full border px-2" style={{ borderColor: "var(--mp-line)" }} title="Dernière modification">{new Date(g.updatedAt).toLocaleDateString("fr-FR")}</span>
                </p>
              </button>
              <span className="hidden items-center gap-1 lg:flex">
                {medias.slice(0, 3).map((m, i) => (m.thumb ? <img key={`${m.id}-${i}`} src={m.thumb} alt="" className="size-8 rounded-md object-cover" /> : <span key={`${m.id}-${i}`} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--mp-card-2)" }}><ImageIcon className="size-3.5" /></span>))}
                {medias.length > 3 ? <span className="grid h-8 place-items-center rounded-md px-1.5 text-[11px] font-semibold" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}>+{medias.length - 3}</span> : null}
              </span>
              {paid.length ? <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }} title="Montant total si le fan achète tout"><Tag className="size-3" />{eur(paid.reduce((a, i) => a + i.price, 0))}</span> : null}
              {([["messages", g.items.length], ["médias", medias.length], ["payants", paid.length]] as const).map(([l, n]) => <span key={l} className="w-[62px] text-[11px]" style={{ color: "var(--mp-muted)" }}><b className="block text-[14px]" style={{ color: "var(--mp-head)" }}>{n}</b>{l}</span>)}
              {canEdit ? (
                <>
                  <button onClick={() => post("/api/lib/group", { id: g.id, active: !g.active }, g.active ? "Script désactivé : il disparaît du bouton Script du chat" : "Script activé")} title={g.active ? "Actif dans le chat" : "Inactif"} className="relative h-6 w-11 shrink-0 rounded-full" style={{ background: g.active ? "var(--mp-accent)" : "#3a4047" }}><span className="absolute top-0.5 size-5 rounded-full bg-white transition-all" style={{ left: g.active ? 22 : 2 }} /></button>
                  <button onClick={() => setStudio({ id: g.id })} className="flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold" style={LIME}><Feather className="size-3.5" /> Éditer</button>
                  <button onClick={() => setClone(g)} title="Dupliquer — ici ou chez une autre modèle de l’agence" className="grid size-8 place-items-center rounded-md" style={{ color: "var(--mp-muted)" }}><Copy className="size-4" /></button>
                  <span className="relative">
                    <button onClick={() => setMenu(menu === g.id ? null : g.id)} title="Plus d’actions" className="grid size-8 place-items-center rounded-md" style={{ color: "var(--mp-muted)" }}><MoreVertical className="size-4" /></button>
                    {menu === g.id ? (
                      <div className="absolute top-9 right-0 z-20 w-40 overflow-hidden rounded-lg text-[13px] shadow-2xl" style={{ background: "#262a2f", border: "1px solid var(--mp-line)" }}>
                        <button onClick={() => (setMenu(null), setClone(g))} className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-white/5"><Copy className="size-3.5" /> Cloner</button>
                        <button onClick={() => (setMenu(null), confirm(`Supprimer le script « ${g.name} » et ses ${g.items.length} message(s) ?`) && post("/api/lib/group/delete", { id: g.id }, "Script supprimé"))} className="flex w-full items-center gap-2 border-t px-3 py-2.5 hover:bg-white/5" style={{ borderColor: "var(--mp-line)", color: "var(--mp-down)" }}><Trash2 className="size-3.5" /> Supprimer</button>
                      </div>
                    ) : null}
                  </span>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {all.some((g) => g.items.some((i) => i.uses)) ? <Performance groups={all} /> : groups && all.length ? <p className="mt-6 text-[12.5px]" style={{ color: "var(--mp-muted)" }}>Les performances des messages apparaîtront ici dès que des scripts auront été envoyés depuis le Chatting de Bloom.</p> : null}

      {studio && creatorId ? <Studio creatorId={creatorId} creatorName={creator?.name || ""} group={studio.id ? all.find((g) => g.id === studio.id) ?? null : null} canEdit={canEdit} reload={load} onClose={() => setStudio(null)} onCreated={(id) => setStudio({ id })} /> : null}
      {clone && creatorId ? <CloneModal g={clone} creatorId={creatorId} creators={creators.filter((c) => c.id !== creatorId).map((c) => ({ id: c.id, name: c.name }))} onClose={() => setClone(null)} onDone={() => (setClone(null), load())} /> : null}
      {importing && creatorId ? <ImportModal creatorId={creatorId} onClose={() => setImporting(false)} onDone={() => (setImporting(false), load())} /> : null}
    </div>
  );
}

function Performance({ groups }: { groups: Group[] }) {
  const rows = groups.flatMap((g) => g.items.filter((i) => i.uses).map((i) => ({ g, i }))).sort((a, b) => b.i.revenue - a.i.revenue || b.i.uses - a.i.uses);
  const sum = (f: (i: Item) => number) => rows.reduce((a, r) => a + f(r.i), 0);
  const sent = sum((i) => i.uses);
  const sales = sum((i) => i.sales);
  const ca = sum((i) => i.revenue) / 100;
  const ppv = sum((i) => i.ppvSent);
  const tiles: [string, string][] = [["Messages envoyés", String(rows.length)], ["Total envois", sent.toLocaleString("fr-FR")], ["Ventes confirmées", String(sales)], ["CA confirmé", eur(ca)], ["Conversion des PPV", ppv ? `${((sales / ppv) * 100).toFixed(1)} %` : "—"], ["CA / envoi", sent ? eur(Math.round((ca / sent) * 100) / 100) : "—"]];
  return (
    <div className="mt-8">
      <h2 className="text-[16px] font-semibold" style={{ color: "var(--mp-head)" }}>Performance des messages</h2>
      <p className="text-[12px]" style={{ color: "var(--mp-muted)" }}>Envois faits depuis Bloom et ventes confirmées, depuis que Bloom les enregistre.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">{tiles.map(([l, v]) => <div key={l} className="rounded-lg p-3" style={card}><p className="text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{l}</p><p className="mt-1 text-[16px] font-bold" style={{ color: "var(--mp-head)" }}>{v}</p></div>)}</div>
      <div className="mt-3 overflow-x-auto rounded-lg" style={card}>
        <table className="w-full min-w-[820px] text-[13px]">
          <thead><tr className="text-left" style={{ color: "var(--mp-head)" }}>{["Message", "Script", "Prix listé", "Envois", "Fans uniques", "Ventes", "CA", "Conv."].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, 80).map(({ g, i }) => (
              <tr key={i.id} className="border-t" style={{ borderColor: "var(--mp-line)" }}>
                <td className="px-3 py-2.5"><b style={{ color: "var(--mp-head)" }}>{i.name}</b>{i.medias.length ? <span className="block text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{i.medias.length} média(s)</span> : null}</td>
                <td className="px-3"><span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase" style={{ background: "rgba(64,81,137,.35)", color: "#8ea2e6" }}>{g.name}</span></td>
                <td className="px-3">{i.price ? eur(i.price) : "—"}</td>
                <td className="px-3 font-semibold" style={{ color: "var(--mp-head)" }}>{i.uses}</td>
                <td className="px-3">{i.fans}</td>
                <td className="px-3 font-semibold" style={{ color: "var(--mp-head)" }}>{i.sales}</td>
                <td className="px-3" style={{ color: "#6f86d6" }}>{eur(i.revenue / 100)}</td>
                <td className="px-3">{i.ppvSent ? <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: "rgba(60,209,136,.15)", color: "var(--mp-up)" }}>{((i.sales / i.ppvSent) * 100).toFixed(1)} %</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** « Studio du script » : 1. Le script (nom, mode, seuil) · 2. Messages & parcours · 3. Récapitulatif. */
function Studio({ creatorId, creatorName, group, canEdit, reload, onClose, onCreated }: { creatorId: string; creatorName: string; group: Group | null; canEdit: boolean; reload: () => void; onClose: () => void; onCreated: (id: number) => void }) {
  const [step, setStep] = useState(group ? 2 : 1);
  const [v, setV] = useState({ name: group?.name ?? "", descr: group?.descr ?? "", kind: (group?.kind ?? "sequence") as Group["kind"], threshold: group?.threshold ? String(group.threshold) : "" });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Item | "new" | null>(null);
  const items = group?.items ?? [];
  const saveHead = async (next: number) => {
    if (!v.name.trim()) return toast("Donne un nom au script", "err");
    if (!canEdit) return setStep(next);
    setBusy(true);
    try {
      const r = await api<{ id: number }>("POST", "/api/lib/group", { id: group?.id, creatorId, kind: v.kind, name: v.name, descr: v.descr, threshold: v.threshold });
      await reload();
      if (!group) onCreated(r.id);
      setStep(next);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const act = async (url: string, body: unknown) => {
    try {
      await api("POST", url, body);
      await reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const move = (i: number, by: number) => {
    const ids = items.map((x) => x.id);
    const j = i + by;
    if (j < 0 || j >= ids.length || !group) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    act("/api/lib/item/order", { groupId: group.id, ids });
  };
  const STEPS = [["Le script", "Nom, mode"], ["Messages & parcours", "Le fil et ses messages"], ["Récapitulatif", "Vérifier, activer"]];
  const field = "mt-1.5 w-full rounded-xl border px-4 outline-none";
  const fs = { background: "rgba(255,255,255,.04)", borderColor: "#2f3a24", color: "var(--mp-head)" };
  const paid = items.filter((i) => i.price > 0);

  return (
    <div className="mp-font fixed inset-0 z-40 flex flex-col" style={{ background: "radial-gradient(90% 70% at 100% 100%, #1d2a12 0%, #0d110b 55%)", color: "var(--mp-text)" }}>
      <div className="flex items-center gap-4 border-b px-5 py-3" style={{ borderColor: "#1f2a17" }}>
        <span className="grid size-8 place-items-center rounded-lg" style={LIME}><MessageCircle className="size-4" /></span>
        <b className="text-[13px]" style={{ color: "var(--mp-head)" }}>{group ? "Studio du script" : "Nouveau script"}</b>
        <div className="h-0.5 flex-1 rounded" style={{ background: "#1f2a17" }}><div className="h-0.5 rounded transition-all" style={{ width: `${(step / 3) * 100}%`, background: "var(--mp-accent)" }} /></div>
        <button onClick={onClose} className="grid size-8 place-items-center rounded-lg" style={{ background: "rgba(255,255,255,.06)", color: "var(--mp-head)" }}><X className="size-4" /></button>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[230px] shrink-0 space-y-1 p-5 md:block">
          {STEPS.map(([t, s], i) => (
            <button key={t} disabled={!group && i > 0} onClick={() => setStep(i + 1)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left disabled:opacity-40" style={step === i + 1 ? { background: "rgba(199,255,74,.1)" } : undefined}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={step >= i + 1 ? LIME : { border: "1px solid #3a4047" }}>{step > i + 1 ? <Check className="size-3.5" /> : i + 1}</span>
              <span><span className="block text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>{t}</span><span className="text-[11px]" style={{ color: "var(--mp-muted)" }}>{s}</span></span>
            </button>
          ))}
        </aside>
        <div className="no-scrollbar min-w-0 flex-1 overflow-y-auto px-5 py-8">
          <div className="mx-auto max-w-[1180px]">
            <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "var(--mp-accent)" }}>Étape {step} sur 3</p>
            {step === 1 ? (
              <div className="max-w-[900px]">
                <h2 className="mt-1 text-[30px] font-bold" style={{ color: "var(--mp-head)" }}>Comment s’appelle ce script ?</h2>
                <p className="mt-1 max-w-[620px] text-[14px]">Le nom est celui que l’équipe voit dans le bouton Script du chat. Le mode décide comment le chat le déroule.</p>
                <label className="mt-6 block text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Nom du script<input disabled={!canEdit} value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ex. : Découverte du fan — gaming" className={`${field} h-14 text-[17px]`} style={fs} /></label>
                <label className="mt-4 block text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Description pour l’équipe (facultatif)<textarea disabled={!canEdit} value={v.descr} maxLength={1000} onChange={(e) => setV({ ...v, descr: e.target.value })} rows={2} placeholder="Quand l’utiliser, pour quel fan, ce qu’il vend…" className={`${field} py-3 font-normal`} style={fs} /></label>
                <p className="mt-6 flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}><Route className="size-4" style={{ color: "var(--mp-accent)" }} /> Mode</p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  {([["sequence", "Séquence", "Le chat déroule le script fan par fan et reprend là où il s’est arrêté.", Route], ["tag", "Banque de messages", "Des messages prêts à l’emploi, choisis à la main dans la liste, sans ordre imposé.", Layers]] as const).map(([k, t, s, I]) => (
                    <button key={k} disabled={!canEdit || !!group} onClick={() => setV({ ...v, kind: k })} className="rounded-2xl border p-5 text-left disabled:cursor-default" style={v.kind === k ? { borderColor: "var(--mp-accent)", background: "rgba(199,255,74,.07)" } : { borderColor: "#2a3020", opacity: group ? 0.5 : 1 }}>
                      <span className="grid size-9 place-items-center rounded-lg" style={v.kind === k ? LIME : { background: "rgba(255,255,255,.06)" }}><I className="size-4" /></span>
                      <p className="mt-3 text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}>{t}</p>
                      <p className="mt-1 text-[12.5px]">{s}</p>
                    </button>
                  ))}
                </div>
                {group ? <p className="mt-2 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Le mode ne se change plus une fois le script créé.</p> : null}
                <p className="mt-6 text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}>Seuil « utilisé »</p>
                <p className="text-[12.5px]">Part des messages envoyés à un fan à partir de laquelle le script compte comme déroulé pour lui.</p>
                <div className="mt-2 flex w-[200px] items-center overflow-hidden rounded-xl border" style={fs}><input disabled={!canEdit} value={v.threshold} onChange={(e) => setV({ ...v, threshold: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="60" className="h-11 min-w-0 flex-1 bg-transparent px-4 outline-none" /><span className="border-l px-3" style={{ borderColor: "#2f3a24" }}>%</span></div>
                <p className="mt-2 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Gardé pour information : le chat de Bloom montre déjà, message par message, ce qui a été envoyé à chaque fan.</p>
              </div>
            ) : null}

            {step === 2 && group ? (
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="min-w-0 flex-1">
                  <h2 className="mt-1 text-[26px] font-bold" style={{ color: "var(--mp-head)" }}>Le parcours du fan</h2>
                  <p className="mt-1 text-[13.5px]">{group.kind === "sequence" ? "Le fil se lit de haut en bas : le chat propose les messages dans cet ordre." : "Une banque de messages : l’équipe pioche celui qui convient, sans ordre."}</p>
                  <div className="mt-3 flex gap-2">
                    {canEdit ? <button onClick={() => setEdit("new")} className="flex h-9 items-center gap-1.5 rounded-xl border px-4 text-[13px] font-semibold" style={{ borderColor: "var(--mp-accent)", color: "var(--mp-head)", background: "rgba(199,255,74,.08)" }}><Plus className="size-4" /> Message</button> : null}
                    <button disabled title="Une question au fan, un chemin par type de réponse — pas encore disponible dans Bloom" className="flex h-9 cursor-not-allowed items-center gap-1.5 rounded-xl border px-4 text-[13px] font-semibold opacity-40" style={{ borderColor: "#2a3020" }}><GitBranch className="size-4" /> Embranchement</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {!items.length ? <p className="rounded-xl border border-dashed py-4 text-center text-[13px]" style={{ borderColor: "#2a3020" }}>Pas encore de message. Commencez par le premier.</p> : null}
                    {items.map((i, n) => (
                      <div key={i.id} className="flex items-center gap-3">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold" style={{ borderColor: "var(--mp-accent)", color: "var(--mp-accent)" }}>{n + 1}</span>
                        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "#2a3020", background: "rgba(255,255,255,.03)" }}>
                          {canEdit ? <span className="flex flex-col" style={{ color: "var(--mp-muted)" }}><button onClick={() => move(n, -1)}><ArrowUp className="size-3.5" /></button><button onClick={() => move(n, 1)}><ArrowDown className="size-3.5" /></button></span> : null}
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.1)", color: "var(--mp-accent)" }}>{i.medias.length ? <ImageIcon className="size-4" /> : <MessageCircle className="size-4" />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>{i.name}{i.price ? <span className="rounded-full px-2 text-[11px]" style={LIME}>{eur(i.price)}</span> : null}{i.medias.length ? <span className="text-[11px] font-normal" style={{ color: "var(--mp-muted)" }}>{i.medias.length} média(s)</span> : null}</span>
                            <span className="block truncate text-[12.5px]">{i.text}</span>
                            {i.note ? <span className="block truncate text-[11.5px]" style={{ color: "#f7b84b" }}>{i.note}</span> : null}
                          </span>
                          {canEdit ? (
                            <>
                              <button onClick={() => setEdit(i)} title="Modifier" className="grid size-8 place-items-center rounded-lg" style={{ background: "rgba(255,255,255,.06)" }}><Feather className="size-3.5" /></button>
                              <button onClick={() => confirm(`Supprimer le message « ${i.name} » ?`) && act("/api/lib/item/delete", { id: i.id })} title="Supprimer" className="grid size-8 place-items-center rounded-lg" style={{ background: "rgba(255,255,255,.06)" }}><Trash2 className="size-3.5" /></button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-full shrink-0 lg:w-[300px]">
                  <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "var(--mp-accent)" }}>Aperçu du parcours</p>
                  <p className="mt-1 text-[12px]">Ce que reçoit un fan, message par message.</p>
                  <div className="mt-3 rounded-[26px] border p-3" style={{ borderColor: "#2a3020", background: "#0d110b" }}>
                    <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: "#1f2a17" }}><span className="grid size-8 place-items-center rounded-full text-[13px] font-bold" style={LIME}>{(creatorName || "?").charAt(0).toUpperCase()}</span><span><b className="block text-[13px]" style={{ color: "var(--mp-head)" }}>{creatorName}</b><span className="text-[11px]" style={{ color: "var(--mp-muted)" }}>{group.name}</span></span></div>
                    <div className="no-scrollbar flex max-h-[420px] min-h-[220px] flex-col items-end gap-2 overflow-y-auto pt-3">
                      {items.map((i) => <span key={i.id} className="max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] whitespace-pre-wrap" style={LIME}>{i.medias.length ? `📷 ${i.medias.length} média(s)${i.price ? ` · ${eur(i.price)}` : ""}\n` : ""}{i.text}</span>)}
                      {!items.length ? <p className="m-auto text-[12px]" style={{ color: "var(--mp-muted)" }}>Le parcours apparaîtra ici.</p> : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 3 && group ? (
              <div className="max-w-[900px]">
                <h2 className="mt-1 text-[30px] font-bold" style={{ color: "var(--mp-head)" }}>Prêt pour le chat</h2>
                <p className="mt-1 text-[14px]">Un dernier coup d’œil avant de l’ouvrir à l’équipe.</p>
                <div className="mt-5 rounded-2xl border p-5" style={{ borderColor: "#2f3a24", background: "rgba(199,255,74,.05)" }}>
                  <p><b className="text-[44px]" style={{ color: "var(--mp-accent)" }}>{items.length}</b> <span className="ml-2 text-[14px]">messages écrits{group.kind === "sequence" ? " · un fan les reçoit dans l’ordre." : " · l’équipe choisit lequel envoyer."}</span></p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>{[`Mode ${kindLabel(group.kind)}`, `Médias : ${items.reduce((a, i) => a + i.medias.length, 0)}`, `Prix cumulé : ${eur(paid.reduce((a, i) => a + i.price, 0))}`].map((x) => <span key={x} className="rounded-full px-3 py-1" style={{ background: "rgba(255,255,255,.06)" }}>{x}</span>)}</div>
                </div>
                {!items.length ? <p className="mt-3 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "#6b5a1f", color: "#f7b84b" }}>Aucun message : le script n’apparaîtra pas utilement dans le chat.</p> : null}
                <div className="mt-3 flex items-center gap-4 rounded-2xl border p-4" style={{ borderColor: "#2f3a24" }}>
                  <button disabled={!canEdit} onClick={() => act("/api/lib/group", { id: group.id, active: !group.active })} className="relative h-7 w-12 shrink-0 rounded-full" style={{ background: group.active ? "var(--mp-accent)" : "#3a4047" }}><span className="absolute top-1 size-5 rounded-full bg-white transition-all" style={{ left: group.active ? 24 : 4 }} /></button>
                  <span><b className="block text-[13.5px]" style={{ color: "var(--mp-head)" }}>Script actif dans le chat</b><span className="text-[12.5px]">Inactif, il reste ici mais disparaît du bouton Script du chat.</span></span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {([["Nom du script", group.name, group.descr || ""], ["Mode", kindLabel(group.kind), ""], ["Seuil « utilisé »", group.threshold ? `${group.threshold} %` : "par défaut", ""]] as const).map(([l, a, b]) => (
                    <div key={l} className="rounded-2xl border p-4" style={{ borderColor: "#2a3020" }}>
                      <p className="flex justify-between text-[11px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>{l}{canEdit ? <button onClick={() => setStep(1)} style={{ color: "var(--mp-accent)" }} className="normal-case">Modifier</button> : null}</p>
                      <p className="mt-2 text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>{a}</p>
                      {b ? <p className="line-clamp-2 text-[12px]">{b}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: "#1f2a17" }}>
        <button onClick={() => (step === 1 ? onClose() : setStep(step - 1))} className="h-10 rounded-xl border px-4 text-[13.5px]" style={{ borderColor: "#2a3020" }}>← Retour</button>
        <span className="hidden text-[12.5px] sm:block">{items.length} message(s){paid.length ? ` · ${paid.length} payant(s)` : ""}</span>
        {step === 1 ? <button disabled={busy} onClick={() => saveHead(2)} className="h-10 rounded-xl px-5 text-[13.5px] font-semibold disabled:opacity-50" style={LIME}>{group ? "Continuer →" : "Créer le script →"}</button> : step === 2 ? <button onClick={() => setStep(3)} className="h-10 rounded-xl px-5 text-[13.5px] font-semibold" style={LIME}>Continuer →</button> : <button onClick={onClose} className="h-10 rounded-xl px-5 text-[13.5px] font-semibold" style={LIME}>✓ Terminer</button>}
      </div>
      {edit && group ? <MessageEditor creatorId={creatorId} creatorName={creatorName} groupId={group.id} item={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), reload())} /> : null}
    </div>
  );
}

function MessageEditor({ creatorId, creatorName, groupId, item, onClose, onSaved }: { creatorId: string; creatorName: string; groupId: number; item: Item | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [v, setV] = useState({ name: item?.name ?? "", text: item?.text ?? "", note: item?.note ?? "", paid: (item?.price ?? 0) > 0, price: item?.price ? String(item.price) : "" });
  const [medias, setMedias] = useState<Media[]>(item?.medias ?? []);
  const [vault, setVault] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("POST", "/api/lib/item", { id: item?.id, groupId, name: v.name, text: v.text, note: v.note, price: v.paid ? Number(String(v.price).replace(",", ".")) || 0 : 0, medias });
      toast(item ? "Message modifié" : "Message ajouté");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const box = "rounded-2xl border p-4";
  const bs = { borderColor: "#2a3020", background: "rgba(255,255,255,.03)" };
  const fs = { background: "rgba(255,255,255,.04)", borderColor: "#2f3a24", color: "var(--mp-head)" };
  return (
    <div className="mp-font fixed inset-0 z-50 flex flex-col" style={{ background: "#0d110b", color: "var(--mp-text)" }}>
      <div className="flex items-center gap-3 border-b px-5 py-3" style={{ borderColor: "#1f2a17" }}><span className="grid size-8 place-items-center rounded-lg" style={LIME}><Feather className="size-4" /></span><b className="flex-1 text-[14px]" style={{ color: "var(--mp-head)" }}>{item ? "Modifier le message" : "Nouveau message"}</b><button onClick={onClose} className="grid size-8 place-items-center rounded-lg" style={{ background: "rgba(255,255,255,.06)" }}><X className="size-4" /></button></div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto flex max-w-[960px] flex-col gap-5 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-3">
            <div className={box} style={bs}>
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Titre (repère d’équipe)</p>
              <input autoFocus value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Titre…" className="mt-1.5 h-10 w-full rounded-lg border px-3 outline-none" style={fs} />
              <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Visible dans la liste et le chat, jamais envoyé au fan.</p>
            </div>
            <div className={box} style={bs}>
              <p className="flex justify-between text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}><span>Message</span><span className="text-[11px] font-normal" style={{ color: "var(--mp-muted)" }}>{v.text.length}</span></p>
              <textarea value={v.text} maxLength={5000} onChange={(e) => setV({ ...v, text: e.target.value })} rows={6} placeholder="Ce que le fan lira…" className="mt-2 w-full rounded-lg border p-3 outline-none" style={fs} />
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{"{prénom}"} est remplacé par le prénom du fan.</p>
            </div>
            <div className={box} style={bs}>
              <p className="text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Prix</p>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => setV({ ...v, paid: false })} className="h-8 rounded-full px-3.5 text-[12.5px] font-semibold" style={!v.paid ? LIME : { border: "1px solid #2f3a24" }}>Gratuit</button>
                <button onClick={() => setV({ ...v, paid: true })} className="h-8 rounded-full px-3.5 text-[12.5px] font-semibold" style={v.paid ? LIME : { border: "1px solid #2f3a24" }}>Payant</button>
                <span className="flex items-center overflow-hidden rounded-lg border" style={{ ...fs, opacity: v.paid ? 1 : 0.4 }}><input disabled={!v.paid} value={v.price} onChange={(e) => setV({ ...v, price: e.target.value.replace(/[^\d.,]/g, "") })} className="h-8 w-20 bg-transparent px-2 text-right outline-none" /><span className="border-l px-2" style={{ borderColor: "#2f3a24" }}>€</span></span>
              </div>
              <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Payant : avec au moins un média.</p>
            </div>
            <div className={box} style={bs}>
              <p className="flex items-center justify-between text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Médias du vault<button onClick={() => setVault(true)} className="h-8 rounded-full px-3.5 text-[12.5px]" style={LIME}>{medias.length ? "Changer" : "Choisir"}</button></p>
              <div className="mt-2 flex flex-wrap gap-2">
                {medias.map((m) => (
                  <span key={m.id} className="relative">
                    {m.thumb ? <img src={m.thumb} alt="" className="size-16 rounded-lg object-cover" /> : <span className="grid size-16 place-items-center rounded-lg" style={{ background: "rgba(255,255,255,.06)" }}><ImageIcon className="size-5" /></span>}
                    <button onClick={() => setMedias(medias.filter((x) => x.id !== m.id))} className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-black text-white"><X className="size-3" /></button>
                  </span>
                ))}
                {!medias.length ? <p className="text-[12.5px]" style={{ color: "var(--mp-muted)" }}>Aucun média.</p> : null}
              </div>
            </div>
            <div className={box} style={bs}>
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Consigne pour l’équipe (facultatif)</p>
              <input value={v.note} maxLength={500} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Quand l’envoyer, quoi répondre ensuite…" className="mt-1.5 h-10 w-full rounded-lg border px-3 outline-none" style={fs} />
            </div>
          </div>
          <div className="w-full shrink-0 lg:w-[270px]">
            <p className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "var(--mp-accent)" }}>Aperçu côté fan</p>
            <div className="mt-2 rounded-[26px] border p-3" style={{ borderColor: "#2a3020" }}>
              <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: "#1f2a17" }}><span className="grid size-8 place-items-center rounded-full text-[13px] font-bold" style={LIME}>{(creatorName || "?").charAt(0).toUpperCase()}</span><b className="text-[13px]" style={{ color: "var(--mp-head)" }}>{creatorName}</b></div>
              <div className="flex min-h-[260px] flex-col items-end justify-end gap-2 pt-3">
                {medias.length ? <span className="grid h-24 w-32 place-items-center rounded-2xl text-[12px]" style={{ background: "rgba(255,255,255,.08)" }}>{v.paid ? `🔒 ${v.price || "?"} €` : `📷 ${medias.length}`}</span> : null}
                <span className="max-w-[90%] rounded-2xl px-3 py-2 text-[12.5px] whitespace-pre-wrap" style={v.text ? LIME : { border: "1px dashed #3a4047" }}>{v.text || "Ce que le fan lira…"}</span>
              </div>
            </div>
            {v.paid ? <p className="mt-2 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Payant : le fan voit les médias floutés jusqu’au déblocage.</p> : null}
          </div>
        </div>
      </div>
      <div className="flex gap-2 border-t px-5 py-3" style={{ borderColor: "#1f2a17" }}>
        <button onClick={onClose} className="h-10 rounded-xl border px-4 text-[13.5px]" style={{ borderColor: "#2a3020" }}>Annuler</button>
        <button disabled={busy || (!v.text.trim() && !medias.length)} onClick={save} className="h-10 rounded-xl px-5 text-[13.5px] font-semibold disabled:opacity-50" style={LIME}>✓ Enregistrer</button>
      </div>
      {vault ? (
        <div className="pro">
          <VaultProPicker
            creatorId={creatorId}
            selected={medias.map((m) => ({ id: m.id, type: /video/i.test(m.type) ? "video" : /audio/i.test(m.type) ? "audio" : "photo", thumbnailUrl: m.thumb ?? undefined, url: m.full ?? undefined }))}
            onPick={(list) => (setMedias(list.map((m) => ({ id: m.id, type: m.type, thumb: m.thumbnailUrl || m.smallUrl || null, full: m.url || m.largeUrl || m.mediumUrl || null, duration: null }))), setVault(false))}
            onClose={() => setVault(false)}
            t={t}
          />
        </div>
      ) : null}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="mp-font fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[480px] overflow-hidden rounded-lg" style={{ background: "#262a2f", color: "var(--mp-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between px-4 py-3.5 text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}>{title}<button onClick={onClose}><X className="size-4" /></button></h3>
        <div className="px-4 pb-4 text-[13px]">{children}</div>
      </div>
    </div>
  );
}

function CloneModal({ g, creatorId, creators, onClose, onDone }: { g: Group; creatorId: string; creators: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api<{ mediasDropped: boolean }>("POST", "/api/lib/group/copy", { id: g.id, toCreatorId: to || creatorId });
      toast(r.mediasDropped ? "Script cloné (sans les médias ni les prix)" : "Script cloné");
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Cloner le script" onClose={onClose}>
      <p className="font-semibold" style={{ color: "var(--mp-head)" }}>Destination</p>
      <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1.5 h-10 w-full rounded-md px-3 outline-none" style={{ background: "#2f343a", color: "var(--mp-head)" }}>
        <option value="">-- Cloner vers la même créatrice (avec médias) --</option>
        {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <p className="mt-2 text-[12px]" style={{ color: "var(--mp-muted)" }}>Vers une autre créatrice, les médias et les prix ne suivent pas : chaque vault est propre à sa créatrice.</p>
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className="h-9 rounded-md px-4" style={{ background: "#2f343a" }}>Annuler</button><button disabled={busy} onClick={go} className="h-9 rounded-md px-4 text-white disabled:opacity-50" style={{ background: "#405189" }}>Cloner</button></div>
    </Modal>
  );
}

function ImportModal({ creatorId, onClose, onDone }: { creatorId: string; onClose: () => void; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<{ script: string; text: string; media: string; price: number; title: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
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
    try {
      const r = await api<{ scripts: number; items: number; mediasDropped: number }>("POST", "/api/lib/import", { creatorId, rows });
      toast(`${r.scripts} script(s), ${r.items} message(s) importés${r.mediasDropped ? ` · ${r.mediasDropped} média(s) à remettre à la main` : ""}`);
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const scripts = rows ? new Set(rows.map((r) => r.script)).size : 0;
  return (
    <Modal title="Importer des scripts" onClose={onClose}>
      <p className="font-semibold" style={{ color: "var(--mp-head)" }}>Une ligne par message, dans l’ordre : Script ; Message ; Médias ; Prix ; Titre (facultatif). C’est le fichier de « Exporter CSV » de Bloom ou de MyPulse.</p>
      <p className="mt-2 text-[12px]" style={{ color: "var(--mp-muted)" }}>Chaque nom de script devient un nouveau script, rien n’est remplacé. Les médias d’un export MyPulse ne sont pas ceux du vault de Bloom : ils ne suivent pas, leur numéro et le prix prévu sont gardés en consigne sur le message pour les remettre à la main.</p>
      <input ref={input} type="file" accept=".csv,text/csv" onChange={(e) => read(e.target.files?.[0])} className="mt-3 block w-full rounded-md p-2 text-[12.5px]" style={{ background: "#2f343a" }} />
      {rows ? <p className="mt-2" style={{ color: rows.length ? "var(--mp-up)" : "var(--mp-down)" }}>{rows.length ? `${scripts} script(s), ${rows.length} message(s) lus dans le fichier.` : "Aucune ligne lisible dans ce fichier."}</p> : null}
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className="h-9 rounded-md px-4" style={{ background: "#2f343a" }}>Fermer</button><button disabled={busy || !rows?.length} onClick={go} className="h-9 rounded-md px-4 text-white disabled:opacity-50" style={{ background: "#405189" }}>{busy ? "Import…" : "Importer"}</button></div>
    </Modal>
  );
}
