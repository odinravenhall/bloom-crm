"use client";

import { CreatorTabs, useCreators } from "@/lib/creators";
import { Page, PageHeader } from "@/components/ui";
import { VaultBrowser } from "../messagerie/VaultPicker";

/** Le vault de la créatrice (listes et médias), en grand. */
export function VaultPage() {
  const { creatorId } = useCreators();
  return (
    <Page>
      <PageHeader eyebrow="Chatting" title="Vault" sub="Les médias de la créatrice, rangés par liste. Clique sur un média pour l’ouvrir en grand.">
        <CreatorTabs />
      </PageHeader>
      <div className="card rise flex h-[calc(100dvh-210px)] min-h-[420px] overflow-hidden rounded-(--radius-card) border bg-card/80 backdrop-blur">
        {creatorId ? <VaultBrowser creatorId={creatorId} onOpen={(m) => (m.full || m.thumb) && window.open(m.full || m.thumb || "", "_blank", "noreferrer")} /> : <p className="m-auto text-sm text-muted">Chargement…</p>}
      </div>
    </Page>
  );
}
