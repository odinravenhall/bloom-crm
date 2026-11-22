"use client";

import { useEffect, useState } from "react";
import { ArrowDown, Plus, Trash2 } from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn } from "@/lib/fmt";
import { useCreators } from "@/lib/creators";
import { areaCls, btnCls, inputCls } from "@/components/ui";

type Step = { wait: number; text: string };
type Relance = {
  enabled: boolean;
  cutAi: boolean;
  stopOnReply: boolean;
  steps: Step[];
  updatedAt: number | null;
  updatedBy: string | null;
  stats: { waiting: number; running: number; paid: number; paidAmount: number; replied: number; done: number; pinned: number; started: number };
};

const MAX = 6;
const EXAMPLE: Step[] = [
  { wait: 3, text: "Tu l’as ouverte {prenom} ? 🙈" },
  { wait: 10, text: "J’ai hâte de savoir ce que tu en penses… elle est vraiment spéciale celle-là 😏" },
];
const waitLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}` : `${m} min`);

/**
 * Relance auto des PPV de l'IA : délais, textes et nombre de messages, par créatrice.
 * Quand l'IA envoie un PPV pas acheté, Bloom coupe l'IA sur le fan et envoie ces messages, avant de passer la main.
 */
export function RelanceSetup() {
  const { creatorId, creator } = useCreators();
  const [cfg, setCfg] = useState<Relance | null>(null);
  const [draft, setDraft] = useState<Omit<Relance, "stats" | "updatedAt" | "updatedBy"> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!creatorId) return;
    setCfg(null);
    api<Relance>("GET", `/api/relance?creatorId=${encodeURIComponent(creatorId)}`)
      .then(setCfg)
      .catch(() => {});
  }, [creatorId]);
  useEffect(() => {
    if (cfg) setDraft({ enabled: cfg.enabled, cutAi: cfg.cutAi, stopOnReply: cfg.stopOnReply, steps: cfg.steps.length ? cfg.steps : EXAMPLE });
  }, [cfg]);

  if (!cfg || !draft) return <p className="text-sm text-muted">Chargement…</p>;
  const cur = /mym/i.test(creator?.platform || "") ? "€" : "$";
  const changed = JSON.stringify({ enabled: cfg.enabled, cutAi: cfg.cutAi, stopOnReply: cfg.stopOnReply, steps: cfg.steps }) !== JSON.stringify(draft);
  const setStep = (i: number, s: Partial<Step>) => setDraft({ ...draft, steps: draft.steps.map((x, j) => (j === i ? { ...x, ...s } : x)) });
  const save = async (next = draft) => {
    setBusy(true);
    try {
      setCfg(await api<Relance>("POST", "/api/relance", { creatorId, ...next }));
      toast(next.enabled ? "Relance auto activée" : "Relance auto enregistrée (désactivée)");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const total = draft.steps.reduce((a, s) => a + (Number(s.wait) || 0), 0);
  const st = cfg.stats;
  const check = (on: boolean, set: (v: boolean) => void, label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-1 size-4 accent-current" />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Interrupteur */}
      <div className={cn("flex flex-wrap items-center gap-4 rounded-2xl border p-4", cfg.enabled ? "border-primary bg-card-2" : "bg-card")}>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{cfg.enabled ? "Relance auto activée" : "Relance auto désactivée"}</p>
          <p className="text-xs text-muted">
            {cfg.enabled ? `Chaque PPV de l’IA pas acheté au bout de ${waitLabel(cfg.steps[0]?.wait ?? 3)} est relancé par ${cfg.steps.length} message${cfg.steps.length > 1 ? "s" : ""}.` : "Les PPV pas achetés donnent seulement une notification aux chatteurs après 3 min."}
            {cfg.updatedBy ? ` Réglé par ${cfg.updatedBy}.` : ""}
          </p>
        </div>
        <button disabled={busy} onClick={() => save({ ...draft, enabled: !cfg.enabled })} className={cfg.enabled ? btnCls.secondary : btnCls.primary}>
          {cfg.enabled ? "Désactiver" : "Activer"}
        </button>
      </div>

      {/* Résultats des 7 derniers jours */}
      {st.started || st.waiting ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Relances lancées", st.started],
              ["Achetés pendant la relance", st.paid],
              ["Fans qui ont répondu", st.replied],
              ["Sans achat (aux chatteurs)", st.done],
            ] as const
          ).map(([l, v]) => (
            <div key={l} className="rounded-xl border bg-card p-3">
              <p className="text-2xl font-semibold tabular-nums">{v}</p>
              <p className="text-[11px] text-muted">{l}</p>
            </div>
          ))}
          {st.paidAmount ? <p className="col-span-full text-xs text-muted">{st.paidAmount.toLocaleString("fr-FR")} {cur} de PPV achetés après une relance, sur 7 jours.</p> : null}
        </div>
      ) : null}

      {/* Les messages */}
      <div className="flex flex-col">
        <div className="rounded-xl bg-card-2 px-4 py-2.5 text-sm">
          <b>L’IA envoie un PPV</b> <span className="text-muted">(n’importe quel script)</span>
        </div>
        {draft.steps.map((s, i) => (
          <div key={i} className="flex flex-col">
            <div className="flex items-center gap-2 py-2 pl-4 text-xs text-muted">
              <ArrowDown className="size-3.5" />
              pas acheté au bout de
              <input type="number" min={1} max={1440} value={s.wait} onChange={(e) => setStep(i, { wait: Number(e.target.value) })} className={cn(inputCls, "h-8 w-20 px-2 text-center")} />
              min {i === 0 ? "→ l’IA est coupée et la relance commence" : ""}
            </div>
            <div className="flex gap-2 rounded-xl border bg-card p-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-white">{i + 1}</span>
              <textarea value={s.text} onChange={(e) => setStep(i, { text: e.target.value })} rows={2} placeholder="Message envoyé au fan…" className={cn(areaCls, "min-h-16 flex-1")} />
              <button title="Retirer ce message" onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, j) => j !== i) })} className="self-start text-muted hover:text-fg">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
        {draft.steps.length < MAX ? (
          <button onClick={() => setDraft({ ...draft, steps: [...draft.steps, { wait: 15, text: "" }] })} className={cn(btnCls.ghost, "mt-2 self-start")}>
            <Plus className="size-4" /> Ajouter un message
          </button>
        ) : null}
        <div className="mt-2 rounded-xl bg-card-2 px-4 py-2.5 text-sm">
          <b>Toujours pas acheté</b> <span className="text-muted">{draft.steps.length ? `${waitLabel(draft.steps[draft.steps.length - 1].wait || 0)} après le dernier message (environ ${waitLabel(total + (draft.steps[draft.steps.length - 1]?.wait || 0))} après le PPV)` : ""} → notification aux chatteurs, qui prennent la main.</span>
        </div>
        <p className="mt-2 text-xs text-muted">« {"{prenom}"} » est remplacé par le prénom du fan (rien si on ne le connaît pas). Les mots interdits sont vérifiés à l’enregistrement.</p>
      </div>

      <div className="rounded-2xl border bg-card px-4 py-1">
        {check(draft.cutAi, (v) => setDraft({ ...draft, cutAi: v }), "Couper l’IA sur le fan au début de la relance", "Sinon l’IA peut répondre en même temps que la relance.")}
        {check(draft.stopOnReply, (v) => setDraft({ ...draft, stopOnReply: v }), "Arrêter la relance si le fan répond", "Un chatteur est prévenu et négocie à la main.")}
        <p className="pb-2 text-xs text-muted">La relance s’arrête aussi dès que le fan achète, ou qu’un chatteur l’épingle.</p>
      </div>

      {changed ? (
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => save()} className={btnCls.primary}>
            Enregistrer
          </button>
          <button onClick={() => setCfg({ ...cfg })} className={btnCls.ghost}>
            Annuler
          </button>
        </div>
      ) : null}
    </div>
  );
}
