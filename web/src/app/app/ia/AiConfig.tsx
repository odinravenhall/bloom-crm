"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BellRing, Bot, Shuffle, ChevronDown, ExternalLink, History, Pause, Power, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { api, toast } from "@/lib/api";
import { ago, cn } from "@/lib/fmt";
import { CreatorTabs, useCreators } from "@/lib/creators";
import { Pill, btnCls, inputCls } from "@/components/ui";
import { ModeSetup, useSetup } from "./ChatSetup";
import { RelanceSetup } from "./RelanceSetup";

type Preset = { id: string; name: string; description: string | null; builtin: boolean; prompt: string; emojis: { casual: string[]; sexting: string[]; negotiation: string[] } };
type Change = { what: string; detail: string | null; at: number; name: string | null };
type Cfg = { settings: Record<string, unknown>; preset: Preset | null; presets: Preset[]; profile: Record<string, unknown>; missing: string[]; changes: Change[] };

const v = (x: unknown) => (x === null || x === undefined || x === "" || (Array.isArray(x) && !x.length) ? null : x);
const show = (x: unknown) => {
  if (v(x) === null) return null;
  if (Array.isArray(x)) return x.map((y) => (typeof y === "object" ? JSON.stringify(y) : String(y))).join(", ");
  if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}T/.test(x)) return new Date(x).toLocaleDateString("fr-FR");
  return String(x);
};
const SUBS: [string, string][] = [
  ["FREE", "abonnés gratuits"],
  ["PAID", "abonnés payants"],
];
const OP: Record<string, string> = { LESS_THAN_OR_EQUAL: "jusqu’à", GREATER_THAN_OR_EQUAL: "à partir de", LESS_THAN: "moins de", GREATER_THAN: "plus de" };
const LANGS: [string, string][] = [
  ["fr", "Français"],
  ["en", "Anglais"],
  ["es", "Espagnol"],
  ["it", "Italien"],
  ["de", "Allemand"],
  ["pt", "Portugais"],
];
const ZONES = ["Europe/Paris", "Europe/Brussels", "Europe/Zurich", "Europe/London", "Europe/Madrid", "Europe/Rome", "Europe/Berlin", "Europe/Lisbon", "America/Montreal", "America/New_York", "America/Los_Angeles", "Africa/Casablanca", "Indian/Reunion", "America/Guadeloupe"];
const GENDERS: [string, string][] = [
  ["FEMALE", "Femme"],
  ["MALE", "Homme"],
  ["OTHER", "Autre"],
];
// Fiche de la créatrice : les champs de Substy rangés en blocs clairs. type : t = texte, n = nombre, d = date, l = langue, z = fuseau, g = genre, a = texte long.
const PROFILE: [string, [string, string, string][]][] = [
  ["Identité", [["name", "Nom", "t"], ["label", "Libellé", "t"], ["pseudo", "Pseudo", "t"], ["age", "Âge", "n"], ["gender", "Genre", "g"], ["birthday", "Anniversaire", "d"]]],
  ["Vie et langues", [["living", "Ville", "t"], ["profession", "Métier", "t"], ["timezone", "Fuseau horaire", "z"], ["primaryLanguage", "Langue maternelle", "l"]]],
  ["Physique", [["appearance", "Apparence", "t"], ["hairColor", "Cheveux", "t"], ["eyeColor", "Yeux", "t"], ["ethnicity", "Origines", "t"], ["weight", "Poids (kg)", "n"], ["shoeSize", "Pointure", "n"], ["braCupSize", "Bonnet", "t"]]],
  ["Goûts et infos libres", [["description", "Description", "a"]]],
];
const label = (k: string, val: unknown) => {
  if (val == null || val === "") return null;
  if (k === "primaryLanguage") return LANGS.find(([c]) => c === val)?.[1] ?? String(val);
  if (k === "gender") return GENDERS.find(([c]) => c === val)?.[1] ?? String(val);
  return show(val);
};

/** Configuration de l'IA d'une créatrice : tout ce que Substy répartit sur 4 pages, au même endroit, en français, modifiable. */
export function AiConfig() {
  const { creatorId, creator } = useCreators();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [confirmOn, setConfirmOn] = useState(false);
  const [editProfile, setEditProfile] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [rot, setRot] = useState("");
  const [spend, setSpend] = useState("");
  const [setup, setSetup] = useSetup(creatorId);

  useEffect(() => {
    if (!creatorId) return;
    setCfg(null);
    setErr("");
    setEditProfile(false);
    setConfirmOn(false);
    api<Cfg>("GET", `/api/ai-config?creatorId=${encodeURIComponent(creatorId)}`)
      .then(setCfg)
      .catch((e) => setErr((e as Error).message));
  }, [creatorId]);
  useEffect(() => {
    setRot(cfg?.settings.scriptRotationIntervalHours != null ? String(cfg.settings.scriptRotationIntervalHours) : "");
    setSpend(cfg?.settings.maxFanSpend != null ? String(cfg.settings.maxFanSpend) : "");
  }, [cfg]);

  const save = async (path: string, payload: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      setCfg(await api<Cfg>("POST", `/api/ai-config/${path}`, { creatorId, ...payload }));
      toast(ok);
      return true;
    } catch (e) {
      toast((e as Error).message, "err");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const setting = (changes: Record<string, unknown>, ok = "Enregistré sur Substy") => save("settings", { changes }, ok);

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
  const line = (lbl: string, value: React.ReactNode, hint?: string) => (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line/60 py-3 last:border-0">
      <div className="min-w-0">
        <p className="font-semibold">{lbl}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      <div className="text-right text-sm">{value}</div>
    </div>
  );
  const toggle = (key: string, value: boolean) => (
    <button
      disabled={busy}
      onClick={() => setting({ [key]: !value })}
      role="switch"
      aria-checked={value}
      className={cn("relative h-6 w-11 rounded-full transition-colors disabled:opacity-50", value ? "bg-sage" : "bg-line")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", value ? "left-[22px]" : "left-0.5")} />
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl">Configuration IA</h1>
          <p className="mt-1 text-sm text-muted">{creator ? `L’IA de ${creator.name}. Chaque changement est enregistré directement sur Substy.` : "Choisis une créatrice."}</p>
        </div>
        <CreatorTabs />
      </div>

      {err ? <p className="mt-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300">{err}</p> : null}
      {!cfg && !err ? <p className="mt-10 text-center text-sm text-muted">Chargement…</p> : null}

      {cfg ? (
        <>
          {setup
            ? section(
                Shuffle,
                "Type de chatting",
                "Qui parle aux fans de cette créatrice : l’IA, les chatteurs, ou les deux.",
                <ModeSetup setup={setup} setSetup={setSetup} aiOn={on} setAi={(v) => setting({ enable: v }, v ? "IA allumée" : "IA coupée")} />,
              )
            : null}
          {section(BellRing, "Relance auto des PPV", "Quand l’IA envoie un PPV que le fan n’achète pas, Bloom coupe l’IA et le relance avec vos messages, avant de passer la main aux chatteurs.", <RelanceSetup />)}

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
            {on ? (
              <button disabled={busy} onClick={() => setting({ enable: false }, "IA coupée : les chatteurs reprennent la main")} className={btnCls.secondary}>
                <Pause className="size-4" /> Couper l’IA
              </button>
            ) : confirmOn ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">L’IA va écrire aux fans. Sûr ?</span>
                <button disabled={busy} onClick={async () => (await setting({ enable: true }, "IA allumée")) && setConfirmOn(false)} className={btnCls.primary}>
                  Oui, allumer
                </button>
                <button onClick={() => setConfirmOn(false)} className={btnCls.ghost}>
                  Annuler
                </button>
              </span>
            ) : (
              <button disabled={busy || cfg.missing.length > 0} onClick={() => setConfirmOn(true)} className={btnCls.primary} title={cfg.missing.length ? "Complète d’abord la fiche" : ""}>
                <Power className="size-4" /> Allumer l’IA
              </button>
            )}
          </div>
          {cfg.missing.length ? (
            <p className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <AlertTriangle className="size-4 shrink-0" /> Substy ne peut pas allumer l’IA tant que la fiche n’est pas complète : il manque <b>{cfg.missing.join(" et ").toLowerCase()}</b>.
              <button
                onClick={() => {
                  setDraft({ ...cfg.profile });
                  setEditProfile(true);
                  document.getElementById("fiche")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="font-semibold underline"
              >
                Compléter la fiche
              </button>
            </p>
          ) : null}

          {section(
            Sparkles,
            "Personnalité",
            "La façon dont l’IA parle : le ton, le style et les emojis.",
            <div className="flex flex-col gap-3">
              {cfg.preset ? (
                <div className="rounded-3xl border bg-card p-5">
                  <div className="flex flex-wrap items-center gap-2">
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
              <div className="grid gap-2 sm:grid-cols-2">
                {cfg.presets
                  .filter((p) => p.id !== cfg.preset?.id)
                  .map((p) => (
                    <div key={p.id} className="flex flex-col rounded-2xl border bg-card p-4">
                      <p className="flex items-center gap-2 font-semibold">
                        {p.name} {p.builtin ? null : <Pill tone="good">agence</Pill>}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{p.description}</p>
                      <p className="mt-2 text-sm">{p.emojis.casual.slice(0, 8).join(" ")}</p>
                      <button disabled={busy} onClick={() => save("preset", { voicePresetId: p.id }, `Personnalité « ${p.name} » choisie`)} className={cn(btnCls.ghost, "mt-2 self-start")}>
                        Utiliser cette personnalité
                      </button>
                    </div>
                  ))}
              </div>
            </div>,
          )}

          {section(
            Bot,
            "Comment l’IA vend",
            "Le moment où elle passe au payant, les scripts, les emojis.",
            <div className="rounded-3xl border bg-card px-5">
              {line("Passage au payant", s.transitionTimingMode === "AUTO" ? "Automatique" : String(s.transitionTimingMode ?? "—"), "Quand l’IA commence à amener le fan vers du contenu payant.")}
              {line(
                "Changement de scripts",
                <span className="flex items-center gap-2">
                  toutes les
                  <input type="number" min={8} max={24} value={rot} onChange={(e) => setRot(e.target.value)} className={cn(inputCls, "h-9 w-20 px-3 text-center")} />
                  heures
                  {rot !== String(s.scriptRotationIntervalHours ?? "") ? (
                    <button disabled={busy} onClick={() => setting({ scriptRotationIntervalHours: Number(rot) })} className={btnCls.ghost}>
                      Enregistrer
                    </button>
                  ) : null}
                </span>,
                "L’IA varie ses scripts pour ne pas répéter les mêmes phrases (8 à 24 h).",
              )}
              {line("Emojis en discussion", toggle("standardEmojis", !!s.standardEmojis))}
              {line("Emojis en sexting", toggle("sextingEmojis", !!s.sextingEmojis))}
              {line("Pendant les shifts de l’équipe", s.teamShiftAiMode === "KEEP_ANSWERING" ? "L’IA continue de répondre" : String(s.teamShiftAiMode ?? "—"))}
            </div>,
          )}

          {section(
            ShieldCheck,
            "Quand l’IA s’arrête",
            "Les règles qui la font passer la main à l’équipe.",
            <div className="rounded-3xl border bg-card px-5">
              {line(
                "Passer le fan à l’équipe selon ce qu’il a dépensé",
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {toggle("enableFanSpendLimit", !!s.enableFanSpendLimit)}
                  {s.enableFanSpendLimit ? (
                    <>
                      <span className="text-muted">{OP[String(s.fanSpendOperator)] ?? ""}</span>
                      <input type="number" min={0} value={spend} onChange={(e) => setSpend(e.target.value)} className={cn(inputCls, "h-9 w-24 px-3 text-center")} />
                      <span>$</span>
                      {spend !== String(s.maxFanSpend ?? "") ? (
                        <button disabled={busy} onClick={() => setting({ maxFanSpend: spend === "" ? null : Number(spend) })} className={btnCls.ghost}>
                          Enregistrer
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </span>,
              )}
              {s.enableSubscriptionLimit ? line("Selon la durée d’abonnement", `${OP[String(s.subscriptionDurationOperator)] ?? ""} ${s.maxSubscriptionDurationValue ?? "—"} ${String(s.maxSubscriptionDurationUnit ?? "").toLowerCase()}`, "À modifier sur Substy pour l’instant.") : null}
              {line(
                "Fans avec qui l’IA chatte",
                <span className="flex flex-wrap justify-end gap-2">
                  {SUBS.map(([k, l]) => {
                    const list = Array.isArray(s.allowedSubscriptionTypes) ? (s.allowedSubscriptionTypes as string[]) : [];
                    const has = list.includes(k);
                    return (
                      <button
                        key={k}
                        disabled={busy}
                        onClick={() => setting({ allowedSubscriptionTypes: has ? list.filter((x) => x !== k) : [...list, k] })}
                        className={cn("rounded-full border px-3 py-1 text-xs font-semibold", has ? "border-primary bg-petal text-primary-soft" : "text-muted hover:text-fg")}
                      >
                        {l}
                      </button>
                    );
                  })}
                </span>,
              )}
              {line("Listes de fans incluses", (s.includedFanLists as unknown[])?.length ? `${(s.includedFanLists as unknown[]).length} liste(s)` : "toutes")}
              {line("Listes de fans exclues", (s.excludedFanLists as unknown[])?.length ? `${(s.excludedFanLists as unknown[]).length} liste(s)` : "aucune")}
              {line("Chatte aussi avec les créatrices vérifiées", s.allowVerifiedCreators ? <Pill tone="good">Oui</Pill> : <Pill>Non</Pill>, "À modifier sur Substy pour l’instant.")}
              {line("Dit aux fans que c’est une IA", s.replyAsAi ? <Pill tone="good">Oui</Pill> : <Pill>Non</Pill>, "À modifier sur Substy pour l’instant.")}
            </div>,
          )}

          <div id="fiche" />
          {section(
            UserRound,
            "Fiche de la créatrice",
            "Ce que l’IA sait d’elle. Plus la fiche est complète, plus l’IA est crédible.",
            <div className="flex flex-col gap-3">
              <div className="flex justify-end gap-2">
                {editProfile ? (
                  <>
                    <button onClick={() => setEditProfile(false)} className={btnCls.secondary}>
                      Annuler
                    </button>
                    <button disabled={busy} onClick={async () => (await save("profile", { profile: draft }, "Fiche enregistrée sur Substy")) && setEditProfile(false)} className={btnCls.primary}>
                      Enregistrer la fiche
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setDraft({ ...cfg.profile });
                      setEditProfile(true);
                    }}
                    className={btnCls.secondary}
                  >
                    Modifier la fiche
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {PROFILE.map(([title, fields]) => {
                  const filled = fields.filter(([k]) => v(cfg.profile[k]) !== null).length;
                  return (
                    <div key={title} className={cn("rounded-3xl border bg-card p-4", title.startsWith("Goûts") && "sm:col-span-2")}>
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{title}</p>
                        <span className="text-xs text-muted">
                          {filled}/{fields.length}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card-2">
                        <div className="h-full rounded-full bg-sage" style={{ width: `${(filled / fields.length) * 100}%` }} />
                      </div>
                      <dl className="mt-3 flex flex-col gap-2 text-sm">
                        {fields.map(([k, l, t]) => (
                          <div key={k} className={cn("flex gap-3", t === "a" && editProfile ? "flex-col" : "items-center justify-between")}>
                            <dt className="shrink-0 text-muted">{l}</dt>
                            {editProfile ? (
                              <Field type={t} value={draft[k]} onChange={(x) => setDraft((d) => ({ ...d, [k]: x }))} />
                            ) : (
                              <dd className={cn("text-right", v(cfg.profile[k]) === null && "text-muted/60")}>{label(k, cfg.profile[k]) ?? "—"}</dd>
                            )}
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
              </div>
            </div>,
          )}

          {cfg.changes.length ? (
            <section className="py-8">
              <h2 className="flex items-center gap-2 text-2xl">
                <History className="size-5 text-primary" /> Dernières modifications depuis Bloom
              </h2>
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {cfg.changes.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted">{ago(c.at)}</span>
                    <b>{c.name ?? "?"}</b>
                    <span>{c.what === "settings" ? "a modifié les réglages" : c.what === "preset" ? "a changé la personnalité" : "a modifié la fiche"}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="mt-2 flex items-center gap-1 text-xs text-muted">
            Quelques réglages rares (durée d’abonnement, listes, créatrices vérifiées, message de l’IA) se changent encore sur
            <a href={substy} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-primary-soft">
              Substy <ExternalLink className="size-3" />
            </a>
            .
          </p>
        </>
      ) : null}
    </div>
  );
}

/** Un champ de la fiche, selon son type. */
function Field({ type, value, onChange }: { type: string; value: unknown; onChange: (v: unknown) => void }) {
  const val = value == null ? "" : String(value);
  const cls = cn(inputCls, "h-9 max-w-[240px] px-3");
  if (type === "l")
    return (
      <select value={val} onChange={(e) => onChange(e.target.value || null)} className={cls}>
        <option value="">—</option>
        {LANGS.map(([c, l]) => (
          <option key={c} value={c}>
            {l}
          </option>
        ))}
      </select>
    );
  if (type === "z")
    return (
      <select value={val} onChange={(e) => onChange(e.target.value || null)} className={cls}>
        <option value="">—</option>
        {[...new Set([val, ...ZONES])].filter(Boolean).map((z) => (
          <option key={z} value={z}>
            {z.replace("_", " ")}
          </option>
        ))}
      </select>
    );
  if (type === "g")
    return (
      <select value={val} onChange={(e) => onChange(e.target.value || null)} className={cls}>
        <option value="">—</option>
        {GENDERS.map(([c, l]) => (
          <option key={c} value={c}>
            {l}
          </option>
        ))}
      </select>
    );
  if (type === "a") return <textarea value={val} onChange={(e) => onChange(e.target.value)} rows={4} className="w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm outline-none focus:border-primary" />;
  if (type === "d") return <input type="date" value={val.slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} className={cls} />;
  return <input type={type === "n" ? "number" : "text"} value={val} onChange={(e) => onChange(e.target.value)} className={cls} />;
}
