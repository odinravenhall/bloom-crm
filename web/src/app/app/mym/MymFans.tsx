"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";

// MYM → Fans : Abonnés / Anciens / Intéressés, copie des pages de MyPulse (données Substy).
type Tab = "active" | "old" | "interested";
type L = { id: string; name: string; type: string; fans: number; count: number };
type Meta = { age: string | null; gender: string | null; source: string | null; notes: string | null } | null;
type Row = { fanId: string; name: string; username: string | null; avatar: string | null; status: string | null; since: number | null; expires: number | null; canceled: boolean; gross: number; purchases: number; lists: { id: string; name: string }[]; meta: Meta; lastAt: string | null };
type Data = { tab: Tab; counts: Record<Tab, number>; progress: { checked: number; total: number }; lists: L[]; total: number; rows: Row[] };
const TITLE: Record<Tab, string> = { active: "Abonnés Actifs", old: "Anciens Abonnés", interested: "Fans Intéressés" };
const SOURCES = ["Instagram", "Twitter", "Snap", "Facebook", "Tiktok", "Telegram", "Autre"];
const COLORS = ["#364574", "#3cd188", "#f7b84b", "#f06548", "#8b5cf6", "#299cdb", "#e83e8c", "#b6a220"];
const color = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const date = (t: number | null) => (t ? new Date(t).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };

export function MymFans({ tab }: { tab: Tab }) {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [d, setD] = useState<Data | null>(null);
  const [q, setQ] = useState("");
  const [qq, setQq] = useState("");
  const [lists, setLists] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Row | null>(null);
  const [addTo, setAddTo] = useState(false);
  const load = useCallback(() => {
    if (!creatorId) return;
    const p = new URLSearchParams({ creatorId, tab, q: qq, lists: lists.join(","), page: String(page), per: String(per) });
    api<Data>("GET", `/api/mym/fans?${p}`).then(setD).catch((e) => toast((e as Error).message, "err"));
  }, [creatorId, tab, qq, lists, page, per]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = setTimeout(() => (setQq(q), setPage(1)), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => (setPicked(new Set()), setPage(1)), [creatorId, tab, lists]);
  const pages = Math.max(1, Math.ceil((d?.total ?? 0) / per));
  const interested = tab === "interested";

  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="rounded-xl p-4" style={card}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[150px]">
            <h1 className="text-[16px] leading-tight font-semibold" style={{ color: "var(--mp-head)" }}>{TITLE[tab]}</h1>
            <span className="mt-2 flex h-8 items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card-2)" }}>
              <Avatar src={creator?.avatar} name={creator?.name} size="size-5" />
              <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="bg-transparent outline-none">
                {creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}
              </select>
            </span>
          </div>
          {/* Groupes (listes Substy) : cliquer pour filtrer */}
          <div className="flex flex-1 flex-wrap gap-2">
            {(d?.lists ?? []).map((l) => {
              const on = lists.includes(l.id);
              return (
                <button key={l.id} onClick={() => setLists(on ? lists.filter((x) => x !== l.id) : [...lists, l.id])} className="flex items-center gap-2 rounded-full border px-3 py-1 text-[12px]" style={{ borderColor: on ? "var(--mp-accent)" : "var(--mp-line)", color: on ? "var(--mp-head)" : undefined }}>
                  <span className="size-3 rounded-full border-2" style={{ borderColor: color(l.id), background: on ? color(l.id) : "transparent" }} />
                  {l.name} <span style={{ color: "var(--mp-muted)" }}>[{l.count}]</span>
                </button>
              );
            })}
            {d && !d.lists.length ? <span className="text-[12px]" style={{ color: "var(--mp-muted)" }}>Aucun groupe pour l’instant — crée-en un avec « Ajouter au groupe ».</span> : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
          {!interested ? <button onClick={() => (picked.size ? setAddTo(true) : toast("Sélectionne au moins un fan", "err"))} className="h-8 rounded-md px-3" style={{ background: "var(--mp-card-2)" }}>Ajouter au groupe{picked.size ? ` (${picked.size})` : ""}</button> : (
            <label className="flex items-center gap-2">Show
              <select value={per} onChange={(e) => (setPer(Number(e.target.value)), setPage(1))} className="h-8 rounded-md px-2 outline-none" style={{ background: "var(--mp-card-2)" }}>{[50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}</select> entries
            </label>
          )}
          <span className="flex-1" />
          {d && d.progress.checked < d.progress.total ? <span className="text-[12px]" style={{ color: "var(--mp-muted)" }}>Bloom relit les fans chez Substy : {d.progress.checked} / {d.progress.total}</span> : null}
          <label className="flex items-center gap-2">Rechercher :
            <span className="flex h-8 w-48 items-center gap-1.5 rounded-md px-2" style={{ background: "var(--mp-card-2)" }}><Search className="size-3.5" style={{ color: "var(--mp-muted)" }} /><input value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" /></span>
          </label>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>
                {!interested ? <th className="w-10 px-3 py-3"><input type="checkbox" checked={!!d?.rows.length && d.rows.every((r) => picked.has(r.fanId))} onChange={(e) => setPicked(e.target.checked ? new Set(d?.rows.map((r) => r.fanId)) : new Set())} /></th> : null}
                <th className="px-3 py-3 font-semibold">{interested ? "Pseudo MYM" : "Pseudo"}</th>
                {interested ? (
                  <>
                    <th className="px-3 py-3 font-semibold">Dernier message</th>
                    <th className="px-3 py-3 font-semibold">CA €</th>
                  </>
                ) : (
                  <>
                    <th className="px-3 py-3 text-right font-semibold">CA € ↓</th>
                    <th className="px-3 py-3 font-semibold">Groupe(s)</th>
                    <th className="px-3 py-3 font-semibold">{tab === "old" ? "Fin d’abonnement" : "Abonné depuis"}</th>
                    <th />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {(d?.rows ?? []).map((r) => (
                <tr key={r.fanId} className="border-b" style={{ borderColor: "var(--mp-line)" }}>
                  {!interested ? <td className="px-3"><input type="checkbox" checked={picked.has(r.fanId)} onChange={() => setPicked((s) => (s.has(r.fanId) ? (s.delete(r.fanId), new Set(s)) : new Set(s.add(r.fanId))))} /></td> : null}
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar src={r.avatar} name={r.name} size="size-7" />
                      <span className="leading-tight" style={{ color: "var(--mp-head)" }}>{r.name}{r.username && r.username !== r.name ? <span className="block text-[11px]" style={{ color: "var(--mp-muted)" }}>@{r.username}</span> : null}</span>
                    </span>
                  </td>
                  {interested ? (
                    <>
                      <td className="px-3">{r.lastAt ? date(Date.parse(r.lastAt)) : ""}</td>
                      <td className="px-3">{r.gross ? r.gross.toFixed(2) : ""}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 text-right font-medium" style={{ color: "var(--mp-head)" }}>{r.gross.toFixed(2)}</td>
                      <td className="px-3">
                        <span className="flex flex-wrap gap-1">{r.lists.map((l) => <span key={l.id} className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-white" style={{ background: color(l.id) }}>{l.name}</span>)}</span>
                      </td>
                      <td className="px-3 text-[12px]" style={{ color: "var(--mp-muted)" }}>{tab === "old" ? date(r.expires) : date(r.since)}</td>
                      <td className="px-3 text-right whitespace-nowrap">
                        <Link href={`/app/messagerie?c=${encodeURIComponent(`${creatorId}~${r.fanId}`)}`} className="mr-1 rounded px-2 py-1 text-[11px]" style={{ background: "rgba(41,156,219,.15)", color: "#299cdb" }}>Chat</Link>
                        <button onClick={() => setEdit(r)} className="rounded px-2 py-1 text-[11px]" style={{ background: "rgba(58,109,240,.15)", color: "#6f8ff8" }}>Modifier</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {d && !d.rows.length ? <tr><td colSpan={6} className="py-12 text-center" style={{ color: "var(--mp-muted)" }}>{d.progress.checked < d.progress.total ? "Bloom relit encore les fans chez Substy, reviens dans quelques minutes." : "Aucun fan"}</td></tr> : null}
              {!d ? <tr><td colSpan={6} className="py-12 text-center" style={{ color: "var(--mp-muted)" }}>…</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
          <span>Affichage de {d?.total ? (page - 1) * per + 1 : 0} à {Math.min(page * per, d?.total ?? 0)} sur {(d?.total ?? 0).toLocaleString("fr-FR")} entrées</span>
          <span className="flex-1" />
          {[["Première", 1], ["Précédente", page - 1]].map(([l, n]) => <button key={l as string} disabled={page <= 1} onClick={() => setPage(n as number)} className="rounded px-2 py-1 disabled:opacity-40" style={{ background: "var(--mp-card-2)" }}>{l}</button>)}
          {Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2).map((n, i, a) => (
            <span key={n} className="flex items-center gap-2">{i && n - a[i - 1] > 1 ? "…" : null}<button onClick={() => setPage(n)} className="min-w-7 rounded px-2 py-1" style={n === page ? { background: "var(--mp-accent)", color: "var(--mp-on-accent)" } : { background: "var(--mp-card-2)" }}>{n}</button></span>
          ))}
          {[["Suivante", page + 1], ["Dernière", pages]].map(([l, n]) => <button key={l as string} disabled={page >= pages} onClick={() => setPage(n as number)} className="rounded px-2 py-1 disabled:opacity-40" style={{ background: "var(--mp-card-2)" }}>{l}</button>)}
        </div>
      </div>
      {edit && creatorId ? <EditFan creatorId={creatorId} row={edit} lists={d?.lists ?? []} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), load())} /> : null}
      {addTo && creatorId ? <AddToGroup creatorId={creatorId} fanIds={[...picked]} lists={d?.lists ?? []} onClose={() => setAddTo(false)} onDone={() => (setAddTo(false), setPicked(new Set()), load())} /> : null}
    </div>
  );
}

function Modal({ title, children, onClose, footer }: { title: string; children: React.ReactNode; onClose: () => void; footer: React.ReactNode }) {
  return (
    <div className="mp-font fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[590px] overflow-hidden rounded-lg" style={{ background: "#262a2f", color: "var(--mp-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between px-4 py-3 text-[15px] font-semibold" style={{ background: "#2b3a4a", color: "var(--mp-head)" }}>{title}<button onClick={onClose}><X className="size-4" /></button></h3>
        <div className="max-h-[72vh] overflow-y-auto px-4 py-3 text-[13px]">{children}</div>
        <div className="flex justify-end gap-2 px-4 py-3">{footer}</div>
      </div>
    </div>
  );
}
const field = "mt-1 h-9 w-full rounded-md px-3 outline-none";
const fieldSt = { background: "#2f343a", color: "var(--mp-head)" };

function EditFan({ creatorId, row, lists, onClose, onSaved }: { creatorId: string; row: Row; lists: L[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ nickname: row.name, age: row.meta?.age ?? "", gender: row.meta?.gender ?? "Masculin", source: row.meta?.source ?? "", notes: row.meta?.notes ?? "- Job :\n- Passions :\n- Préférences sexuelles :\n- En couple ? :\n- Jour de paye :\n- Notes importantes :", lists: row.lists.map((l) => l.id) });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("POST", "/api/mym/fans/edit", { creatorId, fanId: row.fanId, ...v });
      toast("Fan mis à jour");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Modification du Fan : ${row.name}`} onClose={onClose} footer={<><button onClick={onClose} className="h-9 rounded-md px-4" style={{ background: "#2f343a" }}>Fermer</button><button disabled={busy} onClick={save} className="h-9 rounded-md px-4 text-white disabled:opacity-50" style={{ background: "#299cdb" }}>Mettre à jour</button></>}>
      <p className="font-semibold">Surnom</p>
      <input value={v.nickname} maxLength={60} onChange={(e) => setV({ ...v, nickname: e.target.value })} className={field} style={fieldSt} />
      <p className="mt-3 font-semibold">Age</p>
      <input value={v.age} maxLength={10} onChange={(e) => setV({ ...v, age: e.target.value })} className={field} style={fieldSt} />
      <p className="mt-3 font-semibold">Genre</p>
      <select value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })} className={field} style={fieldSt}><option>Masculin</option><option>Féminin</option></select>
      <p className="mt-3 font-semibold">Source</p>
      <select value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} className={field} style={fieldSt}>
        <option value="">-- Sélectionne une source --</option>
        {SOURCES.map((s) => <option key={s}>{s}</option>)}
      </select>
      <p className="mt-3 font-semibold">Notes</p>
      <textarea value={v.notes} rows={6} onChange={(e) => setV({ ...v, notes: e.target.value })} className="mt-1 w-full rounded-md px-3 py-2 outline-none" style={fieldSt} />
      <p className="mt-3 font-semibold">Groupe(s)</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {lists.map((l) => {
          const on = v.lists.includes(l.id);
          return (
            <button key={l.id} onClick={() => setV({ ...v, lists: on ? v.lists.filter((x) => x !== l.id) : [...v.lists, l.id] })} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-semibold" style={{ borderColor: on ? "#299cdb" : "#3a4047", background: on ? "rgba(41,156,219,.18)" : "transparent", color: "var(--mp-head)" }}>
              <span className="size-2.5 rounded-full" style={{ background: color(l.id) }} />{l.name}{on ? " ✓" : ""}
            </button>
          );
        })}
        {!lists.length ? <span style={{ color: "var(--mp-muted)" }}>Aucun groupe</span> : null}
      </div>
      <p className="mt-3 text-[11px]" style={{ color: "var(--mp-muted)" }}>Surnom et groupes sont enregistrés sur Substy ; âge, genre, source et notes dans Bloom.</p>
    </Modal>
  );
}

function AddToGroup({ creatorId, fanIds, lists, onClose, onDone }: { creatorId: string; fanIds: string[]; lists: L[]; onClose: () => void; onDone: () => void }) {
  const [sel, setSel] = useState(lists[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      let id = sel;
      let listName = lists.find((l) => l.id === sel)?.name ?? "";
      if (sel === "__new") {
        const r = await api<{ id: string | null }>("POST", "/api/mym/fans/lists", { creatorId, name });
        if (!r.id) throw new Error("Groupe créé, mais Substy n’a pas renvoyé son identifiant : recharge la page.");
        id = r.id;
        listName = name;
      }
      const r = await api<{ ok: number; failed: number }>("POST", "/api/mym/fans/add-to-list", { creatorId, fanIds, listId: id, listName });
      toast(`${r.ok} fan(s) ajouté(s)${r.failed ? ` · ${r.failed} échec(s)` : ""}`);
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Ajouter ${fanIds.length} fan(s) au groupe`} onClose={onClose} footer={<><button onClick={onClose} className="h-9 rounded-md px-4" style={{ background: "#2f343a" }}>Fermer</button><button disabled={busy || !sel || (sel === "__new" && !name.trim())} onClick={go} className="h-9 rounded-md px-4 text-white disabled:opacity-50" style={{ background: "#299cdb" }}>Ajouter</button></>}>
      <p className="font-semibold">Groupe</p>
      <span className="relative mt-1 block">
        <select value={sel} onChange={(e) => setSel(e.target.value)} className={`${field} appearance-none`} style={fieldSt}>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          <option value="__new">+ Nouveau groupe…</option>
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2" />
      </span>
      {sel === "__new" ? (
        <>
          <p className="mt-3 flex items-center gap-1 font-semibold"><Plus className="size-3.5" /> Nom du nouveau groupe</p>
          <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={field} style={fieldSt} />
        </>
      ) : null}
    </Modal>
  );
}
