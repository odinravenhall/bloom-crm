"use client";

import { useState } from "react";

/** Lecteur des vidéos (Substy les sert en fichier vidéo classique, relayé par /media). */
export function VideoPlayer({ src, poster, className }: { src: string; poster?: string; className?: string }) {
  const [err, setErr] = useState(false);
  return (
    <div className="relative flex items-center justify-center">
      <video src={src} poster={poster} controls controlsList="nodownload" autoPlay playsInline preload="auto" className={className} onError={() => setErr(true)} />
      {err ? <p className="absolute inset-x-0 bottom-12 text-center text-xs text-rose-300">Lecture impossible (vidéo indisponible).</p> : null}
    </div>
  );
}
