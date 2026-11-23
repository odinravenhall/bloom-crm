"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useT } from "@/lib/i18n";

// Settings → Role settings : copie d'Infloww. Chaque rôle = un nom, une description, un type (ce que l'API autorise)
// et des cases d'accès page par page. Seuls les admins créent et modifient ; les managers regardent.
const BLUE = "#3a6df0";
type Perm = { key: string; group: string; label: string; bases: string[] };
type Role = { id: number; name: string; description: string; base: string; perms: string[] | null; active: boolean; system: boolean; users: string[] };
type T = (s: string) => string;
const BASES: [string, string][] = [["admin", "Admin"], ["manager", "Manager"], ["lead", "Team leader"], ["chatter", "Chatter"], ["model", "Model"]];

export function RoleSettings() {
  const { t } = useT();
  const [d, setD] = useState<{ roles: Role[]; perms: Perm[]; canEdit: boolean } | null>(null);
  const [draft, setDraft] = useState({ q: "", status: "" });
  const [f, setF] = useState(draft);
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Partial<Role> | null>(null);
  const load = () => api<{ roles: Role[]; perms: Perm[]; canEdit: boolean }>("GET", "/api/staff/roles").then(setD).catch((e) => toast((e as Error).message, "err"));
  useEffect(() => {
    load();
  }, []);
  const rows = useMemo(() => (d?.roles ?? []).filter((r) => (!f.q || r.name.toLowerCase().includes(f.q.toLowerCase())) && (!f.status || (f.status === "on") === r.active)), [d, f]);
  const PER = 10;
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const toggle = async (r: Role) => {
    if (r.active && !confirm(t("Turn off this role? People who have it will be logged out until it is turned back on."))) return;
    try {
      await api("POST", "/api/staff/roles", { id: r.id, active: !r.active });
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const remove = async (r: Role) => {
    if (!confirm(t("Delete this role?"))) return;
    try {
      await api("POST", "/api/staff/roles", { id: r.id, delete: true });
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const sel = "h-8 rounded border bg-transparent px-2 text-[13px] outline-none";
  return (
    <div className="min-h-full p-5" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--of-line)" }}>
        <h1 className="text-[16px] font-semibold">{t("Role settings")}</h1>
        {d?.canEdit ? <button onClick={() => setEdit({ base: "chatter", perms: null })} className="h-8 rounded px-4 text-[13px] text-white" style={{ background: BLUE }}>+ {t("Add role")}</button> : null}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        <label className="flex items-center gap-2">{t("By role")}:
          <input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder={t("Role name")} className={`${sel} w-48`} style={{ borderColor: "var(--of-line)" }} />
        </label>
        <label className="flex items-center gap-2">{t("By status")}:
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={`${sel} w-48`} style={{ borderColor: "var(--of-line)" }}>
            <option value="" style={{ background: "#222" }}>{t("Status")}</option>
            <option value="on" style={{ background: "#222" }}>{t("Activated")}</option>
            <option value="off" style={{ background: "#222" }}>{t("Deactivated")}</option>
          </select>
        </label>
        <span className="ml-auto flex gap-2">
          <button onClick={() => { const z = { q: "", status: "" }; setDraft(z); setF(z); }} className="h-8 rounded border px-4" style={{ borderColor: "var(--of-line)" }}>{t("Reset")}</button>
          <button onClick={() => (setF(draft), setPage(1))} className="h-8 rounded px-4 text-white" style={{ background: BLUE }}>{t("Search")}</button>
        </span>
      </div>
      <div className="of-scroll mt-5 overflow-x-auto">
        <table className="w-full min-w-[900px] text-[14px]">
          <thead>
            <tr className="text-left" style={{ background: "var(--of-card)" }}>
              {["Role", "Description", "Users", "Status", "Operations"].map((h) => <th key={h} className="px-4 py-3.5 font-medium">{t(h)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice((page - 1) * PER, page * PER).map((r) => (
              <tr key={r.id} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                <td className="px-4 py-4">{r.name}<span className="block text-[11px]" style={{ color: "var(--of-muted)" }}>{t(BASES.find((b) => b[0] === r.base)?.[1] ?? r.base)}</span></td>
                <td className="max-w-[340px] truncate px-4" title={r.description}>{r.description}</td>
                <td className="max-w-[340px] truncate px-4" title={r.users.join(", ")}>{r.users.join(", ")}</td>
                <td className="px-4">
                  <button disabled={!d?.canEdit || (r.system && r.base === "admin")} onClick={() => toggle(r)} role="switch" aria-checked={r.active} className="relative h-[24px] w-11 rounded-full disabled:opacity-60" style={{ background: r.active ? BLUE : "var(--of-line)" }}>
                    <span className="absolute top-[3px] size-[18px] rounded-full bg-white transition-all" style={{ left: r.active ? 23 : 3 }} />
                  </button>
                </td>
                <td className="px-4">
                  {d?.canEdit ? (
                    <span className="flex gap-4 text-[13px]">
                      <button onClick={() => setEdit(r)} style={{ color: BLUE }}>{t("Edit")}</button>
                      {r.system ? null : <button onClick={() => remove(r)} style={{ color: "#e5484d" }}>{t("Delete")}</button>}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
            {d && !rows.length ? <tr><td colSpan={5} className="py-12 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[13px]">
        <span className="mr-2">{t("Total")}: {rows.length} {t("roles")}</span>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid size-8 place-items-center disabled:opacity-30">‹</button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button key={n} onClick={() => setPage(n)} className="grid size-8 place-items-center rounded border" style={{ borderColor: n === page ? BLUE : "transparent", color: n === page ? BLUE : undefined }}>{n}</button>
        ))}
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="grid size-8 place-items-center disabled:opacity-30">›</button>
      </div>
      {edit && d ? <RoleModal role={edit} perms={d.perms} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), load())} t={t} /> : null}
    </div>
  );
}

function RoleModal({ role, perms, onClose, onSaved, t }: { role: Partial<Role>; perms: Perm[]; onClose: () => void; onSaved: () => void; t: T }) {
  const [v, setV] = useState({ name: role.name ?? "", description: role.description ?? "", base: role.base ?? "chatter" });
  const avail = perms.filter((p) => p.bases.includes(v.base));
  // null = toutes les pages du type ; sinon la liste cochée.
  const [on, setOn] = useState<string[]>(role.perms ?? perms.map((p) => p.key));
  const [busy, setBusy] = useState(false);
  const groups = [...new Set(avail.map((p) => p.group))];
  const lockedAdmin = !!role.system && role.base === "admin";
  const save = async () => {
    setBusy(true);
    try {
      const list = on.filter((k) => avail.some((p) => p.key === k));
      await api("POST", "/api/staff/roles", { id: role.id, ...v, perms: lockedAdmin || list.length === avail.length ? null : list });
      toast(t("Saved — people with this role are asked to refresh"));
      onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const box = "mt-1.5 h-10 w-full rounded border px-3 outline-none";
  const st = { background: "#333", borderColor: "#4a4a4a" };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[640px] rounded-lg" style={{ background: "#2b2b2b", color: "#eee" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between border-b px-5 py-3.5 text-[15px] font-semibold" style={{ borderColor: "#3a3a3a" }}>{t(role.id ? "Edit role" : "Add role")}<button onClick={onClose}><X className="size-4" /></button></h3>
        <div className="of-scroll max-h-[70vh] overflow-y-auto px-5 py-4 text-[13px]">
          <p><span style={{ color: "#e5484d" }}>*</span>{t("Role name")}</p>
          <input value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} className={box} style={st} />
          <p className="mt-4">{t("Description")}</p>
          <input value={v.description} maxLength={200} onChange={(e) => setV({ ...v, description: e.target.value })} className={box} style={st} />
          <p className="mt-4"><span style={{ color: "#e5484d" }}>*</span>{t("Role type")}</p>
          <select disabled={!!role.system} value={v.base} onChange={(e) => setV({ ...v, base: e.target.value })} className={`${box} disabled:opacity-60`} style={st}>
            {BASES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
          </select>
          <p className="mt-1 text-[11px] opacity-60">{t("The type decides what Bloom allows behind the pages (creators seen, sending, settings). The boxes below open or close pages.")}</p>
          <p className="mt-5 font-semibold">{t("Permissions")}</p>
          {lockedAdmin ? <p className="mt-2 opacity-70">{t("The Admin role always has every permission.")}</p> : null}
          {!lockedAdmin
            ? groups.map((g) => {
                const items = avail.filter((p) => p.group === g);
                const all = items.every((p) => on.includes(p.key));
                return (
                  <div key={g} className="mt-3 rounded border p-3" style={{ borderColor: "#3a3a3a" }}>
                    <label className="flex items-center gap-2 font-semibold">
                      <input type="checkbox" checked={all} onChange={() => setOn(all ? on.filter((k) => !items.some((p) => p.key === k)) : [...new Set([...on, ...items.map((p) => p.key)])])} /> {t(g)}
                    </label>
                    {items.length > 1 || items[0]?.label !== g ? (
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 pl-6">
                        {items.map((p) => (
                          <label key={p.key} className="flex items-center gap-2">
                            <input type="checkbox" checked={on.includes(p.key)} onChange={() => setOn(on.includes(p.key) ? on.filter((k) => k !== p.key) : [...on, p.key])} /> {t(p.label)}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "#3a3a3a" }}>
          <button onClick={onClose} className="h-8 rounded border px-4" style={{ borderColor: "#4a4a4a" }}>{t("Cancel")}</button>
          <button disabled={busy || !v.name.trim()} onClick={save} className="h-8 rounded px-4 text-white disabled:opacity-50" style={{ background: BLUE }}>{t("Save")}</button>
        </div>
      </div>
    </div>
  );
}
