"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar } from "@/rv/components/ui";
import { Bars, downloadCsv, fmtDay, fmtDuration, int, PeriodBar, usePeriod, type BarPt } from "../kit";
import { errText, plural, useDebounced } from "../media/MediaKit";
import { dateOf, ModelMenu, timeOf, type TeamModel } from "./TeamKit";

// Bloom v2 → Équipe → Shifts (25/11/2026, « Constellation ») : les heures de travail de chacun, déduites des messages
// qu'il a envoyés DEPUIS Bloom (les seuls dont Bloom connaît l'auteur). Les deux plateformes ensemble : c'est un écran
// sur les personnes. Il remplace, dans la v2, la copie de MyPulse (« Contrôle des shifts », MYM seulement).
// Un shift = une suite de messages sans trou de plus de « coupure » minutes ; le temps actif additionne les écarts de
// moins de « pause » minutes. Lecture seule : `GET /api/v2/team/shifts` (app/v2team.mjs).
type M = { id: string; name: string; mym: boolean; n: number };
type Vac = { day: string; start: string; end: string; endDay: string; startAt: number; endAt: number; activeMin: number; messages: number; models: M[] };
type Person = {
  name: string; id: number | null; avatar: string | null; messages: number; activeMin: number; shifts: number; vacations: Vac[]; models: M[]; replyAvg: number | null; replyMedian: number | null;
  first: number; last: number; ppvPaid: number; ppvFree: number; bloomActiveMin: number; bloomIdleMin: number; bloomDays: number; minutes?: [number, number][];
};
type Data = {
  from: string; to: string; today: string; idle: number; cut: number; start: number; end: number; models: (TeamModel & { mym: boolean })[]; people: Person[];
  totals: { people: number; shifts: number; activeMin: number; messages: number; models: number; of: number }; unnamed: number;
};

const hmin = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`);
const clamp = (s: string, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Math.round(Number(s)) || d));
const HOUR = 3600_000;
const PER = 30;

/** L'activité d'une personne en barres : des tranches d'autant plus larges que la période est longue. */
function timeline(minutes: [number, number][], start: number, end: number): BarPt[] {
  const stop = Math.min(end, Date.now());
  const range = Math.max(HOUR, stop - start);
  const size = range <= 26 * HOUR ? 5 * 60_000 : range <= 80 * HOUR ? 15 * 60_000 : range <= 15 * 24 * HOUR ? HOUR : range <= 32 * 24 * HOUR ? 3 * HOUR : 6 * HOUR;
  const n = Math.ceil(range / size);
  const v = new Array<number>(n).fill(0);
  for (const [t, c] of minutes) {
    const i = Math.floor((t - start) / size);
    if (i >= 0 && i < n) v[i] += c;
  }
  const day = range > 26 * HOUR;
  return v.map((x, i) => {
    const t = start + i * size;
    return { key: String(t), label: day ? new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" }) : timeOf(t), title: `${dateOf(t)} · ${timeOf(t)}`, parts: [{ v: x, color: "#3b82f6", label: "Messages" }] };
  });
}
const Chips = ({ list, max = 4 }: { list: M[]; max?: number }) => (
  <span className="flex flex-wrap gap-1">
    {list.slice(0, max).map((m) => <span key={m.id} className="v2-tag max-w-[150px]"><span className="v2-dot" data-pf={m.mym ? "mym" : "of"} style={{ width: 6, height: 6 }} /><span className="truncate">{m.name}</span><b className="v2-num">{int(m.n)}</b></span>)}
    {list.length > max ? <span className="v2-tag">+{list.length - max}</span> : null}
  </span>
);

export function V2TeamShifts() {
  const period = usePeriod();
  const { from, to } = period;
  const [model, setModel] = useState("");
  const [idle, setIdle] = useState("3");
  const [cut, setCut] = useState("60");
  const rules = useDebounced(`${clamp(idle, 1, 60, 3)}|${clamp(cut, 1, 600, 60)}`, 500);
  const [who, setWho] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ key: string; d: Data } | null>(null);
  const [err, setErr] = useState("");
  const [i0, c0] = rules.split("|");
  const query = `from=${from}&to=${to}&idle=${i0}&cut=${c0}${model ? `&creatorId=${encodeURIComponent(model)}` : ""}${who ? `&person=${encodeURIComponent(who)}` : ""}`;
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current;
    api<Data>("GET", `/api/v2/team/shifts?${query}`)
      .then((d) => void (id === seq.current && (setData({ key: query, d }), setErr(""))))
      .catch((e) => void (id === seq.current && setErr(errText(e))));
  }, [query]);
  useEffect(() => setPage(1), [query]);

  const d = data?.d ?? null;
  const stale = !!data && data.key !== query;
  const me = who ? d?.people.find((p) => p.name === who) ?? null : null;
  const all = useMemo(() => (d ? d.people.flatMap((p) => p.vacations.map((v) => ({ ...v, name: p.name }))).sort((a, b) => b.startAt - a.startAt) : []), [d]);
  const list = me ? [...me.vacations].sort((a, b) => b.startAt - a.startAt).map((v) => ({ ...v, name: me.name })) : all;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const shown = list.slice((page - 1) * PER, page * PER);
  const cutNote = !!d && d.from > from;
  const bars = useMemo(() => (d && me?.minutes ? timeline(me.minutes, d.start, d.end) : []), [d, me]);
  const exportCsv = () => {
    if (!d) return;
    const fr = (day: string) => day.split("-").reverse().join("/");
    downloadCsv(
      `bloom-shifts-${d.from}_${d.to}_pause${d.idle}min_coupure${d.cut}min.csv`,
      ["Chatteur", "Jour", "Début", "Fin", "Jour de fin", "Temps actif (min)", "Messages", "Modèles"],
      [...all].reverse().map((v) => [v.name, fr(v.day), v.start, v.end, fr(v.endDay), String(v.activeMin), String(v.messages), v.models.map((m) => `${m.name} (${m.n})`).join(", ")]),
    );
  };
  const tile = (label: string, value: React.ReactNode, sub: React.ReactNode, i: number) => (
    <div key={label} className="v2-card v2-rise min-w-0 p-3.5" style={{ ["--i" as string]: i + 2 }}>
      <p className="truncate text-[12px] text-muted">{label}</p>
      <p className="v2-num mt-1 truncate text-[20px] leading-tight font-bold">{d ? value : <span className="text-muted">…</span>}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub}</p>
    </div>
  );
  const small = (v: string, set: (s: string) => void, label: string) => <input value={v} onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" aria-label={label} className="mx-1.5 h-8 w-14 rounded-lg border bg-transparent px-2 text-center text-[13px] outline-none focus:border-(--v2-blue)" style={{ borderColor: "var(--color-line)", color: "var(--color-fg)" }} />;
  const th = (label: string, right = false) => <th className={`px-3 py-2.5 font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"}`}>{label}</th>;

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Équipe · OnlyFans et MYM</p>
          <h1 className="v2-h1 mt-1">Shifts</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {d ? <ModelMenu all={d.models} value={model} onChange={setModel} /> : null}
          <button type="button" onClick={exportCsv} disabled={!all.length} className="v2-select" title="Télécharger le relevé : une ligne par shift (fichier pour Excel)"><Download className="size-4 text-muted" />Exporter</button>
        </div>
      </div>
      <PeriodBar period={period} />
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {cutNote ? <p className="mt-4 rounded-xl border px-4 py-3 text-[12.5px] text-muted" style={{ borderColor: "rgb(245 158 11 / 0.3)", background: "rgb(245 158 11 / 0.06)" }}>Le relevé porte sur 60 jours au plus : il commence le {fmtDay(d!.from, { day: "numeric", month: "long", year: "numeric" })}.</p> : null}

      <div className="v2-card v2-rise mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 text-[12.5px] text-muted" style={{ ["--i" as string]: 1 }}>
        <span>En pause après{small(idle, setIdle, "Minutes sans message avant une pause")}min sans message</span>
        <span>Nouveau shift après{small(cut, setCut, "Minutes de coupure avant un nouveau shift")}min de coupure</span>
        <span className="min-w-0 flex-1 text-right text-[11.5px]">Calculé sur les messages envoyés depuis Bloom.</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        {tile("Chatteurs actifs", d ? int(d.totals.people) : null, "ont écrit depuis Bloom", 0)}
        {tile("Shifts", d ? int(d.totals.shifts) : null, "sur la période", 1)}
        {tile("Temps actif cumulé", d ? hmin(d.totals.activeMin) : null, d && d.totals.people ? `${hmin(Math.round(d.totals.activeMin / d.totals.people))} par personne` : " ", 2)}
        {tile("Messages envoyés", d ? int(d.totals.messages) : null, d && d.totals.activeMin ? `${(d.totals.messages / (d.totals.activeMin / 60)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} par heure active` : " ", 3)}
        {tile("Modèles travaillées", d ? `${int(d.totals.models)} / ${int(d.totals.of)}` : null, "avec au moins un message", 4)}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]" style={{ opacity: stale ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
        {/* La colonne des personnes */}
        <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 7 }}>
          <div className="v2-card p-1.5">
            <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:max-h-[calc(100dvh-160px)] lg:space-y-0.5 lg:overflow-y-auto">
              <button type="button" onClick={() => setWho("")} className="v2-pick w-auto shrink-0 lg:w-full" data-on={!who} aria-pressed={!who}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full border" style={{ borderColor: "var(--color-line)" }}><Users className="size-4 text-muted" /></span>
                <span className="min-w-0 flex-1"><b className="block truncate text-[13px] leading-tight">Toute l’équipe</b><span className="mt-0.5 block truncate text-[11.5px] text-muted">{d ? plural(d.totals.people, "personne") : "…"}</span></span>
              </button>
              {(d?.people ?? []).map((p) => (
                <button key={p.name} type="button" onClick={() => setWho(p.name)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={who === p.name} aria-pressed={who === p.name} title={`Voir les shifts de ${p.name}`}>
                  <Avatar src={p.avatar} name={p.name} size="size-8" />
                  <span className="min-w-0 flex-1"><b className="block truncate text-[13px] leading-tight">{p.name}</b><span className="mt-0.5 block truncate text-[11.5px] text-muted">{hmin(p.activeMin)} · {plural(p.messages, "message")}</span></span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          {d && !d.people.length ? (
            <div className="v2-card v2-rise p-10 text-center text-[13.5px] leading-relaxed text-muted">
              Aucun message envoyé depuis Bloom sur cette période.
              {d.unnamed ? <span className="mt-1 block text-[12.5px]">Bloom a vu passer {plural(d.unnamed, "message")} écrit{d.unnamed > 1 ? "s" : ""} ailleurs (IA, autre outil, application de la plateforme), sans pouvoir dire par qui.</span> : null}
            </div>
          ) : null}

          {me && d ? (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                {[
                  tile("Premier message", `${dateOf(me.first)} · ${timeOf(me.first)}`, "début observé", 0),
                  tile("Dernier message", `${dateOf(me.last)} · ${timeOf(me.last)}`, "fin observée", 1),
                  tile("Temps actif", hmin(me.activeMin), `${plural(me.shifts, "shift")} · pause dès ${d.idle} min`, 2),
                  tile("Messages", int(me.messages), me.activeMin ? `${(me.messages / (me.activeMin / 60)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} par heure active` : " ", 3),
                  tile("Contenus proposés", int(me.ppvPaid + me.ppvFree), `${int(me.ppvPaid)} payant${me.ppvPaid > 1 ? "s" : ""} · ${int(me.ppvFree)} offert${me.ppvFree > 1 ? "s" : ""}`, 4),
                  tile("Part payante", me.messages ? `${((me.ppvPaid / me.messages) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : "—", "contenus payants ÷ messages", 5),
                  tile("Temps de réponse", me.replyAvg == null ? "—" : fmtDuration(me.replyAvg), me.replyMedian == null ? " " : `médiane ${fmtDuration(me.replyMedian)}`, 6),
                  tile("Bloom ouvert", hmin(me.bloomActiveMin + me.bloomIdleMin), me.bloomDays ? `${hmin(me.bloomActiveMin)} sur le chat · ${hmin(me.bloomIdleMin)} ailleurs` : "pas de relevé sur la période", 7),
                ]}
              </div>
              <section className="v2-card v2-rise p-4">
                <p className="v2-card-title">Activité de {me.name}</p>
                <p className="mt-0.5 text-[12px] text-muted">Messages envoyés au fil du temps : les vides sont les pauses.</p>
                <Bars key={data?.key} pts={bars} fmt={(v) => int(Math.round(v))} height={210} whole />
              </section>
            </>
          ) : null}

          {d && d.people.length && !me ? (
            <section className="v2-card v2-rise p-3">
              <p className="v2-card-title px-1">Relevé par personne</p>
              <p className="mt-0.5 px-1 text-[12px] text-muted">Un clic sur une ligne ouvre son détail.</p>
              <div className="v2-scroll mt-2 overflow-x-auto">
                <table className="w-full min-w-[900px] text-[12.5px]">
                  <thead>
                    <tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}>
                      {th("Chatteur")}{th("Shifts", true)}{th("Temps actif", true)}{th("Messages", true)}{th("Par heure active", true)}{th("Réponse", true)}{th("Contenus payants", true)}{th("Modèles")}{th("Du … au")}
                    </tr>
                  </thead>
                  <tbody>
                    {d.people.map((p) => (
                      <tr key={p.name} onClick={() => setWho(p.name)} className="cursor-pointer border-b transition-colors hover:bg-white/[0.03]" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                        <td className="max-w-[200px] px-3 py-2.5"><span className="flex items-center gap-2.5"><Avatar src={p.avatar} name={p.name} size="size-7" /><b className="min-w-0 truncate text-[13px]">{p.name}</b></span></td>
                        <td className="v2-num px-3 py-2.5 text-right">{int(p.shifts)}</td>
                        <td className="v2-num px-3 py-2.5 text-right text-[13px] font-bold whitespace-nowrap">{hmin(p.activeMin)}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{int(p.messages)}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{p.activeMin ? (p.messages / (p.activeMin / 60)).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"}</td>
                        <td className="v2-num px-3 py-2.5 text-right whitespace-nowrap" title={p.replyMedian == null ? undefined : `Médiane : ${fmtDuration(p.replyMedian)}`}>{p.replyAvg == null ? <span className="text-muted">—</span> : fmtDuration(p.replyAvg)}</td>
                        <td className="v2-num px-3 py-2.5 text-right">{p.ppvPaid ? int(p.ppvPaid) : <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-2.5"><Chips list={p.models} max={3} /></td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted">{dateOf(p.first)} {timeOf(p.first)} → {dateOf(p.last)} {timeOf(p.last)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {d && list.length ? (
            <section className="v2-card v2-rise p-3">
              <p className="v2-card-title px-1">{me ? `Les shifts de ${me.name}` : "Tous les shifts"}</p>
              <p className="mt-0.5 px-1 text-[12px] text-muted">Une ligne par shift : en pause dès {d.idle} min sans message, nouveau shift dès {d.cut} min de coupure.</p>
              <div className="v2-scroll mt-2 overflow-x-auto">
                <table className="w-full min-w-[760px] text-[12.5px]">
                  <thead>
                    <tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}>
                      {th("Jour")}{me ? null : th("Chatteur")}{th("Début")}{th("Fin")}{th("Temps actif", true)}{th("Messages", true)}{th("Modèles")}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((v) => (
                      <tr key={`${v.name}|${v.startAt}`} className="border-b" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                        <td className="px-3 py-2 whitespace-nowrap first-letter:uppercase">{fmtDay(v.day, { weekday: "short", day: "numeric", month: "short" })}</td>
                        {me ? null : <td className="max-w-[170px] truncate px-3 py-2 font-bold">{v.name}</td>}
                        <td className="v2-num px-3 py-2">{v.start}</td>
                        <td className="v2-num px-3 py-2 whitespace-nowrap">{v.end}{v.endDay !== v.day ? <span className="ml-1.5 text-[11px] text-muted">le lendemain</span> : null}</td>
                        <td className="v2-num px-3 py-2 text-right font-bold whitespace-nowrap">{hmin(v.activeMin)}</td>
                        <td className="v2-num px-3 py-2 text-right">{int(v.messages)}</td>
                        <td className="px-3 py-2"><Chips list={v.models} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {list.length > PER ? (
                <div className="flex flex-wrap items-center gap-2 px-1 pt-3 text-[12.5px] text-muted">
                  <span className="v2-num flex-1">{int((page - 1) * PER + 1)}–{int(Math.min(page * PER, list.length))} sur {plural(list.length, "shift")}</span>
                  <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}><ChevronLeft className="size-4" />Plus récents</button>
                  <span className="v2-num">{page} / {pages}</span>
                  <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}>Plus anciens<ChevronRight className="size-4" /></button>
                </div>
              ) : null}
            </section>
          ) : null}

          <p className="px-1 text-[11.5px] leading-relaxed text-muted">
            Bloom connaît l’auteur d’un message seulement quand il est écrit depuis Bloom : ce qui est écrit par l’IA, sur la plateforme ou dans un autre outil n’entre pas dans ce relevé{d?.unnamed && d.people.length ? ` (${plural(d.unnamed, "message")} sur la période)` : ""}. Temps de réponse : du premier message du fan resté sans réponse à la réponse, quand elle arrive en moins de 30 minutes. « Bloom ouvert » : le temps passé avec Bloom affiché, sur le chat ou ailleurs. Heures de Paris.
          </p>
        </div>
      </div>
    </div>
  );
}
