"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, EllipsisVertical, Plus, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Avatar } from "@/components/ui";

// Employees → Manage employees : copie de la page d'Infloww. Groupes et sous-groupes à gauche, tableau à droite.
// « Add employee » = pseudo Discord : la personne a ses accès dès sa première connexion avec Discord.
const BLUE = "#3a6df0";
type Emp = { id: number; name: string; avatar: string | null; base: string; roleId: number | null; roleName: string; groupId: number | null; discord: string | null; status: "active" | "off" | "pending"; allCreators: boolean; creators: string[] };
type Group = { id: number; name: string; parentId: number | null };
type RoleOpt = { id: number; name: string; base: string };
type Cr = { id: string; name: string; platform: string | null };
type Data = { employees: Emp[]; groups: Group[]; roles: RoleOpt[]; canEdit: boolean; me: number };
type T = (s: string) => string;
const PER = 10;

export function ManageEmployees() {
  const { t } = useT();
  const [d, setD] = useState<Data | null>(null);
  const [creators, setCreators] = useState<Cr[]>([]);
  const [group, setGroup] = useState<number | null>(null);
  const [folded, setFolded] = useState<Set<number>>(new Set());
  const [draft, setDraft] = useState({ q: "", creator: "", status: "" });
  const [f, setF] = useState(draft);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<null | { kind: "emp"; emp?: Emp } | { kind: "creators"; ids: number[]; emp?: Emp } | { kind: "group"; parentId?: number; edit?: Group } | { kind: "pick"; what: "group" | "role"; ids: number[] }>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const load = () => api<Data>("GET", "/api/staff").then(setD).catch((e) => toast((e as Error).message, "err"));
  useEffect(() => {
    load();
    api<Cr[]>("GET", "/api/creators").then(setCreators).catch(() => {});
  }, []);
  const root = d?.groups.find((g) => !g.parentId)?.id ?? null;
  const cur = group ?? root;
  const below = useMemo(() => {
    const out = new Set<number>();
    const walk = (id: number) => (out.add(id), d?.groups.filter((g) => g.parentId === id).forEach((g) => walk(g.id)));
    if (cur != null) walk(cur);
    return out;
  }, [d, cur]);
  const rows = useMemo(
    () =>
      (d?.employees ?? []).filter(
        (e) =>
          (e.groupId == null || below.has(e.groupId)) &&
          (!f.q || (e.name + " " + (e.discord || "")).toLowerCase().includes(f.q.toLowerCase())) &&
          (!f.creator || e.allCreators || e.creators.includes(f.creator)) &&
          (!f.status || e.status === f.status),
      ),
    [d, below, f],
  );
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const shown = rows.slice((page - 1) * PER, page * PER);
  const crName = (id: string) => creators.find((c) => c.id === id)?.name ?? id;
  const batch = async (action: string, ids: number[], extra: Record<string, unknown> = {}) => {
    if (!ids.length) return toast(t("Select at least one employee"), "err");
    if (action === "delete" && !confirm(t("Delete the selected employees?"))) return;
    try {
      const r = await api<{ employees: Emp[] }>("POST", "/api/staff/batch", { action, ids, ...extra });
      setD((x) => (x ? { ...x, employees: r.employees } : x));
      setPicked(new Set());
      setModal(null);
      toast(t("Saved"));
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const groupAct = async (b: Record<string, unknown>) => {
    try {
      const r = await api<{ groups: Group[]; employees: Emp[] }>("POST", "/api/staff/groups", b);
      setD((x) => (x ? { ...x, ...r } : x));
      setModal(null);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const statusCell = (s: Emp["status"]) =>
    s === "active" ? <span style={{ color: "#3fbf6f" }}>{t("Activated")}</span> : s === "off" ? <span style={{ color: "var(--of-muted)" }}>{t("Deactivated")}</span> : <span title={t("Added in Bloom, has not logged in with Discord yet")} style={{ color: "#e0a040" }}>{t("Pending")}</span>;

  const tree = (parent: number | null, depth: number): React.ReactNode =>
    (d?.groups ?? [])
      .filter((g) => g.parentId === parent)
      .map((g) => {
        const kids = d!.groups.some((x) => x.parentId === g.id);
        const open = !folded.has(g.id);
        return (
          <div key={g.id}>
            <div className="group relative flex items-center rounded-md pr-1 text-[14px]" style={{ paddingLeft: 6 + depth * 18, background: cur === g.id ? "var(--of-card)" : undefined }}>
              <button onClick={() => setFolded((s) => (s.has(g.id) ? (s.delete(g.id), new Set(s)) : new Set(s.add(g.id))))} className="grid size-5 place-items-center" style={{ visibility: kids ? "visible" : "hidden" }}>
                <ChevronDown className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
              </button>
              <button onClick={() => (setGroup(g.id), setPage(1), setPicked(new Set()))} className={`flex-1 truncate py-2.5 text-left ${depth === 0 ? "font-semibold" : ""}`}>{g.name}</button>
              {d?.canEdit ? (
                <button onClick={() => setMenu(menu === `g${g.id}` ? null : `g${g.id}`)} className="grid size-6 place-items-center rounded opacity-60 hover:opacity-100"><EllipsisVertical className="size-4" /></button>
              ) : null}
              {menu === `g${g.id}` ? (
                <Pop onClose={() => setMenu(null)} className="top-9 right-0">
                  <button onClick={() => (setMenu(null), setModal({ kind: "group", parentId: g.id }))} className="block w-full px-4 py-1.5 text-left" style={{ color: BLUE }}>{t("Add sub-group")}</button>
                  <button onClick={() => (setMenu(null), setModal({ kind: "group", edit: g }))} className="block w-full px-4 py-1.5 text-left">{t("Edit")}</button>
                  {g.parentId ? <button onClick={() => (setMenu(null), confirm(t("Delete this group? Its members move to the group above.")) && groupAct({ id: g.id, delete: true }))} className="block w-full px-4 py-1.5 text-left" style={{ color: "#e5484d" }}>{t("Delete")}</button> : null}
                </Pop>
              ) : null}
            </div>
            {open ? tree(g.id, depth + 1) : null}
          </div>
        );
      });

  const sel = "h-8 rounded border bg-transparent px-2 text-[13px] outline-none";
  return (
    <div className="flex min-h-full flex-col" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <h1 className="border-b px-6 py-4 text-[16px] font-semibold" style={{ borderColor: "var(--of-line)" }}>{t("Manage employees")}</h1>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="w-full shrink-0 border-r p-3 md:w-[250px]" style={{ borderColor: "var(--of-line)" }}>{tree(null, 0)}</aside>
        <section className="min-w-0 flex-1 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-semibold">{d?.groups.find((g) => g.id === cur)?.name ?? ""}</h2>
            <span className="flex gap-3 text-[13px]">
              <span className="relative">
                <button onClick={() => setMenu(menu === "batch" ? null : "batch")} className="flex h-8 items-center gap-6 rounded border px-4" style={{ borderColor: BLUE, color: BLUE }}>{t("Batch actions")} <ChevronDown className="size-4" /></button>
                {menu === "batch" ? (
                  <Pop onClose={() => setMenu(null)} className="top-9 right-0 w-48">
                    {d?.canEdit ? (
                      <>
                        <MenuItem onClick={() => batch("activate", [...picked])}>{t("Activate")}</MenuItem>
                        <MenuItem onClick={() => batch("deactivate", [...picked])}>{t("Deactivate")}</MenuItem>
                        <MenuItem onClick={() => (picked.size ? setModal({ kind: "pick", what: "group", ids: [...picked] }) : toast(t("Select at least one employee"), "err"))}>{t("Change group")}</MenuItem>
                        <MenuItem onClick={() => (picked.size ? setModal({ kind: "pick", what: "role", ids: [...picked] }) : toast(t("Select at least one employee"), "err"))}>{t("Change role")}</MenuItem>
                      </>
                    ) : null}
                    <MenuItem onClick={() => (picked.size ? setModal({ kind: "creators", ids: [...picked] }) : toast(t("Select at least one employee"), "err"))}>{t("Assign creators")}</MenuItem>
                    {d?.canEdit ? <MenuItem danger onClick={() => batch("delete", [...picked])}>{t("Delete")}</MenuItem> : null}
                  </Pop>
                ) : null}
              </span>
              {d?.canEdit ? <button onClick={() => setModal({ kind: "emp" })} className="h-8 rounded px-4 text-white" style={{ background: BLUE }}>+ {t("Add employee")}</button> : null}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            <label className="flex items-center gap-2">{t("By employee")}:
              <input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} onKeyDown={(e) => e.key === "Enter" && (setF(draft), setPage(1))} placeholder={t("Employee")} className={`${sel} w-40`} style={{ borderColor: "var(--of-line)" }} />
            </label>
            <label className="flex items-center gap-2">{t("By creator")}:
              <select value={draft.creator} onChange={(e) => setDraft({ ...draft, creator: e.target.value })} className={`${sel} w-48`} style={{ borderColor: "var(--of-line)" }}>
                <option value="" style={{ background: "#222" }}>{t("Creator")}</option>
                {creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">{t("By status")}:
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className={`${sel} w-36`} style={{ borderColor: "var(--of-line)" }}>
                <option value="" style={{ background: "#222" }}>{t("Status")}</option>
                <option value="active" style={{ background: "#222" }}>{t("Activated")}</option>
                <option value="off" style={{ background: "#222" }}>{t("Deactivated")}</option>
                <option value="pending" style={{ background: "#222" }}>{t("Pending")}</option>
              </select>
            </label>
            <span className="ml-auto flex gap-2">
              <button onClick={() => { const z = { q: "", creator: "", status: "" }; setDraft(z); setF(z); setPage(1); }} className="h-8 rounded border px-4" style={{ borderColor: "var(--of-line)" }}>{t("Reset")}</button>
              <button onClick={() => (setF(draft), setPage(1))} className="h-8 rounded px-4 text-white" style={{ background: BLUE }}>{t("Search")}</button>
            </span>
          </div>
          <div className="of-scroll mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-[14px]">
              <thead>
                <tr className="text-left" style={{ background: "var(--of-card)" }}>
                  <th className="w-10 px-3 py-3.5"><input type="checkbox" checked={!!shown.length && shown.every((e) => picked.has(e.id))} onChange={(ev) => setPicked(ev.target.checked ? new Set(shown.map((e) => e.id)) : new Set())} /></th>
                  {["Employee", "Assigned Creators", "Role", "Status", "Actions"].map((h) => <th key={h} className="px-3 py-3.5 font-medium">{t(h)}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                    <td className="px-3"><input type="checkbox" checked={picked.has(e.id)} onChange={() => setPicked((s) => (s.has(e.id) ? (s.delete(e.id), new Set(s)) : new Set(s.add(e.id))))} /></td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar src={e.avatar} name={e.name} size="size-7" />
                        <span className="leading-tight">{e.name}{e.discord ? <span className="block text-[12px]" style={{ color: "var(--of-muted)" }}>@{e.discord}</span> : null}</span>
                      </span>
                    </td>
                    <td className="max-w-[300px] px-3">
                      {e.allCreators ? (
                        <span style={{ color: BLUE }}>{t("All creators")}</span>
                      ) : e.creators.length ? (
                        <button onClick={() => setModal({ kind: "creators", ids: [e.id], emp: e })} className="line-clamp-2 text-left" style={{ color: BLUE }}>{e.creators.map(crName).join(", ")}</button>
                      ) : (
                        <button onClick={() => setModal({ kind: "creators", ids: [e.id], emp: e })} className="flex items-center gap-1" style={{ color: e.status === "off" ? "var(--of-muted)" : BLUE }}><Plus className="size-3.5" />{t("Click to set")}</button>
                      )}
                    </td>
                    <td className="px-3" style={{ color: e.status === "off" ? "var(--of-muted)" : BLUE }}>{e.roleName}</td>
                    <td className="px-3">{statusCell(e.status)}</td>
                    <td className="relative px-3">
                      {d?.canEdit && e.id !== d.me ? (
                        <span className="flex gap-4">
                          <button onClick={() => setModal({ kind: "emp", emp: e })} style={{ color: e.status === "off" ? "var(--of-muted)" : BLUE }}>{t("Edit")}</button>
                          <button onClick={() => setMenu(menu === `e${e.id}` ? null : `e${e.id}`)} style={{ color: BLUE }}>{t("More")}</button>
                        </span>
                      ) : d?.canEdit ? <button onClick={() => setModal({ kind: "emp", emp: e })} style={{ color: BLUE }}>{t("Edit")}</button> : null}
                      {menu === `e${e.id}` ? (
                        <Pop onClose={() => setMenu(null)} className="top-8 left-10 w-40">
                          {e.status === "off" ? <MenuItem onClick={() => batch("activate", [e.id])}>{t("Activate")}</MenuItem> : <MenuItem onClick={() => batch("deactivate", [e.id])}>{t("Deactivate")}</MenuItem>}
                          <MenuItem danger onClick={() => batch("delete", [e.id])}>{t("Delete")}</MenuItem>
                        </Pop>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {d && !shown.length ? <tr><td colSpan={6} className="py-14 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="mr-2">{t("Total")}: {rows.length} {t("employees")}</span>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid size-8 place-items-center disabled:opacity-30">‹</button>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2)
              .map((n, i, arr) => (
                <span key={n} className="flex items-center gap-2">
                  {i && n - arr[i - 1] > 1 ? <span>…</span> : null}
                  <button onClick={() => setPage(n)} className="grid size-8 place-items-center rounded border" style={{ borderColor: n === page ? BLUE : "transparent", color: n === page ? BLUE : undefined }}>{n}</button>
                </span>
              ))}
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="grid size-8 place-items-center disabled:opacity-30">›</button>
          </div>
        </section>
      </div>
      {modal?.kind === "emp" && d ? <EmployeeModal emp={modal.emp} d={d} group={cur} creators={creators} onClose={() => setModal(null)} onSaved={(emps) => (setD({ ...d, employees: emps }), setModal(null))} t={t} /> : null}
      {modal?.kind === "creators" ? <CreatorsModal emp={modal.emp} creators={creators} onClose={() => setModal(null)} onSave={(all, list) => batch("creators", modal.ids, { all, creators: list })} t={t} /> : null}
      {modal?.kind === "group" ? <NameModal title={t(modal.edit ? "Edit group" : "Add sub-group")} value={modal.edit?.name ?? ""} onClose={() => setModal(null)} onSave={(name) => groupAct(modal.edit ? { id: modal.edit.id, name } : { parentId: modal.parentId, name })} t={t} /> : null}
      {modal?.kind === "pick" && d ? (
        <PickModal
          title={t(modal.what === "group" ? "Change group" : "Change role")}
          options={modal.what === "group" ? d.groups.map((g) => ({ id: g.id, name: g.name })) : d.roles}
          onClose={() => setModal(null)}
          onSave={(id) => batch(modal.what, modal.ids, modal.what === "group" ? { groupId: id } : { roleId: id })}
          t={t}
        />
      ) : null}
    </div>
  );
}

function Pop({ children, onClose, className }: { children: React.ReactNode; onClose: () => void; className: string }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={onClose} />
      <div className={`absolute z-40 rounded-md border py-1.5 text-[13px] shadow-xl ${className}`} style={{ background: "#2b2b2b", borderColor: "#3a3a3a", color: "#eee" }}>{children}</div>
    </>
  );
}
const MenuItem = ({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick} className="block w-full px-4 py-1.5 text-left hover:bg-white/5" style={{ color: danger ? "#e5484d" : BLUE }}>{children}</button>
);

function Modal({ title, children, onClose, onOk, busy, t }: { title: string; children: React.ReactNode; onClose: () => void; onOk: () => void; busy?: boolean; t: T }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[520px] rounded-lg" style={{ background: "#2b2b2b", color: "#eee" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between border-b px-5 py-3.5 text-[15px] font-semibold" style={{ borderColor: "#3a3a3a" }}>{title}<button onClick={onClose}><X className="size-4" /></button></h3>
        <div className="of-scroll max-h-[70vh] overflow-y-auto px-5 py-4 text-[13px]">{children}</div>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "#3a3a3a" }}>
          <button onClick={onClose} className="h-8 rounded border px-4" style={{ borderColor: "#4a4a4a" }}>{t("Cancel")}</button>
          <button disabled={busy} onClick={onOk} className="h-8 rounded px-4 text-white disabled:opacity-50" style={{ background: BLUE }}>{t("Save")}</button>
        </div>
      </div>
    </div>
  );
}
const field = "mt-1.5 h-10 w-full rounded border px-3 outline-none";
const fieldStyle = { background: "#333", borderColor: "#4a4a4a" };
const Req = ({ children }: { children: React.ReactNode }) => <p className="mt-4 first:mt-0"><span style={{ color: "#e5484d" }}>*</span>{children}</p>;

function CreatorPicker({ all, setAll, list, setList, creators, t }: { all: boolean; setAll: (v: boolean) => void; list: string[]; setList: (v: string[]) => void; creators: Cr[]; t: T }) {
  const [q, setQ] = useState("");
  return (
    <div className="mt-1.5 rounded border p-2" style={fieldStyle}>
      <label className="flex items-center gap-2 px-1 py-1 font-semibold"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t("All creators")}</label>
      {!all ? (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search")} className="my-1 h-8 w-full rounded bg-black/20 px-2 outline-none" />
          <div className="of-scroll max-h-52 overflow-y-auto">
            {creators.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-1 py-1">
                <input type="checkbox" checked={list.includes(c.id)} onChange={() => setList(list.includes(c.id) ? list.filter((x) => x !== c.id) : [...list, c.id])} /> {c.name}
                <span className="text-[11px] opacity-50">{/mym/i.test(c.platform || "") ? "MYM" : "OnlyFans"}</span>
              </label>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function EmployeeModal({ emp, d, group, creators, onClose, onSaved, t }: { emp?: Emp; d: Data; group: number | null; creators: Cr[]; onClose: () => void; onSaved: (e: Emp[]) => void; t: T }) {
  const [v, setV] = useState({ name: emp?.name ?? "", discord: emp?.discord ?? "", groupId: emp?.groupId ?? group ?? 0, roleId: emp?.roleId ?? 0 });
  const [all, setAll] = useState(!!emp?.allCreators);
  const [list, setList] = useState<string[]>(emp?.creators ?? []);
  const [busy, setBusy] = useState(false);
  const base = d.roles.find((r) => r.id === v.roleId)?.base;
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ employees: Emp[] }>("POST", "/api/staff/employee", { id: emp?.id, ...v, all, creators: list });
      toast(t(emp ? "Saved" : "Employee added: access starts at their first Discord login"));
      onSaved(r.employees);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t(emp ? "Edit employee" : "Add employee")} onClose={onClose} onOk={save} busy={busy} t={t}>
      <Req>{t("Employee name")}</Req>
      <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder={t("Enter name")} className={field} style={fieldStyle} />
      {emp ? null : (
        <>
          <Req>{t("Discord username")}</Req>
          <input value={v.discord} onChange={(e) => setV({ ...v, discord: e.target.value })} placeholder="ex. jean.dupont" className={field} style={fieldStyle} />
          <p className="mt-1 text-[11px] opacity-60">{t("The username they use to log in to Discord (not the server nickname).")}</p>
        </>
      )}
      <Req>{t("Group")}</Req>
      <select value={v.groupId} onChange={(e) => setV({ ...v, groupId: Number(e.target.value) })} className={field} style={fieldStyle}>
        {d.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <Req>{t("Role")}</Req>
      <select value={v.roleId} onChange={(e) => setV({ ...v, roleId: Number(e.target.value) })} className={field} style={fieldStyle}>
        <option value={0}>{t("Select role")}</option>
        {d.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      {base && base !== "admin" && base !== "manager" ? (
        <>
          <p className="mt-4">{t("Assign Creator(s)")}</p>
          <CreatorPicker all={all} setAll={setAll} list={list} setList={setList} creators={creators} t={t} />
        </>
      ) : base ? <p className="mt-4 opacity-60">{t("Admins and managers see all creators.")}</p> : null}
    </Modal>
  );
}

function CreatorsModal({ emp, creators, onClose, onSave, t }: { emp?: Emp; creators: Cr[]; onClose: () => void; onSave: (all: boolean, list: string[]) => void; t: T }) {
  const [all, setAll] = useState(!!emp?.allCreators);
  const [list, setList] = useState<string[]>(emp?.creators ?? []);
  return (
    <Modal title={t("Assign creators")} onClose={onClose} onOk={() => onSave(all, list)} t={t}>
      {emp ? <p className="mb-2 font-semibold">{emp.name}</p> : null}
      <CreatorPicker all={all} setAll={setAll} list={list} setList={setList} creators={creators} t={t} />
    </Modal>
  );
}

function NameModal({ title, value, onClose, onSave, t }: { title: string; value: string; onClose: () => void; onSave: (v: string) => void; t: T }) {
  const [v, setV] = useState(value);
  return (
    <Modal title={title} onClose={onClose} onOk={() => onSave(v)} t={t}>
      <Req>{t("Group name")}</Req>
      <input autoFocus value={v} maxLength={40} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSave(v)} className={field} style={fieldStyle} />
    </Modal>
  );
}

function PickModal({ title, options, onClose, onSave, t }: { title: string; options: { id: number; name: string }[]; onClose: () => void; onSave: (id: number) => void; t: T }) {
  const [v, setV] = useState(options[0]?.id ?? 0);
  return (
    <Modal title={title} onClose={onClose} onOk={() => onSave(v)} t={t}>
      <select value={v} onChange={(e) => setV(Number(e.target.value))} className={field} style={fieldStyle}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </Modal>
  );
}
