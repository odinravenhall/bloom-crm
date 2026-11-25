"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, ExternalLink, Images, LineChart, Link2, MessageCircle, Send, Settings, ShieldAlert, Ticket, UserRound, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { parisDate, parisTime, tk } from "./MymTeamKit";

// MYM → Accès MYM (Direct). MyPulse y affiche le site de MYM dans sa page. Bloom ne recopie pas le site : il agit
// sur le compte relié avec SES pages, rubrique par rubrique (les mêmes que le menu du site MYM), sans mot de passe.
// Le premier onglet, « Site MYM », affiche le vrai site, relayé par Bloom sur son adresse dédiée (mymsite.mjs).
//
// Ce relais vit sur une autre adresse que Bloom (mym.ravencrm.xyz). Dans un cadre, le navigateur ne garde son cookie
// de session que si Bloom est ouvert sur le même site que lui (bloom.ravencrm.xyz). Depuis bloomcrm.fr, le cadre
// restait sur « Cette page s'ouvre depuis Bloom » (vu le 25/11/2026) : là, le site s'ouvre dans un NOUVEL ONGLET, où
// le cookie passe. On ne rend pas ce cookie valable entre sites : il partirait alors avec des requêtes venues de
// n'importe quelle page, vers un relais qui agit sur le compte de la modèle.
const RELAY_HOST = process.env.NEXT_PUBLIC_MYM_SITE_HOST || "mym.ravencrm.xyz";
const siteOf = (host: string) => host.toLowerCase().split(".").slice(-2).join(".");
const framable = (host: string) => typeof window !== "undefined" && siteOf(window.location.hostname) === siteOf(host);
type LinkRow = { creatorId: string; name: string; username: string | null; linked: boolean; mymId?: string | null; linkedBy?: string | null; linkedAt?: number | null; checkedAt?: number | null; error?: string | null; ok?: boolean };
type Item = { label: string; desc: string; href: string; direct: boolean };
const SECTIONS: { key: string; title: string; icon: React.ReactNode; items: Item[] }[] = [
  { key: "messages", title: "Messages", icon: <MessageCircle className="size-5" />, items: [
    { label: "Chatting", desc: "Lire et répondre aux fans, envoyer des médias payants.", href: "/app/mym/chatting", direct: true },
    { label: "Switchboard", desc: "Toutes les conversations des comptes, d’un coup d’œil.", href: "/app/mym/switchboard", direct: true },
    { label: "Mass DM", desc: "Un message privé à beaucoup de fans, retirable.", href: "/app/mym/massdm", direct: true },
  ] },
  { key: "studio", title: "Studio", icon: <Images className="size-5" />, items: [
    { label: "Push et MoDs", desc: "Créer un push ou un Media On Demand chez MYM.", href: "/app/mym/push", direct: true },
    { label: "Planification", desc: "Programmer des publications sur le profil.", href: "/app/mym/planification", direct: true },
    { label: "Importer des médias", desc: "Envoyer photos et vidéos dans le mym.cloud.", href: "/app/mym/importer", direct: true },
    { label: "Liens de suivi", desc: "Créer et suivre les tracking links du compte.", href: "/app/mym/liens", direct: true },
    { label: "Bons de réduction", desc: "Créer et supprimer des codes promo.", href: "/app/mym/bons", direct: true },
  ] },
  { key: "income", title: "Revenus", icon: <LineChart className="size-5" />, items: [
    { label: "Statistiques Globales", desc: "Chiffre d’affaires de tous les comptes, jour par jour.", href: "/app/mym/stats", direct: true },
    { label: "Analytique", desc: "Le détail d’un compte, par type de revenu.", href: "/app/mym/analytique", direct: true },
    { label: "Transactions", desc: "La liste des transactions lue chez MYM.", href: "/app/mym/transactions", direct: true },
  ] },
  { key: "profile", title: "Profil", icon: <UserRound className="size-5" />, items: [
    { label: "Feed", desc: "Les publications du profil, avec likes et vues.", href: "/app/mym/feed", direct: true },
    { label: "Liste d’amis", desc: "Les amies affichées sur le profil : ajouter, retirer, ordonner.", href: "/app/mym/amis", direct: true },
    { label: "Abonnés", desc: "Abonnés, anciens et intéressés du compte.", href: "/app/mym/abonnes", direct: true },
  ] },
  { key: "notifs", title: "Notifs", icon: <Bell className="size-5" />, items: [
    { label: "Notifications MYM", desc: "Nouveaux abonnés, renouvellements, achats.", href: "/app/mym/notifications", direct: true },
  ] },
];
const ICONS: Record<string, React.ReactNode> = { "Push et MoDs": <Send className="size-4" />, Planification: <CalendarClock className="size-4" />, "Liens de suivi": <Link2 className="size-4" />, "Bons de réduction": <Ticket className="size-4" />, Abonnés: <Users className="size-4" /> };
const stamp = (t?: number | null) => (t ? `${parisDate(t)} ${parisTime(t)}` : "—");

export function MymDirect() {
  const { creators, creatorId, setCreator } = useCreators();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("site");
  // Le vrai site de MYM, relayé par Bloom sur son adresse dédiée (admins et managers).
  const [site, setSite] = useState<{ url: string; host: string } | null>(null);
  // Ouvert dans un nouvel onglet (Bloom sur un autre site que le relais). `url` = le lien à cliquer quand le
  // navigateur a bloqué l'onglet ; vide une fois le site ouvert.
  const [away, setAway] = useState<{ url: string } | null>(null);
  const [framed, setFramed] = useState(true);
  useEffect(() => setFramed(framable(RELAY_HOST)), []);
  const [siteErr, setSiteErr] = useState("");
  const [busy, setBusy] = useState(false);
  const openSite = async () => {
    if (!creatorId) return;
    setBusy(true);
    setSiteErr("");
    setSite(null);
    setAway(null);
    // Nouvel onglet : ouvert tout de suite, pendant le clic (plus tard, le navigateur le bloquerait), puis envoyé
    // sur le site quand le ticket arrive. Il ne garde aucun lien vers la page de Bloom.
    const tab = framable(RELAY_HOST) ? null : window.open("", "_blank");
    if (tab) {
      tab.opener = null;
      try {
        tab.document.title = "Site MYM";
        tab.document.body.style.cssText = "margin:0;display:grid;place-items:center;height:100vh;background:#1a1d21;color:#ced4da;font:15px system-ui";
        tab.document.body.textContent = "Ouverture du site MYM…";
      } catch {}
    }
    try {
      const r = await api<{ url: string; host: string }>("POST", "/api/mym/site/ticket", { creatorId });
      // L'adresse dédiée existe-t-elle ? (sinon le cadre resterait blanc sans explication)
      const ok = await fetch(`https://${r.host}/__bloom/ping`, { mode: "no-cors", cache: "no-store" }).then(() => true).catch(() => false);
      if (!ok) {
        tab?.close();
        setSiteErr(`L’adresse ${r.host} ne répond pas encore : elle doit être créée chez l’hébergeur du nom de domaine et ajoutée sur le serveur.`);
      } else if (framable(r.host)) {
        tab?.close();
        setSite(r);
      } else if (tab && !tab.closed) {
        tab.location.replace(r.url);
        setAway({ url: "" });
      } else setAway({ url: r.url });
    } catch (e) {
      tab?.close();
      setSiteErr((e as Error).message);
    }
    setBusy(false);
  };
  useEffect(() => {
    setSite(null);
    setAway(null);
  }, [creatorId]);
  useEffect(() => {
    api<{ links: LinkRow[] }>("GET", "/api/mym/links").then((r) => setLinks(r.links)).catch((e) => setErr((e as Error).message));
  }, []);
  const l = links?.find((x) => x.creatorId === creatorId) ?? null;
  const sec = SECTIONS.find((s) => s.key === tab);
  return (
    <div className="mp-font flex min-h-full" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      {/* La barre du site MYM : Messages, Studio, Revenus, Profil, Notifs, Réglages. */}
      <div className="flex w-[76px] shrink-0 flex-col items-center gap-1 py-4" style={{ background: "#111", borderRight: "1px solid var(--mp-line)" }}>
        {[["site", "Site MYM", <ExternalLink key="x" className="size-5" />] as const, ...SECTIONS.map((s) => [s.key, s.title, s.icon] as const), ["settings", "Réglages", <Settings key="s" className="size-5" />] as const].map(([k, t, icon]) => <button key={k} onClick={() => setTab(k)} className="flex w-full flex-col items-center gap-1.5 py-3 text-[11px]" style={tab === k ? { background: "#222", color: "#fff" } : { color: "#c9cdd6" }}>{icon}{t}</button>)}
      </div>
      <div className="min-w-0 flex-1 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><h1 className="text-[20px] font-semibold" style={{ color: "var(--mp-head)" }}>Accès MYM (Direct)</h1><p className="text-[13px]">Tout ce que Bloom fait directement sur le compte MYM relié, sans mot de passe.</p></div>
          {creators.length > 1 ? <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="h-10 rounded-lg px-3 text-[13.5px] outline-none" style={tk.inp}>{creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : null}
        </div>
        {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
        {links && l ? (
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl px-4 py-3 text-[13px]" style={l.linked && l.ok !== false ? { background: "#143229", border: "1px solid #1f7a5c", color: "#8ff0cc" } : { background: "#3a1d1a", border: "1px solid #6b2d25", color: "#ff8b76" }}>
            {l.linked ? <><b>{l.ok !== false ? "Compte relié" : "Liaison en erreur"}{l.username ? ` : @${l.username}` : ""}</b><span>relié le {stamp(l.linkedAt)}{l.linkedBy ? ` par ${l.linkedBy}` : ""}</span><span>dernière vérification : {stamp(l.checkedAt)}</span>{l.error ? <span>{l.error}</span> : null}</> : <><ShieldAlert className="size-4" /><b>Ce compte MYM n’est pas relié à Bloom.</b><Link href="/app/mym" className="underline">Le relier dans Compte Creator</Link></>}
          </p>
        ) : null}

        {tab === "site" ? (
          <div className="mt-4">
            {site ? (
              <>
                <p className="mb-2 flex flex-wrap items-center gap-3 text-[12.5px]"><span>Le site de MYM, avec la session du compte relié. Tout ce que tu y fais est fait sur le compte de la modèle.</span><span className="flex-1" /><button onClick={openSite} className="rounded border px-3 py-1" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}>Recharger</button></p>
                <iframe key={site.url} src={site.url} title="Site MYM" className="w-full rounded-xl" style={{ height: "calc(100vh - 230px)", minHeight: 520, border: "1px solid var(--mp-line)", background: "#fff" }} />
              </>
            ) : (
              <div className="max-w-3xl rounded-2xl p-5" style={tk.card}>
                <p className="text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}>{away ? (away.url ? "Ton navigateur a bloqué le nouvel onglet" : "Le site de MYM est ouvert dans un nouvel onglet") : framed ? "Le site de MYM dans Bloom" : "Le site de MYM, déjà connecté"}</p>
                <p className="mt-2 text-[13px] leading-relaxed">{away ? (away.url ? "Ouvre-le avec le bouton ci-dessous. Ce lien ne sert qu’une fois et reste valable une minute." : "Il est connecté au compte relié, sans mot de passe : tout ce que tu y fais est fait sur le compte de la modèle. Onglet fermé, ou session expirée (4 heures) ? Rouvre-le d’ici.") : `Ouvre creators.mym.fans ${framed ? "ici" : "dans un nouvel onglet"}, déjà connecté au compte relié, sans mot de passe. Réservé aux admins et managers. Chaque ouverture est notée dans Activité. Se déconnecter du site y est bloqué (cela couperait la liaison avec Bloom).`}</p>
                {away?.url ? (
                  <a href={away.url} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => setAway({ url: "" }), 0)} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold text-white" style={{ background: "#4a57a8" }}><ExternalLink className="size-4" /> Ouvrir le site MYM</a>
                ) : (
                  <button onClick={openSite} disabled={busy || !l?.linked} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: "#4a57a8" }}><ExternalLink className="size-4" /> {busy ? "Ouverture…" : away ? "Rouvrir le site MYM" : "Ouvrir le site MYM"}</button>
                )}
                {siteErr ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{siteErr}</p> : null}
              </div>
            )}
          </div>
        ) : sec ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sec.items.map((it) => (
              <Link key={it.label} href={creatorId ? `${it.href}?c=${encodeURIComponent(creatorId)}` : it.href} className="rounded-2xl p-5 transition hover:brightness-125" style={tk.card}>
                <p className="flex items-center gap-2.5 text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}><span className="grid size-9 place-items-center rounded-lg" style={{ background: "rgba(199,255,74,.12)", color: "var(--mp-accent)" }}>{ICONS[it.label] || sec.icon}</span>{it.label}</p>
                <p className="mt-2 text-[13px] leading-relaxed">{it.desc}</p>
                <p className="mt-3 text-[11.5px] font-semibold" style={{ color: "var(--mp-accent)" }}>En direct sur le compte MYM</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 max-w-3xl rounded-2xl p-5" style={tk.card}>
            <p className="text-[15px] font-semibold" style={{ color: "var(--mp-head)" }}>Réglages du compte MYM</p>
            <p className="mt-2 text-[13px] leading-relaxed">Les réglages du compte (prix de l’abonnement, bio et photo du profil, moyens de paiement, mot de passe, documents) ne se changent pas depuis Bloom : ils restent sur le site de MYM, avec les identifiants de la modèle.</p>
            <a href="https://creators.mym.fans/app/reglages" target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold text-white" style={{ background: "#4a57a8" }}><ExternalLink className="size-4" /> Ouvrir creators.mym.fans</a>
            <p className="mt-2 text-[12px]">S’ouvre dans un nouvel onglet ; il faut y être connecté avec le compte de la modèle.</p>
          </div>
        )}
        <p className="mt-5 max-w-3xl text-[11.5px] leading-relaxed" style={{ color: "var(--mp-muted)" }}>« Site MYM » affiche le vrai site de MYM, relayé par Bloom. Les autres rubriques ouvrent les pages de Bloom qui agissent sur le compte. Les parties récentes du site MYM (nouvelle messagerie, réglages) peuvent ne pas s’afficher dans le cadre.</p>
      </div>
    </div>
  );
}
