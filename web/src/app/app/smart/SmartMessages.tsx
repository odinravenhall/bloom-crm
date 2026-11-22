"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen, CalendarClock, CircleX, Copy, Cake, ChevronDown, CreditCard, Folder, Image as ImageIcon, Info, MessageCircleHeart, MoreHorizontal, Play, Plus, RefreshCcw, Search,
  Send, TimerReset, Undo2, Upload, UserRoundCheck, UserRoundPlus, X,
} from "lucide-react";
import { api, toast } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";
import { Editor, emptyDraft, type Draft, type Kind } from "./Editor";

// Growth → Smart Messages (OnlyFans) : copie de la page d'Infloww.
//   Automated Messages : messages automatiques de Bloom (bienvenue des nouveaux abonnés, relance après achat).
//   Mass Messages : messages de masse OnlyFans (via Substy) ; « Priority mass messages » n'existe que chez Infloww.
type Auto = {
  id: number; trigger: string; status: string; runs: boolean; include: { id: string; name: string }[]; exclude: { id: string; name: string }[];
  delayMin: number; delayMax: number; once: boolean; startsAt: number | null; unsendOnReply: boolean; collections: Draft["collections"];
  text: string; medias: number; price: number; createdBy: string | null; createdAt: number; canceledBy: string | null; fans: number; sent: number; purchased: number; earnings: number;
};
type Mass = { id: string; text: string; price: number; medias: number; included: string[]; excluded: string[]; status: string; scheduledAt: string | null; createdAt: string | null; recipients: number | null; sent: number | null; viewed: number | null; purchased: number | null; gross: number | null; canUnsend: boolean };
const BLUE = "#2f6bff";
const TRIG: Record<string, string> = { nudge: "Nudge", welcome: "Delayed welcome", purchase: "Purchased", expiring: "Nearing expiry", expired: "Expired", resubscribe: "Resubscribe", birthday: "Birthday" };
const usd = (v: number) => "$" + (+v.toFixed(2)).toLocaleString("en-US");

export function SmartMessages() {
  const { t } = useT();
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [tab, setTab] = useState<"auto" | "mass">("auto");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [picker, setPicker] = useState(false);
  const [autos, setAutos] = useState<Auto[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const cid = creatorId ?? creators[0]?.id ?? null;

  const loadAutos = useCallback(() => {
    if (!cid) return;
    api<{ items: Auto[] }>("GET", `/api/smart/auto?creatorId=${encodeURIComponent(cid)}`).then((r) => setAutos(r.items)).catch((e) => toast((e as Error).message, "err"));
  }, [cid]);
  useEffect(() => {
    setAutos(null);
    loadAutos();
  }, [loadAutos, nonce]);

  if (editing && cid)
    return (
      <div className="min-h-full p-4 md:p-6" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
        <Editor creatorId={cid} creatorName={creator?.name ?? ""} initial={editing} onBack={() => setEditing(null)} onDone={() => (setEditing(null), setNonce((n) => n + 1))} t={t} />
      </div>
    );

  return (
    <div className="min-h-full p-4 md:p-5" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="flex flex-wrap items-center gap-4 border-b pb-3" style={{ borderColor: "var(--of-line)" }}>
        <h1 className="text-[17px] font-semibold">{t("Smart Messages List")}</h1>
        <CreatorPick creators={creators} value={cid} set={setCreator} />
        <span className="ml-auto flex items-center gap-1.5 text-[14px]" style={{ color: BLUE }}>
          <BookOpen className="size-4" /> {t("Learn")}
        </span>
        <button onClick={() => setPicker(true)} className="flex h-9 items-center gap-1.5 rounded-md px-4 text-[14px] text-white" style={{ background: BLUE }}>
          <Plus className="size-4" /> {t("New Message")}
        </button>
      </div>
      <div className="mt-2 flex gap-6 border-b" style={{ borderColor: "var(--of-line)" }}>
        {(
          [
            ["auto", "Automated Messages"],
            ["mass", "Mass Messages"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className="border-b-2 py-3 text-[14px]" style={tab === k ? { borderColor: BLUE, color: BLUE } : { borderColor: "transparent" }}>
            {t(l)}
          </button>
        ))}
      </div>
      {!cid ? <p className="py-10 text-center" style={{ color: "var(--of-muted)" }}>{t("No creator")}</p> : tab === "auto" ? (
        <AutoList cid={cid} items={autos} reload={loadAutos} onDuplicate={(a) => setEditing({ ...toDraft(a), id: undefined })} t={t} />
      ) : (
        <MassList cid={cid} nonce={nonce} onDuplicate={(m) => setEditing({ ...emptyDraft("mass"), include: m.included.map((id) => ({ id, name: id })), exclude: m.excluded.map((id) => ({ id, name: id })), collections: [{ messages: [{ text: m.text, medias: [], price: m.price, delay: 0 }] }] })} t={t} />
      )}
      {picker ? (
        <NewMessage
          onClose={() => setPicker(false)}
          onPick={(k) => {
            setPicker(false);
            let d = emptyDraft(k);
            if (k === "mass") {
              try {
                const saved = JSON.parse(localStorage.getItem(`bloom.smart.draft.${cid}`) || "null");
                if (saved && window.confirm(t("Resume the saved draft?"))) d = saved;
              } catch {}
            }
            setEditing(d);
          }}
          t={t}
        />
      ) : null}
    </div>
  );
}

const toDraft = (a: Auto): Draft => ({ id: a.id, kind: (a.trigger === "purchase" ? "purchase" : "welcome") as Kind, include: a.include, exclude: a.exclude, scheduledAt: a.startsAt, delayMin: a.delayMin, delayMax: a.delayMax, once: a.once, unsendOnReply: a.unsendOnReply, collections: a.collections });

function CreatorPick({ creators, value, set }: { creators: { id: string; name: string; avatar: string | null }[]; value: string | null; set: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = creators.find((c) => c.id === value);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} onBlur={() => setTimeout(() => setOpen(false), 150)} className="flex h-9 w-[160px] items-center gap-2 rounded-md border px-2.5 text-[14px]" style={{ borderColor: "var(--of-line)" }}>
        <Avatar src={cur?.avatar} name={cur?.name} size="size-6" rounded="rounded" />
        <span className="flex-1 truncate text-left">{cur?.name ?? "—"}</span>
        <ChevronDown className="size-3.5" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-md border p-1 shadow-xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
          {creators.map((c) => (
            <button key={c.id} onMouseDown={() => (set(c.id), setOpen(false))} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]" style={c.id === value ? { color: BLUE } : undefined}>
              <Avatar src={c.avatar} name={c.name} size="size-6" rounded="rounded" /> {c.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Sel({ value, set, options, w = 210, placeholder }: { value: string; set: (v: string) => void; options: [string, string][]; w?: number; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => set(e.target.value)} className="h-9 rounded-md border bg-transparent px-2.5 text-[14px] outline-none" style={{ borderColor: "var(--of-line)", width: w, color: "var(--of-text)" }}>
      <option value="" style={{ background: "#222" }}>{placeholder ?? "All"}</option>
      {options.map(([k, l]) => (
        <option key={k} value={k} style={{ background: "#222" }}>{l}</option>
      ))}
    </select>
  );
}
const Range = ({ v, set }: { v: { from: string; to: string }; set: (r: { from: string; to: string }) => void }) => (
  <span className="flex h-9 items-center gap-2 rounded-md border px-2.5 text-[13px]" style={{ borderColor: "var(--of-line)" }}>
    <input type="date" value={v.from} onChange={(e) => set({ ...v, from: e.target.value })} className="bg-transparent outline-none" style={{ colorScheme: "dark" }} />→
    <input type="date" value={v.to} onChange={(e) => set({ ...v, to: e.target.value })} className="bg-transparent outline-none" style={{ colorScheme: "dark" }} />
  </span>
);
const inRange = (at: number | null, r: { from: string; to: string }) => (!r.from || (at ?? 0) >= new Date(`${r.from}T00:00:00`).getTime()) && (!r.to || (at ?? 0) < new Date(`${r.to}T00:00:00`).getTime() + 864e5);

/** Onglet « Automated Messages ». */
function AutoList({ cid, items, reload, onDuplicate, t }: { cid: string; items: Auto[] | null; reload: () => void; onDuplicate: (a: Auto) => void; t: (s: string) => string }) {
  const empty = { q: "", status: "", trigger: "", list: "", start: { from: "", to: "" }, created: { from: "", to: "" }, by: "" };
  const [d, setD] = useState(empty);
  const [f, setF] = useState(empty);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<Auto | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  const [sortEarn, setSortEarn] = useState<0 | 1 | -1>(0);
  const lists = useMemo(() => [...new Map((items ?? []).flatMap((a) => a.include).map((l) => [l.id, l.name])).entries()], [items]);
  const people = useMemo(() => [...new Set((items ?? []).map((a) => a.createdBy).filter(Boolean) as string[])], [items]);
  const rows = (items ?? [])
    .filter((a) => !f.q || a.collections.some((c) => c.messages.some((m) => m.text.toLowerCase().includes(f.q.toLowerCase()))))
    .filter((a) => !f.status || a.status === f.status)
    .filter((a) => !f.trigger || a.trigger === f.trigger)
    .filter((a) => !f.list || a.include.some((l) => l.id === f.list))
    .filter((a) => inRange(a.startsAt ?? a.createdAt, f.start) && inRange(a.createdAt, f.created))
    .filter((a) => !f.by || a.createdBy === f.by)
    .sort((a, b) => (sortEarn ? (a.earnings - b.earnings) * sortEarn : 0));
  const cancel = async (a: Auto) => {
    if (!window.confirm(t("Cancel this automated message? Fans won't receive it anymore."))) return;
    try {
      await api("POST", "/api/smart/auto/cancel", { id: a.id });
      reload();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const statusPill = (a: Auto) => {
    const s: Record<string, [string, string, string]> = { active: ["Active", "#dbe6ff", BLUE], scheduled: ["Scheduled", "#e9e9ee", "#666"], completed: ["Completed", "#d7f3ea", "#1b9b78"], canceled: ["Canceled", "#ffe3d6", "#e2733f"] };
    const [l, bg, fg] = s[a.status] ?? s.scheduled;
    return (
      <span className="inline-flex max-w-[190px] items-center gap-1 truncate rounded-full px-2.5 py-0.5 text-[13px]" style={{ background: bg, color: fg }}>
        {a.status === "active" ? <Play className="size-3" /> : a.status === "canceled" ? <CircleX className="size-3" /> : null}
        {t(l)}
        {a.status === "canceled" && a.canceledBy ? ` | ${t("by")} ${a.canceledBy}` : ""}
      </span>
    );
  };
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-[14px]">
        <label className="flex h-9 w-[300px] items-center gap-2 rounded-md border px-3" style={{ borderColor: "var(--of-line)" }}>
          <input value={d.q} onChange={(e) => setD({ ...d, q: e.target.value })} placeholder={t("Search message")} className="min-w-0 flex-1 bg-transparent outline-none" />
          <Search className="size-4" style={{ color: "var(--of-muted)" }} />
        </label>
        <span className="flex items-center gap-2">{t("Status")}: <Sel value={d.status} set={(v) => setD({ ...d, status: v })} options={[["scheduled", t("Scheduled")], ["active", t("Active")], ["completed", t("Completed")], ["canceled", t("Canceled")]]} placeholder={t("All")} /></span>
        <span className="flex items-center gap-2">{t("Trigger")}: <Sel value={d.trigger} set={(v) => setD({ ...d, trigger: v })} options={Object.entries(TRIG).map(([k, l]) => [k, t(l)])} placeholder={t("All")} /></span>
        <span className="flex items-center gap-2">{t("Sent to")}: <Sel value={d.list} set={(v) => setD({ ...d, list: v })} options={lists} placeholder={t("All")} /></span>
        <span className="flex items-center gap-2">{t("Start date")}: <Range v={d.start} set={(v) => setD({ ...d, start: v })} /></span>
        <span className="flex items-center gap-2">{t("Date created")}: <Range v={d.created} set={(v) => setD({ ...d, created: v })} /></span>
        <span className="flex items-center gap-2">{t("Created by")}: <Sel value={d.by} set={(v) => setD({ ...d, by: v })} options={people.map((p) => [p, p])} placeholder={t("All")} /></span>
        <button onClick={() => (setD(empty), setF(empty))} className="h-9 rounded-md border px-4" style={{ borderColor: "var(--of-line)" }}>{t("Reset")}</button>
        <button onClick={() => setF(d)} className="h-9 rounded-md px-4 text-white" style={{ background: BLUE }}>{t("Search")}</button>
      </div>
      <div className="of-scroll mt-4 overflow-x-auto rounded-md">
        <table className="w-full min-w-[1250px] text-[14px]">
          <thead>
            <tr className="text-left" style={{ background: "var(--of-line)" }}>
              <th className="w-12" />
              {["Messages", "Status", "Trigger", "Sent", "Purchased"].map((h) => (
                <th key={h} className="px-3 py-3.5 font-medium">{t(h)}</th>
              ))}
              <th className="px-3 py-3.5 font-medium">
                <button onClick={() => setSortEarn(sortEarn === -1 ? 1 : sortEarn === 1 ? 0 : -1)} className="flex items-center gap-2">{t("Earnings")} <span className="text-[10px]" style={{ color: sortEarn ? BLUE : "var(--of-muted)" }}>{sortEarn === 1 ? "▲" : sortEarn === -1 ? "▼" : "▲▼"}</span></button>
              </th>
              {["Attachment(s)", "Price", "Actions"].map((h) => (
                <th key={h} className="px-3 py-3.5 font-medium">{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <Fragment key={a.id}>
                <tr onClick={() => setDetail(a)} className="cursor-pointer border-b" style={{ borderColor: "var(--of-line)" }}>
                  <td className="px-3">
                    <button onClick={(e) => (e.stopPropagation(), setOpen((s) => (s.has(a.id) ? (s.delete(a.id), new Set(s)) : new Set(s.add(a.id)))))}>
                      <ChevronDown className={`size-4 transition-transform ${open.has(a.id) ? "rotate-180" : ""}`} />
                    </button>
                  </td>
                  <td className="px-3 py-3.5">
                    <span className="flex items-center gap-3">
                      <span className="max-w-[230px] truncate">{a.text || "—"}</span>
                      <span className="flex items-center gap-0.5"><Folder className="size-4" />{a.collections.length}</span>
                    </span>
                  </td>
                  <td className="px-3">{statusPill(a)}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>
                    {t(TRIG[a.trigger] ?? a.trigger)}
                    {!a.runs ? <span className="ml-1 text-[11px]" style={{ color: "var(--of-muted)" }}>({t("soon")})</span> : null}
                  </td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{a.sent}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{a.purchased}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{usd(a.earnings)}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{a.medias ? <span className="flex items-center gap-1 text-[12px]"><ImageIcon className="size-3.5" />{a.medias}</span> : "--"}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{a.price ? usd(a.price) : "--"}</td>
                  <td className="relative px-3 text-center">
                    <button onClick={(e) => (e.stopPropagation(), setMenu(menu === a.id ? null : a.id))}>
                      <MoreHorizontal className="size-5" />
                    </button>
                    {menu === a.id ? (
                      <Menu onClose={() => setMenu(null)}>
                        {a.status !== "canceled" ? <MenuItem icon={CircleX} label={t("Cancel")} onClick={() => (setMenu(null), cancel(a))} /> : null}
                        <MenuItem icon={Copy} label={t("Duplicate")} onClick={() => (setMenu(null), onDuplicate(a))} />
                      </Menu>
                    ) : null}
                  </td>
                </tr>
                {open.has(a.id)
                  ? a.collections.map((c, i) => (
                      <tr key={i} style={{ background: "var(--of-card)" }}>
                        <td />
                        <td colSpan={9} className="px-3 py-2.5 text-[13px]">
                          <b>{t("Collection")}{i + 1}</b> — {c.messages.map((m, j) => `${j ? ` → (+${m.delay} min) ` : ""}${m.text || "[media]"}${m.price ? ` · ${usd(m.price)}` : ""}`).join("")}
                        </td>
                      </tr>
                    ))
                  : null}
              </Fragment>
            ))}
            {items && !rows.length ? (
              <tr>
                <td colSpan={10} className="py-14 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {detail ? <Detail a={detail} onClose={() => setDetail(null)} t={t} statusPill={statusPill} /> : null}
      <span className="hidden">{cid}</span>
    </>
  );
}

function Detail({ a, onClose, t, statusPill }: { a: Auto; onClose: () => void; t: (s: string) => string; statusPill: (a: Auto) => React.ReactNode }) {
  const [col, setCol] = useState(0);
  const c = a.collections[col] ?? a.collections[0];
  const box = (children: React.ReactNode) => <div className="mt-2 rounded-md border px-4 py-3 text-[14px]" style={{ borderColor: "var(--of-line)", background: "var(--of-page)" }}>{children}</div>;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onMouseDown={onClose} />
      <aside className="of-scroll fixed inset-y-0 right-0 z-50 w-full max-w-[700px] overflow-y-auto p-6 shadow-2xl" style={{ background: "var(--of-card)", color: "var(--of-text)" }}>
        <div className="flex items-center gap-3">
          <h3 className="max-w-[420px] truncate text-[17px] font-semibold">{a.text || "—"}</h3>
          {statusPill(a)}
          <button onClick={onClose} className="ml-auto"><X className="size-5" /></button>
        </div>
        <p className="mt-6 font-semibold">{t("You send message to")}</p>
        {box(<>{t("Include users in")} <b>{a.include.map((l) => l.name).join(", ") || t("all new fans")}</b>{a.exclude.length ? <> · {t("exclude")} <b>{a.exclude.map((l) => l.name).join(", ")}</b></> : null}</>)}
        <p className="mt-5 font-semibold">{t("Based on the following rules")}</p>
        {box(<>
          <p>⚡ <b>{t(a.trigger === "purchase" ? "Fan purchases a PPV" : "Fan subscribes for the first time")}</b></p>
          <p className="mt-1.5 flex items-center gap-2"><TimerReset className="size-4" /> {t("Send message to fans after delay in random minute intervals")} <b>{a.delayMin}~{a.delayMax}</b> {t("minutes automatically")}</p>
        </>)}
        <p className="mt-5 font-semibold">{t("Based on frequency and scheduling")}</p>
        {box(<>
          <p>{t(a.once ? "Send only once when the fan matches the trigger" : "Send every time the fan matches the trigger")}</p>
          <p className="mt-1.5 flex items-center gap-2"><CalendarClock className="size-4" /> {a.startsAt ? `${t("Effective from")} ${new Date(a.startsAt).toLocaleString()}` : t("Effective immediately, expires never")}</p>
        </>)}
        <p className="mt-5 font-semibold">{t("Follow unsend settings")}</p>
        {box(t(a.unsendOnReply ? "When a fan replies to a message, it will not send the rest of the message sequence anymore" : "The whole sequence is sent even if the fan replies"))}
        <p className="mt-5 font-semibold">{t("With one of the following content")}</p>
        <div className="mt-2 flex gap-4 border-b" style={{ borderColor: "var(--of-line)" }}>
          {a.collections.map((_, i) => (
            <button key={i} onClick={() => setCol(i)} className="border-b-2 pb-1 text-[14px]" style={i === col ? { borderColor: BLUE, color: BLUE } : { borderColor: "transparent" }}>{t("Collection")}{i + 1}</button>
          ))}
        </div>
        {c?.messages.map((m, i) => (
          <div key={i}>
            {box(<>
              {i ? <p className="mb-1 text-[12px]" style={{ color: "var(--of-muted)" }}>+{m.delay} min</p> : null}
              <p className="whitespace-pre-wrap">{m.text}</p>
              {m.medias.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.medias.map((x) => (
                    <span key={x.id} className="size-[86px] overflow-hidden rounded-md border-2" style={{ borderColor: BLUE, background: "#333" }}>
                      {x.thumb ? <img src={x.thumb} alt="" className="size-full object-cover" /> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              {m.price ? <p className="mt-2 text-[13px]" style={{ color: "#f7a14a" }}>{usd(m.price)}</p> : null}
            </>)}
          </div>
        ))}
        <p className="mt-6 text-[12px]" style={{ color: "var(--of-muted)" }}>{t("Created by")} {a.createdBy ?? "—"} · {new Date(a.createdAt).toLocaleString()} · {a.fans} {t("fans reached")}</p>
      </aside>
    </>
  );
}

/** Onglet « Mass Messages ». */
function MassList({ cid, nonce, onDuplicate, t }: { cid: string; nonce: number; onDuplicate: (m: Mass) => void; t: (s: string) => string }) {
  const [sub, setSub] = useState<"priority" | "of">("of");
  const [data, setData] = useState<{ items: Mass[]; page: number; pages: number } | null>(null);
  const [page, setPage] = useState(1);
  const [senders, setSenders] = useState<{ text: string; name: string | null }[]>([]);
  const [d, setD] = useState({ q: "", range: { from: "", to: "" } });
  const [f, setF] = useState(d);
  const [menu, setMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setBusy(true);
    api<{ items: Mass[]; page: number; pages: number }>("GET", `/api/mass?creatorId=${encodeURIComponent(cid)}&page=${page}`)
      .then(setData)
      .catch((e) => toast((e as Error).message, "err"))
      .finally(() => setBusy(false));
    api<{ items: { text: string; name: string | null }[] }>("GET", `/api/mass/senders?creatorId=${encodeURIComponent(cid)}`).then((r) => setSenders(r.items)).catch(() => {});
  }, [cid, page]);
  useEffect(() => {
    load();
  }, [load, nonce]);
  const sender = (m: Mass) => senders.find((s) => s.text && m.text.startsWith(s.text.slice(0, 60)))?.name ?? "--";
  const rows = (data?.items ?? []).filter((m) => (!f.q || m.text.toLowerCase().includes(f.q.toLowerCase())) && inRange(Date.parse(m.scheduledAt || m.createdAt || ""), f.range));
  const unsend = async (m: Mass) => {
    if (!window.confirm(t("Unsend this mass message? Fans who haven't bought it won't see it anymore."))) return;
    try {
      await api("POST", "/api/mass/unsend", { creatorId: cid, id: m.id });
      toast(t("Mass message unsent"));
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const exportCsv = () => {
    const esc = (x: string) => (/[",;\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
    const lines = [["Message", "Sent date & time", "Sender", "Attachment", "Status", "Price", "Sent", "Viewed", "Purchased"], ...rows.map((m) => [m.text, m.scheduledAt || m.createdAt || "", sender(m), String(m.medias), m.status, String(m.price || ""), String(m.sent ?? m.recipients ?? ""), String(m.viewed ?? ""), String(m.purchased ?? "")])];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.map((l) => l.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    a.download = `mass-messages-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  const pill = (s: string) => {
    const up = s.toUpperCase();
    const [l, bg, fg, I] = up === "SENT" ? ["Sent", "#dbe6ff", BLUE, Send] : up.includes("UNSEN") || up.includes("REVERT") ? ["Unsent", "#ffe3d6", "#e2733f", Undo2] : up.includes("SCHED") ? ["Scheduled", "#e9e9ee", "#555", CalendarClock] : up.includes("CANCEL") ? ["Canceled", "#ffe3d6", "#e2733f", CircleX] : [s || "—", "#e9e9ee", "#555", Send];
    return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px]" style={{ background: bg as string, color: fg as string }}><I className="size-3.5" /> {t(l as string)}</span>;
  };
  return (
    <>
      <div className="mt-4 flex gap-3">
        {(
          [
            ["priority", "Priority mass messages"],
            ["of", "OF mass messages"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className="rounded-full border px-4 py-1.5 text-[14px]" style={sub === k ? { background: BLUE, borderColor: BLUE, color: "#fff" } : { borderColor: "var(--of-line)" }}>{t(l)}</button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-[14px]">
        <label className="flex h-9 w-[230px] items-center gap-2 rounded-md border px-3" style={{ borderColor: "var(--of-line)" }}>
          <input value={d.q} onChange={(e) => setD({ ...d, q: e.target.value })} placeholder={t("Search for message")} className="min-w-0 flex-1 bg-transparent outline-none" />
          <Search className="size-4" style={{ color: "var(--of-muted)" }} />
        </label>
        <span className="flex items-center gap-2">{t("Sending Date")}: <Range v={d.range} set={(v) => setD({ ...d, range: v })} /></span>
        <button onClick={() => (setD({ q: "", range: { from: "", to: "" } }), setF({ q: "", range: { from: "", to: "" } }))} className="h-9 rounded-md border px-4" style={{ borderColor: "var(--of-line)" }}>{t("Reset")}</button>
        <button onClick={() => setF(d)} className="h-9 rounded-md px-4 text-white" style={{ background: BLUE }}>{t("Search")}</button>
        <button onClick={load} title={t("Refresh")}><RefreshCcw className={`size-4 ${busy ? "animate-spin" : ""}`} /></button>
        <button onClick={exportCsv} className="ml-auto flex h-9 items-center gap-2 rounded-md border px-4" style={{ borderColor: "var(--of-line)" }}><Upload className="size-4" /> {t("Export")}</button>
      </div>
      <div className="of-scroll mt-4 overflow-x-auto rounded-md">
        <table className="w-full min-w-[1150px] text-[14px]">
          <thead>
            <tr className="text-left" style={{ background: "var(--of-line)" }}>
              {["Message", "Sent date & time", "Sender", "Attachment", "Status", "Price", "Sent", "Viewed", "Purchased", "Actions"].map((h) => (
                <th key={h} className="px-3 py-3.5 font-medium">{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sub === "priority" ? (
              <tr>
                <td colSpan={10} className="py-16 text-center" style={{ color: "var(--of-muted)" }}>
                  {t("No Data")}
                  <p className="mt-1 text-[12px]">{t("Priority mass messages are an Infloww feature, not available with Substy.")}</p>
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                  <td className="max-w-[240px] truncate px-3 py-3.5" title={m.text}>{m.text || "—"}</td>
                  <td className="border-l px-3 whitespace-nowrap" style={{ borderColor: "var(--of-line)" }}>{m.scheduledAt || m.createdAt ? new Date(m.scheduledAt || m.createdAt!).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).replace(", 20", ", 20").replace(/, (\d+:)/, " at $1") : "--"}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{sender(m)}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{m.medias ? <span className="flex items-center gap-1"><ImageIcon className="size-4" /> {m.medias}</span> : "--"}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{pill(m.status)}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{m.price ? usd(m.price) : "--"}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{m.sent ?? m.recipients ?? "--"}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{m.viewed ?? "--"}</td>
                  <td className="border-l px-3" style={{ borderColor: "var(--of-line)" }}>{m.purchased ?? 0}</td>
                  <td className="relative px-3 text-center">
                    <button onClick={() => setMenu(menu === m.id ? null : m.id)}><MoreHorizontal className="size-5" /></button>
                    {menu === m.id ? (
                      <Menu onClose={() => setMenu(null)}>
                        {m.canUnsend ? <MenuItem icon={Undo2} label={t("Unsend")} onClick={() => (setMenu(null), unsend(m))} /> : null}
                        <MenuItem icon={Copy} label={t("Duplicate")} onClick={() => (setMenu(null), onDuplicate(m))} />
                      </Menu>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
            {sub === "of" && data && !rows.length ? (
              <tr><td colSpan={10} className="py-14 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {sub === "of" && data && data.pages > 1 ? (
        <div className="mt-4 flex justify-end gap-2 text-[14px]">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-30">‹</button>
          <span className="rounded-md border px-2" style={{ borderColor: BLUE, color: BLUE }}>{page}</span>/ {data.pages}
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="disabled:opacity-30">›</button>
        </div>
      ) : null}
    </>
  );
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={onClose} />
      <div className="absolute right-6 top-9 z-40 w-40 rounded-md border p-1 text-left shadow-xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>{children}</div>
    </>
  );
}
function MenuItem({ icon: I, label, onClick }: { icon: typeof Copy; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-[14px] hover:opacity-80">
      <I className="size-4" /> {label}
    </button>
  );
}

/** « Create message » : messages de masse et modèles de messages automatiques. */
function NewMessage({ onPick, onClose, t }: { onPick: (k: Kind) => void; onClose: () => void; t: (s: string) => string }) {
  const [sel, setSel] = useState<Kind | null>(null);
  const card = (k: Kind | null, Icon: typeof Send, title: string, sub: string, opts: { soon?: string; popular?: boolean; info?: boolean } = {}) => (
    <button
      disabled={!k}
      onClick={() => k && setSel(k)}
      className="relative flex items-start gap-4 rounded-lg border p-4 text-left disabled:opacity-60"
      style={{ borderColor: sel === k && k ? BLUE : "var(--of-line)", background: "var(--of-card)" }}
    >
      <Icon className="mt-1 size-5 shrink-0" />
      <span>
        <span className="block text-[15px] font-semibold">{t(title)}</span>
        <span className="text-[14px]" style={{ color: "var(--of-muted)" }}>{t(sub)}</span>
      </span>
      {opts.popular ? <span className="absolute top-0 right-0 rounded-bl-md rounded-tr-lg px-3 py-1 text-[12px]" style={{ background: "#4a5068", color: "#8aa0ff" }}>{t("Popular")}</span> : null}
      {opts.soon ? <span className="absolute top-2 right-2 rounded-full px-2 text-[11px]" style={{ background: "var(--of-line)" }}>{t(opts.soon)}</span> : null}
      {opts.info ? <Info className="absolute top-2 right-2 size-4" style={{ color: "var(--of-muted)" }} /> : null}
    </button>
  );
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-[720px] flex-col rounded-xl" style={{ background: "var(--of-pop)", color: "var(--of-text)" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="flex items-center justify-between border-b px-5 py-4 text-[16px] font-semibold" style={{ borderColor: "var(--of-line)" }}>{t("Create message")} <Info className="size-4" style={{ color: "var(--of-muted)" }} /></h3>
        <div className="of-scroll min-h-0 flex-1 overflow-y-auto p-5">
          <div className="rounded-lg border p-5" style={{ borderColor: "var(--of-line)" }}>
            <p className="mb-4 font-semibold">{t("Mass messages")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {card(null, MessageCircleHeart, "Priority mass message", "Sent to priority inbox", { soon: "Infloww only" })}
              {card("mass", Send, "OF mass message", "Sent to general inbox", { info: true })}
            </div>
          </div>
          <div className="mt-5 rounded-lg border p-5" style={{ borderColor: "var(--of-line)" }}>
            <p className="font-semibold">{t("Automated messages")}</p>
            <p className="mt-1 mb-4 text-[13px]">
              <button onClick={() => setSel("welcome")} style={{ color: BLUE }}>{t("Start from scratch")}</button> {t("or use one of the templates below")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {card(null, UserRoundPlus, "Nudge", "Messages fans when they come online", { soon: "Substy AI · soon" })}
              {card("welcome", UserRoundCheck, "Subscriber welcome", "Greet fans when they subscribe", { popular: true })}
              {card("purchase", CreditCard, "Purchases", "Follow up with fans who purchased a PPV")}
              {card(null, TimerReset, "Expiring soon", "Message fans when their subscription is about to expire", { soon: "soon" })}
              {card(null, CircleX, "Expired", "Messages fans whose subscription has expired", { soon: "soon" })}
              {card(null, RefreshCcw, "Resubscribe", "Greet fans when they resubscribe", { soon: "soon" })}
              {card(null, Cake, "Birthday greetings", "Wish fans happy birthday", { soon: "soon" })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--of-line)" }}>
          <button onClick={onClose} className="h-9 rounded-md border px-4" style={{ borderColor: "var(--of-line)" }}>{t("Cancel")}</button>
          <button disabled={!sel} onClick={() => sel && onPick(sel)} className="h-9 rounded-md px-5 text-white disabled:opacity-40" style={{ background: BLUE }}>{t("Next")}</button>
        </div>
      </div>
    </div>
  );
}

