"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Eraser, Info, Link2, Pencil, Play, Search, Trash2, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { PlanImport } from "./MymPlanImport";
import { Avatar } from "@/components/ui";

// MYM → Médias → Planification : copie de MyPulse (Calendrier, À venir, Historique). Bloom garde la planification et
// publie lui-même le post chez MYM à l'heure prévue, avec un média du mym.cloud de la modèle.
type Account = { id: string; name: string; username: string | null; avatar: string | null; linked: boolean };
type Item = { id: number; creatorId: string; audience?: string | null; after?: { action: string; ms: number | null; at: number | null; done: number | null; error: string | null } | null; kind: string; at: number; visibility: "public" | "private"; caption: string; mediaId: string; mediaType: string | null; status: "planned" | "publishing" | "created" | "failed" | "cancelled"; error: string | null; createdBy: string | null };
type Data = { canEdit: boolean; accounts: Account[]; items: Item[]; last?: Record<string, number> };
type Draft = { id?: number; creatorId: string; at: string; visibility: "public" | "private"; caption: string; mediaId: string; mediaType: string; preview?: string | null };
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const BLUE = "#405189";
const TABS = [["cal", "Calendrier"], ["next", "À venir (Stories & Posts)"], ["past", "Historique (Stories & Posts)"], ["xls", "Import Excel"]] as const;
const pad = (n: number) => String(n).padStart(2, "0");
const local = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const day = (ms: number) => local(ms).slice(0, 10);
const fmt = (ms: number) => new Date(ms).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<Item["status"], [string, string]> = { planned: ["Planifié", BLUE], publishing: ["Envoi…", "#f7b84b"], created: ["Publié", "#0ab39c"], failed: ["Échec", "#f06548"], cancelled: ["Annulé", "#878a99"] };

export function MymPlanning() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("cal");
  const [d, setD] = useState<Data | null>(null);
  const [cal, setCal] = useState<Item[]>([]);
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1).getTime();
  });
  const [only, setOnly] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  // Grille du mois : du lundi d'avant le 1er, 6 semaines.
  const start = useMemo(() => {
    const f = new Date(month);
    return new Date(f.getFullYear(), f.getMonth(), 1 - ((f.getDay() + 6) % 7)).getTime();
  }, [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => new Date(new Date(start).getFullYear(), new Date(start).getMonth(), new Date(start).getDate() + i).getTime()), [start]);
  const load = useCallback(() => {
    api<Data>("GET", "/api/mym/plan").then(setD).catch((e) => toast((e as Error).message, "err"));
    api<Data>("GET", `/api/mym/plan?from=${days[0]}&to=${days[41] + 864e5}`).then((r) => setCal(r.items)).catch(() => {});
  }, [days]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  const accounts = d?.accounts ?? [];
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? "—";
  const open = (at: number, it?: Item) => {
    const first = accounts.find((a) => a.linked && (!only || a.id === only)) ?? accounts.find((a) => a.linked);
    if (!d?.canEdit) return toast("Réservé aux admins, managers et team leaders", "err");
    if (!first) return toast("Aucun compte MYM relié à Bloom (MYM → Compte Creator → « Relier à MYM »).", "err");
    setDraft(it ? { id: it.id, creatorId: it.creatorId, at: local(it.at), visibility: it.visibility, caption: it.caption, mediaId: it.mediaId, mediaType: it.mediaType || "photo" } : { creatorId: first.id, at: local(Math.max(at, Date.now() + 10 * 60_000)), visibility: "public", caption: "", mediaId: "", mediaType: "photo" });
  };
  const cancel = async (it: Item) => {
    if (!confirm(`Annuler la publication du ${fmt(it.at)} pour ${nameOf(it.creatorId)} ?`)) return;
    try {
      await api("POST", "/api/mym/plan/cancel", { id: it.id });
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const today = day(Date.now());
  const monthLabel = new Date(month).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).toUpperCase();
  const shift = (by: number) => setMonth(new Date(new Date(month).getFullYear(), new Date(month).getMonth() + by, 1).getTime());

  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <h1 className="text-[15px] font-bold tracking-wide uppercase" style={{ color: "var(--mp-head)" }}>Planification</h1>
      <div className="mt-4 flex flex-wrap border-b text-[13px]" style={{ borderColor: "var(--mp-line)" }}>
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="rounded-t-md px-4 py-2.5 font-medium" style={tab === k ? { background: "var(--mp-card)", color: "var(--mp-head)" } : { color: "var(--mp-head)" }}>{l}</button>)}
      </div>

      {tab === "cal" ? (
        <div className="mt-4 flex flex-col gap-4 lg:flex-row">
          <div className="w-full shrink-0 space-y-4 lg:w-[330px]">
            <div className="rounded-lg p-4" style={card}>
              <p className="text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}>Filtrer par créateur</p>
              <div className="mt-2 space-y-1.5">
                {accounts.map((a) => (
                  <button key={a.id} onClick={() => setOnly(only === a.id ? "" : a.id)} className="flex w-full items-center gap-2.5 rounded-full border px-2 py-1.5 text-left text-[13px] font-semibold" style={{ borderColor: only === a.id ? BLUE : "var(--mp-line)", background: only === a.id ? "rgba(64,81,137,.2)" : undefined, color: "var(--mp-head)" }}>
                    <Avatar src={a.avatar} name={a.name} size="size-7" /><span className="flex-1 truncate">{a.name}</span>{a.linked ? null : <span className="text-[10.5px] font-normal" style={{ color: "var(--mp-down)" }}>pas relié</span>}
                  </button>
                ))}
              </div>
              <p className="mt-3 border-t pt-3 text-[11.5px]" style={{ borderColor: "var(--mp-line)", color: "var(--mp-muted)" }}>Cliquez sur un jour pour créer un Post. Bloom publie chez MYM à l’heure prévue.</p>
            </div>
            <div className="rounded-lg p-4" style={card}>
              <p className="text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}>Dernière planification par créateur</p>
              <div className="mt-2 space-y-2">
                {accounts.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-md border p-2" style={{ borderColor: "var(--mp-line)" }}>
                    <Avatar src={a.avatar} name={a.name} size="size-9" />
                    <div className="text-[12px]"><p className="font-semibold" style={{ color: "var(--mp-head)" }}>{a.name}</p><p>Story : —</p><p>Post : {d?.last?.[a.id] ? fmt(d.last[a.id]) : "—"}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1 rounded-lg p-4" style={card}>
            <div className="flex items-center gap-2">
              <button onClick={() => shift(-1)} className="grid size-8 place-items-center rounded-md text-white" style={{ background: "rgba(64,81,137,.4)" }}><ChevronLeft className="size-4" /></button>
              <button onClick={() => shift(1)} className="grid size-8 place-items-center rounded-md text-white" style={{ background: "rgba(64,81,137,.4)" }}><ChevronRight className="size-4" /></button>
              <button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime())} className="h-8 rounded-md px-3 text-[12.5px] text-white" style={{ background: BLUE }}>Aujourd’hui</button>
              <p className="flex-1 text-center text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}>{monthLabel}</p>
            </div>
            <div className="mt-3 grid grid-cols-7 border-t border-l text-[12px]" style={{ borderColor: "var(--mp-line)" }}>
              {["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."].map((x) => <div key={x} className="border-r border-b py-2 text-center font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>{x}</div>)}
              {days.map((t) => {
                const key = day(t);
                const its = cal.filter((i) => day(i.at) === key && (!only || i.creatorId === only));
                const out = new Date(t).getMonth() !== new Date(month).getMonth();
                return (
                  <div key={t} onClick={() => open(new Date(t).setHours(18, 0, 0, 0))} className="min-h-[104px] cursor-pointer border-r border-b p-1" style={{ borderColor: "var(--mp-line)", opacity: out ? 0.4 : 1 }}>
                    <p className="text-right text-[11.5px]"><span className={key === today ? "inline-grid size-5 place-items-center rounded-full font-bold text-white" : ""} style={key === today ? { background: BLUE } : undefined}>{new Date(t).getDate()}</span></p>
                    {its.slice(0, 4).map((i) => (
                      <button key={i.id} onClick={(e) => (e.stopPropagation(), i.status === "planned" ? open(i.at, i) : toast(`${STATUS[i.status][0]}${i.error ? ` : ${i.error}` : ""}`, i.status === "failed" ? "err" : "ok"))} title={`${fmt(i.at)} · ${nameOf(i.creatorId)} · ${i.caption}`} className="mt-1 flex w-full items-center gap-1 truncate rounded px-1.5 py-1 text-left text-[11.5px] font-semibold text-white" style={{ background: i.status === "failed" ? "#a8483a" : i.status === "created" ? "#3d4a5c" : "#5b6bbf" }}>
                        <Link2 className="size-3 shrink-0" /><span className="truncate">{i.kind === "story" ? `Story — ${i.audience || ""}` : `Post — ${i.caption || "(sans texte)"}`}</span>
                      </button>
                    ))}
                    {its.length > 4 ? <p className="mt-1 text-[10.5px]" style={{ color: "var(--mp-muted)" }}>+{its.length - 4} autres</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "next" && d ? <Upcoming d={d} nameOf={nameOf} onEdit={(i) => open(i.at, i)} onCancel={cancel} reload={load} /> : null}
      {tab === "past" && d ? <List items={d.items.filter((i) => i.status === "created" || i.status === "failed")} nameOf={nameOf} /> : null}
      {tab === "xls" ? <PlanImport accounts={accounts} onDone={load} /> : null}
      {draft ? <PlanModal draft={draft} accounts={accounts.filter((a) => a.linked)} onClose={() => setDraft(null)} onSaved={() => (setDraft(null), load())} /> : null}
    </div>
  );
}

function Rows({ items, nameOf, actions }: { items: Item[]; nameOf: (id: string) => string; actions?: (i: Item) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-[13px]">
        <thead><tr className="text-left" style={{ color: "var(--mp-head)" }}>{["ID", "Date", "Type", "Créateur", "Visibilité", "Caption"].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}{actions ? <th className="px-3 text-right font-semibold">Actions</th> : null}</tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-t" style={{ borderColor: "var(--mp-line)" }}>
              <td className="px-3 py-3">#{i.id}</td>
              <td className="px-3 whitespace-nowrap">{fmt(i.at)}</td>
              <td className="px-3"><span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: "#0ab39c" }}>feed</span></td>
              <td className="px-3">{nameOf(i.creatorId)}</td>
              <td className="px-3">{i.visibility}</td>
              <td className="px-3">
                <span className="mr-2">{i.kind === "story" ? `Story · ${i.audience || ""}` : i.caption || "(sans texte)"}</span>
                {i.after ? <span className="mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: i.after.error ? "#f0654822" : "#f7b84b22", color: i.after.error ? "#f06548" : "#f7b84b" }} title={i.after.error || undefined}>{i.after.action === "delete" ? "supprimé" : "passé en privé"} {i.after.done === 1 ? "✓" : i.after.error ? "— échec" : `après ${Math.round((i.after.ms || 0) / 3600e3 * 10) / 10} h`}</span> : null}
                <span className="rounded px-1.5 py-0.5 text-[10.5px] font-bold text-white" style={{ background: STATUS[i.status][1] }}>{STATUS[i.status][0]}</span>
                {i.error ? <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--mp-down)" }}>{i.error}</span> : null}
              </td>
              {actions ? <td className="px-3 text-right whitespace-nowrap">{actions(i)}</td> : null}
            </tr>
          ))}
          {!items.length ? <tr><td colSpan={7} className="py-12 text-center" style={{ color: "var(--mp-muted)" }}>Rien pour l’instant.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function List({ items, nameOf }: { items: Item[]; nameOf: (id: string) => string }) {
  const [q, setQ] = useState("");
  const shown = items.filter((i) => !q || `${nameOf(i.creatorId)} ${i.caption}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mt-4 rounded-lg p-4" style={card}>
      <label className="ml-auto flex h-9 w-[280px] items-center gap-2 rounded-md px-3 text-[12.5px]" style={{ background: "var(--mp-card-2)" }}><Search className="size-3.5" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recherche (créateur, caption)…" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
      <div className="mt-3"><Rows items={shown} nameOf={nameOf} /></div>
    </div>
  );
}

function Upcoming({ d, nameOf, onEdit, onCancel, reload }: { d: Data; nameOf: (id: string) => string; onEdit: (i: Item) => void; onCancel: (i: Item) => void; reload: () => void }) {
  const items = d.items.filter((i) => i.status === "planned" || i.status === "publishing");
  const [cid, setCid] = useState(d.accounts[0]?.id ?? "");
  const [from, setFrom] = useState(day(Date.now()));
  const [to, setTo] = useState(day(Date.now() + 2 * 864e5));
  const [count, setCount] = useState<number | null>(null);
  const range = () => ({ creatorId: cid, from: new Date(`${from}T00:00`).getTime(), to: new Date(`${to}T00:00`).getTime() + 864e5 });
  const run = async (dry: boolean) => {
    try {
      const r = await api<{ count: number }>("POST", "/api/mym/plan/clear", { ...range(), dry });
      if (dry) return setCount(r.count);
      toast(`${r.count} publication(s) annulée(s)`);
      setCount(null);
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const box = "mt-1 h-9 w-full rounded-md px-3 text-[13px] outline-none";
  return (
    <>
      {d.canEdit ? (
        <div className="mt-4 rounded-lg p-4" style={card}>
          <p className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}><Eraser className="size-4" /> Vider la planification</p>
          <p className="mt-2 text-[12px]" style={{ color: "var(--mp-muted)" }}>Annule d’un coup tout ce qui est encore planifié sur la période choisie.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Compte<select value={cid} onChange={(e) => (setCid(e.target.value), setCount(null))} className={box} style={{ background: "var(--mp-card-2)" }}>{d.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label className="text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>À partir du<input type="date" value={from} onChange={(e) => (setFrom(e.target.value), setCount(null))} className={box} style={{ background: "var(--mp-card-2)", colorScheme: "dark" }} /></label>
            <label className="text-[12.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Jusqu’au<input type="date" value={to} onChange={(e) => (setTo(e.target.value), setCount(null))} className={box} style={{ background: "var(--mp-card-2)", colorScheme: "dark" }} /></label>
            <div className="flex items-end gap-2">
              <button onClick={() => run(true)} className="h-9 flex-1 rounded-md border text-[12.5px]" style={{ borderColor: "#299cdb", color: "#299cdb" }}>Compter</button>
              {count ? <button onClick={() => confirm(`Annuler ${count} publication(s) planifiée(s) ?`) && run(false)} className="h-9 flex-1 rounded-md text-[12.5px] text-white" style={{ background: "#f06548" }}>Annuler les {count}</button> : null}
            </div>
          </div>
          <p className="mt-2 text-[12px]" style={{ color: "var(--mp-muted)" }}>{count === 0 ? "Rien de planifié sur cette période." : "Seul l’avenir est touché : une publication dont l’heure est passée est peut-être déjà partie."}</p>
        </div>
      ) : null}
      <div className="mt-4 rounded-lg p-4" style={card}>
        <Rows
          items={items}
          nameOf={nameOf}
          actions={d.canEdit ? (i) => (i.status === "planned" ? (
            <>
              <button onClick={() => onEdit(i)} title="Modifier" className="mr-1.5 inline-grid size-8 place-items-center rounded-md text-white" style={{ background: BLUE }}><Pencil className="size-3.5" /></button>
              <button onClick={() => onCancel(i)} title="Annuler" className="inline-grid size-8 place-items-center rounded-md border" style={{ borderColor: "#f06548", color: "#f06548" }}><Trash2 className="size-3.5" /></button>
            </>
          ) : null) : undefined}
        />
      </div>
    </>
  );
}

type CloudItem = { id: string; type: "photo" | "video"; preview: string | null; usedPublic: boolean; usedPrivate: boolean };
function PlanModal({ draft, accounts, onClose, onSaved }: { draft: Draft; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(draft);
  const [type, setType] = useState<"photo" | "video">(draft.mediaType === "video" ? "video" : "photo");
  const [cloud, setCloud] = useState<{ items: CloudItem[]; page: number; pages: number } | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    setCloud(null);
    api<{ items: CloudItem[]; page: number; pages: number }>("GET", `/api/mym/cloud?creatorId=${encodeURIComponent(v.creatorId)}&type=${type}&page=${page}`).then(setCloud).catch((e) => setErr((e as Error).message));
  }, [v.creatorId, type, page]);
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("POST", "/api/mym/plan", { id: v.id, creatorId: v.creatorId, at: new Date(v.at).getTime(), visibility: v.visibility, caption: v.caption, mediaId: v.mediaId, mediaType: v.mediaType });
      toast(v.id ? "Publication modifiée" : "Post planifié");
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const box = "mt-1.5 h-10 w-full rounded-md px-3 outline-none";
  const st = { background: "#2f343a", color: "var(--mp-head)" };
  return (
    <div className="mp-font fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-lg" style={{ background: "#262a2f", color: "var(--mp-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between px-4 py-3.5 text-[15px] font-semibold" style={{ background: "#2b3a4a", color: "var(--mp-head)" }}>{v.id ? `Modifier le post #${v.id}` : "Planifier un Post"}<button onClick={onClose}><X className="size-4" /></button></h3>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-[13px]">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="font-semibold" style={{ color: "var(--mp-head)" }}>Créateur
              <select disabled={!!v.id} value={v.creatorId} onChange={(e) => (setV({ ...v, creatorId: e.target.value, mediaId: "", preview: null }), setPage(1))} className={box} style={st}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </label>
            <label className="font-semibold" style={{ color: "var(--mp-head)" }}>Date et heure
              <input type="datetime-local" value={v.at} onChange={(e) => setV({ ...v, at: e.target.value })} className={box} style={{ ...st, colorScheme: "dark" }} />
            </label>
          </div>
          <p className="mt-3 font-semibold" style={{ color: "var(--mp-head)" }}>Visibilité</p>
          <div className="mt-1.5 flex overflow-hidden rounded-md border text-[12.5px]" style={{ borderColor: "#3a4047" }}>
            {([["public", "Public (tout le monde)"], ["private", "Privé (abonnés)"]] as const).map(([k, l]) => <button key={k} onClick={() => setV({ ...v, visibility: k })} className="flex-1 py-2 font-semibold" style={v.visibility === k ? { background: "var(--mp-accent)", color: "var(--mp-on-accent)" } : undefined}>{l}</button>)}
          </div>
          <label className="mt-3 block font-semibold" style={{ color: "var(--mp-head)" }}>Caption
            <textarea value={v.caption} maxLength={2000} onChange={(e) => setV({ ...v, caption: e.target.value })} rows={3} className="mt-1.5 w-full rounded-md p-3 font-normal outline-none" style={st} placeholder="Le texte du post…" />
          </label>
          <div className="mt-3 flex items-center gap-2">
            <p className="flex-1 font-semibold" style={{ color: "var(--mp-head)" }}>Média du mym.cloud {v.mediaId ? <span className="font-normal" style={{ color: "var(--mp-up)" }}>· choisi ✓</span> : null}</p>
            {(["photo", "video"] as const).map((k) => <button key={k} onClick={() => (setType(k), setPage(1))} className="h-7 rounded-md px-3 text-[12px]" style={type === k ? { background: BLUE, color: "#fff" } : { color: "#6f86d6" }}>{k === "photo" ? "Photos" : "Vidéos"}</button>)}
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {(cloud?.items ?? []).map((m) => (
              <button key={m.id} onClick={() => setV({ ...v, mediaId: m.id, mediaType: m.type, preview: m.preview })} className="relative aspect-square overflow-hidden rounded" style={{ background: "#1f2327", outline: v.mediaId === m.id ? "2px solid var(--mp-accent)" : undefined }} title={m.usedPublic ? "Déjà utilisé dans un post public" : m.usedPrivate ? "Déjà utilisé dans un post privé" : ""}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.preview ? <img src={m.preview} alt="" loading="lazy" className="size-full object-cover" /> : null}
                {m.type === "video" ? <Play className="absolute inset-0 m-auto size-6 rounded-full bg-black/45 p-1 text-white" /> : null}
                {m.usedPublic || m.usedPrivate ? <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[8.5px] text-white">déjà posté</span> : null}
                {v.mediaId === m.id ? <Check className="absolute top-0.5 right-0.5 size-4 rounded-full p-0.5" style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }} /> : null}
              </button>
            ))}
          </div>
          {!cloud && !err ? <p className="py-6 text-center text-[12px]" style={{ color: "var(--mp-muted)" }}>Lecture du mym.cloud…</p> : null}
          {cloud && !cloud.items.length ? <p className="py-6 text-center text-[12px]" style={{ color: "var(--mp-muted)" }}>Aucun média prêt dans le mym.cloud.</p> : null}
          {cloud && cloud.pages > 1 ? (
            <div className="mt-2 flex items-center justify-center gap-3 text-[12px]">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-30"><ChevronLeft className="size-4" /></button>
              Page {page} / {cloud.pages}
              <button disabled={page >= cloud.pages} onClick={() => setPage(page + 1)} className="disabled:opacity-30"><ChevronRight className="size-4" /></button>
            </div>
          ) : null}
          {err ? <p className="mt-3 text-[12px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3" style={{ background: "#22262a" }}>
          <button onClick={onClose} className="h-9 rounded-md px-4" style={{ background: "#2f343a" }}>Fermer</button>
          <button disabled={busy || !v.mediaId || !v.at} onClick={save} className="h-9 rounded-md px-5 font-semibold disabled:opacity-50" style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}>{v.id ? "Enregistrer" : "Planifier"}</button>
        </div>
      </div>
    </div>
  );
}
