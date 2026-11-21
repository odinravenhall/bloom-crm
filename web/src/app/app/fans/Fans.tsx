"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn, usd, when } from "@/lib/fmt";
import { CreatorTabs, useCreators } from "@/lib/creators";
import type { Chat } from "@/lib/types";
import { Avatar, Card, Page, PageHeader, Pill, Segmented, Table, inputCls, tdCls, thCls } from "@/components/ui";

type Filter = "all" | "unread" | "handoff" | "ai_on" | "ai_off";
type Sort = "recent" | "spent" | "unread";

/** Tous les fans de la créatrice choisie : recherche, filtres, tri par dépense. */
export function Fans() {
  const { creatorId } = useCreators();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Chat[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState("loading");

  const load = async (reset: boolean) => {
    if (!creatorId) return;
    const p = new URLSearchParams({ creatorId, q });
    if (filter === "unread") p.set("unread", "1");
    if (filter === "handoff") p.set("handoff", "1");
    if (filter === "ai_on") p.set("ai", "enabled");
    if (filter === "ai_off") p.set("ai", "disabled");
    if (!reset && cursor) p.set("cursor", cursor);
    if (reset) setState("loading");
    try {
      const r = await api<{ items: Chat[]; nextCursor: string | null }>("GET", "/api/chats?" + p);
      setItems((old) => (reset ? r.items : old.concat(r.items.filter((x) => !old.some((y) => y.fanId === x.fanId)))));
      setCursor(r.nextCursor);
      setState("ok");
    } catch (e) {
      setState((e as Error).message);
    }
  };
  useEffect(() => {
    const t = setTimeout(() => load(true), q ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, filter, q]);

  const list = [...items];
  if (sort === "spent") list.sort((a, b) => (b.spent || 0) - (a.spent || 0));
  if (sort === "unread") list.sort((a, b) => (b.unread || 0) - (a.unread || 0));

  return (
    <Page>
      <PageHeader eyebrow="Chatting" title="Fans" sub="Les fans de la créatrice, avec ce qu’ils ont dépensé. Clique sur un fan pour ouvrir la conversation.">
        <CreatorTabs />
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className={cn(inputCls, "pl-9")} placeholder="Rechercher un fan…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            ["all", "Tous"],
            ["unread", "Non lus"],
            ["handoff", "À reprendre"],
            ["ai_on", "IA active"],
            ["ai_off", "IA coupée"],
          ]}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-10 rounded-xl border border-input bg-card-2/60 px-3 text-sm outline-none focus:border-primary">
          <option value="recent">Les plus récents</option>
          <option value="spent">Les plus gros dépensiers</option>
          <option value="unread">Non lus d’abord</option>
        </select>
      </div>
      <Card>
        <Table
          head={
            <>
              <th className={thCls}>Fan</th>
              <th className={thCls}>Abonnement</th>
              <th className={cn(thCls, "text-right")}>Dépensé</th>
              <th className={thCls}>IA</th>
              <th className={thCls}>Dernier message</th>
            </>
          }
        >
          {list.map((c) => (
            <tr key={c.fanId} className="hover:bg-white/[0.03]">
              <td className={tdCls}>
                <Link href={`/app/messagerie?c=${encodeURIComponent(creatorId || "")}&fan=${encodeURIComponent(c.fanId)}`} className="flex items-center gap-2.5">
                  <Avatar src={c.avatar} name={c.name} size="size-8" />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold">
                      {c.name}
                      {c.unread ? <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] leading-5 font-bold text-white">{c.unread}</span> : null}
                    </span>
                    <span className="block text-xs text-muted">{c.username ? "@" + c.username : ""}</span>
                  </span>
                </Link>
              </td>
              <td className={tdCls}>{!c.subscribed ? <span className="text-muted">—</span> : /active|subscribed/i.test(c.subscribed) ? <Pill tone="good">abonné</Pill> : <Pill>{c.subscribed}</Pill>}</td>
              <td className={cn(tdCls, "text-right font-bold")}>{usd(c.spent)}</td>
              <td className={tdCls}>
                <span className="flex gap-1">
                  {c.ai ? <Pill tone="accent">IA</Pill> : <Pill>IA off</Pill>}
                  {c.handoff ? <Pill tone="warn">à reprendre</Pill> : null}
                </span>
              </td>
              <td className={cn(tdCls, "max-w-[360px] truncate text-muted")}>
                {c.last ? (c.last.fromCreator ? "Toi : " : "") + (c.last.text || (c.last.media ? "📷 Média" : "")) : ""} <span className="text-xs">{when(c.last?.at)}</span>
              </td>
            </tr>
          ))}
        </Table>
        {state === "loading" ? <p className="py-6 text-center text-sm text-muted">Chargement…</p> : null}
        {state !== "loading" && state !== "ok" ? <p className="py-6 text-center text-sm font-semibold text-rose-300">{state}</p> : null}
        {state === "ok" && !items.length ? <p className="py-6 text-center text-sm text-muted">Aucun fan</p> : null}
        {cursor ? (
          <button onClick={() => load(false)} className="mx-auto mt-4 block rounded-lg bg-card-2 px-3 py-1.5 text-xs font-semibold text-muted hover:text-fg">
            Charger plus
          </button>
        ) : null}
      </Card>
    </Page>
  );
}
