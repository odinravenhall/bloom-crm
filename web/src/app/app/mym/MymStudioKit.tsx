"use client";

import { ArrowLeft, ArrowRight, Check, Play, X } from "lucide-react";
import type { Media } from "@/lib/types";

// Briques communes des « studios » plein écran façon MyPulse (Studio push, Studio de campagne, éditeur de message) :
// fond vert très sombre, étapes à gauche, barre d'avancement en haut, pied avec Retour / Continuer.
export const LIME = { background: "var(--mp-accent)", color: "var(--mp-on-accent)" };
export const SBG = "radial-gradient(60% 50% at 0% 0%, rgba(199,255,74,.07), transparent 60%), #0d130c";
export const sCard = { background: "rgba(255,255,255,.035)", border: "1px solid #232b1c" };
export const sField = { background: "rgba(255,255,255,.04)", border: "1px solid #2f3a24", color: "var(--mp-head)" };
export const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
export const int = (n: number) => n.toLocaleString("fr-FR").replace(/ | /g, " ");
export const when = (ms: number | string | null) => (ms ? new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
/** Valeur d'un champ « datetime-local » pour une date (heure de l'appareil). */
export const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export type Step = { title: string; sub?: string };

export function StudioShell({ name, steps, step, setStep, done, onClose, children, footer, aside, modes }: {
  name: string; steps?: Step[]; step?: number; setStep?: (n: number) => void; done?: number; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; aside?: React.ReactNode;
  modes?: React.ReactNode;
}) {
  const pct = steps && step != null ? ((step + 1) / steps.length) * 100 : 100;
  return (
    <div className="mp-font fixed inset-0 z-50 flex flex-col" style={{ background: SBG, color: "#b9c2ae" }}>
      <header className="flex h-[62px] shrink-0 items-center gap-4 border-b px-5" style={{ borderColor: "#1c2417" }}>
        <span className="grid size-8 place-items-center rounded-lg" style={LIME}><Play className="size-4 fill-current" /></span>
        <b className="text-[13.5px]" style={{ color: "var(--mp-head)" }}>{name}</b>
        <span className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: "#1c2417" }}><span className="block h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--mp-accent)" }} /></span>
        {modes}
        <button onClick={onClose} title="Fermer" className="grid size-9 place-items-center rounded-lg" style={sCard}><X className="size-4" /></button>
      </header>
      <div className="flex min-h-0 flex-1">
        {steps && step != null ? (
          <nav className="hidden w-[230px] shrink-0 p-4 md:block">
            {steps.map((s, i) => (
              <button key={s.title} disabled={i > (done ?? step)} onClick={() => setStep?.(i)} className="mb-1.5 flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] disabled:opacity-60" style={i === step ? { background: "rgba(199,255,74,.08)", color: "var(--mp-head)" } : undefined}>
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold" style={i === step ? { ...LIME, borderColor: "var(--mp-accent)" } : i < step ? { borderColor: "#3d4a2c", color: "var(--mp-accent)" } : { borderColor: "#333d2b" }}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>
                <span><span className="block font-medium">{s.title}</span>{s.sub ? <span className="block text-[11.5px]" style={{ color: "#7c8671" }}>{s.sub}</span> : null}</span>
              </button>
            ))}
          </nav>
        ) : null}
        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-7">
          <div className={`mx-auto flex w-full gap-6 ${aside ? "max-w-[1200px]" : "max-w-[960px]"}`}>
            <div className="min-w-0 flex-1">{children}</div>
            {aside ? <div className="hidden w-[310px] shrink-0 lg:block">{aside}</div> : null}
          </div>
        </main>
      </div>
      <footer className="flex h-[66px] shrink-0 items-center gap-3 border-t px-5" style={{ borderColor: "#1c2417" }}>{footer}</footer>
    </div>
  );
}

export function StepHead({ n, of, title, sub }: { n?: number; of?: number; title: string; sub: string }) {
  return (
    <div className="mb-6">
      {n ? <p className="text-[11.5px] font-bold tracking-widest uppercase" style={{ color: "var(--mp-accent)" }}>Étape {n} sur {of}</p> : null}
      <h2 className="mt-1 text-[34px] leading-tight font-semibold tracking-tight" style={{ color: "var(--mp-head)" }}>{title}</h2>
      <p className="mt-1.5 text-[14px]">{sub}</p>
    </div>
  );
}

/** Grande carte à cocher (cible, « Maintenant / Programmer », « Prix du message / Prix intelligent »). */
export function Choice({ on, onClick, icon, title, sub, foot, disabled }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string; foot?: React.ReactNode; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className="relative rounded-2xl p-4 text-left transition disabled:opacity-45" style={on ? { background: "rgba(199,255,74,.06)", border: "2px solid var(--mp-accent)", boxShadow: "0 0 30px rgba(199,255,74,.08)" } : { ...sCard, border: "2px solid #232b1c" }}>
      <span className="absolute top-3.5 right-3.5 grid size-5 place-items-center rounded-full border" style={on ? { ...LIME, borderColor: "var(--mp-accent)" } : { borderColor: "#3a4431" }}>{on ? <Check className="size-3" /> : null}</span>
      <span className="grid size-9 place-items-center rounded-xl" style={on ? LIME : { background: "rgba(255,255,255,.06)", color: "var(--mp-accent)" }}>{icon}</span>
      <b className="mt-3 block text-[15px]" style={{ color: "var(--mp-head)" }}>{title}</b>
      <span className="mt-1 block text-[12.5px] leading-snug">{sub}</span>
      {foot ? <span className="mt-3 block">{foot}</span> : null}
    </button>
  );
}

export function Toggle({ on, set, title, sub, children, disabled }: { on: boolean; set: (v: boolean) => void; title: React.ReactNode; sub: string; children?: React.ReactNode; disabled?: boolean }) {
  return (
    <div className="mb-3 rounded-2xl" style={on ? { background: "rgba(199,255,74,.05)", border: "1px solid #6f8f2a" } : sCard}>
      <button disabled={disabled} onClick={() => set(!on)} className="flex w-full items-start gap-3.5 p-4 text-left disabled:opacity-50">
        <span className="mt-0.5 flex h-[22px] w-[40px] shrink-0 items-center rounded-full p-[3px] transition" style={{ background: on ? "var(--mp-accent)" : "#3a4135" }}><span className="size-4 rounded-full bg-white transition" style={{ transform: on ? "translateX(18px)" : undefined, background: on ? "#12160c" : "#e9ecef" }} /></span>
        <span><b className="block text-[13px]" style={{ color: "var(--mp-head)" }}>{title}</b><span className="mt-0.5 block text-[12.5px] leading-snug">{sub}</span></span>
      </button>
      {on && children ? <div className="border-t p-4" style={{ borderColor: "#3d4a2c" }}>{children}</div> : null}
    </div>
  );
}

export function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="h-8 rounded-full px-3.5 text-[12.5px] font-semibold" style={on ? LIME : { border: "1px solid #333d2b", color: "var(--mp-head)" }}>{children}</button>;
}

/** Aperçu « côté fan » : un téléphone avec le média et le message. */
export function Phone({ name, kind, medias, text, time, note }: { name: string; kind: string; medias: Media[]; text: string; time: string; note: string }) {
  const m = medias[0];
  return (
    <div className="sticky top-0">
      <p className="mb-2 text-[11.5px] font-bold tracking-widest uppercase" style={{ color: "var(--mp-accent)" }}>Aperçu côté fan</p>
      <div className="rounded-[26px] p-2.5" style={{ border: "1px solid #2a3323", background: "#0a0f09" }}>
        <div className="overflow-hidden rounded-[18px]" style={{ background: "#11170f" }}>
          <div className="flex items-center gap-2.5 border-b px-3.5 py-3" style={{ borderColor: "#1c2417" }}>
            <span className="grid size-8 place-items-center rounded-full text-[13px] font-bold" style={LIME}>{(name[0] || "?").toUpperCase()}</span>
            <span><b className="block text-[13px]" style={{ color: "var(--mp-head)" }}>{name}</b><span className="text-[11px]">{kind}</span></span>
          </div>
          <div className="flex min-h-[330px] flex-col items-end justify-end gap-2 p-3.5">
            {m?.thumb ? <span className="relative block w-[78%] overflow-hidden rounded-xl"><img src={m.thumb} alt="" className="aspect-[4/5] w-full object-cover" />{medias.length > 1 ? <span className="absolute top-1.5 right-1.5 rounded bg-black/70 px-1.5 text-[10.5px] font-semibold text-white">+{medias.length - 1}</span> : null}</span> : null}
            {text ? <span className="max-w-[85%] rounded-2xl px-3 py-1.5 text-[12.5px] break-words whitespace-pre-wrap" style={LIME}>{text}</span> : <span className="rounded-2xl border border-dashed px-3 py-1.5 text-[12.5px]" style={{ borderColor: "#3a4431" }}>Ton message apparaîtra ici</span>}
            <span className="text-[10.5px]">{time}</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11.5px]">{note}</p>
    </div>
  );
}

export function Foot({ back, onBack, info, next, onNext, disabled }: { back?: boolean; onBack?: () => void; info: React.ReactNode; next: React.ReactNode; onNext: () => void; disabled?: boolean }) {
  return (
    <>
      {back ? <button onClick={onBack} className="flex h-10 items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold" style={{ ...sCard, color: "var(--mp-head)" }}><ArrowLeft className="size-4" /> Retour</button> : <span className="w-[100px]" />}
      <span className="flex-1 text-center text-[13px]">{info}</span>
      <button disabled={disabled} onClick={onNext} className="flex h-10 items-center gap-2 rounded-xl px-5 text-[13.5px] font-bold disabled:opacity-45" style={LIME}>{next}</button>
    </>
  );
}
export const Next = () => <>Continuer <ArrowRight className="size-4" /></>;

/** Petite case de récapitulatif avec « Modifier ». */
export function Recap({ label, value, sub, onEdit }: { label: string; value: React.ReactNode; sub?: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="rounded-xl p-3.5" style={sCard}>
      <p className="flex justify-between text-[10.5px] font-bold tracking-widest uppercase">{label}{onEdit ? <button onClick={onEdit} className="tracking-normal normal-case" style={{ color: "var(--mp-accent)" }}>Modifier</button> : null}</p>
      <b className="mt-1.5 block text-[13.5px] break-words" style={{ color: "var(--mp-head)" }}>{value}</b>
      {sub ? <span className="mt-0.5 block text-[11.5px]">{sub}</span> : null}
    </div>
  );
}
