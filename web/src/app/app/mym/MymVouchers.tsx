"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";

// MYM → Messages → Bon de réduction : copie de « Gestion des Vouchers (Live MYM) » de MyPulse. Les bons sont créés et
// supprimés chez MYM avec le compte relié ; Bloom affiche ceux créés depuis Bloom.
type Voucher = { id: number; code: string; duration: string; product: string; unit: "currency" | "percent"; discount: number; maxUse: number | null; createdBy: string | null; createdAt: number; expiresAt: number | null };
const DUR: [string, string][] = [["3hours", "3 heures"], ["6hours", "6 heures"], ["12hours", "12 heures"], ["1days", "1 jour"], ["2days", "2 jours"], ["7days", "7 jours"], ["1months", "1 mois"], ["3months", "3 mois"], ["UNLIMITED", "Illimité"]];
const PROD: [string, string][] = [["subscription", "Abonnement"], ["media", "Push / média privé"], ["booking", "Show privé"]];
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const BLUE = "#405189";
const date = (ms: number | null) => (ms ? new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

export function MymVouchers() {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [list, setList] = useState<Voucher[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    if (!creatorId) return;
    api<{ vouchers: Voucher[]; canEdit: boolean }>("GET", `/api/mym/vouchers?creatorId=${encodeURIComponent(creatorId)}`).then((r) => (setList(r.vouchers), setCanEdit(r.canEdit), setErr(""))).catch((e) => (setList([]), setErr((e as Error).message)));
  }, [creatorId]);
  useEffect(() => {
    setList(null);
    load();
  }, [load]);
  const del = async (v: Voucher) => {
    if (!confirm(`Supprimer le bon « ${v.code} » chez MYM ? Les fans ne pourront plus l’utiliser.`)) return;
    try {
      await api("POST", "/api/mym/vouchers/delete", { id: v.id });
      toast("Bon supprimé");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[21px] font-medium" style={{ color: "var(--mp-head)" }}>Gestion des Vouchers (Live MYM)</h1>
        <span className="flex h-8 items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}>
          <Avatar src={creator?.avatar} name={creator?.name} size="size-5" />
          <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="bg-transparent outline-none">{creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}</select>
        </span>
        <span className="flex-1" />
        {canEdit ? <button onClick={() => setOpen(true)} className="h-9 rounded px-4 text-[13px] text-white" style={{ background: BLUE }}>Créer un nouveau voucher</button> : null}
      </div>
      <div className="mt-4 overflow-x-auto rounded-md" style={card}>
        <table className="w-full min-w-[820px] text-[13px]">
          <thead><tr className="text-left" style={{ color: "var(--mp-head)", background: "var(--mp-card-2)" }}>{["Code", "Réduction", "Sur", "Usage max.", "Créé le", "Expire le", "Actions"].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {(list ?? []).map((v) => (
              <tr key={v.id} className="border-t" style={{ borderColor: "var(--mp-line)" }}>
                <td className="px-3 py-3 font-mono font-semibold" style={{ color: "var(--mp-head)" }}>{v.code}</td>
                <td className="px-3">{v.unit === "percent" ? `${v.discount} %` : `${v.discount} €`}</td>
                <td className="px-3">{PROD.find(([k]) => k === v.product)?.[1]}</td>
                <td className="px-3">{v.maxUse ?? "illimité"}</td>
                <td className="px-3">{date(v.createdAt)}{v.createdBy ? <span className="block text-[11px]" style={{ color: "var(--mp-muted)" }}>par {v.createdBy}</span> : null}</td>
                <td className="px-3" style={v.expiresAt && v.expiresAt < Date.now() ? { color: "var(--mp-down)" } : undefined}>{v.expiresAt ? date(v.expiresAt) : "jamais"}{v.expiresAt && v.expiresAt < Date.now() ? " (expiré)" : ""}</td>
                <td className="px-3">{canEdit ? <button onClick={() => del(v)} title="Supprimer chez MYM" className="grid size-8 place-items-center rounded border" style={{ borderColor: "#f06548", color: "#f06548" }}><Trash2 className="size-3.5" /></button> : null}</td>
              </tr>
            ))}
            {list && !list.length ? <tr><td colSpan={7} className="py-8 text-center" style={{ color: err ? "var(--mp-down)" : undefined }}>{err || "Aucun bon créé depuis Bloom pour cette modèle."}</td></tr> : null}
            {!list ? <tr><td colSpan={7} className="py-8 text-center">…</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Bloom affiche les bons créés depuis Bloom. Un bon créé directement sur le site MYM n’apparaît pas ici.</p>
      {open && creatorId ? <Create creatorId={creatorId} hint={`${(creator?.name || "Code").replace(/\W+/g, "")}10`} onClose={() => setOpen(false)} onDone={() => (setOpen(false), load())} /> : null}
    </div>
  );
}

function Create({ creatorId, hint, onClose, onDone }: { creatorId: string; hint: string; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ code: "", duration: "3hours", product: "subscription", unit: "currency", discount: "", maxUse: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("POST", "/api/mym/vouchers", { creatorId, ...v });
      toast(`Bon « ${v.code} » créé chez MYM`);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pick = (on: boolean) => (on ? { background: "#2f6bff", color: "#fff", borderColor: "#2f6bff" } : { borderColor: "#5b626b", color: "var(--mp-head)" });
  const st = { background: "#2f343a", color: "var(--mp-head)" };
  return (
    <div className="mp-font fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="no-scrollbar max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-lg p-5 text-[13px]" style={{ background: "#262a2f", color: "var(--mp-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between text-[17px] font-semibold" style={{ color: "var(--mp-head)" }}>Nouveau bon de réduction<button onClick={onClose}><X className="size-4" /></button></h3>
        <p className="mt-3 text-[12px]" style={{ color: "var(--mp-muted)" }}>Sur un abonnement, la réduction ne s’applique qu’au premier paiement et pas aux abonnements de 6 mois. Une réduction de 50 % ou plus ne sert qu’une fois tous les 6 mois par fan.</p>
        <p className="mt-4 font-semibold" style={{ color: "var(--mp-head)" }}>Code à partager avec les fans</p>
        <input value={v.code} maxLength={25} onChange={(e) => setV({ ...v, code: e.target.value.replace(/[^A-Za-z0-9_-]/g, "") })} placeholder={hint} className="mt-1.5 h-10 w-full rounded-md px-3 font-mono outline-none" style={st} />
        <p className="mt-4 text-[11px] font-bold tracking-wider uppercase">Valable</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">{DUR.map(([k, l]) => <button key={k} onClick={() => setV({ ...v, duration: k })} className="h-9 rounded-md border font-semibold" style={pick(v.duration === k)}>{l}</button>)}</div>
        <p className="mt-4 text-[11px] font-bold tracking-wider uppercase">Réduction sur</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">{PROD.map(([k, l]) => <button key={k} onClick={() => setV({ ...v, product: k })} className="h-9 rounded-md border font-semibold" style={pick(v.product === k)}>{l}</button>)}</div>
        <p className="mt-4 text-[11px] font-bold tracking-wider uppercase">Configuration</p>
        <div className="mt-1.5 flex gap-2">
          {([["currency", "EUR"], ["percent", "Pourcentage"]] as const).map(([k, l]) => <button key={k} onClick={() => setV({ ...v, unit: k })} className="h-9 flex-1 rounded-md border font-semibold" style={pick(v.unit === k)}>{l}</button>)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="font-semibold" style={{ color: "var(--mp-head)" }}>Réduction ({v.unit === "percent" ? "%" : "€"})<input value={v.discount} onChange={(e) => setV({ ...v, discount: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" className="mt-1.5 h-10 w-full rounded-md px-3 outline-none" style={st} /></label>
          <label className="font-semibold" style={{ color: "var(--mp-head)" }}>Nombre max. d’utilisations<input value={v.maxUse} onChange={(e) => setV({ ...v, maxUse: e.target.value.replace(/\D/g, "") })} placeholder="illimité" inputMode="numeric" className="mt-1.5 h-10 w-full rounded-md px-3 outline-none" style={st} /></label>
        </div>
        {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="h-9 rounded-md px-4" style={st}>Annuler</button><button disabled={busy || v.code.length < 3 || !v.discount} onClick={go} className="h-9 rounded-md px-4 font-semibold text-white disabled:opacity-50" style={{ background: BLUE }}>{busy ? "Création chez MYM…" : "Enregistrer et créer"}</button></div>
      </div>
    </div>
  );
}
