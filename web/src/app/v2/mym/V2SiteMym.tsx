"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe, RefreshCw, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/rv/components/ui";
import { PALETTE, Ring } from "../kit";
import { errText } from "../media/MediaKit";

// Bloom v2 → MYM → Site MYM (25/11/2026, « Constellation »). Remplace, dans la v2, `MymDirect` (dont les autres
// rubriques renvoyaient vers les écrans de la version actuelle). Le vrai site creators.mym.fans, déjà connecté au
// compte relié, par le relais de Bloom (mymsite.mjs : ticket à usage unique, session de 4 h) ; admins et managers.
// Même règle qu'avant : dans la page si Bloom est sur le même site que le relais (bloom.ravencrm.xyz), sinon
// (bloomcrm.fr) dans un nouvel onglet, car le navigateur refuse le cookie du relais dans un cadre d'un autre site.
type LinkRow = { creatorId: string; name: string; username: string | null; linked: boolean; linkedBy?: string | null; linkedAt?: number | null; checkedAt?: number | null; error?: string | null; ok?: boolean };
const RELAY_HOST = process.env.NEXT_PUBLIC_MYM_SITE_HOST || "mym.ravencrm.xyz";
const siteOf = (host: string) => host.toLowerCase().split(".").slice(-2).join(".");
const framable = (host: string) => typeof window !== "undefined" && siteOf(window.location.hostname) === siteOf(host);
const stamp = (t?: number | null) => (t ? new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export function V2SiteMym() {
  const { creators } = useCreators();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [cur, setCur] = useState("");
  const [err, setErr] = useState("");
  const [site, setSite] = useState<{ url: string } | null>(null);
  const [away, setAway] = useState<{ url: string } | null>(null);
  const [framed, setFramed] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFramed(framable(RELAY_HOST)), []);
  useEffect(() => {
    api<{ links: LinkRow[] }>("GET", "/api/mym/links").then((r) => setLinks(r.links)).catch((e) => setErr(errText(e)));
  }, []);
  const models = links ?? [];
  const m = models.find((x) => x.creatorId === cur) ?? models.find((x) => x.linked) ?? models[0] ?? null;
  const mid = m?.creatorId ?? "";
  useEffect(() => (setSite(null), setAway(null)), [mid]);
  const avatarOf = (id: string) => creators.find((c) => c.id === id)?.avatar ?? null;

  const open = async () => {
    if (!mid) return;
    setBusy(true);
    setErr("");
    setSite(null);
    setAway(null);
    // Nouvel onglet : ouvert pendant le clic (sinon le navigateur le bloque), envoyé sur le site quand le ticket arrive.
    const tab = framable(RELAY_HOST) ? null : window.open("", "_blank");
    if (tab) {
      tab.opener = null;
      try {
        tab.document.title = "Site MYM";
        tab.document.body.style.cssText = "margin:0;display:grid;place-items:center;height:100vh;background:#050506;color:#8d8d95;font:15px system-ui";
        tab.document.body.textContent = "Ouverture du site MYM…";
      } catch {}
    }
    try {
      const r = await api<{ url: string; host: string }>("POST", "/api/mym/site/ticket", { creatorId: mid });
      const ok = await fetch(`https://${r.host}/__bloom/ping`, { mode: "no-cors", cache: "no-store" }).then(() => true).catch(() => false);
      if (!ok) (tab?.close(), setErr(`L’adresse ${r.host} ne répond pas.`));
      else if (framable(r.host)) (tab?.close(), setSite({ url: r.url }));
      else if (tab && !tab.closed) (tab.location.replace(r.url), setAway({ url: "" }));
      else setAway({ url: r.url });
    } catch (e) {
      tab?.close();
      setErr(errText(e));
    }
    setBusy(false);
  };

  return (
    <div className="v2-scroll mx-auto flex h-full max-w-[1440px] flex-col overflow-y-auto px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">MYM · Accès direct</p>
          <h1 className="v2-h1 mt-1">Site MYM</h1>
          <p className="mt-1 max-w-[720px] text-[13px] text-muted">Le vrai site creators.mym.fans, déjà connecté au compte relié, sans mot de passe. Tout ce qui y est fait l’est sur le compte de la modèle, et chaque ouverture est notée dans Activité.</p>
        </div>
        {site ? <button onClick={() => void open()} className="v2-select" title="Rouvrir le site"><RefreshCw className="size-4 text-muted" />Recharger</button> : null}
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {!links && !err ? <p className="py-20 text-center text-[13px] text-muted">Chargement…</p> : null}

      {m ? (
        <div className={`mt-5 grid min-h-0 gap-4 lg:grid-cols-[232px_minmax(0,1fr)] ${site ? "flex-1" : ""}`}>
          <aside className="v2-rise min-w-0 lg:self-start" style={{ ["--i" as string]: 1 }}>
            <div className="v2-card p-1.5">
              <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Comptes MYM</p>
              <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
                {models.map((x, i) => (
                  <button key={x.creatorId} onClick={() => setCur(x.creatorId)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={mid === x.creatorId} aria-pressed={mid === x.creatorId}>
                    <Ring color={PALETTE[i % PALETTE.length]}><Avatar src={avatarOf(x.creatorId)} name={x.name} size="size-8" /></Ring>
                    <span className="min-w-0 flex-1 text-left">
                      <b className="block truncate text-[13px] leading-tight">{x.name}</b>
                      <span className="block truncate text-[11.5px]" style={{ color: !x.linked || x.ok === false ? "var(--v2-down)" : "var(--color-muted)" }}>{!x.linked ? "pas relié à Bloom" : x.ok === false ? "liaison en erreur" : x.username ? `@${x.username}` : "relié"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {m.linked ? (
              <div className="v2-card mt-3 space-y-1 p-3 text-[12px]">
                <p className="font-bold">{m.ok !== false ? "Compte relié" : "Liaison en erreur"}</p>
                <p className="text-muted">Relié le {stamp(m.linkedAt)}{m.linkedBy ? ` par ${m.linkedBy}` : ""}</p>
                <p className="text-muted">Vérifié le {stamp(m.checkedAt)}</p>
                {m.error ? <p style={{ color: "var(--v2-down)" }}>{m.error}</p> : null}
              </div>
            ) : null}
          </aside>

          <section className="v2-rise flex min-h-0 min-w-0 flex-col" style={{ ["--i" as string]: 2 }}>
            {site ? (
              <iframe key={site.url} src={site.url} title={`Site MYM · ${m.name}`} className="min-h-[560px] w-full flex-1 rounded-[16px] border bg-white" style={{ borderColor: "var(--color-line)" }} />
            ) : (
              <div className="v2-card p-6">
                {!m.linked ? (
                  <p className="flex items-center gap-2 text-[13px] text-muted"><ShieldAlert className="size-4" />Le compte MYM de {m.name} n’est pas relié à Bloom : relie-le dans MYM → Compte Creator.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-5">
                    <span className="grid size-14 place-items-center rounded-2xl" style={{ background: "rgb(59 130 246 / 0.14)", color: "var(--v2-sky)" }}><Globe className="size-6" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-bold">{away ? (away.url ? "Ton navigateur a bloqué le nouvel onglet" : "Le site de MYM est ouvert dans un nouvel onglet") : `Le site MYM de ${m.name}`}</p>
                      <p className="mt-1 max-w-[620px] text-[13px] leading-relaxed text-muted">{away ? (away.url ? "Ouvre-le avec le bouton : ce lien ne sert qu’une fois et reste valable une minute." : "Onglet fermé, ou session expirée (4 heures) ? Rouvre-le d’ici.") : framed ? "Il s’affiche ici, dans la page." : "Il s’ouvre dans un nouvel onglet (sur cette adresse, le navigateur ne permet pas de l’afficher dans la page)."} Se déconnecter du site y est bloqué : cela couperait la liaison avec Bloom.</p>
                    </div>
                    {away?.url ? (
                      <a href={away.url} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => setAway({ url: "" }), 0)} className="v2-btn"><ExternalLink className="size-4" />Ouvrir le site MYM</a>
                    ) : (
                      <button onClick={() => void open()} disabled={busy} className="v2-btn"><ExternalLink className="size-4" />{busy ? "Ouverture…" : away ? "Rouvrir le site MYM" : "Ouvrir le site MYM"}</button>
                    )}
                  </div>
                )}
              </div>
            )}
            {!site ? <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-muted">Marchent : les pages « classiques » du site (messages, revenus, profil, studio). Ne marchent pas dans le relais : la nouvelle messagerie et les réglages de MYM (MYM n’accepte que sa propre adresse) ; le relais affiche alors un message. Les réglages du compte se changent sur creators.mym.fans directement.</p> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
