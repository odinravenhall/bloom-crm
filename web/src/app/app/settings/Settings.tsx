"use client";

import { useEffect, useState } from "react";
import { Heart, Info, LogOut, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/fmt";
import { useThemePrefs } from "@/lib/theme";
import { usePerf } from "@/lib/perf";
import { Avatar } from "@/components/ui";
import type { Me } from "@/lib/types";

// Réglages de la personne (copie de « Settings » d'Infloww) : son compte et ses préférences.
// Gardés sur cet ordinateur (« bloom.prefs », « bloom.lang ») ; le thème et l'accélération passent par les réglages de Bloom.
const PREFS = "bloom.prefs";
export type UserPrefs = { tz: string; agencyTz: string; weekStart: 0 | 1 };
export const PREFS_DEFAULT: UserPrefs = { tz: "Europe/Paris", agencyTz: "Europe/Paris", weekStart: 0 };
export function readUserPrefs(): UserPrefs {
  try {
    return { ...PREFS_DEFAULT, ...JSON.parse(localStorage.getItem(PREFS) || "{}") };
  } catch {
    return PREFS_DEFAULT;
  }
}

const ZONES: [string, string][] = [
  ["Pacific/Honolulu", "(UTC-10:00) Hawaii"],
  ["America/Los_Angeles", "(UTC-08:00) Pacific Time (US & Canada)"],
  ["America/Denver", "(UTC-07:00) Mountain Time (US & Canada)"],
  ["America/Chicago", "(UTC-06:00) Central Time (US & Canada)"],
  ["America/New_York", "(UTC-05:00) Eastern Time (US & Canada)"],
  ["America/Montreal", "(UTC-05:00) Montréal"],
  ["America/Guadeloupe", "(UTC-04:00) Guadeloupe, Martinique"],
  ["America/Sao_Paulo", "(UTC-03:00) Brasilia"],
  ["UTC", "(UTC+00:00) Coordinated Universal Time"],
  ["Europe/London", "(UTC+00:00) Dublin, Edinburgh, Lisbon, London"],
  ["Africa/Casablanca", "(UTC+01:00) Casablanca"],
  ["Europe/Paris", "(UTC+01:00) Brussels, Copenhagen, Madrid, Paris"],
  ["Europe/Berlin", "(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna"],
  ["Europe/Athens", "(UTC+02:00) Athens, Bucharest"],
  ["Europe/Moscow", "(UTC+03:00) Moscow, St. Petersburg"],
  ["Asia/Dubai", "(UTC+04:00) Abu Dhabi, Muscat"],
  ["Indian/Reunion", "(UTC+04:00) La Réunion"],
  ["Asia/Bangkok", "(UTC+07:00) Bangkok, Hanoi, Jakarta"],
  ["Asia/Manila", "(UTC+08:00) Manila, Singapore"],
  ["Asia/Tokyo", "(UTC+09:00) Osaka, Sapporo, Tokyo"],
];
const LANGS: [string, string][] = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
];
const C = { side: "#262626", sideOn: "#333334", page: "#161616", line: "#2c2c2e", text: "#f4f4f5", muted: "#9b9ba1", blue: "#3b6ff6", field: "#1c1c1e" };

export function Settings({ me }: { me: Me }) {
  const [tab, setTab] = useState<"account" | "prefs" | "about">("account");
  const TABS: [typeof tab, string, LucideIcon][] = [
    ["account", "Your Account", UserRound],
    ["prefs", "Your Preferences", Heart],
    ["about", "About Bloom", Info],
  ];
  return (
    <div className="flex min-h-full flex-col" style={{ background: C.page, color: C.text }}>
      <h1 className="border-b px-6 py-4 text-[17px] font-semibold" style={{ borderColor: C.line }}>
        Settings
      </h1>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 flex-row overflow-x-auto md:w-[340px] md:flex-col" style={{ background: C.side }}>
          {TABS.map(([k, l, I]) => (
            <button key={k} onClick={() => setTab(k)} className="flex items-center gap-4 px-6 py-5 text-left text-[15px] whitespace-nowrap" style={tab === k ? { background: C.sideOn, color: C.blue } : { color: C.muted }}>
              <I className="size-[18px]" />
              {l}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 px-6 py-5 md:px-7">
          {tab === "account" ? <Account me={me} /> : tab === "prefs" ? <Preferences /> : <About />}
        </div>
      </div>
    </div>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b pb-4 text-[15px] font-semibold" style={{ borderColor: C.line }}>
      {children}
    </h2>
  );
}
const field = "h-10 w-full max-w-[448px] rounded-lg border px-3 text-[14px] outline-none";

function Account({ me }: { me: Me }) {
  const logout = async () => {
    await fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/connexion";
  };
  return (
    <div>
      <Head>Your account</Head>
      <p className="mt-6 text-[14px] font-semibold">Personal info</p>
      <p className="mt-4 text-[13px]" style={{ color: C.muted }}>
        Picture
      </p>
      <div className="mt-2 size-[140px] overflow-hidden rounded-lg">
        <Avatar src={me.avatar} name={me.name} size="size-[140px]" rounded="rounded-lg" />
      </div>
      <label className="mt-6 block text-[13px]" style={{ color: C.muted }}>
        <span className="text-rose-400">*</span>Name
      </label>
      <input readOnly value={me.name} className={cn(field, "mt-2")} style={{ background: C.field, borderColor: C.line, color: C.text }} />
      <label className="mt-6 block text-[13px]" style={{ color: C.muted }}>
        Email
      </label>
      <input readOnly value={me.email || "—"} className={cn(field, "mt-2")} style={{ background: C.field, borderColor: C.line, color: C.text }} />
      <p className="mt-2 text-[12px]" style={{ color: C.muted }}>
        Nom et photo viennent de ton compte Discord.
      </p>
      <button onClick={logout} className="mt-8 inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[14px] hover:bg-white/5" style={{ borderColor: C.line }}>
        <LogOut className="size-4" /> Se déconnecter
      </button>
    </div>
  );
}

function Preferences() {
  const [sub, setSub] = useState<"tz" | "lang" | "display" | "advanced">("tz");
  const [p, setP] = useState<UserPrefs>(PREFS_DEFAULT);
  const [lang, setLang] = useState("fr");
  const { prefs: theme, setPrefs: setTheme } = useThemePrefs();
  const { prefs: perf, set: setPerf } = usePerf();
  useEffect(() => {
    setP(readUserPrefs());
    try {
      setLang(localStorage.getItem("bloom.lang") || "fr");
    } catch {}
  }, []);
  const save = (patch: Partial<UserPrefs>) =>
    setP((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(PREFS, JSON.stringify(next));
      } catch {}
      return next;
    });
  const hw = !perf.lite && !perf.noAnim;
  const SUBS: [typeof sub, string][] = [
    ["tz", "Time zone settings"],
    ["lang", "Language Settings"],
    ["display", "Display settings"],
    ["advanced", "Advanced options"],
  ];
  const select = (value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(field, "mt-2")} style={{ background: C.field, borderColor: C.line, color: C.text }}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  const toggle = (on: boolean, set: (v: boolean) => void) => (
    <button role="switch" aria-checked={on} onClick={() => set(!on)} className="relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ background: on ? C.blue : "#48484a" }}>
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );

  return (
    <div>
      <Head>Your preferences</Head>
      <div className="flex gap-7 overflow-x-auto border-b" style={{ borderColor: C.line }}>
        {SUBS.map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className="border-b-2 py-3.5 text-[14px] whitespace-nowrap" style={sub === k ? { borderColor: C.blue, color: C.blue } : { borderColor: "transparent", color: C.text }}>
            {l}
          </button>
        ))}
      </div>

      {sub === "tz" ? (
        <div className="mt-5 flex flex-col gap-6">
          <div>
            <p className="text-[14px]" style={{ color: C.muted }}>
              Regular time zone
            </p>
            {select(p.tz, (v) => save({ tz: v }), ZONES)}
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[14px]" style={{ color: C.muted }}>
              Agency’s time zone for creator reports, fan reports, tracking links and free trial links <Info className="size-3.5" />
            </p>
            {select(p.agencyTz, (v) => save({ agencyTz: v }), ZONES)}
          </div>
          <div>
            <p className="text-[14px]" style={{ color: C.muted }}>
              Start weekly reports on
            </p>
            {select(String(p.weekStart), (v) => save({ weekStart: v === "1" ? 1 : 0 }), [
              ["0", "Sunday"],
              ["1", "Monday"],
            ])}
          </div>
        </div>
      ) : null}

      {sub === "lang" ? (
        <div className="mt-5">
          <p className="text-[14px]" style={{ color: C.muted }}>
            Language
          </p>
          {select(
            lang,
            (v) => {
              setLang(v);
              try {
                localStorage.setItem("bloom.lang", v);
              } catch {}
            },
            LANGS,
          )}
          <p className="mt-2 text-[12px]" style={{ color: C.muted }}>
            La traduction complète de Bloom en anglais et en espagnol arrive ; le choix est déjà gardé.
          </p>
        </div>
      ) : null}

      {sub === "display" ? (
        <div className="mt-5">
          <p className="text-[14px]" style={{ color: C.muted }}>
            Display
          </p>
          <div className="mt-3 flex flex-wrap gap-6">
            {(
              [
                ["light", "Light mode"],
                ["dark", "Dark mode"],
              ] as const
            ).map(([k, l]) => {
              const on = k === "light" ? theme.base === "light" : theme.base !== "light";
              const dark = k === "dark";
              return (
                <button key={k} onClick={() => setTheme({ base: k })} className="w-[300px] overflow-hidden rounded-lg border text-left" style={{ borderColor: on ? "#6b6b70" : C.line }}>
                  <div className="flex flex-col gap-3 p-6" style={{ background: dark ? "#2a2a2c" : "#1c1c1e" }}>
                    <span className="flex items-center gap-2">
                      <span className="size-6 rounded-full" style={{ background: dark ? "#4a4a4d" : "#f4f4f5" }} />
                      <span className="h-6 flex-1 rounded" style={{ background: dark ? "#4a4a4d" : "#f4f4f5" }} />
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="size-6 rounded-full" style={{ background: dark ? "#4a4a4d" : "#f4f4f5" }} />
                      <span className="h-6 w-[140px] rounded" style={{ background: dark ? "#2448c8" : "#cfdcfb" }} />
                    </span>
                  </div>
                  <div className="flex items-center gap-2 border-t px-2 py-3 text-[14px]" style={{ borderColor: C.line }}>
                    <span className="grid size-4 place-items-center rounded-full border" style={{ borderColor: on ? C.blue : "#6b6b70", background: on ? C.blue : "transparent" }}>
                      {on ? <span className="size-1.5 rounded-full bg-white" /> : null}
                    </span>
                    {l}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {sub === "advanced" ? (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-6 rounded-lg border p-4" style={{ borderColor: C.line }}>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">Hardware acceleration</p>
              <p className="mt-2 text-[12px]" style={{ color: C.muted }}>
                Uses your GPU to improve performance (animations, blur, shadows). Disable this feature if Bloom is slow or unstable on this computer.
              </p>
            </div>
            {toggle(hw, (v) => setPerf(v ? { auto: false, lite: false, noAnim: false } : { auto: false, lite: true, noAnim: true }))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function About() {
  return (
    <div>
      <Head>About Bloom</Head>
      <p className="mt-6 max-w-xl text-[14px]" style={{ color: C.muted }}>
        Bloom CRM — le CRM de chatting de l’agence, branché sur Substy (OnlyFans et MYM), Infloww et MyPulse.
      </p>
    </div>
  );
}
