"use client";

import { useEffect, useState } from "react";
import { Bot, ChevronDown, ListChecks, Pencil, Plus, Shuffle, Trash2, UsersRound } from "lucide-react";
import { api, toast } from "@/lib/api";
import { ago, cn } from "@/lib/fmt";
import { useCreators } from "@/lib/creators";
import { Avatar, Pill, btnCls, inputCls } from "@/components/ui";

export type Mode = "hybrid" | "human" | "ai";
type List = { id: number; name: string; minSpent: number; members: number; withAi: number; createdAt: number };
export type Setup = { mode: Mode | null; listId: number | null; payers: number; lists: List[] };
type Member = { fanId: string; name: string; username: string | null; avatar: string | null; spent: number; ai: boolean; joinedAt: number };

const MODES: { id: Mode; title: string; icon: typeof Bot; text: string; ai: boolean }[] = [
  { id: "hybrid", title: "Hybride", icon: Shuffle, ai: true, text: "L’IA parle à tous les fans. Dès qu’un fan entre dans la liste de passage (ex. il a dépensé 1 $), l’IA est coupée sur lui et les chatteurs prennent la main." },
  { id: "human", title: "Humains seulement", icon: UsersRound, ai: false, text: "Pas d’IA : les chatteurs voient et répondent à tous les fans." },
  { id: "ai", title: "Full IA", icon: Bot, ai: true, text: "L’IA fait tout. Les chatteurs ne voient que les fans que l’IA leur passe." },
];

/** Monnaie de la créatrice : $ sur OnlyFans, € sur MYM. */
const useCur = () => {
  const { creator } = useCreators();
  return /mym/i.test(creator?.platform || "") ? "€" : "$";
};
const amount = (v: number, cur: string) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${cur}`;

export function useSetup(creatorId: string | null) {
  const [setup, setSetup] = useState<Setup | null>(null);
  useEffect(() => {
    if (!creatorId) return;
    setSetup(null);
    api<Setup>("GET", `/api/chat-setup?creatorId=${encodeURIComponent(creatorId)}`)
      .then(setSetup)
      .catch(() => {});
  }, [creatorId]);
  return [setup, setSetup] as const;
}

/**
 * « Type de chatting » d'une créatrice : hybride, humains seulement ou full IA.
 * Allume / coupe aussi l'IA de Substy quand il le faut (avec confirmation).
 */
export function ModeSetup({ setup, setSetup, aiOn, setAi }: { setup: Setup; setSetup: (s: Setup) => void; aiOn: boolean; setAi: (on: boolean) => Promise<boolean> }) {
  const { creatorId } = useCreators();
  const cur = useCur();
  const [pick, setPick] = useState<Mode | null>(null);
  const [listId, setListId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  // Par défaut : la liste de passage actuelle, sinon une liste « 1 $ » qui existe déjà.
  useEffect(() => setListId(setup.listId ?? setup.lists.find((l) => l.minSpent === 1)?.id ?? ""), [setup.listId, setup.lists]);

  const choose = async () => {
    if (!pick || !creatorId) return;
    setBusy(true);
    try {
      const wantAi = MODES.find((m) => m.id === pick)!.ai;
      if (wantAi !== aiOn && !(await setAi(wantAi))) return;
      setSetup(await api<Setup>("POST", "/api/chat-setup/mode", { creatorId, mode: pick, listId: listId || null }));
      toast(`Type de chatting : ${MODES.find((m) => m.id === pick)!.title}`);
      setPick(null);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const passList = setup.lists.find((l) => l.id === (listId || setup.listId));
  const willCut = pick === "hybrid" ? (passList ? passList.withAi : null) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => {
          const on = setup.mode === m.id;
          const sel = pick === m.id;
          return (
            <button
              key={m.id}
              disabled={busy}
              onClick={() => setPick(on ? null : m.id)}
              className={cn("flex flex-col gap-2 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/50", on && "border-primary bg-card-2", sel && "border-primary/70")}
            >
              <span className="flex items-center gap-2">
                <span className={cn("grid size-8 place-items-center rounded-lg", on ? "bg-primary text-white" : "bg-card-2 text-muted")}>
                  <m.icon className="size-4" />
                </span>
                <span className="font-semibold">{m.title}</span>
                {on ? <Pill tone="accent" className="ml-auto">actif</Pill> : null}
              </span>
              <span className="text-xs leading-relaxed text-muted">{m.text}</span>
            </button>
          );
        })}
      </div>
      {!setup.mode ? <p className="text-xs text-muted">Pas encore choisi : les chatteurs voient tous les fans et Bloom ne coupe l’IA sur personne.</p> : null}

      {pick ? (
        <div className="rounded-2xl border border-primary/40 bg-card p-4 text-sm">
          <p className="font-semibold">Passer en « {MODES.find((m) => m.id === pick)!.title} » ?</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted">
            {MODES.find((m) => m.id === pick)!.ai !== aiOn ? <li>{aiOn ? "L’IA de Substy sera coupée pour cette créatrice." : "L’IA de Substy sera allumée : elle va écrire aux fans."}</li> : null}
            {pick === "hybrid" ? (
              <>
                <li>
                  Liste de passage :{" "}
                  <select value={listId} onChange={(e) => setListId(e.target.value ? Number(e.target.value) : "")} className={cn(inputCls, "inline-block h-8 w-auto px-3 py-0 text-sm")}>
                    {!setup.lists.some((l) => l.minSpent === 1) ? <option value="">Payeurs (a dépensé 1 {cur}) · créée automatiquement</option> : null}
                    {setup.lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} (a dépensé {amount(l.minSpent, cur)})
                      </option>
                    ))}
                  </select>
                </li>
                <li>
                  {willCut == null
                    ? `Les fans qui ont déjà dépensé (environ ${setup.payers}) passent tout de suite aux chatteurs : l’IA est coupée sur eux.`
                    : willCut
                      ? `${willCut} fan${willCut > 1 ? "s" : ""} de cette liste ont encore l’IA : elle sera coupée sur eux tout de suite.`
                      : "Aucun fan de cette liste n’a l’IA allumée pour l’instant."}
                </li>
                <li>Ensuite, chaque fan qui entre dans la liste passe aux chatteurs (en moins d’une minute après son achat).</li>
                <li>Les chatteurs ne voient que les fans sans IA ; les managers voient tout.</li>
              </>
            ) : pick === "ai" ? (
              <li>Les chatteurs ne voient plus que les fans que l’IA leur passe (ou dont l’IA est coupée).</li>
            ) : (
              <li>Les chatteurs voient tous les fans.</li>
            )}
          </ul>
          <div className="mt-3 flex gap-2">
            <button disabled={busy} onClick={choose} className={btnCls.primary}>
              {busy ? "…" : "Confirmer"}
            </button>
            <button disabled={busy} onClick={() => setPick(null)} className={btnCls.ghost}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Listes automatiques d'une créatrice : chaque fan entre tout seul dans une liste dès qu'il remplit sa règle. */
export function AutoLists({ setup, setSetup, canEdit }: { setup: Setup; setSetup: (s: Setup) => void; canEdit: boolean }) {
  const { creatorId } = useCreators();
  const cur = useCur();
  const [edit, setEdit] = useState<{ id?: number; name: string; min: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMembers(null);
    if (open == null || !creatorId) return;
    api<Member[]>("GET", `/api/chat-setup/members?creatorId=${encodeURIComponent(creatorId)}&listId=${open}`)
      .then(setMembers)
      .catch((e) => toast((e as Error).message, "err"));
  }, [open, creatorId]);

  const post = async (path: string, payload: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      setSetup(await api<Setup>("POST", `/api/chat-setup/${path}`, { creatorId, ...payload }));
      toast(ok);
      return true;
    } catch (e) {
      toast((e as Error).message, "err");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {setup.lists.map((l) => (
        <div key={l.id} className="rounded-2xl border bg-card">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid size-9 place-items-center rounded-lg bg-card-2">
              <ListChecks className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {l.name}
                {setup.mode === "hybrid" && setup.listId === l.id ? <Pill tone="accent">liste de passage</Pill> : null}
              </p>
              <p className="text-xs text-muted">A dépensé au moins {amount(l.minSpent, cur)} · abonnement non compté</p>
            </div>
            <span className="text-right">
              <span className="block text-lg font-semibold tabular-nums">{l.members}</span>
              <span className="text-[11px] text-muted">fans</span>
            </span>
            <button onClick={() => setOpen(open === l.id ? null : l.id)} className={btnCls.ghost}>
              <ChevronDown className={cn("size-4 transition-transform", open === l.id && "rotate-180")} /> Voir
            </button>
            {canEdit ? (
              <>
                <button title="Modifier" onClick={() => setEdit({ id: l.id, name: l.name, min: String(l.minSpent) })} className={btnCls.ghost}>
                  <Pencil className="size-4" />
                </button>
                <button title="Supprimer" disabled={busy} onClick={() => confirm(`Supprimer la liste « ${l.name} » ?`) && post("list/delete", { id: l.id }, "Liste supprimée")} className={btnCls.ghost}>
                  <Trash2 className="size-4" />
                </button>
              </>
            ) : null}
          </div>
          {open === l.id ? (
            <div className="scroll-thin max-h-80 overflow-y-auto border-t p-2">
              {!members ? <p className="p-3 text-center text-sm text-muted">Chargement…</p> : null}
              {members && !members.length ? <p className="p-3 text-center text-sm text-muted">Aucun fan pour l’instant.</p> : null}
              {members?.map((m) => (
                <div key={m.fanId} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                  <Avatar src={m.avatar} name={m.name} size="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.name}</span>
                    <span className="block text-[11px] text-muted">entré {ago(m.joinedAt)}</span>
                  </span>
                  <span className="text-sm tabular-nums">{amount(m.spent, cur)}</span>
                  {m.ai ? <Pill tone="warn">IA allumée</Pill> : <Pill>chatteurs</Pill>}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
      {!setup.lists.length && !edit ? <p className="text-sm text-muted">Aucune liste pour cette créatrice.</p> : null}

      {edit ? (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-primary/40 bg-card p-4">
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-semibold text-muted">
            Nom
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Payeurs" className={inputCls} />
          </label>
          <label className="flex w-40 flex-col gap-1 text-xs font-semibold text-muted">
            A dépensé au moins ({cur})
            <input type="number" min={0.01} step="any" value={edit.min} onChange={(e) => setEdit({ ...edit, min: e.target.value })} className={inputCls} />
          </label>
          <button disabled={busy} onClick={async () => (await post("list", { id: edit.id, name: edit.name, minSpent: Number(edit.min) }, edit.id ? "Liste modifiée" : "Liste créée")) && setEdit(null)} className={btnCls.primary}>
            {edit.id ? "Enregistrer" : "Créer"}
          </button>
          <button onClick={() => setEdit(null)} className={btnCls.ghost}>
            Annuler
          </button>
        </div>
      ) : canEdit ? (
        <button onClick={() => setEdit({ name: "", min: "1" })} className={cn(btnCls.ghost, "self-start")}>
          <Plus className="size-4" /> Nouvelle liste
        </button>
      ) : null}
    </div>
  );
}
