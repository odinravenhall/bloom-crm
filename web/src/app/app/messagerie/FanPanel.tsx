"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { ago, usd } from "@/lib/fmt";
import type { Fan, FanMeta, Library } from "@/lib/types";
import { Avatar, Pill } from "@/components/ui";

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Fiche du fan (dépenses, abonnement, listes) à droite de la conversation, sur grand écran. */
export function FanPanel({ creatorId, fanId, onLoaded }: { creatorId: string; fanId: string; onLoaded: (f: Fan) => void }) {
  const [f, setF] = useState<Fan | null>(null);
  const [err, setErr] = useState("");
  const cb = useRef(onLoaded);
  cb.current = onLoaded;
  useEffect(() => {
    let off = false;
    setF(null);
    api<Fan>("GET", `/api/fan?creatorId=${encodeURIComponent(creatorId)}&fanId=${encodeURIComponent(fanId)}`)
      .then((x) => {
        if (off) return;
        setF(x);
        cb.current(x);
      })
      .catch((e) => !off && setErr((e as Error).message));
    return () => {
      off = true;
    };
  }, [creatorId, fanId]);

  const kv = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-2 border-b border-line/60 py-1.5 text-[13px]">
      <span className="text-muted">{k}</span>
      <b className="tabular-nums">{v}</b>
    </div>
  );
  const h = (t: string) => <p className="mt-4 mb-1 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{t}</p>;

  return (
    <aside className="scroll-thin hidden w-[300px] shrink-0 overflow-y-auto border-l bg-panel p-4 xl:block">
      {!f ? (
        <p className="text-sm text-muted">{err || "Chargement…"}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Avatar src={f.avatar} name={f.name} size="size-12" />
            <div className="min-w-0">
              <p className="truncate font-bold">{f.name}</p>
              <p className="truncate text-xs text-muted">{f.username ? "@" + f.username : ""}</p>
            </div>
          </div>
          <FanNotes creatorId={creatorId} fanId={fanId} />
          {h("Dépenses")}
          <p className="text-2xl font-extrabold tabular-nums">{usd(f.spend.net)}</p>
          <p className="text-xs text-muted">
            net · {f.spend.purchases || 0} achat{f.spend.purchases > 1 ? "s" : ""}
            {f.spend.last ? " · dernier le " + d(f.spend.last) : ""}
          </p>
          <div className="mt-2">
            {kv("Messages / PPV", usd(f.breakdown.messages))}
            {kv("Pourboires", usd(f.breakdown.tips))}
            {kv("Abonnements", usd(f.breakdown.subscriptions))}
            {kv("Posts", usd(f.breakdown.posts))}
          </div>
          {f.subscription ? (
            <>
              {h("Abonnement")}
              {kv("Statut", f.subscription.status)}
              {kv("Depuis", d(f.subscription.since))}
              {kv("Renouvellement", f.subscription.canceled ? "annulé" : d(f.subscription.renews))}
              {kv("Prix", usd(f.subscription.price))}
            </>
          ) : null}
          {f.lists.length ? (
            <>
              {h("Listes")}
              <div className="flex flex-wrap gap-1">
                {f.lists.map((l) => (
                  <Pill key={l}>{l}</Pill>
                ))}
              </div>
            </>
          ) : null}
          <SentScripts creatorId={creatorId} fanId={fanId} />
          {f.lastPpv ? (
            <>
              {h("Dernier PPV acheté")}
              <p className="text-sm">{d(f.lastPpv)}</p>
            </>
          ) : null}
        </>
      )}
    </aside>
  );
}

const hd = (t: string) => <p className="mt-4 mb-1 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{t}</p>;

/** Tags et notes de l'équipe sur ce fan (gardés dans Bloom, pour cette créatrice). Les notes s'enregistrent toutes seules. */
function FanNotes({ creatorId, fanId }: { creatorId: string; fanId: string }) {
  const [m, setM] = useState<FanMeta | null>(null);
  const [notes, setNotes] = useState("");
  const [tag, setTag] = useState("");
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setM(null);
    api<FanMeta>("GET", `/api/fan-meta?creatorId=${encodeURIComponent(creatorId)}&fanId=${encodeURIComponent(fanId)}`)
      .then((x) => {
        setM(x);
        setNotes(x.notes);
      })
      .catch(() => {});
  }, [creatorId, fanId]);
  const post = (body: Record<string, unknown>) => api("POST", "/api/fan-meta", { creatorId, fanId, ...body });
  const onNotes = (v: string) => {
    setNotes(v);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => post({ notes: v }).then(() => setSaved(true)).catch(() => {}), 700);
  };
  const setTags = (tags: string[]) => {
    setM((x) => x && { ...x, tags });
    post({ tags }).catch(() => {});
  };
  if (!m) return null;
  return (
    <>
      {hd("Tags")}
      <div className="flex flex-wrap items-center gap-1">
        {m.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-petal px-2 py-0.5 text-[11px] font-semibold text-primary-soft">
            {t}
            <button onClick={() => setTags(m.tags.filter((x) => x !== t))} title="Retirer">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tag.trim()) {
              setTags([...m.tags, tag.trim()]);
              setTag("");
            }
          }}
          placeholder="+ tag (Entrée)"
          className="h-6 w-24 rounded-full border border-dashed bg-transparent px-2 text-[11px] outline-none focus:border-primary"
        />
      </div>
      {hd("Notes de l’équipe")}
      <textarea
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
        placeholder="Prénom, âge, ce qu’il aime, ses limites… (visible par toute l’équipe)"
        className="min-h-24 w-full resize-y rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-primary"
      />
      <p className="text-[10px] text-muted">
        {saved ? (m.notesBy && m.notesAt ? `Modifiées ${ago(m.notesAt)} par ${m.notesBy}` : "Enregistrées toutes seules") : "Enregistrement…"}
      </p>
    </>
  );
}

/** Scripts de Bloom déjà envoyés à ce fan (séquences : où il en est). */
function SentScripts({ creatorId, fanId }: { creatorId: string; fanId: string }) {
  const [lib, setLib] = useState<Library | null>(null);
  useEffect(() => {
    api<Library>("GET", `/api/lib?creatorId=${encodeURIComponent(creatorId)}&fanId=${encodeURIComponent(fanId)}`)
      .then(setLib)
      .catch(() => setLib(null));
  }, [creatorId, fanId]);
  const used = (lib?.groups ?? []).filter((g) => g.items.some((i) => i.sent));
  if (!used.length) return null;
  return (
    <>
      {hd("Scripts envoyés")}
      <div className="flex flex-col gap-1.5">
        {used.map((g) => {
          const sent = g.items.filter((i) => i.sent).length;
          const bought = g.items.filter((i) => i.sent?.bought).length;
          return (
            <div key={g.id} className="rounded-xl border bg-card px-3 py-2 text-[12px]">
              <p className="flex items-center gap-1.5 font-semibold">
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                {g.kind === "sequence" && sent >= g.items.length ? <Check className="size-3.5 text-good" /> : null}
              </p>
              <p className="text-muted">
                {g.kind === "sequence" ? `${sent}/${g.items.length} étapes` : `${sent} script${sent > 1 ? "s" : ""}`}
                {bought ? ` · ${bought} acheté${bought > 1 ? "s" : ""}` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}
