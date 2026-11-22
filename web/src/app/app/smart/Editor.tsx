"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Clock, Megaphone, Plus, Save, Search, Send, Trash2, X } from "lucide-react";
import { mediaThumb } from "@/rv/lib/client";
import { api, toast } from "@/lib/api";
import type { Media } from "@/rv/inbox/types";
import { VaultPicker } from "@/rv/inbox/VaultPicker";
import { QUICK } from "@/app/pro/emojis";

// Éditeur des Smart Messages (Infloww) : « Send to » (listes incluses / exclues), règles (messages automatiques),
// « Scheduling » (tout de suite / date choisie), « Message » (collections, messages, prix du pack, médias).
export type Kind = "mass" | "welcome" | "purchase";
export type Msg = { text: string; medias: { id: string; type?: string; thumb?: string | null }[]; price: number; delay: number };
export type Draft = {
  id?: number;
  kind: Kind;
  include: { id: string; name: string }[];
  exclude: { id: string; name: string }[];
  scheduledAt: number | null;
  delayMin: number;
  delayMax: number;
  once: boolean;
  unsendOnReply: boolean;
  collections: { messages: Msg[] }[];
};
type FanList = { id: string; name: string; type: string; fans: number };
const BLUE = "#2f6bff";
export const KIND_LABEL: Record<Kind, string> = { mass: "OF mass message", welcome: "Subscriber welcome", purchase: "Purchases" };
export const emptyDraft = (kind: Kind): Draft => ({ kind, include: [], exclude: [], scheduledAt: null, delayMin: 1, delayMax: 2, once: true, unsendOnReply: true, collections: [{ messages: [{ text: "", medias: [], price: 0, delay: 0 }] }] });

export function Editor({ creatorId, creatorName, initial, onBack, onDone, t }: { creatorId: string; creatorName: string; initial: Draft; onBack: () => void; onDone: () => void; t: (s: string) => string }) {
  const [d, setD] = useState<Draft>(initial);
  const [lists, setLists] = useState<FanList[] | null>(null);
  const [col, setCol] = useState(0);
  const [busy, setBusy] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [vault, setVault] = useState<number | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [fav, setFav] = useState<string[]>(QUICK);
  const [tour, setTour] = useState(0);
  const mass = d.kind === "mass";
  useEffect(() => {
    api<FanList[]>("GET", `/api/fan-lists?creatorId=${encodeURIComponent(creatorId)}`).then(setLists).catch(() => setLists([]));
    api<{ emojis: string[] | null }>("GET", "/api/pro/emojis").then((r) => r.emojis?.length && setFav(r.emojis)).catch(() => {});
    try {
      if (!localStorage.getItem("bloom.smart.tour")) setTour(1);
    } catch {}
  }, [creatorId]);
  const endTour = () => {
    setTour(0);
    try {
      localStorage.setItem("bloom.smart.tour", "1");
    } catch {}
  };
  const set = (o: Partial<Draft>) => setD((x) => ({ ...x, ...o }));
  const setMsg = (i: number, o: Partial<Msg>) => setD((x) => ({ ...x, collections: x.collections.map((c, ci) => (ci !== col ? c : { messages: c.messages.map((m, mi) => (mi === i ? { ...m, ...o } : m)) })) }));
  const cur = d.collections[col] ?? d.collections[0];

  const submit = async (publish: boolean) => {
    const first = d.collections[0]?.messages[0];
    if (!first || (!first.text.trim() && !first.medias.length)) return toast(t("Write the message first"), "err");
    setBusy(true);
    try {
      if (mass) {
        if (!publish) {
          localStorage.setItem(`bloom.smart.draft.${creatorId}`, JSON.stringify(d));
          toast(t("Draft saved on this computer"));
          return;
        }
        if (!d.include.length) return toast(t("Choose at least one list to send to"), "err");
        await api("POST", "/api/mass", {
          creatorId,
          text: first.text,
          price: first.price,
          mediaIds: first.medias.map((m) => m.id),
          includedListIds: d.include.map((l) => l.id),
          excludedListIds: d.exclude.map((l) => l.id),
          scheduledAt: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : undefined,
        });
        localStorage.removeItem(`bloom.smart.draft.${creatorId}`);
        toast(d.scheduledAt ? t("Mass message scheduled") : t("Mass message sent"));
      } else {
        await api("POST", "/api/smart/auto", {
          id: d.id,
          creatorId,
          trigger: d.kind,
          include: d.include,
          exclude: d.exclude,
          delayMin: d.delayMin,
          delayMax: d.delayMax,
          once: d.once,
          startsAt: d.scheduledAt,
          unsendOnReply: d.unsendOnReply,
          collections: d.collections,
          publish,
        });
        toast(publish ? t("Automated message published") : t("Automated message saved"));
      }
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-10">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-[18px]">
          <ChevronLeft className="size-5" /> {t("Back")}
        </button>
        <div className="relative">
          <button onClick={() => setKindOpen(!kindOpen)} className="flex h-8 items-center gap-2 rounded-md border px-3 text-[13px]" style={{ borderColor: "var(--of-line)" }}>
            <Megaphone className="size-4" /> {t(KIND_LABEL[d.kind])} <ChevronDown className="size-3.5" />
          </button>
          {kindOpen ? (
            <div className="absolute z-30 mt-1 w-52 rounded-md border p-1 shadow-xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <button key={k} onClick={() => (set({ kind: k, ...(k === "mass" ? { collections: [d.collections[0]] } : {}) }), setKindOpen(false), setCol(0))} className="block w-full rounded px-2.5 py-1.5 text-left text-[13px]" style={k === d.kind ? { color: BLUE } : undefined}>
                  {t(KIND_LABEL[k])}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <span className="text-[13px]" style={{ color: "var(--of-muted)" }}>{creatorName}</span>
        <div className="ml-auto flex gap-3">
          <button onClick={() => submit(false)} disabled={busy} className="flex h-10 items-center gap-2 rounded-md px-4 text-[14px] text-white disabled:opacity-50" style={{ background: BLUE }}>
            <Save className="size-4" /> {t("Save")}
          </button>
          <button onClick={() => submit(true)} disabled={busy} className="flex h-10 items-center gap-2 rounded-md px-4 text-[14px] text-white disabled:opacity-50" style={{ background: BLUE }}>
            <Send className="size-4" /> {t("Publish")}
          </button>
        </div>
      </div>

      {/* Send to */}
      <Section title={t("Send to")} tip={tour === 1 ? { title: t("Build your audience"), text: t("Send your message to a list. Exclude fans you don't want to reach (recent fans, people who already saw this content…)."), step: 1, onNext: () => setTour(2) } : null} t={t}>
        <div className="grid gap-5 md:grid-cols-2">
          <ListPicker title={t("Include")} lists={lists} value={d.include} onChange={(v) => set({ include: v, exclude: d.exclude.filter((x) => !v.some((y) => y.id === x.id)) })} t={t} />
          <ListPicker title={t("Exclude")} lists={lists} value={d.exclude} onChange={(v) => set({ exclude: v, include: d.include.filter((x) => !v.some((y) => y.id === x.id)) })} t={t} />
        </div>
        {!mass ? (
          <p className="mt-3 text-[12px]" style={{ color: "var(--of-muted)" }}>
            {t(d.kind === "welcome" ? "Sent to every new subscriber of the creator." : "Sent to fans right after they buy a PPV.")} {t("Lists are kept with the message; Bloom does not filter by list for automated messages yet.")}
          </p>
        ) : null}
      </Section>

      {/* Règles (messages automatiques) */}
      {!mass ? (
        <Section title={t("Rules")} t={t}>
          <div className="grid gap-4 text-[14px] md:grid-cols-2">
            <p className="flex items-center gap-2">⚡ {t(d.kind === "welcome" ? "Fan subscribes for the first time" : "Fan purchases a PPV")}</p>
            <p className="flex flex-wrap items-center gap-2">
              <Clock className="size-4" /> {t("Send after a random delay of")}
              <NumBox value={d.delayMin} set={(v) => set({ delayMin: v })} /> – <NumBox value={d.delayMax} set={(v) => set({ delayMax: v })} /> {t("minutes")}
            </p>
            <Check on={d.once} set={(v) => set({ once: v })} label={t("Send only once per fan")} />
            <Check on={d.unsendOnReply} set={(v) => set({ unsendOnReply: v })} label={t("When a fan replies, stop the rest of the sequence")} />
          </div>
        </Section>
      ) : null}

      {/* Scheduling */}
      <Section
        title={t("Scheduling")}
        right={
          <div className="relative">
            <button onClick={() => setDateOpen(!dateOpen)} className="flex h-9 items-center gap-2 rounded-md border px-3 text-[13px]" style={{ borderColor: "var(--of-line)" }}>
              <Clock className="size-4" />
              {d.scheduledAt ? new Date(d.scheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : t("Immediately")}
              <ChevronDown className="size-3.5" />
            </button>
            {dateOpen ? <DatePop value={d.scheduledAt} onPick={(v) => (set({ scheduledAt: v }), setDateOpen(false))} onClose={() => setDateOpen(false)} t={t} /> : null}
          </div>
        }
        tip={tour === 2 ? { title: t("Set the schedule"), text: t("Send now or choose a date and time."), step: 2, onNext: () => setTour(3) } : null}
        t={t}
      />

      {/* Message */}
      <Section title={t("Message")} tip={tour === 3 ? { title: t("Build a message sequence"), text: t("Write the message, add media and a price for the whole pack. Automated messages can have several collections and follow-ups."), step: 3, onNext: endTour, last: true } : null} t={t}>
        <div className="flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--of-line)" }}>
          <div className="w-[160px] shrink-0 p-4 text-[14px]" style={{ background: "var(--of-page)" }}>
            <p>{t("Collection")}</p>
            {d.collections.map((_, i) => (
              <button key={i} onClick={() => setCol(i)} className="mt-3 block w-full border-r-2 text-left" style={i === col ? { color: BLUE, borderColor: BLUE } : { borderColor: "transparent" }}>
                {t("Collection")}
                {i + 1}
              </button>
            ))}
            {!mass && d.collections.length < 10 ? (
              <button onClick={() => (set({ collections: [...d.collections, { messages: [{ text: "", medias: [], price: 0, delay: 0 }] }] }), setCol(d.collections.length))} className="mt-3 flex items-center gap-1 text-[13px]" style={{ color: BLUE }}>
                <Plus className="size-3.5" /> {t("Add")}
              </button>
            ) : null}
          </div>
          <div className="min-w-0 flex-1 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold">
                {t("Collection")}
                {col + 1}
              </p>
              {d.collections.length > 1 ? (
                <button onClick={() => (set({ collections: d.collections.filter((_, i) => i !== col) }), setCol(0))} title={t("Delete")}>
                  <Trash2 className="size-4" style={{ color: "#f26b6b" }} />
                </button>
              ) : null}
            </div>
            {cur.messages.map((m, i) => (
              <div key={i} className="mt-3 rounded-lg border" style={{ borderColor: "var(--of-line)", background: "var(--of-card)" }}>
                <div className="flex items-center justify-between border-b px-4 py-2.5 text-[13px]" style={{ borderColor: "var(--of-line)" }}>
                  <span>{i === 0 ? t("First message") : `${t("Follow-up")} ${i}`}</span>
                  {i > 0 ? (
                    <span className="flex items-center gap-2">
                      {t("after")} <NumBox value={m.delay} set={(v) => setMsg(i, { delay: v })} /> min
                      <button onClick={() => setD((x) => ({ ...x, collections: x.collections.map((c, ci) => (ci !== col ? c : { messages: c.messages.filter((_, mi) => mi !== i) })) }))}>
                        <Trash2 className="size-4" style={{ color: "#f26b6b" }} />
                      </button>
                    </span>
                  ) : null}
                </div>
                <textarea value={m.text} onChange={(e) => setMsg(i, { text: e.target.value })} rows={4} placeholder={t("Enter your message…")} className="w-full resize-none bg-transparent px-4 py-3 text-[14px] outline-none" />
                <div className="flex flex-wrap gap-x-2 gap-y-1 border-t px-4 py-2 text-[18px]" style={{ borderColor: "var(--of-line)" }}>
                  {fav.map((e) => (
                    <button key={e} onClick={() => setMsg(i, { text: m.text + e })} className="hover:scale-125">{e}</button>
                  ))}
                </div>
                <div className="border-t px-4 py-3" style={{ borderColor: "var(--of-line)" }}>
                  <div className="flex items-center justify-between text-[13px]">
                    <label className="flex items-center gap-2">
                      {t("Message price")}:$
                      <input value={m.price ? String(m.price) : ""} onChange={(e) => setMsg(i, { price: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) })} placeholder="0.00" className="h-8 w-24 rounded border bg-transparent px-2 outline-none" style={{ borderColor: "var(--of-line)" }} />
                    </label>
                    <span>
                      <span style={{ color: BLUE }}>{m.price ? m.medias.length : 0}</span> {t("of")} {m.medias.length} {t("selected as PPV")}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.medias.map((x) => (
                      <span key={x.id} className="relative size-[88px] overflow-hidden rounded-md" style={{ background: "#333" }}>
                        {x.thumb ? <img src={x.thumb} alt="" className="size-full object-cover" /> : null}
                        <button onClick={() => setMsg(i, { medias: m.medias.filter((y) => y.id !== x.id) })} className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/60 text-white">
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                    <button onClick={() => setVault(i)} className="grid size-[88px] place-items-center rounded-md border border-dashed text-[12px]" style={{ borderColor: "var(--of-line)", color: BLUE }}>
                      <span className="text-center">
                        <Plus className="mx-auto size-5" />
                        {t("Select")}
                      </span>
                    </button>
                  </div>
                  {m.price && m.price < 3 ? <p className="mt-2 text-[12px]" style={{ color: "#f26b6b" }}>{t("Minimum $3 USD or free")}</p> : null}
                </div>
                <div className="border-t px-4 py-3 text-[13px]" style={{ borderColor: "var(--of-line)" }}>
                  <p>{t("Tag other Creator(s)")}</p>
                  <button onClick={() => toast(t("Tagging creators is not available with Substy yet"), "err")} className="mt-2 rounded-full border px-3 py-1" style={{ borderColor: BLUE, color: BLUE }}>
                    + {t("Add Creator")}
                  </button>
                </div>
              </div>
            ))}
            {!mass && cur.messages.length < 10 ? (
              <button onClick={() => setD((x) => ({ ...x, collections: x.collections.map((c, ci) => (ci !== col ? c : { messages: [...c.messages, { text: "", medias: [], price: 0, delay: 2 }] })) }))} className="mt-3 flex items-center gap-1 text-[13px]" style={{ color: BLUE }}>
                <Plus className="size-4" /> {t("Add a follow-up message")}
              </button>
            ) : null}
          </div>
        </div>
      </Section>

      {vault !== null ? (
        <VaultPicker
          modelId={creatorId}
          memberId={null}
          selected={[]}
          onClose={() => setVault(null)}
          onPick={(l: Media[]) => {
            setMsg(vault, { medias: [...(cur.messages[vault]?.medias ?? []), ...l.map((x) => ({ id: x.id, type: x.type, thumb: mediaThumb(x) || null }))] });
            setVault(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Section({ title, children, right, tip, t }: { title: string; children?: React.ReactNode; right?: React.ReactNode; tip?: { title: string; text: string; step: number; onNext: () => void; last?: boolean } | null; t: (s: string) => string }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="relative mt-5 rounded-xl border" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
      <div className="flex items-center justify-between px-6 py-5">
        <h3 className="text-[16px] font-semibold">{title}</h3>
        {right ?? (children ? (
          <button onClick={() => setOpen(!open)}>
            <ChevronDown className={`size-5 transition-transform ${open ? "" : "-rotate-90"}`} />
          </button>
        ) : null)}
      </div>
      {children && open ? <div className="border-t px-6 py-5" style={{ borderColor: "var(--of-line)" }}>{children}</div> : null}
      {tip ? (
        <div className="absolute top-12 left-6 z-30 w-[330px] rounded-lg p-4 shadow-2xl" style={{ background: "var(--of-pop)", border: "1px solid var(--of-line)" }}>
          <p className="text-[16px] font-semibold">{tip.title}</p>
          <p className="mt-2 text-[14px]" style={{ color: "var(--of-muted)" }}>{tip.text}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="flex gap-2 text-[11px]">
              {[1, 2, 3].map((n) => (
                <span key={n} style={{ color: n === tip.step ? BLUE : "var(--of-muted)" }}>{n}</span>
              ))}
            </span>
            <button onClick={tip.onNext} className="rounded-md px-4 py-1.5 text-[14px] text-white" style={{ background: BLUE }}>{t(tip.last ? "Got it" : "Next")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ListPicker({ title, lists, value, onChange, t }: { title: string; lists: FanList[] | null; value: { id: string; name: string }[]; onChange: (v: { id: string; name: string }[]) => void; t: (s: string) => string }) {
  const [q, setQ] = useState("");
  const on = useMemo(() => new Set(value.map((v) => v.id)), [value]);
  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--of-line)" }}>
      <p className="border-b px-4 py-3 text-[14px] font-semibold" style={{ borderColor: "var(--of-line)" }}>
        {title} {value.length ? <span style={{ color: BLUE }}>· {value.length}</span> : null}
      </p>
      <div className="p-4">
        <label className="flex h-9 items-center gap-2 rounded-md border px-3" style={{ borderColor: "var(--of-line)" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search lists")} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
          <Search className="size-4" style={{ color: "var(--of-muted)" }} />
        </label>
        <div className="of-scroll mt-3 max-h-[300px] overflow-y-auto pr-1">
          {lists === null ? <p className="py-4 text-[13px]" style={{ color: "var(--of-muted)" }}>{t("Loading…")}</p> : null}
          {(lists ?? [])
            .filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()))
            .map((l) => (
              <label key={l.id} className="flex cursor-pointer items-start gap-3 py-2.5">
                <input type="checkbox" checked={on.has(l.id)} onChange={() => onChange(on.has(l.id) ? value.filter((v) => v.id !== l.id) : [...value, { id: l.id, name: l.name }])} className="mt-1" />
                <span>
                  <span className="block text-[14px] font-semibold">{l.name}</span>
                  <span className="text-[13px]" style={{ color: "var(--of-muted)" }}>{l.fans.toLocaleString("en-US")} {t("fans in the list")}</span>
                </span>
              </label>
            ))}
        </div>
      </div>
    </div>
  );
}

function NumBox({ value, set }: { value: number; set: (v: number) => void }) {
  return <input value={String(value)} onChange={(e) => set(Math.max(0, Math.min(1440, Number(e.target.value.replace(/\D/g, "")) || 0)))} className="h-8 w-14 rounded border bg-transparent px-2 text-center outline-none" style={{ borderColor: "var(--of-line)" }} />;
}
function Check({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  );
}

/** « Immediately » / « Custom date » (jour puis heure). */
function DatePop({ value, onPick, onClose, t }: { value: number | null; onPick: (v: number | null) => void; onClose: () => void; t: (s: string) => string }) {
  const [custom, setCustom] = useState(!!value);
  const init = value ? new Date(value) : new Date(Date.now() + 30 * 60_000);
  const [day, setDay] = useState(init.toISOString().slice(0, 10));
  const [time, setTime] = useState(`${String(init.getHours()).padStart(2, "0")}:${String(init.getMinutes()).padStart(2, "0")}`);
  const at = new Date(`${day}T${time}:00`).getTime();
  return (
    <>
      <div className="fixed inset-0 z-30" onMouseDown={onClose} />
      <div className="absolute right-0 z-40 mt-1 w-64 rounded-md border p-2 shadow-xl" style={{ background: "var(--of-card)", borderColor: "var(--of-line)" }}>
        <button onClick={() => onPick(null)} className="block w-full rounded px-2.5 py-1.5 text-left text-[13px]" style={!custom ? { color: BLUE } : undefined}>{t("Immediately")}</button>
        <button onClick={() => setCustom(true)} className="block w-full rounded px-2.5 py-1.5 text-left text-[13px]" style={custom ? { color: BLUE } : undefined}>{t("Custom date")}</button>
        {custom ? (
          <div className="mt-2 flex flex-col gap-2 px-2.5 pb-2">
            <input type="date" value={day} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDay(e.target.value)} className="h-9 rounded border bg-transparent px-2" style={{ borderColor: "var(--of-line)", colorScheme: "dark" }} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 rounded border bg-transparent px-2" style={{ borderColor: "var(--of-line)", colorScheme: "dark" }} />
            <button disabled={!(at > Date.now() + 60_000)} onClick={() => onPick(at)} className="h-9 rounded text-[13px] text-white disabled:opacity-40" style={{ background: BLUE }}>{t("Next")}</button>
          </div>
        ) : null}
      </div>
    </>
  );
}

