"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, ExternalLink, RefreshCw, UserPlus, Users, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { Avatar } from "@/rv/components/ui";
import { Confirm, PALETTE, Ring } from "../kit";
import { errText, plural } from "../media/MediaKit";

// Bloom v2 → MYM → Liste d'amis (25/11/2026, « Constellation »). Remplace, dans la v2, la copie de MyPulse
// (`MymFriends`, qui reste dans la version actuelle). Les amies affichées sous la bio de chaque profil MYM, lues et
// modifiées EN DIRECT chez MYM par les routes d'avant (« /api/mym/friends… », mymmedia.mjs) : 12 au plus par compte,
// écrire = admins et managers, toujours derrière une confirmation.
type Friend = { username: string; displayName: string; avatar: string | null; available: boolean };
type Account = { id: string; name: string; username: string | null; avatar: string | null; linked: boolean; friends: Friend[]; error: string | null };
type Data = { canEdit: boolean; max: number; accounts: Account[] };
type Result = { account: string; username: string | null; ok: boolean; skipped?: boolean; error?: string };
type Ask = { title: string; text: string; button: string; go: () => Promise<unknown> } | null;
const TABS = [["account", "Par compte"], ["all", "Toutes les amies"], ["cross", "Promo croisée"]] as const;
const clean = (s: string) => s.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?mym\.fans\//i, "").split(/[/?#]/)[0];

export function V2Friends() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("account");
  const [cur, setCur] = useState("");
  const [busy, setBusy] = useState(false);
  const [spin, setSpin] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  const load = useCallback(
    (fresh = false) =>
      api<Data>("GET", `/api/mym/friends${fresh ? "?fresh=1" : ""}`)
        .then((r) => (setD(r), setErr("")))
        .catch((e) => setErr(errText(e))),
    [],
  );
  useEffect(() => void load(), [load]);
  const accounts = useMemo(() => d?.accounts ?? [], [d]);
  const max = d?.max ?? 12;
  const canEdit = !!d?.canEdit;
  const a = accounts.find((x) => x.id === cur) ?? accounts.find((x) => x.linked) ?? accounts[0] ?? null;
  const colorOf = (id: string) => PALETTE[Math.max(0, accounts.findIndex((x) => x.id === id)) % PALETTE.length];

  // Chaque écriture relit ensuite les listes chez MYM (`fresh`).
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast(errText(e), "err");
    }
    await load(true);
    setBusy(false);
  };
  const add = (creatorIds: string[], usernames: string[]) =>
    run(async () => {
      const r = await api<{ added: number; results: Result[] }>("POST", "/api/mym/friends/add", { creatorIds, usernames });
      const bad = r.results.filter((x) => !x.ok && !x.skipped);
      toast(`${plural(r.added, "amie ajoutée", "amies ajoutées")}${bad.length ? ` · ${bad.length} refus : ${bad.slice(0, 2).map((x) => `${x.username ?? x.account} (${x.error})`).join(", ")}` : ""}`, bad.length && !r.added ? "err" : "ok");
    });
  const remove = (creatorIds: string[], usernames: string[]) =>
    run(async () => {
      const r = await api<{ removed: number; errors: string[] }>("POST", "/api/mym/friends/remove", { creatorIds, usernames });
      toast(`${plural(r.removed, "amie retirée", "amies retirées")}${r.errors.length ? ` · ${r.errors[0]}` : ""}`, r.errors.length && !r.removed ? "err" : "ok");
    });
  const move = (x: Account, i: number, by: number) => {
    const list = x.friends.map((f) => f.username);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void run(async () => {
      await api("POST", "/api/mym/friends/order", { creatorId: x.id, usernames: list });
    });
  };
  const refresh = async () => {
    setSpin(true);
    await load(true);
    setSpin(false);
  };

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">MYM · Profil public</p>
          <h1 className="v2-h1 mt-1">Liste d’amis</h1>
          <p className="mt-1 max-w-[680px] text-[13px] text-muted">Jusqu’à {max} amies sous la bio de chaque profil MYM : un fan qui visite une modèle découvre les autres d’un toucher. Lu et modifié en direct chez MYM.</p>
        </div>
        <button onClick={() => void refresh()} disabled={spin} className="v2-select" title="Relire les listes chez MYM"><RefreshCw className={`size-4 text-muted ${spin ? "animate-spin" : ""}`} />Actualiser</button>
      </div>
      <div className="v2-tabs mt-5">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="v2-tab" data-on={tab === k}>{l}</button>)}
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {!d && !err ? <p className="py-20 text-center text-[13px] text-muted">Lecture des listes chez MYM…</p> : null}
      {d && !accounts.length ? <p className="py-20 text-center text-[13px] text-muted">Aucun compte MYM visible pour toi.</p> : null}

      {d && accounts.length && tab === "account" && a ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
          <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 1 }}>
            <div className="v2-card p-1.5">
              <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Comptes MYM</p>
              <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
                {accounts.map((x) => (
                  <button key={x.id} onClick={() => setCur(x.id)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={a.id === x.id} aria-pressed={a.id === x.id}>
                    <Ring color={colorOf(x.id)}><Avatar src={x.avatar} name={x.name} size="size-8" /></Ring>
                    <span className="min-w-0 flex-1 text-left">
                      <b className="block truncate text-[13px] leading-tight">{x.name}</b>
                      <span className="block truncate text-[11.5px] text-muted">{!x.linked ? "pas relié à Bloom" : x.error ? "illisible" : `${x.friends.length} / ${max} amies`}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
          <AccountView a={a} max={max} canEdit={canEdit} busy={busy} onAdd={(n) => add([a.id], [n])} onMove={(i, by) => move(a, i, by)}
            onRemove={(f) => setAsk({ title: `Retirer ${f.displayName} ?`, text: `${f.displayName} disparaît tout de suite de la liste d’amis du profil MYM de ${a.name}. On peut la rajouter ensuite.`, button: "Retirer", go: () => remove([a.id], [f.username]) })} />
        </div>
      ) : null}

      {d && accounts.length && tab === "all" ? <All accounts={accounts} canEdit={canEdit} busy={busy} setAsk={setAsk} add={add} remove={remove} /> : null}
      {d && accounts.length && tab === "cross" ? <Cross accounts={accounts} max={max} canEdit={canEdit} busy={busy} setAsk={setAsk} add={add} /> : null}

      {ask ? <Confirm title={ask.title} text={ask.text} button={ask.button} go={ask.go} onClose={() => setAsk(null)} /> : null}
    </div>
  );
}

/** Un compte : ses amies dans l'ordre du profil, l'aperçu tel que le voit un fan, l'ajout. */
function AccountView({ a, max, canEdit, busy, onAdd, onMove, onRemove }: { a: Account; max: number; canEdit: boolean; busy: boolean; onAdd: (n: string) => void; onMove: (i: number, by: number) => void; onRemove: (f: Friend) => void }) {
  const [name, setName] = useState("");
  const go = () => {
    const n = clean(name);
    if (n) onAdd(n), setName("");
  };
  const edit = canEdit && a.linked && !a.error;
  const off = a.friends.filter((f) => !f.available).length;
  return (
    <section className="v2-rise min-w-0 space-y-4" style={{ ["--i" as string]: 2 }}>
      <div className="v2-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar src={a.avatar} name={a.name} size="size-11" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-bold">{a.name}</h2>
            <p className="text-[12.5px] text-muted">{a.username ? `@${a.username}` : "pseudo inconnu"}{off ? ` · ${plural(off, "amie indisponible", "amies indisponibles")} à remplacer` : ""}</p>
          </div>
          <div className="w-[150px]">
            <p className="v2-num text-right text-[12.5px] font-semibold">{a.friends.length} / {max}</p>
            <div className="mt-1 h-1.5 rounded-full" style={{ background: "rgb(255 255 255 / 0.07)" }}><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (a.friends.length / max) * 100)}%`, background: "var(--v2-blue)" }} /></div>
          </div>
          {a.username ? <a href={`https://mym.fans/${a.username}`} target="_blank" rel="noreferrer" className="v2-btn" data-kind="ghost" style={{ height: 34 }} title="Le profil public sur MYM"><ExternalLink className="size-4" />Voir le profil</a> : null}
        </div>
        {!a.linked ? <p className="mt-3 text-[13px] text-muted">Ce compte n’est pas relié à Bloom : relie-le dans MYM → Compte Creator pour lire et changer sa liste.</p> : a.error ? <p className="mt-3 text-[13px]" style={{ color: "var(--v2-down)" }}>{a.error}</p> : null}

        {/* L'aperçu : la rangée d'amies telle qu'un fan la voit sous la bio. */}
        {a.linked && !a.error ? (
          <div className="mt-4 rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)", background: "rgb(255 255 255 / 0.02)" }}>
            <p className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase">Sur le profil, sous la bio</p>
            <div className="v2-noscroll mt-2 flex gap-3 overflow-x-auto pb-1">
              {a.friends.map((f) => (
                <div key={f.username} className="w-[58px] shrink-0 text-center" style={{ opacity: f.available ? 1 : 0.4 }}>
                  <Avatar src={f.avatar} name={f.displayName} size="size-12" />
                  <p className="mt-1 truncate text-[10.5px]">{f.displayName}</p>
                </div>
              ))}
              {!a.friends.length ? <p className="py-3 text-[12.5px] text-muted">Aucune amie : le bloc n’apparaît pas sur le profil.</p> : null}
            </div>
          </div>
        ) : null}
      </div>

      {a.linked && !a.error ? (
        <div className="v2-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-[14px] font-bold">Dans l’ordre du profil</p>
            {edit && a.friends.length < max ? (
              <div className="flex w-full max-w-[360px] items-center gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Pseudo MYM ou lien du profil" className="v2-field" style={{ height: 34 }} aria-label="Amie à ajouter" />
                <button onClick={go} disabled={busy || !clean(name)} className="v2-btn" style={{ height: 34 }}><UserPlus className="size-4" />Ajouter</button>
              </div>
            ) : edit ? <span className="text-[12.5px] text-muted">Liste pleine ({max} amies)</span> : !canEdit ? <span className="text-[12.5px] text-muted">Changer la liste : admins et managers</span> : null}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {a.friends.map((f, i) => (
              <div key={f.username} className="flex items-center gap-3 rounded-[12px] border px-3 py-2.5" style={{ borderColor: "var(--color-line)", opacity: busy ? 0.6 : 1 }}>
                <span className="v2-num w-4 text-center text-[12px] font-bold text-muted">{i + 1}</span>
                <Avatar src={f.avatar} name={f.displayName} size="size-9" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px]">{f.displayName}</b>
                  <span className="block truncate text-[11.5px]" style={{ color: f.available ? "var(--color-muted)" : "var(--v2-down)" }}>{f.available ? `@${f.username}` : "compte indisponible"}</span>
                </span>
                {edit ? (
                  <span className="flex shrink-0 items-center">
                    <button disabled={busy || i === 0} onClick={() => onMove(i, -1)} title="Avancer d’une place" aria-label="Avancer" className="v2-sq disabled:opacity-25"><ArrowUp className="size-3.5" /></button>
                    <button disabled={busy || i === a.friends.length - 1} onClick={() => onMove(i, 1)} title="Reculer d’une place" aria-label="Reculer" className="v2-sq disabled:opacity-25"><ArrowDown className="size-3.5" /></button>
                    <button disabled={busy} onClick={() => onRemove(f)} title="Retirer de la liste" aria-label="Retirer" className="v2-sq hover:text-(--v2-down)"><X className="size-3.5" /></button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          {!a.friends.length ? <p className="py-6 text-center text-[13px] text-muted">Aucune amie pour l’instant.{edit ? " Ajoute un pseudo MYM ci-dessus, ou passe par « Promo croisée »." : ""}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/** Toutes les amies de l'agence : qui est affichée où, et l'action sur tous les comptes d'un coup. */
function All({ accounts, canEdit, busy, setAsk, add, remove }: { accounts: Account[]; canEdit: boolean; busy: boolean; setAsk: (a: Ask) => void; add: (c: string[], u: string[]) => Promise<void>; remove: (c: string[], u: string[]) => Promise<void> }) {
  const linked = accounts.filter((x) => x.linked && !x.error);
  const rows = useMemo(() => {
    const m = new Map<string, { f: Friend; on: Account[] }>();
    for (const x of accounts) for (const f of x.friends) {
      const k = f.username.toLowerCase();
      m.set(k, { f: m.get(k)?.f ?? f, on: [...(m.get(k)?.on ?? []), x] });
    }
    return [...m.values()].sort((p, q) => q.on.length - p.on.length || p.f.displayName.localeCompare(q.f.displayName, "fr"));
  }, [accounts]);
  return (
    <div className="v2-card v2-rise mt-5 overflow-x-auto p-3" style={{ ["--i" as string]: 1 }}>
      <p className="px-1 pb-3 text-[12.5px] text-muted">{plural(rows.length, "amie différente", "amies différentes")} sur {plural(linked.length, "compte relié", "comptes reliés")}. « Partout » = tous les comptes reliés, jamais une modèle chez elle-même.</p>
      <table className="w-full min-w-[720px] text-[13px]">
        <thead><tr className="text-[11.5px] text-muted"><th className="px-3 py-2 text-left font-semibold">Amie</th><th className="px-3 py-2 text-left font-semibold">Affichée sur</th><th className="px-3 py-2 text-right font-semibold" /></tr></thead>
        <tbody>
          {rows.map(({ f, on }) => {
            const others = linked.filter((x) => (x.username || "").toLowerCase() !== f.username.toLowerCase());
            const missing = others.filter((x) => !on.includes(x));
            return (
              <tr key={f.username} className="border-t" style={{ borderColor: "var(--color-line)" }}>
                <td className="px-3 py-2.5"><span className="flex items-center gap-3"><Avatar src={f.avatar} name={f.displayName} size="size-9" /><span className="min-w-0"><b className="block truncate">{f.displayName}</b><span className="text-[11.5px] text-muted">@{f.username}</span></span></span></td>
                <td className="px-3 py-2.5"><span className="flex flex-wrap items-center gap-1"><span className="v2-num mr-1 text-[12px] text-muted">{on.length} / {others.length}</span>{on.map((x) => <span key={x.id} className="v2-tag">{x.name}</span>)}</span></td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {canEdit ? (
                    <>
                      <button disabled={busy || !missing.length} onClick={() => setAsk({ title: `Ajouter ${f.displayName} partout ?`, text: `Elle sera ajoutée sur ${plural(missing.length, "compte")} : ${missing.map((x) => x.name).join(", ")}. Un compte déjà plein (12 amies) est laissé tel quel.`, button: "Ajouter", go: () => add(missing.map((x) => x.id), [f.username]) })} className="v2-btn mr-2" data-kind="ghost" style={{ height: 30 }}><UserPlus className="size-3.5" />Partout</button>
                      <button disabled={busy} onClick={() => setAsk({ title: `Retirer ${f.displayName} partout ?`, text: `Elle disparaît de la liste d’amis de ${plural(on.length, "compte")} : ${on.map((x) => x.name).join(", ")}.`, button: "Retirer partout", go: () => remove(on.map((x) => x.id), [f.username]) })} className="v2-btn" data-kind="danger" style={{ height: 30 }}><X className="size-3.5" />Retirer</button>
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {!rows.length ? <tr><td colSpan={3} className="py-12 text-center text-muted">Aucune amie sur les comptes pour l’instant.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

/** Promo croisée : des amies (ou toutes les modèles de l'agence) sur les comptes choisis, en une fois. */
function Cross({ accounts, max, canEdit, busy, setAsk, add }: { accounts: Account[]; max: number; canEdit: boolean; busy: boolean; setAsk: (a: Ask) => void; add: (c: string[], u: string[]) => Promise<void> }) {
  const linked = accounts.filter((x) => x.linked && !x.error);
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [on, setOn] = useState<string[]>(() => linked.map((x) => x.id));
  const push = () => {
    const n = clean(name);
    if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) setNames([...names, n]);
    setName("");
  };
  const ours = linked.map((x) => x.username).filter((x): x is string => !!x);
  const step = (n: number, title: string, children: React.ReactNode, right?: React.ReactNode) => (
    <div className="v2-card p-4">
      <p className="flex items-center gap-2 text-[14px] font-bold"><span className="grid size-6 place-items-center rounded-full text-[12px]" style={{ background: "rgb(59 130 246 / 0.18)", color: "var(--v2-sky)" }}>{n}</span><span className="flex-1">{title}</span>{right}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
  return (
    <div className="v2-rise mt-5 grid gap-4 lg:grid-cols-3" style={{ ["--i" as string]: 1 }}>
      {step(1, "Les amies à ajouter", (
        <>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && push()} placeholder="Pseudo MYM ou lien du profil" className="v2-field" style={{ height: 34 }} aria-label="Amie à ajouter" />
            <button onClick={push} disabled={!clean(name)} className="v2-btn" data-kind="ghost" style={{ height: 34 }}>Ajouter</button>
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => setNames([...new Set([...names, ...ours])])} className="v2-seg border" style={{ borderColor: "var(--color-line)" }}><Users className="size-3.5" />Toutes mes modèles</button>
            {names.length ? <button onClick={() => setNames([])} className="v2-seg border" style={{ borderColor: "var(--color-line)" }}>Vider</button> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {names.map((n) => <span key={n} className="v2-tag flex items-center gap-1">@{n}<button onClick={() => setNames(names.filter((x) => x !== n))} aria-label={`Enlever ${n}`}><X className="size-3" /></button></span>)}
            {!names.length ? <p className="text-[12.5px] text-muted">Aucune amie choisie.</p> : null}
          </div>
        </>
      ))}
      {step(2, "Sur quels comptes", (
        <div className="space-y-0.5">
          {linked.map((x) => {
            const sel = on.includes(x.id);
            return (
              <button key={x.id} onClick={() => setOn(sel ? on.filter((y) => y !== x.id) : [...on, x.id])} className="v2-pick w-full" data-on={sel} aria-pressed={sel}>
                <span className="grid size-5 shrink-0 place-items-center rounded-md border" style={sel ? { background: "var(--v2-blue)", borderColor: "var(--v2-blue)" } : { borderColor: "rgb(255 255 255 / 0.25)" }}>{sel ? <Check className="size-3.5 text-white" /> : null}</span>
                <Avatar src={x.avatar} name={x.name} size="size-7" />
                <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold">{x.name}</span>
                <span className="v2-num text-[11.5px] text-muted">{x.friends.length} / {max}</span>
              </button>
            );
          })}
          {!linked.length ? <p className="text-[12.5px] text-muted">Aucun compte MYM relié à Bloom.</p> : null}
        </div>
      ), (
        <span className="flex gap-1 text-[11.5px] font-semibold">
          <button onClick={() => setOn(linked.map((x) => x.id))} className="v2-seg">Tous</button>
          <button onClick={() => setOn([])} className="v2-seg">Aucun</button>
        </span>
      ))}
      {step(3, "Lancer", (
        <>
          <p className="text-[12.5px] leading-relaxed text-muted">Chaque amie est ajoutée sur chaque compte choisi, jamais une modèle chez elle-même, et jamais au-delà de {max} amies : un compte plein est laissé tel quel. Rien n’est retiré.</p>
          <p className="mt-3 text-[13px] font-semibold">{names.length && on.length ? `${plural(names.length, "amie")} sur ${plural(on.length, "compte")}` : "Choisis au moins une amie et un compte."}</p>
          <button
            disabled={!canEdit || busy || !names.length || !on.length}
            onClick={() => setAsk({ title: "Lancer la promo croisée ?", text: `${plural(names.length, "amie")} (${names.map((n) => `@${n}`).join(", ")}) sur ${plural(on.length, "compte")} : ${linked.filter((x) => on.includes(x.id)).map((x) => x.name).join(", ")}. Les profils MYM changent tout de suite.`, button: "Ajouter", go: () => add(on, names) })}
            className="v2-btn mt-3 w-full"
          ><UserPlus className="size-4" />{busy ? "Ajout en cours…" : "Ajouter"}</button>
          {!canEdit ? <p className="mt-2 text-[11.5px] text-muted">Réservé aux admins et managers.</p> : null}
        </>
      ))}
    </div>
  );
}
