"use client";

import { useEffect, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import { getPf, PF_LABEL, type Pf } from "@/lib/platform";
import type { ScreenKey } from "./screens";

// Un écran de la v2 = le même nom dans le menu, et derrière le composant de la plateforme choisie. Refaits pour la v2
// (un seul écran pour les deux plateformes) : Messagerie, Scripts, Médias, Fans, Envois groupés, Chiffres, Analytique, Liens de suivi. Les autres sont encore ceux de la version actuelle,
// repeints par les variables de v2.css ; ils seront refaits un par un.
const Wait = () => <div className="grid h-full min-h-[50vh] place-items-center text-[13px] text-muted">Chargement…</div>;
const load = <P extends object>(f: () => Promise<ComponentType<P>>) => dynamic(f, { ssr: false, loading: Wait });

const V2Messaging = load(() => import("./chat/V2Messaging").then((m) => m.V2Messaging));
const V2Scripts = load(() => import("./chat/V2Scripts").then((m) => m.V2Scripts));
const V2Bulk = load(() => import("./bulk/V2Bulk").then((m) => m.V2Bulk));
const V2Fans = load(() => import("./fans/V2Fans").then((m) => m.V2Fans));
const V2Medias = load(() => import("./media/V2Medias").then((m) => m.V2Medias));
const V2Stats = load(() => import("./stats/V2Stats").then((m) => m.V2Stats));
const V2Analytics = load(() => import("./stats/V2Analytics").then((m) => m.V2Analytics));
const V2Links = load(() => import("./stats/V2Links").then((m) => m.V2Links));
const MessageDashboard = load(() => import("@/app/app/analytics/messages/MessageDashboard").then((m) => m.MessageDashboard));
const MymMessages = load(() => import("@/app/app/mym/MymMessages").then((m) => m.MymMessages));
const V2TeamSales = load(() => import("./team/V2TeamSales").then((m) => m.V2TeamSales));
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
// Écrans refaits qui envoient leur plateforme au serveur (voir « ?pf= » plus bas).
const OWN_PF: ScreenKey[] = ["chiffres", "analytique", "liens", "scripts", "medias", "fans", "envois", "equipe-ventes"];

function pick(key: ScreenKey, pf: Pf, canEdit: boolean): React.ReactNode | null {
  const m = pf === "mym";
  switch (key) {
    case "messagerie": return <V2Messaging />;
    case "scripts": return <V2Scripts pf={pf} />;
    case "envois": return <V2Bulk pf={pf} />;
    case "fans": return <V2Fans pf={pf} />;
    case "medias": return <V2Medias pf={pf} />;
    // Refait pour la v2 : le même écran pour les deux plateformes (il demande les chiffres de la plateforme affichée).
    case "chiffres": return <V2Stats pf={pf} />;
    case "analytique": return <V2Analytics pf={pf} />;
    case "liens": return <V2Links pf={pf} />;
    case "equipe-messages": return m ? <MymMessages /> : <MessageDashboard />;
    case "equipe-ventes": return <V2TeamSales pf={pf} />;
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
  // Un écran refait demande lui-même les données de SA plateforme : on peut donc l'ouvrir sur l'autre plateforme sans
  // toucher au menu, avec « ?pf=of » ou « ?pf=mym » dans l'adresse (pour vérifier un écran sans changer le cookie du
  // menu, qui est commun à tous les onglets ouverts). Les anciens écrans suivent toujours le menu.
  useEffect(() => {
    const asked = OWN_PF.includes(screen) ? new URLSearchParams(window.location.search).get("pf") : null;
    setPf(asked === "of" || asked === "mym" ? asked : getPf());
  }, [screen]);
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
