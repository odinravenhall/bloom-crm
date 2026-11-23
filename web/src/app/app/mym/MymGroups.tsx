"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, Clock, Copy, Pencil, Percent, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";
import { GROUP_ICONS, groupIcon } from "./groupIcons";

// MYM → Fans → Groupes : copie de « Mes groupes » de MyPulse. Les groupes sont à NOUS (Bloom) : manuels, ou automatiques
// par CA cumulé avec critères (ancienneté, taux d'achats), remise à zéro automatique.
type G = {
  id: number; kind: "manual" | "auto"; name: string; color: string | null; icon: string | null; min: number | null; max: number | null; noPay: boolean; ppvOnly: boolean;
  ageMin: number | null; ageMax: number | null; rateMin: number | null; rateMax: number | null; ratePpv: number | null; reset: string; resetDay: number | null; resetHour: string | null; stayHours: number | null;
  count: number; active: number; expired: number; revenue: number; preview: { active: P[]; old: P[] };
};
type P = { fanId: string; name: string; avatar: string | null };
type Resp = { platform: string; fans: number; lists: G[] };
const TEAL = "#0ab39c";
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const eur = (v: number) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/ | /g, " ")} €`;

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-medium" style={{ borderColor: "#5a6068", color: "var(--mp-head)" }}>{children}</span>;
}
function Bubbles({ list, more, color }: { list: P[]; more: number; color: string }) {
  return (
    <span className="mt-1 flex flex-wrap items-center">
      {list.slice(0, 50).map((p) => (
        <span key={p.fanId} title={p.name} className="-mr-1.5 grid size-6 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-[var(--mp-card)]" style={{ background: color }}>{p.name.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0).toUpperCase() || "?"}</span>
      ))}
      {more > 0 ? <span className="ml-3 text-[11px]" style={{ color: "var(--mp-muted)" }}>+{more}</span> : null}
    </span>
  );
}

export function MymGroups() {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [d, setD] = useState<Resp | null>(null);
  const [edit, setEdit] = useState<Partial<G> | null>(null);
  const [ca, setCa] = useState<G | null>(null);
  const load = useCallback(() => {
    if (!creatorId) return;
    api<Resp>("GET", `/api/fanlists?creatorId=${encodeURIComponent(creatorId)}`).then(setD).catch((e) => toast((e as Error).message, "err"));
  }, [creatorId]);
  useEffect(() => {
    setD(null);
    load();
  }, [load]);
  const post = async (path: string, b: Record<string, unknown>, ok?: string) => {
    try {
      const r = await api<Resp>("POST", path, { creatorId, ...b });
      setD(r);
      if (ok) toast(ok);
      return true;
    } catch (e) {
      toast((e as Error).message, "err");
      return false;
    }
  };
  const lists = (d?.lists ?? []).filter((l) => l.kind === "manual" || l.kind === "auto");

  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[18px] font-semibold" style={{ color: "var(--mp-head)" }}>Mes groupes</h1>
        <span className="flex h-8 items-center gap-2 rounded-md px-2 text-[12px]" style={{ background: "var(--mp-card)" }}>
          <Avatar src={creator?.avatar} name={creator?.name} size="size-5" />
          <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="bg-transparent outline-none">
            {creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}
          </select>
        </span>
        <span className="flex-1" />
        <button onClick={() => (load(), toast("Groupes recalculés"))} className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px]" style={{ borderColor: "#405189", color: "#6f86d6" }}><RefreshCw className="size-3.5" /> Re-synchroniser</button>
        <button onClick={() => setEdit({ kind: "manual", color: "#364574", icon: "user", reset: "never" })} className="flex h-9 items-center gap-1.5 rounded-md px-4 text-[13px] font-medium text-white" style={{ background: TEAL }}><Plus className="size-4" /> Créer un groupe</button>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg p-3" style={card}>
        <table className="w-full min-w-[1050px] text-[13px]">
          <thead>
            <tr className="text-left" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}>
              {["Nom", "Type", "Couleur", "Bornes CA cumulé (€)", "Membres"].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}
              <th className="px-3 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((g) => {
              const Icon = groupIcon(g.icon);
              const c = g.color || "#364574";
              return (
                <tr key={g.id} className="border-b align-middle" style={{ borderColor: "var(--mp-line)" }}>
                  <td className="px-3 py-4">
                    <span className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full border" style={{ borderColor: "#4a5058" }}><Icon className="size-4" /></span>
                      <span className="font-semibold uppercase" style={{ color: "var(--mp-head)" }}>{g.name}</span>
                    </span>
                  </td>
                  <td className="px-3"><span className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: g.kind === "auto" ? "#299cdb" : "#405189" }}>{g.kind === "auto" ? "Automatique" : "Manuel"}</span></td>
                  <td className="px-3"><span className="rounded-full px-3 py-1 text-[12px] font-semibold text-white" style={{ background: c }}>{c}</span></td>
                  <td className="px-3">
                    {g.kind === "auto" ? (
                      <span className="flex flex-wrap gap-1">
                        <Chip>{g.noPay ? "0 € (sans paiement)" : `${g.min ?? 0} € ⟶ ${g.max == null ? "∞" : `${g.max} €`}`}</Chip>
                        {g.ppvOnly ? <Chip>PPV + pourboires</Chip> : null}
                        {g.ageMin != null || g.ageMax != null ? <Chip><Clock className="size-3" />Ancienneté {g.ageMin != null ? `≥ ${g.ageMin} j` : ""}{g.ageMin != null && g.ageMax != null ? " · " : ""}{g.ageMax != null ? `≤ ${g.ageMax} j` : ""}</Chip> : null}
                        {g.rateMin != null || g.rateMax != null ? <Chip><Percent className="size-3" />Achats {g.rateMin != null ? `≥ ${g.rateMin} %` : ""}{g.rateMax != null ? `≤ ${g.rateMax} %` : ""} (≥ {g.ratePpv || 1} PPV)</Chip> : null}
                      </span>
                    ) : (
                      <span>{g.reset !== "never" ? <Chip><Clock className="size-3" />{g.reset === "after_add" ? `sort après ${g.stayHours} h` : g.reset === "daily" ? `vidé chaque jour ${g.resetHour || "00:00"}` : g.reset === "weekly" ? `vidé chaque ${["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"][g.resetDay || 1]}` : `vidé le ${g.resetDay || 1} du mois`}</Chip> : "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold" style={{ color: TEAL }}>Abonnés ({g.active})</p>
                    {g.active ? <Bubbles list={g.preview.active} more={g.active - g.preview.active.length} color={TEAL} /> : null}
                    {g.expired ? (
                      <>
                        <p className="mt-2 font-semibold" style={{ color: "#f7b84b" }}>Anciens ({g.expired})</p>
                        <Bubbles list={g.preview.old} more={g.expired - g.preview.old.length} color="#f7b84b" />
                      </>
                    ) : null}
                  </td>
                  <td className="px-3 text-right whitespace-nowrap">
                    <span className="inline-flex gap-1">
                      <IconBtn title="Modifier le groupe" onClick={() => setEdit(g)}><Pencil className="size-3.5" /></IconBtn>
                      <IconBtn title="Dupliquer" onClick={() => post("/api/fanlists/duplicate", { id: g.id }, "Groupe dupliqué")}><Copy className="size-3.5" /></IconBtn>
                      <button onClick={() => setCa(g)} className="flex h-7 items-center gap-1 rounded border px-2 text-[11px]" style={{ borderColor: "#405189", color: "#6f86d6" }}><CircleDollarSign className="size-3.5" /> CA groupe</button>
                      <IconBtn title="Supprimer" danger onClick={() => confirm("Êtes-vous sûr de vouloir supprimer ce groupe ?") && post("/api/fanlists/delete", { id: g.id }, "Groupe supprimé")}><Trash2 className="size-3.5" /></IconBtn>
                    </span>
                  </td>
                </tr>
              );
            })}
            {d && !lists.length ? <tr><td colSpan={6} className="py-14 text-center" style={{ color: "var(--mp-muted)" }}>Aucun groupe. Crée le premier avec « Créer un groupe ».</td></tr> : null}
            {!d ? <tr><td colSpan={6} className="py-14 text-center" style={{ color: "var(--mp-muted)" }}>…</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "var(--mp-muted)" }}>Les groupes automatiques se calculent avec ce que Substy dit de chaque fan (abonnement, dépense) et les PPV envoyés depuis Bloom.</p>
      {edit ? <GroupModal g={edit} onClose={() => setEdit(null)} onSave={(list) => post("/api/fanlists/save", { list }, "Groupe enregistré").then((ok) => ok && setEdit(null))} /> : null}
      {ca ? (
        <Modal title={`CA groupe : ${ca.name}`} onClose={() => setCa(null)} footer={<button onClick={() => setCa(null)} className="h-9 rounded-md px-4" style={{ background: "#2f343a" }}>Fermer</button>}>
          <p className="text-[28px] font-semibold" style={{ color: "var(--mp-head)" }}>{eur(ca.revenue)}</p>
          <p className="mt-1">Total dépensé par les {ca.count} fans du groupe ({ca.active} abonnés, {ca.expired} anciens).</p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--mp-muted)" }}>Moyenne par fan : {ca.count ? eur(ca.revenue / ca.count) : "—"}</p>
        </Modal>
      ) : null}
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return <button title={title} onClick={onClick} className="grid size-7 place-items-center rounded border" style={{ borderColor: danger ? "#f06548" : "#405189", color: danger ? "#f06548" : "#6f86d6" }}>{children}</button>;
}

function Modal({ title, children, onClose, footer }: { title: string; children: React.ReactNode; onClose: () => void; footer: React.ReactNode }) {
  return (
    <div className="mp-font fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[460px] overflow-hidden rounded-lg" style={{ background: "#262a2f", color: "var(--mp-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between px-4 py-3.5 text-[15px] font-semibold" style={{ background: "#2b3a4a", color: "var(--mp-head)" }}>{title}<button onClick={onClose}><X className="size-4" /></button></h3>
        <div className="max-h-[75vh] overflow-y-auto px-4 py-4 text-[13px]">{children}</div>
        <div className="flex justify-end gap-2 px-4 pb-4">{footer}</div>
      </div>
    </div>
  );
}
const field = "mt-1.5 h-10 w-full rounded-md px-3 outline-none";
const fieldSt = { background: "#2f343a", color: "var(--mp-head)" };
const n = (v: string) => (v.trim() === "" ? null : Number(v));
const s = (v: number | null | undefined) => (v == null ? "" : String(v));

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 font-semibold" style={{ color: "var(--mp-head)" }}>
      <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="relative h-[18px] w-8 shrink-0 rounded-full" style={{ background: on ? "#405189" : "#4a5058" }}>
        <span className="absolute top-[2px] size-[14px] rounded-full bg-white transition-all" style={{ left: on ? 16 : 2 }} />
      </button>
      {label}
    </label>
  );
}

function GroupModal({ g, onClose, onSave }: { g: Partial<G>; onClose: () => void; onSave: (l: Record<string, unknown>) => void }) {
  const [v, setV] = useState({
    name: g.name ?? "", color: g.color ?? "#364574", icon: g.icon ?? "", auto: g.kind === "auto", noPay: !!g.noPay, min: s(g.min), max: s(g.max), ppvOnly: !!g.ppvOnly,
    ageMin: s(g.ageMin), ageMax: s(g.ageMax), rateMin: s(g.rateMin), rateMax: s(g.rateMax), ratePpv: s(g.ratePpv), reset: g.reset ?? "never", resetDay: s(g.resetDay ?? 1), resetHour: g.resetHour ?? "00:00", stayHours: s(g.stayHours),
  });
  const save = () => {
    if (!v.name.trim()) return toast("Donne un nom au groupe", "err");
    if (!v.icon) return toast("Veuillez sélectionner une icône.", "err");
    onSave({
      id: g.id, kind: v.auto ? "auto" : "manual", name: v.name, color: v.color, icon: v.icon, noPay: v.auto && v.noPay, min: v.auto ? n(v.min) : null, max: v.auto ? n(v.max) : null, ppvOnly: v.auto && v.ppvOnly,
      ageMin: v.auto ? n(v.ageMin) : null, ageMax: v.auto ? n(v.ageMax) : null, rateMin: v.auto ? n(v.rateMin) : null, rateMax: v.auto ? n(v.rateMax) : null, ratePpv: v.auto ? n(v.ratePpv) : null,
      reset: v.auto ? "never" : v.reset, resetDay: n(v.resetDay), resetHour: v.resetHour, stayHours: n(v.stayHours),
    });
  };
  const RESETS: [string, string, string][] = [
    ["never", "Jamais", "La liste garde ses fans jusqu'à ce que quelqu'un les retire."],
    ["daily", "Chaque jour", "La liste est vidée chaque jour à l'heure choisie."],
    ["weekly", "Chaque semaine", "La liste est vidée chaque semaine, le jour et à l'heure choisis."],
    ["monthly", "Chaque mois", "La liste est vidée chaque mois, le jour et à l'heure choisis."],
    ["after_add", "Quelques heures après l'ajout de chaque fan", "Chaque fan sort de la liste après le nombre d'heures choisi."],
  ];
  return (
    <Modal
      title={g.id ? "Modifier le groupe" : "Créer un groupe"}
      onClose={onClose}
      footer={<><button onClick={onClose} className="h-9 rounded-md px-4" style={{ background: "#2f343a" }}>Fermer</button><button onClick={save} className="h-9 rounded-md px-4 font-medium text-white" style={{ background: TEAL }}>{g.id ? "Enregistrer" : "Créer ce groupe"}</button></>}
    >
      <p className="font-semibold" style={{ color: "var(--mp-head)" }}>Nom</p>
      <input value={v.name} maxLength={60} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Nom du groupe" className={field} style={fieldSt} />
      <p className="mt-4 font-semibold" style={{ color: "var(--mp-head)" }}>Couleur</p>
      <label className="mt-1.5 block h-10 cursor-pointer rounded-md p-2" style={fieldSt}><span className="block size-full rounded" style={{ background: v.color }} /><input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="sr-only" /></label>
      <p className="mt-4 font-semibold" style={{ color: "var(--mp-head)" }}>Icône <span style={{ color: "#f06548" }}>*</span></p>
      <div className="mt-1.5 grid grid-cols-8 gap-2">
        {GROUP_ICONS.map(([k, I]) => (
          <button key={k} onClick={() => setV({ ...v, icon: k })} className="grid aspect-square place-items-center rounded-md border" style={{ borderColor: v.icon === k ? TEAL : "#8a9099", background: v.icon === k ? "rgba(10,179,156,.15)" : undefined }}><I className="size-5" /></button>
        ))}
      </div>
      <div className="my-4 h-px" style={{ background: "#3a4047" }} />
      <Toggle on={v.auto} set={(x) => setV({ ...v, auto: x })} label="Groupe automatique par CA cumulé (€)" />
      {v.auto ? (
        <>
          <label className="mt-3 flex items-center gap-2 font-semibold" style={{ color: "var(--mp-head)" }}><input type="checkbox" checked={v.noPay} onChange={(e) => setV({ ...v, noPay: e.target.checked })} /> Sans paiement</label>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Groupe à part des abonnés actifs dont le total payé est 0 € (aucun achat, abonnements gratuits compris). Les bornes sont désactivées ; il passe avant les fourchettes.</p>
          <p className="mt-3 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Bornes entières en euros. Pas de chevauchement avec d’autres groupes auto.</p>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <label className="font-semibold" style={{ color: "var(--mp-head)" }}>Min (€) <span style={{ color: "#f06548" }}>*</span><input disabled={v.noPay} type="number" value={v.min} onChange={(e) => setV({ ...v, min: e.target.value })} placeholder="ex. 0" className={`${field} disabled:opacity-40`} style={fieldSt} /></label>
            <label className="font-semibold" style={{ color: "var(--mp-head)" }}>Max (€) <span className="text-[11px] font-normal" style={{ color: "var(--mp-muted)" }}>(laisser vide = ∞)</span><input disabled={v.noPay} type="number" value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })} placeholder="ex. 99" className={`${field} disabled:opacity-40`} style={fieldSt} /></label>
          </div>
          <div className="mt-4 rounded-md border p-3" style={{ borderColor: "#3a4047" }}>
            <Toggle on={v.ppvOnly} set={(x) => setV({ ...v, ppvOnly: x })} label="PPV et pourboires seulement (groupe en plus)" />
            <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>La fourchette se lit sur ce que le fan a dépensé en PPV et en pourboires, sans l’abonnement. Le fan entre dans ce groupe en plus de son groupe automatique habituel.</p>
          </div>
          <p className="mt-4 font-semibold" style={{ color: "var(--mp-head)" }}>Critères en plus (facultatifs)</p>
          <p className="text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Laissez vide pour ne pas filtrer. Un groupe avec critères peut chevaucher la fourchette d’un autre groupe : il passe avant lui.</p>
          <p className="mt-3 font-semibold" style={{ color: "var(--mp-head)" }}>Ancienneté du fan (jours depuis son abonnement)</p>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" value={v.ageMin} onChange={(e) => setV({ ...v, ageMin: e.target.value })} placeholder="Au moins" className={field} style={fieldSt} />
            <input type="number" value={v.ageMax} onChange={(e) => setV({ ...v, ageMax: e.target.value })} placeholder="Au plus" className={field} style={fieldSt} />
          </div>
          <p className="mt-3 font-semibold" style={{ color: "var(--mp-head)" }}>Taux d’achats (%)</p>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" value={v.rateMin} onChange={(e) => setV({ ...v, rateMin: e.target.value })} placeholder="Au moins" className={field} style={fieldSt} />
            <input type="number" value={v.rateMax} onChange={(e) => setV({ ...v, rateMax: e.target.value })} placeholder="Au plus" className={field} style={fieldSt} />
          </div>
          <label className="mt-3 flex items-center gap-3 font-semibold" style={{ color: "var(--mp-head)" }}>Sur au moins … PPV envoyés <input type="number" value={v.ratePpv} onChange={(e) => setV({ ...v, ratePpv: e.target.value })} className="h-9 w-24 rounded-md px-2 outline-none" style={fieldSt} /></label>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>PPV achetés sur PPV envoyés depuis Bloom. Un fan qui n’a reçu aucun PPV n’entre pas dans un groupe qui filtre le taux.</p>
        </>
      ) : (
        <div className="mt-3 rounded-md border p-3" style={{ borderColor: "#3a4047" }}>
          <p className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--mp-head)" }}><Clock className="size-3.5" /> Remise à zéro automatique</p>
          <select value={v.reset} onChange={(e) => setV({ ...v, reset: e.target.value })} className={field} style={fieldSt}>
            {RESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {v.reset === "weekly" ? (
            <label className="mt-3 block font-semibold" style={{ color: "var(--mp-head)" }}>Jour<select value={v.resetDay} onChange={(e) => setV({ ...v, resetDay: e.target.value })} className={field} style={fieldSt}>{["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
          ) : null}
          {v.reset === "monthly" ? <label className="mt-3 block font-semibold" style={{ color: "var(--mp-head)" }}>Jour du mois (1 à 28)<input type="number" min={1} max={28} value={v.resetDay} onChange={(e) => setV({ ...v, resetDay: e.target.value })} className={field} style={fieldSt} /></label> : null}
          {["daily", "weekly", "monthly"].includes(v.reset) ? <label className="mt-3 block font-semibold" style={{ color: "var(--mp-head)" }}>Heure (heure de Paris)<input type="time" value={v.resetHour} onChange={(e) => setV({ ...v, resetHour: e.target.value })} className={field} style={{ ...fieldSt, colorScheme: "dark" }} /></label> : null}
          {v.reset === "after_add" ? (
            <label className="mt-3 flex items-center gap-2 font-semibold" style={{ color: "var(--mp-head)" }}>Chaque fan sort après<input type="number" min={1} value={v.stayHours} onChange={(e) => setV({ ...v, stayHours: e.target.value })} className="h-9 w-24 rounded-md px-2 outline-none" style={fieldSt} />heures</label>
          ) : null}
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{RESETS.find((r) => r[0] === v.reset)?.[2]}</p>
          {v.reset !== "never" ? <p className="mt-1 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Les fans sont seulement retirés de la liste : rien ne leur est envoyé.</p> : null}
        </div>
      )}
    </Modal>
  );
}
