"use client";

import { useEffect, useState } from "react";

/*
 * Protection côté page : pas de clic droit « enregistrer l'image », pas de glisser-déposer,
 * pas d'appui long « enregistrer » sur téléphone, pour toutes les images et vidéos du CRM.
 * (Une capture d'écran reste possible : c'est le rôle du filigrane avec le nom du chatteur.)
 */
/** Mode SFW (par chatteur, mémorisé) : clé localStorage partagée + helpers. */
export const SFW_KEY = "crm.sfw";
export function applySfw(on: boolean) {
  try {
    document.documentElement.dataset.sfw = on ? "1" : "0";
    localStorage.setItem(SFW_KEY, on ? "1" : "0");
  } catch {}
  window.dispatchEvent(new CustomEvent("crm-sfw", { detail: on }));
}

export function MediaGuard({ who, open = false }: { who: string; open?: boolean }) {
  useEffect(() => {
    document.body.dataset.who = who;
    // Protection coupée par un admin (Configuration) : plus de filigrane ni de blocage du clic droit pour lui.
    document.body.dataset.mediaOpen = open ? "1" : "0";
    // Mode SFW au chargement (préférence locale du chatteur).
    try {
      document.documentElement.dataset.sfw = localStorage.getItem(SFW_KEY) === "1" ? "1" : "0";
    } catch {}
    const onSfw = (e: Event) => {
      document.documentElement.dataset.sfw = (e as CustomEvent<boolean>).detail ? "1" : "0";
    };
    const isMedia = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "IMG" || t.tagName === "VIDEO" || t.tagName === "CANVAS" || !!t.closest("[data-protect]"));
    const block = (e: Event) => !open && isMedia(e.target) && e.preventDefault();
    document.addEventListener("contextmenu", block, true);
    document.addEventListener("dragstart", block, true);
    window.addEventListener("crm-sfw", onSfw);
    return () => {
      document.removeEventListener("contextmenu", block, true);
      document.removeEventListener("dragstart", block, true);
      window.removeEventListener("crm-sfw", onSfw);
    };
  }, [who, open]);
  return null;
}

/** Filigrane discret répété sur un média : nom du chatteur + date, pour savoir d'où vient une fuite. */
export function Watermark({ strong = false }: { strong?: boolean }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (document.body.dataset.mediaOpen === "1") return;
    const who = document.body.dataset.who || "Bloom";
    setText(`${who} · ${new Date().toLocaleDateString("fr-FR")} · Bloom CRM`);
  }, []);
  if (!text) return null;
  return (
    <span aria-hidden data-protect className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      <span className={`absolute -inset-1/2 flex rotate-[-24deg] flex-wrap content-center gap-x-10 gap-y-8 text-[11px] font-bold whitespace-nowrap ${strong ? "text-white/30" : "text-white/[0.16]"}`}>
        {Array.from({ length: 60 }, (_, i) => (
          <span key={i}>{text}</span>
        ))}
      </span>
    </span>
  );
}
