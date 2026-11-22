"use client";

import { useEffect, useState } from "react";
import { MessageSquareText, RefreshCw, Smile } from "lucide-react";
import { api, toast } from "@/rv/lib/client";
import { curOf, money } from "@/rv/lib/fmt";

// Notifications de Messages Pro (bouton vert d'Infloww) : abonnements, pourboires, achats ; réponse rapide au fan.
type Item = { id: string; at: string; kind: "sale" | "tip" | "newsub" | "sub" | "other"; amount: number | null; modelId: string; fan: string | null; convId: string | null; chatter: string | null };
type Tab = "subs" | "tips" | "sales" | "of";
const BLUE = "#2f6bff";
const GREEN = "#2ec4a6";
const seenKey = (cid: string) => `bloom.pro.seen.${cid}`;
const lastSeen = (cid: string) => {
  try {
    return Number(localStorage.getItem(seenKey(cid))) || Date.now() - 864e5;
  } catch {
    return Date.now() - 864e5;
  }
};
const tabOf = (k: Item["kind"]): Tab | null => (k === "sub" || k === "newsub" ? "subs" : k === "tip" ? "tips" : k === "sale" ? "sales" : null);

/** Notifications pas encore vues (pastille verte) d'une créatrice. */
export async function notifCount(cid: string) {
  try {
    const r = await api<{ items: Item[] }>("GET", `/api/notifications?model=${encodeURIComponent(cid)}`);
    const since = lastSeen(cid);
    return r.items.filter((i) => tabOf(i.kind) && Date.parse(i.at) > since).length;
  } catch {
    return 0;
  }
}

export function ProNotifications({ modelId, onOpenConv, onClose, t }: { modelId: string; onOpenConv: (convId: string) => void; onClose: () => void; t: (s: string) => string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [tab, setTab] = useState<Tab>("subs");
  const [since] = useState(() => lastSeen(modelId));
  const [replied, setReplied] = useState<Record<string, boolean>>({});
  const load = () =>
    api<{ items: Item[] }>("GET", `/api/notifications?model=${encodeURIComponent(modelId)}`)
      .then((r) => setItems(r.items))
      .catch((e) => toast((e as Error).message, "err"));
  useEffect(() => {
    load();
    try {
      localStorage.setItem(seenKey(modelId), String(Date.now()));
    } catch {}
    window.dispatchEvent(new Event("pro-notif-seen"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);
  const unseen = (k: Tab) => (items ?? []).filter((i) => tabOf(i.kind) === k && Date.parse(i.at) > since).length;
  const list = (items ?? []).filter((i) => tabOf(i.kind) === tab);
  const text = (i: Item) =>
    i.kind === "tip" ? (
      <>{t("paid you a tip of")} {money(i.amount ?? 0, 2, curOf(i.modelId))}</>
    ) : i.kind === "sale" ? (
      <>
        {t("has purchased your")} <span style={{ color: BLUE }}>{t("message")}</span> {t("for")} {money(i.amount ?? 0, 2, curOf(i.modelId))}!
      </>
    ) : (
      <>{t("subscribed to your profile!")}</>
    );
  const date = (s: string) => {
    const d = new Date(s);
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).replace(" ", ". ")} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  };
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div className="absolute top-12 left-2 z-50 flex max-h-[720px] w-[560px] max-w-[92vw] flex-col rounded-lg border shadow-2xl" style={{ background: "var(--pro-pop)", borderColor: "var(--pro-line)" }}>
        <div className="flex items-center justify-between px-4 pt-4">
          <h3 className="text-[16px] font-semibold">{t("Notifications")}</h3>
          <button onClick={load} title={t("Refresh")}>
            <RefreshCw className="size-4" />
          </button>
        </div>
        <div className="flex gap-2 border-b px-4 py-3" style={{ borderColor: "var(--pro-line)" }}>
          {(
            [
              ["subs", "Subscriptions"],
              ["tips", "Tips"],
              ["sales", "Purchases"],
              ["of", "OnlyFans"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className="relative rounded-full px-4 py-1.5 text-[14px]" style={tab === k ? { background: BLUE, color: "#fff" } : { background: "var(--pro-chip)" }}>
              {t(l)}
              {k !== "of" && unseen(k) ? (
                <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full text-[11px] font-semibold text-white ring-2" style={{ background: GREEN, ["--tw-ring-color" as string]: "var(--pro-pop)" }}>
                  {unseen(k)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="of-scroll min-h-0 flex-1 overflow-y-auto px-4">
          {items === null ? <p className="py-8 text-center text-[13px]" style={{ color: "var(--of-muted)" }}>{t("Loading…")}</p> : null}
          {items && !list.length ? <p className="py-8 text-center text-[13px]" style={{ color: "var(--of-muted)" }}>{t("No notifications")}</p> : null}
          {list.map((i) => (
            <div key={i.id} className="border-b py-4" style={{ borderColor: "var(--pro-line)" }}>
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full text-[14px] font-semibold" style={{ background: "var(--pro-chip)", color: BLUE }}>
                  {(i.fan || "?").slice(0, 2).toUpperCase().replace(/[^A-Z0-9]/g, "") || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">{i.fan || "Fan"}</p>
                  <p className="text-[14px]">{text(i)}</p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--of-muted)" }}>{date(i.at)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 pl-[52px]">
                {i.chatter || replied[i.id] ? (
                  <p className="flex-1 text-[14px]">
                    <span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: "var(--of-muted)" }} />
                    {replied[i.id] ? t("You") : i.chatter} <span style={{ color: "var(--of-muted)" }}>{t("responded to the notification")}</span>
                  </p>
                ) : i.convId ? (
                  <QuickReply convId={i.convId} onDone={() => setReplied((r) => ({ ...r, [i.id]: true }))} t={t} />
                ) : (
                  <span className="flex-1" />
                )}
                {i.convId ? (
                  <button onClick={() => onOpenConv(i.convId!)} title={t("Open conversation")} className="grid size-8 shrink-0 place-items-center rounded-md border" style={{ borderColor: BLUE, color: BLUE }}>
                    <MessageSquareText className="size-4" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function QuickReply({ convId, onDone, t }: { convId: string; onDone: () => void; t: (s: string) => string }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!v.trim() || busy) return;
    setBusy(true);
    try {
      await api("POST", `/api/conversations/${convId}/send`, { content: v.trim() });
      toast(t("Sent"));
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex flex-1 items-center gap-2">
      <label className="flex h-8 flex-1 items-center gap-2 rounded-md border px-2.5" style={{ borderColor: "var(--pro-line)" }}>
        <Smile className="size-4" style={{ color: "var(--of-muted)" }} />
        <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("Quick reply")} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
      </label>
      <button onClick={send} disabled={!v.trim() || busy} className="h-8 rounded-md px-5 text-[13px] text-white disabled:opacity-40" style={{ background: v.trim() ? BLUE : "var(--pro-chip)" }}>
        {t("Reply")}
      </button>
    </span>
  );
}
