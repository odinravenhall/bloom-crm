"use client";

import { useCallback, useEffect, useState } from "react";
import { BellOff, CheckCheck, Gift, HandHelping, Lock, RefreshCcw, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { cash, PALETTE } from "../kit";
import { errText, plural } from "../media/MediaKit";

// Bloom v2 → MYM → Notifications (25/11/2026, « Constellation »). Remplace, dans la v2, la copie de MyPulse
// (`MymNotifs`). Même route (`GET /api/mym/notifs`, mymstats.mjs) : le fil des comptes MYM reconstruit d'après les
// revenus lus chez MYM (abonnements, renouvellements, achats) et les « demandes » relevées sur le site toutes les
// 5 min. « Marquer comme lu » ne touche qu'à Bloom (un repère par personne), jamais à MYM.
type Kind = "all" | "subs" | "renew" | "buy" | "req";
type Item = { id: string; kind: Exclude<Kind, "all">; title?: string; sub: string; fan: string; creator: string; amount: number; at: number };
type Data = { creators: { id: string; name: string }[]; seen: number; items: Item[]; more: boolean; unread: number };
const KINDS: [Kind, string][] = [["all", "Tout"], ["subs", "Nouveaux abonnés"], ["renew", "Renouvellements"], ["buy", "Achats"], ["req", "Demandes"]];
const WHAT: Record<string, string> = { ppv: "a acheté un média privé", mod: "a acheté un média à la demande", push: "a acheté un push", tip: "a envoyé un pourboire" };
const LOOK: Record<Item["kind"], { color: string; Icon: typeof Lock }> = {
  subs: { color: "#34d399", Icon: UserPlus },
  renew: { color: "#38bdf8", Icon: RefreshCcw },
  buy: { color: "#a78bfa", Icon: Lock },
  req: { color: "#fbbf24", Icon: HandHelping },
};
const time = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(ms));
const dayName = (ms: number) => {
  const k = dayKey(ms);
  if (k === dayKey(Date.now())) return "Aujourd’hui";
  if (k === dayKey(Date.now() - 864e5)) return "Hier";
  return new Date(ms).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
};

export function V2Notifs() {
  const [kind, setKind] = useState<Kind>("all");
  const [only, setOnly] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const url = useCallback((before?: number) => `/api/mym/notifs?kind=${kind}${only ? `&creatorId=${encodeURIComponent(only)}` : ""}${before ? `&before=${before}` : ""}`, [kind, only]);
  const load = useCallback(() => api<Data>("GET", url()).then((r) => (setD(r), setItems(r.items), setErr(""))).catch((e) => setErr(errText(e))), [url]);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);
  const more = async () => {
    setBusy(true);
    const r = await api<Data>("GET", url(items[items.length - 1]?.at)).catch(() => null);
    if (r) setItems((x) => [...x, ...r.items]), setD((p) => (p ? { ...p, more: r.more } : r));
    setBusy(false);
  };
  const read = async () => {
    await api("POST", "/api/mym/notifs/read").catch(() => {});
    void load();
  };
  const accounts = d?.creators ?? [];
  const seen = d?.seen ?? 0;
  // Les notifications, rangées par jour (heure de Paris).
  const days: { key: string; name: string; list: Item[] }[] = [];
  for (const n of items) {
    const k = dayKey(n.at);
    const last = days[days.length - 1];
    if (last?.key === k) last.list.push(n);
    else days.push({ key: k, name: dayName(n.at), list: [n] });
  }

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">MYM · Activité des comptes</p>
          <h1 className="v2-h1 mt-1">Notifications</h1>
          <p className="mt-1 text-[13px] text-muted">Nouveaux abonnés, renouvellements, achats et demandes de tes comptes MYM, mis à jour toutes les 30 secondes.</p>
        </div>
        <button onClick={() => void read()} disabled={!d?.unread} className="v2-btn" data-kind="ghost" style={{ height: 36 }} title="Pour toi seulement : rien ne change chez MYM"><CheckCheck className="size-4" />Tout marquer comme lu{d?.unread ? ` (${d.unread})` : ""}</button>
      </div>

      <div className="v2-rise mt-5 flex flex-wrap items-center gap-x-5 gap-y-3" style={{ ["--i" as string]: 1 }}>
        <div className="v2-tabs">{KINDS.map(([k, l]) => <button key={k} onClick={() => setKind(k)} className="v2-tab" data-on={kind === k}>{l}</button>)}</div>
        <span className="flex-1" />
        {accounts.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setOnly("")} className="v2-chip" data-on={!only}>Tous les comptes</button>
            {accounts.map((a) => <button key={a.id} onClick={() => setOnly(a.id)} className="v2-chip" data-on={only === a.id}>{a.name}</button>)}
          </div>
        ) : null}
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      <div className="v2-rise mt-4 space-y-5" style={{ ["--i" as string]: 2 }}>
        {!d && !err ? <p className="py-20 text-center text-[13px] text-muted">Chargement…</p> : null}
        {days.map((g) => (
          <section key={g.key}>
            <p className="mb-2 flex items-baseline gap-2 px-1 text-[12px] font-bold tracking-[0.1em] text-muted uppercase"><span>{g.name}</span><span className="font-semibold tracking-normal normal-case">· {plural(g.list.length, "notification")}{d?.more && g === days[days.length - 1] ? " affichées, la suite plus bas" : ""}</span></p>
            <div className="v2-card divide-y" style={{ borderColor: "var(--color-line)" }}>
              {g.list.map((n) => {
                const L = LOOK[n.kind];
                const Icon = n.kind === "buy" && n.sub === "tip" ? Gift : L.Icon;
                const fresh = n.at > seen;
                const i = accounts.findIndex((a) => a.name === n.creator);
                return (
                  <div key={n.id} className="flex items-center gap-3 px-4 py-3" style={{ borderColor: "rgb(255 255 255 / 0.05)", background: fresh ? "rgb(59 130 246 / 0.06)" : undefined }}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: `${L.color}22`, color: L.color }}><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] leading-snug"><b>{n.fan}</b> <span className="text-muted">{n.kind === "req" ? `· ${n.title}` : n.kind === "subs" ? "s’est abonné" : n.kind === "renew" ? "a renouvelé son abonnement" : WHAT[n.sub] || "a fait un achat"}</span></span>
                      {accounts.length > 1 ? <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted"><span className="size-1.5 rounded-full" style={{ background: PALETTE[Math.max(0, i) % PALETTE.length] }} />{n.creator}</span> : null}
                    </span>
                    {n.amount > 0 ? <span className="v2-num shrink-0 text-[13.5px] font-bold" style={{ color: "var(--v2-up)" }}>+{cash(Math.round(n.amount * 100), "EUR", n.amount % 1 ? 2 : 0)}</span> : null}
                    <span className="v2-num w-12 shrink-0 text-right text-[12px] text-muted" title={n.kind === "req" ? "Heure approximative (relevée toutes les 5 min)" : undefined}>{time(n.at)}</span>
                    {fresh ? <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--v2-blue)" }} title="Nouveau depuis ta dernière lecture" /> : <span className="size-2 shrink-0" />}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {d && !items.length ? <div className="v2-card grid place-items-center py-16 text-[13px] text-muted"><BellOff className="mb-3 size-7 opacity-60" />Aucune notification ici pour l’instant.</div> : null}
        {d?.more ? <p className="text-center"><button onClick={() => void more()} disabled={busy} className="v2-btn" data-kind="ghost" style={{ height: 34 }}>{busy ? "Chargement…" : "Afficher la suite"}</button></p> : null}
      </div>
      <p className="mt-5 px-1 text-[11.5px] leading-relaxed text-muted">Montants nets. « Renouvellement » = abonnement d’un fan déjà abonné avant. « Demandes » = les notifications du site MYM qui ne sont ni un abonnement ni une vente (demande de média privé…), relevées toutes les 5 minutes : leur heure est approximative.</p>
    </div>
  );
}
