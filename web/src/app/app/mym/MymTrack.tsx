"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Plus, RefreshCw, Share2, Trash2, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Kpis, TrackChart, addDay, frDay, money, num, tcard, type TData } from "./MymTrackKit";

// MYM → Stats → Liens de suivi : copie de la page de MyPulse. Les liens sont ceux de MYM (studio → tracking links) :
// Bloom lit leurs totaux, les crée et les supprime chez MYM, et peut en partager les chiffres sur une page publique.
type Share = { id: string; name: string; hasPassword: boolean; expires: number | null; links: string[]; by: string | null; at: number };
const parisToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast("Copié")).catch(() => toast("Copie impossible", "err"));
const inp = { background: "#12141a", border: "1px solid #2a2e37", color: "#f3f4f6" };

export function MymTrack() {
  const { creators, creatorId, setCreator } = useCreators();
  const [dates, setDates] = useState<[string, string]>(() => [addDay(parisToday(), -29), parisToday()]);
  const [d, setD] = useState<TData | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"new" | "share" | null>(null);
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);
  const load = useCallback((fresh = false) => {
    if (!creatorId) return Promise.resolve();
    return api<TData>("GET", `/api/mym/track?creatorId=${encodeURIComponent(creatorId)}&from=${dates[0]}&to=${dates[1]}${fresh ? "&fresh=1" : ""}`).then((r) => (setD(r), setErr(r.error || ""))).catch((e) => (setD(null), setErr((e as Error).message)));
  }, [creatorId, dates]);
  useEffect(() => void load(), [load]);
  const remove = async () => {
    if (!del || !creatorId) return;
    setBusy(true);
    try {
      await api("POST", "/api/mym/track/delete", { creatorId, id: del.id, confirm: true });
      toast("Lien supprimé chez MYM");
      setDel(null);
      await load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
    setBusy(false);
  };
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "#14161b", color: "#aab0bd" }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><h1 className="text-[22px] font-bold" style={{ color: "#f3f4f6" }}>Analytique Tracking Links</h1><p className="text-[12.5px]">{d ? `${d.links.length} lien${d.links.length > 1 ? "s" : ""} actif${d.links.length > 1 ? "s" : ""}, lu${d.links.length > 1 ? "s" : ""} chez MYM${d.at ? ` à ${new Date(d.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}` : "…"}</p></div>
        {creators.length > 1 ? <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="h-9 rounded-lg px-3 text-[13px] outline-none" style={inp}>{creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : null}
        <button onClick={() => (setBusy(true), load(true).finally(() => setBusy(false)))} disabled={busy} className="flex h-9 items-center gap-2 rounded-lg border px-3 text-[12.5px] font-semibold" style={{ borderColor: "#2f6bff", color: "#6f9bff" }}><RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} /> Actualiser</button>
      </div>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "#f06548" }}>{err}</p> : null}
      {d ? (
        <>
          <div className="mt-4"><Kpis links={d.links} /></div>
          <div className="mt-4"><TrackChart d={d} dates={dates} setDates={(r) => setDates(r)} /></div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <b className="flex-1 text-[17px]" style={{ color: "#f3f4f6" }}>Gestion des liens</b>
            {d.canEdit ? <><button onClick={() => setModal("share")} className="flex h-9 items-center gap-2 rounded-lg border px-3 text-[12.5px] font-semibold" style={{ borderColor: "#2f6bff", color: "#6f9bff" }}><Share2 className="size-3.5" /> Partages externes</button><button onClick={() => setModal("new")} className="flex h-9 items-center gap-2 rounded-lg px-3 text-[12.5px] font-semibold text-white" style={{ background: "#4a57a8" }}><Plus className="size-3.5" /> Nouveau lien</button></> : null}
          </div>
          <div className="mt-3 overflow-x-auto rounded-2xl" style={tcard}>
            <table className="w-full min-w-[860px] text-[13px]">
              <thead><tr className="text-[11px] tracking-wider uppercase">{["Nom", "URL", "Clics", "Conv.", "Taux", "Revenus", "LTV (sur conv.)", "PPV achetés", ""].map((h, i) => <th key={h + i} className={`border-b px-5 py-4 font-bold ${i > 1 ? "text-center" : "text-left"}`} style={{ borderColor: "#2a2e37" }}>{h}</th>)}</tr></thead>
              <tbody>
                {d.links.map((l) => (
                  <tr key={l.id} className="border-b last:border-0" style={{ borderColor: "#2a2e37" }}>
                    <td className="px-5 py-4"><b style={{ color: "#f3f4f6" }}>{l.name}</b><p className="text-[11.5px]">Créé le {frDay(l.created)}</p></td>
                    <td className="px-5">{l.url ? <button onClick={() => copy(l.url as string)} title="Copier l’adresse" className="flex max-w-[290px] items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[12px]" style={inp}><span className="truncate">{l.url.replace(/^(https:\/\/[^/]+)\/.*\//, "$1…/")}</span><Copy className="size-3 shrink-0" /></button> : "—"}</td>
                    <td className="px-5 text-center"><span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "#22d3ee22", color: "#22d3ee" }}>{num(l.clicks)}</span></td>
                    <td className="px-5 text-center"><span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: "#1fe0a022", color: "#1fe0a0" }}>{num(l.subs)}</span></td>
                    <td className="px-5 text-center">{(l.clicks ? (l.subs / l.clicks) * 100 : 0).toFixed(2)} %</td>
                    <td className="px-5 text-center font-bold" style={{ color: "#f3f4f6" }}>{money(l.total)}</td>
                    <td className="px-5 text-center font-bold" style={{ color: "#f3f4f6" }}>{money(l.subs ? l.total / l.subs : 0)}</td>
                    <td className="px-5 text-center">{num(l.ppvN)}</td>
                    <td className="px-5 text-right">{d.canEdit ? <button onClick={() => setDel({ id: l.id, name: l.name })} title="Supprimer ce lien chez MYM" className="grid size-8 place-items-center rounded-md" style={{ background: "#f0654822", color: "#f06548" }}><Trash2 className="size-3.5" /></button> : null}</td>
                  </tr>
                ))}
                {!d.links.length ? <tr><td colSpan={9} className="px-5 py-10 text-center">Aucun lien de suivi sur ce compte MYM.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      ) : !err ? <p className="mt-8 text-[13px]">Lecture des liens chez MYM…</p> : null}

      {modal === "new" && creatorId ? <NewLink creatorId={creatorId} onClose={() => setModal(null)} onDone={() => (setModal(null), load())} /> : null}
      {modal === "share" && creatorId && d ? <Shares creatorId={creatorId} d={d} onClose={() => setModal(null)} /> : null}
      {del ? (
        <Modal title="Supprimer ce lien de suivi ?" onClose={() => setDel(null)}>
          <p className="text-[13px] leading-relaxed">Le lien <b style={{ color: "#f3f4f6" }}>{del.name}</b> sera supprimé sur le compte MYM. Son adresse ne fonctionnera plus et MYM n’affichera plus ses chiffres : ce n’est pas récupérable.</p>
          <p className="mt-5 flex justify-end gap-2"><button onClick={() => setDel(null)} className="h-9 rounded-lg px-4 text-[13px] font-semibold text-white" style={{ background: "#3577f1" }}>Annuler</button><button onClick={remove} disabled={busy} className="h-9 rounded-lg px-4 text-[13px] font-semibold text-white" style={{ background: "#c8452f" }}>{busy ? "…" : "Supprimer"}</button></p>
        </Modal>
      ) : null}
    </div>
  );
}

function Modal({ title, onClose, wide, children }: { title: React.ReactNode; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl p-6`} style={{ background: "#212529", border: "1px solid #2f343a", color: "#aab0bd" }}>
        <p className="mb-5 flex items-center gap-2 text-[18px] font-bold" style={{ color: "#f3f4f6" }}><span className="min-w-0 flex-1">{title}</span><button onClick={onClose}><X className="size-5" /></button></p>
        {children}
      </div>
    </div>
  );
}

function NewLink({ creatorId, onClose, onDone }: { creatorId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = /^[a-zA-Z0-9_-]{1,60}$/.test(name);
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("POST", "/api/mym/track/create", { creatorId, name });
      toast("Lien créé chez MYM");
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <Modal title="Créer un nouveau Tracking Link" onClose={onClose}>
      <p className="text-[13.5px] font-medium" style={{ color: "#d6dae2" }}>Nom du lien (référence interne)</p>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok && !busy && go()} placeholder="Ex : Insta_Bio, TikTok-Campagne" className="mt-2 h-11 w-full rounded-lg px-4 text-[14px] outline-none" style={inp} />
      <p className="mt-2 text-[12px]" style={name && !ok ? { color: "#f06548" } : undefined}>Lettres, chiffres, tiret (-) et tiret bas (_) uniquement : MYM refuse les espaces, les accents et la ponctuation.</p>
      <p className="mt-4 rounded-lg border px-4 py-3 text-[13px]" style={{ borderColor: "#22607a", background: "#16323d", color: "#6fd3f2" }}>Le lien sera créé tout de suite sur le compte MYM, puis affiché ici.</p>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "#f06548" }}>{err}</p> : null}
      <p className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="h-9 rounded-lg px-4 text-[13px] font-semibold text-white" style={{ background: "#3577f1" }}>Annuler</button><button onClick={go} disabled={!ok || busy} className="h-9 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "#4a57a8" }}>{busy ? "Création…" : "Créer le lien"}</button></p>
    </Modal>
  );
}

function Shares({ creatorId, d, onClose }: { creatorId: string; d: TData; onClose: () => void }) {
  const [list, setList] = useState<Share[] | null>(null);
  const [name, setName] = useState("");
  const [expires, setExpires] = useState("");
  const [password, setPassword] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [made, setMade] = useState("");
  const load = useCallback(() => api<{ shares: Share[] }>("GET", `/api/mym/track/shares?creatorId=${encodeURIComponent(creatorId)}`).then((r) => setList(r.shares)).catch((e) => setErr((e as Error).message)), [creatorId]);
  useEffect(() => void load(), [load]);
  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ token: string }>("POST", "/api/mym/track/share", { creatorId, name, password, links, expires: expires ? new Date(expires).getTime() : null });
      setMade(`${location.origin}/partage/${r.token}`);
      setName("");
      setPassword("");
      setExpires("");
      setLinks([]);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  const revoke = async (id: string) => {
    await api("POST", "/api/mym/track/share/delete", { creatorId, id }).catch((e) => toast((e as Error).message, "err"));
    load();
  };
  return (
    <Modal wide title={<span className="flex items-center gap-2"><Share2 className="size-5" /> Partages externes des stats</span>} onClose={onClose}>
      <p className="text-[13px] leading-relaxed">Crée une page publique (sans compte Bloom) qui montre les chiffres et la courbe d’un ou plusieurs liens de suivi. Tu peux demander un mot de passe, fixer une date de fin, ou supprimer le partage à tout moment.</p>
      <div className="mt-4 rounded-xl border p-5" style={{ borderColor: "#2f343a", background: "#1c1f24" }}>
        <b className="text-[14.5px]" style={{ color: "#f3f4f6" }}>Créer un nouveau partage</b>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="text-[13px]">Nom (référence interne)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex : Agence X, Reporting hebdo…" className="mt-1.5 h-10 w-full rounded-lg px-3 outline-none" style={inp} /></label>
          <label className="text-[13px]">Date d’expiration (optionnel)<input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} className="mt-1.5 h-10 w-full rounded-lg px-3 outline-none" style={{ ...inp, colorScheme: "dark" }} /></label>
        </div>
        <label className="mt-4 block text-[13px]">Mot de passe (optionnel)<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Laisser vide pour un accès libre" className="mt-1.5 h-10 w-full rounded-lg px-3 outline-none" style={inp} /></label>
        <p className="mt-4 text-[13px]">Liens inclus <button onClick={() => setLinks(d.links.map((l) => l.id))} className="ml-3 text-[12.5px]" style={{ color: "#6f9bff" }}>Tout sélectionner</button> <span className="mx-1">|</span> <button onClick={() => setLinks([])} className="text-[12.5px]" style={{ color: "#6f9bff" }}>Tout désélectionner</button></p>
        <p className="mt-2 flex flex-wrap gap-2">{d.links.map((l) => {
          const on = links.includes(l.id);
          return <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-semibold" style={{ borderColor: on ? "#2f6bff" : "#2f343a", color: "#f3f4f6" }}><input type="checkbox" checked={on} onChange={() => setLinks(on ? links.filter((x) => x !== l.id) : [...links, l.id])} />{l.name}</label>;
        })}</p>
        {err ? <p className="mt-3 text-[13px]" style={{ color: "#f06548" }}>{err}</p> : null}
        <p className="mt-4 flex justify-end"><button onClick={create} disabled={busy || !links.length} className="flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "#4a57a8" }}><Link2 className="size-4" /> {busy ? "Création…" : "Créer le partage"}</button></p>
        {made ? <div className="mt-4 rounded-lg border px-4 py-3 text-[13px]" style={{ borderColor: "#1f7a5c", background: "#143229", color: "#8ff0cc" }}>Partage créé. Copie cette adresse maintenant : elle ne sera plus affichée.<button onClick={() => copy(made)} className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-mono text-[12px]" style={inp}><span className="min-w-0 flex-1 truncate">{made}</span><Copy className="size-3.5 shrink-0" /></button></div> : null}
      </div>
      <b className="mt-5 block text-[14.5px]" style={{ color: "#f3f4f6" }}>Partages existants</b>
      {list && !list.length ? <p className="py-6 text-center text-[13px]">Aucun partage créé pour le moment.</p> : null}
      <div className="mt-2 space-y-2">{(list ?? []).map((s) => (
        <p key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-[13px]" style={{ borderColor: "#2f343a" }}>
          <b className="min-w-0 flex-1 truncate" style={{ color: "#f3f4f6" }}>{s.name}</b>
          <span>{s.links.map((id) => d.links.find((l) => l.id === id)?.name || "lien supprimé").join(", ")}</span>
          <span>{s.hasPassword ? "Mot de passe" : "Accès libre"}</span>
          <span style={s.expires && s.expires < Date.now() ? { color: "#f06548" } : undefined}>{s.expires ? `${s.expires < Date.now() ? "Expiré le" : "Jusqu’au"} ${new Date(s.expires).toLocaleDateString("fr-FR")}` : "Sans fin"}</span>
          <button onClick={() => revoke(s.id)} title="Supprimer ce partage (l’adresse ne marchera plus)" className="grid size-7 place-items-center rounded-md" style={{ background: "#f0654822", color: "#f06548" }}><Trash2 className="size-3.5" /></button>
        </p>
      ))}</div>
      <p className="mt-5 flex justify-end"><button onClick={onClose} className="h-9 rounded-lg px-4 text-[13px] font-semibold text-white" style={{ background: "#3577f1" }}>Fermer</button></p>
    </Modal>
  );
}
