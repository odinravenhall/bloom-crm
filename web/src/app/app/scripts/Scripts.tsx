"use client";

import { useState } from "react";
import { useCreators } from "@/lib/creators";
import { useT } from "@/lib/i18n";
import { Avatar } from "@/components/ui";
import { ScriptLibrary } from "./ScriptLibrary";
import { AiScripts } from "./AiScripts";
import { AiAnalytics } from "./AiAnalytics";

// Growth → Scripts, façon Infloww : Tag, Sequence, et en plus les scripts de l'IA de Substy (modifiables) et leurs chiffres.
type Tab = "tag" | "sequence" | "ai" | "stats";
const TABS: [Tab, string][] = [
  ["tag", "Tag"],
  ["sequence", "Sequence"],
  ["ai", "Substy AI"],
  ["stats", "AI scripts analytics"],
];

export function Scripts() {
  const { t } = useT();
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [tab, setTab] = useState<Tab>("tag");
  return (
    <div className="flex min-h-full flex-col" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="flex flex-wrap items-center gap-4 border-b px-5 py-3" style={{ borderColor: "var(--of-line)" }}>
        <h1 className="text-[20px] font-semibold">{t("Scripts")}</h1>
        <span className="flex h-9 items-center gap-2 rounded-md px-3 text-[14px]" style={{ background: "var(--of-card)" }}>
          <Avatar src={creator?.avatar} name={creator?.name} size="size-6" />
          <select value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="bg-transparent outline-none">
            {creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}
          </select>
        </span>
        <span className="flex-1" />
        <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--of-card)" }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="rounded-md px-3.5 py-1.5 text-[14px] font-medium" style={tab === k ? { background: "var(--of-page)" } : { color: "var(--of-muted)" }}>{t(l)}</button>
          ))}
        </div>
      </div>
      {tab === "tag" || tab === "sequence" ? <ScriptLibrary key={tab} kind={tab} t={t} /> : tab === "ai" ? <AiScripts t={t} /> : <AiAnalytics t={t} />}
    </div>
  );
}
