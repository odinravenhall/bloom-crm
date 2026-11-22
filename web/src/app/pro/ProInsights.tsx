"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronUp, Eye, GripVertical, Info, Lock, MapPin, NotebookText, Pencil, Settings, Tags, TriangleAlert, X } from "lucide-react";
import { api, mediaThumb, toast } from "@/rv/lib/client";
import { money } from "@/rv/lib/fmt";
import type { Conv, LiveMsg } from "@/rv/inbox/types";

// « Fan insights » de Messages Pro (Infloww) : onglets Insights (dépenses, abonnement, profil, listes, notes du fan),
// Sales (PPV timeline avec « Copy as draft » et le graphique) et Notes (fiche de la créatrice).
type Fan = {
  stats: { firstSubscriptionAt?: string; totalSpent?: number; tipsTotal?: number; lastPaidAt?: string; subscriptionExpireAt?: string; autoRenew?: boolean };
  profile: { notes: string };
  lists?: string[];
  subscriptionPrice?: number | null;
};
const BLUE = "#2f6bff";
const GREEN = "#2ec4a6";
const ago = (iso?: string) => {
  if (!iso) return "–";
  const d = (Date.now() - Date.parse(iso)) / 864e5;
  return d < 1 ? `${Math.max(1, Math.round(d * 24))}h` : d < 30 ? `${Math.round(d)}d` : `${Math.round(d / 30)}mo`;
};

export function ProInsights({ conv, tab, setTab, t }: { conv: Conv; tab: "insights" | "sales" | "notes"; setTab: (t: "insights" | "sales" | "notes") => void; t: (s: string) => string }) {
  const [fan, setFan] = useState<Fan | null>(null);
  const [msgs, setMsgs] = useState<LiveMsg[]>([]);
  useEffect(() => {
    api<Fan>("GET", `/api/conversations/${conv.id}/fan`).then(setFan).catch(() => {});
  }, [conv.id]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ convId: string; msgs: LiveMsg[] }>).detail;
      if (d.convId === conv.id) setMsgs(d.msgs);
    };
    window.addEventListener("pro-msgs", on);
    return () => window.removeEventListener("pro-msgs", on);
  }, [conv.id]);
  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-l" style={{ borderColor: "var(--pro-line)", background: "var(--pro-page)" }}>
      <div className="of-scroll min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "insights" ? <Insights conv={conv} fan={fan} reload={() => api<Fan>("GET", `/api/conversations/${conv.id}/fan`).then(setFan).catch(() => {})} t={t} /> : tab === "sales" ? <Sales conv={conv} msgs={msgs} t={t} /> : <CreatorNotes modelId={conv.modelId} t={t} />}
      </div>
      <div className="grid grid-cols-3 gap-1 p-2">
        {(
          [
            ["insights", "Insights", Eye],
            ["sales", "Sales", Tags],
            ["notes", "Notes", NotebookText],
          ] as const
        ).map(([k, l, I]) => (
          <button key={k} onClick={() => setTab(k)} className="flex flex-col items-center gap-0.5 rounded-lg py-2 text-[12px] font-semibold" style={tab === k ? { background: "var(--pro-panel)" } : { color: "var(--of-muted)" }}>
            <I className="size-5" /> {t(l)}
          </button>
        ))}
      </div>
    </aside>
  );
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-3 rounded-xl p-3" style={{ background: "var(--pro-panel)" }}>
      <div className="flex items-center gap-1.5">
        <GripVertical className="size-4" style={{ color: "var(--of-muted)" }} />
        <h4 className="flex-1 text-[15px] font-semibold">{title}</h4>
        {action}
        <button onClick={() => setOpen(!open)}>
          <ChevronUp className={`size-4 transition-transform ${open ? "" : "rotate-180"}`} />
        </button>
      </div>
      {open ? <div className="mt-2.5 text-[13px]">{children}</div> : null}
    </div>
  );
}
const Row = ({ k, v, color }: { k: React.ReactNode; v: React.ReactNode; color?: string }) => (
  <p className="flex items-center justify-between py-1">
    <span style={{ color: "var(--of-muted)" }}>{k}</span>
    <span className="font-semibold" style={color ? { color } : undefined}>{v}</span>
  </p>
);

function Insights({ conv, fan, reload, t }: { conv: Conv; fan: Fan | null; reload: () => void; t: (s: string) => string }) {
  const s = fan?.stats ?? {};
  const total = s.totalSpent ?? conv.totalSpent;
  const tips = s.tipsTotal ?? 0;
  const ppv = Math.max(0, total - tips);
  const expired = s.subscriptionExpireAt ? Date.parse(s.subscriptionExpireAt) < Date.now() : false;
  const days = s.firstSubscriptionAt || conv.subscribedAt ? Math.max(1, Math.round((Date.now() - Date.parse((s.firstSubscriptionAt || conv.subscribedAt)!)) / 864e5)) : null;
  const power = total <= 0 ? t("Insufficient data") : total < 5000 ? t("Low") : total < 30000 ? t("Medium") : t("High");
  return (
    <>
      <h3 className="mb-3 text-[15px] font-semibold">{t("Fan insights")}</h3>
      <Card title={t("Spending behavior")}>
        <div className="grid grid-cols-2 border-b pb-2" style={{ borderColor: "var(--pro-line)" }}>
          <div>
            <p style={{ color: "var(--of-muted)" }}>{t("Total spend")}</p>
            <p className="text-[20px] font-bold">{money(total, 0)}</p>
          </div>
          <div className="border-l pl-3" style={{ borderColor: "var(--pro-line)" }}>
            <p style={{ color: "var(--of-muted)" }}>{t("Last spend")}</p>
            <p className="font-semibold">{ago(s.lastPaidAt)} {t("ago")}</p>
          </div>
        </div>
        <Row k="PPV" v={<span className="text-right">{money(ppv, 0)} <span className="font-normal" style={{ color: "var(--of-muted)" }}>{t("Total")}</span></span>} />
        <Row k="Tip" v={<span>{money(tips, 0)} <span className="font-normal" style={{ color: "var(--of-muted)" }}>{t("Total")}</span></span>} />
        <Row k={t("Highest spend")} v="-" />
      </Card>
      <Card title={t("Organization metrics")}>
        <Row k={<span className="flex items-center gap-1">{t("Spending power")} <Info className="size-3.5" /></span>} v={power} />
        <Row k={t("Chargeback risk")} v={<span className="flex items-center gap-1 rounded-full px-2 text-[11px] text-white" style={{ background: "#3d9a3d" }}><TriangleAlert className="size-3" /> {t("Low")}</span>} />
      </Card>
      <Card title={t("Subscription")}>
        <Row k={t("Status")} v={t(expired ? "Expired" : "Active")} color={expired ? "#f26b6b" : GREEN} />
        <Row k={t("Cost")} v={fan?.subscriptionPrice ? money(Math.round(Number(fan.subscriptionPrice) * 100)) : t("free")} />
        <Row k={t("Duration")} v={days ? `${days} ${t(days === 1 ? "day" : "days")}` : "-"} />
        <Row k={t("Auto-renewal")} v={s.autoRenew === undefined ? "-" : t(s.autoRenew ? "On" : "Off")} />
      </Card>
      <Card title={t("Profile")}>
        <Row k={<span className="flex items-center gap-1">{t("Nickname")} <Info className="size-3.5" /></span>} v={<span className="flex items-center gap-1.5">{conv.nickname || "-"} <Pencil className="size-3.5" /></span>} />
        <Row k={t("Birthday")} v={<span className="font-normal" style={{ color: "var(--of-muted)" }}>{t("Select date")}</span>} />
        <p className="flex items-center gap-2 py-1"><MapPin className="size-4" style={{ color: "var(--of-muted)" }} /> <span className="flex-1 rounded px-2 py-0.5" style={{ background: "var(--pro-chip)" }}>{t("Unknown")}</span></p>
        <Row k={t("Local time")} v={t("Unknown")} />
        <Row k={t("Source")} v="OnlyFans" />
      </Card>
      <Card title={t("Lists")} action={<a href="/app/listes" target="_blank" rel="noreferrer" title={t("Lists")}><Settings className="size-4" /></a>}>
        {fan?.lists?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {fan.lists.map((l) => (
              <span key={l} className="rounded-full px-2 py-0.5 text-[12px]" style={{ background: "var(--pro-chip)" }}>{l}</span>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--of-muted)" }}>{t("No list")}</p>
        )}
      </Card>
      <FanNotes conv={conv} initial={fan?.profile.notes ?? null} onSaved={reload} t={t} />
    </>
  );
}

/** Notes du fan, avec modèle par défaut de la créatrice (« Edit default notes »). */
function FanNotes({ conv, initial, onSaved, t }: { conv: Conv; initial: string | null; onSaved: () => void; t: (s: string) => string }) {
  const [v, setV] = useState("");
  const [def, setDef] = useState("");
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    api<{ text: string }>("GET", `/api/pro/default-notes?creatorId=${encodeURIComponent(conv.modelId)}`).then((r) => setDef(r.text)).catch(() => {});
  }, [conv.modelId]);
  useEffect(() => {
    if (initial !== null) setV(initial || def);
  }, [initial, def]);
  const save = async () => {
    if (v === (initial || def)) return;
    try {
      await api("PUT", `/api/conversations/${conv.id}/fan`, { profile: { notes: v } });
      onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <>
      <Card title={t("Notes")} action={<button onClick={() => setEdit(true)} title={t("Edit default notes")}><Settings className="size-4" /></button>}>
        <textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={save} rows={12} placeholder={t("Notes about this fan")} className="w-full resize-y rounded-md p-2 text-[13px] outline-none" style={{ background: "var(--pro-page)" }} />
      </Card>
      {edit ? <DefaultNotes modelId={conv.modelId} value={def} onClose={() => setEdit(false)} onSaved={(x) => (setDef(x), setEdit(false))} t={t} /> : null}
    </>
  );
}

function DefaultNotes({ modelId, value, onClose, onSaved, t }: { modelId: string; value: string; onClose: () => void; onSaved: (v: string) => void; t: (s: string) => string }) {
  const [v, setV] = useState(value);
  const done = async () => {
    try {
      await api("PUT", "/api/pro/default-notes", { creatorId: modelId, text: v });
      onSaved(v);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[620px] rounded-xl p-5" style={{ background: "#151515", color: "#fff" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[22px] font-semibold">{t("Edit default notes")}</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-md" style={{ background: "#2a2a2a" }}>
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-3 text-[13px]" style={{ color: "#aaa" }}>{t("Changes apply only to notes that haven't been manually edited by any user.")}</p>
        <textarea value={v} onChange={(e) => setV(e.target.value)} rows={8} className="mt-3 w-full resize-none rounded-md p-3 text-[14px] outline-none" style={{ background: "#232323" }} />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2" style={{ background: "#2a2a2a" }}>{t("Cancel")}</button>
          <button onClick={done} className="rounded-lg px-4 py-2 text-white" style={{ background: "#f28c5b" }}>{t("Done")}</button>
        </div>
      </div>
    </div>
  );
}

/** PPV timeline (messages chargés dans la conversation) : taux d'achat, prix haut / bas, Copy as draft, graphique. */
function Sales({ conv, msgs, t }: { conv: Conv; msgs: LiveMsg[]; t: (s: string) => string }) {
  const [chart, setChart] = useState(false);
  const ppv = useMemo(() => msgs.filter((m) => !m.authorMessage?.memberId && m.bundleWithMedias?.bundle.price).reverse(), [msgs]);
  const paid = ppv.filter((m) => m.bundleWithMedias!.bundle.isPaid).length;
  const prices = ppv.map((m) => m.bundleWithMedias!.bundle.price);
  const copy = (m: LiveMsg) => {
    window.dispatchEvent(new CustomEvent("pro-draft", { detail: { convId: conv.id, medias: m.bundleWithMedias?.medias ?? [], price: m.bundleWithMedias?.bundle.price ?? 0, text: m.message.content } }));
    toast(t("Copied as draft"));
  };
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">{t("PPV timeline")}</h3>
        <button onClick={() => setChart(true)} disabled={!ppv.length} className="rounded px-2 py-1 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: "#f28c5b" }}>{t("See chart")}</button>
      </div>
      <p className="text-[14px] font-semibold">{t("Buy rate")}: {paid}/{ppv.length} ({ppv.length ? Math.round((paid / ppv.length) * 100) : 0}%)</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg p-2.5" style={{ background: "var(--pro-panel)" }}>
          <p className="text-[16px] font-bold">{prices.length ? money(Math.max(...prices), 0) : "-"}</p>
          <p className="text-[12px]" style={{ color: "var(--of-muted)" }}>{t("Highest price")}</p>
        </div>
        <div className="rounded-lg p-2.5" style={{ background: "var(--pro-panel)" }}>
          <p className="text-[16px] font-bold">{prices.length ? money(Math.min(...prices), 0) : "-"}</p>
          <p className="text-[12px]" style={{ color: "var(--of-muted)" }}>{t("Lowest price")}</p>
        </div>
      </div>
      {ppv.map((m) => {
        const b = m.bundleWithMedias!;
        return (
          <div key={m.message.id} className="mt-4">
            <p className="flex items-center gap-2 text-[12px]">
              <span className="flex items-center gap-1 rounded-full px-2 py-0.5 font-bold text-white" style={{ background: b.bundle.isPaid ? GREEN : "#e0567f" }}>
                <Lock className="size-3" /> {money(b.bundle.price)}
              </span>
              {new Date(m.message.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
            <div className="mt-2 rounded-lg p-2" style={{ background: "var(--pro-panel)" }}>
              <div className="grid grid-cols-3 gap-1.5">
                {(b.medias ?? []).slice(0, 9).map((x) => (
                  <span key={x.id} className="pro-media relative aspect-square overflow-hidden rounded-md" style={{ background: "#333" }}>
                    {mediaThumb(x) ? <img src={mediaThumb(x)} alt="" className="size-full object-cover" /> : null}
                    <Lock className="absolute top-1 right-1 size-3 text-white" />
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px]">
                <span className="truncate pr-2" style={{ color: "#f28c5b" }} title={m.message.content}>{m.message.content ? t("Read more") : ""}</span>
                <button onClick={() => copy(m)} className="rounded px-2 py-1 font-semibold" style={{ background: "var(--pro-chip)" }}>{t("Copy as draft")}</button>
              </div>
            </div>
          </div>
        );
      })}
      {!ppv.length ? <p className="mt-6 text-center text-[13px]" style={{ color: "var(--of-muted)" }}>{t("No PPV in the loaded messages")}</p> : null}
      {chart ? <Chart ppv={ppv} onClose={() => setChart(false)} t={t} /> : null}
    </>
  );
}

function Chart({ ppv, onClose, t }: { ppv: LiveMsg[]; onClose: () => void; t: (s: string) => string }) {
  const data = ppv.map((m) => ({ label: new Date(m.message.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), v: m.bundleWithMedias!.bundle.price / 100, paid: !!m.bundleWithMedias!.bundle.isPaid, img: mediaThumb(m.bundleWithMedias!.medias?.[0] ?? {}) }));
  const prices = data.map((d) => d.v);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[880px] rounded-xl" style={{ background: "var(--pro-pop)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="border-b px-5 py-4 text-[16px] font-semibold" style={{ borderColor: "var(--pro-line)" }}>{t("Spending habits")}</h3>
        <div className="px-5 py-4">
          <p className="flex justify-between text-[15px]">
            {t("PPV timeline")}
            <span>Max: <b style={{ color: "#f7a14a" }}>${Math.max(...prices)}</b> Min: <b style={{ color: "#f7a14a" }}>${Math.min(...prices)}</b></span>
          </p>
          <div className="mt-3 h-[330px] rounded-lg p-3" style={{ background: "var(--pro-panel)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 50, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--pro-line)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--pro-line)" }} tick={{ fill: "var(--of-muted)", fontSize: 12 }} padding={{ left: 60, right: 60 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--of-muted)", fontSize: 12 }} width={36} />
                <Tooltip contentStyle={{ background: "#121212", border: "1px solid #444", borderRadius: 6 }} formatter={(v) => [`$${Number(v).toFixed(2)}`, t("Price")]} />
                <Line
                  dataKey="v"
                  stroke="#5b6ee1"
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={(p: { cx?: number; cy?: number; index?: number }) => {
                    const d = data[p.index ?? 0];
                    if (p.cx == null || p.cy == null || !d) return <g key={p.index} />;
                    return (
                      <g key={p.index}>
                        {d.img ? <image href={d.img} x={p.cx - 25} y={p.cy - 52} width={50} height={36} preserveAspectRatio="xMidYMid slice" className="pro-media" /> : null}
                        <rect x={p.cx - 25} y={p.cy - 16} width={50} height={18} fill={d.paid ? GREEN : "#f26b6b"} />
                        <text x={p.cx} y={p.cy - 3} textAnchor="middle" fill="#fff" fontSize={11}>${d.v.toFixed(2)}</text>
                      </g>
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 flex justify-center gap-3 text-[12px] font-semibold text-white">
            <span className="rounded px-2" style={{ background: GREEN }}>{t("Bought")}</span>
            <span className="rounded px-2" style={{ background: "#f26b6b" }}>{t("Locked")}</span>
          </p>
        </div>
        <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: "var(--pro-line)" }}>
          <button onClick={onClose} className="h-9 rounded-md border px-4" style={{ borderColor: "var(--pro-line)" }}>{t("Close")}</button>
        </div>
      </div>
    </div>
  );
}

/** « Creator notes » : fiche de la créatrice (partagée avec l'équipe). */
function CreatorNotes({ modelId, t }: { modelId: string; t: (s: string) => string }) {
  const [v, setV] = useState<string | null>(null);
  const [orig, setOrig] = useState("");
  const [field, setField] = useState("notes");
  useEffect(() => {
    api<Record<string, unknown>>("GET", `/api/models/${modelId}/profile`)
      .then((r) => {
        const p = ((r.profile as Record<string, unknown>) ?? r) as Record<string, unknown>;
        const k = ["notes", "sheet", "content", "text"].find((x) => typeof p[x] === "string") ?? "notes";
        setField(k);
        setV(String(p[k] ?? ""));
        setOrig(String(p[k] ?? ""));
      })
      .catch(() => setV(""));
  }, [modelId]);
  const save = async () => {
    if (v === null || v === orig) return;
    try {
      await api("PUT", `/api/models/${modelId}/profile`, { [field]: v, profile: { [field]: v } });
      setOrig(v);
      toast(t("Creator notes saved"));
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  return (
    <>
      <h3 className="mb-3 text-[15px] font-semibold">{t("Creator notes")}</h3>
      <textarea value={v ?? ""} onChange={(e) => setV(e.target.value)} onBlur={save} placeholder={v === null ? t("Loading…") : t("Notes about the creator: first name, age, city, job, tastes…")} className="h-[calc(100vh-250px)] w-full resize-none rounded-xl p-3 text-[13px] outline-none" style={{ background: "var(--pro-panel)" }} />
    </>
  );
}
