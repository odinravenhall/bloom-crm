"use client";

import { useEffect, useState } from "react";

// Langue de l'interface (Settings → Your Preferences → Language) : English, Español, Français.
// Gardée sur cet ordinateur (« bloom.lang ») ; changer de langue traduit tout de suite, sans recharger.
// Pour l'instant : la partie OnlyFans copiée d'Infloww (barre, dashboard, Settings, OF Manager…). Les textes sont écrits
// en anglais (comme Infloww) et traduits ici en espagnol et en français.
export type Lang = "en" | "es" | "fr";
export const LANGS: [Lang, string][] = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
];
const KEY = "bloom.lang";
const EVENT = "bloom-lang";

export function getLang(): Lang {
  if (typeof window === "undefined") return "fr";
  try {
    const l = localStorage.getItem(KEY);
    return l === "en" || l === "es" || l === "fr" ? l : "fr";
  } catch {
    return "fr";
  }
}
export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {}
  document.documentElement.lang = l;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: l }));
}

const D: Record<string, [es: string, fr: string]> = {
  // barre de gauche
  Dashboard: ["Panel", "Tableau de bord"],
  "OF Manager": ["OF Manager", "OF Manager"],
  Analytics: ["Analítica", "Analytique"],
  "Creator reports": ["Informes de creadoras", "Rapports créatrices"],
  "Employee reports": ["Informes de empleados", "Rapports employés"],
  "Fan reports": ["Informes de fans", "Rapports fans"],
  "Message dashboard": ["Panel de mensajes", "Tableau des messages"],
  "Messages Pro": ["Mensajes Pro", "Messages Pro"],
  Growth: ["Crecimiento", "Croissance"],
  "Smart Messages": ["Mensajes inteligentes", "Messages intelligents"],
  "Smart lists": ["Listas inteligentes", "Listes intelligentes"],
  "Auto-follow": ["Seguimiento automático", "Suivi automatique"],
  "Vault Pro": ["Vault Pro", "Vault Pro"],
  Scripts: ["Guiones", "Scripts"],
  "Profile promotion": ["Promoción del perfil", "Promotion du profil"],
  "Free trial links": ["Enlaces de prueba gratis", "Liens d’essai gratuit"],
  "Tracking links": ["Enlaces de seguimiento", "Liens de suivi"],
  "Sensitive words": ["Palabras sensibles", "Mots sensibles"],
  "AI (Substy)": ["IA (Substy)", "IA (Substy)"],
  "Share for Share": ["Share for Share", "Share for Share"],
  "Discover creators": ["Descubrir creadoras", "Découvrir des créatrices"],
  Requests: ["Solicitudes", "Demandes"],
  "S4S schedule": ["Calendario S4S", "Planning S4S"],
  "S4S settings": ["Ajustes S4S", "Réglages S4S"],
  Creators: ["Creadoras", "Créatrices"],
  "Manage creators": ["Gestionar creadoras", "Gérer les créatrices"],
  Employees: ["Empleados", "Employés"],
  "Manage employees": ["Gestionar empleados", "Gérer les employés"],
  "Shift schedule": ["Turnos", "Planning des shifts"],
  Settings: ["Ajustes", "Paramètres"],
  "Expand menu": ["Ampliar el menú", "Agrandir le menu"],
  "Collapse menu": ["Reducir el menú", "Réduire le menu"],
  "Home · whole agency": ["Inicio · toda la agencia", "Accueil · toute l’agence"],
  "Open in a new tab": ["Abrir en una pestaña nueva", "Ouvrir dans un nouvel onglet"],
  // pages OF Manager
  Home: ["Inicio", "Accueil"],
  "New post": ["Nueva publicación", "Nouvelle publication"],
  Notifications: ["Notificaciones", "Notifications"],
  "Messages Basic": ["Mensajes básicos", "Messages basiques"],
  Vault: ["Vault", "Vault"],
  Queue: ["Cola", "File d’attente"],
  Collections: ["Colecciones", "Collections"],
  Statements: ["Extractos", "Relevés"],
  Statistics: ["Estadísticas", "Statistiques"],
  "My profile": ["Mi perfil", "Mon profil"],
  "OF settings": ["Ajustes de OF", "Réglages OF"],
  "Release forms": ["Formularios de autorización", "Formulaires de cession"],
  Search: ["Buscar", "Rechercher"],
  "All creators": ["Todas las creadoras", "Toutes les créatrices"],
  "No creator": ["Ninguna creadora", "Aucune créatrice"],
  "Reopen the session": ["Reabrir la sesión", "Rouvrir la session"],
  Fullscreen: ["Pantalla completa", "Plein écran"],
  "Reload the page": ["Recargar la página", "Recharger la page"],
  "Authorize this browser again": ["Autorizar este navegador otra vez", "Autoriser à nouveau ce navigateur"],
  "Opening the account…": ["Abriendo la cuenta…", "Ouverture du compte…"],
  "Open {name}’s account": ["Abrir la cuenta de {name}", "Ouvrir le compte de {name}"],
  "Open the account": ["Abrir la cuenta", "Ouvrir le compte"],
  "A small Substy window opens for a few seconds to authorize this browser (you must be logged in to Substy). Needed at most every 4 hours.": [
    "Se abre una pequeña ventana de Substy unos segundos para autorizar este navegador (hay que estar conectado a Substy). Como mucho cada 4 horas.",
    "Une petite fenêtre Substy s’ouvre quelques secondes pour autoriser ce navigateur (il faut être connecté à Substy). À refaire au plus toutes les 4 heures.",
  ],
  // plateformes
  "Change platform": ["Cambiar de plataforma", "Changer de plateforme"],
  "{n} creators": ["{n} creadoras", "{n} modèles"],
  "{n} creator": ["{n} creadora", "{n} modèle"],
  Soon: ["Pronto", "Bientôt"],
  "This page is coming in a next step.": ["Esta página llega en una próxima etapa.", "Cette page arrive dans une prochaine étape."],
  // dashboard
  "Creator earnings overview": ["Resumen de ganancias de las creadoras", "Aperçu des gains des créatrices"],
  "Net earnings": ["Ganancias netas", "Gains nets"],
  "Gross earnings": ["Ganancias brutas", "Gains bruts"],
  Yesterday: ["Ayer", "Hier"],
  Today: ["Hoy", "Aujourd’hui"],
  "This week": ["Esta semana", "Cette semaine"],
  "This month": ["Este mes", "Ce mois"],
  "Total earnings": ["Ganancias totales", "Gains totaux"],
  Subscriptions: ["Suscripciones", "Abonnements"],
  Posts: ["Publicaciones", "Publications"],
  Messages: ["Mensajes", "Messages"],
  Tips: ["Propinas", "Pourboires"],
  Referrals: ["Referidos", "Parrainages"],
  Streams: ["Directos", "Lives"],
  "My shifts": ["Mis turnos", "Mes shifts"],
  "Employee sales": ["Ventas de empleados", "Ventes des employés"],
  "Scheduled hours": ["Horas programadas", "Heures planifiées"],
  "No data": ["Sin datos", "Aucune donnée"],
  "incl. {v} provisional (Substy sales not confirmed yet)": ["incl. {v} provisional (ventas de Substy aún no confirmadas)", "dont {v} provisoire (ventes Substy pas encore confirmées)"],
  "Not linked to Infloww yet (not counted): {v}.": ["Aún no vinculadas a Infloww (no contadas): {v}.", "Pas encore reliées à Infloww (non comptées) : {v}."],
  // settings
  "Your Account": ["Tu cuenta", "Ton compte"],
  "Your account": ["Tu cuenta", "Ton compte"],
  "Your Preferences": ["Tus preferencias", "Tes préférences"],
  "Your preferences": ["Tus preferencias", "Tes préférences"],
  "About Bloom": ["Acerca de Bloom", "À propos de Bloom"],
  "Personal info": ["Información personal", "Informations personnelles"],
  Picture: ["Foto", "Photo"],
  Name: ["Nombre", "Nom"],
  Email: ["Correo", "Email"],
  "Name and picture come from your Discord account.": ["El nombre y la foto vienen de tu cuenta de Discord.", "Nom et photo viennent de ton compte Discord."],
  "Log out": ["Cerrar sesión", "Se déconnecter"],
  "Time zone settings": ["Zona horaria", "Fuseau horaire"],
  "Language Settings": ["Idioma", "Langue"],
  "Display settings": ["Pantalla", "Affichage"],
  "Advanced options": ["Opciones avanzadas", "Options avancées"],
  "Regular time zone": ["Zona horaria habitual", "Fuseau horaire habituel"],
  "Agency’s time zone for creator reports, fan reports, tracking links and free trial links": [
    "Zona horaria de la agencia para informes de creadoras, de fans, enlaces de seguimiento y de prueba gratis",
    "Fuseau de l’agence pour les rapports créatrices, rapports fans, liens de suivi et liens d’essai gratuit",
  ],
  "Start weekly reports on": ["Empezar los informes semanales el", "Début des rapports hebdomadaires"],
  Sunday: ["Domingo", "Dimanche"],
  Monday: ["Lunes", "Lundi"],
  Language: ["Idioma", "Langue"],
  Display: ["Pantalla", "Affichage"],
  "Light mode": ["Modo claro", "Mode clair"],
  "Dark mode": ["Modo oscuro", "Mode sombre"],
  "Hardware acceleration": ["Aceleración por hardware", "Accélération matérielle"],
  "Uses your GPU to improve performance (animations, blur, shadows). Disable this feature if Bloom is slow or unstable on this computer.": [
    "Usa tu GPU para mejorar el rendimiento (animaciones, desenfoques, sombras). Desactívala si Bloom va lento o es inestable en este ordenador.",
    "Utilise la carte graphique pour de meilleures performances (animations, flous, ombres). Désactive-la si Bloom est lent ou instable sur cet ordinateur.",
  ],
  "For now the OnlyFans part is translated; the other pages are being translated.": [
    "Por ahora está traducida la parte de OnlyFans; las demás páginas se están traduciendo.",
    "Pour l’instant la partie OnlyFans est traduite ; les autres pages arrivent.",
  ],
  "Bloom CRM — the agency’s chatting CRM, connected to Substy (OnlyFans and MYM), Infloww and MyPulse.": [
    "Bloom CRM — el CRM de chatting de la agencia, conectado a Substy (OnlyFans y MYM), Infloww y MyPulse.",
    "Bloom CRM — le CRM de chatting de l’agence, branché sur Substy (OnlyFans et MYM), Infloww et MyPulse.",
  ],
};

/** Traduction d'un texte (anglais = texte d'origine). « {x} » est remplacé par vars.x. */
export function translate(lang: Lang, s: string, vars?: Record<string, string | number>) {
  const row = D[s];
  let out = lang === "en" || !row ? s : row[lang === "es" ? 0 : 1];
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** Langue courante + fonction de traduction ; se met à jour quand on change de langue (ici ou dans un autre onglet). */
export function useT() {
  const [lang, setL] = useState<Lang>("fr");
  useEffect(() => {
    setL(getLang());
    const on = () => setL(getLang());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return { lang, t: (s: string, vars?: Record<string, string | number>) => translate(lang, s, vars) };
}
