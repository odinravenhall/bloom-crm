"use client";

import { useCallback, useEffect, useState } from "react";
import { BellOff, CheckCheck, Gift, HandHelping, Lock, RefreshCcw, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { eur, parisDate, parisTime, tk } from "./MymTeamKit";

// MYM → Notifications MYM : copie de MyPulse. Le fil du compte (abonnements, renouvellements, achats), reconstruit
// d'après les revenus lus chez MYM en direct.
type Item = { id: string; kind: "subs" | "renew" | "buy" | "req"; title?: string; sub: string; fan: string; creator: string; amount: number; at: number };
type Data = { creators: { id: string; name: string }[]; seen: number; items: Item[]; more: boolean; unread: number };
type Kind = "all" | "subs" | "renew" | "buy" | "req";
const WHAT: Record<string, string> = { ppv: "a acheté un média privé", mod: "a acheté un Media On Demand", push: "a acheté un média push", tip: "a envoyé un pourboire" };

export function MymNotifs() {
  const [kind, setKind] = useState<Kind>("all");
  const [creatorId, setCreatorId] = useState("");
  const [d, setD] = useState<Data | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  const url = useCallback((before?: number) => `/api/mym/notifs?kind=${kind}${creatorId ? `&creatorId=${encodeURIComponent(creatorId)}` : ""}${before ? `&before=${before}` : ""}`, [kind, creatorId]);
  const load = useCallback(() => api<Data>("GET", url()).then((r) => (setD(r), setItems(r.items), setErr(""))).catch((e) => setErr((e as Error).message)), [url]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  const more = async () => {
    const r = await api<Data>("GET", url(items[items.length - 1]?.at)).catch(() => null);
    if (r) (setItems([...items, ...r.items]), setD({ ...r, seen: d?.seen ?? r.seen }));
  };
  const read = async () => {
    await api("POST", "/api/mym/notifs/read").catch(() => {});
    load();
  };
  const many = (d?.creators.length ?? 0) > 1;
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><h1 className="text-[20px] font-semibold" style={{ color: "var(--mp-head)" }}>Notifications MYM</h1><p className="text-[13px]">Le fil de tes comptes MYM, en direct.</p></div>
        {many ? <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} className="h-10 rounded-lg px-3 text-[13.5px] outline-none" style={tk.inp}><option value="">Tous les comptes MYM</option>{d!.creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : null}
        <button onClick={read} disabled={!d?.unread} className="flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-medium disabled:opacity-50" style={{ background: "#40518955", color: "#9fb0f0" }}><CheckCheck className="size-4" /> Marquer comme lu{d?.unread ? ` (${d.unread})` : ""}</button>
      </div>
      <p className="mt-4 flex flex-wrap gap-1 text-[13.5px] font-medium">{([["all", "Tout"], ["subs", "Nouveaux abonnés"], ["renew", "Renouvellements"], ["buy", "Achats"], ["req", "Demandes"]] as [Kind, string][]).map(([k, l]) => <button key={k} onClick={() => setKind(k)} className="rounded-md px-4 py-2" style={kind === k ? { background: "#405189", color: "#fff" } : { color: "var(--mp-head)" }}>{l}</button>)}</p>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
      <div className="mx-auto mt-4 max-w-5xl">
        {items.map((n) => (
          <p key={n.id} className="flex items-center gap-4 border-b px-4 py-3.5 text-[14px]" style={{ background: "var(--mp-card)", borderColor: "var(--mp-line)", borderLeft: `2px solid ${n.at > (d?.seen ?? 0) ? "#405189" : "transparent"}` }}>
            <span style={{ color: n.kind === "buy" ? "#f7b84b" : n.kind === "renew" ? "#6f9bff" : "#0ab39c" }}>{n.kind === "req" ? <HandHelping className="size-5" style={{ color: "#6f9bff" }} /> : n.kind === "buy" ? (n.sub === "tip" ? <Gift className="size-5" /> : <Lock className="size-5" />) : n.kind === "renew" ? <RefreshCcw className="size-5" /> : <UserPlus className="size-5" />}</span>
            <span className="min-w-0 flex-1"><span><b style={{ color: "var(--mp-head)" }}>{n.fan}</b> <span style={{ color: "var(--mp-head)" }}>{n.kind === "req" ? `: ${n.title}` : n.kind === "subs" ? "s’est abonné à ton profil" : n.kind === "renew" ? "a renouvelé son abonnement" : WHAT[n.sub] || "a fait un achat"}</span>{n.amount > 0 ? <b className="ml-2" style={{ color: "var(--mp-accent)" }}>{eur(n.amount)}</b> : null}</span><span className="block text-[12.5px]">{n.kind === "req" ? "Demande" : n.kind === "subs" ? "Abonnement" : n.kind === "renew" ? "Renouvellement" : "Achat"} · {parisDate(n.at)} {parisTime(n.at)}{many ? ` · ${n.creator}` : ""}</span></span>
          </p>
        ))}
        {d && !items.length ? <div className="grid place-items-center rounded-lg py-12 text-[13.5px]" style={{ background: "var(--mp-card)" }}><BellOff className="mb-3 size-8" />Aucune notification pour l’instant.</div> : null}
        {d?.more ? <p className="py-4 text-center"><button onClick={more} className="rounded-lg border px-4 py-2 text-[13px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>Afficher la suite</button></p> : null}
      </div>
      <p className="mx-auto mt-3 max-w-5xl text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Montants nets. « Renouvellement » = abonnement d’un fan déjà abonné avant. « Demandes » = les notifications du site MYM qui ne sont ni un abonnement ni une vente (demande de média privé…), relevées toutes les 5 minutes ; leur heure est approximative.</p>
    </div>
  );
}
