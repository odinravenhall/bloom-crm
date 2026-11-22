"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, Check, ChevronRight, Gauge, Languages, Moon, Palette, Sparkle, Sun, UserRound, Zap } from "lucide-react";
import { cn } from "@/lib/fmt";
import { ROLE_LABEL, type Me } from "@/lib/types";
import { ACCENTS, DECORS, THEMES, useThemePrefs, type Theme } from "@/lib/theme";
import { usePerf } from "@/lib/perf";
import { detect, getMeasure, measureFps, measureLatency, saveMeasure, type Measure, type PerfKey } from "@/rv/lib/perf";
import { Avatar, Pill, btnCls } from "@/components/ui";

const SECTIONS = [
  { id: "compte", title: "Mon compte", text: "Ton nom, ta photo et ton rôle (venus de Discord).", icon: UserRound },
  { id: "apparence", title: "Apparence", text: "Aurore, Onyx ou Clair, ta couleur, le fond animé.", icon: Palette },
  { id: "optimisation", title: "Optimisation", text: "Un clic pour un CRM fluide sur PC lent ou connexion faible.", icon: Gauge },
  { id: "langue", title: "Langue", text: "La langue de l’interface.", icon: Languages },
  { id: "notifications", title: "Notifications", text: "Ventes, pourboires, nouveaux messages, son.", icon: Bell },
] as const;

const BASE_INFO: Record<Theme, { icon: typeof Sun; text: string; swatch: string[] }> = {
  dark: { icon: Moon, text: "Nuit violette et lueurs : la signature de Bloom", swatch: ["#0c0a1a", "#15112b", "#1d1838"] },
  onyx: { icon: Sparkle, text: "Noir profond, contraste maximal", swatch: ["#000000", "#0b0b0e", "#141418"] },
  light: { icon: Sun, text: "Clair, pour les pièces lumineuses", swatch: ["#f4f4f6", "#ffffff", "#e9e9ee"] },
};
const LANG_KEY = "bloom.lang";

/** Paramètres de chacun : une page d'accueil avec une carte par partie, puis chaque partie sur sa page (?s=…). */
export function Preferences({ me, section }: { me: Me; section: string | null }) {
  const cur = SECTIONS.find((x) => x.id === section) ?? null;
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-8 md:py-10">
      {!cur ? (
        <>
          <p className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">Compte</p>
          <h1 className="text-4xl font-extrabold">Paramètres</h1>
          <p className="mt-1 text-sm text-muted">Choisis ce que tu veux régler. Gardé sur cet ordinateur.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((x) => (
              <Link key={x.id} href={`/app/parametres?s=${x.id}`} className="group flex items-start gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/50">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-soft">
                  <x.icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block">{x.title}</b>
                  <span className="text-sm text-muted">{x.text}</span>
                </span>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted group-hover:text-fg" />
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="max-w-[820px]">
          <Link href="/app/parametres" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
            <ArrowLeft className="size-4" /> Tous les paramètres
          </Link>
          <p className="mt-6 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">Paramètres</p>
          <h1 className="text-3xl font-extrabold">{cur.title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted">{cur.text}</p>
          {cur.id === "compte" ? <Account me={me} /> : null}
          {cur.id === "apparence" ? <Appearance /> : null}
          {cur.id === "optimisation" ? <Optimisation /> : null}
          {cur.id === "langue" ? <Language /> : null}
          {cur.id === "notifications" ? <p className="rounded-2xl border border-dashed bg-card/60 p-4 text-sm text-muted">Bientôt : son et alerte à chaque nouveau message ou vente, et plus tard notifications de l’application Bloom pour ordinateur.</p> : null}
        </div>
      )}
    </div>
  );
}

function Account({ me }: { me: Me }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-4">
      <Avatar src={me.avatar} name={me.name} size="size-14" />
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold">{me.name}</p>
        <p className="text-sm text-muted">Connexion par Discord : le nom, la photo et le rôle se changent sur le serveur.</p>
      </div>
      <Pill tone="accent">{ROLE_LABEL[me.role] ?? me.role}</Pill>
    </div>
  );
}

function Appearance() {
  const { prefs, setPrefs } = useThemePrefs();
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {THEMES.map(([t, label]) => {
          const info = BASE_INFO[t];
          return (
            <button key={t} onClick={() => setPrefs({ base: t })} className={cn("rounded-2xl border bg-card p-3 text-left transition-colors", prefs.base === t ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40")}>
              <div className="flex overflow-hidden rounded-xl border">
                {info.swatch.map((c) => (
                  <span key={c} className="h-10 flex-1" style={{ background: c }} />
                ))}
                <span className="h-10 flex-1" style={{ background: prefs.accent }} />
              </div>
              <p className="mt-2 flex items-center gap-2 font-semibold">
                <info.icon className="size-4 text-primary" /> {label}
                {prefs.base === t ? <Check className="ml-auto size-4 text-primary" /> : null}
              </p>
              <p className="text-xs text-muted">{info.text}</p>
            </button>
          );
        })}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Couleur</p>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENTS.map(([c, label]) => (
            <button key={c} onClick={() => setPrefs({ accent: c })} title={label} className={cn("grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-bg", prefs.accent === c && "ring-2 ring-fg")} style={{ background: c }}>
              {prefs.accent === c ? <Check className="size-4 text-white" /> : null}
            </button>
          ))}
          <label className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold text-muted" title="Ta propre couleur">
            <input type="color" value={prefs.accent} onChange={(e) => setPrefs({ accent: e.target.value })} className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0" /> Perso
          </label>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Fond animé</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DECORS.map(([d, label, text]) => (
            <button key={d} onClick={() => setPrefs({ decor: d })} className={cn("rounded-2xl border bg-card px-4 py-3 text-left", prefs.decor === d ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40")}>
              <p className="flex items-center gap-2 text-sm font-semibold">
                {label} {prefs.decor === d ? <Check className="ml-auto size-4 text-primary" /> : null}
              </p>
              <p className="text-xs text-muted">{text}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Pour tout arrêter (PC lent) : Paramètres → Optimisation.</p>
      </div>
    </div>
  );
}

function Switch({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick} className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60", on ? "bg-primary" : "bg-line")}>
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

const PERF_OPTS: { key: PerfKey; title: string; text: string }[] = [
  { key: "noAnim", title: "Aucune animation", text: "Plus rien ne bouge : apparitions, transitions, fond animé, points qui clignotent. Le site répond tout de suite." },
  { key: "lite", title: "Affichage allégé", text: "Retire le fond animé, les flous et les ombres. C’est ce qui fatigue le plus un PC ou une carte graphique faible." },
  { key: "data", title: "Connexion faible", text: "Actualisations deux fois moins fréquentes : la messagerie consomme moins de connexion." },
  { key: "noMedia", title: "Médias au clic", text: "Les photos du chat ne se chargent que quand tu cliques dessus. Les vocaux restent écoutables." },
];

/** Optimisation (comme Raven) : tout en un clic, détection automatique, test de l'appareil, réglage fin. */
function Optimisation() {
  const { prefs: p, set } = usePerf();
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [reasons, setReasons] = useState<string[] | null>(null);
  const [found, setFound] = useState<Record<PerfKey, boolean> | null>(null);
  const [testing, setTesting] = useState(false);
  const refresh = () => {
    const d = detect();
    setReasons(d.reasons);
    setFound({ noAnim: d.weakDevice || d.slowNet, lite: d.weakDevice, data: d.slowNet, noMedia: d.slowNet });
  };
  useEffect(() => {
    setMeasure(getMeasure());
    refresh();
  }, []);
  const test = async () => {
    setTesting(true);
    const [fps, latency] = await Promise.all([measureFps(3000), measureLatency()]);
    const m = { fps, latency, at: Date.now() };
    saveMeasure(m);
    setMeasure(m);
    refresh();
    set({});
    setTesting(false);
  };
  const auto = (k: PerfKey) => !!found && p.auto && found[k] && !p[k];
  const allOn = PERF_OPTS.every((o) => p[o.key]);
  return (
    <div className="flex flex-col gap-4">
      <div className={cn("flex flex-wrap items-center gap-4 rounded-2xl border p-5", allOn ? "border-primary/50 bg-primary/10" : "bg-card")}>
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", allOn ? "bg-primary text-white" : "bg-primary/15 text-primary-soft")}>
          <Zap className="size-6" />
        </span>
        <div className="min-w-48 flex-1">
          <p className="text-lg font-bold">{allOn ? "Bloom optimisé au maximum" : "Tout optimiser en un clic"}</p>
          <p className="text-sm text-muted">Coupe les animations et les effets, allège les actualisations, charge les photos au clic. Pour chatter sans aucun ralentissement.</p>
        </div>
        <button onClick={() => set({ noAnim: !allOn, lite: !allOn, data: !allOn, noMedia: !allOn })} className={allOn ? btnCls.secondary : btnCls.primary}>
          {allOn ? (
            "Tout désactiver"
          ) : (
            <>
              <Zap className="size-4" /> Tout optimiser
            </>
          )}
        </button>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <p className="mb-3 text-lg font-bold">Réglage fin</p>
        <div className="flex items-start gap-3 rounded-xl bg-card-2/60 p-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Optimisation automatique</p>
            <p className="text-sm text-muted">
              Bloom regarde ton appareil et ta connexion, et active tout seul ce qu’il faut.{" "}
              {reasons ? reasons.length ? <span className="text-amber-300">Détecté ici : {reasons.join(", ")}.</span> : <span className="text-emerald-300">Cet appareil n’a pas besoin d’optimisation pour l’instant.</span> : null}
            </p>
          </div>
          <Switch on={p.auto} onClick={() => set({ auto: !p.auto })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border p-3">
          <div className="min-w-48 flex-1">
            <p className="font-semibold">Tester mon appareil</p>
            <p className="text-sm text-muted">
              {measure ? (
                <>
                  Fluidité : <b className={measure.fps && measure.fps < 40 ? "text-amber-300" : "text-emerald-300"}>{measure.fps ?? "—"} images/s</b> · Temps de réponse :{" "}
                  <b className={measure.latency && measure.latency > 900 ? "text-amber-300" : "text-emerald-300"}>{measure.latency ?? "—"} ms</b>
                  <span> (mesuré {new Date(measure.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})</span>
                </>
              ) : (
                "Mesure la fluidité de l’affichage et la vitesse de ta connexion avec Bloom."
              )}
            </p>
          </div>
          <button onClick={test} disabled={testing} className={btnCls.secondary}>
            {testing ? "Test en cours…" : "Lancer le test"}
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {PERF_OPTS.map((o) => (
            <div key={o.key} className="flex items-start gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {o.title} {auto(o.key) ? <Pill tone="warn">activé par l’auto</Pill> : null}
                </p>
                <p className="text-sm text-muted">{o.text}</p>
              </div>
              <Switch on={p[o.key] || auto(o.key)} disabled={auto(o.key)} onClick={() => set({ [o.key]: !p[o.key] })} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">Gardé sur cet ordinateur. « Connexion faible » prend effet pleinement au prochain changement de page.</p>
      </div>
    </div>
  );
}

function Language() {
  const [lang, setLang] = useState("fr");
  useEffect(() => {
    try {
      setLang(localStorage.getItem(LANG_KEY) || "fr");
    } catch {}
  }, []);
  const choose = (l: string) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  };
  return (
    <div className="flex flex-wrap gap-2">
      {(
        [
          ["fr", "Français", false],
          ["en", "English", true],
        ] as const
      ).map(([k, l, soon]) => (
        <button key={k} disabled={soon} onClick={() => choose(k)} className={cn("flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold", lang === k ? "border-primary bg-primary/15 text-primary-soft" : "bg-card text-muted hover:text-fg", soon && "opacity-60")}>
          {l}
          {soon ? <span className="rounded-full bg-card-2 px-2 py-0.5 text-[10px] font-bold text-muted">bientôt</span> : null}
        </button>
      ))}
    </div>
  );
}
