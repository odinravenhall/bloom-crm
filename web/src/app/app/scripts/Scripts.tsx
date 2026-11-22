"use client";

import { useState } from "react";
import { Bot, ListOrdered, Tags } from "lucide-react";
import { cn } from "@/lib/fmt";
import { CreatorTabs, useCreators } from "@/lib/creators";
import { Library } from "./Library";
import { SubstyScripts } from "./SubstyScripts";

type Tab = "tag" | "sequence" | "ai";
const TABS: [Tab, string, typeof Tags][] = [
  ["tag", "Tags", Tags],
  ["sequence", "Séquences", ListOrdered],
  ["ai", "IA Substy", Bot],
];

/** Scripts : la bibliothèque de Bloom (tags et séquences, comme Infloww) et, à part, les scripts de l'IA de Substy. */
export function Scripts() {
  const { creator } = useCreators();
  const [tab, setTab] = useState<Tab>("tag");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-6 pb-3 md:px-8">
        <div>
          <h1 className="text-4xl md:text-5xl">Scripts</h1>
          <p className="mt-1 text-sm text-muted">
            {tab === "tag"
              ? "Des tags (dossiers) de scripts à envoyer quand tu veux."
              : tab === "sequence"
                ? "Des messages qui se suivent : la messagerie sait où en est chaque fan."
                : `Les scripts de l’IA de Substy${creator ? ` pour ${creator.name}` : ""}, en lecture.`}
          </p>
        </div>
        <CreatorTabs />
      </div>
      <div className="flex gap-1 border-b px-4 md:px-8">
        {TABS.map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold", tab === k ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg")}>
            <Icon className="size-4" /> {l}
          </button>
        ))}
      </div>
      {tab === "ai" ? <SubstyScripts /> : <Library key={tab} kind={tab} />}
    </div>
  );
}
