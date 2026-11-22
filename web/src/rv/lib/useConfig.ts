"use client";

import { useEffect, useState } from "react";
import { DEFAULT_VOICE, parseVoice, type VoiceConfig } from "./voice";

// Config de l'agence pour le chat (emojis rapides, dictée), chargée une seule fois et mise en cache (même pour tous les chats).
type ChatConfig = { emojis: string[]; voice: VoiceConfig };
const EMPTY: ChatConfig = { emojis: [], voice: DEFAULT_VOICE };
let cache: ChatConfig | null = null;
let inflight: Promise<ChatConfig> | null = null;

function useChatConfig() {
  const [cfg, setCfg] = useState<ChatConfig>(cache ?? EMPTY);
  useEffect(() => {
    if (cache) {
      setCfg(cache);
      return;
    }
    inflight ??= fetch("/api/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { emojis?: string[]; voice?: unknown }) => (cache = { emojis: Array.isArray(d.emojis) ? d.emojis : [], voice: parseVoice(d.voice ?? {}) }))
      .catch(() => (cache = EMPTY));
    inflight.then(setCfg).catch(() => {});
  }, []);
  return cfg;
}

export function useQuickEmojis() {
  return useChatConfig().emojis;
}

export function useVoiceConfig() {
  return useChatConfig().voice;
}
