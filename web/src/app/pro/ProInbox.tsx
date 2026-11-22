"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, ChartNoAxesCombined, Check, Flame, Inbox as InboxIcon, ListFilter, MessageSquareText, Pencil, Plus, RefreshCw, Search, Settings, UserRound, X } from "lucide-react";
import { api, toast } from "@/rv/lib/client";
import { debounce, onLive } from "@/rv/lib/liveClient";
import type { Conv, Model, QueueResp } from "@/rv/inbox/types";
import { ProNotifications } from "./ProNotifications";

// Colonne de gauche de Messages Pro (Infloww) : en-tête de la créatrice, « Online Fans », « Notifications »,
// boîtes (All inboxes / Inbox i of N, réglage du partage), tri et menu « More », puces de filtre, conversations.
type Item = QueueResp["items"][number] & { memberUsername?: string | null };
type Chip = "all" | "pinned" | "priority" | "unread" | "tips";
type Filter = "all" | "priority" | "unread" | "unreadTips" | "fanLast";
const BLUE = "#2f6bff";
const GREEN = "#2ec4a6";
const RED = "#f26b6b";
const DAY = 864e5;
const BIG = 5000; // « Priority » : fans qui ont dépensé au moins 50 $ et attendent une réponse

type Prefs = { order: "newest" | "oldest"; filter: Filter; focus: boolean; hideMuted: boolean; hideCreator: boolean; boxes: number[] | null; lists: { id: string; name: string }[] };
type OfList = { id: string; name: string; type: string; fans: number };
const PKEY = (cid: string) => `bloom.pro.inbox.${cid}`;

export function ProInbox({ model, me, selected, notif, onOpen, t }: { model: Model; me: { admin: boolean }; selected: string | null; notif: number; onOpen: (c: Conv) => void; t: (s: string) => string }) {
  const [data, setData] = useState<QueueResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [chip, setChip] = useState<Chip>("all");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [online, setOnline] = useState(false);
  const [pop, setPop] = useState<null | "notif" | "boxes" | "split" | "more" | "online" | "lists">(null);
  const [select, setSelect] = useState<Set<string> | null>(null);
  const [p, setP] = useState<Prefs>({ order: "newest", filter: "all", focus: false, hideMuted: false, hideCreator: false, boxes: null, lists: [] });
  // Liste OnlyFans choisie (puce) : on garde seulement ses fans.
  const [list, setList] = useState<{ id: string; fans: Set<string> } | null>(null);
  const pickList = (id: string) => {
    if (list?.id === id) return setList(null);
    api<{ fans: string[] }>("GET", `/api/pro/list-fans?creatorId=${encodeURIComponent(model.id)}&listId=${encodeURIComponent(id)}`)
      .then((r) => setList({ id, fans: new Set(r.fans) }))
      .catch((e) => toast((e as Error).message, "err"));
  };
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(PKEY(model.id)) || "null");
      if (s) setP((x) => ({ ...x, ...s }));
    } catch {}
  }, [model.id]);
  const setPref = (o: Partial<Prefs>) =>
    setP((x) => {
      const n = { ...x, ...o };
      try {
        localStorage.setItem(PKEY(model.id), JSON.stringify(n));
      } catch {}
      return n;
    });

  const load = useCallback(() => {
    setBusy(true);
    const qs = new URLSearchParams({ model: model.id, tab: "all", sort: p.order, ...(q ? { q } : {}), ...(online ? { online: "1" } : {}) });
    api<QueueResp>("GET", `/api/inbox?${qs}`)
      .then(setData)
      .catch((e) => toast((e as Error).message, "err"))
      .finally(() => setBusy(false));
  }, [model.id, p.order, q, online]);
  useEffect(() => {
    load();
  }, [load]);
  // Temps réel (sauf « Focus mode » : les nouveaux messages ne bougent plus la liste).
  const focus = useRef(p.focus);
  focus.current = p.focus;
  useEffect(() => {
    const later = debounce(() => !focus.current && load(), 700);
    const off = onLive("conv", (d) => d.modelId === model.id && later());
    const tm = setInterval(() => document.visibilityState === "visible" && !focus.current && load(), 45_000);
    return () => (off(), clearInterval(tm));
  }, [load, model.id]);

  const items = (data?.items ?? []) as Item[];
  const boxCount = data?.boxes?.config.enabled ? data.boxes.config.count : 0;
  const inBoxes = (c: Item) => !boxCount || !p.boxes || c.box == null || p.boxes.includes(c.box);
  const base = items.filter((c) => inBoxes(c) && (!p.hideCreator || c.lastFromFan));
  const test: Record<Chip | Filter, (c: Item) => boolean> = {
    all: () => true,
    pinned: (c) => c.pinned,
    priority: (c) => c.needsReply && c.totalSpent >= BIG,
    unread: (c) => c.needsReply,
    tips: (c) => c.totalSpent > 0,
    unreadTips: (c) => c.needsReply && c.totalSpent > 0,
    fanLast: (c) => c.lastFromFan,
  };
  const count = (k: Chip) => base.filter(test[k]).length;
  const shownList = base.filter(test[chip]).filter(test[p.filter]).filter((c) => !list || list.fans.has(String(c.memberId)));

  const markRead = async (ids: string[]) => {
    await Promise.all(ids.map((id) => api("POST", `/api/conversations/${id}/action`, { action: "read" }).catch(() => {})));
    load();
  };
  const saveSplit = async (enabled: boolean, n: number) => {
    try {
      await api("PUT", `/api/models/${model.id}/boxes`, { enabled, count: n });
      toast(t("Inbox settings saved"));
      setPop(null);
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const chooseBoxes = (b: number[] | null) => {
    setPref({ boxes: b });
    if (b) api("POST", `/api/models/${model.id}/boxes`, { boxes: b }).catch(() => {});
  };

  return (
    <div className="relative flex w-[390px] shrink-0 flex-col" style={{ background: "var(--pro-page)" }}>
      {/* En-tête */}
      <div className="flex h-[52px] items-center justify-between border-b px-3" style={{ borderColor: "var(--pro-line)" }}>
        <h2 className="truncate text-[18px] font-semibold">{model.displayName}</h2>
        <div className="flex items-center gap-4">
          <a href="/app/analytics/creators" target="_blank" rel="noreferrer" title={t("Creator reports")}>
            <ChartNoAxesCombined className="size-5" />
          </a>
          <button onClick={() => setSearching((s) => !s)} title={t("Search")}>
            <Search className="size-5" />
          </button>
          <a href="/app/envoi" target="_blank" rel="noreferrer" title={t("New message")}>
            <Plus className="size-5" />
          </a>
        </div>
      </div>
      {searching ? (
        <label className="mx-3 mt-2 flex h-9 items-center gap-2 rounded-md border px-3" style={{ borderColor: "var(--pro-line)" }}>
          <Search className="size-4" style={{ color: "var(--of-muted)" }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search fans")} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          {q ? (
            <button onClick={() => setQ("")}>
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
      ) : null}

      <div className="grid grid-cols-2 gap-3 px-3 pt-3">
        <button onClick={() => setPop(pop === "online" ? null : "online")} className="flex h-8 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold text-white" style={{ background: BLUE }}>
          <UserRound className="size-4" /> {t("Online Fans")}
        </button>
        <button onClick={() => setPop(pop === "notif" ? null : "notif")} className="relative flex h-8 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold text-white" style={{ background: GREEN }}>
          <Bell className="size-4" /> {t("Notifications")}
          {notif ? (
            <span className="absolute -top-2.5 -right-2 grid size-6 place-items-center rounded-full text-[12px] ring-2" style={{ background: GREEN, ["--tw-ring-color" as string]: "var(--pro-page)" }}>
              {notif}
            </span>
          ) : null}
        </button>
      </div>
      {pop === "online" ? (
        <Pop onClose={() => setPop(null)} className="left-2 w-[480px] max-w-[92vw] p-0">
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--pro-line)" }}>
            <h3 className="text-[15px] font-semibold">{t("Online fans")}</h3>
            <button onClick={load} title={t("Refresh")}>
              <RefreshCw className="size-4" />
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => setOnline(!online)} className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px]" style={{ background: "var(--pro-chip)", color: BLUE }}>
              <ListFilter className="size-3.5" /> {t(online ? "Online in list" : "All fans")}
            </button>
            <a href="/app/envoi" target="_blank" rel="noreferrer" className="rounded-md px-4 py-2 text-[13px] font-semibold text-white" style={{ background: BLUE }}>
              {t("Message all online fans")}
            </a>
          </div>
          <div className="of-scroll max-h-[420px] overflow-y-auto pb-2">
            {items.filter((c) => c.lastSeenAt && Date.now() - Date.parse(c.lastSeenAt) < 15 * 60_000).map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                <span className="relative grid size-7 place-items-center rounded-full text-[11px]" style={{ background: "var(--pro-chip)", color: BLUE }}>
                  {(c.nickname || c.memberName || "?").slice(0, 2)}
                  <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full" style={{ background: GREEN }} />
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{c.nickname || c.memberName}</span>
                <span className="w-20">${Math.round(c.totalSpent / 100)}</span>
                <button onClick={() => (setPop(null), onOpen(c))} style={{ color: BLUE }} title={t("Open conversation")}>
                  <MessageSquareText className="size-4" />
                </button>
              </div>
            ))}
            {!items.some((c) => c.lastSeenAt && Date.now() - Date.parse(c.lastSeenAt) < 15 * 60_000) ? (
              <p className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--of-muted)" }}>{t("No fan online right now")}</p>
            ) : null}
          </div>
        </Pop>
      ) : null}
      {pop === "lists" ? (
        <ListsPop
          modelId={model.id}
          value={p.lists}
          onSave={(l) => (setPref({ lists: l }), setPop(null))}
          onClose={() => setPop(null)}
          t={t}
        />
      ) : null}
      {pop === "notif" ? (
        <ProNotifications
          modelId={model.id}
          onClose={() => setPop(null)}
          onOpenConv={(id) => {
            setPop(null);
            const c = items.find((x) => x.id === id);
            if (c) onOpen(c);
            else api<{ conversation: Conv }>("GET", `/api/conversations/${id}`).then((r) => onOpen(r.conversation)).catch((e) => toast((e as Error).message, "err"));
          }}
          t={t}
        />
      ) : null}

      {/* Boîtes, réglages, tri */}
      <div className="relative flex items-center gap-2 px-3 pt-2.5">
        <button onClick={() => setPop(pop === "boxes" ? null : "boxes")} className="flex h-9 w-[150px] items-center gap-2 rounded-md border px-2.5 text-[14px]" style={{ borderColor: "var(--pro-line)" }}>
          <InboxIcon className="size-4" />
          <span className="truncate">{!boxCount || !p.boxes || p.boxes.length === boxCount ? t("All inboxes") : p.boxes.map((b) => `${t("Inbox")} ${b}`).join(", ")}</span>
        </button>
        <button onClick={() => setPop(pop === "split" ? null : "split")} title={t("Split inbox")} className="grid size-9 place-items-center rounded-md border" style={{ borderColor: "var(--pro-line)" }}>
          <Settings className="size-4" />
        </button>
        <span className="flex-1 text-center text-[14px]">{t(p.order === "newest" ? "Newest first" : "Oldest first")}</span>
        <button onClick={() => setPop(pop === "more" ? null : "more")} title={t("More")} className="grid size-8 place-items-center rounded-md" style={pop === "more" ? { outline: `1px solid ${BLUE}` } : undefined}>
          <ListFilter className="size-4" />
        </button>
        <button onClick={load} title={t("Refresh")} className="grid size-8 place-items-center">
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
        </button>

        {pop === "boxes" ? (
          <Pop onClose={() => setPop(null)} className="left-3 w-[200px]">
            {!boxCount ? (
              <p className="px-3 py-2 text-[13px]" style={{ color: "var(--of-muted)" }}>{t("Inbox is not split")}</p>
            ) : (
              <>
                <BoxRow on={!p.boxes || p.boxes.length === boxCount} label={t("All inboxes")} onClick={() => chooseBoxes(null)} />
                <div className="my-1 border-t" style={{ borderColor: "var(--pro-line)" }} />
                {Array.from({ length: boxCount }, (_, i) => i + 1).map((b) => {
                  const on = !p.boxes || p.boxes.includes(b);
                  return (
                    <BoxRow
                      key={b}
                      on={on}
                      label={`${t("Inbox")} ${b} ${t("of")} ${boxCount}`}
                      onClick={() => {
                        const cur = p.boxes ?? Array.from({ length: boxCount }, (_, i) => i + 1);
                        const next = on ? cur.filter((x) => x !== b) : [...cur, b].sort((x, y) => x - y);
                        if (next.length) chooseBoxes(next.length === boxCount ? null : next);
                      }}
                    />
                  );
                })}
              </>
            )}
          </Pop>
        ) : null}
        {pop === "split" ? <SplitPop count={boxCount} admin={me.admin} onSave={saveSplit} onClose={() => setPop(null)} t={t} /> : null}
        {pop === "more" ? (
          <Pop onClose={() => setPop(null)} className="right-3 w-[245px] py-2">
            {(
              [
                ["all", "All"],
                ["priority", "Priority"],
                ["unread", "Unread"],
                ["unreadTips", "Unread with tips"],
                ["fanLast", "Last message sent by fan"],
              ] as const
            ).map(([k, l]) => (
              <Radio key={k} on={p.filter === k} label={t(l)} onClick={() => setPref({ filter: k })} />
            ))}
            <Sep />
            <Radio on={p.order === "newest"} label={t("Newest first")} onClick={() => setPref({ order: "newest" })} />
            <div className="mx-3 my-1 rounded-md px-3 py-2.5" style={{ background: "var(--pro-chip)" }}>
              <div className="flex items-center justify-between text-[14px] font-semibold">
                {t("Focus mode")}
                <Toggle on={p.focus} set={(v) => setPref({ focus: v })} />
              </div>
              <p className="text-[12px]" style={{ color: "var(--of-muted)" }}>{t("Pause incoming messages")}</p>
            </div>
            <Radio on={p.order === "oldest"} label={t("Oldest first")} onClick={() => setPref({ order: "oldest" })} />
            <Sep />
            <Check2 on={p.hideMuted} label={t("Hide chats with muted notifications")} onClick={() => setPref({ hideMuted: !p.hideMuted })} />
            <Check2 on={p.hideCreator} label={t("Hide chats with creators")} onClick={() => setPref({ hideCreator: !p.hideCreator })} />
            <Sep />
            <button onClick={() => (setPop(null), markRead(shownList.filter((c) => c.unread || c.fresh || c.needsReply).map((c) => c.id)))} className="block w-full px-4 py-2 text-left text-[14px] font-semibold">
              {t("Mark all as read")}
            </button>
            <Sep />
            <button onClick={() => (setPop(null), setSelect(new Set()))} className="block w-full px-4 py-2 text-left text-[14px] font-semibold">
              {t("Select")}
            </button>
          </Pop>
        ) : null}
      </div>

      {/* Puces */}
      <div className="of-scroll flex gap-2 overflow-x-auto px-3 pt-4 pb-2">
        {(
          [
            ["all", "All"],
            ["pinned", "Pinned"],
            ["priority", "Priority"],
            ["unread", "Unread"],
            ["tips", "With Tips"],
          ] as const
        ).map(([k, l]) => {
          const n = k === "all" || k === "tips" ? 0 : count(k);
          return (
            <button key={k} onClick={() => setChip(k)} className="relative shrink-0 rounded-full px-3.5 py-1 text-[14px] whitespace-nowrap" style={chip === k ? { background: BLUE, color: "#fff" } : { background: "var(--pro-chip)" }}>
              {t(l)}
              {n ? (
                <span className="absolute -top-2 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold text-white" style={{ background: RED }}>
                  {n > 99 ? "99+" : n}
                </span>
              ) : null}
            </button>
          );
        })}
        {p.lists.map((l) => (
          <button key={l.id} onClick={() => pickList(l.id)} className="shrink-0 rounded-full px-3.5 py-1 text-[14px] whitespace-nowrap" style={list?.id === l.id ? { background: BLUE, color: "#fff" } : { background: "var(--pro-chip)" }}>
            {l.name}
          </button>
        ))}
        <button onClick={() => setPop("lists")} title={t("Pinned lists")} className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: "var(--pro-chip)" }}>
          <Pencil className="size-3.5" />
        </button>
      </div>

      {select ? (
        <div className="mx-3 mb-1 flex items-center justify-between rounded-md px-3 py-1.5 text-[13px]" style={{ background: "var(--pro-chip)" }}>
          <span>
            {select.size} {t("selected")}
          </span>
          <span className="flex gap-3">
            <button disabled={!select.size} onClick={() => (markRead([...select]), setSelect(null))} style={{ color: BLUE }} className="disabled:opacity-40">
              {t("Mark as read")}
            </button>
            <button onClick={() => setSelect(null)}>{t("Cancel")}</button>
          </span>
        </div>
      ) : null}

      {/* Conversations */}
      <div className="of-scroll min-h-0 flex-1 overflow-y-auto">
        {shownList.map((c) => (
          <Row
            key={c.id}
            c={c}
            on={c.id === selected}
            selecting={!!select}
            picked={!!select?.has(c.id)}
            onClick={() => {
              if (select) return setSelect((s) => (s ? (s.has(c.id) ? (s.delete(c.id), new Set(s)) : new Set(s.add(c.id))) : s));
              onOpen(c);
            }}
            onDismiss={() => markRead([c.id])}
            t={t}
          />
        ))}
        {data && !shownList.length ? <p className="px-4 py-10 text-center text-[14px]" style={{ color: "var(--of-muted)" }}>{t("No conversation")}</p> : null}
      </div>
    </div>
  );
}

function Row({ c, on, onClick, onDismiss, selecting, picked, t }: { c: Item; on: boolean; onClick: () => void; onDismiss: () => void; selecting: boolean; picked: boolean; t: (s: string) => string }) {
  const isNew = !!c.subscribedAt && Date.now() - Date.parse(c.subscribedAt) < 3 * DAY;
  const fire = c.totalSpent >= 10000;
  const name = c.nickname || c.memberName || "Fan";
  const user = c.memberUsername ? `@${c.memberUsername}` : c.memberId ? `@u${c.memberId}` : "";
  const time = (() => {
    if (!c.lastMessageAt) return "";
    const d = new Date(c.lastMessageAt);
    const today = new Date().toDateString() === d.toDateString();
    return today ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase() : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  })();
  const waiting = c.needsReply;
  return (
    <div onClick={onClick} className="group relative flex cursor-pointer gap-3 px-3 pt-3 pb-3" style={{ background: on ? "var(--pro-on)" : undefined }}>
      {c.box != null ? (
        <span className="absolute top-1 left-1 flex items-center gap-0.5 rounded-sm px-1 text-[11px]" style={{ background: "var(--pro-chip)" }}>
          <InboxIcon className="size-3" /> {c.box}
        </span>
      ) : null}
      <div className="relative mt-3 flex w-10 shrink-0 flex-col items-center">
        {selecting ? (
          <span className="absolute -left-1 top-2 z-10 grid size-4 place-items-center rounded border" style={{ borderColor: BLUE, background: picked ? BLUE : "transparent" }}>
            {picked ? <Check className="size-3 text-white" /> : null}
          </span>
        ) : null}
        <span className="relative grid size-10 place-items-center overflow-hidden rounded-full text-[12px] font-bold text-white" style={{ background: isNew ? GREEN : fire ? "#f7a14a" : "#6b6b6b" }}>
          {isNew ? "NEW" : fire ? <Flame className="size-5" /> : c.memberAvatar ? <img src={c.memberAvatar} alt="" className="size-full object-cover" /> : <UserRound className="size-6" />}
        </span>
        <span className="absolute top-7 -right-0.5 size-2.5 rounded-full border-2" style={{ background: c.lastSeenAt && Date.now() - Date.parse(c.lastSeenAt) < 15 * 60_000 ? GREEN : "transparent", borderColor: c.lastSeenAt && Date.now() - Date.parse(c.lastSeenAt) < 15 * 60_000 ? "var(--pro-page)" : "transparent" }} />
        <span className="mt-1.5 rounded-sm px-1 text-[11px] font-bold" style={{ background: "#3a2a1a", color: "#f7a14a" }}>
          ${Math.round(c.totalSpent / 100)}
        </span>
      </div>
      <div className="min-w-0 flex-1 border-b pb-3" style={{ borderColor: "var(--pro-line)" }}>
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[15px]">
            <b>{name}</b> <span style={{ color: "var(--of-muted)" }}>{user}</span>
          </p>
          <button onClick={(e) => (e.stopPropagation(), onDismiss())} title={t("Mark as read")} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="size-3.5" />
          </button>
        </div>
        <div className="flex h-4 items-center gap-1 text-[10px] font-bold" style={{ color: GREEN }}>
          {isNew ? "NEW" : null}
          {fire ? <Flame className="size-3" style={{ color: "#f7a14a" }} /> : null}
          {c.pinned ? <span style={{ color: BLUE }}>📌</span> : null}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[14px]" style={waiting ? { fontWeight: 700 } : { color: "var(--of-muted)" }}>
            {c.preview || "media attachment"}
          </p>
          <span className="flex shrink-0 items-center gap-1.5 text-[13px]" style={{ color: waiting ? RED : "var(--of-muted)" }}>
            {time}
            {waiting ? <span className="size-2 rounded-full" style={{ background: RED }} /> : null}
          </span>
        </div>
      </div>
    </div>
  );
}

function Pop({ children, onClose, className }: { children: React.ReactNode; onClose: () => void; className?: string }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className={`absolute top-12 z-50 rounded-lg border shadow-2xl ${className ?? ""}`} style={{ background: "var(--pro-pop)", borderColor: "var(--pro-line)" }}>
        {children}
      </div>
    </>
  );
}
const Sep = () => <div className="my-1.5 border-t" style={{ borderColor: "var(--pro-line)" }} />;
function Radio({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left text-[14px]" style={on ? { color: BLUE } : undefined}>
      <span className="grid size-4 place-items-center rounded-full border" style={{ borderColor: on ? BLUE : "var(--of-muted)" }}>
        {on ? <span className="size-2 rounded-full" style={{ background: BLUE }} /> : null}
      </span>
      {label}
    </button>
  );
}
function Check2({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 px-4 py-1.5 text-left text-[14px]">
      <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded border" style={{ borderColor: on ? BLUE : "var(--of-muted)", background: on ? BLUE : "transparent" }}>
        {on ? <Check className="size-3 text-white" /> : null}
      </span>
      {label}
    </button>
  );
}
function BoxRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[14px]" style={{ color: on ? BLUE : undefined }}>
      <span className="grid size-4 place-items-center rounded-full" style={{ background: on ? BLUE : "transparent", border: on ? undefined : "1px solid var(--of-muted)" }}>
        {on ? <Check className="size-3 text-white" /> : null}
      </span>
      {label}
    </button>
  );
}
export function Toggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => set(!on)} className="relative h-6 w-11 rounded-full transition-colors" style={{ background: on ? BLUE : "#555" }}>
      <span className="absolute top-0.5 size-5 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} />
    </button>
  );
}

function SplitPop({ count, admin, onSave, onClose, t }: { count: number; admin: boolean; onSave: (on: boolean, n: number) => void; onClose: () => void; t: (s: string) => string }) {
  const [on, setOn] = useState(count > 0);
  const [n, setN] = useState(String(count || 2));
  const num = Math.min(9, Math.max(2, Number(n) || 2));
  const changed = on !== count > 0 || (on && num !== count);
  return (
    <Pop onClose={onClose} className="left-3 w-[300px] p-4">
      <div className="flex items-center justify-between text-[15px] font-semibold">
        {t("Split inbox")}
        <Toggle on={on} set={setOn} />
      </div>
      {on ? (
        <>
          <div className="mt-4 flex items-center justify-between text-[14px]">
            {t("Number of inboxes")}
            <input value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 1))} className="h-9 w-16 rounded-md border bg-transparent px-2.5 outline-none" style={{ borderColor: "var(--pro-line)" }} />
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--of-muted)" }}>{t("Max. number of split inboxes is 9")}</p>
        </>
      ) : null}
      {!admin ? <p className="mt-3 text-[12px]" style={{ color: "var(--of-muted)" }}>{t("Only team leaders, managers and admins can change this.")}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button disabled={!changed || !admin} onClick={() => onSave(on, num)} className="h-10 rounded-md text-[14px] font-semibold disabled:opacity-40" style={{ background: changed && admin ? BLUE : "var(--pro-chip)", color: "#fff" }}>
          {t("Save")}
        </button>
        <button onClick={onClose} className="h-10 rounded-md border text-[14px]" style={{ borderColor: "var(--pro-line)" }}>
          {t("Cancel")}
        </button>
      </div>
    </Pop>
  );
}

/** « Pinned lists » : listes OnlyFans de la créatrice à afficher en puces. */
function ListsPop({ modelId, value, onSave, onClose, t }: { modelId: string; value: { id: string; name: string }[]; onSave: (l: { id: string; name: string }[]) => void; onClose: () => void; t: (s: string) => string }) {
  const [lists, setLists] = useState<OfList[] | null>(null);
  const [sel, setSel] = useState(() => new Map(value.map((l) => [l.id, l.name])));
  const load = () =>
    fetch(`/api/fan-lists?creatorId=${encodeURIComponent(modelId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((l: OfList[]) => setLists(Array.isArray(l) ? l : []))
      .catch(() => setLists([]));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-[500px] flex-col rounded-xl" style={{ background: "var(--pro-pop)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--pro-line)" }}>
          <h3 className="text-[15px] font-semibold">{t("Pinned lists")}</h3>
          <button onClick={load} title={t("Refresh")}>
            <RefreshCw className="size-4" />
          </button>
        </div>
        <div className="of-scroll min-h-0 flex-1 overflow-y-auto p-3">
          {lists === null ? <p className="py-6 text-center text-[13px]" style={{ color: "var(--of-muted)" }}>{t("Loading…")}</p> : null}
          {lists?.map((l) => {
            const on = sel.has(l.id);
            return (
              <button
                key={l.id}
                onClick={() => setSel((m) => (on ? (m.delete(l.id), new Map(m)) : new Map(m.set(l.id, l.name))))}
                className="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
                style={{ background: on ? "var(--pro-on)" : "var(--pro-panel)" }}
              >
                <span className="grid size-4 place-items-center rounded-full border" style={{ borderColor: on ? BLUE : "var(--of-muted)", background: on ? BLUE : "transparent" }}>
                  {on ? <Check className="size-3 text-white" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{l.name}</span>
                  <span className="text-[12px]" style={{ color: "var(--of-muted)" }}>{l.fans.toLocaleString("en-US")} {t("users")}</span>
                </span>
              </button>
            );
          })}
          {lists && !lists.length ? <p className="py-6 text-center text-[13px]" style={{ color: "var(--of-muted)" }}>{t("No list")}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: "var(--pro-line)" }}>
          <button onClick={onClose} className="h-9 rounded-md border px-4 text-[14px]" style={{ borderColor: "var(--pro-line)" }}>{t("Cancel")}</button>
          <button onClick={() => onSave([...sel.entries()].map(([id, name]) => ({ id, name })))} className="h-9 rounded-md px-4 text-[14px] text-white" style={{ background: BLUE }}>{t("Save")}</button>
        </div>
      </div>
    </div>
  );
}
