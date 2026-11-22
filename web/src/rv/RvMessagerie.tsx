"use client";

import { useEffect, useState } from "react";
import { api } from "@/rv/lib/client";
import { Inbox } from "@/rv/inbox/Inbox";
import type { Model } from "@/rv/inbox/types";

type Boot = { me: { id: number; name: string; admin: boolean }; models: Model[]; hasConnection: boolean };

/** La messagerie de Raven CRM, branchée sur Substy (OnlyFans / MYM) par les adresses « /api/rv/… » de Bloom. */
export function RvMessagerie() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Boot>("GET", "/api/boot")
      .then(setBoot)
      .catch((e) => setErr((e as Error).message));
  }, []);
  if (!boot) return <p className="p-8 text-sm text-muted">{err || "Chargement de la messagerie…"}</p>;
  return <Inbox me={boot.me} models={boot.models} hasConnection={boot.hasConnection} />;
}
