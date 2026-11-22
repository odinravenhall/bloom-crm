"use client";

/** Brouillons par conversation, gardés sur l'appareil (même après fermeture du navigateur), 7 jours. */
const KEY = (id: string) => "crm.draft." + id;
const TTL = 7 * 864e5;

export function getDraft(id: string): string {
  try {
    const raw = localStorage.getItem(KEY(id));
    if (!raw) return sessionStorage.getItem("draft." + id) || ""; // anciens brouillons
    const d = JSON.parse(raw) as { t: string; at: number };
    if (Date.now() - d.at > TTL) {
      localStorage.removeItem(KEY(id));
      return "";
    }
    return d.t || "";
  } catch {
    return "";
  }
}

export function setDraft(id: string, text: string) {
  try {
    if (text.trim()) localStorage.setItem(KEY(id), JSON.stringify({ t: text, at: Date.now() }));
    else localStorage.removeItem(KEY(id));
    sessionStorage.removeItem("draft." + id);
  } catch {}
  window.dispatchEvent(new CustomEvent("crm-drafts"));
}

export const clearDraft = (id: string) => setDraft(id, "");

export function hasDraft(id: string) {
  return !!getDraft(id).trim();
}
