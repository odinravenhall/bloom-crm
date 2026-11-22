"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { ago, cn, moneyC, usd } from "@/lib/fmt";
import { PLATFORM, PlatformBadge, platformOf, useCreators } from "@/lib/creators";
import { ROLE_LABEL, seesAll, type Me, type Member } from "@/lib/types";
import { Avatar, Pill, btnCls, inputCls } from "@/components/ui";

type F = "all" | "online" | "chatter" | "lead" | "manager" | "model" | "off";
const FILTERS: [F, string][] = [
  ["all", "Tout le monde"],
  ["online", "En ligne"],
  ["chatter", "Chatteurs"],
  ["lead", "Team leaders"],
  ["manager", "Managers"],
  ["model", "Modèles"],
  ["off", "Désactivés"],
];
/** Même règle que le serveur : admin / manager → tout le monde sauf les admins ; team leader → ses chatteurs. */
const canEdit = (me: Me, m: Member) => m.role !== "admin" && !seesAll(m.role) && (seesAll(me.role) || (me.role === "lead" && m.role === "chatter"));

/** Équipe : qui est en ligne et sur quel fan, à quelles créatrices chacun a accès, ce qu'il a fait aujourd'hui. */
export function Team({ me }: { me: Me }) {
  const { creators } = useCreators();
  const byId = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);
  const [list, setList] = useState<Member[] | null>(null);
  const [f, setF] = useState<F>("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Member | null>(null);

  const load = useCallback(() => api<Member[]>("GET", "/api/team").then(setList).catch((e) => toast((e as Error).message, "err")), []);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const shown = (list ?? []).filter((m) => {
    if (f === "off") return !m.active;
    if (!m.active) return false;
    if (f === "online" && !m.online) return false;
    if (f !== "all" && f !== "online" && m.role !== f) return false;
    return !q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase());
  });
  const online = (list ?? []).filter((m) => m.active && m.online).length;
  const activeN = (list ?? []).filter((m) => m.active).length;

  const toggleActive = async (m: Member) => {
    try {
      setList(await api<Member[]>("POST", "/api/team/active", { userId: m.id, active: !m.active }));
      toast(m.active ? `${m.name} n’a plus accès à Bloom` : `${m.name} a de nouveau accès`);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl">Équipe</h1>
          <p className="mt-1 text-sm text-muted">
            <b className="text-fg">{online}</b> en ligne sur {activeN} · les rôles (Admin, Manager, Team Leader, Chatteur, Modèle) se donnent sur le serveur Discord
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input className={cn(inputCls, "pl-10")} placeholder="Rechercher quelqu’un…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} className={cn("rounded-full border px-3 py-1.5 text-sm font-semibold", f === k ? "border-primary bg-petal text-primary-soft" : "bg-card text-muted hover:text-fg")}>
            {l}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-3xl border bg-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted">
              <th className="px-4 py-3 font-semibold">Personne</th>
              <th className="px-3 py-3 font-semibold">En ce moment</th>
              <th className="px-3 py-3 font-semibold">Créatrices</th>
              <th className="px-3 py-3 text-right font-semibold">Messages</th>
              <th className="px-3 py-3 text-right font-semibold">PPV envoyés</th>
              <th className="px-3 py-3 text-right font-semibold">Vendu</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((m) => {
              const cr = m.on?.creatorId ? byId.get(m.on.creatorId) : null;
              return (
                <tr key={m.id} className={cn("hover:bg-white/[0.03]", !m.active && "opacity-60")}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <span className="relative">
                        <Avatar src={m.avatar} name={m.name} size="size-9" />
                        <span className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card", m.online ? "bg-emerald-400" : "bg-line")} />
                      </span>
                      <span>
                        <b className="block">{m.name}</b>
                        <span className="text-xs text-muted">{ROLE_LABEL[m.role] ?? m.role}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {!m.active ? (
                      <span className="text-muted">désactivé</span>
                    ) : m.online ? (
                      cr ? (
                        <span>
                          <b className="text-emerald-300">en ligne</b> · {cr.name}
                          {m.on?.fanId ? (
                            <Link href={`/app/messagerie?c=${encodeURIComponent(cr.id)}&fan=${encodeURIComponent(m.on.fanId)}`} className="ml-1 text-primary-soft hover:underline">
                              voir le fan
                            </Link>
                          ) : null}
                        </span>
                      ) : (
                        <b className="text-emerald-300">en ligne</b>
                      )
                    ) : (
                      <span className="text-muted">{m.seenAt ? `vu ${ago(m.seenAt)}` : m.lastSent ? `dernier message ${ago(m.lastSent)}` : "pas encore venu"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {m.allCreators ? (
                      <Pill tone="accent">toutes</Pill>
                    ) : m.creators.length ? (
                      <span className="flex flex-wrap gap-1">
                        {m.creators.map((id) => (
                          <Pill key={id}>
                            {byId.get(id)?.name ?? "?"} <PlatformBadge c={byId.get(id)} className="ml-0.5" />
                          </Pill>
                        ))}
                      </span>
                    ) : (
                      <span className="text-xs text-amber-300">aucune</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{m.today.msgs}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {m.today.ppv}
                    {m.today.ppvValue ? <span className="block text-[11px] text-muted">{usd(m.today.ppvValue, 0)} proposés</span> : null}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {m.sold.length ? m.sold.map((s) => <span key={s.currency} className="block font-semibold">{moneyC(s.net, s.currency, 0)}</span>) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {canEdit(me, m) && m.active ? (
                      <button onClick={() => setEdit(m)} className={btnCls.ghost}>
                        Accès
                      </button>
                    ) : null}
                    {seesAll(me.role) && m.id !== me.id && (m.role !== "admin" || me.role === "admin") ? (
                      <button onClick={() => toggleActive(m)} className={cn(btnCls.ghost, m.active ? "hover:text-rose-300" : "")}>
                        {m.active ? "Désactiver" : "Réactiver"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list && !shown.length ? <p className="py-10 text-center text-sm text-muted">Personne ici pour l’instant.</p> : null}
        {!list ? <p className="py-10 text-center text-sm text-muted">Chargement…</p> : null}
      </div>
      <p className="text-xs text-muted">« Messages » et « PPV envoyés » : depuis Bloom, aujourd’hui. « Vendu » : PPV envoyés depuis Bloom et achetés aujourd’hui (ventes confirmées par Infloww / MyPulse).</p>

      {edit ? <AccessEditor member={edit} onClose={() => setEdit(null)} onSaved={(l) => (setList(l), setEdit(null))} /> : null}
    </div>
  );
}

/** Choisir les créatrices auxquelles une personne a accès. */
function AccessEditor({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: (l: Member[]) => void }) {
  const { creators } = useCreators();
  const [allC, setAll] = useState(member.allCreators);
  const [sel, setSel] = useState(() => new Set(member.creators));
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api<Member[]>("POST", "/api/team/access", { userId: member.id, all: allC, creators: [...sel] }));
      toast(`Accès de ${member.name} enregistrés`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#2b1a26]/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <Avatar src={member.avatar} name={member.name} size="size-10" />
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl">Accès de {member.name}</h2>
            <p className="text-xs text-muted">{member.role === "model" ? "Les comptes dont elle voit le chiffre d’affaires." : "Les créatrices dont il ou elle peut voir et écrire les conversations."}</p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card-2">
            <X className="size-4" />
          </button>
        </div>
        <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3">
          <input type="checkbox" checked={allC} onChange={(e) => setAll(e.target.checked)} className="size-4" />
          <span>
            <b className="block text-sm">Toutes les créatrices</b>
            <span className="text-xs text-muted">y compris celles ajoutées plus tard</span>
          </span>
        </label>
        <div className={cn("relative mt-3", allC && "pointer-events-none opacity-40")}>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className={cn(inputCls, "h-9 pl-9")} placeholder="Chercher une créatrice…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className={cn("mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto", allC && "pointer-events-none opacity-40")}>
          {creators.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())).map((c) => {
            const on = sel.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() =>
                  setSel((s) => {
                    const n = new Set(s);
                    if (n.has(c.id)) n.delete(c.id);
                    else n.add(c.id);
                    return n;
                  })
                }
                className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2 text-left", on ? "border-primary bg-petal" : "hover:bg-card-2")}
              >
                <Avatar src={c.avatar} name={c.name} size="size-8" />
                <span className="flex-1">
                  <b className="flex items-center gap-1.5 text-sm">
                    {c.name} <PlatformBadge c={c} />
                  </b>
                  {c.username ? <span className="text-xs text-muted">@{c.username}</span> : <span className="text-xs text-muted">{PLATFORM[platformOf(c)]}</span>}
                </span>
                <span className={cn("grid size-6 place-items-center rounded-full border", on ? "border-primary bg-primary text-white" : "")}>{on ? <Check className="size-3.5" /> : null}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={btnCls.secondary}>
            Annuler
          </button>
          <button onClick={save} disabled={busy} className={btnCls.primary}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
