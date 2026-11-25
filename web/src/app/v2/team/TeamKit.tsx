"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, MessageCircle, Users } from "lucide-react";
import { api } from "@/lib/api";
import { getPf, type Pf } from "@/lib/platform";
import { Avatar } from "@/rv/components/ui";
import { cash, Modal, useDismiss } from "../kit";
import { errText } from "../media/MediaKit";

// Bloom v2 → Équipe : les pièces communes des écrans de la rubrique (Ventes, Messages, Shifts, Modération…).
// « Qui » = l'auteur d'un message ou d'une vente, dans la forme de `whoOf` (app/v2stats.mjs).
export type Who = { key: string; name: string; type: "human" | "ai" | "ext" | "auto" | "creator" | "platform" | "none" };
export type TeamModel = { id: string; name: string; avatar: string | null };

/** Une couleur par famille d'auteurs (graphiques, anneau, pastilles). */
export const WHO_COLOR: Record<Who["type"], string> = { human: "#3b82f6", platform: "#22d3ee", ai: "#a78bfa", ext: "#a78bfa", auto: "#fbbf24", creator: "#6b7280", none: "#3f3f46" };
const BADGE: Record<Who["type"], [string, string, string] | null> = {
  human: null,
  ai: ["IA", "Écrit par l’IA de Substy.", "Écrit par l’IA de Substy."],
  ext: ["IA / autre outil", "", "Écrit hors de Bloom, sur un fan dont l’IA est active : l’IA de Substy, ou un autre outil. MYM ne dit pas qui a écrit."],
  platform: ["Infloww", "Vente que Infloww attribue à ce chatteur : Bloom n’a pas vu qui a écrit le message.", ""],
  auto: ["Auto", "Envoi automatique : automatisation ou script de Substy, envoi groupé.", "Envoi automatique : automatisation, Mass DM ou push."],
  creator: ["Hors Bloom", "Écrit directement sur OnlyFans ou depuis un autre outil : Bloom ne sait pas par qui.", "Écrit hors de Bloom (appli MYM ou autre outil), IA coupée sur ce fan."],
  none: ["", "Aucun chatteur connu pour cette vente.", "Bloom n’a pas retrouvé qui a fait cette vente (il ne cherche que sur les 14 derniers jours)."],
};
/** Le nom d'un auteur et, s'il ne s'agit pas d'une personne de l'équipe, une pastille qui dit ce que c'est. */
export function WhoTag({ w, pf, strong = false }: { w: Who; pf: Pf; strong?: boolean }) {
  const b = BADGE[w.type];
  const tip = b ? b[pf === "mym" ? 2 : 1] : undefined;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5" title={tip || undefined}>
      <span className={`min-w-0 truncate ${strong ? "font-bold" : ""}`} style={w.type === "none" || w.type === "creator" ? { color: "var(--color-muted)" } : undefined}>{w.name}</span>
      {b?.[0] ? <span className="v2-tag shrink-0" style={{ color: WHO_COLOR[w.type], background: "rgb(255 255 255 / 0.05)" }}>{b[0]}</span> : null}
    </span>
  );
}

/** Le choix de la modèle (« Toutes les modèles » ou une seule), en haut d'un écran. */
export function ModelMenu({ all, value, onChange }: { all: TeamModel[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  useDismiss(open, () => setOpen(false), "team-model");
  const picked = value ? all.find((m) => m.id === value)?.name ?? "Modèle" : "Toutes les modèles";
  return (
    <div data-pop="team-model" className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} className="v2-select">
        <Users className="size-4 text-muted" /><span className="max-w-[170px] truncate">{picked}</span><ChevronDown className="size-3.5 text-muted" />
      </button>
      {open ? (
        <div className="v2-menu v2-scroll max-h-[420px] w-[250px] overflow-y-auto" role="listbox" aria-label="Modèle affichée" style={{ right: 0, top: "calc(100% + 6px)" }}>
          <button type="button" role="option" aria-selected={!value} onClick={() => (onChange(""), setOpen(false))} className="v2-menu-item" data-on={!value}><Users className="size-4 text-muted" /><span className="flex-1">Toutes les modèles</span>{!value ? <Check className="size-4" style={{ color: "var(--v2-sky)" }} /> : null}</button>
          {all.map((m) => (
            <button key={m.id} type="button" role="option" aria-selected={value === m.id} onClick={() => (onChange(m.id), setOpen(false))} className="v2-menu-item" data-on={value === m.id}>
              <Avatar src={m.avatar} name={m.name} size="size-6" /><span className="min-w-0 flex-1 truncate">{m.name}</span>{value === m.id ? <Check className="size-4 shrink-0" style={{ color: "var(--v2-sky)" }} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Heure et date de Paris. */
export const timeOf = (t: number) => new Date(t).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
export const dateOf = (t: number, year = false) => new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", ...(year ? { year: "numeric" } : null) });

type ThreadMsg = { id: string; at: number; fromFan: boolean; text: string | null; medias: number; price: number; paid: boolean; deleted: boolean; who: Who | null };
type Thread = { platform: Pf; currency: string; creatorId: string; creator: string; fanId: string; fan: string; focus: string | null; at: number; messages: ThreadMsg[] };
/**
 * Le fil d'une conversation autour d'un message ou d'une vente, tel que Bloom l'a noté. `query` : « id=<message> » ou
 * « creator=…&fan=…&at=… » (GET /api/v2/team/thread). Lecture seule.
 */
export function ThreadModal({ query, onClose }: { query: string; onClose: () => void }) {
  const [d, setD] = useState<Thread | null>(null);
  const [err, setErr] = useState("");
  const [more, setMore] = useState({ before: true, after: true, busy: false });
  useEffect(() => {
    let off = false;
    api<Thread>("GET", `/api/v2/team/thread?${query}`).then((r) => void (!off && setD(r))).catch((e) => void (!off && setErr(errText(e))));
    return () => {
      off = true;
    };
  }, [query]);
  const load = async (dir: "before" | "after") => {
    if (!d || !d.messages.length) return;
    setMore((m) => ({ ...m, busy: true }));
    const edge = dir === "before" ? d.messages[0].at : d.messages[d.messages.length - 1].at;
    try {
      const r = await api<Thread>("GET", `/api/v2/team/thread?creator=${encodeURIComponent(d.creatorId)}&fan=${encodeURIComponent(d.fanId)}&at=${edge}&dir=${dir}`);
      setD({ ...d, messages: dir === "before" ? [...r.messages, ...d.messages] : [...d.messages, ...r.messages] });
      setMore((m) => ({ ...m, [dir]: r.messages.length >= 15, busy: false }));
    } catch (e) {
      setErr(errText(e));
      setMore((m) => ({ ...m, busy: false }));
    }
  };
  // La messagerie suit la plateforme du menu : le lien n'est proposé que si c'est bien celle de cette conversation.
  const chatOk = !!d && d.platform === getPf();
  return (
    <Modal title={d ? `${d.fan} · ${d.creator}` : "Conversation"} sub="Les messages que Bloom a notés autour de celui-ci. Lecture seule." width={720} onClose={onClose}>
      {err ? <p className="text-[13px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      {!d && !err ? <p className="py-14 text-center text-[13px] text-muted">Chargement…</p> : null}
      {d ? (
        <>
          <div className="v2-scroll max-h-[58vh] space-y-2 overflow-y-auto pr-1">
            {more.before && d.messages.length ? <button type="button" disabled={more.busy} onClick={() => void load("before")} className="mx-auto block text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--v2-sky)" }}>Messages précédents</button> : null}
            {d.messages.map((m) => {
              const focus = d.focus === m.id;
              return (
                <div key={m.id} className={`flex ${m.fromFan ? "justify-start" : "justify-end"}`}>
                  <div className="max-w-[78%]">
                    <p className={`mb-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted ${m.fromFan ? "" : "justify-end"}`}>
                      <span>{dateOf(m.at)} · {timeOf(m.at)}</span>
                      {m.fromFan ? <span>· {d.fan}</span> : m.who ? <span className="flex min-w-0 items-center gap-1">· <WhoTag w={m.who} pf={d.platform} /></span> : null}
                    </p>
                    <div className={`rounded-[14px] px-3 py-2 text-[13px] leading-relaxed break-words whitespace-pre-wrap ${m.fromFan ? "v2-bubble-fan rounded-bl-[4px]" : "v2-bubble-me rounded-br-[4px]"}`} style={{ boxShadow: focus ? "0 0 0 2px #fbbf24" : undefined, opacity: m.deleted ? 0.5 : 1 }}>
                      {m.text || (m.medias ? `[${m.medias} média${m.medias > 1 ? "s" : ""}]` : "—")}
                      {m.text && m.medias ? <span className="ml-1.5 text-[11.5px] opacity-70">· {m.medias} média{m.medias > 1 ? "s" : ""}</span> : null}
                      {m.price ? <span className="mt-1 block text-[11.5px] font-bold" style={{ color: m.paid ? "#6ee7b7" : "#fde68a" }}>{cash(Math.round(m.price * 100), d.currency, m.price % 1 ? 2 : 0)} · {m.paid ? "acheté" : "pas acheté"}</span> : null}
                      {m.deleted ? <span className="mt-1 block text-[11.5px] opacity-80">retiré chez le fan</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {!d.messages.length ? <p className="py-10 text-center text-[13px] text-muted">Bloom n’a noté aucun message de cette conversation à ce moment-là.</p> : null}
            {more.after && d.messages.length ? <button type="button" disabled={more.busy} onClick={() => void load("after")} className="mx-auto block text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--v2-sky)" }}>Messages suivants</button> : null}
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {chatOk ? <a href={`/v2/messagerie?c=${encodeURIComponent(`${d.creatorId}~${d.fanId}`)}`} className="v2-btn" data-kind="ghost"><MessageCircle className="size-4" />Ouvrir la conversation</a> : null}
            <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Fermer</button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
