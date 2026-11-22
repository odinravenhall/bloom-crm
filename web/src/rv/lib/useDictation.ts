"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RISING, SEG } from "./voice";

// Dictée avec la reconnaissance vocale du navigateur (Chrome / Edge / Android, en français).
// Sur Chrome, l'audio est transcrit par Google ; rien ne passe par notre serveur.
// En parallèle, on mesure la hauteur de la voix (dans le navigateur) : si elle monte en fin de phrase, c'est une question.

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function ctor(): (new () => Rec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const SILENCE_MS = 2200; // silence après la dernière parole = fin de la dictée

// ---------- Hauteur de la voix (intonation) ----------

/** Fréquence fondamentale d'un bout de son (autocorrélation), ou null si silence / pas de voix claire. */
function pitchOf(buf: Float32Array, rate: number): number | null {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / buf.length) < 0.012) return null;
  const minLag = Math.floor(rate / 450);
  const maxLag = Math.min(Math.floor(rate / 70), buf.length - 1);
  const corr = new Float32Array(maxLag + 2);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0;
    let a = 0;
    let b = 0;
    for (let i = 0; i + lag < buf.length; i++) {
      num += buf[i] * buf[i + lag];
      a += buf[i] * buf[i];
      b += buf[i + lag] * buf[i + lag];
    }
    corr[lag] = num / Math.sqrt(a * b || 1);
    if (corr[lag] > best) best = corr[lag];
  }
  if (best < 0.75) return null;
  // Premier pic presque aussi fort que le meilleur (sinon on lit souvent l'octave du dessous).
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= 0.9 * best && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) return rate / lag;
  }
  return null;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** Suivi de la hauteur de voix pendant la dictée. `rose(depuis)` : la voix est-elle montée à la fin de la phrase ? */
async function pitchTracker() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  const frames: { t: number; f: number | null }[] = [];
  const iv = setInterval(() => {
    an.getFloatTimeDomainData(buf);
    frames.push({ t: performance.now(), f: pitchOf(buf, ctx.sampleRate) });
    if (frames.length > 1500) frames.splice(0, 500);
  }, 40);
  return {
    rose(since: number) {
      const voiced = frames.filter((x) => x.t >= since && x.f !== null).map((x) => x.f as number);
      if (voiced.length < 8) return false;
      const tailN = Math.max(4, Math.round(voiced.length * 0.2));
      const head = voiced.slice(0, voiced.length - tailN);
      const tail = voiced.slice(-tailN);
      const base = median(head);
      const end = median(tail.slice(-Math.ceil(tailN / 2)));
      // Montée nette en fin de phrase (≈ +2 demi-tons) par rapport au reste.
      return base > 0 && end / base > 1.13 && end > median(tail.slice(0, Math.ceil(tailN / 2))) * 0.98;
    },
    close() {
      clearInterval(iv);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}

// ---------- Dictée ----------

/** Une phrase dictée (entre deux pauses) : texte retenu, autres versions entendues, confiance (0 = inconnue), voix montante. */
export type DictSeg = { text: string; alts: string[]; conf: number; rising: boolean };

/** Remet les phrases dans le format attendu par `stylize`. */
export const segsToRaw = (s: DictSeg[]) => s.map((x) => x.text + (x.rising ? RISING : "")).join(SEG);

/**
 * `onText(texte dicté jusqu'ici)` à chaque mot reconnu ; `onDone(texte final)` quand la dictée s'arrête.
 * Le texte contient `SEG` entre les phrases (pauses) et `RISING` quand la voix est montée (question) : à passer à `stylize`.
 */
export function useDictation({ onText, onDone, onError, intonation = true }: { onText: (raw: string) => void; onDone?: (raw: string, segs: DictSeg[]) => void; onError?: (msg: string) => void; intonation?: boolean }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalText = useRef("");
  const segs = useRef<DictSeg[]>([]);
  const lastText = useRef("");
  const pitch = useRef<Awaited<ReturnType<typeof pitchTracker>> | null>(null);
  const segStart = useRef(0);
  const cbs = useRef({ onText, onDone, onError });
  cbs.current = { onText, onDone, onError };

  useEffect(() => setSupported(!!ctor()), []);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const closePitch = () => {
    pitch.current?.close();
    pitch.current = null;
  };

  const stop = useCallback(() => {
    clear();
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const C = ctor();
    if (!C) return cbs.current.onError?.("Dictée non disponible sur ce navigateur (utilise Chrome ou Edge).");
    const prev = rec.current;
    rec.current = null;
    prev?.abort();
    clear();
    closePitch();
    const r = new C();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 4;
    segs.current = [];
    finalText.current = "";
    lastText.current = "";
    segStart.current = performance.now();
    if (intonation && typeof navigator.mediaDevices?.getUserMedia === "function") {
      pitchTracker()
        .then((p) => (rec.current === r ? (pitch.current = p) : p.close()))
        .catch(() => {}); // pas d'intonation : la dictée marche quand même
    }
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const said = res[0].transcript.trim();
        if (res.isFinal) {
          if (!said) continue;
          const q = pitch.current?.rose(segStart.current) ? RISING : "";
          finalText.current += (finalText.current ? SEG : "") + said + q;
          const alts: string[] = [];
          for (let k = 1; k < res.length; k++) {
            const a = res[k]?.transcript?.trim();
            if (a && a.toLowerCase() !== said.toLowerCase() && !alts.some((x) => x.toLowerCase() === a.toLowerCase())) alts.push(a);
          }
          segs.current.push({ text: said, alts, conf: Number(res[0].confidence) || 0, rising: !!q });
          segStart.current = performance.now();
        } else interim += " " + said;
      }
      lastText.current = (finalText.current + (interim.trim() ? (finalText.current ? SEG : "") + interim.trim() : "")).trim();
      cbs.current.onText(lastText.current);
      clear();
      timer.current = setTimeout(() => r.stop(), SILENCE_MS);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      cbs.current.onError?.(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Micro refusé : autorise le micro pour ce site (icône à gauche de l’adresse)."
          : e.error === "network"
            ? "Dictée indisponible (pas de connexion au service de reconnaissance)."
            : `Dictée : ${e.error}`,
      );
    };
    r.onend = () => {
      // Dictée annulée (chat fermé, nouvelle dictée) : on ne fait rien du texte.
      if (rec.current !== r) return;
      clear();
      closePitch();
      setListening(false);
      rec.current = null;
      const t = lastText.current.trim();
      if (t) cbs.current.onDone?.(t, segs.current.slice());
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
      // Rien dit du tout : on coupe au bout de 8 s.
      timer.current = setTimeout(() => r.stop(), 8000);
    } catch (err) {
      closePitch();
      cbs.current.onError?.((err as Error).message);
    }
  }, [intonation]);

  useEffect(
    () => () => {
      clear();
      closePitch();
      const r = rec.current;
      rec.current = null;
      r?.abort();
    },
    [],
  );

  return { supported, listening, start, stop, toggle: () => (listening ? stop() : start()) };
}
