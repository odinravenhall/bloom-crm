"use client";

import { useEffect, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { getPf, PF_LABEL, type Pf } from "@/lib/platform";
import type { ScreenKey } from "./screens";

// Un écran de la v2 = le même nom dans le menu, et derrière le composant de la plateforme choisie. Refaits pour la v2
// (un seul écran pour les deux plateformes) : Messagerie, Chiffres. Les autres sont encore ceux de la version actuelle,
// repeints par les variables de v2.css ; ils seront refaits un par un.
const Wait = () => <div className="grid h-full min-h-[50vh] place-items-center text-[13px] text-muted">Chargement…</div>;
const load = <P extends object>(f: () => Promise<ComponentType<P>>) => dynamic(f, { ssr: false, loading: Wait });

const V2Messaging = load(() => import("./chat/V2Messaging").then((m) => m.V2Messaging));
const Scripts = load(() => import("@/app/app/scripts/Scripts").then((m) => m.Scripts));
const MymScripts = load(() => import("@/app/app/mym/MymScripts").then((m) => m.MymScripts));
const SmartMessages = load(() => import("@/app/app/smart/SmartMessages").then((m) => m.SmartMessages));
const MymMassDm = load(() => import("@/app/app/mym/MymMassDm").then((m) => m.MymMassDm));
const Lists = load(() => import("@/app/app/listes/Lists").then((m) => m.Lists));
const MymFans = load(() => import("@/app/app/mym/MymFans").then((m) => m.MymFans));
const Vault = load(() => import("@/app/app/vault/Vault").then((m) => m.Vault));
const MymStudio = load(() => import("@/app/app/mym/MymStudio").then((m) => m.MymStudio));
const V2Stats = load(() => import("./stats/V2Stats").then((m) => m.V2Stats));
const CreatorReports = load(() => import("@/app/app/analytics/creators/CreatorReports").then((m) => m.CreatorReports));
const MymAnalytics = load(() => import("@/app/app/mym/MymAnalytics").then((m) => m.MymAnalytics));
const TrackingLinks = load(() => import("@/app/app/tracking/TrackingLinks").then((m) => m.TrackingLinks));
const MymTrack = load(() => import("@/app/app/mym/MymTrack").then((m) => m.MymTrack));
const MessageDashboard = load(() => import("@/app/app/analytics/messages/MessageDashboard").then((m) => m.MessageDashboard));
const MymMessages = load(() => import("@/app/app/mym/MymMessages").then((m) => m.MymMessages));
const EmployeeReports = load(() => import("@/app/app/analytics/employees/EmployeeReports").then((m) => m.EmployeeReports));
const MymTeamSales = load(() => import("@/app/app/mym/MymTeamSales").then((m) => m.MymTeamSales));
const MymShifts = load(() => import("@/app/app/mym/MymShifts").then((m) => m.MymShifts));
const MymActivity = load(() => import("@/app/app/mym/MymActivity").then((m) => m.MymActivity));
const MymLive = load(() => import("@/app/app/mym/MymLive").then((m) => m.MymLive));
const MymModeration = load(() => import("@/app/app/mym/MymModeration").then((m) => m.MymModeration));
const ManageEmployees = load(() => import("@/app/app/employees/ManageEmployees").then((m) => m.ManageEmployees));
const MymAccess = load(() => import("@/app/app/mym/MymAccess").then((m) => m.MymAccess));
const MymPush = load(() => import("@/app/app/mym/MymPush").then((m) => m.MymPush));
const MymPlanning = load(() => import("@/app/app/mym/MymPlanning").then((m) => m.MymPlanning));
const MymFeed = load(() => import("@/app/app/mym/MymFeed").then((m) => m.MymFeed));
const MymFriends = load(() => import("@/app/app/mym/MymFriends").then((m) => m.MymFriends));
const MymVouchers = load(() => import("@/app/app/mym/MymVouchers").then((m) => m.MymVouchers));
const MymNotifs = load(() => import("@/app/app/mym/MymNotifs").then((m) => m.MymNotifs));
const MymDirect = load(() => import("@/app/app/mym/MymDirect").then((m) => m.MymDirect));

// Écrans qui remplissent toute la hauteur (messageries) : pas de marge autour.
const FULL: ScreenKey[] = ["messagerie", "site-mym"];

function pick(key: ScreenKey, pf: Pf, canEdit: boolean): React.ReactNode | null {
  const m = pf === "mym";
  switch (key) {
    case "messagerie": return <V2Messaging />;
    case "scripts": return m ? <MymScripts /> : <Scripts />;
    case "envois": return m ? <MymMassDm /> : <SmartMessages />;
    case "fans": return m ? <MymFans tab="active" /> : <Lists canEdit={canEdit} />;
    case "medias": return m ? <MymStudio /> : <Vault canEdit={canEdit} />;
    // Refait pour la v2 : le même écran pour les deux plateformes (il demande les chiffres de la plateforme affichée).
    case "chiffres": return <V2Stats pf={pf} />;
    case "analytique": return m ? <MymAnalytics /> : <CreatorReports />;
    case "liens": return m ? <MymTrack /> : <TrackingLinks />;
    case "equipe-messages": return m ? <MymMessages /> : <MessageDashboard />;
    case "equipe-ventes": return m ? <MymTeamSales /> : <EmployeeReports />;
    // Shifts et modération lisent les messages MYM : pas encore de version OnlyFans. Activité et En direct sont communs.
    case "shifts": return m ? <MymShifts /> : null;
    case "activite": return <MymActivity />;
    case "en-direct": return <MymLive />;
    case "moderation": return m ? <MymModeration /> : null;
    case "acces": return m ? <MymAccess /> : <ManageEmployees />;
    case "push": return m ? <MymPush /> : null;
    case "planification": return m ? <MymPlanning /> : null;
    case "feed": return m ? <MymFeed /> : null;
    case "amis": return m ? <MymFriends /> : null;
    case "bons": return m ? <MymVouchers /> : null;
    case "notifications": return m ? <MymNotifs /> : null;
    case "site-mym": return m ? <MymDirect /> : null;
  }
}

export function V2Screen({ screen, label, only, canEdit }: { screen: ScreenKey; label: string; only: Pf | null; canEdit: boolean }) {
  const [pf, setPf] = useState<Pf | null>(null);
  useEffect(() => setPf(getPf()), []);
  if (!pf) return <Wait />;
  const node = pick(screen, pf, canEdit);
  if (!node)
    return (
      <div className="grid h-full min-h-[60vh] place-items-center px-6 text-center">
        <div className="v2-card v2-rise max-w-md p-8">
          <b className="text-[17px]">{label}</b>
          <p className="mt-2 text-[13.5px] text-muted">Cet écran n’existe que sur {only ? PF_LABEL[only] : "l’autre plateforme"}. Change de plateforme en haut du menu pour l’ouvrir.</p>
        </div>
      </div>
    );
  // « v2-frame » garde dans la zone de droite les écrans faits pour le plein écran (position fixe).
  return <div key={`${screen}:${pf}`} className={`v2-frame v2-fade-in ${FULL.includes(screen) ? "v2-full" : ""}`}>{node}</div>;
}
