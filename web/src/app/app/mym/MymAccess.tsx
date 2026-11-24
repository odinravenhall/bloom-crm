"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Bookmark, Check, Pencil, Search, ShieldCheck, UserMinus, UserPlus, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { eur, int, tk } from "./MymTeamKit";

// MYM → Pilotage d'équipe → Contrôle des accès : copie de « Accès & équipe » de MyPulse, sur l'équipe de Bloom.
// Dans Bloom les droits passent par un RÔLE (réglé page par page dans Rôles) et par la liste des créateurs de chacun.
type Emp = { id: number; name: string; avatar: string | null; base: string; roleId: number; roleName: string; groupId: number; discord: string | null; status: "active" | "off" | "pending"; allCreators: boolean; creators: string[] };
type Role = { id: number; name: string; base: string };
type Staff = { employees: Emp[]; roles: Role[]; canEdit: boolean; me: number };
type Cr = { id: string; name: string; platform?: string | null };
type Person = { name: string; total: number; d30: number; sales30: number; activeH: number; idleH: number; messages30: number };
type Modal = { kind: "rights" | "stats" | "rename" | "remove"; e: Emp } | { kind: "invite" } | null;
const BASE: Record<string, [string, string]> = { admin: ["#0ab39c22", "#0ab39c"], manager: ["#3577f122", "#6f9bff"], lead: ["#f7b84b22", "#f7b84b"], chatter: ["#40518955", "#9fb0f0"], model: ["#f0654822", "#f06548"] };

export function MymAccess() {
  const [d, setD] = useState<Staff | null>(null);
  const [crs, setCrs] = useState<Cr[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [creator, setCreator] = useState("");
  const [role, setRole] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const load = useCallback(() => api<Staff>("GET", "/api/staff").then((r) => (setD(r), setErr(""))).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => {
    load();
    api<Cr[]>("GET", "/api/creators").then(setCrs).catch(() => {});
  }, [load]);
  const name = useCallback((id: string) => crs.find((c) => c.id === id)?.name || id, [crs]);
  const rows = useMemo(() => (d?.employees ?? []).filter((e) => (!q.trim() || `${e.name} ${e.discord ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) && (!creator || e.allCreators || e.creators.includes(creator)) && (!role || String(e.roleId) === role)), [d, q, creator, role]);
  const done = (r: { employees: Emp[] }) => (setD((x) => (x ? { ...x, employees: r.employees } : x)), setModal(null), toast("Enregistré"));
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><h1 className="text-[20px] font-bold tracking-tight uppercase" style={{ color: "var(--mp-head)" }}>Accès & équipe</h1><p className="text-[13.5px]">Qui travaille sur quels comptes, et avec quel rôle.</p></div>
        <Link href="/app/roles" className="flex h-10 items-center gap-2 rounded-lg border px-4 text-[13.5px] font-medium" style={{ borderColor: "#3577f1", color: "#6f9bff" }}><Bookmark className="size-4" /> Rôles et droits par page</Link>
        {d?.canEdit ? <button onClick={() => setModal({ kind: "invite" })} className="flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold text-white" style={{ background: "#4a57a8" }}><UserPlus className="size-4" /> Inviter</button> : null}
      </div>
      {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
      <div className="mt-4 rounded-xl" style={tk.card}>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-lg px-3" style={tk.inp}><Search className="size-4" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom ou un pseudo Discord…" className="w-full bg-transparent text-[13.5px] outline-none" /></label>
          <select value={creator} onChange={(e) => setCreator(e.target.value)} className="h-10 rounded-lg px-3 text-[13.5px] outline-none" style={tk.inp}><option value="">Tous les créateurs</option>{crs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="h-10 rounded-lg px-3 text-[13.5px] outline-none" style={tk.inp}><option value="">Tous les rôles</option>{(d?.roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <span className="rounded px-2 py-0.5 text-[11.5px] font-bold" style={{ background: "#40518955", color: "#9fb0f0" }}>{rows.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13.5px]">
            <thead><tr className="text-left" style={{ color: "var(--mp-head)" }}>{["Personne", "Créateurs", "Rôle", "Actions"].map((h, i) => <th key={h} className={`border-y px-4 py-3 font-semibold ${i === 3 ? "text-right" : ""}`} style={{ borderColor: "var(--mp-line)" }}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b last:border-0" style={{ borderColor: "var(--mp-line)", opacity: e.status === "off" ? 0.5 : 1 }}>
                  <td className="px-4 py-3"><span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full text-[13px] font-bold" style={{ background: "var(--mp-card-2)", color: "#9fb0f0" }}>{(e.name || "?")[0].toUpperCase()}</span><span><b style={{ color: "var(--mp-head)" }}>{e.name}</b><span className="block text-[12px]">{e.discord ? `@${e.discord}` : "—"}{e.status === "pending" ? " · pas encore connecté" : e.status === "off" ? " · accès coupé" : ""}</span></span></span></td>
                  <td className="px-4"><b style={{ color: "var(--mp-head)" }}>{e.allCreators ? "Tous les créateurs" : `${e.creators.length} créateur${e.creators.length > 1 ? "s" : ""}`}</b><span className="block max-w-[320px] truncate text-[12px]">{e.allCreators ? "" : e.creators.map(name).join(", ")}</span></td>
                  <td className="px-4"><span className="rounded px-1.5 py-0.5 text-[11.5px] font-bold" style={{ background: (BASE[e.base] || BASE.chatter)[0], color: (BASE[e.base] || BASE.chatter)[1] }}>{e.roleName}</span></td>
                  <td className="px-4"><span className="flex justify-end gap-1.5">
                    {([["rights", "Rôle et créateurs", <ShieldCheck key="a" className="size-3.5" />], ["stats", "Statistiques", <BarChart3 key="b" className="size-3.5" />], ["rename", "Renommer", <Pencil key="c" className="size-3.5" />], ["remove", "Retirer l’accès à des créateurs", <UserMinus key="d" className="size-3.5" />]] as ["rights" | "stats" | "rename" | "remove", string, React.ReactNode][]).filter(([k]) => k === "stats" || d?.canEdit).map(([k, t, icon]) => <button key={k} title={t} onClick={() => setModal({ kind: k, e })} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--mp-card-2)", color: k === "remove" ? "#f06548" : "var(--mp-text)" }}>{icon}</button>)}
                  </span></td>
                </tr>
              ))}
              {d && !rows.length ? <tr><td colSpan={4} className="px-4 py-10 text-center">Personne ne correspond.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--mp-muted)" }}>Dans Bloom, les droits ne se cochent pas personne par personne : chacun a un rôle, et les pages ouvertes à chaque rôle se règlent dans « Rôles et droits par page ». Groupes, activation et suppression d’un compte restent dans Employés → Gérer les employés.</p>
      {modal && modal.kind !== "invite" && modal.kind !== "stats" && d ? <Edit m={modal} d={d} crs={crs} onClose={() => setModal(null)} onDone={done} /> : null}
      {modal?.kind === "invite" && d ? <Edit m={modal} d={d} crs={crs} onClose={() => setModal(null)} onDone={done} /> : null}
      {modal?.kind === "stats" ? <Stats e={modal.e} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function Box({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl rounded-xl p-6" style={{ background: "#212529", border: "1px solid #2f343a", color: "#aab0bd" }}>
        <p className="mb-4 flex items-center text-[18px] font-bold" style={{ color: "#f3f4f6" }}><span className="min-w-0 flex-1">{title}</span><button onClick={onClose}><X className="size-5" /></button></p>
        {children}
      </div>
    </div>
  );
}

function Stats({ e, onClose }: { e: Emp; onClose: () => void }) {
  const [p, setP] = useState<Person | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Person>("GET", `/api/mym/team/person?id=${e.id}`).then(setP).catch((x) => setErr((x as Error).message));
  }, [e.id]);
  const cell = (l: string, v: string, color?: string) => <div className="rounded-lg border p-4" style={{ borderColor: "#2f343a" }}><p className="text-[13px]">{l}</p><p className="mt-1 text-[20px] font-bold" style={{ color: color || "#f3f4f6" }}>{p ? v : "…"}</p></div>;
  return (
    <Box title={e.name} onClose={onClose}>
      {err ? <p className="text-[13px]" style={{ color: "#f06548" }}>{err}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {cell("CA MYM total", eur(p?.total ?? 0))}{cell("CA MYM sur 30 jours", `${eur(p?.d30 ?? 0)} · ${int(p?.sales30 ?? 0)} vente(s)`)}
        {cell("Temps actif (30 j)", `${(p?.activeH ?? 0).toFixed(1).replace(".", ",")} h`, "#0ab39c")}{cell("Temps inactif (30 j)", `${(p?.idleH ?? 0).toFixed(1).replace(".", ",")} h`, "#f7b84b")}
        {cell("Messages envoyés (30 j)", int(p?.messages30 ?? 0))}
      </div>
      <p className="mt-3 text-[12px]">Ventes MYM attribuées à cette personne (message envoyé depuis Bloom), en net. Actif = Bloom ouvert sur le chat ; inactif = ouvert sur une autre page.</p>
      <p className="mt-4 flex justify-end"><button onClick={onClose} className="h-9 rounded-lg px-4 text-[13px]" style={{ background: "#2f343a", color: "#f3f4f6" }}>Fermer</button></p>
    </Box>
  );
}

/** Rôle et créateurs, renommer, retirer des créateurs, inviter : tout passe par les routes « staff » de Bloom. */
function Edit({ m, d, crs, onClose, onDone }: { m: Exclude<Modal, null>; d: Staff; crs: Cr[]; onClose: () => void; onDone: (r: { employees: Emp[] }) => void }) {
  const e = m.kind === "invite" ? null : m.e;
  const [name, setName] = useState(e?.name ?? "");
  const [discord, setDiscord] = useState("");
  const [roleId, setRoleId] = useState<number>(e?.roleId ?? d.roles.find((r) => r.base === "chatter")?.id ?? d.roles[0]?.id ?? 0);
  const [all, setAll] = useState(e?.allCreators ?? false);
  const [picked, setPicked] = useState<string[]>(m.kind === "remove" ? [] : e?.creators ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const boss = ["admin", "manager"].includes(d.roles.find((r) => r.id === roleId)?.base ?? "");
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const creators = m.kind === "remove" ? (e!.creators.filter((c) => !picked.includes(c))) : picked;
      const body = m.kind === "invite" ? { name, discord, roleId, creators, all } : m.kind === "rename" ? { id: e!.id, name, roleId: e!.roleId, groupId: e!.groupId } : { id: e!.id, name: e!.name, roleId: m.kind === "remove" ? e!.roleId : roleId, groupId: e!.groupId, creators, all: m.kind === "remove" ? false : all };
      onDone(await api<{ employees: Emp[] }>("POST", "/api/staff/employee", body));
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  };
  const list = m.kind === "remove" ? crs.filter((c) => e!.creators.includes(c.id)) : crs;
  const title = m.kind === "invite" ? "Inviter un collaborateur" : m.kind === "rename" ? "Renommer ce collaborateur" : m.kind === "remove" ? "Retirer l’accès à des créateurs" : `Droits de ${e!.name}`;
  const inp = "mt-1.5 h-10 w-full rounded-lg px-3 text-[13.5px] outline-none";
  const st = { background: "#1a1d21", border: "1px solid #2f343a", color: "#f3f4f6" };
  return (
    <Box title={title} onClose={onClose}>
      {m.kind === "invite" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-[13.5px] font-medium" style={{ color: "#f3f4f6" }}>Pseudo Discord<input value={discord} onChange={(x) => setDiscord(x.target.value)} placeholder="jean.dupont" className={inp} style={st} /><span className="mt-1 block text-[12px] font-normal" style={{ color: "#aab0bd" }}>Celui avec lequel la personne se connecte à Bloom.</span></label>
          <label className="text-[13.5px] font-medium" style={{ color: "#f3f4f6" }}>Nom affiché<input value={name} onChange={(x) => setName(x.target.value)} placeholder="Ex : Julie (matin)" className={inp} style={st} /><span className="mt-1 block text-[12px] font-normal" style={{ color: "#aab0bd" }}>Le nom que l’équipe voit dans le chat.</span></label>
        </div>
      ) : null}
      {m.kind === "rename" ? <label className="block text-[13.5px] font-medium" style={{ color: "#f3f4f6" }}>Nom affiché<input autoFocus value={name} onChange={(x) => setName(x.target.value)} className={inp} style={st} /><span className="mt-1 block text-[12px] font-normal" style={{ color: "#aab0bd" }}>Le nom que l’équipe voit dans le chat. Les anciens messages et ventes gardent l’ancien nom.</span></label> : null}
      {m.kind === "invite" || m.kind === "rights" ? <label className="mt-4 block text-[13.5px] font-medium" style={{ color: "#f3f4f6" }}>Rôle<select value={roleId} onChange={(x) => setRoleId(Number(x.target.value))} className={inp} style={st}>{d.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select><span className="mt-1 block text-[12px] font-normal" style={{ color: "#aab0bd" }}>Les pages ouvertes à ce rôle se règlent dans « Rôles et droits par page ».</span></label> : null}
      {m.kind !== "rename" ? (
        <>
          <p className="mt-4 text-[13.5px] font-medium" style={{ color: "#f3f4f6" }}>{m.kind === "remove" ? "Créateurs à retirer" : "Créateurs concernés"}</p>
          {boss && m.kind !== "remove" ? <p className="mt-1.5 text-[12.5px]">Ce rôle voit tous les créateurs.</p> : (
            <>
              {m.kind !== "remove" ? <label className="mt-1.5 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={all} onChange={() => setAll(!all)} /> Tous les créateurs (y compris les prochains)</label> : null}
              {!all || m.kind === "remove" ? <><p className="mt-2 flex flex-wrap gap-2 rounded-lg p-2" style={st}>{list.map((c) => {
                const on = picked.includes(c.id);
                return <button key={c.id} onClick={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])} className="flex items-center gap-1.5 rounded px-2.5 py-1 text-[13px] font-medium" style={on ? { background: m.kind === "remove" ? "#c8452f" : "#405189", color: "#fff" } : { border: "1px solid #2f343a" }}>{on ? <Check className="size-3" /> : null}{c.name}</button>;
              })}{!list.length ? <span className="px-2 py-1 text-[12.5px]">Aucun créateur.</span> : null}</p><p className="mt-1.5 text-[12.5px]"><button onClick={() => setPicked(list.map((c) => c.id))} style={{ color: "#f3f4f6" }}>Tout sélectionner</button><button onClick={() => setPicked([])} className="ml-3">Tout désélectionner</button></p></> : null}
            </>
          )}
        </>
      ) : null}
      {err ? <p className="mt-3 text-[13px]" style={{ color: "#f06548" }}>{err}</p> : null}
      <p className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="h-9 rounded-lg px-4 text-[13px]" style={{ background: "#2f343a", color: "#f3f4f6" }}>Annuler</button><button onClick={save} disabled={busy || (m.kind === "remove" && !picked.length) || ((m.kind === "invite" || m.kind === "rename") && !name.trim())} className="flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: m.kind === "remove" ? "#c8452f" : "#4a57a8" }}><Check className="size-4" /> {busy ? "…" : m.kind === "remove" ? "Retirer des créateurs" : m.kind === "rename" ? "Renommer" : "Enregistrer"}</button></p>
    </Box>
  );
}
