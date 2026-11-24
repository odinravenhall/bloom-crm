"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Clock, Copy, Filter, Repeat, Trash2, Wifi, X, Zap } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";

// Automatisation → Nudge IA : les automatisations de Substy « le fan passe en ligne → l'IA lui écrit », vues et
// pilotées depuis Bloom (activer / couper, copier vers une autre modèle, supprimer). Même page pour OnlyFans et MYM.
// Le contenu d'un nudge (texte, délai, filtres) se règle encore dans Substy : Bloom ne sait pas l'écrire de façon sûre.
type Nudge = {
  id: string; name: string; enabled: boolean; trigger: string; delay: { min: number | null; max: number | null } | null; everyTime: boolean;
  spendMin: number | null; spendMax: number | null; skipRecentHours: number | null; skipUnread: boolean; listsIn: number; listsOut: number;
  messages: { text: string; ai: boolean; price: number; medias: number }[]; sent: number; earned: number; createdBy: string | null; createdAt: string | null; pausedReason: string | null;
};
type Data = { canEdit: boolean; creator: string; nudges: Nudge[]; others: Nudge[] };
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const inp = { background: "var(--mp-card-2)", border: "1px solid var(--mp-line)", color: "var(--mp-head)" };
const TRIG: Record<string, string> = { online: "Le fan passe en ligne", message: "Le fan envoie un message", subscribe: "Premier abonnement du fan" };

export function MymNudges() {
  const { creators, allCreators, creatorId, creator, setCreator } = useCreators();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"nudges" | "others">("nudges");
  const [busy, setBusy] = useState("");
  const [copy, setCopy] = useState<Nudge | null>(null);
  const [del, setDel] = useState<Nudge | null>(null);
  const [from, setFrom] = useState(false);
  const load = useCallback(() => {
    if (!creatorId) return Promise.resolve();
    return api<Data>("GET", `/api/nudges?creatorId=${encodeURIComponent(creatorId)}`).then((r) => (setD(r), setErr(""))).catch((e) => (setD(null), setErr((e as Error).message)));
  }, [creatorId]);
  useEffect(() => {
    setD(null);
    load();
  }, [load]);
  const act = async (key: string, url: string, payload: Record<string, unknown>, ok: string) => {
    setBusy(key);
    try {
      await api("POST", url, payload);
      toast(ok);
      await load();
      return true;
    } catch (e) {
      toast((e as Error).message, "err");
      return false;
    } finally {
      setBusy("");
    }
  };
  const list = tab === "nudges" ? d?.nudges ?? [] : d?.others ?? [];
  // Modèles présentes chez Substy (les seules à pouvoir porter un nudge), toutes plateformes.
  const substy = allCreators.filter((c) => !String(c.id).startsWith("mym-"));
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="rounded-2xl p-6" style={{ background: "radial-gradient(70% 140% at 85% 0%, rgba(199,255,74,.13), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.25)" }}>
        <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> Automatisation</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--mp-head)" }}>Nudge IA</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed">Quand un fan passe en ligne, l’IA de Substy lui écrit une relance adaptée à sa conversation, une à trois minutes après. Ici tu vois les nudges de la modèle, tu les allumes ou les coupes, et tu les copies d’une modèle à l’autre.</p>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>
          {creators.length > 1 ? <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="h-8 rounded-full border bg-transparent px-3 outline-none" style={{ borderColor: "#3d4a2c" }}>{creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}</select> : <span className="flex h-8 items-center rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}>{creator?.name}</span>}
          <span className="flex h-8 items-center gap-1.5 rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}><Zap className="size-3.5" style={{ color: "var(--mp-accent)" }} /> {d ? `${d.nudges.filter((n) => n.enabled).length} nudge(s) actif(s)` : "…"}</span>
          {d?.canEdit ? <button onClick={() => setFrom(true)} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold" style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}><Copy className="size-3.5" /> Copier un nudge depuis une autre modèle</button> : null}
        </p>
      </div>
      {err ? <p className="mt-4 rounded-xl px-4 py-3 text-[13px]" style={{ background: "#3a1d1a", border: "1px solid #6b2d25", color: "#ff8b76" }}>{err}</p> : null}

      <p className="mt-4 inline-flex rounded-xl p-1 text-[13.5px] font-medium" style={card}>{([["nudges", `Nudges IA (${d?.nudges.length ?? 0})`], ["others", `Autres automatisations Substy (${d?.others.length ?? 0})`]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="rounded-lg px-3.5 py-2" style={tab === k ? { background: "var(--mp-accent)", color: "var(--mp-on-accent)", fontWeight: 700 } : undefined}>{l}</button>)}</p>

      <div className="mt-3 space-y-3">
        {list.map((n) => (
          <div key={n.id} className="rounded-2xl p-5" style={{ ...card, opacity: n.enabled ? 1 : 0.78 }}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{n.trigger === "online" ? <Wifi className="size-4" /> : <Zap className="size-4" />}</span>
              <div className="min-w-0 flex-1"><b className="text-[15px]" style={{ color: "var(--mp-head)" }}>{n.name}</b><p className="text-[12px]">{TRIG[n.trigger] || n.trigger}{n.createdBy ? ` · créé par ${n.createdBy}` : ""}</p></div>
              <span className="rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={n.enabled ? { background: "#0ab39c22", color: "#3cd188" } : { background: "#878a9922", color: "#aab0bd" }}>{n.enabled ? "Actif" : "Coupé"}</span>
              {d?.canEdit ? (
                <>
                  <button disabled={busy === n.id} onClick={() => creatorId && act(n.id, "/api/nudges/toggle", { creatorId, id: n.id, enabled: !n.enabled }, n.enabled ? "Nudge coupé" : "Nudge activé")} title={n.enabled ? "Couper ce nudge" : "Activer ce nudge : l’IA écrira aux fans qui passent en ligne"} className="relative h-6 w-11 rounded-full transition" style={{ background: n.enabled ? "var(--mp-accent)" : "#3a4047" }}><span className="absolute top-0.5 size-5 rounded-full bg-white transition-all" style={{ left: n.enabled ? 22 : 2 }} /></button>
                  <button onClick={() => setCopy(n)} title="Copier vers une autre modèle" className="grid size-8 place-items-center rounded-md" style={{ background: "var(--mp-card-2)" }}><Copy className="size-3.5" /></button>
                  <button onClick={() => setDel(n)} title="Supprimer chez Substy" className="grid size-8 place-items-center rounded-md" style={{ background: "#f0654822", color: "#f06548" }}><Trash2 className="size-3.5" /></button>
                </>
              ) : null}
            </div>
            <p className="mt-3 flex flex-wrap gap-2 text-[12px]">
              <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><Clock className="size-3" /> {n.delay ? `${n.delay.min ?? "?"} à ${n.delay.max ?? "?"} min après` : "Tout de suite"}</span>
              <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><Repeat className="size-3" /> {n.everyTime ? "À chaque fois" : "Une seule fois par fan"}</span>
              {n.spendMin != null && n.spendMin > 0 ? <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><Filter className="size-3" /> A déjà dépensé {n.spendMin}{n.spendMax ? ` à ${n.spendMax}` : " ou plus"}</span> : null}
              {n.skipRecentHours ? <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--mp-line)" }}>Pas si déjà contacté depuis {n.skipRecentHours} h</span> : null}
              {n.skipUnread ? <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--mp-line)" }}>Pas si messages non lus</span> : null}
              {n.listsOut ? <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--mp-line)" }}>{n.listsOut} liste(s) exclue(s)</span> : null}
              {n.listsIn ? <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--mp-line)" }}>{n.listsIn} liste(s) visée(s)</span> : null}
            </p>
            {n.messages.map((m, i) => (
              <p key={i} className="mt-3 rounded-xl px-4 py-3 text-[13.5px]" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}>
                {m.ai ? <span className="mr-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: "#a855f7" }}><Bot className="size-3" /> IA</span> : null}
                {m.text || (m.medias ? `[${m.medias} média(s)]` : "(sans texte)")}{m.price ? <b className="ml-2" style={{ color: "var(--mp-accent)" }}>{m.price}</b> : null}
                {m.ai ? <span className="mt-1 block text-[11.5px]" style={{ color: "var(--mp-text)" }}>Texte de base : l’IA le réécrit pour chaque fan selon sa conversation.</span> : null}
              </p>
            ))}
            <p className="mt-3 text-[12px]">Envoyés : <b style={{ color: "var(--mp-head)" }}>{n.sent}</b> · Gagné : <b style={{ color: "var(--mp-head)" }}>{n.earned}</b>{n.pausedReason ? <span style={{ color: "#f7b84b" }}> · mis en pause par Substy : {n.pausedReason}</span> : null}</p>
          </div>
        ))}
        {d && !list.length ? <p className="rounded-2xl p-8 text-center text-[13.5px]" style={card}>{tab === "nudges" ? "Aucun nudge IA sur cette modèle. Copie-en un depuis une autre modèle, ou crée-le une fois dans Substy (CRM → Automations → Online Message)." : "Aucune autre automatisation."}</p> : null}
        {!d && !err ? <p className="text-[13px]">Lecture chez Substy…</p> : null}
      </div>
      <p className="mt-4 max-w-4xl text-[11.5px] leading-relaxed" style={{ color: "var(--mp-muted)" }}>Ces automatisations tournent chez Substy : Bloom les lit et les pilote. Pour changer le texte, le délai ou les filtres d’un nudge, il faut encore passer par Substy (CRM → Automations). Seuls les admins et managers peuvent activer, copier ou supprimer.</p>

      {copy && creatorId ? <CopyBox title={`Copier « ${copy.name} »`} label="Vers quelle modèle ?" options={substy.map((c) => ({ id: c.id, name: `${c.name} · ${/mym/i.test(c.platform || "") ? "MYM" : "OnlyFans"}${c.id === creatorId ? " (la même)" : ""}` }))} busy={busy === "copy"} onClose={() => setCopy(null)} onOk={async (to) => (await act("copy", "/api/nudges/copy", { creatorId, id: copy.id, to, confirm: true }, "Nudge copié")) && setCopy(null)} note="La copie arrive chez Substy avec les mêmes réglages. Vérifie son état (actif ou coupé) sur la page de la modèle d’arrivée avant de la laisser tourner." /> : null}
      {from && creatorId ? <FromBox creatorId={creatorId} name={creator?.name || ""} sources={substy.filter((c) => c.id !== creatorId).map((c) => ({ id: c.id, name: `${c.name} · ${/mym/i.test(c.platform || "") ? "MYM" : "OnlyFans"}` }))} onClose={() => setFrom(false)} onDone={() => (setFrom(false), load())} /> : null}
      {del && creatorId ? (
        <Box title="Supprimer cette automatisation ?" onClose={() => setDel(null)}>
          <p className="text-[13px] leading-relaxed"><b style={{ color: "#f3f4f6" }}>{del.name}</b> sera supprimée chez Substy pour {d?.creator}. Ce n’est pas récupérable.</p>
          <p className="mt-5 flex justify-end gap-2"><button onClick={() => setDel(null)} className="h-9 rounded-lg px-4 text-[13px]" style={{ background: "#2f343a", color: "#f3f4f6" }}>Annuler</button><button disabled={busy === "del"} onClick={async () => (await act("del", "/api/nudges/delete", { creatorId, id: del.id, confirm: true }, "Automatisation supprimée")) && setDel(null)} className="h-9 rounded-lg px-4 text-[13px] font-semibold text-white" style={{ background: "#c8452f" }}>{busy === "del" ? "…" : "Supprimer"}</button></p>
        </Box>
      ) : null}
    </div>
  );
}

function Box({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-xl p-6" style={{ background: "#212529", border: "1px solid #2f343a", color: "#aab0bd" }}>
        <p className="mb-4 flex items-center text-[17px] font-bold" style={{ color: "#f3f4f6" }}><span className="min-w-0 flex-1">{title}</span><button onClick={onClose}><X className="size-5" /></button></p>
        {children}
      </div>
    </div>
  );
}

function CopyBox({ title, label, options, busy, onClose, onOk, note }: { title: string; label: string; options: { id: string; name: string }[]; busy: boolean; onClose: () => void; onOk: (id: string) => void; note: string }) {
  const [to, setTo] = useState(options[0]?.id ?? "");
  return (
    <Box title={title} onClose={onClose}>
      <label className="block text-[13.5px] font-medium" style={{ color: "#f3f4f6" }}>{label}<select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg px-3 text-[13.5px] outline-none" style={inp}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <p className="mt-3 text-[12.5px] leading-relaxed">{note}</p>
      <p className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="h-9 rounded-lg px-4 text-[13px]" style={{ background: "#2f343a", color: "#f3f4f6" }}>Annuler</button><button disabled={busy || !to} onClick={() => onOk(to)} className="h-9 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "#4a57a8" }}>{busy ? "Copie…" : "Copier"}</button></p>
    </Box>
  );
}

/** Choisir une autre modèle, voir ses nudges IA, en copier un vers la modèle courante. */
function FromBox({ creatorId, name, sources, onClose, onDone }: { creatorId: string; name: string; sources: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [src, setSrc] = useState(sources[0]?.id ?? "");
  const [list, setList] = useState<Nudge[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    if (!src) return;
    setList(null);
    api<Data>("GET", `/api/nudges?creatorId=${encodeURIComponent(src)}`).then((r) => (setList(r.nudges), setErr(""))).catch((e) => setErr((e as Error).message));
  }, [src]);
  const go = async (n: Nudge) => {
    setBusy(n.id);
    try {
      await api("POST", "/api/nudges/copy", { creatorId: src, id: n.id, to: creatorId, confirm: true });
      toast("Nudge copié");
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  };
  return (
    <Box title={`Copier un nudge vers ${name}`} onClose={onClose}>
      {sources.length ? <label className="block text-[13.5px] font-medium" style={{ color: "#f3f4f6" }}>Depuis quelle modèle ?<select value={src} onChange={(e) => setSrc(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg px-3 text-[13.5px] outline-none" style={inp}>{sources.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label> : <p className="text-[13px]">Aucune autre modèle chez Substy.</p>}
      {err ? <p className="mt-3 text-[13px]" style={{ color: "#f06548" }}>{err}</p> : null}
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
        {(list ?? []).map((n) => <p key={n.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: "#2f343a" }}><span className="min-w-0 flex-1"><b className="block truncate" style={{ color: "#f3f4f6" }}>{n.name}</b><span className="text-[12px]">{n.enabled ? "Actif" : "Coupé"}{n.delay ? ` · ${n.delay.min} à ${n.delay.max} min` : ""}</span></span><button disabled={!!busy} onClick={() => go(n)} className="h-8 rounded-lg px-3 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: "#4a57a8" }}>{busy === n.id ? "Copie…" : "Copier"}</button></p>)}
        {list && !list.length ? <p className="py-4 text-center text-[13px]">Cette modèle n’a pas de nudge IA.</p> : null}
        {!list && !err && src ? <p className="py-4 text-center text-[13px]">Lecture chez Substy…</p> : null}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed">La copie arrive avec les mêmes réglages. Vérifie ensuite si elle est active ou coupée sur la page de {name}.</p>
    </Box>
  );
}
