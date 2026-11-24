"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { api } from "@/lib/api";
import { AuthorNote, ContextModal, Who, dur, eur, fromLocal, int, parisDate, parisTime, tk, toLocal, type Sender, type TCreator } from "./MymTeamKit";

// MYM → Pilotage d'équipe → Message Dashboard : copie du « Tableau de bord des messages » de MyPulse, sur les messages
// que Bloom voit passer chez MYM (journal gardé 120 jours).
type Row = { id: string; creatorId: string; creator: string; fanId: string; fan: string; at: number; text: string | null; medias: number; price: number; paid: boolean | null; sender: Sender; replyMs: number | null };
type Sum = Sender & { messages: number; fans: number; ppvPaid: number; ppvFree: number };
type Data = { rows: Row[]; total: number; page: number; pages: number; senders: (Sender & { n: number })[]; summary: Sum[]; creators: TCreator[]; start: number; end: number; since: number | null };
const TYPES: [string, string][] = [["", "Tous les messages"], ["ppv", "Tous les PPV (gratuits + payants)"], ["free", "PPV gratuits (médias offerts)"], ["paid", "PPV payants (tous)"], ["bought", "PPV payants achetés"], ["unbought", "PPV payants non achetés"]];
const midnight = () => new Date(new Date().setHours(0, 0, 0, 0)).getTime();

export function MymMessages() {
  const [start, setStart] = useState(() => toLocal(Date.now() - 864e5));
  const [end, setEnd] = useState(() => toLocal(Date.now()));
  const [sender, setSender] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [size, setSize] = useState(50);
  const [page, setPage] = useState(1);
  const [run, setRun] = useState(0);
  const [tab, setTab] = useState<"all" | "sum">("all");
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState<string | null>(null);
  const load = useCallback(() => {
    setBusy(true);
    const p = new URLSearchParams({ start: String(fromLocal(start)), end: String(fromLocal(end)), size: String(size), page: String(page) });
    if (sender) p.set("sender", sender);
    if (creatorId) p.set("creatorId", creatorId);
    if (type) p.set("type", type);
    if (q.trim()) p.set("q", q.trim());
    api<Data>("GET", `/api/mym/team/messages?${p}`).then((r) => (setD(r), setErr(""))).catch((e) => setErr((e as Error).message)).finally(() => setBusy(false));
    // La recherche part au clic sur « Rechercher » (ou au changement de page / de taille), pas à chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, page, size]);
  useEffect(() => void load(), [load]);
  const go = () => (setPage(1), setRun((n) => n + 1));
  const quick = (a: number, b: number) => (setStart(toLocal(a)), setEnd(toLocal(b)), setTimeout(go, 0));
  const reset = () => (setSender(""), setCreatorId(""), setType(""), setQ(""), quick(Date.now() - 864e5, Date.now()));
  const sel = "mt-1.5 h-10 w-full rounded-lg px-3 text-[13.5px] outline-none";
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <h1 className="text-[20px] font-bold tracking-tight uppercase" style={{ color: "var(--mp-head)" }}>Tableau de bord des messages</h1>
      <AuthorNote />
      <div className="mt-4 rounded-2xl p-5" style={tk.card}>
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-[220px] flex-1 text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Début<input type="datetime-local" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={sel} style={{ ...tk.inp, colorScheme: "dark" }} /></label>
          <label className="min-w-[220px] flex-1 text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Fin<input type="datetime-local" value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} className={sel} style={{ ...tk.inp, colorScheme: "dark" }} /></label>
          <span className="flex flex-wrap gap-2">
            <button onClick={() => quick(midnight(), Date.now())} className="h-10 rounded-lg border px-4 text-[13.5px]" style={{ borderColor: "#0ab39c", color: "#0ab39c" }}>Aujourd’hui</button>
            <button onClick={() => quick(midnight() - 864e5, midnight())} className="h-10 rounded-lg border px-4 text-[13.5px]" style={{ borderColor: "#f7b84b", color: "#f7b84b" }}>Hier</button>
            <button onClick={reset} className="h-10 rounded-lg border px-4 text-[13.5px]" style={{ borderColor: "#3577f1", color: "#6f9bff" }}>Réinitialiser</button>
            <button onClick={go} disabled={busy} className="flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold text-white" style={{ background: "#4a57a8" }}>{busy ? "…" : "Rechercher"}</button>
          </span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_1.4fr_1.4fr_.8fr]">
          <label className="text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Chatteur<select value={sender} onChange={(e) => setSender(e.target.value)} className={sel} style={tk.inp}><option value="">Tous</option>{(d?.senders ?? []).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</select></label>
          <label className="text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Créateur<select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} className={sel} style={tk.inp}><option value="">Tous</option>{(d?.creators ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Types de message<select value={type} onChange={(e) => setType(e.target.value)} className={sel} style={tk.inp}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Recherche dans le texte<input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="mot, phrase, etc." className={sel} style={tk.inp} /></label>
          <label className="text-[13px] font-medium" style={{ color: "var(--mp-head)" }}>Afficher<select value={size} onChange={(e) => (setPage(1), setSize(Number(e.target.value)))} className={sel} style={tk.inp}>{[50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>
      </div>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}

      <div className="mt-4 rounded-2xl" style={tk.card}>
        <p className="flex gap-1 border-b px-4 pt-4" style={{ borderColor: "var(--mp-line)" }}>
          {([["all", "Tous les messages"], ["sum", "Résumé chatteurs"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="rounded-t-lg px-4 py-2 text-[13.5px] font-medium" style={tab === k ? { background: "var(--mp-card-2)", color: "var(--mp-head)", border: "1px solid var(--mp-line)", borderBottom: 0 } : undefined}>{l}</button>)}
          <span className="flex-1" />
          <span className="self-center pb-1 text-[12px]">{d ? `${int(d.total)} message${d.total > 1 ? "s" : ""}` : ""}</span>
        </p>
        {tab === "all" ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13.5px]">
                <thead><tr className="text-left" style={{ color: "var(--mp-head)" }}>{["Chatteur", "Créateur", "Message", "Prix", "Heure d’envoi", "Temps de réponse", "Actions"].map((h) => <th key={h} className="border-b px-3 py-3 font-semibold" style={{ borderColor: "var(--mp-line)" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {(d?.rows ?? []).map((m) => (
                    <tr key={m.id} className="border-b last:border-0" style={{ borderColor: "var(--mp-line)" }}>
                      <td className="px-3 py-3"><Who s={m.sender} /></td>
                      <td className="px-3 whitespace-nowrap" style={{ color: "var(--mp-head)" }}>{m.creator} <span className="ml-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold" style={{ background: "#299cdb33", color: "#299cdb" }}>MYM</span></td>
                      <td className="max-w-[520px] px-3 py-3"><p className="break-words" style={{ color: "var(--mp-head)" }}>{m.text || (m.medias ? `[${m.medias} média${m.medias > 1 ? "s" : ""}]` : "—")}{m.text && m.medias ? <span style={{ color: "var(--mp-muted)" }}> [{m.medias} média{m.medias > 1 ? "s" : ""}]</span> : null}</p><p className="mt-1 flex items-center gap-1.5 text-[12px]"><MessageCircle className="size-3" />{m.fan}</p></td>
                      <td className="px-3 whitespace-nowrap">{m.price > 0 ? <span style={{ color: m.paid ? "#3cd188" : "var(--mp-head)" }}>{eur(m.price)}{m.paid ? " ✓" : ""}</span> : m.medias ? <span className="text-[12px]">offert</span> : "--"}</td>
                      <td className="px-3 whitespace-nowrap"><b style={{ color: "var(--mp-head)" }}>{parisTime(m.at)}</b><p className="text-[12px]">{parisDate(m.at)}</p></td>
                      <td className="px-3 whitespace-nowrap" style={{ color: "var(--mp-head)" }}>{dur(m.replyMs)}</td>
                      <td className="px-3"><button onClick={() => setCtx(`id=${encodeURIComponent(m.id)}`)} title="Voir le fil autour de ce message" className="grid size-8 place-items-center rounded border" style={{ borderColor: "#3577f1", color: "#6f9bff" }}><Search className="size-3.5" /></button></td>
                    </tr>
                  ))}
                  {d && !d.rows.length ? <tr><td colSpan={7} className="px-3 py-10 text-center">Aucun message sur cette sélection.</td></tr> : null}
                </tbody>
              </table>
            </div>
            {d && d.pages > 1 ? <p className="flex items-center justify-center gap-3 border-t p-3 text-[13px]" style={{ borderColor: "var(--mp-line)" }}><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40" style={{ borderColor: "var(--mp-line)" }}>Précédent</button>Page {d.page} / {int(d.pages)}<button disabled={page >= d.pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40" style={{ borderColor: "var(--mp-line)" }}>Suivant</button></p> : null}
          </>
        ) : (
          <div className="overflow-x-auto p-4">
            <p className="text-[12px]">Résumé sur toute la sélection (sans pagination), tous chatteurs.</p>
            <table className="mt-3 w-full min-w-[640px] text-[13.5px]">
              <thead><tr className="text-left" style={{ color: "var(--mp-head)" }}>{["Chatteur", "Messages", "Fans distincts", "PPV proposés", "PPV gratuits"].map((h) => <th key={h} className="border-b px-2 py-2 font-semibold" style={{ borderColor: "var(--mp-line)" }}>{h}</th>)}</tr></thead>
              <tbody>{(d?.summary ?? []).map((s) => <tr key={s.key} className="border-b last:border-0" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><td className="px-2 py-2"><Who s={s} /></td><td className="px-2">{int(s.messages)}</td><td className="px-2">{int(s.fans)}</td><td className="px-2">{int(s.ppvPaid)}</td><td className="px-2">{int(s.ppvFree)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{d?.since ? `Messages notés par Bloom depuis le ${parisDate(d.since)} (gardés 120 jours). ` : ""}Heures de Paris. La liste des mots interdits de MyPulse n’est pas reprise ici.</p>
      {ctx ? <ContextModal query={ctx} onClose={() => setCtx(null)} /> : null}
    </div>
  );
}
