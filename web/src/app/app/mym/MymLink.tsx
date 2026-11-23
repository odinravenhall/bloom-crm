"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, Eye, EyeOff, KeyRound, Link2, Mail, RefreshCw, ShieldCheck, Unlink, X, XCircle } from "lucide-react";
import { api, toast } from "@/lib/api";

// Liaison directe Bloom ↔ compte MYM d'une modèle (sans MyPulse) : état + bouton « Relier à MYM ».
export type MymLinkState = { creatorId: string; name: string; linked: boolean; username?: string | null; ok?: boolean; error?: string | null; checkedAt?: number | null; linkedBy?: string | null };

export function useMymLinks() {
  const [links, setLinks] = useState<MymLinkState[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const load = useCallback(() => {
    api<{ links: MymLinkState[]; canEdit: boolean }>("GET", "/api/mym/links").then((r) => (setLinks(r.links), setCanEdit(r.canEdit))).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { links, canEdit, load };
}

export function MymLinkChip({ state, canEdit, onChange }: { state: MymLinkState | undefined; canEdit: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  if (!state) return null;
  return (
    <>
      {state.linked ? (
        <button onClick={() => canEdit && setOpen(true)} title={state.error || `Relié à MYM${state.linkedBy ? ` par ${state.linkedBy}` : ""}`} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={state.ok ? { background: "rgba(60,209,136,.15)", color: "var(--mp-up)" } : { background: "rgba(240,101,72,.15)", color: "var(--mp-down)" }}>
          {state.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          {state.ok ? `MYM relié${state.username ? ` · @${state.username}` : ""}` : "Liaison MYM cassée"}
        </button>
      ) : canEdit ? (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: "var(--mp-accent)", color: "var(--mp-accent)" }}>
          <Link2 className="size-3.5" /> Relier à MYM
        </button>
      ) : (
        <span className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: "var(--mp-card-2)", color: "var(--mp-muted)" }}>MYM pas relié</span>
      )}
      {open ? <LinkModal state={state} onClose={() => (setOpen(false), onChange())} /> : null}
    </>
  );
}

function LinkModal({ state, onClose }: { state: MymLinkState; onClose: () => void }) {
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(state);
  const newCode = async () => {
    try {
      setCode(await api<{ code: string; expiresAt: number }>("POST", "/api/mym/link-code", { creatorId: state.creatorId }));
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  // Pendant qu'on relie : on regarde toutes les 3 s si la liaison est arrivée.
  useEffect(() => {
    if (!code) return;
    const t = setInterval(async () => {
      const r = await api<{ links: MymLinkState[] }>("GET", "/api/mym/links").catch(() => null);
      const s = r?.links.find((l) => l.creatorId === state.creatorId);
      if (s?.linked && s.ok && (!cur.linked || s.username !== cur.username || (s.checkedAt ?? 0) > (cur.checkedAt ?? 0))) {
        setCur(s);
        setCode(null);
        toast(`${state.name} est reliée à MYM ✓`);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [code, state, cur]);
  const check = async () => {
    setBusy(true);
    try {
      const r = await api<MymLinkState & { ok: boolean; error?: string }>("POST", "/api/mym/check", { creatorId: state.creatorId });
      setCur({ ...cur, ...r });
      toast(r.ok ? "La liaison MYM marche ✓" : r.error || "Liaison cassée", r.ok ? undefined : "err");
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    if (!confirm(`Délier ${state.name} de MYM ? Bloom ne pourra plus agir sur ce compte MYM.`)) return;
    await api("POST", "/api/mym/unlink", { creatorId: state.creatorId }).catch(() => {});
    onClose();
  };
  const [mode, setMode] = useState<"login" | "ext">("login");
  const step = "mt-3 flex gap-3";
  const num = "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold";
  return (
    <div className="mp-font fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[520px] overflow-hidden rounded-lg" style={{ background: "#262a2f", color: "var(--mp-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between px-4 py-3.5 text-[15px] font-semibold" style={{ background: "#2b3a4a", color: "var(--mp-head)" }}>Relier {state.name} à MYM<button onClick={onClose}><X className="size-4" /></button></h3>
        <div className="px-4 py-4 text-[13px]">
          {cur.linked ? (
            <div className="mb-4 rounded-md p-3" style={{ background: cur.ok ? "rgba(60,209,136,.1)" : "rgba(240,101,72,.1)" }}>
              <p className="font-semibold" style={{ color: cur.ok ? "var(--mp-up)" : "var(--mp-down)" }}>{cur.ok ? `Relié à MYM${cur.username ? ` (@${cur.username})` : ""}` : "La liaison ne marche plus"}</p>
              {cur.error ? <p className="mt-1 text-[12px]">{cur.error}</p> : null}
              {cur.checkedAt ? <p className="mt-1 text-[11px]" style={{ color: "var(--mp-muted)" }}>Vérifiée le {new Date(cur.checkedAt).toLocaleString("fr-FR")}</p> : null}
              <div className="mt-2 flex gap-2">
                <button disabled={busy} onClick={check} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px]" style={{ background: "#2f343a" }}><RefreshCw className="size-3.5" /> Vérifier</button>
                <button onClick={unlink} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px]" style={{ background: "#2f343a", color: "var(--mp-down)" }}><Unlink className="size-3.5" /> Délier</button>
              </div>
            </div>
          ) : null}
          <div className="mb-3 flex overflow-hidden rounded-md border text-[12px]" style={{ borderColor: "#3a4047" }}>
            {([["login", "Email + mot de passe"], ["ext", "Extension Chrome"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className="flex-1 py-2 font-semibold" style={mode === k ? { background: "var(--mp-accent)", color: "var(--mp-on-accent)" } : undefined}>{l}</button>
            ))}
          </div>
          {mode === "login" ? <LoginForm state={state} onDone={(username) => (setCur({ ...cur, linked: true, ok: true, error: null, username, checkedAt: Date.now() }), toast(`${state.name} est reliée à MYM ✓`))} /> : null}
          {mode === "ext" ? (<>
          <p style={{ color: "var(--mp-muted)" }}>Bloom se branche directement au compte MYM de la modèle (comme MyPulse). Le mot de passe n’est jamais lu : seule la session est gardée, chiffrée, et renouvelée toute seule.</p>
          <div className={step}><span className={num} style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}>1</span><div>Une seule fois par ordinateur : installe l’extension. <a href="/bloom-relier-mym.zip" download className="inline-flex items-center gap-1 font-semibold underline" style={{ color: "var(--mp-accent)" }}><Download className="size-3.5" />Télécharger</a><p className="text-[12px]" style={{ color: "var(--mp-muted)" }}>Dézippe, ouvre chrome://extensions, active « Mode développeur », puis « Charger l’extension non empaquetée » et choisis le dossier « bloom-relier-mym ».</p></div></div>
          <div className={step}><span className={num} style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}>2</span><div>Dans ce Chrome, connecte-toi à <b>creators.mym.fans</b> avec le compte de {state.name}.</div></div>
          <div className={step}><span className={num} style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}>3</span><div className="flex-1">
            Clique sur l’extension « Bloom – Relier MYM » et colle ce code :
            {code ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-md px-3 py-2 font-mono text-[20px] font-bold tracking-[4px]" style={{ background: "#1a1d21", color: "var(--mp-head)" }}>{code.code}</span>
                <button onClick={() => (navigator.clipboard.writeText(code.code), toast("Code copié"))} className="grid size-9 place-items-center rounded-md" style={{ background: "#2f343a" }}><Copy className="size-4" /></button>
                <span className="text-[11px]" style={{ color: "var(--mp-muted)" }}>valable 15 min · en attente…</span>
              </div>
            ) : (
              <button onClick={newCode} className="mt-2 block h-9 rounded-md px-4 font-semibold" style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}>{cur.linked ? "Relier à nouveau (nouveau code)" : "Créer le code"}</button>
            )}
          </div></div>
          </>) : null}
        </div>
      </div>
    </div>
  );
}

/** « Authentification MYM Creator » : email + mot de passe (comme MyPulse), puis le code de validation si MYM en envoie un. */
function LoginForm({ state, onDone }: { state: MymLinkState; onDone: (username: string | null) => void }) {
  const [v, setV] = useState({ email: "", password: "", c1: false, c2: false });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState<{ loginId: string; kind: string; destination: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const field = "mt-1.5 flex h-11 items-center gap-2 rounded-md border px-3";
  const st = { background: "#1f2327", borderColor: "#3a4047" };
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ ok?: boolean; username?: string | null; needCode?: boolean; loginId?: string; kind?: string; destination?: string | null }>("POST", "/api/mym/login", { creatorId: state.creatorId, email: v.email, password: v.password, confirmCreator: v.c1, confirmOwner: v.c2 });
      setV((x) => ({ ...x, password: "" }));
      if (r.needCode && r.loginId) setMfa({ loginId: r.loginId, kind: r.kind || "", destination: r.destination ?? null });
      else onDone(r.username ?? null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const sendCode = async () => {
    if (!mfa) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ username?: string | null }>("POST", "/api/mym/login/code", { loginId: mfa.loginId, code });
      setMfa(null);
      onDone(r.username ?? null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (mfa)
    return (
      <div>
        <p className="font-semibold" style={{ color: "var(--mp-head)" }}>Code de validation MYM</p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--mp-muted)" }}>{mfa.kind === "SOFTWARE_TOKEN_MFA" ? "Entre le code de l’application d’authentification de la modèle." : `MYM vient d’envoyer un code${mfa.destination ? ` à ${mfa.destination}` : ""}.`}</p>
        <div className={field} style={st}><ShieldCheck className="size-4" style={{ color: "var(--mp-muted)" }} /><input autoFocus value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" className="min-w-0 flex-1 bg-transparent text-[16px] tracking-[3px] outline-none" style={{ color: "var(--mp-head)" }} /></div>
        {err ? <p className="mt-2 text-[12px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
        <button disabled={busy || !code.trim()} onClick={sendCode} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold disabled:opacity-50" style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}><ShieldCheck className="size-4" /> Valider</button>
      </div>
    );
  return (
    <div>
      <p className="flex items-center gap-2 rounded-md border px-3 py-2 text-[12px]" style={{ borderColor: "#6b5a1f", background: "rgba(247,184,75,.08)", color: "#f7b84b" }}>Réservé au propriétaire du compte ou à l’agence sous contrat. Le mot de passe sert une seule fois pour ouvrir la session : Bloom ne l’enregistre pas.</p>
      <p className="mt-3 font-semibold" style={{ color: "var(--mp-head)" }}>Email de connexion MYM Creator</p>
      <div className={field} style={st}><Mail className="size-4" style={{ color: "var(--mp-muted)" }} /><input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} type="email" autoComplete="off" placeholder="email@mym.fans" className="min-w-0 flex-1 bg-transparent outline-none" style={{ color: "var(--mp-head)" }} /></div>
      <p className="mt-3 font-semibold" style={{ color: "var(--mp-head)" }}>Mot de passe MYM Creator</p>
      <div className={field} style={st}><KeyRound className="size-4" style={{ color: "var(--mp-muted)" }} /><input value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} type={show ? "text" : "password"} autoComplete="new-password" placeholder="Votre mot de passe secret" className="min-w-0 flex-1 bg-transparent outline-none" style={{ color: "var(--mp-head)" }} /><button onClick={() => setShow(!show)} type="button">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Connexion via Google sur MYM ? Il faut d’abord créer un mot de passe MYM (sur MYM), ou utiliser l’extension.</p>
      <div className="mt-3 space-y-2 rounded-md p-3 text-[12px]" style={{ background: "#1f2327" }}>
        <label className="flex items-start gap-2"><input type="checkbox" checked={v.c1} onChange={(e) => setV({ ...v, c1: e.target.checked })} className="mt-0.5" /> Je confirme qu’il s’agit bien des identifiants <b>MYM CREATOR</b> (et non d’un compte fan).</label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={v.c2} onChange={(e) => setV({ ...v, c2: e.target.checked })} className="mt-0.5" /> Je certifie être le <b>propriétaire</b> ou l’<b>agence dûment mandatée</b> pour ce compte.</label>
      </div>
      {err ? <p className="mt-2 text-[12px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
      <button disabled={busy || !v.email || !v.password || !v.c1 || !v.c2} onClick={submit} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold disabled:opacity-50" style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}><ShieldCheck className="size-4" /> {busy ? "Connexion à MYM…" : "Relier le compte"}</button>
    </div>
  );
}
