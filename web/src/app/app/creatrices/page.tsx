"use client";

import Link from "next/link";
import { useState } from "react";
import { Bot, Images, Inbox, Search } from "lucide-react";
import { PLATFORM, PlatformBadge, platformOf, useCreators, type Platform } from "@/lib/creators";
import { cn } from "@/lib/fmt";
import { Avatar, Page, PageHeader, Pill, inputCls } from "@/components/ui";

/** Les créatrices reliées à Substy, rangées par plateforme (OnlyFans, MYM), avec recherche. */
export default function Creatrices() {
  const { creators, setCreator, loaded } = useCreators();
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const shown = creators.filter((c) => !s || (c.name + " " + (c.username || "")).toLowerCase().includes(s));
  return (
    <Page>
      <PageHeader eyebrow="Administration" title="Créatrices" sub={`${creators.length} créatrices reliées au compte agence Substy.`}>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className={cn(inputCls, "pl-9")} placeholder="Chercher une créatrice…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        {(["of", "mym"] as Platform[]).map((p) => {
          const list = shown.filter((c) => platformOf(c) === p);
          return (
            <section key={p} className="rounded-(--radius-card) border bg-card">
              <h2 className="flex items-center gap-2 border-b px-5 py-3 text-xl">
                {PLATFORM[p]} <span className="text-sm text-muted">{list.length}</span>
              </h2>
              <div className="divide-y divide-line/70">
                {list.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Avatar src={c.avatar} name={c.name} size="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-semibold">
                        <span className="truncate">{c.name}</span> <PlatformBadge c={c} />
                      </p>
                      {c.username ? <p className="truncate text-xs text-muted">@{c.username}</p> : null}
                    </div>
                    {c.ai === false ? <Pill>IA off</Pill> : c.ai ? <Pill tone="accent">IA active</Pill> : null}
                    {(
                      [
                        ["/app/messagerie", "Messagerie", Inbox],
                        ["/app/vault", "Vault", Images],
                        ["/app/ia", "Configuration IA", Bot],
                      ] as const
                    ).map(([href, label, Icon]) => (
                      <Link key={href} href={href} onClick={() => setCreator(c.id)} title={label} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card-2 hover:text-fg">
                        <Icon className="size-4" />
                      </Link>
                    ))}
                  </div>
                ))}
                {!list.length ? <p className="px-5 py-6 text-sm text-muted">{s ? "Aucune créatrice trouvée" : "Aucune créatrice"}</p> : null}
              </div>
            </section>
          );
        })}
      </div>
      {loaded && !creators.length ? <p className="text-sm text-muted">Aucune créatrice : vérifie la connexion Substy.</p> : null}
    </Page>
  );
}
