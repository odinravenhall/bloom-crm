"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bot, ChevronDown, ExternalLink, Pause, Power, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/fmt";
import { CreatorTabs, useCreators } from "@/lib/creators";
import { Pill } from "@/components/ui";

type Preset = { id: string; name: string; description: string | null; builtin: boolean; prompt: string; emojis: { casual: string[]; sexting: string[]; negotiation: string[] } };
type Cfg = { settings: Record<string, unknown>; preset: Preset | null; presets: Preset[]; profile: Record<string, unknown>; missing: string[] };

const v = (x: unknown) => (x === null || x === undefined || x === "" || (Array.isArray(x) && !x.length) ? null : x);
const show = (x: unknown) => {
  if (v(x) === null) return null;
  if (Array.isArray(x)) return x.map((y) => (typeof y === "object" ? JSON.stringify(y) : String(y))).join(", ");
  if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}T/.test(x)) return new Date(x).toLocaleDateString("fr-FR");
  return String(x);
};
const SUBS: Record<string, string> = { FREE: "abonnés gratuits", PAID: "abonnés payants", TRIAL: "essais", RENEWING: "abonnés qui renouvellent" };
const OP: Record<string, string> = { LESS_THAN_OR_EQUAL: "jusqu’à", GREATER_THAN_OR_EQUAL: "à partir de", LESS_THAN: "moins de", GREATER_THAN: "plus de" };
const UNIT: Record<string, string> = { DAYS: "jours", WEEKS: "semaines", MONTHS: "mois", DAY: "jours", MONTH: "mois" };

// Fiche de la créatrice : les champs de Substy rangés en blocs clairs.
const PROFILE: [string, [string, string][]][] = [
  ["Identité", [["name", "Nom"], ["label", "Libellé"], ["pseudo", "Pseudo"], ["age", "Âge"], ["gender", "Genre"], ["birthday", "Anniversaire"]]],
  ["Vie et langues", [["living", "Ville"], ["profession", "Métier"], ["timezone", "Fuseau horaire"], ["primaryLanguage", "Langue maternelle"], ["otherLanguages", "Autres langues"]]],
  ["Physique", [["appearance", "Apparence"], ["hairColor", "Cheveux"], ["eyeColor", "Yeux"], ["ethnicity", "Origines"], ["weight", "Poids"], ["shoeSize", "Pointure"], ["braCupSize", "Bonnet"]]],
  ["Goûts et infos libres", [["description", "Description"], ["customAttributes", "Infos en plus"]]],
];

/** Configuration de l'IA d'une créatrice : tout ce que Substy répartit sur 4 pages, au même endroit et en français. */
export function AiConfig() {
  const { creatorId, creator } = useCreators();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [err, setErr] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  useEffect(() => {
    if (!creatorId) return;
    setCfg(null);
    setErr("");
    api<Cfg>("GET", `/api/ai-config?creatorId=${encodeURIComponent(creatorId)}`)
      .then(setCfg)
      .catch((e) => setErr((e as Error).message));
  }, [creatorId]);

  const s = cfg?.settings ?? {};
  const on = !!s.enable;
  const mode = !on ? "off" : String(s.aiMode || "").includes("HYBRID") ? "hybrid" : "full";
  const substy = creatorId ? `https://app.substy.ai/settings/general?creatorId=${creatorId}` : "https://app.substy.ai";

  const section = (icon: typeof Bot, title: string, sub: string, children: React.ReactNode) => {
    const Icon = icon;
    return (
      <section className="grid gap-4 border-b py-8 md:grid-cols-[260px_1fr]">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <Icon className="size-5 text-primary" /> {title}
          </h2>
          <p className="mt-1 text-sm text-muted">{sub}</p>
        </div>
        <div>{children}</div>
      </section>
    );
  };
  const line = (label: string, value: React.ReactNode, hint?: string) => (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line/60 py-3 last:border-0">
      <div>
        <p className="font-semibold">{label}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      <div className="text-right text-sm">{value}</div>
    </div>
  );
  const yes = (b: unknown, y = "Oui", n = "Non") => (b ? <Pill tone="good">{y}</Pill> : <Pill>{n}</Pill>);

  const stops: string[] = [];
  if (s.enableFanSpendLimit && s.maxFanSpend != null) stops.push(`le fan a dépensé ${OP[String(s.fanSpendOperator)] ?? ""} ${s.maxFanSpend} $`.replace(/\s+/g, " "));
  if (s.enableSubscriptionLimit && s.maxSubscriptionDurationValue != null)
    stops.push(`abonné depuis ${OP[String(s.subscriptionDurationOperator)] ?? ""} ${s.maxSubscriptionDurationValue} ${UNIT[String(s.maxSubscriptionDurationUnit)] ?? String(s.maxSubscriptionDurationUnit || "").toLowerCase()}`.replace(/\s+/g, " "));

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl">Configuration IA</h1>
          <p className="mt-1 text-sm text-muted">{creator ? `L’IA de ${creator.name}, telle qu’elle est réglée sur Substy.` : "Choisis une créatrice."}</p>
        </div>
        <CreatorTabs />
      </div>

      {err ? <p className="mt-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">{err}</p> : null}
      {!cfg && !err ? <p className="mt-10 text-center text-sm text-muted">Chargement…</p> : null}

      {cfg ? (
        <>
          {/* État de l'IA */}
          <div className={cn("mt-6 flex flex-wrap items-center gap-5 rounded-[2rem] border p-6", on ? "bg-sage-soft" : "bg-card")}>
            <span className={cn("grid size-14 place-items-center rounded-full", on ? "bg-sage text-white" : "bg-card-2 text-muted")}>{on ? <Power className="size-6" /> : <Pause className="size-6" />}</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-3xl font-semibold">{mode === "off" ? "IA coupée" : mode === "hybrid" ? "IA hybride" : "IA complète"}</p>
              <p className="text-sm text-muted">
                {mode === "off"
                  ? "L’IA n’envoie aucun message : les chatteurs répondent à tout."
                  : mode === "hybrid"
                    ? "L’IA chatte d’abord ; quand un fan passe les seuils ci-dessous, seule l’équipe peut répondre."
                    : "L’IA mène toute la conversation : scripts, ventes et relances."}
                {on ? (s.aiScheduleMode === "FULL_TIME" ? " Active jour et nuit." : " Active selon les shifts de l’équipe.") : ""}
              </p>
            </div>
            <a href={substy} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm font-semibold hover:border-primary/60">
              Modifier sur Substy <ExternalLink className="size-3.5" />
            </a>
          </div>
          {cfg.missing.length ? (
            <p className="mt-3 flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <AlertTriangle className="size-4 shrink-0" /> Substy ne peut pas allumer l’IA tant que la fiche n’est pas complète : il manque <b>{cfg.missing.join(" et ").toLowerCase()}</b>.
            </p>
          ) : null}

          {section(
            Sparkles,
            "Personnalité",
            "La façon dont l’IA parle : le ton, le style et les emojis.",
            <div className="flex flex-col gap-3">
              {cfg.preset ? (
                <div className="rounded-3xl border bg-card p-5">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-2xl font-semibold">{cfg.preset.name}</p>
                    <Pill tone="accent">utilisée</Pill>
                    {cfg.preset.builtin ? <Pill>fournie par Substy</Pill> : <Pill tone="good">créée par l’agence</Pill>}
                  </div>
                  {cfg.preset.description ? <p className="mt-1 text-sm text-muted">{cfg.preset.description}</p> : null}
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["Discussion", cfg.preset.emojis.casual],
                        ["Sexting", cfg.preset.emojis.sexting],
                        ["Négociation", cfg.preset.emojis.negotiation],
                      ] as const
                    ).map(([l, e]) => (
                      <div key={l} className="rounded-2xl bg-card-2 p-3">
                        <p className="text-xs font-semibold text-muted">{l}</p>
                        <p className="mt-1 text-lg leading-relaxed">{e.length ? e.join(" ") : "—"}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setShowPrompt((x) => !x)} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-soft">
                    <ChevronDown className={cn("size-4 transition-transform", showPrompt && "rotate-180")} /> {showPrompt ? "Masquer" : "Voir"} la consigne donnée à l’IA
                  </button>
                  {showPrompt ? <p className="mt-2 rounded-2xl bg-card-2 p-4 text-sm whitespace-pre-wrap">{cfg.preset.prompt}</p> : null}
                </div>
              ) : (
                <p className="text-sm text-muted">Aucune personnalité choisie.</p>
              )}
              {cfg.presets.filter((p) => p.id !== cfg.preset?.id).length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {cfg.presets
                    .filter((p) => p.id !== cfg.preset?.id)
                    .map((p) => (
                      <div key={p.id} className="rounded-2xl border bg-card p-4">
                        <p className="flex items-center gap-2 font-semibold">
                          {p.name} {p.builtin ? null : <Pill tone="good">agence</Pill>}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{p.description}</p>
                        <p className="mt-2 text-sm">{p.emojis.casual.slice(0, 8).join(" ")}</p>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>,
          )}

          {section(
            Bot,
            "Comment l’IA vend",
            "Le moment où elle passe au payant, les scripts, les emojis.",
            <div className="rounded-3xl border bg-card px-5">
              {line("Passage au payant", s.transitionTimingMode === "AUTO" ? "Automatique" : String(s.transitionTimingMode ?? "—"), "Quand l’IA commence à amener le fan vers du contenu payant.")}
              {line("Changement de scripts", s.scriptRotationIntervalHours ? `toutes les ${s.scriptRotationIntervalHours} h` : "—", "L’IA varie ses scripts pour ne pas répéter les mêmes phrases.")}
              {line("Emojis en discussion", yes(s.standardEmojis))}
              {line("Emojis en sexting", yes(s.sextingEmojis))}
              {line("Pendant les shifts de l’équipe", s.teamShiftAiMode === "KEEP_ANSWERING" ? "L’IA continue de répondre" : String(s.teamShiftAiMode ?? "—"))}
            </div>,
          )}

          {section(
            ShieldCheck,
            "Quand l’IA s’arrête",
            "Les règles qui la font passer la main à l’équipe.",
            <div className="rounded-3xl border bg-card px-5">
              {line(
                "Le fan passe à l’équipe quand",
                stops.length ? stops.join(s.stopConditionsOperator === "OR" ? " ou " : " et ") : <span className="text-muted">aucune règle</span>,
                stops.length > 1 ? (s.stopConditionsOperator === "OR" ? "Une seule condition suffit." : "Toutes les conditions doivent être vraies.") : undefined,
              )}
              {line("Fans concernés", Array.isArray(s.allowedSubscriptionTypes) ? (s.allowedSubscriptionTypes as string[]).map((t) => SUBS[t] ?? t.toLowerCase()).join(", ") : "—")}
              {line("Listes de fans incluses", (s.includedFanLists as unknown[])?.length ? `${(s.includedFanLists as unknown[]).length} liste(s)` : "toutes")}
              {line("Listes de fans exclues", (s.excludedFanLists as unknown[])?.length ? `${(s.excludedFanLists as unknown[]).length} liste(s)` : "aucune")}
              {line("Chatte aussi avec les créatrices vérifiées", yes(s.allowVerifiedCreators))}
              {line("Dit aux fans que c’est une IA", yes(s.replyAsAi), "Option de Substy : l’IA précise que ses messages sont générés.")}
            </div>,
          )}

          {section(
            UserRound,
            "Fiche de la créatrice",
            "Ce que l’IA sait d’elle. Plus la fiche est complète, plus l’IA est crédible.",
            <div className="grid gap-3 sm:grid-cols-2">
              {PROFILE.map(([title, fields]) => {
                const filled = fields.filter(([k]) => v(cfg.profile[k]) !== null).length;
                return (
                  <div key={title} className="rounded-3xl border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{title}</p>
                      <span className="text-xs text-muted">
                        {filled}/{fields.length}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card-2">
                      <div className="h-full rounded-full bg-sage" style={{ width: `${(filled / fields.length) * 100}%` }} />
                    </div>
                    <dl className="mt-3 flex flex-col gap-1 text-sm">
                      {fields.map(([k, l]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <dt className="text-muted">{l}</dt>
                          <dd className={cn("text-right", v(cfg.profile[k]) === null && "text-muted/60")}>{show(cfg.profile[k]) ?? "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })}
            </div>,
          )}

          <p className="mt-6 text-xs text-muted">Pour l’instant, Bloom affiche la configuration ; la modifier depuis Bloom arrive bientôt (en attendant : « Modifier sur Substy »).</p>
        </>
      ) : null}
    </div>
  );
}
