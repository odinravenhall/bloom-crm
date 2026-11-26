"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Link2, Mail, RefreshCw, ShieldCheck, Unlink, X, XCircle } from "lucide-react";
import { api, toast } from "@/lib/api";

// Liaison directe Bloom ↔ compte OnlyFans d'une modèle : état, formulaire de connexion, relais Cloudflare.
export type OfLinkState = { creatorId: string; name: string; linked: boolean; username?: string | null; ok?: boolean; error?: string | null; linkedAt?: number | null; linkedBy?: string | null };

export function useOfLinks() {
  const [links, setLinks] = useState<OfLinkState[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [proxy, setProxy] = useState(true);
  const load = useCallback(() => {
    api<{ links: OfLinkState[]; canEdit: boolean; proxy: boolean }>("GET", "/api/of/links")
      .then((r) => (setLinks(r.links), setCanEdit(r.canEdit), setProxy(r.proxy)))
      .catch(() => { });
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { links, canEdit, proxy, load };
}

export function OfLinkChip({ state, canEdit, onChange }: { state: OfLinkState | undefined; canEdit: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  if (!state) return null;
  return (
    <>
      {state.linked ? (
        <button onClick={() => canEdit && setOpen(true)} title={state.error || "Compte OnlyFans relié"} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${state.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
          {state.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          {state.ok ? `OF relié${state.username ? ` · @${state.username}` : ""}` : "Liaison OF cassée"}
        </button>
      ) : canEdit ? (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-full border border-primary px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Link2 className="size-3.5" /> Relier à OnlyFans
        </button>
      ) : (
        <span className="rounded-full bg-card-2 px-2.5 py-1 text-[11px] text-muted">OF pas relié</span>
      )}
      {open ? <LinkModal state={state} onClose={() => (setOpen(false), onChange())} /> : null}
    </>
  );
}

function LinkModal({ state, onClose }: { state: OfLinkState; onClose: () => void }) {
  const [cur, setCur] = useState(state);
  const [v, setV] = useState({ email: "", password: "", c1: false, c2: false });
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "human" | "code">("form");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [px, setPx] = useState({ host: "", user: "", pass: "" });

  const saveProxy = async () => {
    setBusy(true);
    try {
      await api("POST", "/api/of/proxy", px);
      toast("Proxy IPRoyal enregistré");
      setPx({ host: "", user: "", pass: "" });
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ ticket: string }>("POST", "/api/of/login", { creatorId: state.creatorId, email: v.email, password: v.password, confirmCreator: v.c1, confirmOwner: v.c2 });
      setV((x) => ({ ...x, password: "" }));
      setTicket(r.ticket);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Pendant la connexion : on suit son état et on ouvre l'écran de relais si Cloudflare se présente.
  useEffect(() => {
    if (!ticket) return;
    let stopped = false;
    const t = setInterval(async () => {
      const r = await api<{ state: string; error?: string; username?: string }>("GET", `/api/of/live/result?t=${ticket}`).catch(() => null);
      if (!r || stopped) return;
      if (r.state === "human") {
        setPhase((p) => {
          if (p !== "human") window.open(`/api/of/live?t=${ticket}`, "oflive", "width=1300,height=960");
          return "human";
        });
      } else if (r.state === "code") setPhase("code");
      else if (r.state === "done") {
        clearInterval(t);
        setCur({ ...cur, linked: true, ok: true, username: r.username || null, error: null });
        toast(`${state.name} est relié à OnlyFans ✓`);
      } else if (r.state === "error") {
        clearInterval(t);
        setErr(r.error || "Échec de la connexion.");
        setPhase("form");
        setTicket(null);
      }
    }, 1500);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [ticket, cur, state.name]);

  const sendCode = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("POST", "/api/of/login/code", { ticket, code });
      setCode("");
      setPhase("human");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    try {
      const r = await api<OfLinkState & { ok: boolean; error?: string }>("POST", "/api/of/check", { creatorId: state.creatorId });
      setCur({ ...cur, ...r });
      toast(r.ok ? "La liaison OnlyFans marche ✓" : r.error || "Liaison cassée", r.ok ? undefined : "err");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!confirm(`Délier ${state.name} d’OnlyFans ?`)) return;
    await api("POST", "/api/of/unlink", { creatorId: state.creatorId }).catch(() => { });
    onClose();
  };

  const field = "mt-1.5 flex h-10 items-center gap-2 rounded-md border bg-card-2 px-3";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[520px] rounded-lg border bg-card" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between border-b px-4 py-3 font-semibold">Relier {state.name} à OnlyFans<button onClick={onClose}><X className="size-4" /></button></h3>
        <div className="px-4 py-4 text-[13px]">
          {cur.linked ? (
            <div className={`mb-4 rounded-md p-3 ${cur.ok ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
              <p className="font-semibold">{cur.ok ? `Relié${cur.username ? ` (@${cur.username})` : ""}` : "La liaison ne marche plus"}</p>
              {cur.error ? <p className="mt-1 text-[12px] text-muted">{cur.error}</p> : null}
              <div className="mt-2 flex gap-2">
                <button disabled={busy} onClick={check} className="flex h-8 items-center gap-1.5 rounded-md bg-card-2 px-3 text-[12px]"><RefreshCw className="size-3.5" /> Vérifier</button>
                <button onClick={unlink} className="flex h-8 items-center gap-1.5 rounded-md bg-card-2 px-3 text-[12px] text-red-400"><Unlink className="size-3.5" /> Délier</button>
              </div>
            </div>
          ) : null}

          {!cur.linked ? (
            <>
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-400">Réservé au propriétaire du compte ou à l’agence mandatée. Le mot de passe sert une seule fois : Bloom ne l’enregistre pas.</p>

              <details className="mt-3 rounded-md border bg-card-2 px-3 py-2">
                <summary className="cursor-pointer text-[12px] font-semibold">Proxy IPRoyal de la modèle</summary>
                <div className="mt-2 space-y-2">
                  <input className={field} placeholder="geo.iproyal.com:12321" value={px.host} onChange={(e) => setPx({ ...px, host: e.target.value })} />
                  <input className={field} placeholder="identifiant" value={px.user} onChange={(e) => setPx({ ...px, user: e.target.value })} />
                  <input className={field} type="password" placeholder="mot de passe" value={px.pass} onChange={(e) => setPx({ ...px, pass: e.target.value })} />
                  <button disabled={busy || !px.host || !px.user || !px.pass} onClick={saveProxy} className="h-8 rounded-md bg-primary px-3 text-[12px] font-semibold text-(--color-on-primary) disabled:opacity-50">Enregistrer le proxy</button>
                </div>
              </details>

              <p className="mt-3 font-semibold">Email OnlyFans</p>
              <div className={field}><Mail className="size-4 text-muted" /><input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} type="email" autoComplete="off" className="min-w-0 flex-1 bg-transparent outline-none" /></div>
              <p className="mt-3 font-semibold">Mot de passe OnlyFans</p>
              <div className={field}><KeyRound className="size-4 text-muted" /><input value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} type="password" autoComplete="new-password" className="min-w-0 flex-1 bg-transparent outline-none" /></div>

              <div className="mt-3 space-y-2 rounded-md bg-card-2 p-3 text-[12px]">
                <label className="flex items-start gap-2"><input type="checkbox" checked={v.c1} onChange={(e) => setV({ ...v, c1: e.target.checked })} /> <span>Ce sont bien des identifiants de compte <b>créatrice</b>.</span></label>
                <label className="flex items-start gap-2"><input type="checkbox" checked={v.c2} onChange={(e) => setV({ ...v, c2: e.target.checked })} /> <span>Je suis propriétaire ou agence mandatée.</span></label>
              </div>

              {phase === "code" ? (
                <div className="mt-3">
                  <p className="font-semibold">Code reçu par mail</p>
                  <div className={field}><ShieldCheck className="size-4 text-muted" /><input autoFocus value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" className="min-w-0 flex-1 bg-transparent tracking-[3px] outline-none" /></div>
                  <button disabled={busy || !code.trim()} onClick={sendCode} className="mt-2 h-9 w-full rounded-md bg-primary font-semibold text-(--color-on-primary) disabled:opacity-50">Valider le code</button>
                </div>
              ) : null}

              {err ? <p className="mt-2 text-[12px] text-red-400">{err}</p> : null}

              {ticket ? (
                <p className="mt-3 text-[12px] text-muted">
                  Connexion en cours…{" "}
                  <a href={`/api/of/live?t=${ticket}`} target="oflive" className="font-semibold text-primary underline">
                    Voir l’écran
                  </a>
                </p>
              ) : (
                <button disabled={busy || !v.email || !v.password || !v.c1 || !v.c2} onClick={submit} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary font-semibold text-(--color-on-primary) disabled:opacity-50">
                  <ShieldCheck className="size-4" /> {busy ? "Connexion…" : "Relier le compte"}
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}