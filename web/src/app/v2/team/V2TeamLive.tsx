"use client";

import { useEffect, useState } from "react";
import { Maximize2, Monitor, Pause, Play, Search, Smartphone, X } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/rv/components/ui";
import { int } from "../kit";
import { errText, plural } from "../media/MediaKit";
import { screenOf } from "../screens";
import { ModelMenu, type TeamModel } from "./TeamKit";

// Bloom v2 → Équipe → En direct (25/11/2026, « Constellation ») : qui a Bloom ouvert en ce moment, sur quelle page,
// quelle modèle, quel fan, depuis quel appareil, et ce que chacun a fait aujourd'hui. Les deux plateformes ensemble.
// Lecture seule, relue toutes les 10 secondes : `GET /api/v2/team/live` (app/v2team.mjs, présence de team.mjs).
type Person = {
  userId: number; name: string; avatar: string | null; role: string | null; since: number; at: number; page: string | null; active: boolean;
  device: { label: string; kind: "desktop" | "mobile" | "unknown" }; country: string | null; modelId: string | null; model: string | null; mym: boolean; hidden: boolean; fan: string | null;
  today: { activeMs: number; idleMs: number; msgs: number; ppv: number };
};
type Data = { now: number; people: Person[]; models: (TeamModel & { mym: boolean })[] };

// Les pages de la version actuelle (celles de la v2 portent le nom de leur écran).
const OLD: [RegExp, string][] = [
  [/chatting|switchboard|messagerie|^\/pro/, "Messagerie"],
  [/message-dashboard|ventes-equipe|shifts|activite|en-direct|moderation|equipe|employees|roles|acces/, "Équipe"],
  [/stats|analytique|transactions|liens|analytics|tracking|\/app\/of/, "Statistiques"],
  [/push|mods|massdm|envoi|smart/, "Envois groupés"],
  [/scripts/, "Scripts"],
  [/planification|feed|amis|importer|vault|studio/, "Médias"],
  [/abonnes|anciens|interesses|groupes|fans|listes/, "Fans"],
];
function pageName(page: string | null) {
  if (!page) return "Bloom";
  const v2 = /^\/v2(?:\/([a-z-]+))?/.exec(page);
  if (v2) return v2[1] ? screenOf(v2[1])?.label ?? "Bloom" : "Vue d’ensemble";
  return OLD.find(([re]) => re.test(page))?.[1] ?? "Bloom";
}
const span = (ms: number) => {
  const min = Math.floor(ms / 60_000);
  return min < 1 ? "moins d’une minute" : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
};
const regions = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["fr"], { type: "region" }) : null;
const countryOf = (c: string | null) => {
  if (!c || c === "XX") return null;
  try {
    return regions?.of(c) ?? c;
  } catch {
    return c;
  }
};

export function V2TeamLive() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [paused, setPaused] = useState(false);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"" | "on" | "off">("");
  const [model, setModel] = useState("");
  useEffect(() => {
    if (paused) return;
    let stop = false;
    const load = () => api<Data>("GET", "/api/v2/team/live").then((r) => void (!stop && (setD(r), setErr("")))).catch((e) => void (!stop && setErr(errText(e))));
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 10_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [paused]);

  const all = d?.people ?? [];
  const word = q.trim().toLowerCase();
  const shown = all.filter((p) => (!only || (only === "on") === p.active) && (!model || p.modelId === model) && (!word || `${p.name} ${p.model ?? ""} ${p.fan ?? ""}`.toLowerCase().includes(word)));
  const on = all.filter((p) => p.active).length;
  const covered = new Map<string, number>();
  for (const p of all) if (p.modelId) covered.set(p.modelId, (covered.get(p.modelId) || 0) + 1);
  const count = (f: (p: Person) => string | null) => {
    const m = new Map<string, number>();
    for (const p of all) {
      const k = f(p);
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const devices = count((p) => (p.device.kind === "mobile" ? "Téléphone" : p.device.kind === "desktop" ? "Ordinateur" : "Inconnu"));
  const countries = count((p) => countryOf(p.country));
  const full = () => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen().catch(() => {}));
  const tile = (label: string, value: string | null, sub: string, i: number) => (
    <div className="v2-card v2-rise min-w-0 p-3.5" style={{ ["--i" as string]: i + 2 }}>
      <p className="truncate text-[12px] text-muted">{label}</p>
      <p className="v2-num mt-1 truncate text-[22px] leading-tight font-bold">{value ?? <span className="text-muted">…</span>}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub}</p>
    </div>
  );
  const bars = (title: string, rows: [string, number][]) => (
    <div className="v2-card v2-rise p-3.5">
      <p className="v2-card-title">{title}</p>
      <div className="mt-2.5 space-y-2">
        {rows.map(([k, n]) => (
          <div key={k}>
            <p className="flex justify-between gap-3 text-[12.5px]"><span className="min-w-0 truncate">{k}</span><b className="v2-num">{int(n)}</b></p>
            <span className="mt-1 block h-1 overflow-hidden rounded-full" style={{ background: "rgb(255 255 255 / 0.06)" }}><i className="block h-full rounded-full" style={{ width: `${Math.max(4, (n / Math.max(1, all.length)) * 100)}%`, background: "var(--v2-blue)" }} /></span>
          </div>
        ))}
        {!rows.length ? <p className="text-[12.5px] text-muted">—</p> : null}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow flex items-center gap-2">{paused ? null : <i className="v2-live" />}Équipe · OnlyFans et MYM</p>
          <h1 className="v2-h1 mt-1">En direct</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted">{paused ? "En pause" : "Mis à jour toutes les 10 secondes"}</span>
          <button type="button" onClick={() => setPaused(!paused)} className="v2-select">{paused ? <Play className="size-4 text-muted" /> : <Pause className="size-4 text-muted" />}{paused ? "Reprendre" : "Pause"}</button>
          <button type="button" onClick={full} className="v2-select" title="Afficher en plein écran (pour un écran d’équipe)"><Maximize2 className="size-4 text-muted" />Plein écran</button>
        </div>
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tile("Connectés", d ? int(all.length) : null, "ont Bloom ouvert en ce moment", 0)}
        {tile("Sur le chat", d ? int(on) : null, all.length ? `${int(all.length - on)} sur une autre page` : "personne ailleurs", 1)}
        {tile("Sur un fan", d ? int(all.filter((p) => p.fan).length) : null, "une conversation ouverte", 2)}
        {tile("Modèles couvertes", d ? `${int(covered.size)} / ${int(d.models.length)}` : null, "avec quelqu’un dessus", 3)}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="v2-card v2-rise min-w-0 p-3" style={{ ["--i" as string]: 6 }}>
          <div className="flex flex-wrap items-center gap-2 px-1">
            <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)" }}>
              <Search className="size-3.5 shrink-0 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Personne, modèle ou fan" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#5d5d66]" />
              {q ? <button type="button" onClick={() => setQ("")} aria-label="Effacer la recherche" className="text-muted hover:text-(--color-fg)"><X className="size-3.5" /></button> : null}
            </label>
            {d ? <ModelMenu all={d.models} value={model} onChange={setModel} /> : null}
            <div className="v2-segbar">
              <button type="button" className="v2-seg" data-on={!only} onClick={() => setOnly("")}>Tous<b className="v2-num font-bold opacity-70">{int(all.length)}</b></button>
              <button type="button" className="v2-seg" data-on={only === "on"} onClick={() => setOnly("on")}>Sur le chat<b className="v2-num font-bold opacity-70">{int(on)}</b></button>
              <button type="button" className="v2-seg" data-on={only === "off"} onClick={() => setOnly("off")}>Ailleurs<b className="v2-num font-bold opacity-70">{int(all.length - on)}</b></button>
            </div>
          </div>
          <div className="mt-3 grid gap-2.5 px-1 md:grid-cols-2 2xl:grid-cols-3">
            {shown.map((p) => {
              const worked = p.today.activeMs + p.today.idleMs;
              return (
                <div key={p.userId} className="min-w-0 rounded-[14px] border p-3.5" style={{ borderColor: p.active ? "rgb(52 211 153 / 0.28)" : "var(--color-line)" }}>
                  <div className="flex items-start gap-3">
                    <Avatar src={p.avatar} name={p.name} size="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2"><b className="min-w-0 truncate text-[14px]">{p.name}</b>{p.role ? <span className="v2-tag shrink-0">{p.role}</span> : null}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: p.active ? "var(--v2-up)" : "var(--color-muted)" }}><i className="size-1.5 rounded-full" style={{ background: "currentColor" }} />{p.active ? "Sur le chat" : "Sur une autre page"}<span className="text-muted">· connecté depuis {span((d?.now ?? Date.now()) - p.since)}</span></p>
                    </div>
                  </div>
                  <p className="mt-3 text-[12.5px] leading-relaxed">
                    <span className="font-semibold">{pageName(p.page)}</span>
                    {p.model ? <> · sur <b>{p.model}</b><span className="v2-dot ml-1.5 inline-block align-middle" data-pf={p.mym ? "mym" : "of"} title={p.mym ? "MYM" : "OnlyFans"} /></> : p.hidden ? <span className="text-muted"> · sur une modèle que tu ne vois pas</span> : null}
                    {p.fan ? <> · parle à <b>{p.fan}</b></> : null}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
                    <span className="flex items-center gap-1.5">{p.device.kind === "mobile" ? <Smartphone className="size-3.5" /> : <Monitor className="size-3.5" />}{p.device.label}</span>
                    {countryOf(p.country) ? <span>{countryOf(p.country)}</span> : null}
                  </p>
                  <p className="mt-2 border-t pt-2 text-[11.5px] text-muted" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>
                    Aujourd’hui : {worked ? <><b style={{ color: "var(--color-fg)" }}>{span(p.today.activeMs)}</b> sur le chat · {span(p.today.idleMs)} ailleurs</> : "tout juste arrivé"}{p.today.msgs ? <> · <b style={{ color: "var(--color-fg)" }}>{plural(p.today.msgs, "message")}</b>{p.today.ppv ? ` dont ${plural(p.today.ppv, "payant")}` : ""}</> : null}
                  </p>
                </div>
              );
            })}
          </div>
          {d && !shown.length ? <p className="py-14 text-center text-[13px] text-muted">{all.length ? "Personne ne correspond." : "Personne n’a Bloom ouvert en ce moment."}</p> : null}
          {!d && !err ? <p className="py-14 text-center text-[13px] text-muted">Chargement…</p> : null}
          <p className="mt-3 border-t px-1 pt-2.5 text-[11.5px] leading-relaxed text-muted" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>
            « Sur le chat » = la messagerie est ouverte ; « sur une autre page » = Bloom est ouvert ailleurs. Une personne compte une fois, sur son dernier appareil. Le temps et les messages d’aujourd’hui ne comptent que ce qui est fait dans Bloom. Le pays n’apparaît que si l’hébergeur le transmet ; Bloom ne connaît pas la ville.
          </p>
        </section>

        <aside className="min-w-0 space-y-3">
          <div className="v2-card v2-rise p-3.5" style={{ ["--i" as string]: 7 }}>
            <p className="v2-card-title">Modèles couvertes</p>
            <p className="mt-0.5 text-[12px] text-muted">Qui a quelqu’un dessus en ce moment.</p>
            <div className="v2-scroll mt-2.5 max-h-[340px] space-y-1 overflow-y-auto">
              {(d?.models ?? []).map((m) => {
                const n = covered.get(m.id) || 0;
                return (
                  <button key={m.id} type="button" onClick={() => setModel(model === m.id ? "" : m.id)} aria-pressed={model === m.id} className="v2-pick w-full" data-on={model === m.id} style={{ padding: "5px 8px", opacity: n ? 1 : 0.55 }}>
                    <Avatar src={m.avatar} name={m.name} size="size-6" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{m.name}</span>
                    <span className="v2-dot" data-pf={m.mym ? "mym" : "of"} title={m.mym ? "MYM" : "OnlyFans"} />
                    <b className="v2-num w-5 text-right text-[12.5px]" style={{ color: n ? "var(--v2-up)" : "var(--color-muted)" }}>{n}</b>
                  </button>
                );
              })}
              {d && !d.models.length ? <p className="text-[12.5px] text-muted">Aucune modèle.</p> : null}
            </div>
          </div>
          {bars("Appareils", devices)}
          {countries.length ? bars("Pays", countries) : null}
        </aside>
      </div>
    </div>
  );
}
