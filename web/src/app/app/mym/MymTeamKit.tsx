"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";

// Pilotage d'équipe MYM : ce que partagent Message Dashboard, Ventes équipe et Contrôle des shifts.
export type Sender = { key: string; name: string; type: "human" | "ext" | "auto" | "creator" | "none" };
export type TCreator = { id: string; name: string };
export const tk = { card: { background: "var(--mp-card)", border: "1px solid var(--mp-line)" }, inp: { background: "var(--mp-card-2)", border: "1px solid var(--mp-line)", color: "var(--mp-head)" } };
export const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ")} €`;
export const int = (n: number) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
export const dur = (ms: number | null) => {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};
export const hmin = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
export const parisDate = (t: number) => new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
export const parisTime = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
export const parisToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
export const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** « 2026-11-24T18:47 » (champ date + heure du navigateur) ↔ millisecondes, dans le fuseau de l'ordinateur. */
export const toLocal = (t: number) => {
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};
export const fromLocal = (s: string) => new Date(s).getTime();

/** Nom de l'auteur + pastille : IA / autre outil, automatisation… */
export function Who({ s }: { s: Sender }) {
  const tag = s.type === "ext" ? ["IA / AUTRE OUTIL", "#f1602e"] : s.type === "auto" ? ["AUTO", "#7b8fd4"] : s.type === "none" ? null : s.type === "creator" ? ["MYM", "#878a99"] : null;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={s.type === "ext" ? "Message écrit hors de Bloom sur un fan dont l’IA est active : IA de Substy, ou IA / chatteur d’un autre outil. MYM ne dit pas qui a écrit." : s.type === "creator" ? "Message écrit hors de Bloom (appli MYM ou autre outil), IA coupée sur ce fan." : undefined}>
      <span style={{ color: "var(--mp-head)" }}>{s.name}</span>
      {tag ? <span className="rounded px-1.5 py-0.5 text-[9.5px] font-bold text-white" style={{ background: tag[1] }}>{tag[0]}</span> : null}
    </span>
  );
}

/** Note honnête, en haut des trois pages : ce que Bloom sait (ou pas) de l'auteur d'un message. */
export function AuthorNote() {
  return <p className="mt-3 rounded-xl px-4 py-3 text-[12.5px] leading-relaxed" style={{ background: "#16323d", border: "1px solid #22607a", color: "#9fdcf0" }}>Bloom connaît le nom d’un chatteur seulement quand il écrit <b>depuis Bloom</b>. Ce qui est écrit ailleurs (IA de Substy, IA ou chatteurs de MyPulse, appli MYM) est bien compté, mais rangé sous « Hors Bloom » ou « Compte MYM » : MYM ne dit pas qui a écrit.</p>;
}

type Ctx = { creatorId: string; fanId: string; fan: string; creator: string; focus: string | null; messages: { id: string; at: number; fromFan: boolean; text: string | null; medias: number; price: number; paid: boolean; sender: Sender | null }[] };
/** Loupe : le fil autour d'un message ou d'une vente. */
export function ContextModal({ query, onClose }: { query: string; onClose: () => void }) {
  const [d, setD] = useState<Ctx | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Ctx>("GET", `/api/mym/team/context?${query}`).then(setD).catch((e) => setErr((e as Error).message));
  }, [query]);
  const more = useCallback(async (dir: "before" | "after") => {
    if (!d || !d.messages.length) return;
    const at = dir === "before" ? d.messages[0].at : d.messages[d.messages.length - 1].at;
    const r = await api<Ctx>("GET", `/api/mym/team/context?creator=${encodeURIComponent(d.creatorId)}&fan=${encodeURIComponent(d.fanId)}&at=${at}&dir=${dir}`).catch(() => null);
    if (r) setD({ ...d, messages: dir === "before" ? [...r.messages, ...d.messages] : [...d.messages, ...r.messages] });
  }, [d]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg" style={{ background: "#000", border: "1px solid #2f6bff" }}>
        <p className="flex items-center gap-2 px-5 py-3 text-[14px] font-bold" style={{ background: "#212529", color: "#fff" }}><span className="min-w-0 flex-1 truncate">Contexte{d ? ` — ${d.fan} · ${d.creator}` : ""}</span><button onClick={onClose}><X className="size-5" /></button></p>
        <div className="min-h-[240px] flex-1 space-y-3 overflow-y-auto p-4">
          {err ? <p className="text-[13px]" style={{ color: "#f06548" }}>{err}</p> : null}
          {d && !d.messages.length ? <p className="py-10 text-center text-[13px]" style={{ color: "#ced4da" }}>Bloom n’a pas noté d’autres messages de cette conversation.</p> : null}
          {(d?.messages ?? []).map((m) => (
            <div key={m.id} className={`flex ${m.fromFan ? "justify-start" : "justify-end"}`}>
              <div className="max-w-[78%] rounded-2xl px-4 py-2.5 text-[14px]" style={{ background: m.fromFan ? "#2a2f34" : "#3b7cff", color: "#fff", boxShadow: m.id === d?.focus ? "0 0 0 2px #f7b84b" : undefined }}>
                <p className="text-[11.5px] opacity-80">{parisDate(m.at).slice(0, 5)} {parisTime(m.at)} • <b>{m.fromFan ? "Fan" : m.sender?.name}</b>{m.price > 0 ? ` • ${eur(m.price)}${m.paid ? " (acheté)" : ""}` : ""}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{m.text || (m.medias ? `[${m.medias} média${m.medias > 1 ? "s" : ""}]` : "—")}{m.text && m.medias ? <span className="opacity-80"> [{m.medias} média{m.medias > 1 ? "s" : ""}]</span> : null}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="flex items-center gap-2 px-4 py-2.5" style={{ background: "#212529" }}>
          <button onClick={() => more("before")} className="rounded border px-3 py-1 text-[12px]" style={{ borderColor: "#3a4047", color: "#ced4da" }}>Charger précédents</button>
          <span className="flex-1 text-center">{d ? <a href={`/app/mym/chatting?c=${encodeURIComponent(d.creatorId)}`} target="_blank" rel="noreferrer" className="rounded border px-3 py-1 text-[12px]" style={{ borderColor: "#2f6bff", color: "#6f9bff" }}>Ouvrir Chatting</a> : null}</span>
          <button onClick={() => more("after")} className="rounded border px-3 py-1 text-[12px]" style={{ borderColor: "#3a4047", color: "#ced4da" }}>Charger suivants</button>
        </p>
      </div>
    </div>
  );
}
