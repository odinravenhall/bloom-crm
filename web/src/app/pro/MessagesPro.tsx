"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Languages, LayoutGrid, MessageCircle, Plus, RefreshCw, Search, Bell, UserRoundPlus, X } from "lucide-react";
import { api } from "@/rv/lib/client";
import { setCurrentModel, setModelCurrencies } from "@/rv/lib/fmt";
import { debounce, onLive } from "@/rv/lib/liveClient";
import { setLang, useT } from "@/lib/i18n";
import type { Conv, Model } from "@/rv/inbox/types";
import { Avatar } from "@/components/ui";
import { ProInbox } from "./ProInbox";
import { ProChat } from "./ProChat";
import { ProInsights } from "./ProInsights";
import { notifCount } from "./ProNotifications";

// Messages Pro (OnlyFans) : copie de la messagerie d'Infloww.
//   1. « My Creator list » : cartes des créatrices (à répondre en rouge, notifications en vert) → « Start messaging ».
//   2. Espace de travail : onglets des créatrices ouvertes (+ Add a Creator), puis onglets « Home » et fans ouverts
//      dans un nouvel onglet ; Home = liste des conversations + conversation + Fan insights.
// Données : les adresses « /api/rv/… » de Bloom (Substy), comme la messagerie reprise de Raven.
type Me = { id: number; name: string; admin: boolean };
type Boot = { me: Me; models: Model[] };
type State = { tabs: string[]; active: string | null; fanTabs: Record<string, string[]>; view: Record<string, string> };
const KEY = "bloom.pro";
const EMPTY: State = { tabs: [], active: null, fanTabs: {}, view: {} };
export const PRO = { blue: "#2f6bff", green: "#2ec4a6", red: "#f26b6b", bar: "#000", panel: "var(--pro-panel)", line: "var(--pro-line)" };

function readState(): State {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return EMPTY;
  }
}

export function MessagesPro() {
  const { t, lang } = useT();
  // SFW : floute les photos et vidéos (pour chatter en public).
  const [sfw, setSfw] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  useEffect(() => {
    try {
      setSfw(localStorage.getItem("bloom.pro.sfw") === "1");
    } catch {}
  }, []);
  const toggleSfw = () =>
    setSfw((v) => {
      try {
        localStorage.setItem("bloom.pro.sfw", v ? "0" : "1");
      } catch {}
      return !v;
    });
  const [boot, setBoot] = useState<Boot | null>(null);
  const [err, setErr] = useState("");
  const [st, setSt] = useState<State>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [reply, setReply] = useState<Record<string, number>>({});
  const [notifs, setNotifs] = useState<Record<string, number>>({});
  const [convs, setConvs] = useState<Record<string, Conv>>({});

  useEffect(() => setSt(readState()), []);
  const save = (fn: (s: State) => State) =>
    setSt((s) => {
      const n = fn(s);
      try {
        localStorage.setItem(KEY, JSON.stringify(n));
      } catch {}
      return n;
    });

  useEffect(() => {
    api<Boot>("GET", "/api/boot")
      .then((b) => {
        const models = b.models.filter((m) => !/mym/i.test(m.platform || ""));
        setModelCurrencies(b.models);
        setBoot({ ...b, models });
      })
      .catch((e) => setErr((e as Error).message));
  }, []);
  const models = boot?.models ?? [];
  // Lien direct « /pro?c=<créatrice>~<fan> » (Copy chat link) : ouvre la créatrice et le fan dans un onglet.
  useEffect(() => {
    if (!boot) return;
    const c = new URLSearchParams(location.search).get("c");
    if (!c || !c.includes("~")) return;
    const cid = c.split("~")[0];
    if (!boot.models.some((m) => m.id === cid)) return;
    api<{ conversation: Conv }>("GET", `/api/conversations/${c}`)
      .then((r) => {
        setConvs((x) => ({ ...x, [c]: r.conversation }));
        save((s) => ({ ...s, tabs: s.tabs.includes(cid) ? s.tabs : [...s.tabs, cid], active: cid, fanTabs: { ...s.fanTabs, [cid]: [...new Set([...(s.fanTabs[cid] ?? []), c])] }, view: { ...s.view, [cid]: c } }));
        history.replaceState(null, "", "/pro");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot]);
  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  // Pastilles : fans à qui répondre (rouge) et notifications non vues (vert), par créatrice.
  const loadCounts = useCallback(() => {
    api<{ counts: Record<string, number> }>("GET", "/api/inbox?tab=reply&window=72")
      .then((r) => setReply(r.counts || {}))
      .catch(() => {});
    if (models.length) Promise.all(models.map(async (m) => [m.id, await notifCount(m.id)] as const)).then((l) => setNotifs(Object.fromEntries(l)));
  }, [models]);
  useEffect(() => {
    loadCounts();
    const later = debounce(loadCounts, 4000);
    const off = onLive("conv", () => later());
    const tm = setInterval(() => document.visibilityState === "visible" && loadCounts(), 60_000);
    const seen = () => loadCounts();
    window.addEventListener("pro-notif-seen", seen);
    return () => (off(), clearInterval(tm), window.removeEventListener("pro-notif-seen", seen));
  }, [loadCounts]);

  const open = (id: string) => {
    save((s) => ({ ...s, tabs: s.tabs.includes(id) ? s.tabs : [...s.tabs, id], active: id }));
    setAdding(false);
  };
  const close = (id: string) =>
    save((s) => {
      const tabs = s.tabs.filter((x) => x !== id);
      return { ...s, tabs, active: s.active === id ? (tabs[tabs.length - 1] ?? null) : s.active };
    });
  const active = st.active && st.tabs.includes(st.active) ? st.active : (st.tabs[0] ?? null);

  if (!boot) return <div className="grid h-dvh place-items-center text-sm" style={{ background: "var(--pro-page)", color: "var(--of-muted)" }}>{err || t("Loading…")}</div>;
  const showList = adding || !active;

  return (
    <div className={`pro fixed inset-0 flex flex-col overflow-hidden ${sfw ? "pro-sfw" : ""}`} style={{ background: "var(--pro-page)", color: "var(--of-text)" }}>
      {/* Onglets des créatrices */}
      <div className="flex h-12 shrink-0 items-end gap-1 px-3" style={{ background: "var(--pro-bar)" }}>
        {showList ? (
          <TabShell on>
            <UserRoundPlus className="size-4" />
            <span className="text-[13px] font-medium">{t("Creator list")}</span>
            {st.tabs.length ? (
              <button onClick={() => setAdding(false)} className="ml-3 opacity-70 hover:opacity-100">
                <X className="size-3.5" />
              </button>
            ) : null}
          </TabShell>
        ) : null}
        {!showList
          ? st.tabs.map((id) => {
              const m = byId.get(id);
              if (!m) return null;
              return (
                <TabShell key={id} on={id === active} onClick={() => save((s) => ({ ...s, active: id }))}>
                  <Avatar src={m.avatar} name={m.displayName} size="size-7" rounded="rounded-md" />
                  <span className="min-w-0">
                    <span className="block max-w-[110px] truncate text-[13px] leading-4 font-semibold">{m.displayName}</span>
                    <Badges reply={reply[id] || 0} notif={notifs[id] || 0} small />
                  </span>
                  <button
                    onClick={(e) => (e.stopPropagation(), close(id))}
                    className="ml-2 grid size-4 place-items-center rounded-full"
                    style={{ background: "var(--of-muted)", color: "var(--pro-bar)" }}
                    title={t("Close")}
                  >
                    <X className="size-3" />
                  </button>
                </TabShell>
              );
            })
          : null}
        {!showList ? (
          <button onClick={() => setAdding(true)} className="mb-2 ml-2 flex items-center gap-1.5 text-[13px]" style={{ color: "var(--of-text)" }}>
            <Plus className="size-4" /> {st.tabs.length < 2 ? t("Add a Creator") : null}
          </button>
        ) : null}
        <div className="mb-2 ml-auto flex items-center gap-3">
          <button onClick={toggleSfw} title={t("SFW: blur photos and videos")} className="flex flex-col items-center text-[10px] leading-3" style={{ color: "var(--of-muted)" }}>
            SFW
            <span className="relative mt-0.5 h-3.5 w-6 rounded-full" style={{ background: sfw ? PRO.blue : "#555" }}>
              <span className="absolute top-0.5 size-2.5 rounded-full bg-white transition-all" style={{ left: sfw ? 12 : 2 }} />
            </span>
          </button>
          <div className="relative">
            <button onClick={() => setLangOpen(!langOpen)} className="flex h-8 items-center gap-1 rounded-md px-2" style={{ background: "var(--pro-chip)" }} title={t("Language")}>
              <Languages className="size-4" /> <ChevronDown className="size-3.5" />
            </button>
            {langOpen ? (
              <>
                <div className="fixed inset-0 z-40" onMouseDown={() => setLangOpen(false)} />
                <div className="absolute right-0 z-50 mt-1 w-36 rounded-md border py-1 shadow-xl" style={{ background: "var(--pro-pop)", borderColor: "var(--pro-line)" }}>
                  {(
                    [
                      ["en", "English"],
                      ["es", "Español"],
                      ["fr", "Français"],
                    ] as const
                  ).map(([k, l]) => (
                    <button key={k} onClick={() => (setLang(k), setLangOpen(false))} className="block w-full px-3 py-1.5 text-left text-[13px]" style={lang === k ? { color: PRO.blue } : undefined}>
                      {l}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {showList ? (
        <CreatorList models={models} reply={reply} notifs={notifs} onOpen={open} onRefresh={loadCounts} t={t} />
      ) : active ? (
        <Workspace
          key={active}
          model={byId.get(active)!}
          me={boot.me}
          fanTabs={st.fanTabs[active] ?? []}
          view={st.view[active] ?? "home"}
          convs={convs}
          remember={(c) => setConvs((x) => (x[c.id] ? x : { ...x, [c.id]: c }))}
          setView={(v) => save((s) => ({ ...s, view: { ...s.view, [active]: v } }))}
          openTab={(c) => {
            setConvs((x) => ({ ...x, [c.id]: c }));
            save((s) => ({ ...s, fanTabs: { ...s.fanTabs, [active]: [...new Set([...(s.fanTabs[active] ?? []), c.id])] }, view: { ...s.view, [active]: c.id } }));
          }}
          closeTab={(id) =>
            save((s) => ({ ...s, fanTabs: { ...s.fanTabs, [active]: (s.fanTabs[active] ?? []).filter((x) => x !== id) }, view: { ...s.view, [active]: s.view[active] === id ? "home" : s.view[active] } }))
          }
          notif={notifs[active] || 0}
          t={t}
        />
      ) : null}
    </div>
  );
}

function TabShell({ on, children, onClick }: { on?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex h-[42px] cursor-pointer items-center gap-2 rounded-t-lg px-3"
      style={on ? { background: "var(--pro-tab)" } : { background: "transparent" }}
    >
      {children}
    </div>
  );
}

export function Badges({ reply, notif, small }: { reply: number; notif: number; small?: boolean }) {
  const pill = (n: number, bg: string, Icon: typeof MessageCircle) => (
    <span className={cn2("inline-flex items-center gap-0.5 rounded-full font-semibold text-white tabular-nums", small ? "px-1 text-[9px] leading-[13px]" : "px-1.5 text-[10px] leading-4")} style={{ background: bg }}>
      <Icon className={small ? "size-2" : "size-2.5"} />
      {n > 99 ? "99+" : n}
    </span>
  );
  if (!reply && !notif) return null;
  return (
    <span className="mt-0.5 flex items-center gap-1">
      {reply ? pill(reply, PRO.red, MessageCircle) : null}
      {notif ? pill(notif, PRO.green, Bell) : null}
    </span>
  );
}
const cn2 = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** « My Creator list » d'Infloww. */
function CreatorList({ models, reply, notifs, onOpen, onRefresh, t }: { models: Model[]; reply: Record<string, number>; notifs: Record<string, number>; onOpen: (id: string) => void; onRefresh: () => void; t: (s: string) => string }) {
  const [q, setQ] = useState("");
  const [groupsOpen, setGroupsOpen] = useState(false);
  const list = models.filter((m) => !q || m.displayName.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.displayName.localeCompare(b.displayName));
  return (
    <div className="of-scroll min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1080px] px-4 pt-[120px] pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2.5 text-[19px] font-semibold">
            {t("My Creator list")}
            <button onClick={onRefresh} title={t("Refresh")}>
              <RefreshCw className="size-4" />
            </button>
          </h1>
          <div className="flex gap-4">
            <div className="relative">
              <button onClick={() => setGroupsOpen(!groupsOpen)} onBlur={() => setTimeout(() => setGroupsOpen(false), 150)} className="flex h-8 w-[200px] items-center justify-between rounded-md border px-3 text-[12px]" style={{ borderColor: "var(--pro-line)", color: "var(--of-muted)" }}>
                {t("Select groups")} <ChevronDown className="size-3.5" />
              </button>
              {groupsOpen ? (
                <div className="absolute z-20 mt-1 w-full rounded-md border p-3 text-[12px]" style={{ background: "var(--pro-panel)", borderColor: "var(--pro-line)", color: "var(--of-muted)" }}>
                  {t("No groups yet")}
                </div>
              ) : null}
            </div>
            <label className="flex h-8 w-[200px] items-center gap-2 rounded-md border px-3" style={{ borderColor: "var(--pro-line)" }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search by Creator name")} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
              <Search className="size-3.5" style={{ color: "var(--of-muted)" }} />
            </label>
          </div>
        </div>
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((m) => (
            <button key={m.id} onClick={() => onOpen(m.id)} className="group flex h-[72px] items-center gap-3 rounded-md border px-4 text-left transition-colors hover:border-[#2f6bff]" style={{ background: "var(--pro-panel)", borderColor: "var(--pro-line)" }}>
              <Avatar src={m.avatar} name={m.displayName} size="size-11" rounded="rounded-md" />
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-semibold">{m.displayName}</span>
                <span className="group-hover:hidden">
                  <Badges reply={reply[m.id] || 0} notif={notifs[m.id] || 0} />
                </span>
                <span className="hidden text-[13px] font-semibold group-hover:block" style={{ color: PRO.blue }}>
                  {t("Start messaging")}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-8 rounded py-2 text-center text-[14px]" style={{ background: "var(--pro-line)" }}>
          {t("Click on a Creator to start messaging")}
        </div>
      </div>
    </div>
  );
}

/** Espace d'une créatrice : onglets Home / fans, puis liste + conversation + Fan insights. */
function Workspace({
  model, me, fanTabs, view, convs, remember, setView, openTab, closeTab, notif, t,
}: {
  model: Model; me: Me; fanTabs: string[]; view: string; convs: Record<string, Conv>; remember: (c: Conv) => void;
  setView: (v: string) => void; openTab: (c: Conv) => void; closeTab: (id: string) => void; notif: number; t: (s: string) => string;
}) {
  const [sel, setSel] = useState<Conv | null>(null);
  // Montants dans la devise de la créatrice (OnlyFans : dollars).
  setCurrentModel(model.id);
  // Pastille rouge sur l'onglet d'un fan qui vient d'écrire (tant qu'on n'a pas regardé l'onglet).
  const [dots, setDots] = useState<Set<string>>(new Set());
  useEffect(() => {
    const off = onLive("conv", (d) => {
      if (d.id && d.fromFan && fanTabs.includes(d.id) && d.id !== view) setDots((x) => new Set(x).add(d.id!));
    });
    return off;
  }, [fanTabs, view]);
  useEffect(() => {
    if (dots.has(view)) setDots((x) => (x.delete(view), new Set(x)));
  }, [view, dots]);
  const [insightTab, setInsightTab] = useState<"insights" | "sales" | "notes">("insights");
  const home = view === "home" || !fanTabs.includes(view);
  const tabConv = !home ? convs[view] : null;
  const box = useRef<HTMLDivElement>(null);
  void notif;
  // Conversation choisie dans Home (gardée quand on revient sur Home).
  const shown = home ? sel : tabConv;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-end gap-1 px-1" style={{ background: "var(--pro-tab)" }}>
        <FanTab on={home} onClick={() => setView("home")}>
          <LayoutGrid className="size-3.5" /> {t("Home")}
        </FanTab>
        {fanTabs.map((id) => (
          <FanTab key={id} on={view === id} onClick={() => setView(id)} onClose={() => closeTab(id)}>
            <span className="max-w-[120px] truncate">{convs[id]?.nickname || convs[id]?.memberName || "Fan"}</span>
            {dots.has(id) ? <span className="size-2 rounded-full" style={{ background: PRO.red }} /> : null}
          </FanTab>
        ))}
      </div>
      <div ref={box} className="flex min-h-0 flex-1">
        {home ? (
          <ProInbox
            model={model}
            me={me}
            selected={sel?.id ?? null}
            notif={notif}
            onOpen={(c) => (setSel(c), remember(c))}
            t={t}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col" style={{ borderLeft: "1px solid var(--pro-line)" }}>
          {shown ? (
            <ProChat
              key={shown.id}
              conv={shown}
              me={me}
              model={model}
              onBack={() => (home ? setSel(null) : setView("home"))}
              onNewTab={home ? () => openTab(shown) : undefined}
              onNotes={() => setInsightTab("notes")}
              t={t}
            />
          ) : (
            <div className="grid flex-1 place-items-center">
              <div className="text-center">
                <PaperPlane />
                <p className="mt-4 text-[20px]">{t("Select any conversation to start")}</p>
              </div>
            </div>
          )}
        </div>
        {shown ? <ProInsights key={shown.id} conv={shown} tab={insightTab} setTab={setInsightTab} t={t} /> : null}
      </div>
    </div>
  );
}

function FanTab({ on, children, onClick, onClose }: { on: boolean; children: React.ReactNode; onClick: () => void; onClose?: () => void }) {
  return (
    <div onClick={onClick} className="flex h-7 min-w-[150px] cursor-pointer items-center justify-center gap-1.5 rounded-t-lg px-4 text-[12px] font-semibold" style={{ background: on ? "var(--pro-page)" : "var(--pro-tab-off)" }}>
      {children}
      {onClose ? (
        <button onClick={(e) => (e.stopPropagation(), onClose())} className="ml-2 grid size-4 place-items-center rounded-full" style={{ background: "var(--of-muted)", color: "var(--pro-bar)" }}>
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

function PaperPlane() {
  return (
    <svg width="96" height="80" viewBox="0 0 96 80" className="mx-auto" aria-hidden>
      <path d="M94 2 2 36l26 10 6 30 14-20 26 16z" fill="#2f6bff" />
      <path d="M28 46 94 2 34 76z" fill="#1f4fd1" />
      <path d="M34 76 48 56 28 46z" fill="#173fb0" />
    </svg>
  );
}
