"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Search, UserPlus, Users, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { Avatar } from "@/rv/components/ui";
import { cash, Confirm, int, Modal, RowMenu, Switch } from "../kit";
import { errText, plural } from "../media/MediaKit";
import { dateOf, ModelMenu, type TeamModel } from "./TeamKit";

// Bloom v2 → Équipe → Accès (25/11/2026, « Constellation ») : qui a accès à Bloom, avec quel rôle et sur quelles
// modèles. UN écran pour les deux plateformes, à la place de « Accès & équipe » (copie de MyPulse, modèles MYM
// seulement), « Manage employees » et « Role settings » (copies d'Infloww). Les droits passent par un RÔLE et par la
// liste des modèles de chacun, jamais par des cases cochées personne par personne.
// Lecture et écriture : les routes « /api/staff… » (app/staff.mjs), qui ne dépendent d'aucune plateforme ; les modèles
// des deux plateformes viennent de `GET /api/v2/team/models`, la fiche d'une personne de `GET /api/v2/team/person`.
type Emp = { id: number; name: string; avatar: string | null; base: string; roleId: number | null; roleName: string; groupId: number | null; discord: string | null; status: "active" | "off" | "pending"; allCreators: boolean; creators: string[] };
type Group = { id: number; name: string; parentId: number | null };
type RoleOpt = { id: number; name: string; base: string };
type Staff = { employees: Emp[]; groups: Group[]; roles: RoleOpt[]; canEdit: boolean; me: number };
type M = TeamModel & { mym: boolean };
type Perm = { key: string; group: string; label: string; bases: string[] };
type Role = { id: number; name: string; description: string; base: string; perms: string[] | null; active: boolean; system: boolean; users: string[] };
type Roles = { roles: Role[]; perms: Perm[]; canEdit: boolean };
type PersonStats = { name: string; messages: number; ppv: number; lastMessage: number | null; models: number; of: { sales: number; net: number }; mym: { sales: number; net: number }; activeMs: number; idleMs: number; days: number };
type Win =
  | null
  | { kind: "person"; e: Emp | null }
  | { kind: "models"; ids: number[]; e: Emp | null }
  | { kind: "pick"; what: "role" | "group"; ids: number[] }
  | { kind: "group"; g: Group | null; parentId: number | null }
  | { kind: "stats"; e: Emp }
  | { kind: "role"; r: Role | null }
  | { kind: "confirm"; title: string; text: string; button: string; go: () => Promise<unknown> };

const BASE: Record<string, { label: string; style: React.CSSProperties }> = {
  admin: { label: "Admin", style: { color: "var(--v2-up)", background: "rgb(16 185 129 / 0.14)" } },
  manager: { label: "Manager", style: { color: "var(--v2-sky)", background: "rgb(59 130 246 / 0.14)" } },
  lead: { label: "Team leader", style: { color: "#fbbf24", background: "rgb(245 158 11 / 0.14)" } },
  chatter: { label: "Chatteur", style: { color: "var(--color-fg)", background: "rgb(255 255 255 / 0.07)" } },
  model: { label: "Modèle", style: { color: "#f472b6", background: "rgb(244 114 182 / 0.14)" } },
};
const STATUS: Record<Emp["status"], string> = { active: "", off: "accès coupé", pending: "pas encore connecté" };
const seesAll = (base: string) => base === "admin" || base === "manager";
const span = (ms: number) => {
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
};

/** Les modèles d'une personne, plateforme par plateforme (cases à cocher), ou « toutes ». */
function ModelPicker({ models, all, setAll, picked, setPicked, canAll }: { models: M[]; all: boolean; setAll: (v: boolean) => void; picked: Set<string>; setPicked: (s: Set<string>) => void; canAll: boolean }) {
  const side = (mym: boolean) => {
    const list = models.filter((m) => m.mym === mym);
    if (!list.length) return null;
    const allOn = list.every((m) => picked.has(m.id));
    return (
      <div key={String(mym)} className="mt-3">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-muted"><span className="v2-dot" data-pf={mym ? "mym" : "of"} />{mym ? "MYM" : "OnlyFans"}<button type="button" onClick={() => setPicked(new Set(allOn ? [...picked].filter((id) => !list.some((m) => m.id === id)) : [...picked, ...list.map((m) => m.id)]))} className="ml-auto font-semibold underline-offset-2 hover:underline" style={{ color: "var(--v2-sky)" }}>{allOn ? "Tout décocher" : "Tout cocher"}</button></p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {list.map((m) => {
            const on = picked.has(m.id);
            return <button key={m.id} type="button" aria-pressed={on} onClick={() => { const s = new Set(picked); if (on) s.delete(m.id); else s.add(m.id); setPicked(s); }} className="v2-seg border" data-on={on} style={{ borderColor: on ? "var(--v2-blue)" : "var(--color-line)", height: 30 }}>{on ? <Check className="size-3" /> : null}{m.name}</button>;
          })}
        </div>
      </div>
    );
  };
  return (
    <div>
      {canAll ? <label className="flex cursor-pointer items-start gap-2.5 text-[13px]"><Switch on={all} onChange={setAll} /><span><b>Toutes les modèles</b><span className="mt-0.5 block text-[11.5px] text-muted">OnlyFans et MYM, y compris celles qui seront ajoutées plus tard.</span></span></label> : null}
      {all && canAll ? null : <>{side(false)}{side(true)}{!models.length ? <p className="mt-3 text-[12.5px] text-muted">Aucune modèle.</p> : null}</>}
    </div>
  );
}

export function V2TeamAccess() {
  const [d, setD] = useState<Staff | null>(null);
  const [models, setModels] = useState<M[]>([]);
  const [roles, setRoles] = useState<Roles | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"people" | "roles">("people");
  const [group, setGroup] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [model, setModel] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [win, setWin] = useState<Win>(null);
  const load = useCallback(() => api<Staff>("GET", "/api/staff").then((r) => (setD(r), setErr(""))).catch((e) => setErr(errText(e))), []);
  const loadRoles = useCallback(() => api<Roles>("GET", "/api/staff/roles").then(setRoles).catch(() => setRoles(null)), []);
  useEffect(() => {
    void load();
    void loadRoles();
    api<{ models: M[] }>("GET", "/api/v2/team/models").then((r) => setModels(r.models)).catch(() => {});
  }, [load, loadRoles]);

  const canEdit = !!d?.canEdit;
  const known = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const root = d?.groups.find((g) => g.parentId == null)?.id ?? null;
  const below = useCallback((id: number): number[] => [id, ...(d?.groups ?? []).filter((g) => g.parentId === id).flatMap((g) => below(g.id))], [d]);
  const inGroup = group == null ? null : new Set(below(group));
  const word = q.trim().toLowerCase();
  const rows = (d?.employees ?? []).filter((e) => (!inGroup || inGroup.has(e.groupId ?? root ?? -1)) && (!word || `${e.name} ${e.discord ?? ""}`.toLowerCase().includes(word)) && (!role || String(e.roleId) === role) && (!status || e.status === status) && (!model || e.allCreators || e.creators.includes(model)));
  const groupName = (id: number | null) => d?.groups.find((g) => g.id === (id ?? root))?.name ?? "—";
  const depth = (g: Group): number => (g.parentId == null ? 0 : 1 + depth(d!.groups.find((x) => x.id === g.parentId) ?? { id: 0, name: "", parentId: null }));
  const tree = useMemo(() => {
    const out: Group[] = [];
    const walk = (parent: number | null) => (d?.groups ?? []).filter((g) => g.parentId === parent).sort((a, b) => a.name.localeCompare(b.name, "fr")).forEach((g) => (out.push(g), walk(g.id)));
    walk(null);
    return out;
  }, [d]);
  const apply = (r: { employees: Emp[]; groups?: Group[] }) => setD((x) => (x ? { ...x, employees: r.employees, groups: r.groups ?? x.groups } : x));
  const batch = async (action: string, ids: number[], extra: Record<string, unknown> = {}, ok = "Enregistré") => {
    const r = await api<{ employees: Emp[] }>("POST", "/api/staff/batch", { action, ids, ...extra });
    apply(r);
    setPicked(new Set());
    toast(ok);
    void loadRoles();
  };
  const ask = (title: string, text: string, button: string, go: () => Promise<unknown>) => setWin({ kind: "confirm", title, text, button, go });
  const names = (ids: number[]) => {
    const l = (d?.employees ?? []).filter((e) => ids.includes(e.id)).map((e) => e.name);
    return l.length <= 3 ? l.join(", ") : `${l.slice(0, 3).join(", ")} et ${l.length - 3} autre${l.length - 3 > 1 ? "s" : ""}`;
  };
  const off = (ids: number[]) => ask(`Couper l’accès de ${names(ids)} ?`, "La personne est déconnectée tout de suite et ne peut plus ouvrir Bloom. Rien n’est effacé : tu peux lui rendre l’accès à tout moment.", "Couper l’accès", () => batch("deactivate", ids, {}, "Accès coupé"));
  const drop = (ids: number[]) => ask(`Supprimer ${names(ids)} ?`, "La personne sort de l’équipe et perd son accès. Ses anciens messages et ses ventes gardent son nom. Pour revenir, il faudra l’inviter à nouveau.", "Supprimer", () => batch("delete", ids, {}, ids.length > 1 ? "Personnes supprimées" : "Personne supprimée"));
  const n = picked.size;
  const ids = [...picked];
  const allOn = rows.length > 0 && rows.every((e) => picked.has(e.id));
  const toggle = (id: number) => setPicked((s) => {
    const x = new Set(s);
    if (x.has(id)) x.delete(id);
    else x.add(id);
    return x;
  });
  const modelsOf = (e: Emp) => {
    if (e.allCreators) return <span style={{ color: "var(--v2-sky)" }}>Toutes les modèles</span>;
    const list = e.creators.map((id) => known.get(id)).filter((m): m is M => !!m);
    if (!list.length) return <span className="text-muted">aucune</span>;
    return <span className="flex flex-wrap gap-1">{list.slice(0, 4).map((m) => <span key={m.id} className="v2-tag max-w-[130px]"><span className="v2-dot" data-pf={m.mym ? "mym" : "of"} style={{ width: 6, height: 6 }} /><span className="truncate">{m.name}</span></span>)}{list.length > 4 ? <span className="v2-tag">+{list.length - 4}</span> : null}</span>;
  };
  const field = "v2-field";

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Équipe · OnlyFans et MYM</p>
          <h1 className="v2-h1 mt-1">Accès</h1>
        </div>
        {canEdit && tab === "people" ? <button type="button" onClick={() => setWin({ kind: "person", e: null })} className="v2-btn" style={{ height: 36 }}><UserPlus className="size-4" />Inviter quelqu’un</button> : null}
        {roles?.canEdit && tab === "roles" ? <button type="button" onClick={() => setWin({ kind: "role", r: null })} className="v2-btn" style={{ height: 36 }}>Nouveau rôle</button> : null}
      </div>
      <div className="v2-rise v2-noscroll mt-4 overflow-x-auto border-b" style={{ borderColor: "var(--color-line)", ["--i" as string]: 1 }}>
        <div className="v2-tabs">
          <button type="button" className="v2-tab" data-on={tab === "people"} onClick={() => setTab("people")}>Personnes<span className="v2-num ml-1.5 opacity-60">{d ? int(d.employees.length) : ""}</span></button>
          {roles ? <button type="button" className="v2-tab" data-on={tab === "roles"} onClick={() => setTab("roles")}>Rôles<span className="v2-num ml-1.5 opacity-60">{int(roles.roles.length)}</span></button> : null}
        </div>
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}

      {tab === "people" ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Les groupes */}
          <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 2 }}>
            <div className="v2-card p-1.5">
              <p className="flex items-center justify-between px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase">Groupes</p>
              <div className="space-y-0.5">
                <button type="button" onClick={() => setGroup(null)} className="v2-pick w-full" data-on={group == null} aria-pressed={group == null}><Users className="size-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate text-[13px] font-bold">Toute l’équipe</span><span className="v2-num text-[11.5px] text-muted">{d ? int(d.employees.length) : ""}</span></button>
                {tree.map((g) => {
                  const inside = new Set(below(g.id));
                  const count = (d?.employees ?? []).filter((e) => inside.has(e.groupId ?? root ?? -1)).length;
                  return (
                    <div key={g.id} className="flex items-center rounded-[10px]" style={group === g.id ? { background: "rgb(59 130 246 / 0.13)", boxShadow: "inset 2px 0 0 var(--v2-blue)" } : undefined}>
                      <button type="button" onClick={() => setGroup(g.id)} aria-pressed={group === g.id} className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] py-1.5 pr-2 text-left transition-colors hover:bg-white/[0.04]" style={{ paddingLeft: 10 + depth(g) * 14 }}>
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{g.name}</span><span className="v2-num text-[11.5px] text-muted">{int(count)}</span>
                      </button>
                      {canEdit ? (
                        <RowMenu
                          name={`grp-${g.id}`}
                          items={[
                            { label: "Ajouter un sous-groupe", go: () => setWin({ kind: "group", g: null, parentId: g.id }) },
                            { label: "Renommer", go: () => setWin({ kind: "group", g, parentId: null }) },
                            ...(g.parentId != null ? [{ label: "Supprimer", danger: true, go: () => ask(`Supprimer le groupe « ${g.name} » ?`, "Ses membres et ses sous-groupes remontent dans le groupe du dessus. Personne ne perd son accès.", "Supprimer le groupe", async () => {
                              apply(await api<{ employees: Emp[]; groups: Group[] }>("POST", "/api/staff/groups", { id: g.id, delete: true }));
                              if (group === g.id) setGroup(null);
                              toast("Groupe supprimé");
                            }) }] : []),
                          ]}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="v2-rise min-w-0" style={{ ["--i" as string]: 3 }}>
            <div className="v2-card p-3">
              <div className="flex flex-wrap items-center gap-2 px-1">
                <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border px-2.5" style={{ borderColor: "var(--color-line)" }}>
                  <Search className="size-3.5 shrink-0 text-muted" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou pseudo Discord" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-[#5d5d66]" />
                  {q ? <button type="button" onClick={() => setQ("")} aria-label="Effacer la recherche" className="text-muted hover:text-(--color-fg)"><X className="size-3.5" /></button> : null}
                </label>
                <div className="w-[170px]"><select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rôle" className={field} style={{ height: 36, colorScheme: "dark", fontSize: 12.5 }}><option value="" style={{ background: "#121215" }}>Tous les rôles</option>{(d?.roles ?? []).map((r) => <option key={r.id} value={r.id} style={{ background: "#121215" }}>{r.name}</option>)}</select></div>
                <div className="w-[160px]"><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut" className={field} style={{ height: 36, colorScheme: "dark", fontSize: 12.5 }}><option value="" style={{ background: "#121215" }}>Tous les statuts</option><option value="active" style={{ background: "#121215" }}>Actifs</option><option value="off" style={{ background: "#121215" }}>Accès coupé</option><option value="pending" style={{ background: "#121215" }}>Pas encore connectés</option></select></div>
                <ModelMenu all={models} value={model} onChange={setModel} />
              </div>
              <div className="v2-scroll mt-3 overflow-x-auto" hidden={!rows.length}>
                <table className="w-full min-w-[820px] text-[12.5px]">
                  <thead>
                    <tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}>
                      <th className="w-9 py-2.5 pl-2 text-left"><button type="button" onClick={() => setPicked(allOn ? new Set() : new Set(rows.map((e) => e.id)))} className="v2-check" data-on={allOn} aria-label={allOn ? "Tout désélectionner" : "Tout sélectionner"}>{allOn ? <Check className="size-3" /> : null}</button></th>
                      <th className="px-3 py-2.5 text-left font-semibold">Personne</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Rôle</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Modèles</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Groupe</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => {
                      const on = picked.has(e.id);
                      const me = e.id === d?.me;
                      const b = BASE[e.base] ?? BASE.chatter;
                      return (
                        <tr key={e.id} className="border-b" style={{ borderColor: "rgb(255 255 255 / 0.05)", background: on ? "rgb(59 130 246 / 0.08)" : undefined, opacity: e.status === "off" ? 0.55 : 1 }}>
                          <td className="py-2 pl-2"><button type="button" onClick={() => toggle(e.id)} className="v2-check" data-on={on} aria-label={on ? `Retirer ${e.name} de la sélection` : `Sélectionner ${e.name}`}>{on ? <Check className="size-3" /> : null}</button></td>
                          <td className="px-3 py-2">
                            <span className="flex min-w-0 items-center gap-2.5">
                              <Avatar src={e.avatar} name={e.name} size="size-8" />
                              <span className="min-w-0">
                                <b className="block max-w-[220px] truncate text-[13px] leading-tight">{e.name}{me ? <span className="ml-1.5 font-normal text-muted">(toi)</span> : null}</b>
                                <span className="mt-0.5 block max-w-[240px] truncate text-[11.5px] text-muted">{e.discord ? `@${e.discord}` : "—"}{STATUS[e.status] ? <span style={{ color: e.status === "off" ? "var(--v2-down)" : "#fbbf24" }}> · {STATUS[e.status]}</span> : null}</span>
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2"><span className="v2-tag" style={b.style} title={`Type de rôle : ${b.label}`}>{e.roleName}</span></td>
                          <td className="px-3 py-2">{seesAll(e.base) ? <span className="text-muted">Toutes (rôle)</span> : modelsOf(e)}</td>
                          <td className="max-w-[150px] truncate px-3 py-2 text-muted">{groupName(e.groupId)}</td>
                          <td className="pr-1 text-right">
                            <RowMenu
                              name={`emp-${e.id}`}
                              items={[
                                ...(canEdit ? [{ label: "Modifier", go: () => setWin({ kind: "person", e }) }] : []),
                                ...(!seesAll(e.base) && (canEdit || e.base === "chatter") ? [{ label: "Donner des modèles", go: () => setWin({ kind: "models", ids: [e.id], e }) }] : []),
                                { label: "Ses chiffres", go: () => setWin({ kind: "stats", e }) },
                                ...(canEdit && !me ? [e.status === "off" ? { label: "Rendre l’accès", go: () => void batch("activate", [e.id], {}, "Accès rendu").catch((x) => toast(errText(x), "err")) } : { label: "Couper l’accès", danger: true, go: () => off([e.id]) }, { label: "Supprimer", danger: true, go: () => drop([e.id]) }] : []),
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {d && !rows.length ? <p className="py-12 text-center text-[13px] text-muted">Personne ne correspond.</p> : null}
              {!d && !err ? <p className="py-12 text-center text-[13px] text-muted">Chargement…</p> : null}
              <p className="mt-3 border-t px-1 pt-2.5 text-[11.5px] leading-relaxed text-muted" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>
                Chacun se connecte avec Discord. Les droits passent par le rôle (ce que la personne peut faire) et par ses modèles (sur qui elle travaille) : rien ne se coche personne par personne. Les admins et les managers voient toutes les modèles. Un team leader peut donner ses propres modèles à ses chatteurs.
              </p>
            </div>
            {n ? (
              <div className="sticky bottom-4 z-20 mt-4 px-2">
                <div className="v2-card mx-auto flex max-w-[900px] flex-wrap items-center gap-2 px-3.5 py-2.5" style={{ background: "#121215", borderColor: "rgb(59 130 246 / 0.45)", boxShadow: "0 24px 60px -18px rgb(0 0 0 / 0.95)" }}>
                  <b className="text-[13px]">{plural(n, "personne")} choisie{n > 1 ? "s" : ""}</b>
                  <button type="button" onClick={() => setPicked(new Set())} className="v2-tool">Tout désélectionner</button>
                  <span className="flex-1" />
                  <button type="button" onClick={() => setWin({ kind: "models", ids, e: null })} className="v2-btn" data-kind="ghost" style={{ height: 34 }}>Donner des modèles</button>
                  {canEdit ? (
                    <>
                      <button type="button" onClick={() => setWin({ kind: "pick", what: "role", ids })} className="v2-btn" data-kind="ghost" style={{ height: 34 }}>Changer le rôle</button>
                      <button type="button" onClick={() => setWin({ kind: "pick", what: "group", ids })} className="v2-btn" data-kind="ghost" style={{ height: 34 }}>Changer de groupe</button>
                      <button type="button" onClick={() => void batch("activate", ids, {}, "Accès rendu").catch((x) => toast(errText(x), "err"))} className="v2-btn" data-kind="ghost" style={{ height: 34 }}>Rendre l’accès</button>
                      <button type="button" onClick={() => off(ids)} className="v2-btn" data-kind="ghost" style={{ height: 34, color: "var(--v2-down)" }}>Couper l’accès</button>
                      <button type="button" onClick={() => drop(ids)} className="v2-btn" data-kind="danger" style={{ height: 34 }}>Supprimer</button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === "roles" && roles ? (
        <section className="v2-card v2-rise mt-4 p-3">
          <p className="px-1 text-[12.5px] text-muted">Un rôle = un nom, un type (ce que Bloom autorise : modèles vues, envois, réglages) et les pages ouvertes. {roles.canEdit ? "" : "Seuls les admins créent et modifient les rôles."}</p>
          <div className="v2-scroll mt-2 overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead><tr className="border-b text-muted" style={{ borderColor: "var(--color-line)" }}><th className="px-3 py-2.5 text-left font-semibold">Rôle</th><th className="px-3 py-2.5 text-left font-semibold">Description</th><th className="px-3 py-2.5 text-left font-semibold">Personnes</th><th className="px-3 py-2.5 text-left font-semibold">Actif</th><th className="w-10" /></tr></thead>
              <tbody>
                {roles.roles.map((r) => {
                  const b = BASE[r.base] ?? BASE.chatter;
                  const locked = r.system && r.base === "admin";
                  return (
                    <tr key={r.id} className="border-b" style={{ borderColor: "rgb(255 255 255 / 0.05)", opacity: r.active ? 1 : 0.55 }}>
                      <td className="px-3 py-2.5"><b className="block text-[13px]">{r.name}</b><span className="v2-tag mt-1" style={b.style}>{b.label}</span></td>
                      <td className="max-w-[300px] px-3 py-2.5 text-muted"><span className="line-clamp-2">{r.description || "—"}</span></td>
                      <td className="max-w-[320px] px-3 py-2.5"><span className="line-clamp-2" title={r.users.join(", ")}>{r.users.length ? r.users.join(", ") : <span className="text-muted">personne</span>}</span></td>
                      <td className="px-3 py-2.5">
                        <Switch on={r.active} disabled={!roles.canEdit || locked} title={locked ? "Le rôle Admin ne peut pas être coupé" : undefined} onChange={(on) => {
                          const go = async () => {
                            await api("POST", "/api/staff/roles", { id: r.id, active: on });
                            toast(on ? "Rôle rallumé" : "Rôle coupé");
                            await loadRoles();
                          };
                          if (on) void go().catch((x) => toast(errText(x), "err"));
                          else ask(`Couper le rôle « ${r.name} » ?`, `${r.users.length ? `${plural(r.users.length, "personne")} l’${r.users.length > 1 ? "ont" : "a"} : elles seront déconnectées` : "Les personnes qui l’ont seront déconnectées"} jusqu’à ce qu’il soit rallumé.`, "Couper le rôle", go);
                        }} />
                      </td>
                      <td className="pr-1 text-right">
                        {roles.canEdit ? (
                          <RowMenu
                            name={`role-${r.id}`}
                            items={[
                              { label: "Modifier", go: () => setWin({ kind: "role", r }) },
                              ...(r.system ? [] : [{ label: "Supprimer", danger: true, go: () => ask(`Supprimer le rôle « ${r.name} » ?`, "Un rôle encore donné à quelqu’un ne peut pas être supprimé : donne-lui d’abord un autre rôle.", "Supprimer le rôle", async () => {
                                await api("POST", "/api/staff/roles", { id: r.id, delete: true });
                                toast("Rôle supprimé");
                                await loadRoles();
                                await load();
                              }) }]),
                            ]}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {win?.kind === "person" && d ? <PersonForm e={win.e} d={d} models={models} group={group ?? root} onClose={() => setWin(null)} onDone={(r, added) => (apply(r), setWin(null), toast(added ? "Invitation enregistrée : l’accès commence à sa première connexion avec Discord" : "Enregistré"), void loadRoles())} /> : null}
      {win?.kind === "models" && d ? <ModelsForm e={win.e} count={win.ids.length} models={models} canAll={canEdit} onClose={() => setWin(null)} go={(all, creators) => batch("creators", win.ids, { all, creators }, "Modèles enregistrées").then(() => setWin(null))} /> : null}
      {win?.kind === "pick" && d ? <PickForm what={win.what} count={win.ids.length} roles={d.roles} groups={tree} onClose={() => setWin(null)} go={(id) => batch(win.what, win.ids, win.what === "role" ? { roleId: id } : { groupId: id }, win.what === "role" ? "Rôle changé" : "Groupe changé").then(() => setWin(null))} /> : null}
      {win?.kind === "group" ? <GroupForm g={win.g} onClose={() => setWin(null)} go={async (name) => (apply(await api<{ employees: Emp[]; groups: Group[] }>("POST", "/api/staff/groups", win.g ? { id: win.g.id, name } : { parentId: win.parentId, name })), setWin(null), toast(win.g ? "Groupe renommé" : "Groupe créé"))} /> : null}
      {win?.kind === "stats" ? <StatsModal e={win.e} onClose={() => setWin(null)} /> : null}
      {win?.kind === "role" && roles ? <RoleForm r={win.r} perms={roles.perms} onClose={() => setWin(null)} onDone={() => (setWin(null), toast("Rôle enregistré : les personnes qui l’ont sont invitées à rafraîchir leur page"), void loadRoles(), void load())} /> : null}
      {win?.kind === "confirm" ? <Confirm title={win.title} text={win.text} button={win.button} go={win.go} onClose={() => setWin(null)} /> : null}
    </div>
  );
}

/** Inviter quelqu'un (par son pseudo Discord) ou modifier une personne : nom, rôle, groupe, modèles. */
function PersonForm({ e, d, models, group, onClose, onDone }: { e: Emp | null; d: Staff; models: M[]; group: number | null; onClose: () => void; onDone: (r: { employees: Emp[] }, added: boolean) => void }) {
  const [name, setName] = useState(e?.name ?? "");
  const [discord, setDiscord] = useState("");
  const [roleId, setRoleId] = useState<number>(e?.roleId ?? d.roles.find((r) => r.base === "chatter")?.id ?? d.roles[0]?.id ?? 0);
  const [groupId, setGroupId] = useState<number | null>(e?.groupId ?? group);
  const [all, setAll] = useState(!!e?.allCreators);
  const known = new Set(models.map((m) => m.id));
  const [picked, setPicked] = useState<Set<string>>(new Set((e?.creators ?? []).filter((id) => known.has(id))));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const base = d.roles.find((r) => r.id === roleId)?.base ?? "chatter";
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      // Les modèles que cette fenêtre ne montre pas (compte MYM pas encore relié…) sont renvoyées telles quelles.
      const others = (e?.creators ?? []).filter((id) => !known.has(id));
      onDone(await api<{ employees: Emp[] }>("POST", "/api/staff/employee", { id: e?.id, name: name.trim(), discord: e ? undefined : discord, groupId, roleId, all, creators: [...others, ...picked] }), !e);
    } catch (x) {
      setErr(errText(x));
      setBusy(false);
    }
  };
  return (
    <Modal wide sticky title={e ? `Modifier ${e.name}` : "Inviter quelqu’un"} sub={e ? undefined : "La personne aura accès à Bloom dès sa première connexion avec Discord."} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        {e ? null : (
          <div>
            <label className="v2-label" htmlFor="pf-discord">Pseudo Discord</label>
            <input id="pf-discord" autoFocus value={discord} onChange={(x) => setDiscord(x.target.value)} placeholder="jean.dupont" className="v2-field" />
            <p className="mt-1 text-[11.5px] text-muted">Celui avec lequel elle se connecte à Discord (pas son surnom sur le serveur).</p>
          </div>
        )}
        <div>
          <label className="v2-label" htmlFor="pf-name">Nom affiché</label>
          <input id="pf-name" value={name} maxLength={60} onChange={(x) => setName(x.target.value)} placeholder="Ex : Julie (matin)" className="v2-field" />
          <p className="mt-1 text-[11.5px] text-muted">Le nom que l’équipe voit. Les anciens messages et ventes gardent l’ancien nom.</p>
        </div>
        <div>
          <label className="v2-label" htmlFor="pf-role">Rôle</label>
          <select id="pf-role" value={roleId} onChange={(x) => setRoleId(Number(x.target.value))} disabled={e?.id === d.me} className="v2-field" style={{ colorScheme: "dark" }}>{d.roles.map((r) => <option key={r.id} value={r.id} style={{ background: "#121215" }}>{r.name}</option>)}</select>
          {e?.id === d.me ? <p className="mt-1 text-[11.5px] text-muted">Tu ne peux pas changer ton propre rôle.</p> : null}
        </div>
        <div>
          <label className="v2-label" htmlFor="pf-group">Groupe</label>
          <select id="pf-group" value={groupId ?? ""} onChange={(x) => setGroupId(Number(x.target.value) || null)} className="v2-field" style={{ colorScheme: "dark" }}>{d.groups.map((g) => <option key={g.id} value={g.id} style={{ background: "#121215" }}>{g.name}</option>)}</select>
        </div>
      </div>
      <p className="v2-label mt-4">Modèles</p>
      {seesAll(base) ? <p className="text-[12.5px] text-muted">Ce rôle voit toutes les modèles.</p> : <ModelPicker models={models} all={all} setAll={setAll} picked={picked} setPicked={setPicked} canAll />}
      {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void save()} disabled={busy || !name.trim() || (!e && !discord.trim())} className="v2-btn">{busy ? "Enregistrement…" : e ? "Enregistrer" : "Inviter"}</button>
      </div>
    </Modal>
  );
}

/** Donner des modèles à une ou plusieurs personnes (remplace leur liste, sauf les modèles que cette fenêtre ne montre pas). */
function ModelsForm({ e, count, models, canAll, onClose, go }: { e: Emp | null; count: number; models: M[]; canAll: boolean; onClose: () => void; go: (all: boolean, creators: string[]) => Promise<unknown> }) {
  const known = new Set(models.map((m) => m.id));
  const [all, setAll] = useState(!!e?.allCreators && canAll);
  const [picked, setPicked] = useState<Set<string>>(new Set((e?.creators ?? []).filter((id) => known.has(id))));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await go(all && canAll, [...picked]);
    } catch (x) {
      toast(errText(x), "err");
      setBusy(false);
    }
  };
  return (
    <Modal wide sticky title={e ? `Les modèles de ${e.name}` : `Donner des modèles à ${plural(count, "personne")}`} sub={canAll ? "La liste cochée remplace la liste actuelle. Les admins et managers gardent toutes les modèles." : "Tu ne vois ici que tes propres modèles : celles que tu ne vois pas ne changent pas."} onClose={onClose}>
      <ModelPicker models={models} all={all} setAll={setAll} picked={picked} setPicked={setPicked} canAll={canAll} />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void save()} disabled={busy} className="v2-btn">{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

function PickForm({ what, count, roles, groups, onClose, go }: { what: "role" | "group"; count: number; roles: RoleOpt[]; groups: Group[]; onClose: () => void; go: (id: number) => Promise<unknown> }) {
  const list = what === "role" ? roles : groups;
  const [id, setId] = useState<number>(list[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await go(id);
    } catch (x) {
      toast(errText(x), "err");
      setBusy(false);
    }
  };
  return (
    <Modal title={what === "role" ? `Changer le rôle de ${plural(count, "personne")}` : `Changer ${plural(count, "personne")} de groupe`} onClose={onClose}>
      <label className="v2-label" htmlFor="pk-id">{what === "role" ? "Nouveau rôle" : "Nouveau groupe"}</label>
      <select id="pk-id" value={id} onChange={(x) => setId(Number(x.target.value))} className="v2-field" style={{ colorScheme: "dark" }}>{list.map((r) => <option key={r.id} value={r.id} style={{ background: "#121215" }}>{r.name}</option>)}</select>
      {what === "role" ? <p className="mt-2 text-[12px] text-muted">Les personnes concernées sont invitées à rafraîchir leur page.</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void save()} disabled={busy || !id} className="v2-btn">{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

function GroupForm({ g, onClose, go }: { g: Group | null; onClose: () => void; go: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState(g?.name ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await go(name.trim());
    } catch (x) {
      toast(errText(x), "err");
      setBusy(false);
    }
  };
  return (
    <Modal title={g ? "Renommer le groupe" : "Nouveau sous-groupe"} sub="Un groupe sert à ranger l’équipe (par équipe, par horaire…). Il ne change aucun droit." onClose={onClose}>
      <label className="v2-label" htmlFor="gr-name">Nom du groupe</label>
      <input id="gr-name" autoFocus value={name} maxLength={40} onChange={(x) => setName(x.target.value)} onKeyDown={(x) => x.key === "Enter" && name.trim() && !busy && void save()} placeholder="Ex : Équipe de nuit" className="v2-field" />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void save()} disabled={busy || !name.trim()} className="v2-btn">{busy ? "Enregistrement…" : g ? "Renommer" : "Créer le groupe"}</button>
      </div>
    </Modal>
  );
}

/** Ce qu'une personne a fait dans Bloom sur 30 jours. */
function StatsModal({ e, onClose }: { e: Emp; onClose: () => void }) {
  const [s, setS] = useState<PersonStats | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let off = false;
    api<PersonStats>("GET", `/api/v2/team/person?id=${e.id}`).then((r) => void (!off && setS(r))).catch((x) => void (!off && setErr(errText(x))));
    return () => {
      off = true;
    };
  }, [e.id]);
  const tile = (label: string, value: string, sub: string) => (
    <div className="min-w-0 rounded-[12px] border px-3.5 py-2.5" style={{ borderColor: "var(--color-line)" }}>
      <p className="truncate text-[11.5px] font-semibold text-muted">{label}</p>
      <p className="v2-num mt-0.5 truncate text-[19px] leading-tight font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub}</p>
    </div>
  );
  return (
    <Modal wide title={e.name} sub="Ce qu’elle a fait dans Bloom sur les 30 derniers jours." onClose={onClose}>
      {err ? <p className="text-[13px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      {!s && !err ? <p className="py-10 text-center text-[13px] text-muted">Chargement…</p> : null}
      {s ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {tile("Messages envoyés", int(s.messages), s.messages ? `sur ${plural(s.models, "modèle")} · dernier le ${s.lastMessage ? dateOf(s.lastMessage) : "—"}` : "aucun depuis Bloom")}
            {tile("Contenus payants proposés", int(s.ppv), s.messages ? `${((s.ppv / s.messages) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % de ses messages` : " ")}
            {tile("Temps sur le chat", span(s.activeMs), s.days ? `sur ${plural(s.days, "jour")} · ${span(s.idleMs)} ailleurs dans Bloom` : "pas de relevé")}
            {tile("Ventes OnlyFans", cash(s.of.net, "USD"), s.of.sales ? `${plural(s.of.sales, "vente")} · net` : "aucune vente")}
            {tile("Ventes MYM", cash(s.mym.net, "EUR"), s.mym.sales ? `${plural(s.mym.sales, "vente")} · net` : "aucune vente")}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted">Ne compte que ce qui est fait depuis Bloom : une vente lui revient quand le message acheté (ou le dernier message avant un pourboire côté MYM) est parti de Bloom sous son nom. Le détail est dans « Ventes », « Messages » et « Shifts ».</p>
        </>
      ) : null}
      <div className="mt-5 flex justify-end"><button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Fermer</button></div>
    </Modal>
  );
}

/** Créer ou modifier un rôle (admins) : nom, type, pages ouvertes. */
const BASES: [string, string][] = [["admin", "Admin"], ["manager", "Manager"], ["lead", "Team leader"], ["chatter", "Chatteur"], ["model", "Modèle"]];
function RoleForm({ r, perms, onClose, onDone }: { r: Role | null; perms: Perm[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(r?.name ?? "");
  const [description, setDescription] = useState(r?.description ?? "");
  const [base, setBase] = useState(r?.base ?? "chatter");
  const [on, setOn] = useState<Set<string>>(new Set(r?.perms ?? perms.map((p) => p.key)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const locked = !!r?.system && r.base === "admin";
  const mine = perms.filter((p) => p.bases.includes(base));
  const groups = [...new Set(mine.map((p) => p.group))];
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const keys = mine.filter((p) => on.has(p.key)).map((p) => p.key);
      await api("POST", "/api/staff/roles", { id: r?.id, name: name.trim(), description, base, perms: locked || keys.length === mine.length ? null : keys });
      onDone();
    } catch (x) {
      setErr(errText(x));
      setBusy(false);
    }
  };
  return (
    <Modal wide sticky title={r ? `Modifier le rôle « ${r.name} »` : "Nouveau rôle"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="v2-label" htmlFor="rl-name">Nom du rôle</label><input id="rl-name" autoFocus value={name} maxLength={40} onChange={(x) => setName(x.target.value)} placeholder="Ex : Chatteur de nuit" className="v2-field" /></div>
        <div>
          <label className="v2-label" htmlFor="rl-base">Type</label>
          <select id="rl-base" value={base} onChange={(x) => setBase(x.target.value)} disabled={!!r?.system} className="v2-field" style={{ colorScheme: "dark" }}>{BASES.map(([k, l]) => <option key={k} value={k} style={{ background: "#121215" }}>{l}</option>)}</select>
        </div>
        <div className="sm:col-span-2"><label className="v2-label" htmlFor="rl-desc">Description</label><input id="rl-desc" value={description} maxLength={200} onChange={(x) => setDescription(x.target.value)} placeholder="À quoi sert ce rôle" className="v2-field" /></div>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">Le type décide de ce que Bloom autorise derrière les écrans : admin et manager voient toutes les modèles, un team leader pilote ses chatteurs, un chatteur chatte sur ses modèles, une modèle ne voit que son chiffre.</p>
      <p className="v2-label mt-4">Pages ouvertes <span className="font-normal">(version actuelle de Bloom)</span></p>
      {locked ? <p className="text-[12.5px] text-muted">Le rôle Admin a toujours tous les accès.</p> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((g) => {
            const list = mine.filter((p) => p.group === g);
            return (
              <div key={g} className="rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)" }}>
                <p className="text-[12px] font-bold">{g}</p>
                <div className="mt-1.5 space-y-1">
                  {list.map((p) => <label key={p.key} className="flex cursor-pointer items-center gap-2 text-[12.5px]"><input type="checkbox" checked={on.has(p.key)} onChange={() => setOn((s) => { const x = new Set(s); if (x.has(p.key)) x.delete(p.key); else x.add(p.key); return x; })} className="size-3.5 accent-(--v2-blue)" />{p.label}</label>)}
                </div>
              </div>
            );
          })}
          {!groups.length ? <p className="text-[12.5px] text-muted">Aucune page à régler pour ce type de rôle.</p> : null}
        </div>
      )}
      <p className="mt-2 text-[11.5px] leading-relaxed text-muted">Ces cases ouvrent ou ferment les pages de la version actuelle. Dans la nouvelle version, les écrans suivent pour l’instant le type du rôle.</p>
      {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void save()} disabled={busy || !name.trim()} className="v2-btn">{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}
