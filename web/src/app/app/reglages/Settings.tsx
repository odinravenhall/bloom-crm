"use client";

import { useCallback, useEffect, useState } from "react";
import { api, toast } from "@/lib/api";
import { ago, cn } from "@/lib/fmt";
import { Avatar, Card, Page, PageHeader, Pill, btnCls, inputCls } from "@/components/ui";

type Status = {
  linked: boolean;
  account: { name?: string; email?: string } | null;
  token: { ok: boolean; at: number; error?: string } | null;
  creators: { id: string; name: string; avatar: string | null; platform: string | null; stream: { live: boolean; reason?: string } | null }[];
  error: string | null;
};
type Discord = {
  ready: boolean;
  bot: { id: string; name: string } | null;
  guild: string | null;
  live: boolean;
  invite: string | null;
  guilds: { id: string; name: string }[];
  oauth: boolean;
  hasSecret: boolean;
  redirect: string;
};

/** Administration : connexion au compte agence Substy et bot Discord « Bloom ». */
export function Settings() {
  const [st, setSt] = useState<Status | null>(null);
  const [dc, setDc] = useState<Discord | null>(null);
  const load = useCallback(() => {
    api<Status>("GET", "/api/status").then(setSt).catch((e) => toast((e as Error).message, "err"));
    api<Discord>("GET", "/api/discord").then(setDc).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const [client, setClient] = useState("");
  const relink = async () => {
    try {
      await api("POST", "/api/relink", { client });
      setClient("");
      toast("Compte Substy relié");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const saveBot = async (guild?: string) => {
    setBusy(true);
    try {
      const r = await api<Discord>("POST", "/api/discord", { token, guild, secret });
      setDc(r);
      setToken("");
      setSecret("");
      toast(r.oauth ? "Discord branché : bouton de connexion et /connexion prêts" : r.ready ? "Bot Discord branché : /connexion est prêt" : "Enregistré : choisis le serveur");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const t = st?.token;
  return (
    <Page>
      <PageHeader eyebrow="Administration" title="Substy & Discord" sub="Les deux branchements de Bloom : le compte agence Substy (messages, IA, ventes) et le bot Discord (connexion de l’équipe, annonces)." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Compte agence Substy">
          <p className="text-sm text-muted">{st?.account ? `Compte : ${st.account.name || ""}${st.account.email ? " · " + st.account.email : ""}` : "Aucun compte relié"}</p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <span className={cn("size-2.5 rounded-full", t ? (t.ok ? "bg-emerald-400" : "bg-rose-400") : "bg-amber-400")} />
            {t ? (t.ok ? `Connecté · jeton renouvelé ${ago(t.at)}` : `Problème : ${t.error}`) : "En attente du premier jeton…"}
          </p>
          {st?.error ? <p className="mt-2 text-sm font-semibold text-rose-300">{st.error}</p> : null}
          <div className="mt-4 flex flex-col gap-2">
            {(st?.creators ?? []).map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border bg-card-2/50 px-3 py-2">
                <Avatar src={c.avatar} name={c.name} size="size-8" />
                <span className="flex-1 font-semibold">{c.name}</span>
                {c.stream?.live ? <Pill tone="good">temps réel actif</Pill> : <Pill tone="warn">{c.stream?.reason || "connexion…"}</Pill>}
              </div>
            ))}
          </div>
          <div className="mt-5 border-t pt-4">
            <p className="text-sm font-semibold">Relier à nouveau</p>
            <p className="mt-1 text-xs text-muted">Session Substy expirée ou autre compte : colle une nouvelle valeur du cookie « __client » de clerk.substy.ai.</p>
            <textarea className={cn(inputCls, "mt-2 h-20 py-2")} spellCheck={false} value={client} onChange={(e) => setClient(e.target.value)} />
            <button className={cn(btnCls.secondary, "mt-2")} disabled={!client.trim()} onClick={relink}>
              Relier
            </button>
          </div>
        </Card>

        <Card
          title="Bot Discord « Bloom »"
          action={dc?.ready ? <Pill tone={dc.live ? "good" : "warn"}>{dc.live ? "en ligne" : "connexion…"}</Pill> : <Pill tone="warn">pas branché</Pill>}
        >
          <p className="text-sm text-muted">
            L’équipe entre dans Bloom en tapant <b className="text-fg">/connexion</b> sur le serveur Discord. Le rôle Discord donne l’accès : <b className="text-fg">Admin</b>, <b className="text-fg">Manager</b> ou <b className="text-fg">Chatteur</b>. Sans rôle, pas d’accès. Chaque mise à jour de Bloom est annoncée dans #mises-a-jour-bloom.
          </p>
          {dc?.bot ? (
            <p className="mt-3 text-sm">
              Bot : <b>{dc.bot.name}</b>
              {dc.guild ? <> · serveur : <b>{dc.guilds.find((g) => g.id === dc.guild)?.name ?? dc.guild}</b></> : null}
            </p>
          ) : null}
          {dc?.bot && !dc.guild ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm font-semibold">Choisis le serveur de l’agence :</p>
              {dc.guilds.length ? (
                dc.guilds.map((g) => (
                  <button key={g.id} className={btnCls.secondary} disabled={busy} onClick={() => saveBot(g.id)}>
                    {g.name}
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted">
                  Le bot n’est sur aucun serveur.{" "}
                  {dc.invite ? (
                    <a className="font-semibold text-primary-soft underline" href={dc.invite} target="_blank" rel="noreferrer">
                      Inviter le bot
                    </a>
                  ) : null}
                </p>
              )}
            </div>
          ) : null}
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            Bouton « Se connecter avec Discord » :{" "}
            {dc?.oauth ? <Pill tone="good">actif</Pill> : <Pill tone="warn">{dc?.hasSecret ? "en attente du bot" : "client secret manquant"}</Pill>}
          </p>
          <div className="mt-5 flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-semibold">{dc?.bot ? "Changer le jeton du bot" : "Jeton du bot"}</p>
            <p className="text-xs text-muted">Portail Discord → ton application → Bot → Reset Token.</p>
            <input className={inputCls} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Jeton du bot" />
            <p className="mt-2 text-sm font-semibold">{dc?.hasSecret ? "Changer le client secret" : "Client secret (bouton de connexion)"}</p>
            <p className="text-xs text-muted">
              Portail Discord → OAuth2 → Client Secret (Reset Secret). Dans OAuth2 → Redirects, ajoute aussi : <code className="rounded bg-card-2 px-1.5 py-0.5 text-[11px] text-fg select-all">{dc?.redirect ?? "https://bloom.ravencrm.xyz/api/auth/callback"}</code>
            </p>
            <input className={inputCls} type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Client secret" />
            <p className="text-xs text-muted">Les deux sont gardés chiffrés sur le serveur de Bloom, jamais sur GitHub.</p>
            <button className={cn(btnCls.primary, "self-start")} disabled={busy || (!token.trim() && !secret.trim())} onClick={() => saveBot()}>
              Enregistrer
            </button>
          </div>
        </Card>
      </div>
    </Page>
  );
}
