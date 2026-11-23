"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, History, UserRound, Users } from "lucide-react";
import { api as rvApi, toast } from "@/rv/lib/client";
import { api } from "@/lib/api";
import { money } from "@/rv/lib/fmt";
import { FanStats, ModelSheet } from "@/rv/inbox/FanPanel";
import { PpvTimeline } from "@/rv/inbox/PpvTimeline";
import { SubstyCard } from "@/rv/inbox/SubstyCard";
import type { Conv, Model } from "@/rv/inbox/types";

// Fiche fan du Chatting MYM, façon MyPulse : onglets Fan insights / PPV Timeline / Médias privés / Spender IQ / Creator.
// Chiffres et notes = ceux de la messagerie de Bloom ; âge, genre, provenance, langue, promesse, groupes = Bloom.
type Stats = { firstSubscriptionAt?: string; totalSpent?: number; tipsTotal?: number; highestPurchase?: number; lastPaidAt?: string; subscriptionExpireAt?: string; buyingRate?: { purchased: number; total: number; percentage: number } };
type FanResp = { stats: Stats | null; profile: Record<string, unknown> & { notes?: string }; profileUpdated: { at: number; by: string | null } | null };
type Meta = { age: string; gender: string; source: string; lang: string; promise: string };
type Group = { id: string; name: string; color: string | null; kind: string; member: boolean };
const TABS = [["insights", "Fan insights"], ["ppv", "PPV Timeline"], ["private", "Médias privés"], ["iq", "Spender IQ"], ["creator", "Creator"]] as const;
const BLUE = "#405189";
const since = (iso?: string | null) => {
  if (!iso) return "—";
  const h = (Date.now() - Date.parse(iso)) / 3600_000;
  return h < 1 ? "< 1 h" : h < 48 ? `${Math.floor(h)} h` : h < 24 * 60 ? `${Math.floor(h / 24)} j` : `${Math.floor(h / 24 / 30)} mois`;
};
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "-");

export function MymFanPanel({ conv, model, onChanged, onPin }: { conv: Conv; model?: Model; onChanged: () => void; onPin: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("insights");
  const [fan, setFan] = useState<FanResp | null>(null);
  const [cid, fanId] = conv.id.split("~");
  useEffect(() => {
    setFan(null);
    rvApi<FanResp>("GET", `/api/conversations/${conv.id}/fan`).then(setFan).catch(() => setFan({ stats: null, profile: {}, profileUpdated: null }));
  }, [conv.id]);
  const s = fan?.stats;
  const spent = s?.totalSpent ?? conv.totalSpent;

  return (
    <div className="mp-font flex min-h-full flex-col p-2.5 text-[12.5px]" style={{ color: "var(--mp-text)" }}>
      <div className="flex flex-wrap gap-1 rounded-lg p-1.5" style={{ background: "#16191c" }}>
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="rounded-md px-2.5 py-1 text-[12.5px] font-semibold" style={tab === k ? { background: "#2f6bff", color: "#fff" } : { color: "var(--mp-head)" }}>{l}</button>)}
      </div>

      {tab === "insights" ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border px-2 py-2 text-center" style={{ borderColor: "#2f6bff" }}><p className="text-[15px] font-bold" style={{ color: "var(--mp-head)" }}>{since(s?.firstSubscriptionAt || conv.subscribedAt)}</p><p style={{ color: "var(--mp-muted)" }}>Fan depuis</p></div>
            <div className="rounded-md border px-2 py-2 text-center" style={{ borderColor: "#2f6bff" }}><p className="text-[15px] font-bold" style={{ color: "var(--mp-head)" }}>{money(spent)}</p><p style={{ color: "var(--mp-muted)" }}>CA</p></div>
          </div>
          {spent > 0 ? null : <p className="text-center" style={{ color: "var(--mp-muted)" }}>Aucune dépense</p>}
          <div className="space-y-1">
            {[["Dernier paiement", day(s?.lastPaidAt)], ["Montant maximal", s?.highestPurchase ? money(s.highestPurchase) : "-"], ["Abonné jusqu’au", day(s?.subscriptionExpireAt)]].map(([l, v]) => (
              <p key={l}><b style={{ color: "var(--mp-head)" }}>{l} :</b> {v}</p>
            ))}
          </div>

          <div>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Assignation</p>
            <button onClick={onPin} className="mt-1.5 flex h-9 w-full items-center justify-center gap-2 rounded-md text-[12.5px] font-semibold" style={conv.pinned ? { background: "#2f343a", color: "var(--mp-head)" } : { background: "#f7b84b", color: "#12160c" }} title={conv.pinned ? "Désépingler : Substy peut reprendre ce fan" : "Épingle le fan pour toute l’équipe et coupe Substy sur lui : à toi de répondre"}>
              <UserRound className="size-3.5" /> {conv.pinned ? "Rendre le fan (désépingler)" : "M’assigner (Prendre)"}
            </button>
            <p className="mt-1.5 flex items-center justify-center gap-1.5" style={{ color: "var(--mp-muted)" }}>
              Assigné à : {conv.pinned ? <b style={{ color: "var(--mp-head)" }}>{conv.pinnedBy?.name || "l’équipe"}</b> : conv.ai && !conv.handoff ? <><Bot className="size-3.5" /><b style={{ color: "var(--mp-head)" }}>Substy IA</b></> : <b style={{ color: "var(--mp-head)" }}>personne</b>}
            </p>
          </div>

          <SubstyCard key={`sb-${conv.id}`} convId={conv.id} />
          <Sheet key={conv.id} cid={cid} fanId={fanId} conv={conv} fan={fan} onChanged={onChanged} />
        </div>
      ) : null}

      {tab === "ppv" ? <div className="mt-3"><PpvTimeline convId={conv.id} /></div> : null}
      {tab === "private" ? <p className="mt-10 text-center" style={{ color: "var(--mp-muted)" }}>Les demandes de médias privés du fan ne sont pas encore lues chez MYM.</p> : null}
      {tab === "iq" ? (
        <div className="mt-3">
          <p className="mb-3 rounded-md p-2.5" style={{ background: "#16191c", color: "var(--mp-muted)" }}>Le score « Spender IQ » de MyPulse vient de son IA : il arrivera avec la partie IA. En attendant, les chiffres d’achat du fan :</p>
          <FanStats key={conv.id} conv={conv} stats={s} />
        </div>
      ) : null}
      {tab === "creator" ? <div className="mt-3"><ModelSheet key={conv.modelId} modelId={conv.modelId} name={model?.displayName} /></div> : null}
    </div>
  );
}

/** Groupes, surnom, langue, âge, provenance, genre, promesse d'achat et notes : enregistrés au fil de l'eau. */
function Sheet({ cid, fanId, conv, fan, onChanged }: { cid: string; fanId: string; conv: Conv; fan: FanResp | null; onChanged: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [manage, setManage] = useState(false);
  const [nick, setNick] = useState(conv.nickname ?? "");
  const [notes, setNotes] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qs = `creatorId=${encodeURIComponent(cid)}&fanId=${encodeURIComponent(fanId)}`;
  const load = useCallback(() => {
    api<{ meta: Meta; groups: Group[]; sources: string[] }>("GET", `/api/mym/fan?${qs}`).then((r) => (setMeta(r.meta), setGroups(r.groups), setSources(r.sources))).catch((e) => toast((e as Error).message, "err"));
  }, [qs]);
  useEffect(load, [load]);
  useEffect(() => {
    if (fan && notes === null) setNotes(String(fan.profile?.notes ?? ""));
  }, [fan, notes]);
  const flash = () => (setSaved("enregistré"), setTimeout(() => setSaved(""), 1500));
  const patch = async (p: Partial<Meta>) => {
    setMeta((m) => (m ? { ...m, ...p } : m));
    try {
      await api("POST", "/api/mym/fan", { creatorId: cid, fanId, patch: p });
      flash();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const toggleGroup = async (g: Group) => {
    try {
      await api("POST", "/api/mym/fan", { creatorId: cid, fanId, patch: {}, group: { id: g.id, on: !g.member } });
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const saveNick = async () => {
    if (nick.trim() === (conv.nickname ?? "")) return;
    try {
      await rvApi("POST", `/api/conversations/${conv.id}/action`, { action: "nickname", nickname: nick.trim() });
      flash();
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const typeNotes = (v: string) => {
    setNotes(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await rvApi("PUT", `/api/conversations/${conv.id}/fan`, { profile: { ...(fan?.profile ?? {}), notes: v } });
        flash();
      } catch (e) {
        toast((e as Error).message, "err");
      }
    }, 700);
  };
  const field = "mt-1 h-8 w-full rounded-md px-2 outline-none";
  const st = { background: "#16191c", color: "var(--mp-head)" };
  const lbl = "text-[13px] font-semibold";
  const mine = groups.filter((g) => g.member);

  return (
    <>
      <div>
        <div className="flex items-center justify-between">
          <p className={lbl} style={{ color: "var(--mp-head)" }}>Groupe(s) du fan</p>
          <button onClick={() => setManage(!manage)} className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11.5px]" style={{ borderColor: BLUE, color: "#6f86d6" }}><Users className="size-3" /> {manage ? "Fermer" : "Gérer"}</button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {mine.map((g) => <span key={g.id} className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: g.color || BLUE }}>{g.name}</span>)}
          {meta && !mine.length ? <span style={{ color: "var(--mp-head)" }}>Aucun groupe</span> : null}
        </div>
        {manage ? (
          <div className="mt-2 space-y-1 rounded-md p-2" style={st}>
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-2" style={{ opacity: g.kind === "manual" ? 1 : 0.55 }} title={g.kind === "manual" ? "" : "Groupe automatique : il se remplit tout seul"}>
                <input type="checkbox" checked={g.member} disabled={g.kind !== "manual"} onChange={() => toggleGroup(g)} /> {g.name}{g.kind === "manual" ? "" : " (auto)"}
              </label>
            ))}
            {!groups.length ? <p style={{ color: "var(--mp-muted)" }}>Aucun groupe : crée-les dans Fans → Groupes.</p> : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <label className={lbl} style={{ color: "var(--mp-head)" }}>Surnom<input value={nick} maxLength={60} onChange={(e) => setNick(e.target.value)} onBlur={saveNick} className={field} style={st} /></label>
        <label className={lbl} style={{ color: "var(--mp-head)" }}>Langue<input value={meta?.lang ?? ""} maxLength={30} onChange={(e) => setMeta((m) => (m ? { ...m, lang: e.target.value } : m))} onBlur={(e) => patch({ lang: e.target.value })} className={field} style={st} /></label>
        <label className={lbl} style={{ color: "var(--mp-head)" }}>Âge<input value={meta?.age ?? ""} maxLength={10} onChange={(e) => setMeta((m) => (m ? { ...m, age: e.target.value } : m))} onBlur={(e) => patch({ age: e.target.value })} className={field} style={st} /></label>
        <label className={lbl} style={{ color: "var(--mp-head)" }}>Provenance
          <select value={meta?.source ?? ""} onChange={(e) => patch({ source: e.target.value })} className={field} style={st}><option value="">Inconnue</option>{sources.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label className={lbl} style={{ color: "var(--mp-head)" }}>Genre
          <select value={meta?.gender ?? ""} onChange={(e) => patch({ gender: e.target.value })} className={field} style={st}><option value="">—</option><option>Masculin</option><option>Féminin</option></select>
        </label>
        <label className={lbl} style={{ color: "var(--mp-head)" }} title="Date à laquelle le fan a promis d’acheter">Promesse
          <input type="date" value={meta?.promise ?? ""} onChange={(e) => patch({ promise: e.target.value })} className={field} style={{ ...st, colorScheme: "dark" }} />
        </label>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}>
          Notes <History className="size-3.5" style={{ color: "var(--mp-muted)" }} />
          <span className="ml-auto flex items-center gap-1 text-[11px] font-normal" style={{ color: saved ? "var(--mp-up)" : "var(--mp-muted)" }}>{saved ? <><Check className="size-3" />{saved}</> : fan?.profileUpdated ? `modifiées par ${fan.profileUpdated.by ?? "l’équipe"}` : ""}</span>
        </p>
        <textarea value={notes ?? ""} disabled={notes === null} onChange={(e) => typeNotes(e.target.value)} placeholder={"- Job :\n- Passions :\n- En couple ? :\n- Jour de paye :\n- Notes importantes :"} className="no-scrollbar mt-1.5 min-h-[190px] w-full resize-y rounded-md p-2.5 leading-relaxed outline-none" style={st} />
      </div>
    </>
  );
}
