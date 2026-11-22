"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { CreatorTabs, useCreators } from "@/lib/creators";
import { btnCls } from "@/components/ui";

/**
 * OF Manager (premier essai) : le vrai site OnlyFans / MYM de la créatrice choisie, affiché dans Bloom.
 * Le serveur de Bloom ouvre la session du site intégré de Substy et le relaie (« /s/<session>/… »).
 */
export function OfManager() {
  const { creatorId, creator } = useCreators();
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const openSite = useCallback(async () => {
    if (!creatorId) return;
    setBusy(true);
    setErr("");
    setSrc(null);
    try {
      const r = await api<{ src: string }>("GET", `/api/of-browser/open?creatorId=${encodeURIComponent(creatorId)}`);
      setSrc(r.src);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [creatorId]);
  useEffect(() => {
    openSite();
  }, [openSite]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">OF Manager · essai</p>
          <p className="truncate text-sm font-semibold">{creator ? `Compte de ${creator.name}` : "Choisis une modèle"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openSite} disabled={busy} className={btnCls.ghost} title="Rouvrir le site">
            <RefreshCw className="size-4" /> Rouvrir
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
        {src ? <iframe key={src} src={src} title="Site de la modèle" className="h-full w-full border-0" allow="clipboard-read; clipboard-write" /> : null}
      </div>
    </div>
  );
}
