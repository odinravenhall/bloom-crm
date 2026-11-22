"use client";

import { useEffect, useState } from "react";
import { Check, Moon, Sparkle, Sun } from "lucide-react";
import { cn } from "@/lib/fmt";
import { ROLE_LABEL, type Me } from "@/lib/types";
import { ACCENTS, DECORS, THEMES, useThemePrefs, type Theme } from "@/lib/theme";
import { usePerf } from "@/lib/perf";
import { Avatar, Pill } from "@/components/ui";

const BASE_INFO: Record<Theme, { icon: typeof Sun; text: string; swatch: string[] }> = {
  dark: { icon: Moon, text: "Nuit légèrement prune, doux pour les yeux", swatch: ["#0f0d15", "#17141e", "#211d2a"] },
  onyx: { icon: Sparkle, text: "Noir profond, contraste maximal", swatch: ["#000000", "#0b0b0e", "#141418"] },
  light: { icon: Sun, text: "Clair, pour les pièces lumineuses", swatch: ["#f4f4f6", "#ffffff", "#e9e9ee"] },
};
const LANG_KEY = "bloom.lang";

/** Paramètres de chacun : apparence, langue, compte. Gardés sur cet ordinateur. */
export function Preferences({ me }: { me: Me }) {
  const { prefs, setPrefs } = useThemePrefs();
  const perf = usePerf();
  const [lang, setLang] = useState("fr");
  useEffect(() => {
    try {
      setLang(localStorage.getItem(LANG_KEY) || "fr");
    } catch {}
  }, []);
  const chooseLang = (l: string) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  };

  const section = (title: string, sub: string, children: React.ReactNode) => (
    <section className="grid gap-4 border-b py-8 md:grid-cols-[260px_1fr]">
      <div>
        <h2 className="text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </div>
      <div>{children}</div>
    </section>
  );

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-4xl md:text-5xl">Paramètres</h1>
      <p className="mt-1 text-sm text-muted">Tes préférences, gardées sur cet ordinateur.</p>

      {section(
        "Apparence",
        "Le style de Bloom : la base, ta couleur, le fond animé. Gardé sur cet ordinateur.",
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
          </div>
        </div>,
      )}

      {section(
        "Optimisation",
        "Pour un PC lent ou une connexion faible : Bloom reste fluide. Gardé sur cet ordinateur.",
        <div className="flex flex-col gap-2">
          {(
            [
              ["auto", "Automatique", "Active tout seul ce qu’il faut si l’ordinateur ou la connexion est faible."],
              ["noAnim", "Sans animations", "Plus rien ne bouge : fond fixe, pas d’effets."],
              ["lite", "Version allégée", "Pas de fond animé, de flous ni d’ombres : le plus efficace pour un PC lent."],
              ["data", "Connexion faible", "La messagerie s’actualise deux fois moins souvent."],
              ["noMedia", "Photos au clic", "Les photos et vidéos du chat ne se chargent que quand tu cliques dessus."],
            ] as const
          ).map(([k, label, text]) => (
            <label key={k} className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-card px-4 py-3">
              <input type="checkbox" checked={!!perf.prefs[k]} onChange={(e) => perf.set({ [k]: e.target.checked })} className="size-4 accent-[var(--color-primary)]" />
              <span className="min-w-0 flex-1">
                <b className="block text-sm">{label}</b>
                <span className="text-xs text-muted">{text}</span>
              </span>
              {k !== "auto" && !perf.prefs[k] && perf.active[k] ? <span className="rounded-full bg-card-2 px-2 py-0.5 text-[10px] font-bold text-muted">activé par l’auto</span> : null}
            </label>
          ))}
        </div>,
      )}

      {section(
        "Langue",
        "La langue de l’interface.",
        <div className="flex flex-wrap gap-2">
          {[
            ["fr", "Français", false],
            ["en", "English", true],
          ].map(([k, l, soon]) => (
            <button
              key={k as string}
              disabled={!!soon}
              onClick={() => chooseLang(k as string)}
              className={cn("flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold", lang === k ? "border-primary bg-petal text-primary-soft" : "bg-card text-muted hover:text-fg", soon && "opacity-60")}
            >
              {l as string}
              {soon ? <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[10px] font-bold text-sage">bientôt</span> : null}
            </button>
          ))}
        </div>,
      )}

      {section(
        "Compte",
        "Ton compte vient de Discord : le nom, la photo et le rôle se changent sur le serveur.",
        <div className="flex items-center gap-4 rounded-3xl border bg-card p-4">
          <Avatar src={me.avatar} name={me.name} size="size-14" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-semibold">{me.name}</p>
            <p className="text-sm text-muted">Connexion par Discord</p>
          </div>
          <Pill tone="accent">{ROLE_LABEL[me.role] ?? me.role}</Pill>
        </div>,
      )}

      {section(
        "Notifications",
        "Être prévenu d’un nouveau message, d’une vente…",
        <p className="rounded-3xl border border-dashed bg-card/60 p-4 text-sm text-muted">Bientôt : sons, alertes du navigateur, et plus tard notifications de l’application Bloom pour ordinateur.</p>,
      )}
    </div>
  );
}
