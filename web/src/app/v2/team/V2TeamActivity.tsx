"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { api, toast } from "@/lib/api";
import { downloadCsv, int, PeriodBar, usePeriod } from "../kit";
import { errText, plural } from "../media/MediaKit";
import { dateOf, ModelMenu, timeOf, type TeamModel } from "./TeamKit";

// Bloom v2 → Équipe → Activité (25/11/2026, « Constellation ») : le journal des actions faites DANS Bloom (60 jours) —
// qui, quand, sur quelle modèle, quel fan. Les deux plateformes ensemble : c'est un écran sur les personnes.
// Lecture seule : `GET /api/v2/team/activity` (app/v2team.mjs, table `bl_actions` remplie par journal.mjs).
type Row = { id: number; at: number; user: string | null; model: string; mym: boolean; fan: string | null; action: string; details: string | null };
type Data = {
  from: string; to: string; today: string; total: number; users: number; fans: number; page: number; pages: number; size: number;
  split: { action: string; n: number }[]; people: string[]; models: (TeamModel & { mym: boolean })[]; rows: Row[]; since: number | null;
};

/** La couleur d'une action : rouge pour ce qui retire ou bloque, ambre pour les droits, bleu pour le reste. */
const tone = (a: string): React.CSSProperties =>
  /bloqué|suspect|supprim|retir|délié|annul/i.test(a) ? { color: "var(--v2-down)", background: "rgb(244 63 94 / 0.13)" }
  : /droit|accès|rôle/i.test(a) ? { color: "#fbbf24", background: "rgb(245 158 11 / 0.14)" }
  : { color: "var(--v2-sky)", background: "rgb(59 130 246 / 0.14)" };
const stamp = (t: number) => `${dateOf(t)} · ${new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

export function V2TeamActivity() {
  const period = usePeriod();
  const { from, to } = period;
  const [model, setModel] = useState("");
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");
  const [size, setSize] = useState(50);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ key: string; d: Data } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `from=${from}&to=${to}${model ? `&creatorId=${encodeURIComponent(model)}` : ""}${user ? `&user=${encodeURIComponent(user)}` : ""}${action ? `&action=${encodeURIComponent(action)}` : ""}`;
  const query = `${base}&size=${size}&page=${page}`;
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current;
    api<Data>("GET", `/api/v2/team/activity?${query}`)
      .then((d) => void (id === seq.current && (setData({ key: query, d }), setErr(""))))
      .catch((e) => void (id === seq.current && setErr(errText(e))));
  }, [query]);
  useEffect(() => setPage(1), [base, size]);

  const d = data?.d ?? null;
  const stale = !!data && data.key !== query;
  // Le journal garde 60 jours : une période plus longue est ramenée à ce qu'il contient.
  const cut = !!d && d.from > from;
  const exportAll = async () => {
    if (!d) return;
    setBusy(true);
    try {
      const out: Row[] = [];
      for (let p = 1; p <= 25; p++) {
        const r = await api<Data>("GET", `/api/v2/team/activity?${base}&size=200&page=${p}`);
        out.push(...r.rows);
        if (p >= r.pages) break;
      }
      downloadCsv(`bloom-activite-${d.from}_${d.to}.csv`, ["Date", "Heure", "Personne", "Action", "Modèle", "Plateforme", "Fan", "Détails"], out.map((r) => [new Date(r.at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }), new Date(r.at).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris" }), r.user ?? "", r.action, r.model, r.model ? (r.mym ? "MYM" : "OnlyFans") : "", r.fan ?? "", r.details ?? ""]));
      if (d.total > out.length) toast(`Export limité aux ${int(out.length)} actions les plus récentes`);
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy(false);
  };
  const tile = (label: string, value: string | null, sub: string, i: number) => (
    <div className="v2-card v2-rise min-w-0 p-3.5" style={{ ["--i" as string]: i + 2 }}>
      <p className="truncate text-[12px] text-muted">{label}</p>
      <p className="v2-num mt-1 truncate text-[22px] leading-tight font-bold">{value ?? <span className="text-muted">…</span>}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub}</p>
    </div>
  );
  const field = "v2-field";

  return (
    <div className="mx-auto max-w-[1280px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Équipe · OnlyFans et MYM</p>
          <h1 className="v2-h1 mt-1">Activité</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {d ? <ModelMenu all={d.models} value={model} onChange={setModel} /> : null}
          <button type="button" onClick={() => void exportAll()} disabled={!d?.total || busy} className="v2-select" title="Télécharger les actions de cette sélection (fichier pour Excel)"><Download className="size-4 text-muted" />{busy ? "Préparation…" : "Exporter"}</button>
        </div>
      </div>
      <PeriodBar period={period} />
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {cut ? <p className="mt-4 rounded-xl border px-4 py-3 text-[12.5px] text-muted" style={{ borderColor: "rgb(245 158 11 / 0.3)", background: "rgb(245 158 11 / 0.06)" }}>Le journal garde 60 jours : la période affichée commence le {dateOf(Date.parse(`${d!.from}T12:00:00Z`), true)}.</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {tile("Actions", d ? int(d.total) : null, "sur la période", 0)}
        {tile("Personnes actives", d ? int(d.users) : null, "ont fait au moins une action", 1)}
        {tile("Fans concernés", d ? int(d.fans) : null, "par une action sur leur fiche ou leur conversation", 2)}
      </div>

      <section className="v2-card v2-rise mt-3 p-3" style={{ ["--i" as string]: 6, opacity: stale ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <p className="v2-card-title min-w-0 flex-1">Journal</p>
          <div className="w-[210px]"><select value={user} onChange={(e) => setUser(e.target.value)} aria-label="Personne" className={field} style={{ height: 36, colorScheme: "dark", fontSize: 12.5 }}><option value="" style={{ background: "#121215" }}>Toute l’équipe</option>{(d?.people ?? []).map((n) => <option key={n} value={n} style={{ background: "#121215" }}>{n}</option>)}</select></div>
          {user || action || model ? <button type="button" onClick={() => (setUser(""), setAction(""), setModel(""))} className="v2-tool">Tout afficher</button> : null}
        </div>
        {d?.split.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5 px-1">
            {d.split.map((s) => {
              const on = action === s.action;
              return <button key={s.action} type="button" aria-pressed={on} onClick={() => setAction(on ? "" : s.action)} title={on ? "Ne plus filtrer sur cette action" : "Ne voir que cette action"} className="v2-tag transition-opacity" style={{ ...tone(s.action), padding: "3px 8px", fontSize: 11.5, opacity: action && !on ? 0.45 : 1, boxShadow: on ? "0 0 0 1px currentColor" : undefined }}>{s.action}<b className="v2-num ml-1">{int(s.n)}</b></button>;
            })}
          </div>
        ) : null}

        <div className="v2-scroll mt-3 overflow-x-auto" hidden={!d?.rows.length}>
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead>
              <tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}>
                <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                <th className="px-3 py-2.5 text-left font-semibold">Personne</th>
                <th className="px-3 py-2.5 text-left font-semibold">Action</th>
                <th className="px-3 py-2.5 text-left font-semibold">Modèle</th>
                <th className="px-3 py-2.5 text-left font-semibold">Fan</th>
                <th className="px-3 py-2.5 text-left font-semibold">Détails</th>
              </tr>
            </thead>
            <tbody>
              {(d?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-b" style={{ borderColor: "rgb(255 255 255 / 0.05)" }}>
                  <td className="v2-num px-3 py-2 whitespace-nowrap text-muted" title={timeOf(r.at)}>{stamp(r.at)}</td>
                  <td className="max-w-[170px] truncate px-3 py-2 text-[13px] font-bold">{r.user ? <button type="button" onClick={() => setUser(r.user!)} title="Ne voir que ses actions" className="underline-offset-2 hover:underline">{r.user}</button> : <span className="font-normal text-muted">—</span>}</td>
                  <td className="px-3 py-2"><span className="v2-tag" style={{ ...tone(r.action), padding: "2px 7px", fontSize: 11.5 }}>{r.action}</span></td>
                  <td className="max-w-[170px] px-3 py-2">{r.model ? <span className="flex items-center gap-1.5"><span className="truncate">{r.model}</span><span className="v2-dot" data-pf={r.mym ? "mym" : "of"} title={r.mym ? "MYM" : "OnlyFans"} /></span> : <span className="text-muted">—</span>}</td>
                  <td className="max-w-[160px] truncate px-3 py-2">{r.fan ?? <span className="text-muted">—</span>}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-muted" title={r.details ?? undefined}>{r.details ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d && !d.rows.length ? <p className="py-12 text-center text-[13px] text-muted">{user || action || model ? "Aucune action ne correspond." : "Aucune action sur cette période."}</p> : null}
        {d && d.total > d.size ? (
          <div className="flex flex-wrap items-center gap-2 px-1 pt-3 text-[12.5px] text-muted">
            <span className="v2-num flex-1">{int((d.page - 1) * d.size + 1)}–{int(Math.min(d.page * d.size, d.total))} sur {plural(d.total, "action")}</span>
            <div className="w-[130px]"><select value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Actions par page" className={field} style={{ height: 32, colorScheme: "dark", fontSize: 12 }}>{[50, 100, 200].map((n) => <option key={n} value={n} style={{ background: "#121215" }}>{n} par page</option>)}</select></div>
            <button type="button" disabled={d.page <= 1} onClick={() => setPage(d.page - 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}><ChevronLeft className="size-4" />Plus récentes</button>
            <span className="v2-num">{int(d.page)} / {int(d.pages)}</span>
            <button type="button" disabled={d.page >= d.pages} onClick={() => setPage(d.page + 1)} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 10px" }}>Plus anciennes<ChevronRight className="size-4" /></button>
          </div>
        ) : null}
        <p className="mt-3 border-t px-1 pt-2.5 text-[11.5px] leading-relaxed text-muted" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>
          Seules les actions faites dans Bloom sont notées (pas celles faites sur OnlyFans, sur MYM ou dans un autre outil){d?.since ? `, depuis le ${dateOf(d.since, true)}` : ""}. Les messages envoyés ne sont pas listés ici : ils sont dans « Messages ». Les actions sans modèle (droits, mots interdits) ne sont visibles que des admins et managers. Heures de Paris.
        </p>
      </section>
    </div>
  );
}
