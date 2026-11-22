"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Info, RefreshCw, Search } from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn } from "@/lib/fmt";
import { Avatar } from "@/components/ui";

// Analytics → Creator reports → « Creator performance » : copie de l'onglet d'Infloww. Une créatrice à la fois (liste à
// gauche) : gains par période (filtre par canal), répartition des gains, heatmap des PPV achetés, chargebacks.
type Change = number | null;
type Gran = "hour" | "day" | "week" | "month";
type Channel = "subscriptions" | "tips" | "posts" | "messages" | "referrals" | "streams";
type Account = { id: string; name: string; avatar: string | null; creatorId?: string | null };
type Perf = {
  from: string; to: string; days: number; gran: Gran; net: boolean; accounts: Account[]; account: string | null;
  summary: Record<"total" | Channel, { v: number; change: Change }>;
  trends: ({ label: string; total: number; refunds: number; change: Change } & Record<Channel, number>)[];
  heatmap: { day: string; hours: number[] }[];
};

const BLUE = "#2f6bff";
const PCH: { key: Channel; label: string; color: string }[] = [
  { key: "subscriptions", label: "Subscriptions", color: "#3b82f6" },
  { key: "tips", label: "Tips", color: "#2ec4a6" },
  { key: "posts", label: "Posts", color: "#f0546c" },
  { key: "messages", label: "Messages", color: "#f7a14a" },
  { key: "referrals", label: "Referrals", color: "#38bdf8" },
  { key: "streams", label: "Streams", color: "#c055f0" },
];
// Montants comme Infloww dans cet onglet : « $1670.4 », « $412 ».
const amt = (v: number) => `$${+v.toFixed(2)}`;
const pctTxt = (c: number) => `${c.toFixed(2)}%`;
// Graduations « rondes » comme Infloww (pas de 1, 2 ou 5 × 10ⁿ, 5 intervalles environ) : 454 → 0, 100 … 500.
export const niceTicks = (max: number) => {
  if (max <= 0) return [0, 1];
  const raw = max / 5;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toFixed(6));
};
const growth = (a: number, b: number | undefined) => (b == null ? null : b ? ((a - b) / b) * 100 : a ? 100 : 0);

export function Performance({ range, net, gran, accounts, t, lang }: { range: { from: string; to: string }; net: boolean; gran: Gran; accounts: Account[]; t: (s: string) => string; lang: string }) {
  const [acc, setAcc] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [data, setData] = useState<Perf | null>(null);
  const [busy, setBusy] = useState(false);
  const [chan, setChan] = useState<"all" | Channel>("all");
  const [nonce, setNonce] = useState(0);
  const list = useMemo(() => [...accounts].sort((a, b) => a.name.localeCompare(b.name)), [accounts]);
  // Messages à répondre par créatrice (pastille rouge, comme Infloww).
  const [unread, setUnread] = useState<Record<string, number>>({});
  useEffect(() => {
    const load = () =>
      api<{ counts: Record<string, number> }>("GET", "/api/rv/inbox?tab=reply&window=72")
        .then((r) => setUnread(r.counts || {}))
        .catch(() => {});
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!acc && list.length) setAcc(list[0].id);
  }, [acc, list]);

  useEffect(() => {
    if (!acc) return;
    setBusy(true);
    const p = new URLSearchParams({ from: range.from, to: range.to, net: net ? "1" : "0", gran, accounts: acc });
    api<Perf>("GET", `/api/of-reports/performance?${p}`)
      .then(setData)
      .catch((e) => toast((e as Error).message, "err"))
      .finally(() => setBusy(false));
  }, [acc, range, net, gran, nonce]);

  const parse = (s: string) => new Date(`${s}T12:00:00`);
  const dateLabel = (s: string) => {
    if (data?.gran === "hour") return new Date(s).toLocaleTimeString(lang, { hour: "numeric", day: "numeric", month: "short" });
    if (data?.gran === "month") return parse(`${s}-15`).toLocaleDateString(lang, { month: "short", year: "numeric" });
    return parse(s).toLocaleDateString(lang, { month: "short", day: "numeric" });
  };
  const bars = (data?.trends ?? []).map((x, i, a) => {
    const v = chan === "all" ? x.total : x[chan];
    const pv = i ? (chan === "all" ? a[i - 1].total : a[i - 1][chan]) : undefined;
    return { label: x.label, v, g: growth(v, pv) };
  });
  const cb = (data?.trends ?? []).map((x, i, a) => ({ label: x.label, v: x.refunds, g: growth(x.refunds, i ? a[i - 1].refunds : undefined) }));
  const parts = PCH.map((c) => ({ ...c, v: data?.summary[c.key].v ?? 0, change: data?.summary[c.key].change ?? 0 }));
  const sum = parts.reduce((a, b) => a + b.v, 0);

  return (
    <div className="mt-2 flex gap-3">
      {/* Créatrices */}
      <div className="flex w-[184px] shrink-0 flex-col gap-2">
        <div className="flex gap-2">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-1 rounded-md border px-2.5" style={{ borderColor: "var(--of-line)", background: "var(--of-field)" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
            <Search className="size-4 shrink-0" style={{ color: "var(--of-muted)" }} />
          </label>
          <button onClick={() => setNonce((n) => n + 1)} title={t("Refresh")} className="grid size-10 place-items-center rounded-md border" style={{ borderColor: "var(--of-line)", background: "var(--of-field)" }}>
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
          </button>
        </div>
        <div className="flex h-8 items-center justify-between rounded-md px-3 text-[14px]" style={{ background: "var(--of-pick-bar)", color: BLUE }}>
          {t("All creators")} <ChevronDown className="size-3.5" style={{ color: "var(--of-muted)" }} />
        </div>
        <div className="of-scroll sticky top-16 flex max-h-[calc(100vh-200px)] flex-col overflow-y-auto rounded-md" style={{ background: "var(--of-pick-list)" }}>
          {list
            .filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()))
            .map((a) => (
              <button key={a.id} onClick={() => setAcc(a.id)} className="flex items-center gap-2.5 px-3 py-3.5 text-left text-[14px] font-medium" style={acc === a.id ? { background: "var(--of-pick)" } : undefined}>
                <span className="relative shrink-0">
                  <Avatar src={a.avatar} name={a.name} size="size-9" rounded="rounded-md" />
                  <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 bg-emerald-500" style={{ borderColor: "var(--of-pick-list)" }} />
                </span>
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {a.creatorId && unread[a.creatorId] ? (
                  <span className="rounded-full px-1.5 text-[10px] leading-4 font-bold text-white tabular-nums" style={{ background: "#f26b6b" }}>
                    {unread[a.creatorId] > 99 ? "99+" : unread[a.creatorId]}
                  </span>
                ) : null}
              </button>
            ))}
        </div>
      </div>

      {/* Graphiques */}
      <div className="min-w-0 flex-1 rounded-xl p-5" style={{ background: "var(--of-card)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Title tip={t("Earnings of the creator in the selected period")}>{t("Earnings")}</Title>
          <div className="flex flex-wrap gap-2">
            {(["all", ...PCH.map((c) => c.key)] as const).map((k) => (
              <button key={k} onClick={() => setChan(k)} className="rounded-md border px-3.5 py-1 text-[13px]" style={chan === k ? { background: BLUE, borderColor: BLUE, color: "#fff" } : { borderColor: "var(--of-line)" }}>
                {t(k === "all" ? "All" : PCH.find((c) => c.key === k)!.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ left: -10, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--of-line)" />
              <XAxis dataKey="label" tickFormatter={dateLabel} tickLine={false} axisLine={{ stroke: "var(--of-line)" }} tick={{ fill: "var(--of-muted)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--of-muted)", fontSize: 12 }} ticks={niceTicks(Math.max(0, ...bars.map((b) => b.v)))} domain={[0, "dataMax"]} />
              <Tooltip
                cursor={<BarCursor />}
                content={({ active, payload }) => {
                  const x = active && payload?.[0]?.payload;
                  if (!x) return null;
                  return (
                    <Tip>
                      <p>{dateLabel(x.label)}</p>
                      <p>{t("Earnings")}: {amt(x.v)}</p>
                      {x.g != null ? <p>{t("Growth")}: {pctTxt(x.g)}</p> : null}
                    </Tip>
                  );
                }}
              />
              <Bar dataKey="v" fill={BLUE} maxBarSize={26} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Répartition */}
        <div className="mt-8">
          <Title tip={t("Share of each channel in the creator's earnings")}>{t("Earnings breakdown")}</Title>
          <div className="mt-3 flex flex-col overflow-hidden rounded-lg border md:flex-row" style={{ borderColor: "var(--of-line)" }}>
            <div className="flex min-w-0 flex-1 flex-col justify-between p-6">
              <div className="mx-auto size-[170px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sum ? parts.filter((p) => p.v > 0) : [{ key: "none", v: 1, color: "var(--of-line)" }]} dataKey="v" innerRadius={66} outerRadius={78} stroke="none" isAnimationActive={false}>
                      {(sum ? parts.filter((p) => p.v > 0) : [{ color: "var(--of-line)" }]).map((p, i) => (
                        <Cell key={i} fill={p.color} />
                      ))}
                    </Pie>
                    {sum ? (
                      <Tooltip
                        content={({ active, payload }) => {
                          const x = active && payload?.[0]?.payload;
                          if (!x) return null;
                          return (
                            <Tip>
                              <p>{t("Total earnings from:")}</p>
                              <p className="flex items-center justify-between gap-6">
                                <span className="flex items-center gap-1.5">
                                  <span className="size-2 rounded-full" style={{ background: x.color }} />
                                  {t(x.label)}
                                </span>
                                <b>{amt(x.v)}</b>
                              </p>
                            </Tip>
                          );
                        }}
                      />
                    ) : null}
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
                {parts.map((p) => (
                  <div key={p.key}>
                    <p className="text-[12px]" style={{ color: "var(--of-muted)" }}>{t(p.label)}</p>
                    <p className="flex items-baseline gap-2">
                      <span className="size-1.5 -translate-y-0.5 rounded-full" style={{ background: p.color }} />
                      <span className="text-[17px] font-semibold">{amt(p.v)}</span>
                      <span className="text-[13px]" style={{ color: "var(--of-muted)" }}>{sum ? +((p.v / sum) * 100).toFixed(2) : 0}%</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="w-full border-t md:w-[314px] md:border-t-0 md:border-l" style={{ borderColor: "var(--of-line)" }}>
              {parts.map((p) => {
                const up = (p.change ?? 0) >= 0;
                const col = up ? "#2ec4a6" : "#f0546c";
                return (
                  <div key={p.key} className="flex items-center justify-between border-b px-4 py-2.5 last:border-b-0" style={{ borderColor: "var(--of-line)" }}>
                    <div>
                      <p className="flex items-center gap-1.5 text-[15px] font-semibold">
                        {amt(p.v)}
                        <span className="flex items-center gap-0.5 text-[12px]" style={{ color: col }}>
                          <span className="grid size-3 place-items-center rounded-[2px]" style={{ background: col }}>
                            {up ? <ArrowUpRight className="size-2.5 text-black" /> : <ArrowDownRight className="size-2.5 text-black" />}
                          </span>
                          {(p.change ?? 0).toFixed(2)}%
                        </span>
                      </p>
                      <p className="text-[12px]" style={{ color: "var(--of-muted)" }}>{t(p.label)}</p>
                    </div>
                    <div className="h-8 w-[60px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={(data?.trends ?? []).map((x) => ({ v: x[p.key] }))}>
                          <YAxis hide domain={["dataMin", "dataMax"]} />
                          <Line dataKey="v" stroke={col} strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div className="mt-8">
          <Title tip={t("Heat intensity shows the number of PPVs bought per time slot, identifying top performing days and hours within a week")}>{t("Earnings heatmap")}</Title>
          <Heatmap rows={data?.heatmap ?? []} t={t} lang={lang} />
        </div>

        {/* Chargebacks */}
        <div className="mt-8">
          <Title tip={t("Refunded earnings per period")}>{t("Chargebacks")}</Title>
          <div className="mt-3 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cb} margin={{ left: -10, right: 20, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--of-line)" />
                <XAxis dataKey="label" tickFormatter={dateLabel} tickLine={false} axisLine={false} tick={{ fill: "var(--of-muted)", fontSize: 12 }} padding={{ left: 30, right: 30 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--of-muted)", fontSize: 12 }} domain={[0, (m: number) => (m > 0 ? m : 1)]} />
                <Tooltip
                  cursor={{ stroke: "var(--of-text)", strokeDasharray: "4 4" }}
                  content={({ active, payload }) => {
                    const x = active && payload?.[0]?.payload;
                    if (!x) return null;
                    return (
                      <Tip>
                        <p>{dateLabel(x.label)}</p>
                        <p>{t("Earnings")}: {amt(x.v)}</p>
                        {x.g != null ? <p>{t("Growth")}: {pctTxt(x.g)}</p> : null}
                      </Tip>
                    );
                  }}
                />
                <Line dataKey="v" stroke={BLUE} strokeWidth={4} dot={{ r: 4, fill: "#fff", stroke: BLUE, strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Curseur d'Infloww sur les barres : une seule ligne verticale pointillée au milieu de la barre (pas un cadre). */
export function BarCursor(p: { x?: number; y?: number; width?: number; height?: number }) {
  if (p.x == null || p.y == null || p.width == null || p.height == null) return null;
  const x = p.x + p.width / 2;
  return <line x1={x} x2={x} y1={p.y} y2={p.y + p.height} stroke="var(--of-text)" strokeWidth={1} strokeDasharray="4 3" />;
}

function Title({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <h3 className="flex items-center gap-2 text-[16px] font-semibold">
      {children}
      <span title={tip}>
        <Info className="size-3.5" style={{ color: "var(--of-muted)" }} />
      </span>
    </h3>
  );
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-3 py-2 text-[14px] leading-6 text-white" style={{ background: "#121212", borderColor: "rgba(255,255,255,.35)" }}>
      {children}
    </div>
  );
}

/** Heatmap jour × heure (nombre de PPV achetés), avec le curseur min / max d'Infloww qui masque les cases hors plage. */
function Heatmap({ rows, t, lang }: { rows: { day: string; hours: number[] }[]; t: (s: string) => string; lang: string }) {
  const max = Math.max(0, ...rows.flatMap((r) => r.hours));
  const [lo, setLo] = useState(0);
  const [hi, setHi] = useState(max);
  useEffect(() => (setLo(0), setHi(max)), [max]);
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const hourTxt = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(lang, { hour: "numeric" });
  const dayTxt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString(lang, { month: "short", day: "numeric" });
  // Bleu très clair → bleu d'Infloww selon le nombre de ventes.
  const color = (n: number) => {
    const k = max ? n / max : 0;
    const mix = (a: number, b: number) => Math.round(a + (b - a) * k);
    return `rgb(${mix(222, 47)}, ${mix(230, 107)}, ${mix(255, 255)})`;
  };
  const pos = (v: number) => (max ? (v / max) * 100 : 0);
  return (
    <div className="mt-3">
      <div className="flex">
        <div className="flex w-14 shrink-0 flex-col">
          {rows.map((r, d) => (
            <div key={r.day} className="flex h-[58px] items-center text-[12px]">
              <span className={cn("rounded px-1", hover?.d === d && "font-semibold")} style={hover?.d === d ? { background: "var(--of-line)" } : { color: "var(--of-muted)" }}>
                {dayTxt(r.day)}
              </span>
            </div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 border-b border-l" style={{ borderColor: "var(--of-line)" }} onMouseLeave={() => setHover(null)}>
          {rows.map((r, d) => (
            <div key={r.day} className="grid h-[58px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
              {r.hours.map((n, h) => {
                const show = n > 0 && n >= lo && n <= hi;
                return <div key={h} onMouseEnter={() => setHover({ d, h })} style={{ background: show ? color(n) : "transparent" }} />;
              })}
            </div>
          ))}
          {hover && rows[hover.d] ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 border-t border-dashed" style={{ top: hover.d * 58 + 29, borderColor: "var(--of-muted)" }} />
              <div className="pointer-events-none absolute inset-y-0 border-l border-dashed" style={{ left: `${((hover.h + 0.5) / 24) * 100}%`, borderColor: "var(--of-muted)" }} />
              <div className="pointer-events-none absolute z-10" style={{ top: hover.d * 58 + 40, left: `calc(${((hover.h + 0.5) / 24) * 100}% + 24px)` }}>
                <Tip>
                  <p className="whitespace-nowrap">
                    {dayTxt(rows[hover.d].day)} {t("at")} {hourTxt(hover.h)}
                  </p>
                  <p className="whitespace-nowrap">{t("Total sales")}: {rows[hover.d].hours[hover.h]}</p>
                </Tip>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="ml-14 grid" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="mt-1 text-center text-[11px] whitespace-nowrap" style={{ color: "var(--of-muted)" }}>
            <span className="rounded px-1" style={hover?.h === h ? { background: "var(--of-line)", color: "var(--of-text)" } : undefined}>
              {hourTxt(h)}
            </span>
          </span>
        ))}
      </div>
      {/* Curseur min / max */}
      <div className="mx-auto mt-6 w-[144px]">
        <div className="relative h-4 text-[10px]" style={{ color: "var(--of-muted)" }}>
          <span className="absolute -translate-x-1/2" style={{ left: `${pos(lo)}%` }}>{lo}</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${pos(hi)}%` }}>{hi}</span>
        </div>
        <div className="relative h-5 rounded" style={{ background: "#9a9a9a" }}>
          <div className="absolute inset-y-0 rounded" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%`, background: `linear-gradient(90deg, rgb(222,230,255), ${BLUE})` }} />
          {max ? (
            <>
              <input type="range" min={0} max={max} value={lo} onChange={(e) => setLo(Math.min(Number(e.target.value), hi))} className="of-range absolute inset-0 w-full" aria-label="min" />
              <input type="range" min={0} max={max} value={hi} onChange={(e) => setHi(Math.max(Number(e.target.value), lo))} className="of-range absolute inset-0 w-full" aria-label="max" />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
