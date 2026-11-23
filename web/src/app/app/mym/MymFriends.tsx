"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, LayoutGrid, LineChart, MousePointerClick, RefreshCw, Sparkles, UserPlus, UserRound, Users, UsersRound, X, Zap } from "lucide-react";
import { api, toast } from "@/lib/api";
import { Avatar } from "@/components/ui";

// MYM → Médias → Liste d'amis : copie de MyPulse. Les amies affichées sous la bio de chaque profil MYM, lues et modifiées
// en direct chez MYM (comptes reliés à Bloom). 12 amies au plus par compte.
type Friend = { username: string; displayName: string; avatar: string | null; available: boolean };
type Account = { id: string; name: string; username: string | null; avatar: string | null; linked: boolean; friends: Friend[]; error: string | null };
type Data = { canEdit: boolean; max: number; accounts: Account[] };
type Result = { account: string; username: string | null; ok: boolean; skipped?: boolean; error?: string };
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const accent = { background: "var(--mp-accent)", color: "var(--mp-on-accent)" };
const TABS = [["account", "Par compte", LayoutGrid], ["friend", "Par amie (vue agence)", UserRound], ["bulk", "Ajout en masse", Zap], ["track", "Suivi", LineChart]] as const;

export function MymFriends() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("account");
  const [preview, setPreview] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback((fresh = false) => api<Data>("GET", `/api/mym/friends${fresh ? "?fresh=1" : ""}`).then(setD).catch((e) => toast((e as Error).message, "err")), []);
  useEffect(() => {
    load();
  }, [load]);
  const accounts = useMemo(() => d?.accounts ?? [], [d]);
  const shown = accounts.find((a) => a.id === preview) ?? accounts[0];
  const max = d?.max ?? 12;

  const act = async (kind: "add" | "remove", creatorIds: string[], usernames: string[]) => {
    setBusy(true);
    try {
      if (kind === "add") {
        const r = await api<{ added: number; results: Result[] }>("POST", "/api/mym/friends/add", { creatorIds, usernames });
        const bad = r.results.filter((x) => !x.ok && !x.skipped);
        toast(`${r.added} amie(s) ajoutée(s)${bad.length ? ` · ${bad.length} refus : ${bad.slice(0, 2).map((x) => `${x.username ?? x.account} (${x.error})`).join(", ")}` : ""}`, bad.length && !r.added ? "err" : "ok");
      } else {
        const r = await api<{ removed: number; errors: string[] }>("POST", "/api/mym/friends/remove", { creatorIds, usernames });
        toast(`${r.removed} amie(s) retirée(s)${r.errors.length ? ` · ${r.errors[0]}` : ""}`, r.errors.length && !r.removed ? "err" : "ok");
      }
      await load(true);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const move = async (a: Account, i: number, by: number) => {
    const list = a.friends.map((f) => f.username);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setBusy(true);
    try {
      await api("POST", "/api/mym/friends/order", { creatorId: a.id, usernames: list });
      await load(true);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="rounded-xl p-6" style={{ ...card, background: "linear-gradient(100deg, #10140c 0%, #171c12 70%, #26331a 100%)" }}>
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase" style={{ color: "var(--mp-head)" }}><span className="size-2 rounded-full" style={{ background: "var(--mp-accent)" }} /> Profil public MYM</p>
        <h1 className="mt-2 text-[24px] font-bold" style={{ color: "var(--mp-head)" }}>Liste d’amis : la promo croisée entre vos modèles</h1>
        <p className="mt-1 max-w-[620px] text-[13px]">Chaque profil MYM peut afficher jusqu’à {max} amies sous sa bio. Un fan qui visite une de vos modèles découvre les autres d’un simple toucher. Gérez-les ici pour toute l’agence, en direct chez MYM.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-semibold" style={{ color: "var(--mp-head)" }}>
          {[[UsersRound, `Comptes MYM : ${accounts.length}`], [UserRound, `${max} amies max. par compte`], [Zap, "Lu en direct chez MYM"]].map(([I, l]) => {
            const Icon = I as typeof Zap;
            return <span key={l as string} className="flex items-center gap-1.5 rounded-full border px-3 py-1" style={{ borderColor: "var(--mp-line)" }}><Icon className="size-3.5" style={{ color: "var(--mp-accent)" }} />{l as string}</span>;
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-6 rounded-xl p-5 lg:flex-row" style={card}>
        <div className="min-w-0 flex-1 self-center">
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--mp-head)" }}>Ce que voient vos fans</h2>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--mp-muted)" }}>Beaucoup d’agences ne connaissent pas encore ce bloc. Voici le profil tel qu’un fan le découvre, avec les vraies amies du compte choisi.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[[LayoutGrid, "Sous la bio du profil", "Le bloc « amies » s’affiche juste après la bio et les réseaux sociaux, sur le profil public de la modèle."], [MousePointerClick, "Un toucher, un nouveau profil", "Le fan touche une photo et arrive sur le profil de l’amie : vos modèles se recommandent entre elles."], [UserRound, `Jusqu’à ${max} amies par compte`, "Une amie dont le compte est signalé « indisponible » ne mène plus nulle part : pensez à la remplacer."], [UsersRound, "Pensé pour les agences", "Ajoutez une modèle sur toutes les autres en un geste, ou croisez toute l’agence d’un clic."]].map(([I, t, s]) => {
              const Icon = I as typeof Zap;
              return (
                <div key={t as string} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md" style={{ background: "rgba(199,255,74,.1)", color: "var(--mp-accent)" }}><Icon className="size-4" /></span>
                  <div><p className="text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>{t as string}</p><p className="text-[12px]" style={{ color: "var(--mp-muted)" }}>{s as string}</p></div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-lg p-3" style={{ background: "var(--mp-card-2)" }}>
            <p className="text-[10.5px] font-semibold tracking-wider uppercase" style={{ color: "var(--mp-muted)" }}>Aperçu du profil de</p>
            <div className="mt-2 flex gap-2">
              <select value={shown?.id ?? ""} onChange={(e) => setPreview(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md px-3 text-[13px] outline-none" style={{ background: "var(--mp-card)", color: "var(--mp-head)" }}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {shown?.username ? <a href={`https://mym.fans/${shown.username}`} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1.5 rounded-md px-3 text-[12.5px] text-white" style={{ background: "#405189" }}><ExternalLink className="size-3.5" /> Voir le vrai profil sur MYM</a> : null}
            </div>
          </div>
        </div>
        <div className="mx-auto w-[250px] shrink-0 rounded-[28px] border-4 p-3" style={{ borderColor: "#0d0f11", background: "#15181b" }}>
          <div className="flex items-center gap-2"><Avatar src={shown?.avatar} name={shown?.name} size="size-12" /><p className="truncate text-[15px] font-bold" style={{ color: "var(--mp-head)" }}>{shown?.name ?? "—"}</p></div>
          <div className="mt-3 h-8 rounded-full text-center text-[12px] leading-8 font-semibold text-white" style={{ background: "#2f6bff" }}>s’abonner</div>
          <div className="mt-3 space-y-1.5">{[90, 100, 60].map((w) => <div key={w} className="h-1.5 rounded" style={{ width: `${w}%`, background: "#2a2f34" }} />)}</div>
          <div className="relative mt-4 rounded-lg border border-dashed p-2" style={{ borderColor: "var(--mp-accent)" }}>
            <span className="absolute -top-2.5 right-2 flex items-center gap-1 rounded-full px-2 text-[9.5px] font-bold" style={accent}><Sparkles className="size-2.5" /> Vos Friends s’affichent ici</span>
            <p className="text-[11px] font-semibold" style={{ color: "var(--mp-head)" }}>amies</p>
            <div className="no-scrollbar mt-1.5 flex gap-2 overflow-x-auto">
              {(shown?.friends ?? []).map((f) => (
                <div key={f.username} className="w-[52px] shrink-0 text-center" style={{ opacity: f.available ? 1 : 0.4 }}>
                  <Avatar src={f.avatar} name={f.displayName} size="size-11" />
                  <p className="mt-0.5 truncate text-[9px]">{f.displayName}</p>
                </div>
              ))}
              {shown && !shown.friends.length ? <p className="py-2 text-[11px]" style={{ color: "var(--mp-muted)" }}>{shown.error || "Aucune amie pour l’instant"}</p> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg p-1" style={card}>
          {TABS.map(([k, l, I]) => <button key={k} onClick={() => setTab(k)} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold" style={tab === k ? accent : undefined}><I className="size-3.5" />{l}</button>)}
        </div>
        <button onClick={() => load(true)} title="Relire chez MYM" className="grid size-8 place-items-center rounded-md" style={card}><RefreshCw className="size-3.5" /></button>
        <span className="flex-1" />
        {tab === "account" ? <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer les comptes…" className="h-9 w-[240px] rounded-md px-3 text-[12.5px] outline-none" style={card} /> : null}
      </div>

      {!d ? <p className="py-16 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>Lecture des listes chez MYM…</p> : null}
      {d && !accounts.length ? <p className="py-16 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>Aucun compte MYM visible.</p> : null}

      {d && tab === "account" ? (
        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}>
          {accounts.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase())).map((a) => (
            <AccountCard key={a.id} a={a} max={max} canEdit={d.canEdit && a.linked} busy={busy} onAdd={(n) => act("add", [a.id], [n])} onRemove={(n) => act("remove", [a.id], [n])} onMove={(i, by) => move(a, i, by)} />
          ))}
        </div>
      ) : null}

      {d && tab === "friend" ? <ByFriend accounts={accounts} canEdit={d.canEdit} busy={busy} act={act} /> : null}
      {d && tab === "bulk" ? <Bulk accounts={accounts} max={max} canEdit={d.canEdit} busy={busy} act={act} /> : null}
      {d && tab === "track" ? (
        <div className="mt-4 rounded-xl p-5" style={card}>
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--mp-head)" }}>Ce que vos listes d’amis ont ramené</h2>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--mp-muted)" }}>Les nouveaux abonnés venus d’une liste d’amis et ce qu’ils ont dépensé, compte par compte.</p>
          <p className="py-12 text-center text-[13px]" style={{ color: "var(--mp-muted)" }}>Pas encore disponible dans Bloom : il faut d’abord que Bloom relève les listes et les abonnés jour après jour.</p>
        </div>
      ) : null}
    </div>
  );
}

function AccountCard({ a, max, canEdit, busy, onAdd, onRemove, onMove }: { a: Account; max: number; canEdit: boolean; busy: boolean; onAdd: (n: string) => void; onRemove: (n: string) => void; onMove: (i: number, by: number) => void }) {
  const [name, setName] = useState("");
  const add = () => name.trim() && (onAdd(name.trim()), setName(""));
  return (
    <div className="rounded-xl p-4" style={{ ...card, borderColor: a.error ? "var(--mp-down)" : "var(--mp-accent)" }}>
      <div className="flex items-center gap-3">
        <Avatar src={a.avatar} name={a.name} size="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold" style={{ color: "var(--mp-head)" }}>{a.name}</p>
          <div className="mt-1 flex items-center gap-2"><div className="h-1 flex-1 rounded" style={{ background: "var(--mp-card-2)" }}><div className="h-1 rounded" style={{ width: `${(a.friends.length / max) * 100}%`, background: "var(--mp-accent)" }} /></div><span className="text-[11px]" style={{ color: "var(--mp-muted)" }}>{a.friends.length} / {max}</span></div>
        </div>
        {a.username ? <a href={`https://mym.fans/${a.username}`} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-md" style={{ background: "var(--mp-card-2)" }}><ExternalLink className="size-3.5" /></a> : null}
      </div>
      {a.error ? <p className="mt-3 text-[12px]" style={{ color: "var(--mp-down)" }}>{a.error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {a.friends.map((f, i) => (
          <span key={f.username} className="flex items-center gap-1.5 rounded-full py-1 pr-1.5 pl-1 text-[12.5px]" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)", opacity: f.available ? 1 : 0.5 }} title={f.available ? `@${f.username}` : "Compte indisponible : à remplacer"}>
            <Avatar src={f.avatar} name={f.displayName} size="size-6" />{f.displayName}
            {canEdit ? (
              <>
                <button disabled={busy || i === 0} onClick={() => onMove(i, -1)} title="Avancer" className="disabled:opacity-25"><ChevronLeft className="size-3.5" /></button>
                <button disabled={busy || i === a.friends.length - 1} onClick={() => onMove(i, 1)} title="Reculer" className="disabled:opacity-25"><ChevronRight className="size-3.5" /></button>
                <button disabled={busy} onClick={() => confirm(`Retirer ${f.displayName} de la liste d’amis de ${a.name} ?`) && onRemove(f.username)} title="Retirer" style={{ color: "var(--mp-muted)" }}><X className="size-3.5" /></button>
              </>
            ) : null}
          </span>
        ))}
      </div>
      {canEdit && a.friends.length < max ? (
        <label className="mt-3 flex h-9 items-center gap-2 rounded-md px-3 text-[12.5px]" style={{ background: "var(--mp-card-2)" }}>
          <UserPlus className="size-3.5" />
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Ajouter une amie (pseudo MYM)…" className="min-w-0 flex-1 bg-transparent outline-none" />
          {name.trim() ? <button disabled={busy} onClick={add} className="rounded px-2 py-0.5 text-[11px] font-semibold" style={accent}>Ajouter</button> : null}
        </label>
      ) : null}
    </div>
  );
}

function ByFriend({ accounts, canEdit, busy, act }: { accounts: Account[]; canEdit: boolean; busy: boolean; act: (k: "add" | "remove", c: string[], u: string[]) => void }) {
  const linked = accounts.filter((a) => a.linked && !a.error);
  const rows = useMemo(() => {
    const m = new Map<string, { f: Friend; on: Account[] }>();
    for (const a of accounts) for (const f of a.friends) m.set(f.username.toLowerCase(), { f, on: [...(m.get(f.username.toLowerCase())?.on ?? []), a] });
    return [...m.values()].sort((x, y) => x.f.displayName.localeCompare(y.f.displayName, "fr"));
  }, [accounts]);
  return (
    <div className="mt-4 rounded-xl p-5" style={card}>
      <h2 className="text-[16px] font-semibold" style={{ color: "var(--mp-head)" }}>Toutes les amies de l’agence</h2>
      <p className="text-[12.5px]" style={{ color: "var(--mp-muted)" }}>Chaque amie et les comptes qui l’affichent. Complétez ou retirez partout d’un clic.</p>
      <table className="mt-4 w-full text-[13px]">
        <thead><tr className="text-left" style={{ color: "var(--mp-head)" }}><th className="py-2 font-semibold">Amie</th><th className="font-semibold">Affichée sur</th><th className="text-right font-semibold">Actions</th></tr></thead>
        <tbody>
          {rows.map(({ f, on }) => {
            // « Partout » = tous les comptes reliés, sauf le sien.
            const others = linked.filter((a) => (a.username || "").toLowerCase() !== f.username.toLowerCase());
            return (
              <tr key={f.username} className="border-t" style={{ borderColor: "var(--mp-line)" }}>
                <td className="py-3"><span className="flex items-center gap-3"><Avatar src={f.avatar} name={f.displayName} size="size-9" /><span><span className="block font-semibold" style={{ color: "var(--mp-head)" }}>{f.displayName}</span><span className="text-[11.5px]" style={{ color: "var(--mp-muted)" }}>@{f.username}</span></span></span></td>
                <td><p className="text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{on.length} / {others.length} comptes</p><span className="mt-1 flex flex-wrap gap-1">{on.map((a) => <span key={a.id} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}>{a.name}</span>)}</span></td>
                <td className="text-right whitespace-nowrap">
                  {canEdit ? (
                    <>
                      <button disabled={busy || on.length >= others.length} onClick={() => act("add", others.map((a) => a.id), [f.username])} className="mr-2 h-8 rounded-md border px-3 text-[12px] disabled:opacity-40" style={{ borderColor: "var(--mp-line)" }}><UserPlus className="mr-1 inline size-3.5" />Ajouter partout</button>
                      <button disabled={busy} onClick={() => confirm(`Retirer ${f.displayName} de tous les comptes (${on.length}) ?`) && act("remove", on.map((a) => a.id), [f.username])} className="h-8 rounded-md px-3 text-[12px]" style={{ background: "rgba(240,101,72,.15)", color: "var(--mp-down)" }}><X className="mr-1 inline size-3.5" />Retirer partout</button>
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {!rows.length ? <tr><td colSpan={3} className="py-10 text-center" style={{ color: "var(--mp-muted)" }}>Aucune amie pour l’instant.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

function Bulk({ accounts, max, canEdit, busy, act }: { accounts: Account[]; max: number; canEdit: boolean; busy: boolean; act: (k: "add" | "remove", c: string[], u: string[]) => void }) {
  const linked = accounts.filter((a) => a.linked && !a.error);
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [on, setOn] = useState<string[]>(linked.map((a) => a.id));
  const add = () => {
    const n = name.trim().replace(/^@/, "");
    if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) setNames([...names, n]);
    setName("");
  };
  const num = "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold";
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <div className="rounded-xl p-5" style={card}>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}><span className={num} style={accent}>1</span> Les amies à ajouter</h3>
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--mp-muted)" }}>Cherchez n’importe quelle créatrice sur MYM, ou piochez dans vos modèles.</p>
        <label className="mt-3 flex h-9 items-center gap-2 rounded-md px-3 text-[12.5px]" style={{ background: "var(--mp-card-2)" }}>
          <UserPlus className="size-3.5" /><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Ajouter une amie (pseudo MYM)…" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <div className="mt-2 flex gap-2 text-[12px]">
          <button onClick={() => setNames([...new Set([...names, ...linked.map((a) => a.username).filter((x): x is string => !!x)])])} className="flex h-7 items-center gap-1.5 rounded-md border px-2.5" style={{ borderColor: "var(--mp-line)" }}><Users className="size-3.5" style={{ color: "var(--mp-accent)" }} />Toutes mes modèles</button>
          <button onClick={() => setNames([])} className="h-7 rounded-md border px-2.5" style={{ borderColor: "var(--mp-line)" }}>Vider</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {names.map((n) => <span key={n} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]" style={{ background: "var(--mp-card-2)", color: "var(--mp-head)" }}>@{n}<button onClick={() => setNames(names.filter((x) => x !== n))}><X className="size-3" /></button></span>)}
          {!names.length ? <p className="text-[12.5px]" style={{ color: "var(--mp-muted)" }}>Aucune amie choisie.</p> : null}
        </div>
      </div>
      <div className="rounded-xl p-5" style={card}>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}><span className={num} style={accent}>2</span> Sur quels comptes<span className="flex-1" />
          <button onClick={() => setOn(linked.map((a) => a.id))} className="rounded px-2 py-0.5 text-[11px] font-normal text-white" style={{ background: "#405189" }}>Tous</button>
          <button onClick={() => setOn([])} className="rounded px-2 py-0.5 text-[11px] font-normal text-white" style={{ background: "#405189" }}>Aucun</button>
        </h3>
        <div className="mt-3 space-y-1">
          {linked.map((a) => (
            <label key={a.id} className="flex items-center gap-2.5 py-1.5 text-[13px]">
              <input type="checkbox" checked={on.includes(a.id)} onChange={() => setOn(on.includes(a.id) ? on.filter((x) => x !== a.id) : [...on, a.id])} />
              <Avatar src={a.avatar} name={a.name} size="size-7" /><span className="flex-1 truncate" style={{ color: "var(--mp-head)" }}>{a.name}</span>
              <span className="text-[11.5px]" style={{ color: "var(--mp-muted)" }}>{a.friends.length} / {max}</span>
            </label>
          ))}
          {!linked.length ? <p className="text-[12.5px]" style={{ color: "var(--mp-muted)" }}>Aucun compte MYM relié à Bloom.</p> : null}
        </div>
      </div>
      <div className="rounded-xl p-5" style={card}>
        <h3 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}><span className={num} style={accent}>3</span> Lancer</h3>
        <button disabled={!canEdit || busy || linked.length < 2} onClick={() => (setNames(linked.map((a) => a.username).filter((x): x is string => !!x)), setOn(linked.map((a) => a.id)))} className="mt-3 w-full rounded-lg border border-dashed p-3 text-left disabled:opacity-50" style={{ borderColor: "var(--mp-accent)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "var(--mp-head)" }}>Promo croisée de toute l’agence</p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--mp-muted)" }}>Toutes vos modèles en amies sur tous vos comptes : chacune est ajoutée chez les autres, jamais chez elle-même, dans la limite de {max} par compte.</p>
        </button>
        <p className="mt-3 text-[12.5px]" style={{ color: "var(--mp-muted)" }}>{names.length && on.length ? `${names.length} amie(s) sur ${on.length} compte(s).` : "Choisissez au moins une amie et un compte."}</p>
        <button disabled={!canEdit || busy || !names.length || !on.length} onClick={() => act("add", on, names)} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold disabled:opacity-40" style={accent}><UserPlus className="size-4" /> {busy ? "Ajout en cours…" : "Ajouter"}</button>
        {!canEdit ? <p className="mt-2 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Réservé aux admins et managers.</p> : null}
      </div>
    </div>
  );
}
