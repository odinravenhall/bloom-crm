"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Crown, Lock, Pencil, Pin, KeyRound, Eye, EyeOff, SlidersHorizontal, Inbox as InboxIcon, MessageCircle, BellRing, Sparkles, Check, X, Hand } from "lucide-react";
import { MiniCard } from "@/rv/components/ScoreCard";
import { newSubDay } from "@/rv/components/NewSub";
import { FanAvatar } from "@/rv/components/FanAvatar";
import { pollMs } from "@/rv/lib/perf";
import { debounce, onLive } from "@/rv/lib/liveClient";
import { hasDraft } from "@/rv/lib/draft";
import { useNow } from "@/rv/lib/useNow";
import { defaultBoxName } from "@/rv/lib/box";
import { toast } from "@/rv/lib/client";
import { api } from "@/rv/lib/client";
import { ago, cn, dur, durSec, money, clock, waitTone, curOf, setCurrentModel, setModelCurrencies } from "@/rv/lib/fmt";
import { Avatar, Pill } from "@/rv/components/ui";
import { Toaster } from "@/rv/components/Toaster";
import { PlatformLogo } from "@/components/PlatformLogo";
import type { BoxInfo, Conv, Model, QueueResp } from "./types";
import { Chat } from "./Chat";
import { FanPanel } from "./FanPanel";
import { NotifHistory } from "./NotifHistory";

type Me = { id: number; name: string; admin: boolean };

// Barre rapide : icônes seules, compteur en pastille. Épinglés seulement s'il y en a ; « Priorité » remplacée par
// le filtre « Payants uniquement » + le tri « plus gros payeurs » (menu des filtres).
const TABS = [
  { k: "all", label: "Tous les fans" },
  { k: "pinned", label: "Épinglés (pastille : épinglés à qui répondre)" },
  { k: "handoff", label: "À reprendre : fans sans IA (coupée, ou passés à la main par l’IA) qui attendent une réponse" },
  { k: "relance", label: "Relances : PPV payant envoyé, pas débloqué, et le fan n’a rien dit depuis 5 min (moins de 24 h)" },
  { k: "reply", label: "À répondre" },
] as const;

function useStored<T>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    try {
      const s = localStorage.getItem("crm." + key);
      if (s !== null) setV(JSON.parse(s));
    } catch {}
  }, [key]);
  const set = useCallback(
    (x: T) => {
      setV(x);
      try {
        localStorage.setItem("crm." + key, JSON.stringify(x));
      } catch {}
    },
    [key],
  );
  return [v, set] as const;
}

/** Re-rendu toutes les `ms` pour faire avancer les compteurs d'attente. */
function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function Inbox({ me, models, hasConnection }: { me: Me; models: Model[]; hasConnection: boolean }) {
  const [model, setModel] = useStored<string>("model", "");
  // Modèles masquées (enregistrées sur le compte) : hors du rail et de « Tous ». Clic droit / appui long pour gérer.
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [tab, setTab] = useStored<string>("tab", "reply");
  // « Priorité » n'existe plus dans la barre : ceux qui l'avaient ouverte retombent sur « À répondre ».
  useEffect(() => {
    if (tab === "vip" || tab === "online" || tab === "new") setTab("reply");
  }, [tab, setTab]);
  const [sort, setSort] = useStored<string>("sort", "oldest");
  const [win, setWin] = useStored<number>("win", 72);
  const [q, setQ] = useState("");
  const [paying, setPaying] = useStored<boolean>("paying", false);
  const [online, setOnline] = useStored<boolean>("online", false);
  const [data, setData] = useState<QueueResp | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [autoNext, setAutoNext] = useStored<boolean>("autoNext", false);
  const [panelOpen, setPanelOpen] = useStored<boolean>("fanPanel2", true);
  const [sheet, setSheet] = useState(false);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => setSheet(false), [currentId]);
  // Multi-chat : conversations gardées en onglets
  const [tabs, setTabs] = useStored<string[]>("tabs", []);
  const [tabInfo, setTabInfo] = useState<Record<string, Conv>>({});
  const toggleTab = useCallback((id: string) => setTabs(tabs.includes(id) ? tabs.filter((x) => x !== id) : [...tabs, id].slice(-10)), [tabs, setTabs]);
  useEffect(() => {
    if (!tabs.length) return;
    const refresh = () =>
      Promise.all(tabs.map((id) => api<{ conversation: Conv }>("GET", `/api/conversations/${id}`).then((d) => [id, d.conversation] as const).catch(() => null))).then((r) =>
        setTabInfo(Object.fromEntries(r.filter(Boolean) as [string, Conv][])),
      );
    refresh();
    // Temps réel : un onglet se met à jour quand SA conversation change
    const later = debounce(refresh, 500);
    const off = onLive("conv", (d) => !!d.id && tabs.includes(d.id) && later());
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), pollMs(30_000));
    return () => {
      off();
      clearInterval(t);
    };
  }, [tabs]);
  const modelsById = useMemo(() => Object.fromEntries(models.map((m) => [m.id, m])), [models]);
  setModelCurrencies(models);
  const seq = useRef(0);
  useTick(15_000);

  const load = useCallback(async () => {
    const s = ++seq.current;
    const p = new URLSearchParams({ tab: tab === "unread" ? "reply" : tab, sort, window: String(win) });
    if (model) p.set("model", model);
    if (q.trim()) p.set("q", q.trim());
    if (paying) p.set("paying", "1");
    if (online) p.set("online", "1");
    try {
      const r = await api<QueueResp>("GET", "/api/inbox?" + p);
      if (s === seq.current) setData(r);
    } catch {}
  }, [tab, sort, win, model, q, paying, online]);

  useEffect(() => {
    load();
    // Temps réel : la file se recharge dès qu'une conversation change (nouveau message, réponse d'un collègue…)
    const later = debounce(load, 400);
    const offConv = onLive("conv", () => later());
    const offOpen = onLive("open", () => later());
    // Filet de sécurité si la connexion temps réel tombe (rare)
    const t = setInterval(() => document.visibilityState === "visible" && load(), pollMs(20_000));
    return () => {
      offConv();
      offOpen();
      clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    const n = data?.allReply ?? 0;
    document.title = (n ? `(${n}) ` : "") + "Messagerie · Bloom CRM";
    // Le badge « Messagerie » du menu affiche le même total que la messagerie.
    if (data) window.dispatchEvent(new CustomEvent("crm-reply-count", { detail: n }));
  }, [data]);

  const items = data?.items ?? [];
  const fromList = items.find((c) => c.id === currentId) ?? null;
  const [pinned, setPinned] = useState<Conv | null>(null); // garde la conversation ouverte même si elle sort de la file
  useEffect(() => {
    if (fromList) setPinned(fromList);
  }, [fromList]);
  const current = fromList ?? (pinned?.id === currentId ? pinned : null);
  // Montants de la conversation ouverte dans la devise de sa créatrice ($ OnlyFans, € MYM).
  setCurrentModel(current?.modelId);

  const open = useCallback(
    (c: Conv) => {
      if (currentId && currentId !== c.id) api("POST", `/api/conversations/${currentId}/action`, { action: "unlock" }).catch(() => {});
      // ouvert par l'équipe : le texte repasse en gris tout de suite
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === c.id ? { ...x, fresh: false } : x)) } : d));
      setPinned(c);
      setCurrentId(c.id);
    },
    [currentId],
  );

  // Glisser / bouton : non lu (gardé par le CRM dans « À répondre ») <-> lu (aussi sur Reveal).
  const toggleUnread = useCallback(
    async (c: Conv) => {
      const toUnread = !c.fresh;
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === c.id ? { ...x, unread: toUnread, fresh: toUnread, needsReply: toUnread || x.needsReply } : x)) } : d));
      try {
        await api("POST", `/api/conversations/${c.id}/action`, { action: toUnread ? "unread" : "read" });
        toast(toUnread ? "Remis en non lu" : "Marqué comme lu");
      } catch (e) {
        toast((e as Error).message, "err");
      }
      load();
    },
    [load],
  );

  // Épingler pour toute l'équipe (aussi sur Reveal)
  const togglePin = useCallback(
    async (c: Conv) => {
      setPinned((p) => (p && p.id === c.id ? { ...p, pinned: !c.pinned } : p));
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === c.id ? { ...x, pinned: !c.pinned } : x)) } : d));
      try {
        const r = await api<{ pinned: boolean }>("POST", `/api/conversations/${c.id}/action`, { action: "pin", pin: !c.pinned });
        toast(r.pinned ? "Épinglé pour toute l’équipe" : "Désépinglé");
      } catch (e) {
        toast((e as Error).message, "err");
      }
      load();
    },
    [load],
  );

  // Lien direct vers une conversation : /app/inbox?c=<id> (depuis « Messages envoyés », une fiche modèle…)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    // Lien de l'Accueil : ?model=…&tab=reply|handoff (passe avant les préférences gardées sur l'ordinateur).
    const lt = sp.get("tab");
    if (lt === "reply" || lt === "handoff" || lt === "all") {
      try {
        localStorage.setItem("crm.tab", JSON.stringify(lt));
        localStorage.setItem("crm.model", JSON.stringify(sp.get("model") || ""));
      } catch {}
      setTab(lt);
      setModel(sp.get("model") || "");
    }
    const id = sp.get("c");
    if (!id) return;
    api<{ conversation: Conv }>("GET", `/api/conversations/${encodeURIComponent(id)}`)
      .then((d) => {
        setPinned(d.conversation);
        setCurrentId(d.conversation.id);
        if (!d.conversation.needsReply) setTab("all");
        if (model && model !== d.conversation.modelId) setModel("");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = useCallback(
    (fromId?: string | null) => {
      const from = fromId ?? currentId;
      const ok = items.filter((c) => c.id !== from && c.needsReply && !(c.lock && c.lock.userId !== me.id));
      if (!ok.length) return false;
      const idx = items.findIndex((c) => c.id === from);
      const next = items.slice(idx + 1).find((c) => ok.includes(c)) ?? ok[0];
      open(next);
      return true;
    },
    [items, currentId, me.id, open],
  );

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
        return;
      }
      // Tab : fan suivant qui attend une réponse (depuis la zone de message ou la page ; pas dans les autres champs).
      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const el = document.activeElement as HTMLElement | null;
        const field = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.hasAttribute("data-chat-input");
        if (field || el?.closest("[role=dialog]")) return;
        e.preventDefault();
        if (!goNext()) toast("Aucun autre fan n’attend de réponse");
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [goNext]);

  const counts = data?.counts ?? {};
  const hidden = useMemo(() => new Set(data?.hidden ?? []), [data?.hidden]);
  const visibleModels = useMemo(() => models.filter((m) => !hidden.has(m.id)), [models, hidden]);
  const setHidden = async (ids: string[]) => {
    try {
      await api("PUT", "/api/me", { hiddenModels: ids });
      if (model && ids.includes(model)) setModel("");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const totals = data?.totals ?? { reply: 0, unread: 0, all: 0 };

  return (
    <div className="flex h-full min-h-0">
      <Toaster />
      {/* Rail des modèles */}
      <div className="scroll-thin hidden w-[64px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r bg-panel py-3 backdrop-blur sm:flex 2xl:w-[76px]">
        <RailButton on={!model} onClick={() => setModel("")} onMenu={(x, y) => setMenu({ x, y, id: "" })} label="Tous les modèles · clic droit (ou appui long) : masquer / réafficher des modèles" count={data?.allReply ?? 0}>
          <span className="grid size-11 place-items-center rounded-2xl bg-card-2 text-xs font-extrabold">Tous</span>
        </RailButton>
        <div className="my-1 h-px w-8 bg-line" />
        {visibleModels.map((m) => (
          <RailButton key={m.id} on={model === m.id} onClick={() => setModel(m.id)} onMenu={(x, y) => setMenu({ x, y, id: m.id })} label={m.displayName + (/mym/i.test(m.platform || "") ? " · MYM" : " · OnlyFans") + " · clic droit (ou appui long) : masquer"} count={counts[m.id] || 0}>
            <span className="relative">
              <Avatar src={m.avatar} name={m.displayName} size="size-11" rounded="rounded-2xl" />
              {/* Bloom : OnlyFans ou MYM (deux comptes peuvent avoir le même prénom). */}
              <span className="absolute -right-1 -bottom-1 rounded-[5px] ring-2 ring-bg">
                <PlatformLogo platform={m.platform} className="size-[15px] rounded-[4px]" />
              </span>
            </span>
          </RailButton>
        ))}
      </div>

      {/* File */}
      <section className={cn("flex min-h-0 w-full shrink-0 flex-col border-r bg-panel backdrop-blur md:w-[300px] xl:w-[320px] 2xl:w-[350px]", current && "hidden md:flex")}>
        <div className="flex flex-col gap-3 border-b p-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg leading-tight">{model ? modelsById[model]?.displayName : "Messagerie"}</h1>
              <p className="text-xs text-muted">
                {totals.reply} fan{totals.reply > 1 ? "s" : ""} à répondre (non lus compris)
                {data?.boxes?.config.enabled && data.boxes.mine.length && data.boxes.mine.length < data.boxes.config.count
                  ? ` · ${data.boxes.mine.map((b) => data.boxes!.config.names[b - 1] || defaultBoxName(b)).join(", ")}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NotifHistory
                model={model}
                models={models}
                onOpen={(id) =>
                  api<{ conversation: Conv }>("GET", `/api/conversations/${id}`)
                    .then((d) => open(d.conversation))
                    .catch((e) => toast((e as Error).message, "err"))
                }
              />
              {data?.boxes ? <BoxMenu info={data.boxes} admin={me.admin} onChanged={load} /> : null}
            </div>
          </div>
          {/* Téléphone : les modèles en bandeau (le rail de gauche est masqué) */}
          <div className="scroll-thin -mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5 sm:hidden">
            {[{ id: "", displayName: "Tous", avatar: null as string | null }, ...models].map((m) => {
              const on = model === m.id;
              const n = m.id ? counts[m.id] || 0 : (data?.allReply ?? 0);
              if (m.id && hidden.has(m.id)) return null;
              return (
                <button key={m.id || "all"} onClick={() => setModel(m.id)} className={cn("relative flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-xs font-semibold", on ? "border-primary bg-primary/15 text-fg" : "bg-card-2/60 text-muted")}>
                  {m.id ? <Avatar src={m.avatar} name={m.displayName} size="size-6" /> : <span className="grid size-6 place-items-center rounded-full bg-card-2 text-[9px] font-extrabold">ALL</span>}
                  {m.displayName} {"platform" in m ? <PlatformLogo platform={m.platform} className="size-3.5 rounded-[3px]" /> : null}
                  {n ? <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-white tabular-nums">{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1 rounded-xl border bg-card-2/60 p-1">
            {TABS.filter((t) => t.k !== "pinned" || (totals.pinned ?? 0) > 0 || tab === "pinned").map((t) => {
              const n =
                t.k === "reply" ? totals.reply : t.k === "handoff" ? totals.handoff ?? 0 : t.k === "relance" ? totals.relances ?? 0 : t.k === "pinned" ? totals.pinnedReply ?? 0 : 0;
              const on = tab === t.k || (t.k === "reply" && tab === "unread");
              return (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  title={t.label}
                  aria-label={t.label}
                  className={cn(
                    "relative flex h-8 flex-1 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                    on ? "bg-primary text-white" : "text-muted hover:bg-white/[0.05] hover:text-fg",
                  )}
                >
                  {t.k === "all" ? "Tous" : null}
                  {t.k === "pinned" ? <Pin className="size-4" /> : null}
                  {t.k === "handoff" ? <Hand className="size-4" /> : null}
                  {t.k === "relance" ? <BellRing className="size-4" /> : null}
                  {t.k === "reply" ? <MessageCircle className="size-4" /> : null}
                  {/* Même pastille partout (couleur du thème), comme sur les photos des modèles */}
                  {n ? (
                    <span className="absolute -top-1.5 -right-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] leading-5 font-bold text-white ring-2 ring-bg tabular-nums">{n > 99 ? "99+" : n}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un fan, un tag…" className="h-9 w-full rounded-xl border border-input bg-card-2/60 pr-3 pl-9 text-sm outline-none focus:border-primary" />
          </div>
          <div className="flex gap-2">
            <FilterMenu sort={sort} setSort={setSort} paying={paying} setPaying={setPaying} online={online} setOnline={setOnline} reply={tab === "reply"} />
            {tab === "reply" ? (
              <select value={win} onChange={(e) => setWin(Number(e.target.value))} className="h-8 rounded-lg border bg-card-2 px-2 text-xs" title="Ancienneté max">
                <option value={6}>6 h</option>
                <option value={24}>24 h</option>
                <option value={72}>3 j</option>
                <option value={168}>7 j</option>
                <option value={0}>Tout</option>
              </select>
            ) : null}
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {!hasConnection ? (
            <div className="m-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              <p className="flex items-center gap-2 font-semibold">
                <KeyRound className="size-4" /> Aucun compte Reveal relié
              </p>
              <p className="mt-1 text-amber-200/80">{me.admin ? <>Relie un compte dans <Link href="/app/comptes" className="underline">Comptes Reveal</Link> pour charger les conversations.</> : "Demande à un admin de relier les comptes Reveal."}</p>
            </div>
          ) : null}
          {data && !items.length ? <p className="p-10 text-center text-sm text-muted">{tab === "reply" ? "Personne n’attend de réponse 🎉" : tab === "relance" ? "Aucun fan à relancer pour l’instant 👌" : "Aucune conversation"}</p> : null}
          {!data ? <p className="p-10 text-center text-sm text-muted">Chargement…</p> : null}
          {items.map((c) => (
            <QueueItem
              key={c.id}
              c={c}
              on={c.id === currentId}
              model={!model && models.length > 1 ? modelsById[c.modelId] : undefined}
              meId={me.id}
              onClick={() => open(c)}
              onToggleUnread={() => toggleUnread(c)}
              boxLabel={c.box ? (data?.boxes?.modelId === c.modelId && data.boxes.config.names[c.box - 1]) || defaultBoxName(c.box) : null}
              relance={c.relance}
            />
          ))}
        </div>
      </section>

      {/* Conversation */}
      <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col", !current && "hidden md:flex")}>
        {/* Multi-chat : onglets des fans gardés sous la main, pastille quand le fan a écrit */}
        {tabs.length ? (
          <div className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b bg-panel-strong px-2 py-1.5 backdrop-blur">
            {tabs.map((id) => {
              const t = tabInfo[id];
              const on = id === currentId;
              return (
                <div key={id} className={cn("group flex shrink-0 items-center gap-2 rounded-xl py-1 pr-1 pl-1.5 text-sm transition-colors", on ? "bg-card-2" : "hover:bg-white/[0.04]")}>
                  <button onClick={() => t && open(t)} className="flex items-center gap-2" disabled={!t}>
                    <span className="relative">
                      <Avatar src={t?.memberAvatar} name={t?.nickname || t?.memberName || "?"} size="size-7" />
                      {t?.fresh && !on ? <span className="pulse-dot absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-bg bg-primary" /> : null}
                    </span>
                    <span className={cn("max-w-28 truncate", t?.fresh && !on ? "font-bold text-fg" : on ? "font-semibold" : "text-muted")}>{t?.nickname || t?.memberName || "…"}</span>
                  </button>
                  <button onClick={() => toggleTab(id)} className="grid size-5 place-items-center rounded-md text-muted opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-fg" title="Fermer l’onglet">
                    <X className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        {current ? (
          <Chat
            key={current.id}
            conv={current}
            me={me}
            model={modelsById[current.modelId]}
            autoNext={autoNext}
            setAutoNext={setAutoNext}
            onBack={() => setCurrentId(null)}
            onSent={(o) => {
              load();
              if (autoNext && tab === "reply" && !o?.inSequence && !goNext(current.id)) setCurrentId(null);
            }}
            onNext={() => goNext()}
            actions={{
              pinned: current.pinned,
              onPin: () => togglePin(current),
              inTabs: tabs.includes(current.id),
              onTab: () => toggleTab(current.id),
              fresh: current.fresh,
              onReadToggle: () => toggleUnread(current),
              panelOpen: wide ? panelOpen : sheet,
              // Grand écran : colonne à droite ; téléphone / tablette : feuille par-dessus le chat.
              onPanel: () => (wide ? setPanelOpen(!panelOpen) : setSheet(!sheet)),
            }}
          />
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div className="rise max-w-sm">
              <div className="mx-auto grid size-16 place-items-center rounded-2xl border bg-card/80 text-primary-soft shadow-[0_20px_50px_-25px_var(--color-primary)]">
                <MessageCircle className="size-7" />
              </div>
              <h2 className="mt-4 text-xl">Choisis un fan</h2>
              <p className="mt-1 text-sm text-muted">Le fan qui attend depuis le plus longtemps est en haut de la file. Alt + ↓ pour passer au suivant.</p>
            </div>
          </div>
        )}
      </section>

      {/* Fiche fan */}
      {current && panelOpen ? (
        <aside className="scroll-thin hidden w-[270px] shrink-0 overflow-y-auto border-l bg-panel backdrop-blur lg:block 2xl:w-[330px]">
          <FanPanel key={current.id} conv={current} model={modelsById[current.modelId]} onChanged={load} admin={me.admin} onErased={() => { setCurrentId(null); setSheet(false); load(); }} />
        </aside>
      ) : null}
      {menu ? (
        <ModelMenu
          x={menu.x}
          y={menu.y}
          target={menu.id ? models.find((m) => m.id === menu.id) ?? null : null}
          models={models}
          hidden={hidden}
          onClose={() => setMenu(null)}
          onSet={(ids) => {
            setMenu(null);
            setHidden(ids);
          }}
        />
      ) : null}
      {current && sheet && !wide ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <aside className="pop flex h-dvh w-full flex-col border-l bg-bg sm:w-[400px]">
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
              <p className="font-bold">Fiche du fan</p>
              <button onClick={() => setSheet(false)} className="rounded-lg p-1.5 text-muted hover:bg-card-2 hover:text-fg" aria-label="Fermer">
                <X className="size-5" />
              </button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              <FanPanel key={current.id} conv={current} model={modelsById[current.modelId]} onChanged={load} admin={me.admin} onErased={() => { setCurrentId(null); setSheet(false); load(); }} />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

/** Boîtes de la modèle affichée : chaque chatteur coche les siennes ; l'admin règle le nombre et les noms. */
function BoxMenu({ info, admin, onChanged }: { info: BoxInfo; admin: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(info.config);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setCfg(info.config), [info.config.enabled, info.config.count, info.config.names.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Aperçu du découpage pour le nombre de boîtes choisi (admin)
  const [preview, setPreview] = useState<{ box: number; fans: number; reply: number }[] | null>(null);
  useEffect(() => {
    if (!open || !admin) return;
    setPreview(null);
    let w = 72;
    try {
      const s = localStorage.getItem("crm.win");
      if (s !== null) w = Number(JSON.parse(s));
    } catch {}
    api<{ boxes: { box: number; fans: number; reply: number }[] }>("GET", `/api/models/${info.modelId}/boxes?count=${cfg.count}&window=${w}`)
      .then((r) => setPreview(r.boxes))
      .catch(() => {});
  }, [open, admin, cfg.count, info.modelId]);

  const c = info.config;
  const all = !info.mine.length || info.mine.length >= c.count;
  const choose = async (boxes: number[]) => {
    try {
      await api("POST", `/api/models/${info.modelId}/boxes`, { boxes });
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const toggle = (b: number) => {
    const cur = all ? [] : info.mine;
    const next = cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b];
    choose(next.length >= c.count ? [] : next);
  };
  const saveCfg = async () => {
    setBusy(true);
    try {
      await api("PUT", `/api/models/${info.modelId}/boxes`, cfg);
      toast(cfg.enabled ? `${cfg.count} boîtes actives` : "Boîtes désactivées");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Boîtes de répartition" className={cn("relative grid size-9 place-items-center rounded-xl border bg-card-2 transition-colors hover:border-primary/60", c.enabled && !all && "border-primary/60 text-primary-soft")}>
        <InboxIcon className="size-4" />
        {c.enabled && !all ? <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-white">{info.mine.length}</span> : null}
      </button>
      {open ? (
        <div className="pop absolute top-11 right-0 z-30 w-72 rounded-2xl border bg-card/95 p-3 shadow-2xl backdrop-blur-xl">
          {c.enabled ? (
            <>
              <p className="mb-1.5 text-[11px] font-semibold text-muted">Mes boîtes</p>
              <BoxCheck on={all} label="Toutes les boîtes" n={Object.values(info.perBox).reduce((a, b) => a + b, 0)} onClick={() => choose([])} />
              {Array.from({ length: c.count }, (_, i) => i + 1).map((b) => (
                <BoxCheck key={b} on={!all && info.mine.includes(b)} label={defaultBoxName(b)} n={info.perBox[b] ?? 0} onClick={() => toggle(b)} />
              ))}
              <p className="mt-2 text-[11px] text-muted">Les fans à répondre sont répartis automatiquement entre les boîtes ; un fan reste toujours dans la même.</p>
            </>
          ) : (
            <p className="text-sm text-muted">Boîtes désactivées pour cette modèle{admin ? " : active-les ci-dessous." : "."}</p>
          )}
          {admin ? (
            <div className="mt-3 border-t pt-3">
              <p className="mb-2 text-[11px] font-semibold text-muted">Réglages (admin)</p>
              <Toggle label="Activer les boîtes" sub="Répartir les fans de cette modèle" on={cfg.enabled} set={(v) => setCfg({ ...cfg, enabled: v })} />
              <div className="mt-2 flex items-center justify-between text-sm font-semibold">
                Nombre de boîtes
                <span className="flex items-center rounded-lg border bg-card-2">
                  <button onClick={() => setCfg({ ...cfg, count: Math.max(2, cfg.count - 1) })} className="grid size-8 place-items-center text-muted hover:text-fg">
                    −
                  </button>
                  <span className="w-6 text-center tabular-nums">{cfg.count}</span>
                  <button onClick={() => setCfg({ ...cfg, count: Math.min(20, cfg.count + 1) })} className="grid size-8 place-items-center text-muted hover:text-fg">
                    +
                  </button>
                </span>
              </div>
              {/* Aperçu : comment les fans se répartissent avec ce nombre de boîtes */}
              <div className="mt-2 flex flex-col gap-1 rounded-xl bg-card-2/60 p-2">
                {preview
                  ? preview.map((p) => (
                      <div key={p.box} className="flex items-center gap-2 text-xs">
                        <InboxIcon className="size-3.5 text-muted" />
                        <span className="flex-1 font-semibold">{defaultBoxName(p.box)}</span>
                        <span className="text-muted tabular-nums">{p.fans} fans</span>
                        <span className="w-24 text-right font-semibold text-primary-soft tabular-nums">{p.reply} à répondre</span>
                      </div>
                    ))
                  : <p className="py-1 text-center text-xs text-muted">Calcul…</p>}
              </div>
              <button onClick={saveCfg} disabled={busy} className="mt-2 h-8 w-full rounded-lg bg-primary text-xs font-semibold text-white disabled:opacity-50">
                Enregistrer
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BoxCheck({ on, label, n, onClick }: { on: boolean; label: string; n: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-white/[0.04]">
      <span className={cn("grid size-4 place-items-center rounded border", on ? "border-primary bg-primary text-white" : "border-input")}>{on ? <Check className="size-3" /> : null}</span>
      <span className="flex-1 font-semibold">{label}</span>
      <span className="text-xs text-muted tabular-nums">{n} à répondre</span>
    </button>
  );
}

const SORTS: [string, string, string][] = [
  ["oldest", "Plus anciens", "Récents"],
  ["newest", "Récents", "Récents"],
  ["spent", "Par dépense", "Par dépense"],
];

function FilterMenu(p: {
  sort: string;
  setSort: (v: string) => void;
  paying: boolean;
  setPaying: (v: boolean) => void;
  online: boolean;
  setOnline: (v: boolean) => void;
  reply: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const active = (p.paying ? 1 : 0) + (p.online ? 1 : 0);
  const label = p.sort === "spent" ? "Par dépense" : p.sort === "newest" ? "Récents d’abord" : p.reply ? "Plus anciens d’abord" : "Récents d’abord";
  const sorts = p.reply ? SORTS : SORTS.filter(([k]) => k !== "newest");
  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <button onClick={() => setOpen((o) => !o)} className={cn("flex h-8 w-full items-center gap-2 rounded-lg border bg-card-2 px-2.5 text-xs font-semibold", open && "border-primary/60")}>
        <SlidersHorizontal className="size-3.5 text-muted" />
        <span className="truncate">{label}</span>
        {active ? <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] leading-4 text-white">{active}</span> : null}
      </button>
      {open ? (
        <div className="pop absolute top-10 left-0 z-30 w-72 rounded-2xl border bg-card/95 p-3 shadow-2xl backdrop-blur-xl">
          <p className="mb-1.5 text-[11px] font-semibold text-muted">Ordre</p>
          <div className="flex rounded-xl bg-card-2 p-1">
            {sorts.map(([k, l, l2]) => (
              <button key={k} onClick={() => p.setSort(k)} className={cn("flex-1 rounded-lg py-1.5 text-xs font-semibold", p.sort === k || (!p.reply && k === "oldest" && p.sort === "newest") ? "bg-bg text-fg shadow" : "text-muted hover:text-fg")}>
                {p.reply ? l : l2}
              </button>
            ))}
          </div>
          <div className="my-3 h-px bg-line" />
          <Toggle label="Payants uniquement" sub="Ont déjà acheté" on={p.paying} set={p.setPaying} />
          <Toggle label="En ligne uniquement" sub="Connectés ces 5 dernières minutes" on={p.online} set={p.setOnline} />
          <p className="mt-3 text-[11px] text-muted">Les listes de fans arrivent bientôt ici.</p>
        </div>
      ) : null}
    </div>
  );
}

function Toggle({ label, sub, on, set }: { label: string; sub: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button onClick={() => set(!on)} className="flex w-full items-center gap-3 rounded-lg py-1.5 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-[11px] text-muted">{sub}</span>
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-input")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", on ? "left-4.5" : "left-0.5")} />
      </span>
    </button>
  );
}

function RailButton({ on, onClick, onMenu, label, count, children }: { on: boolean; onClick: () => void; onMenu?: (x: number, y: number) => void; label: string; count: number; children: React.ReactNode }) {
  // Appui long (téléphone / tablette) = même menu que le clic droit
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const long = useRef(false);
  const start = (e: React.PointerEvent) => {
    if (!onMenu || e.pointerType === "mouse") return;
    long.current = false;
    const { clientX: x, clientY: y } = e;
    timer.current = setTimeout(() => {
      long.current = true;
      onMenu(x, y);
    }, 550);
  };
  const stop = () => timer.current && clearTimeout(timer.current);
  return (
    <button
      onClick={() => (long.current ? (long.current = false) : onClick())}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      title={label}
      className="group relative select-none"
    >
      <span className={cn("absolute top-1/2 -left-[14px] h-0 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-all", on ? "h-8" : "group-hover:h-4")} />
      <span className={cn("block rounded-2xl transition-all", on ? "ring-2 ring-primary ring-offset-2 ring-offset-bg" : "opacity-80 group-hover:opacity-100")}>{children}</span>
      {count ? <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] leading-5 font-bold text-white ring-2 ring-bg">{count > 99 ? "99+" : count}</span> : null}
    </button>
  );
}

/** « 🔥 GROS PAYEUR 189 € » sous l'aperçu, comme sur Moby. */

function QueueItem({ c, on, model, meId, onClick, onToggleUnread, boxLabel, relance }: { c: Conv; on: boolean; model?: Model; meId: number; onClick: () => void; onToggleUnread: () => void; boxLabel?: string | null; relance?: { ppv: number | null; step: string | null; at: string | null } }) {
  // Chrono d'attente à la seconde ; point vert quand le fan est connecté (vu il y a moins de 2 min)
  const now = useNow();
  const waiting = c.needsReply && c.waitingSince ? now - Date.parse(c.waitingSince) : null;
  const isOnline = !!c.lastSeenAt && now - Date.parse(c.lastSeenAt) < 120_000;
  const newDay = newSubDay(c.subscribedAt, now);
  const tone = waiting !== null ? waitTone(waiting) : null;
  const lockedByOther = c.lock && c.lock.userId !== meId;
  // Brouillon non envoyé pour ce fan (mis à jour dès qu'on tape)
  const [draft, setDraftOn] = useState(false);
  useEffect(() => {
    const f = () => setDraftOn(hasDraft(c.id));
    f();
    window.addEventListener("crm-drafts", f);
    return () => window.removeEventListener("crm-drafts", f);
  }, [c.id]);

  // --- glisser vers la gauche = basculer lu / non lu
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; active: boolean; moved: boolean } | null>(null);
  const SWIPE = 80;
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, active: false, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    if (!d.active) {
      if (Math.abs(e.clientY - d.y) > 12) return (drag.current = null);
      if (mx < -10) {
        d.active = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else return;
    }
    d.moved = true;
    setDx(Math.max(-120, Math.min(0, mx)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.active && dx <= -SWIPE) onToggleUnread();
    setDx(0);
    if (d?.moved) suppressClick.current = true;
  };
  const suppressClick = useRef(false);

  return (
    <div className="relative overflow-hidden border-b border-line/60">
      {/* action révélée par le glissement */}
      <div className={cn("absolute inset-y-0 right-0 flex w-32 items-center justify-end gap-2 pr-4 text-xs font-bold text-white transition-colors", dx <= -SWIPE ? "bg-primary" : "bg-primary/40")}>
        {c.fresh ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        {c.fresh ? "Marquer lu" : "Non lu"}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDx(0);
        }}
        style={{ transform: `translateX(${dx}px)`, transition: drag.current?.active ? "none" : "transform 0.2s ease" }}
        className="relative touch-pan-y bg-bg"
      >
    <button
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onClick();
      }}
      className={cn(
        "cv-row group/item relative flex w-full gap-3 px-3 py-3 text-left transition-colors",
        on ? "bg-primary/10" : "bg-panel hover:bg-white/[0.04]",
        lockedByOther && "opacity-60",
      )}
    >
      {on ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary shadow-[0_0_12px_var(--color-primary)]" /> : null}
      {/* Colonne photo (façon Infloww) : « NEW » à la place de la photo les 3 premiers jours, total dépensé juste dessous. */}
      <span className="flex shrink-0 flex-col items-center gap-1">
        <span className="relative">
          {newDay ? (
            <span title={`Nouvel abonné : jour ${newDay} sur 3`} className="grid size-11 place-items-center rounded-full bg-primary text-white">
              <span className="flex flex-col items-center leading-none">
                <span className="text-[11px] font-black tracking-wide">NEW</span>
              </span>
            </span>
          ) : (
            <FanAvatar src={c.memberAvatar} name={c.nickname || c.memberName} size="size-11" />
          )}
          {/* Un seul point : vert qui pulse = fan en ligne (vu il y a moins de 2 min). Les nouveaux messages se voient au nom en gras. */}
          {/* Réglages → Préférences : point vert (par défaut) ou contour vert animé autour de la photo */}
          {isOnline ? <span title="En ligne" className="online-dot pulse-online absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-bg bg-emerald-400" /> : null}
          {isOnline ? <span title="En ligne" className="online-ring pointer-events-none absolute -inset-[3px] rounded-full border-2 border-emerald-400" /> : null}
        </span>
        <span title="Total dépensé chez cette modèle" className={cn("rounded-md px-1.5 py-px text-[11px] font-extrabold tabular-nums", c.totalSpent ? "bg-primary/20 text-primary-soft" : "bg-white/5 text-muted")}>
          {money(c.totalSpent || 0, 0, curOf(c.modelId))}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {c.vip ? <Crown className="size-3.5 shrink-0 text-amber-300" /> : null}
          {c.pinned ? (
            <span title={c.pinnedBy ? `Épinglé par ${c.pinnedBy.id === meId ? "toi" : c.pinnedBy.name}` : "Épinglé"} className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-muted">
              <Pin className="size-3" />
              {c.pinnedBy && c.pinnedBy.id !== meId ? c.pinnedBy.name : null}
            </span>
          ) : null}
          <span className={cn("truncate text-sm", c.fresh ? "font-extrabold text-fg" : "font-semibold text-fg/75")}>{c.nickname || c.memberName || "Fan"}</span>
          {draft ? (
            <span title="Brouillon en cours" className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/15 px-1 text-[10px] font-bold text-primary-soft">
              <Pencil className="size-2.5" /> brouillon
            </span>
          ) : null}
          {c.score ? <span className="raven-card"><MiniCard score={c.score} /></span> : null}
        </span>
        {/* blanc = personne de l'équipe n'a encore ouvert ; gris = déjà ouvert (ou c'est nous qui avons écrit en dernier) */}
        <span className={cn("mt-0.5 block truncate text-[13px]", c.fresh ? "font-semibold text-fg" : "text-muted")}>
          {c.lastFromFan ? "" : c.seen ? <span className="font-semibold text-sky-400" title="Vu par le fan">✓✓ Vu · </span> : <span title="Envoyé, pas encore vu">✓ Vous : </span>}
          {c.preview}
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1 empty:hidden">
          {model ? (
            <Pill tone="accent">
              <PlatformLogo platform={model.platform} className="size-3 rounded-[3px]" /> {model.displayName}
            </Pill>
          ) : null}
          {relance?.ppv ? (
            <Pill tone="warn" title="PPV envoyé, pas encore payé">
              <Lock className="size-3" /> {money(relance.ppv, 0, curOf(c.modelId))} non payé
            </Pill>
          ) : null}
          {relance?.step ? <Pill tone="info" title="Dernière étape de script envoyée">{relance.step}</Pill> : null}
          {relance?.at ? <Pill title="Temps écoulé depuis l’envoi du PPV">envoyé {ago(relance.at)}</Pill> : null}
          {boxLabel ? <Pill tone="info">{boxLabel}</Pill> : null}
          {lockedByOther ? (
            <Pill tone="info">
              <Lock className="size-3" />
              {c.lock!.name}
            </Pill>
          ) : null}
          {c.crmTags.slice(0, 3).map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
        {waiting !== null ? (
          <span className={cn("rounded-md px-1.5 py-0.5 font-bold tabular-nums", tone === "good" ? "bg-emerald-500/15 text-emerald-300" : tone === "warn" ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300")}>
            {durSec(waiting)}
          </span>
        ) : (
          <span className="text-muted tabular-nums">{clock(c.lastMessageAt)}</span>
        )}
      </span>
    </button>
      </div>
    </div>
  );
}

/** Clic droit / appui long sur le rail : masquer une modèle, ou (sur « Tous ») réafficher les modèles masquées. */
function ModelMenu({ x, y, target, models, hidden, onClose, onSet }: { x: number; y: number; target: Model | null; models: Model[]; hidden: Set<string>; onClose: () => void; onSet: (ids: string[]) => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const list = [...hidden];
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 800) - 320);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="pop fixed z-50 w-72 overflow-hidden rounded-2xl border bg-card/95 p-1.5 shadow-2xl backdrop-blur-xl" style={{ left: x + 6, top: Math.max(8, top) }}>
        {target ? (
          <button onClick={() => onSet([...list, target.id])} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm hover:bg-card-2">
            <EyeOff className="size-4 text-muted" />
            <span>
              Masquer <b>{target.displayName}</b>
              <span className="block text-[11px] text-muted">Disparaît du rail et de « Tous »</span>
            </span>
          </button>
        ) : (
          <>
            <p className="px-3 pt-1.5 pb-1 text-[11px] font-bold tracking-wide text-muted uppercase">Modèles dans la messagerie</p>
            {/* Trier d'un clic : seulement OnlyFans, seulement MYM, ou toutes. */}
            {(() => {
              const isMym = (m: Model) => /mym/i.test(m.platform || "");
              const onlyOf = models.length > 0 && models.every((m) => isMym(m) === hidden.has(m.id)) && models.some((m) => !isMym(m));
              const onlyMym = models.length > 0 && models.every((m) => !isMym(m) === hidden.has(m.id)) && models.some((m) => isMym(m));
              const all = list.length === 0;
              const btn = "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors";
              return (
                <div className="flex gap-1 px-1.5 pb-1.5">
                  <button onClick={() => onSet([])} className={cn(btn, all ? "border-primary bg-primary/15 text-fg" : "text-muted hover:text-fg")}>
                    Toutes
                  </button>
                  <button onClick={() => onSet(models.filter(isMym).map((m) => m.id))} className={cn(btn, onlyOf ? "border-primary bg-primary/15 text-fg" : "text-muted hover:text-fg")} title="Seulement les modèles OnlyFans">
                    <PlatformLogo platform="onlyfans" className="size-4 rounded-[4px]" /> OnlyFans
                  </button>
                  <button onClick={() => onSet(models.filter((m) => !isMym(m)).map((m) => m.id))} className={cn(btn, onlyMym ? "border-primary bg-primary/15 text-fg" : "text-muted hover:text-fg")} title="Seulement les modèles MYM">
                    <PlatformLogo platform="mym" className="size-4 rounded-[4px]" /> MYM
                  </button>
                </div>
              );
            })()}
            {models.map((m) => {
              const off = hidden.has(m.id);
              return (
                <button key={m.id} onClick={() => onSet(off ? list.filter((id) => id !== m.id) : [...list, m.id])} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-card-2">
                  <Avatar src={m.avatar} name={m.displayName} size="size-7" rounded="rounded-lg" className={off ? "opacity-40 grayscale" : ""} />
                  <span className={cn("min-w-0 flex-1 truncate", off && "text-muted line-through")}>{m.displayName}</span>
                  <PlatformLogo platform={m.platform} className={cn("size-4 rounded-[4px]", off && "opacity-40 grayscale")} />
                  {off ? <EyeOff className="size-4 text-muted" /> : <Eye className="size-4 text-primary-soft" />}
                </button>
              );
            })}
            <p className="px-3 pt-1 pb-1.5 text-[11px] text-muted">Clique pour masquer / réafficher. Enregistré sur ton compte.</p>
          </>
        )}
      </div>
    </>
  );
}
