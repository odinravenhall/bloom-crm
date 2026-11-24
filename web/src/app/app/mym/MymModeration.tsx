"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Ban, CreditCard, Globe, Link2, MessageSquareX, Phone, Plus, Search, ShieldAlert, ShieldCheck, Trash2, Upload, UserX, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { ContextModal, Who, int, parisDate, parisTime, tk, type Sender, type TCreator } from "./MymTeamKit";

// MYM → Pilotage d'équipe → Modération : copie de MyPulse. Détection des messages suspects (par règles, pas une IA),
// retrait de messages déjà envoyés, mots interdits de l'agence, sorties autorisées.
type Alert = { id: string; at: number; creatorId: string; creator: string; fanId: string; fan: string | null; sender: Sender; cats: string[]; severity: "high" | "medium"; text: string; deleted: boolean };
type Mod = { cats: Record<string, string>; hours: number; creators: TCreator[]; canAct: boolean; banned: number; refused: number; total: number; high: number; fans: number; counts: Record<string, number>; chatters: (Sender & { alerts: number; high: number; cats: string[]; last: number; creators: string[] })[]; alerts: Alert[]; allowed: { creatorId: string; creator: string; cat: string; by: string | null; at: number }[] };
type Found = { id: string; at: number; creatorId: string; creator: string; fanId: string; fan: string | null; text: string; sender: Sender };
type Banned = { canEdit: boolean; words: { id: number; word: string; variants: string[]; byName: string | null; at: number }[]; refused: { at: number; user: string | null; creator: string; fan: string | null; word: string; found: string; text: string }[] };
type Tab = "detect" | "text" | "chatter" | "words" | "allowed";
const ICON: Record<string, React.ReactNode> = { phone: <Phone className="size-4" />, social: <MessageSquareX className="size-4" />, platform: <Globe className="size-4" />, link: <Link2 className="size-4" />, pay: <CreditCard className="size-4" /> };
const LIME = { background: "var(--mp-accent)", color: "var(--mp-on-accent)" };
const when = (t: number) => `${parisDate(t)} ${parisTime(t)}`;

export function MymModeration() {
  const [tab, setTab] = useState<Tab>("detect");
  const [hours, setHours] = useState(168);
  const [d, setD] = useState<Mod | null>(null);
  const [err, setErr] = useState("");
  const [ctx, setCtx] = useState<string | null>(null);
  const [preset, setPreset] = useState<{ chatter?: string; ids?: Found[] } | null>(null);
  const load = useCallback(() => api<Mod>("GET", `/api/mym/mod?hours=${hours}`).then((r) => (setD(r), setErr(""))).catch((e) => setErr((e as Error).message)), [hours]);
  useEffect(() => void load(), [load]);
  const allow = async (creatorId: string, cat: string, on: boolean) => {
    await api("POST", "/api/mym/mod/allow", { creatorId, cat, on }).then(() => toast(on ? "Sortie autorisée sur ce compte" : "Autorisation retirée")).catch((e) => toast((e as Error).message, "err"));
    load();
  };
  const tabs: [Tab, string, React.ReactNode][] = [["detect", "Détection", <ShieldAlert key="a" className="size-4" />], ["text", "Retirer un message", <MessageSquareX key="b" className="size-4" />], ["chatter", "Messages d’un chatteur", <UserX key="c" className="size-4" />], ["words", "Mots interdits", <Ban key="d" className="size-4" />], ["allowed", "Sorties autorisées", <ShieldCheck key="e" className="size-4" />]];
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="rounded-2xl p-6" style={{ background: "radial-gradient(70% 140% at 85% 0%, rgba(199,255,74,.13), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.25)" }}>
        <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> Sécurité de l’équipe</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-tight" style={{ color: "var(--mp-head)" }}>Modération</h1>
        <p className="mt-1 max-w-3xl text-[13px]">Les messages envoyés aux fans que Bloom juge suspects (numéro, autre réseau ou plateforme, lien, paiement hors plateforme), et les envois bloqués par vos mots interdits.</p>
        <p className="mt-3 flex flex-wrap gap-2 text-[12px] font-semibold" style={{ color: "var(--mp-head)" }}>
          <span className="flex h-7 items-center rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}>Détection active (règles)</span>
          <span className="flex h-7 items-center rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}>{d?.creators.length ?? "…"} compte(s) MYM couvert(s)</span>
          <span className="flex h-7 items-center rounded-full border px-3" style={{ borderColor: "#3d4a2c" }}>Mots interdits actifs : {d?.banned ?? "…"}</span>
        </p>
      </div>
      <p className="mt-4 inline-flex flex-wrap gap-1 rounded-xl p-1 text-[13.5px] font-medium" style={tk.card}>{tabs.map(([k, l, icon]) => <button key={k} onClick={() => (setTab(k), setPreset(null))} className="flex items-center gap-2 rounded-lg px-3.5 py-2" style={tab === k ? { ...LIME, fontWeight: 700 } : undefined}>{icon}{l}</button>)}</p>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}

      {tab === "detect" && d ? (
        <>
          <p className="mt-4 inline-flex rounded-xl p-1 text-[13px]" style={tk.card}>{[[24, "24 h"], [168, "7 jours"], [720, "30 jours"]].map(([h, l]) => <button key={h} onClick={() => setHours(h as number)} className="rounded-lg px-3.5 py-1.5" style={hours === h ? { ...LIME, fontWeight: 700 } : undefined}>{l}</button>)}</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_3fr]">
            <div className="flex flex-col justify-end rounded-2xl p-6" style={{ background: "radial-gradient(90% 120% at 90% 0%, rgba(199,255,74,.2), transparent 60%), #141a11", border: "1px solid rgba(199,255,74,.3)" }}>
              <p className="flex items-center gap-2 text-[12px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><AlertTriangle className="size-4" style={{ color: "var(--mp-accent)" }} /> Alertes</p>
              <p className="mt-1 text-[40px] leading-none font-bold" style={{ color: "var(--mp-accent)" }}>{int(d.total)}</p>
              <p className="mt-2 text-[12.5px]">Gravité haute <b style={{ color: "var(--mp-head)" }}>{d.high}</b> · Mots interdits <b style={{ color: "var(--mp-head)" }}>{d.refused}</b> · Auteurs <b style={{ color: "var(--mp-head)" }}>{d.chatters.length}</b> · Fans <b style={{ color: "var(--mp-head)" }}>{d.fans}</b></p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(d.cats).map(([k, l]) => <div key={k} className="rounded-2xl p-4" style={tk.card}><p className="flex items-center gap-2.5 text-[11.5px] font-semibold tracking-wider uppercase"><span className="grid size-8 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{ICON[k]}</span>{l}</p><p className="mt-3 text-[20px] font-semibold" style={{ color: "var(--mp-head)" }}>{d.counts[k] ?? 0}</p></div>)}
              <div className="rounded-2xl p-4" style={tk.card}><p className="flex items-center gap-2.5 text-[11.5px] font-semibold tracking-wider uppercase"><span className="grid size-8 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}><Ban className="size-4" /></span>Mot interdit</p><p className="mt-3 text-[20px] font-semibold" style={{ color: "var(--mp-head)" }}>{d.refused}</p><button onClick={() => setTab("words")} className="mt-1 text-[12px]" style={{ color: "#6f9bff" }}>Gérer la liste · {d.banned} actif(s) →</button></div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-2xl p-5" style={tk.card}>
              <b className="text-[15.5px]" style={{ color: "var(--mp-head)" }}>Auteurs signalés</b>
              <p className="text-[12px]">Les plus signalés d’abord, gravité haute en tête.</p>
              <div className="mt-3 space-y-3">
                {d.chatters.map((c) => (
                  <div key={c.key} className="border-t pt-3 text-[13px]" style={{ borderColor: "var(--mp-line)" }}>
                    <p className="flex flex-wrap items-center gap-2"><b><Who s={c} /></b><span className="text-[12px]">{c.creators.join(", ")} · dernière : {when(c.last)}</span><span className="flex-1" /><b style={{ color: "var(--mp-head)" }}>{c.alerts}</b>{c.high ? <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#f0654822", color: "#f06548" }}>{c.high} haute(s)</span> : null}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5">{c.cats.map((k) => <span key={k} className="rounded-full border px-2 py-0.5 text-[11.5px]" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>{d.cats[k]}</span>)}{d.canAct && c.type === "human" ? <button onClick={() => (setPreset({ chatter: c.name }), setTab("chatter"))} className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-semibold" style={{ background: "#f0654822", color: "#f06548" }}><UserX className="size-3" /> Retirer ses messages</button> : null}</p>
                  </div>
                ))}
                {!d.chatters.length ? <p className="py-6 text-center text-[13px]">Aucune alerte sur cette période.</p> : null}
              </div>
            </div>
            <div className="rounded-2xl p-5" style={tk.card}>
              <b className="text-[15.5px]" style={{ color: "var(--mp-head)" }}>Alertes récentes</b>
              <p className="text-[12px]">{d.alerts.length} dernière(s) alerte(s) de la période</p>
              <div className="mt-3 max-h-[720px] space-y-3 overflow-y-auto pr-1">
                {d.alerts.map((a) => (
                  <div key={a.id} className="flex flex-wrap gap-3 rounded-xl p-3 text-[13px]" style={{ background: "var(--mp-card-2)", borderLeft: `3px solid ${a.severity === "high" ? "#f06548" : "#f7b84b"}`, opacity: a.deleted ? 0.55 : 1 }}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[12px]"><span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={a.severity === "high" ? { background: "#f0654822", color: "#f06548" } : { background: "#f7b84b22", color: "#f7b84b" }}>Gravité {a.severity === "high" ? "haute" : "moyenne"}</span>{when(a.at)}<span className="rounded-full border px-2 py-0.5" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>{a.creator}</span>{a.deleted ? <b style={{ color: "#f06548" }}>retiré</b> : null}</p>
                      <p className="mt-1.5"><b><Who s={a.sender} /></b> → {a.fan}</p>
                      <p className="mt-1 break-words" style={{ color: "var(--mp-head)" }}>{a.text}</p>
                      <p className="mt-1.5 flex flex-wrap gap-1.5">{a.cats.map((k) => <span key={k} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>{ICON[k]}{d.cats[k]}</span>)}</p>
                    </div>
                    <div className="flex w-40 flex-col gap-1.5 text-[12px]">
                      <button onClick={() => setCtx(`id=${encodeURIComponent(a.id)}`)} className="rounded px-2 py-1.5" style={{ background: "#2f343a", color: "var(--mp-head)" }}>Conversation</button>
                      {d.canAct ? <>
                        {!a.deleted ? <button onClick={() => (setPreset({ ids: [{ id: a.id, at: a.at, creatorId: a.creatorId, creator: a.creator, fanId: a.fanId, fan: a.fan, text: a.text, sender: a.sender }] }), setTab("text"))} className="rounded px-2 py-1.5 font-semibold" style={{ background: "#f0654822", color: "#f06548" }}>Retirer partout</button> : null}
                        {a.sender.type === "human" ? <button onClick={() => (setPreset({ chatter: a.sender.name }), setTab("chatter"))} className="rounded border px-2 py-1.5" style={{ borderColor: "#f06548", color: "#f06548" }}>Ses messages</button> : null}
                        <button onClick={() => allow(a.creatorId, a.cats[0], true)} title={`Ne plus signaler « ${d.cats[a.cats[0]]} » sur ${a.creator}`} className="rounded px-2 py-1.5" style={{ background: "#299cdb22", color: "#299cdb" }}>Autoriser sur ce compte</button>
                      </> : null}
                    </div>
                  </div>
                ))}
                {!d.alerts.length ? <p className="py-8 text-center text-[13px]">Rien à signaler.</p> : null}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Détection par règles (mots et formes reconnus), pas par une IA : elle ne juge pas le sens et ne repère pas une arnaque écrite avec d’autres mots. Tous les messages envoyés aux fans sont relus, y compris ceux écrits hors de Bloom.</p>
        </>
      ) : null}

      {tab === "text" && d ? <Retire key="text" mode="text" canAct={d.canAct} creators={d.creators} preset={preset} onDone={load} /> : null}
      {tab === "chatter" && d ? <Retire key={`ch-${preset?.chatter ?? ""}`} mode="chatter" canAct={d.canAct} creators={d.creators} preset={preset} onDone={load} /> : null}
      {tab === "words" ? <Words /> : null}
      {tab === "allowed" && d ? (
        <div className="mt-4 rounded-2xl p-5" style={tk.card}>
          <b className="text-[15.5px]" style={{ color: "var(--mp-head)" }}>Sorties autorisées</b>
          <p className="mt-1 text-[12.5px]">Un motif accepté sur un compte n’y est plus signalé (par exemple l’Instagram officiel de la modèle). On l’ajoute depuis une alerte, bouton « Autoriser sur ce compte ».</p>
          <div className="mt-3 space-y-2">{d.allowed.map((a) => <p key={a.creatorId + a.cat} className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-[13px]" style={{ borderColor: "var(--mp-line)" }}><b style={{ color: "var(--mp-head)" }}>{a.creator}</b><span className="flex items-center gap-1.5">{ICON[a.cat]}{d.cats[a.cat]}</span><span className="flex-1 text-[12px]">par {a.by || "—"} le {when(a.at)}</span>{d.canAct ? <button onClick={() => allow(a.creatorId, a.cat, false)} className="grid size-7 place-items-center rounded-md" style={{ background: "#f0654822", color: "#f06548" }}><Trash2 className="size-3.5" /></button> : null}</p>)}{!d.allowed.length ? <p className="py-6 text-center text-[13px]">Aucune sortie autorisée.</p> : null}</div>
        </div>
      ) : null}
      {ctx ? <ContextModal query={ctx} onClose={() => setCtx(null)} /> : null}
    </div>
  );
}

/** Retirer un message (par son texte) ou tous les messages d'un chatteur : on vérifie d'abord, on retire ensuite. */
function Retire({ mode, canAct, creators, preset, onDone }: { mode: "text" | "chatter"; canAct: boolean; creators: TCreator[]; preset: { chatter?: string; ids?: Found[] } | null; onDone: () => void }) {
  const [text, setText] = useState("");
  const [chatter, setChatter] = useState(preset?.chatter ?? "");
  const [hours, setHours] = useState(48);
  const [people, setPeople] = useState<{ name: string; n: number }[]>([]);
  const [rows, setRows] = useState<Found[] | null>(preset?.ids ?? null);
  const [picked, setPicked] = useState<Set<string>>(new Set((preset?.ids ?? []).map((r) => r.id)));
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ done: number; failed: { id: string; error: string }[] } | null>(null);
  const stop = useRef(false);
  useEffect(() => {
    if (mode === "chatter" && canAct) api<{ chatters: { name: string; n: number }[] }>("GET", "/api/mym/mod/chatters").then((r) => setPeople(r.chatters)).catch(() => {});
  }, [mode, canAct]);
  const find = async () => {
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      const r = await api<{ rows: Found[]; more: boolean }>("POST", "/api/mym/mod/find", mode === "text" ? { text } : { chatter, hours });
      setRows(r.rows);
      setMore(r.more);
      setPicked(new Set(r.rows.map((x) => x.id)));
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  const retire = async () => {
    setConfirm(false);
    setBusy(true);
    stop.current = false;
    const ids = [...picked];
    const out = { done: 0, failed: [] as { id: string; error: string }[] };
    for (let i = 0; i < ids.length && !stop.current; i += 100) {
      try {
        const r = await api<typeof out>("POST", "/api/mym/mod/retire", { ids: ids.slice(i, i + 100), confirm: true, reason: mode === "chatter" ? `messages de ${chatter}` : "texte recherché" });
        out.done += r.done;
        out.failed.push(...r.failed);
        setResult({ ...out });
      } catch (e) {
        setErr((e as Error).message);
        break;
      }
    }
    setBusy(false);
    setRows(null);
    onDone();
  };
  if (!canAct) return <p className="mt-4 rounded-2xl p-6 text-center text-[13.5px]" style={tk.card}>Le retrait de messages est réservé aux admins et managers.</p>;
  return (
    <>
      <p className="mt-4 rounded-xl px-4 py-3 text-[13px] leading-relaxed" style={{ background: "#3a1d1a", border: "1px solid #6b2d25", color: "#ff8b76" }}><b>{mode === "text" ? "Outil d’incident (arnaque, compte compromis)" : "Arnaque avérée : tous les messages texte de ce chatteur sur la période sont retirés chez les fans"}</b> : la suppression est immédiate et définitive côté MYM. Les messages avec média ne peuvent pas être retirés (refus de MYM).<br />Rien ne part sans vous : la recherche ne fait que VÉRIFIER. Relisez la liste, ajustez les cases, puis retirez la sélection.</p>
      <div className="mt-3 rounded-2xl p-5" style={tk.card}>
        <p className="text-[11.5px] font-semibold tracking-wider uppercase">Périmètre : vos comptes MYM reliés</p>
        <p className="mt-2 flex flex-wrap gap-2">{creators.map((c) => <span key={c.id} className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}>{c.name}</span>)}</p>
        {mode === "text" ? (
          <>
            <p className="mt-4 text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Texte du message à retrouver</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Collez le message tel qu’il a été envoyé (les retours à la ligne et les majuscules sont tolérés)…" className="mt-2 w-full rounded-lg p-3 font-mono text-[13px] outline-none" style={tk.inp} />
            <p className="mt-1 text-[12px]">Recherche dans les messages texte envoyés aux fans sur les 48 dernières heures (depuis Bloom ou non) : tous ceux qui contiennent ce texte.</p>
          </>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="min-w-[260px] flex-1 text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Chatteur<select value={chatter} onChange={(e) => setChatter(e.target.value)} className="mt-2 h-10 w-full rounded-lg px-3 text-[13.5px] font-normal outline-none" style={tk.inp}><option value="">Choisir une personne de l’équipe…</option>{[...new Set([...(chatter ? [chatter] : []), ...people.map((p) => p.name)])].map((n) => <option key={n} value={n}>{n}{people.find((p) => p.name === n) ? ` (${people.find((p) => p.name === n)!.n} messages sur 30 j)` : ""}</option>)}</select></label>
            <span className="text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Période<span className="mt-2 flex rounded-xl p-1 font-normal" style={tk.inp}>{[[24, "24 h"], [48, "48 h"], [168, "7 jours"], [720, "30 jours"]].map(([h, l]) => <button key={h} onClick={() => setHours(h as number)} className="rounded-lg px-3 py-1" style={hours === h ? { ...LIME, fontWeight: 700 } : undefined}>{l}</button>)}</span></span>
            <p className="w-full text-[12px]">Seuls les messages qu’il a envoyés depuis Bloom sont concernés : Bloom ne sait pas qui a écrit les autres.</p>
          </div>
        )}
        <button onClick={find} disabled={busy || (mode === "text" ? text.trim().length < 4 : !chatter)} className="mt-4 flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: "#4a57a8" }}><Search className="size-4" /> Vérifier (mode vérification)</button>
        {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
        {result ? <p className="mt-3 rounded-lg px-4 py-3 text-[13px]" style={{ background: "#143229", border: "1px solid #1f7a5c", color: "#8ff0cc" }}>{result.done} message(s) retiré(s) chez MYM.{result.failed.length ? ` ${result.failed.length} refusé(s) : ${result.failed[0].error}.` : ""}{busy ? " En cours…" : ""}</p> : null}
      </div>
      {rows ? (
        <div className="mt-3 rounded-2xl p-5" style={tk.card}>
          <p className="flex flex-wrap items-center gap-3 text-[13.5px]"><b style={{ color: "var(--mp-head)" }}>{rows.length} message(s) trouvé(s){more ? " (1 000 premiers)" : ""}</b><button onClick={() => setPicked(new Set(rows.map((r) => r.id)))} className="text-[12.5px]" style={{ color: "#6f9bff" }}>Tout cocher</button><button onClick={() => setPicked(new Set())} className="text-[12.5px]" style={{ color: "#6f9bff" }}>Tout décocher</button><span className="flex-1" />{busy ? <button onClick={() => (stop.current = true)} className="h-9 rounded-lg border px-4 text-[13px]" style={{ borderColor: "var(--mp-line)" }}>Arrêter</button> : <button onClick={() => setConfirm(true)} disabled={!picked.size} className="flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: "#c8452f" }}><Trash2 className="size-4" /> Retirer la sélection ({picked.size})</button>}</p>
          <div className="mt-3 max-h-[480px] overflow-y-auto">
            {rows.map((r) => <label key={r.id} className="flex cursor-pointer gap-3 border-t py-2.5 text-[13px]" style={{ borderColor: "var(--mp-line)" }}><input type="checkbox" checked={picked.has(r.id)} onChange={() => { const n = new Set(picked); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); setPicked(n); }} className="mt-1" /><span className="min-w-0 flex-1"><span className="text-[12px]">{when(r.at)} · {r.creator} · <Who s={r.sender} /> → {r.fan}</span><span className="block break-words" style={{ color: "var(--mp-head)" }}>{r.text}</span></span></label>)}
            {!rows.length ? <p className="py-8 text-center text-[13px]">Aucun message texte ne correspond.</p> : null}
          </div>
        </div>
      ) : null}
      {confirm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(false)}>
          <div className="w-full max-w-md rounded-xl p-6" style={{ background: "#212529", border: "1px solid #2f343a" }}>
            <p className="flex items-center text-[17px] font-bold" style={{ color: "#f3f4f6" }}><span className="flex-1">Retirer {picked.size} message(s) ?</span><button onClick={() => setConfirm(false)}><X className="size-5" /></button></p>
            <p className="mt-3 text-[13px] leading-relaxed">Ils seront supprimés chez les fans, sur MYM, tout de suite. C’est définitif : impossible de les remettre.</p>
            <p className="mt-5 flex justify-end gap-2"><button onClick={() => setConfirm(false)} className="h-9 rounded-lg px-4 text-[13px] font-semibold text-white" style={{ background: "#3577f1" }}>Annuler</button><button onClick={retire} className="h-9 rounded-lg px-4 text-[13px] font-semibold text-white" style={{ background: "#c8452f" }}>Retirer définitivement</button></p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Words() {
  const [d, setD] = useState<Banned | null>(null);
  const [word, setWord] = useState("");
  const [variants, setVariants] = useState("");
  const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const load = useCallback(() => api<Banned>("GET", "/api/mym/mod/banned").then(setD).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => void load(), [load]);
  const post = async (b: unknown) => {
    setErr("");
    try {
      await api("POST", "/api/mym/mod/banned", b);
      setWord("");
      setVariants("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    const words = (await f.text()).split(/[\r\n;,]+/).map((w) => w.trim().replace(/^"|"$/g, "")).filter((w) => w.length >= 2).slice(0, 200);
    if (words.length) post({ words });
  };
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.5fr]">
      <div className="rounded-2xl p-5" style={tk.card}>
        <p className="flex items-center gap-2"><b className="flex-1 text-[15px]" style={{ color: "var(--mp-head)" }}>Mots interdits par l’agence</b><span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "#40518955", color: "#9fb0f0" }}>{d?.words.length ?? 0}/200</span></p>
        <p className="mt-1 text-[12px] leading-relaxed">La liste vaut pour TOUTES les modèles, MYM et OnlyFans, quand on écrit depuis Bloom. Les déguisements simples tombent avec le mot : inutile de saisir « t3l » ou « t.e.l ».</p>
        {d?.canEdit ? (
          <>
            <input ref={file} type="file" accept=".txt,.csv" className="hidden" onChange={(e) => (importFile(e.target.files?.[0]), (e.target.value = ""))} />
            <button onClick={() => file.current?.click()} className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-[13.5px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><Upload className="size-4" /> Importer une liste depuis un fichier (un mot par ligne)</button>
            <p className="mt-4 text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}>Mot interdit</p>
            <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Téléphone, Snapchat, rencontre…" className="mt-1.5 h-10 w-full rounded-lg px-3 text-[13.5px] outline-none" style={tk.inp} />
            <p className="mt-3 text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}>Autres écritures à bloquer</p>
            <textarea value={variants} onChange={(e) => setVariants(e.target.value)} rows={3} placeholder={"tel\nnumero\nphone"} className="mt-1.5 w-full rounded-lg p-3 font-mono text-[13px] outline-none" style={tk.inp} />
            <p className="text-[12px]">Une par ligne : synonymes, abréviations, traductions. 60 au plus.</p>
            <button onClick={() => post({ word, variants: variants.split(/\n+/).map((v) => v.trim()).filter(Boolean) })} disabled={word.trim().length < 2} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: "#4a57a8" }}><Plus className="size-4" /> Ajouter à la liste</button>
          </>
        ) : <p className="mt-3 text-[12.5px]">Seuls les admins et managers modifient la liste.</p>}
        {err ? <p className="mt-2 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
        <div className="mt-4 space-y-1.5">{(d?.words ?? []).map((w) => <p key={w.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--mp-card-2)" }}><b style={{ color: "#f06548" }}>{w.word}</b><span className="min-w-0 flex-1 truncate text-[12px]">{w.variants.join(", ")}</span>{d?.canEdit ? <button onClick={() => post({ delete: w.id })} title="Retirer de la liste"><Trash2 className="size-3.5" /></button> : null}</p>)}{d && !d.words.length ? <p className="py-6 text-center text-[13px]">Aucun mot interdit pour l’instant.</p> : null}</div>
      </div>
      <div className="rounded-2xl p-5" style={tk.card}>
        <p className="flex items-center gap-2"><b className="flex-1 text-[15px]" style={{ color: "var(--mp-head)" }}>Messages refusés</b><span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "#40518955", color: "#9fb0f0" }}>{d?.refused.length ?? 0}</span></p>
        <p className="mt-1 text-[12px]">Qui a employé un mot interdit, et dans quel message. Conservé 60 jours.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead><tr className="text-left" style={{ color: "var(--mp-head)" }}>{["Quand", "Modèle", "Chatteur", "Mot", "Message tenté"].map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{(d?.refused ?? []).map((r, i) => <tr key={i} className="border-t" style={{ borderColor: "var(--mp-line)" }}><td className="px-2 py-2 whitespace-nowrap">{when(r.at)}</td><td className="px-2" style={{ color: "var(--mp-head)" }}>{r.creator}</td><td className="px-2" style={{ color: "var(--mp-head)" }}>{r.user}</td><td className="px-2 whitespace-nowrap"><span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "#f0654822", color: "#f06548" }}>{r.word}</span>{r.found !== r.word ? <span className="ml-1 rounded px-1.5 py-0.5 font-mono text-[11px]" style={{ background: "#f7b84b22", color: "#f7b84b" }}>{r.found}</span> : null}</td><td className="px-2 break-words" style={{ color: "var(--mp-head)" }}>{r.text}</td></tr>)}</tbody>
          </table>
          {d && !d.refused.length ? <p className="py-8 text-center text-[13px]">Aucun envoi bloqué.</p> : null}
        </div>
      </div>
    </div>
  );
}
