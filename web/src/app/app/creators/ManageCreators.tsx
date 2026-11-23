"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Pencil, Settings2, UserPlus, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Avatar } from "@/components/ui";

// Creators → Manage creators : copie d'Infloww. Créatrices reliées à Substy (Connected) + comptes vus seulement dans
// Infloww / MyPulse (chiffres seulement). Surnom et tags gardés par Bloom ; employés = qui a accès (Manage employees).
type Row = { id: string; name: string; avatar: string | null; nickname: string; tags: string[]; platform: string; handle: string | null; employees: string[]; status: "connected" | "stats"; substy: boolean };
type T = (s: string) => string;
const ORANGE = "#f28c5b";

export function ManageCreators() {
  const { t } = useT();
  const [d, setD] = useState<{ creators: Row[]; tags: string[]; employees: string[] } | null>(null);
  const [f, setF] = useState({ q: "", platform: "", tag: "", status: "", employee: "" });
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(10);
  const [edit, setEdit] = useState<Row | null>(null);
  const load = () => api<{ creators: Row[]; tags: string[]; employees: string[] }>("GET", "/api/staff/creators").then(setD).catch((e) => toast((e as Error).message, "err"));
  useEffect(() => {
    load();
  }, []);
  const rows = useMemo(
    () =>
      (d?.creators ?? []).filter(
        (r) =>
          (!f.q || (r.name + " " + r.nickname).toLowerCase().includes(f.q.toLowerCase())) &&
          (!f.platform || r.platform === f.platform) &&
          (!f.tag || r.tags.includes(f.tag)) &&
          (!f.status || r.status === f.status) &&
          (!f.employee || r.employees.includes(f.employee)),
      ),
    [d, f],
  );
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const set = (k: keyof typeof f, v: string) => (setF({ ...f, [k]: v }), setPage(1));
  const pill = "flex h-8 items-center gap-2 rounded-md px-3 text-[14px]";
  const Drop = ({ k, label, options }: { k: keyof typeof f; label: string; options: [string, string][] }) => (
    <label className={`${pill} relative`} style={{ background: "var(--of-card)", color: f[k] ? "var(--of-text)" : "var(--of-muted)" }}>
      <select value={f[k]} onChange={(e) => set(k, e.target.value)} className="appearance-none bg-transparent pr-5 outline-none">
        <option value="" style={{ background: "#222" }}>{label}</option>
        {options.map(([v, l]) => <option key={v} value={v} style={{ background: "#222" }}>{l}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-4" />
    </label>
  );
  return (
    <div className="min-h-full" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="flex items-center justify-between border-b px-6 py-3" style={{ borderColor: "var(--of-line)" }}>
        <h1 className="text-[16px] font-semibold">{t("Manage creators")}</h1>
        <span title={t("Creators are added in Substy (and Infloww / MyPulse for the stats)")} className="flex h-9 cursor-not-allowed items-center gap-2 rounded-md px-4 text-[15px] font-semibold text-white opacity-60" style={{ background: ORANGE }}><UserPlus className="size-4" /> {t("Add creator")}</span>
      </div>
      <div className="px-4 py-4">
        <div className="flex flex-wrap gap-3">
          <input value={f.q} onChange={(e) => set("q", e.target.value)} placeholder={t("Creator name")} className={`${pill} w-52 outline-none`} style={{ background: "var(--of-card)" }} />
          <Drop k="platform" label={t("Platform")} options={[["OnlyFans", "OnlyFans"], ["MYM", "MYM"]]} />
          <Drop k="tag" label={t("Tag")} options={(d?.tags ?? []).map((x) => [x, x])} />
          <Drop k="status" label={t("Connectivity status")} options={[["connected", t("Connected")], ["stats", t("Stats only")]]} />
          <Drop k="employee" label={t("Employee")} options={(d?.employees ?? []).map((x) => [x, x])} />
        </div>
        <div className="of-scroll mt-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-[14px]">
            <thead>
              <tr className="text-left" style={{ background: "var(--of-card)" }}>
                <th className="w-12 px-3" />
                {["Creator", "Nickname", "Tag"].map((h) => <th key={h} className="px-3 py-4 font-medium">{t(h)}</th>)}
                <th className="w-10"><Settings2 className="size-4" style={{ color: "var(--of-muted)" }} /></th>
                {["Account", "Creator ID", "Employees", "Connectivity status", "Action"].map((h) => <th key={h} className="px-3 py-4 font-medium">{t(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice((page - 1) * per, page * per).map((r) => (
                <tr key={r.id} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                  <td />
                  <td className="px-3 py-3"><span className="flex items-center gap-2.5"><Avatar src={r.avatar} name={r.name} size="size-7" />{r.name}</span></td>
                  <td className="px-3">{r.nickname}</td>
                  <td className="px-3" colSpan={2}>
                    <span className="flex flex-wrap gap-1">{r.tags.map((x) => <span key={x} className="rounded px-1.5 py-0.5 text-[12px]" style={{ background: "var(--of-card)" }}>{x}</span>)}</span>
                  </td>
                  <td className="px-3">{r.platform}</td>
                  <td className="px-3">{r.handle ? `@${r.handle}` : "—"}</td>
                  <td className="max-w-[220px] px-3 leading-snug"><span className="line-clamp-2" title={r.employees.join(", ")}>{r.employees.join(", ") || "—"}</span></td>
                  <td className="px-3" style={{ color: r.status === "connected" ? "#3fbf6f" : "var(--of-muted)" }}>{t(r.status === "connected" ? "Connected" : "Stats only")}</td>
                  <td className="px-3">
                    <button onClick={() => setEdit(r)} title={t("Edit")} className="grid size-8 place-items-center rounded-md" style={{ background: "var(--of-card)" }}><Pencil className="size-4" /></button>
                  </td>
                </tr>
              ))}
              {d && !rows.length ? <tr><td colSpan={10} className="py-14 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[14px]">
          <span className="mr-2">{t("Total")}: {rows.length} {t("creators")}</span>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid size-8 place-items-center rounded disabled:opacity-30" style={{ background: "var(--of-card)" }}>‹</button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setPage(n)} className="grid size-8 place-items-center rounded" style={n === page ? { background: "var(--of-card)", fontWeight: 600 } : undefined}>{n}</button>
          ))}
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="grid size-8 place-items-center rounded disabled:opacity-30" style={{ background: "var(--of-card)" }}>›</button>
          <span className="ml-4">{t("Per page")}</span>
          <select value={per} onChange={(e) => (setPer(Number(e.target.value)), setPage(1))} className="h-8 rounded px-2" style={{ background: "var(--of-card)" }}>
            {[10, 20, 50].map((n) => <option key={n} value={n} style={{ background: "#222" }}>{n}</option>)}
          </select>
        </div>
      </div>
      {edit ? <EditCreator row={edit} tags={d?.tags ?? []} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), load())} t={t} /> : null}
    </div>
  );
}

function EditCreator({ row, tags, onClose, onSaved, t }: { row: Row; tags: string[]; onClose: () => void; onSaved: () => void; t: T }) {
  const [nick, setNick] = useState(row.nickname);
  const [on, setOn] = useState<string[]>(row.tags);
  const [nt, setNt] = useState("");
  const save = async () => {
    try {
      await api("POST", "/api/staff/creators", { id: row.id, nickname: nick, tags: on });
      onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const box = "mt-1.5 h-10 w-full rounded-md px-3 outline-none";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[480px] rounded-xl" style={{ background: "#171717", color: "#fff" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "#2a2a2a" }}>
          <h3 className="flex items-center gap-2.5 text-[18px] font-semibold"><Avatar src={row.avatar} name={row.name} size="size-7" />{row.name}</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-md" style={{ background: "#2a2a2a" }}><X className="size-4" /></button>
        </div>
        <div className="px-5 py-4 text-[14px]">
          <p>{t("Nickname")}</p>
          <input value={nick} maxLength={60} onChange={(e) => setNick(e.target.value)} className={box} style={{ background: "#262626" }} />
          <p className="mt-4">{t("Tag")}</p>
          <div className="mt-1.5 rounded-md p-2" style={{ background: "#262626" }}>
            {[...new Set([...tags, ...on])].map((x) => (
              <label key={x} className="flex items-center gap-2 px-1 py-1"><input type="checkbox" checked={on.includes(x)} onChange={() => setOn(on.includes(x) ? on.filter((y) => y !== x) : [...on, x])} /> {x}</label>
            ))}
            <input value={nt} onChange={(e) => setNt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && nt.trim() && (setOn([...on, nt.trim()]), setNt(""))} placeholder={`+ ${t("Add Tag")}`} className="mt-1 h-8 w-full bg-transparent px-1 outline-none" />
          </div>
          <p className="mt-3 text-[12px]" style={{ color: "#999" }}>{t("Who has access to this creator is set in Employees → Manage employees.")}</p>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "#2a2a2a" }}>
          <button onClick={onClose} className="h-9 rounded-lg px-4" style={{ background: "#2a2a2a" }}>{t("Cancel")}</button>
          <button onClick={save} className="h-9 rounded-lg px-5 text-white" style={{ background: ORANGE }}>{t("Save")}</button>
        </div>
      </div>
    </div>
  );
}
