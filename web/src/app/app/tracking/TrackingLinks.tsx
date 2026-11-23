"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronDown, Info, Plus, Search, Share2, Tag, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";

// Growth → Tracking links (OnlyFans) : copie de la page d'Infloww, liens faits par Bloom (« /l/<code> »).
type Link = {
  id: number; name: string; code: string; dest: string; source: string; tags: string[]; listId: string | null; listName: string | null; active: boolean; createdBy: string | null; createdAt: number; updatedAt: number;
  clicks: number; subs: number; subCvr: number; cost: number; earnings: number; spenders: number; spendCvr: number; profit: number; cpc: number; epc: number; cps: number; aeps: number; roi: number;
};
type Resp = { items: Link[]; tags: string[]; sources: string[]; profile: string };
type FanList = { id: string; name: string; fans: number };
const ORANGE = "#f28c5b";
const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => `${v.toFixed(2)}%`;
const ymd = (t: number) => new Date(t).toLocaleDateString("sv-SE").replace(/-/g, "/");
const linkUrl = (code: string) => `${typeof location !== "undefined" ? location.origin : ""}/l/${code}`;

export function TrackingLinks() {
  const { t } = useT();
  const { creators, creatorId, setCreator } = useCreators();
  const cid = creatorId ?? creators[0]?.id ?? null;
  const [data, setData] = useState<Resp | null>(null);
  const [net, setNet] = useState(true);
  const [showOff, setShowOff] = useState(false);
  const [q, setQ] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [range, setRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [edit, setEdit] = useState<Partial<Link> | null>(null);
  const [detail, setDetail] = useState<Link | null>(null);
  const load = useCallback(() => {
    if (!cid) return;
    api<Resp>("GET", `/api/track/links?creatorId=${encodeURIComponent(cid)}&net=${net ? 1 : 0}`).then(setData).catch((e) => toast((e as Error).message, "err"));
  }, [cid, net]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const rows = useMemo(() => {
    const from = range.from ? new Date(`${range.from}T00:00:00`).getTime() : 0;
    const to = range.to ? new Date(`${range.to}T00:00:00`).getTime() + 864e5 : Infinity;
    return (data?.items ?? []).filter((l) => (showOff || l.active) && (!q || l.name.toLowerCase().includes(q.toLowerCase())) && (!sources.length || sources.includes(l.source)) && (!tags.length || l.tags.some((x) => tags.includes(x))) && l.createdAt >= from && l.createdAt < to);
  }, [data, showOff, q, sources, tags, range]);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const shown = rows.slice((page - 1) * per, page * per);
  const setActive = async (active: boolean) => {
    try {
      await api("POST", "/api/track/links/active", { creatorId: cid, ids: [...picked], active });
      setPicked(new Set());
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const copy = (l: Link) => (navigator.clipboard.writeText(linkUrl(l.code)), toast(t("Link copied")));

  if (detail && cid) return <Details link={detail} net={net} onBack={() => setDetail(null)} t={t} />;

  const cols: [string, string?][] = [["Date created"], ["Clicks"], ["Subs"], ["Subscription CVR", "Subscribers ÷ clicks"], ["Promo cost", "What the link cost"], ["Earnings", "Spending of the fans who came through the link"], ["Fans who spent"], ["Spending CVR", "Fans who spent ÷ subscribers"], ["Profit", "Earnings − promo cost"], ["CPC", "Cost per click"], ["EPC", "Earnings per click"], ["CPS", "Cost per subscriber"], ["AEPS", "Average earnings per subscriber"], ["ROI", "Return on investment"], ["Source"], ["Tag"], ["List"], ["Last updated"]];
  return (
    <div className="min-h-full p-4 md:p-5" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <h1 className="flex items-center gap-2.5 text-[24px] font-semibold">
        {t("Tracking links")} <span className="text-[13px] font-normal" style={{ color: "var(--of-muted)" }}>UTC+01:00</span> <Info className="size-4" style={{ color: "var(--of-muted)" }} />
      </h1>
      <span className="mt-3 inline-block rounded-lg px-3 py-1.5 text-[15px] font-semibold" style={{ background: "var(--of-card)" }}>{t("Links list")}</span>
      <p className="mt-3 flex items-center gap-2 rounded-md px-3 py-2.5 text-[14px]" style={{ background: "var(--of-side)" }}>
        <Info className="size-4 shrink-0" /> {t("Each fan's spending is attributed to the last Bloom tracking link clicked before they subscribed (within 30 minutes).")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[15px]">
        <span className="flex h-10 items-center gap-2 rounded-md px-3" style={{ background: "var(--of-card)" }}>
          <Avatar src={creators.find((c) => c.id === cid)?.avatar} name={creators.find((c) => c.id === cid)?.name} size="size-6" />
          <select value={cid ?? ""} onChange={(e) => (setCreator(e.target.value), setPage(1))} className="bg-transparent outline-none">
            {creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}
          </select>
        </span>
        <label className="flex h-10 w-[260px] items-center gap-2 rounded-md px-3" style={{ background: "var(--of-card)" }}>
          <Search className="size-4" /> <input value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder={t("Search tracking link name")} className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <Multi icon={Share2} label={t("Source")} options={data?.sources ?? []} value={sources} set={(v) => (setSources(v), setPage(1))} t={t} />
        <Multi icon={Tag} label={t("Tag")} options={data?.tags ?? []} value={tags} set={(v) => (setTags(v), setPage(1))} t={t} />
        <span className="flex h-10 items-center gap-2 rounded-md px-3 text-[14px]" style={{ background: "var(--of-card)" }}>
          <CalendarDays className="size-4" /> {t("Date created")}
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="bg-transparent outline-none" style={{ colorScheme: "dark" }} />→
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="bg-transparent outline-none" style={{ colorScheme: "dark" }} />
        </span>
        <Switch on={showOff} set={setShowOff} label={t("Show deactivated links")} />
        <Switch on={net} set={setNet} label={t("Show net earnings")} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--of-muted)" }}><Info className="size-3.5" /> {t("Clicks are counted live; subscribers are matched every 2 minutes")}</p>
        <span className="flex gap-2">
          {picked.size ? (
            <>
              <button onClick={() => setActive(false)} className="h-10 rounded-md border px-4 text-[14px]" style={{ borderColor: "var(--of-line)" }}>{t("Deactivate")} ({picked.size})</button>
              <button onClick={() => setActive(true)} className="h-10 rounded-md border px-4 text-[14px]" style={{ borderColor: "var(--of-line)" }}>{t("Activate")}</button>
            </>
          ) : null}
          <button onClick={() => setEdit({ source: "OnlyFans", dest: data?.profile, tags: [] })} className="flex h-10 items-center gap-1 rounded-md px-4 text-[16px] font-semibold text-white" style={{ background: ORANGE }}><Plus className="size-4" /> {t("Create tracking link")}</button>
        </span>
      </div>
      <div className="of-scroll mt-3 overflow-x-auto rounded-md">
        <table className="w-full min-w-[2300px] text-[14px]">
          <thead>
            <tr className="text-left" style={{ background: "var(--of-card)" }}>
              <th className="w-12 px-4 py-4"><input type="checkbox" checked={!!shown.length && shown.every((l) => picked.has(l.id))} onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((l) => l.id)) : new Set())} /></th>
              <th className="sticky left-0 z-10 px-3 py-4 font-medium" style={{ background: "var(--of-card)" }}>{t("Tracking link")}</th>
              {cols.map(([h, tip]) => (
                <th key={h} className="px-3 py-4 font-medium whitespace-nowrap">
                  <span className="flex items-center gap-1.5">{t(h)} {tip ? <span title={t(tip)}><Info className="size-3.5" style={{ color: "var(--of-muted)" }} /></span> : null}</span>
                </th>
              ))}
              <th className="sticky right-0 px-3 py-4 font-medium" style={{ background: "var(--of-card)" }}>{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} className="border-b" style={{ borderColor: "var(--of-line)", opacity: l.active ? 1 : 0.55 }}>
                <td className="px-4"><input type="checkbox" checked={picked.has(l.id)} onChange={() => setPicked((s) => (s.has(l.id) ? (s.delete(l.id), new Set(s)) : new Set(s.add(l.id))))} /></td>
                <td className="sticky left-0 z-10 px-3 py-2.5" style={{ background: "var(--of-page)" }}>
                  <p className="max-w-[260px] truncate">{l.name}</p>
                  <button onClick={() => copy(l)} className="text-[12px] font-semibold" style={{ color: ORANGE }}>{t("Copy link")}</button>
                </td>
                <td className="px-3">{ymd(l.createdAt)}</td>
                <td className="px-3">{l.clicks}</td>
                <td className="px-3">{l.subs}</td>
                <td className="px-3">{pct(l.subCvr)}</td>
                <td className="px-3 font-mono">{usd(l.cost)}</td>
                <td className="px-3 font-mono">{usd(l.earnings)}</td>
                <td className="px-3">{l.spenders}</td>
                <td className="px-3">{pct(l.spendCvr)}</td>
                <td className="px-3 font-mono">{usd(l.profit)}</td>
                <td className="px-3 font-mono">{usd(l.cpc)}</td>
                <td className="px-3 font-mono">{usd(l.epc)}</td>
                <td className="px-3 font-mono">{usd(l.cps)}</td>
                <td className="px-3 font-mono">{usd(l.aeps)}</td>
                <td className="px-3">{pct(l.roi)}</td>
                <td className="px-3">{l.source}</td>
                <td className="px-3">{l.tags.join(", ")}</td>
                <td className="px-3">{l.listName ? <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: "#e0567f" }} />{l.listName}</span> : ""}</td>
                <td className="px-3 leading-tight whitespace-nowrap">{new Date(l.updatedAt).toLocaleString("sv-SE").replace(/-/g, "/").replace(" ", "\n")}</td>
                <td className="sticky right-0 px-3" style={{ background: "var(--of-page)" }}>
                  <span className="flex gap-2">
                    <button onClick={() => setDetail(l)} className="rounded px-3 py-1 text-[14px]" style={{ background: "var(--of-card)" }}>{t("Details")}</button>
                    <button onClick={() => setEdit(l)} className="rounded px-3 py-1 text-[14px]" style={{ background: "var(--of-card)" }}>{t("Edit")}</button>
                  </span>
                </td>
              </tr>
            ))}
            {data && !shown.length ? <tr><td colSpan={22} className="py-14 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[14px]">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid size-8 place-items-center rounded disabled:opacity-30" style={{ background: "var(--of-card)" }}>‹</button>
        {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 10).map((n) => (
          <button key={n} onClick={() => setPage(n)} className="grid size-8 place-items-center rounded" style={n === page ? { background: "var(--of-card)", fontWeight: 600 } : undefined}>{n}</button>
        ))}
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="grid size-8 place-items-center rounded disabled:opacity-30" style={{ background: "var(--of-card)" }}>›</button>
        <span className="ml-4">{t("Per page")}</span>
        <select value={per} onChange={(e) => (setPer(Number(e.target.value)), setPage(1))} className="h-8 rounded bg-transparent px-2" style={{ background: "var(--of-card)" }}>
          {[20, 50, 100].map((n) => <option key={n} value={n} style={{ background: "#222" }}>{n}</option>)}
        </select>
      </div>
      {edit && cid ? <EditLink creatorId={cid} link={edit} sources={data?.sources ?? []} tags={data?.tags ?? []} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), load())} t={t} /> : null}
    </div>
  );
}

function Switch({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      {label}
      <button role="switch" aria-checked={on} onClick={() => set(!on)} className="relative h-[26px] w-11 rounded-full transition-colors" style={{ background: on ? ORANGE : "var(--of-line)" }}>
        <span className="absolute top-[3px] size-5 rounded-full bg-white transition-all" style={{ left: on ? 21 : 3 }} />
      </button>
    </label>
  );
}

function Multi({ icon: I, label, options, value, set, t }: { icon: typeof Tag; label: string; options: string[]; value: string[]; set: (v: string[]) => void; t: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex h-10 items-center gap-2 rounded-md px-3" style={{ background: "var(--of-card)", color: value.length ? "var(--of-text)" : "var(--of-muted)" }}>
        <I className="size-4" /> {label}{value.length ? ` · ${value.length}` : ""} <ChevronDown className="size-4" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onMouseDown={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 w-56 rounded-md border p-2 shadow-xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
            <label className="mb-1 flex h-8 items-center gap-2 rounded px-2" style={{ background: "var(--of-page)" }}><Search className="size-3.5" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search")} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /></label>
            <div className="of-scroll max-h-72 overflow-y-auto">
              {options.filter((o) => !q || o.toLowerCase().includes(q.toLowerCase())).map((o) => (
                <label key={o} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-[14px]">
                  <input type="checkbox" checked={value.includes(o)} onChange={() => set(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])} /> {o}
                </label>
              ))}
              {!options.length ? <p className="px-2 py-2 text-[13px]" style={{ color: "var(--of-muted)" }}>{t("No Data")}</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** « Create tracking link » (et modification). */
function EditLink({ creatorId, link, sources, tags, onClose, onSaved, t }: { creatorId: string; link: Partial<Link>; sources: string[]; tags: string[]; onClose: () => void; onSaved: () => void; t: (s: string) => string }) {
  const [v, setV] = useState({ name: link.name ?? "", source: link.source ?? "OnlyFans", dest: link.dest ?? "https://onlyfans.com/", cost: link.cost ? String(link.cost) : "", tags: link.tags ?? [], listId: link.listId ?? "", listName: link.listName ?? "" });
  const [lists, setLists] = useState<FanList[]>([]);
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<FanList[]>("GET", `/api/fan-lists?creatorId=${encodeURIComponent(creatorId)}`).then(setLists).catch(() => {});
  }, [creatorId]);
  const allTags = [...new Set([...tags, ...v.tags])];
  const save = async () => {
    setBusy(true);
    try {
      await api("POST", "/api/track/links", { creatorId, id: link.id, name: v.name, source: v.source, dest: v.dest, cost: Number(v.cost) || 0, tags: v.tags, listId: v.listId || null, listName: v.listName || null });
      toast(t("Tracking link saved"));
      onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const box = "mt-2 w-full rounded-md px-3 py-2.5 text-[15px] outline-none";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[600px] rounded-xl" style={{ background: "#171717", color: "#fff" }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "#2a2a2a" }}>
          <h3 className="text-[22px] font-semibold">{t(link.id ? "Edit tracking link" : "Create tracking link")}</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-md" style={{ background: "#2a2a2a" }}><X className="size-4" /></button>
        </div>
        <div className="of-scroll max-h-[70vh] overflow-y-auto px-5 py-4 text-[15px]">
          <p>{t("Tracking link name")}</p>
          <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={box} style={{ background: "#262626" }} />
          <p className="mt-4">{t("Source")}</p>
          <select value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} className={box} style={{ background: "#262626" }}>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <p className="mt-4">{t("Destination (OnlyFans page)")}</p>
          <input value={v.dest} onChange={(e) => setV({ ...v, dest: e.target.value })} className={box} style={{ background: "#262626" }} />
          <p className="mt-4">{t("Promo cost")} <span className="text-[13px]" style={{ color: "#999" }}>{t("Optional")}</span></p>
          <label className={`${box} flex items-center gap-2`} style={{ background: "#262626" }}>$<input value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value.replace(/[^\d.]/g, "") })} className="min-w-0 flex-1 bg-transparent outline-none" /></label>
          <p className="mt-4">{t("Tag")} <span className="text-[13px]" style={{ color: "#999" }}>{t("Optional")}</span></p>
          <div className="mt-2 rounded-md p-2" style={{ background: "#262626" }}>
            {allTags.map((tg) => (
              <label key={tg} className="flex items-center gap-2 px-1 py-1"><input type="checkbox" checked={v.tags.includes(tg)} onChange={() => setV({ ...v, tags: v.tags.includes(tg) ? v.tags.filter((x) => x !== tg) : [...v.tags, tg] })} /> {tg}</label>
            ))}
            <div className="mt-1 flex items-center gap-2 px-1">
              <Plus className="size-4" />
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newTag.trim() && (setV({ ...v, tags: [...v.tags, newTag.trim()] }), setNewTag(""))} placeholder={t("Add Tag")} className="min-w-0 flex-1 bg-transparent outline-none" />
            </div>
          </div>
          <p className="mt-4">{t("List")} <span className="text-[13px]" style={{ color: "#999" }}>{t("Optional")}</span></p>
          <select value={v.listId} onChange={(e) => setV({ ...v, listId: e.target.value, listName: lists.find((l) => l.id === e.target.value)?.name ?? "" })} className={box} style={{ background: "#262626" }}>
            <option value="">—</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <p className="mt-2 text-[12px]" style={{ color: "#999" }}>{t("Fans who join through this link will be added to this list as soon as Substy allows it; for now the list is kept with the link.")}</p>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "#2a2a2a" }}>
          <button onClick={onClose} className="h-10 rounded-lg px-4" style={{ background: "#2a2a2a" }}>{t("Cancel")}</button>
          <button disabled={busy || !v.name.trim()} onClick={save} className="h-10 rounded-lg px-5 text-white disabled:opacity-40" style={{ background: ORANGE }}>{t("Save")}</button>
        </div>
      </div>
    </div>
  );
}

/** « Details » : fans arrivés par le lien et ce qu'ils ont dépensé. */
function Details({ link, net, onBack, t }: { link: Link; net: boolean; onBack: () => void; t: (s: string) => string }) {
  type Fan = { fanId: string; name: string; username: string | null; total: number; subs: number; posts: number; messages: number; streams: number; tips: number };
  const [fans, setFans] = useState<Fan[] | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const per = 50;
  useEffect(() => {
    api<{ fans: Fan[] }>("GET", `/api/track/details?id=${link.id}&net=${net ? 1 : 0}`).then((r) => setFans(r.fans)).catch((e) => toast((e as Error).message, "err"));
  }, [link.id, net]);
  const rows = (fans ?? []).filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
  const sum = (k: keyof Fan) => rows.reduce((a, f) => a + (Number(f[k]) || 0), 0);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  return (
    <div className="min-h-full p-4 md:p-5" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[14px]" style={{ background: "var(--of-card)" }}><ArrowLeft className="size-4" /> {t("Tracking links")}</button>
        <h1 className="text-[20px] font-semibold">{t("Details")}</h1>
      </div>
      <h2 className="mt-5 text-[22px]">{link.name}</h2>
      <label className="mt-4 flex h-9 w-[200px] items-center gap-2 rounded-md px-3 text-[14px]" style={{ background: "var(--of-card)" }}>
        <Search className="size-4" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search fan name")} className="min-w-0 flex-1 bg-transparent outline-none" />
      </label>
      <p className="mt-3 flex items-center justify-between text-[14px]" style={{ color: "var(--of-muted)" }}>
        <span className="flex items-center gap-1.5"><Info className="size-3.5" /> {t("Subscribers are matched every 2 minutes.")}</span>
        <span>{t("Last updated")}: {new Date().toLocaleDateString("sv-SE").replace(/-/g, "/")} (UTC+01:00)</span>
      </p>
      <div className="of-scroll mt-2 overflow-x-auto">
        <table className="w-full min-w-[900px] text-[15px]">
          <thead>
            <tr className="text-left" style={{ background: "var(--of-card)" }}>
              {["Fan", "Total", "Subs", "Posts", "Messages", "Streams", "Tips"].map((h) => <th key={h} className="px-3 py-3 font-medium">{t(h)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice((page - 1) * per, page * per).map((f) => (
              <tr key={f.fanId} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                <td className="px-3 py-2 leading-tight">{f.name}<br /><span className="text-[13px]" style={{ color: "var(--of-muted)" }}>@{f.username || f.fanId}</span></td>
                {(["total", "subs", "posts", "messages", "streams", "tips"] as const).map((k) => <td key={k} className="px-3 font-mono">{usd(f[k])}</td>)}
              </tr>
            ))}
            {fans && !rows.length ? <tr><td colSpan={7} className="py-12 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</td></tr> : null}
            {rows.length ? (
              <tr className="border-b-2 font-semibold" style={{ borderColor: "var(--of-text)" }}>
                <td className="px-3 py-3">{t("Total")}:</td>
                {(["total", "subs", "posts", "messages", "streams", "tips"] as const).map((k) => <td key={k} className="px-3 font-mono">{usd(sum(k))}</td>)}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[14px]">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="grid size-8 place-items-center rounded disabled:opacity-30" style={{ background: "var(--of-card)" }}>‹</button>
        <span className="grid size-8 place-items-center rounded" style={{ background: "var(--of-card)" }}>{page}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="grid size-8 place-items-center rounded disabled:opacity-30" style={{ background: "var(--of-card)" }}>›</button>
        <span className="ml-4">{t("Per page")} 50</span>
      </div>
    </div>
  );
}
