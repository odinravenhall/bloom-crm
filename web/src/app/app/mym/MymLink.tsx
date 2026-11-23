"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, Link2, RefreshCw, Unlink, X, XCircle } from "lucide-react";
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
        </div>
      </div>
    </div>
  );
}
