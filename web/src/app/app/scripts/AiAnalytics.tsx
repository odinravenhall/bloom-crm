"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Bot, Users } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { BLUE } from "./ScriptLibrary";

// Analytics des scripts de l'IA (chiffres de Substy), dans le thème d'Infloww : envoyés, achetés, taux de déblocage,
// revenus, courbe par jour et tableau par script.
type T = (s: string) => string;
type Row = { id: string; name: string; sent: number; paid: number; unlockRate: number; revenue: number; enabled: boolean; ai: boolean; human: boolean; steps: number | null };
type Data = { currency: string; totals: { sent: number; paid: number; unlockRate: number; revenue: number }; daily: { date: string; sent: number; paid: number; revenue: number }[]; scripts: Row[]; idle: Omit<Row, "sent" | "paid" | "unlockRate" | "revenue">[]; changes: { what: string; detail: string; at: number; name: string | null }[] };
const PRESETS: [string, number][] = [["Today", 0], ["Last 7 days", 6], ["Last 30 days", 29], ["Last 90 days", 89]];
const ymd = (d: Date) => d.toLocaleDateString("sv-SE");

export function AiAnalytics({ t }: { t: T }) {
  const { creatorId } = useCreators();
  const [days, setDays] = useState(29);
  const [range, setRange] = useState(() => ({ from: ymd(new Date(Date.now() - 29 * 864e5)), to: ymd(new Date()) }));
  const [d, setD] = useState<Data | null>(null);
  const [sort, setSort] = useState<keyof Row>("revenue");
  const [metric, setMetric] = useState<"revenue" | "sent" | "paid">("revenue");
  useEffect(() => {
    if (!creatorId) return;
    setD(null);
    const p = new URLSearchParams({ creatorId, start: `${range.from}T00:00:00`, end: `${range.to}T23:59:59` });
    api<Data>("GET", `/api/ai-scripts/stats?${p}`).then(setD).catch((e) => toast((e as Error).message, "err"));
  }, [creatorId, range]);
  const cur = d?.currency === "EUR" ? "€" : "$";
  const money = (v: number) => `${cur}${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const rows = useMemo(() => [...(d?.scripts ?? [])].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : Number(b[sort]) - Number(a[sort]))), [d, sort]);
  const pick = (n: number) => {
    setDays(n);
    setRange({ from: ymd(new Date(Date.now() - n * 864e5)), to: ymd(new Date()) });
  };
  const tiles: [string, string, string?][] = d
    ? [["Scripts sent", String(d.totals.sent)], ["Bought", String(d.totals.paid)], ["Unlock rate", `${d.totals.unlockRate.toFixed(1)}%`], ["Revenue", money(d.totals.revenue)], ["Revenue per send", d.totals.sent ? money(d.totals.revenue / d.totals.sent) : "—"]]
    : [];
  const H = ({ k, label }: { k: keyof Row; label: string }) => (
    <th className="cursor-pointer px-3 py-3 text-left font-medium whitespace-nowrap" onClick={() => setSort(k)} style={{ color: sort === k ? BLUE : undefined }}>{t(label)}{sort === k ? " ↓" : ""}</th>
  );
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {PRESETS.map(([l, n]) => (
          <button key={l} onClick={() => pick(n)} className="h-8 rounded-md px-3" style={{ background: days === n ? BLUE : "var(--of-card)", color: days === n ? "#fff" : undefined }}>{t(l)}</button>
        ))}
        <span className="ml-2 flex h-8 items-center gap-1.5 rounded-md px-3" style={{ background: "var(--of-card)" }}>
          <input type="date" value={range.from} onChange={(e) => (setDays(-1), setRange({ ...range, from: e.target.value }))} className="bg-transparent outline-none" style={{ colorScheme: "dark" }} /> →
          <input type="date" value={range.to} onChange={(e) => (setDays(-1), setRange({ ...range, to: e.target.value }))} className="bg-transparent outline-none" style={{ colorScheme: "dark" }} />
        </span>
        <span className="ml-auto" style={{ color: "var(--of-muted)" }}>{t("Source: Substy (AI and chatter sends of Substy scripts)")}</span>
      </div>
      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {tiles.map(([l, v]) => (
          <div key={l} className="rounded-lg p-4" style={{ background: "var(--of-card)" }}>
            <p className="text-[13px]" style={{ color: "var(--of-muted)" }}>{t(l)}</p>
            <p className="mt-1 text-[24px] font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg p-4" style={{ background: "var(--of-card)" }}>
        <div className="flex items-center gap-2 text-[13px]">
          <span className="font-semibold">{t("Per day")}</span>
          <span className="flex-1" />
          {(["revenue", "sent", "paid"] as const).map((m) => <button key={m} onClick={() => setMetric(m)} className="rounded px-2.5 py-1" style={{ background: metric === m ? BLUE : "var(--of-page)", color: metric === m ? "#fff" : undefined }}>{t(m === "revenue" ? "Revenue" : m === "sent" ? "Sent" : "Bought")}</button>)}
        </div>
        <div className="mt-3 h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d?.daily ?? []} margin={{ left: -10, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--of-line)" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--of-muted)" }} tickFormatter={(v: string) => v.slice(5).replace("-", "/")} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--of-muted)" }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,.04)" }} contentStyle={{ background: "#222", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => (metric === "revenue" ? money(v) : v)} />
              <Bar dataKey={metric} fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="of-scroll mt-4 overflow-x-auto rounded-lg">
        <table className="w-full min-w-[820px] text-[14px]">
          <thead>
            <tr style={{ background: "var(--of-card)" }}>
              <H k="name" label="Script" />
              <th className="px-3 py-3 text-left font-medium">{t("Used by")}</th>
              <H k="sent" label="Sent" />
              <H k="paid" label="Bought" />
              <H k="unlockRate" label="Unlock rate" />
              <H k="revenue" label="Revenue" />
              <th className="px-3 py-3 text-left font-medium">{t("Revenue per send")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b" style={{ borderColor: "var(--of-line)", opacity: r.enabled ? 1 : 0.6 }}>
                <td className="px-3 py-3 font-medium">{r.name}{!r.enabled ? <span className="ml-2 text-[11px]" style={{ color: "var(--of-muted)" }}>{t("Paused")}</span> : null}</td>
                <td className="px-3"><span className="flex gap-2" style={{ color: "var(--of-muted)" }}>{r.ai ? <Bot className="size-4" /> : null}{r.human ? <Users className="size-4" /> : null}</span></td>
                <td className="px-3">{r.sent}</td>
                <td className="px-3">{r.paid}</td>
                <td className="px-3">
                  <span className="flex items-center gap-2">{r.unlockRate.toFixed(1)}%<span className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "var(--of-line)" }}><span className="block h-full" style={{ width: `${Math.min(100, r.unlockRate)}%`, background: BLUE }} /></span></span>
                </td>
                <td className="px-3 font-mono">{money(r.revenue)}</td>
                <td className="px-3 font-mono">{r.sent ? money(r.revenue / r.sent) : "—"}</td>
              </tr>
            ))}
            {(d?.idle ?? []).map((r) => (
              <tr key={r.id} className="border-b" style={{ borderColor: "var(--of-line)", color: "var(--of-muted)" }}>
                <td className="px-3 py-3">{r.name}{!r.enabled ? ` · ${t("Paused")}` : ""}</td>
                <td className="px-3"><span className="flex gap-2">{r.ai ? <Bot className="size-4" /> : null}{r.human ? <Users className="size-4" /> : null}</span></td>
                <td className="px-3" colSpan={5}>{t("Not sent in this period")}</td>
              </tr>
            ))}
            {d && !rows.length && !d.idle.length ? <tr><td colSpan={7} className="py-12 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</td></tr> : null}
            {!d ? <tr><td colSpan={7} className="py-12 text-center" style={{ color: "var(--of-muted)" }}>…</td></tr> : null}
          </tbody>
        </table>
      </div>
      {d?.changes.length ? (
        <div className="mt-5">
          <p className="text-[13px] font-semibold">{t("Latest changes from Bloom")}</p>
          {d.changes.map((c, i) => {
            let x: Record<string, unknown> = {};
            try {
              x = JSON.parse(c.detail);
            } catch {}
            const label = x.created ? `${t("created")} « ${x.created} »` : x.deleted ? `${t("deleted")} « ${x.deleted} »` : `${t("changed")} « ${String(x.name ?? "")} »`;
            return <p key={i} className="mt-1 text-[12px]" style={{ color: "var(--of-muted)" }}>{new Date(c.at).toLocaleString("fr-FR")} · {c.name ?? "?"} · {c.what === "script-step" ? t("step") : t("script")} {label}</p>;
          })}
        </div>
      ) : null}
    </div>
  );
}
