"use client";

import { useCallback, useEffect, useState } from "react";
import { api, toast } from "@/lib/api";
import { ago, cn } from "@/lib/fmt";
import { Avatar, Card, Pill, btnCls, inputCls } from "@/components/ui";

type Account = { id: string; src: "ifw" | "mp"; platform: string; name: string; nick: string | null; username: string | null; connected: number };
type Status = {
  infloww: boolean;
  mypulse: boolean;
  jobs: Record<string, { at: number; ok: boolean; detail: string }>;
  sales: { n: number; first: number | null };
  map: { creatorId: string; account: string | null; manual: number }[];
  accounts: Account[];
  creators: { id: string; name: string; platform: string | null; avatar: string | null }[];
};
const JOB_LABEL: Record<string, string> = {
  "ifw-catalog": "Infloww : créatrices",
  "ifw-sales": "Infloww : ventes récentes",
  "ifw-settle": "Infloww : recalage 14 jours",
  "ifw-backfill": "Infloww : historique (1 an)",
  "mp-catalog": "MyPulse : créatrices",
  "mp-sales": "MyPulse : ventes récentes",
  "mp-backfill": "MyPulse : historique (1 an)",
  fx: "Taux dollar → euro (BCE)",
};

/** Administration : branchement Infloww (OnlyFans) et MyPulse (MYM) pour les vrais chiffres. */
export function Integrations() {
  const [st, setSt] = useState<Status | null>(null);
  const load = useCallback(() => api<Status>("GET", "/api/integrations").then(setSt).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  const [k, setK] = useState({ ifwKey: "", ifwOid: "", mpKey: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      setSt(await api<Status>("POST", "/api/integrations", k));
      setK({ ifwKey: "", ifwOid: "", mpKey: "" });
      toast("Clés enregistrées : la synchro démarre");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const map = async (creatorId: string, account: string) => {
    try {
      setSt(await api<Status>("POST", "/api/revenue/map", { creatorId, account: account || null }));
      toast("Créatrice reliée");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <Card
      title="Infloww & MyPulse (vrais chiffres)"
      action={
        <span className="flex gap-1.5">
          <Pill tone={st?.infloww ? "good" : "warn"}>Infloww {st?.infloww ? "branché" : "non branché"}</Pill>
          <Pill tone={st?.mypulse ? "good" : "warn"}>MyPulse {st?.mypulse ? "branché" : "non branché"}</Pill>
        </span>
      }
      className="xl:col-span-2"
    >
      <p className="text-sm text-muted">
        Les chiffres de la vue d’ensemble viennent d’Infloww (OnlyFans) et de MyPulse (MYM) : chaque vente est comptée une seule fois. Les ventes vues en direct chez Substy s’affichent « en attente » quelques minutes, puis sont remplacées par la vente officielle.
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold">Créatrices de Bloom → compte Infloww / MyPulse</p>
          <div className="flex flex-col gap-2">
            {(st?.creators ?? []).map((c) => {
              const m = st?.map.find((x) => x.creatorId === c.id);
              const src = /mym/i.test(c.platform || "") ? "mp" : "ifw";
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border bg-card-2/50 px-3 py-2">
                  <Avatar src={c.avatar} name={c.name} size="size-8" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                  <select
                    value={m?.account ?? ""}
                    onChange={(e) => map(c.id, e.target.value)}
                    className="h-9 max-w-[220px] rounded-lg border border-input bg-card-2 px-2 text-sm"
                    title={m?.manual ? "Relié à la main" : "Relié automatiquement"}
                  >
                    <option value="">— pas reliée —</option>
                    {(st?.accounts ?? [])
                      .filter((a) => a.src === src)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.username ? ` (@${a.username})` : ""}
                          {a.connected ? "" : " · déconnecté"}
                        </option>
                      ))}
                  </select>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">Une nouvelle créatrice est reliée toute seule (même plateforme, même prénom). Choisis à la main si ce n’est pas la bonne.</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Synchro</p>
          <div className="flex flex-col gap-1">
            {Object.entries(st?.jobs ?? {}).map(([name, j]) => (
              <div key={name} className="flex items-start gap-2 text-sm">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", j.ok ? "bg-emerald-400" : "bg-rose-400")} />
                <span className="w-52 shrink-0 text-muted">{JOB_LABEL[name] ?? name}</span>
                <span className="min-w-0 flex-1 truncate" title={j.detail}>
                  {j.detail} <span className="text-xs text-muted">· {ago(j.at)}</span>
                </span>
              </div>
            ))}
            {st && !Object.keys(st.jobs).length ? <p className="text-sm text-muted">Pas encore lancée.</p> : null}
            {st?.sales?.n ? (
              <p className="mt-1 text-xs text-muted">
                {st.sales.n.toLocaleString("fr-FR")} ventes en base{st.sales.first ? ` depuis le ${new Date(st.sales.first).toLocaleDateString("fr-FR")}` : ""}.
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-semibold">{st?.infloww || st?.mypulse ? "Changer les clés" : "Clés"}</p>
            <input className={inputCls} type="password" autoComplete="off" placeholder="Infloww : clé API" value={k.ifwKey} onChange={(e) => setK({ ...k, ifwKey: e.target.value })} />
            <input className={inputCls} type="password" autoComplete="off" placeholder="Infloww : identifiant d’agence (OID)" value={k.ifwOid} onChange={(e) => setK({ ...k, ifwOid: e.target.value })} />
            <input className={inputCls} type="password" autoComplete="off" placeholder="MyPulse : clé API (X-API-TOKEN)" value={k.mpKey} onChange={(e) => setK({ ...k, mpKey: e.target.value })} />
            <p className="text-xs text-muted">Les mêmes que pour le tableau de bord Zèbre. Vérifiées puis gardées chiffrées sur le serveur de Bloom, jamais sur GitHub.</p>
            <button className={cn(btnCls.primary, "self-start")} disabled={busy || (!k.ifwKey && !k.ifwOid && !k.mpKey)} onClick={save}>
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
