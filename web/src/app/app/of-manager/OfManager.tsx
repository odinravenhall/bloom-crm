"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { CreatorTabs, useCreators } from "@/lib/creators";
import { btnCls } from "@/components/ui";

const KEY = "bloom.ofb.authorized"; // sessions déjà autorisées dans ce navigateur

const authorized = (site: string) => {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || "[]") as string[]).includes(site);
  } catch {
    return false;
  }
};
const remember = (site: string) => {
  try {
    const l = (JSON.parse(localStorage.getItem(KEY) || "[]") as string[]).filter((x) => x !== site);
    localStorage.setItem(KEY, JSON.stringify([site, ...l].slice(0, 30)));
  } catch {}
};

/**
 * OF Manager (essai) : le vrai site OnlyFans / MYM de la modèle choisie, affiché dans Bloom (site intégré de Substy).
 * Bloom ouvre la session ; ce navigateur l'autorise une fois (connexion Substy de la personne), toutes les 4 h au plus.
 */
export function OfManager() {
  const { creatorId, creator } = useCreators();
  const [s, setS] = useState<{ site: string; access: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [n, setN] = useState(0);

  const load = useCallback(async () => {
    if (!creatorId) return;
    setBusy(true);
    setErr("");
    setS(null);
    setReady(false);
    try {
      const r = await api<{ site: string; access: string }>("GET", `/api/of-browser/open?creatorId=${encodeURIComponent(creatorId)}`);
      setS(r);
      setReady(authorized(r.site));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [creatorId]);
  useEffect(() => {
    load();
  }, [load]);

  // Autoriser ce navigateur : la page d'accès de Substy s'ouvre (connexion Substy), puis on affiche le site.
  const authorize = () => {
    if (!s) return;
    const w = window.open(s.access, "substy-access", "width=520,height=640");
    const t = setInterval(() => {
      if (!w || w.closed) clearInterval(t);
    }, 500);
    setTimeout(() => {
      try {
        w?.close();
      } catch {}
      remember(s.site);
      setReady(true);
      setN((x) => x + 1);
    }, 6000);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">OF Manager · essai</p>
          <p className="truncate text-sm font-semibold">{creator ? `Compte de ${creator.name}` : "Choisis une modèle"}</p>
        </div>
        <div className="flex items-center gap-2">
          {s ? (
            <button onClick={authorize} className={btnCls.ghost} title="Si le site ne s’affiche pas : autoriser à nouveau ce navigateur">
              <KeyRound className="size-4" /> Autoriser
            </button>
          ) : null}
          <button onClick={() => (ready ? setN((x) => x + 1) : load())} disabled={busy} className={btnCls.ghost} title="Recharger le site">
            <RefreshCw className="size-4" /> Recharger
          </button>
          <CreatorTabs />
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-black">
        {busy ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted">
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Ouverture du compte…
            </span>
          </p>
        ) : null}
        {err ? <p className="absolute inset-x-0 top-10 mx-auto max-w-lg rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-300">{err}</p> : null}
        {s && !ready ? (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="max-w-md rounded-2xl border bg-card p-6 text-center">
              <KeyRound className="mx-auto size-6" />
              <p className="mt-3 font-semibold">Autoriser ce navigateur</p>
              <p className="mt-1 text-sm text-muted">Une petite fenêtre Substy s’ouvre quelques secondes (il faut être connecté à Substy). À refaire au plus toutes les 4 heures.</p>
              <button onClick={authorize} className={`${btnCls.primary} mt-4`}>
                Ouvrir le compte de {creator?.name ?? "la modèle"}
              </button>
            </div>
          </div>
        ) : null}
        {s && ready ? <iframe key={`${s.site}-${n}`} src={`${s.site}?theme=dark`} title="Site de la modèle" className="h-full w-full border-0" allow="clipboard-read; clipboard-write" /> : null}
      </div>
    </div>
  );
}
