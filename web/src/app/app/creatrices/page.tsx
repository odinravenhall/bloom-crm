"use client";

import Link from "next/link";
import { Heart, Images, Inbox } from "lucide-react";
import { useCreators } from "@/lib/creators";
import { Avatar, Page, PageHeader, Pill, btnCls } from "@/components/ui";

/** Les créatrices reliées à Substy. La fiche modèle (style, limites, prix) viendra ici. */
export default function Creatrices() {
  const { creators, setCreator, loaded } = useCreators();
  return (
    <Page>
      <PageHeader eyebrow="Administration" title="Créatrices" sub="Les créatrices reliées au compte agence Substy." />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {creators.map((c, i) => (
          <section key={c.id} className="card flex flex-col gap-4 rounded-(--radius-card) border bg-card p-5">
            <div className="flex items-center gap-3">
              <Avatar src={c.avatar} name={c.name} size="size-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold">{c.name}</p>
                <p className="truncate text-xs text-muted">
                  {c.username ? "@" + c.username : ""}
                  {c.platform ? ` · ${c.platform}` : ""}
                </p>
              </div>
              {c.ai === false ? <Pill>IA off</Pill> : c.ai ? <Pill tone="accent">IA active</Pill> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["/app/messagerie", "Messagerie", Inbox],
                  ["/app/fans", "Fans", Heart],
                  ["/app/vault", "Vault", Images],
                ] as const
              ).map(([href, label, Icon]) => (
                <Link key={href} href={href} onClick={() => setCreator(c.id)} className={btnCls.secondary}>
                  <Icon className="size-4" /> {label}
                </Link>
              ))}
            </div>
            <p className="text-xs text-muted">Fiche modèle (infos, style, limites, prix) : bientôt.</p>
          </section>
        ))}
        {loaded && !creators.length ? <p className="text-sm text-muted">Aucune créatrice : vérifie la connexion Substy.</p> : null}
      </div>
    </Page>
  );
}
