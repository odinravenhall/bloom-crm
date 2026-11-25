"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FolderInput, ListOrdered, MousePointerClick, Pencil, Plus, RefreshCw, Sparkles, Upload, UploadCloud } from "lucide-react";
import { api, toast } from "@/lib/api";
import type { Pf } from "@/lib/platform";
import { Avatar } from "@/rv/components/ui";
import { Confirm, Modal, PALETTE, Ring, RowMenu } from "../kit";
import {
  clockOf, countsOf, EMPTY_QUERY, errText, MediaFilters, MediaFolders, MediaGrid, MediaTile, MediaView, plural, priceOf, TYPE_NAME, useDebounced, useMediaHead, useMediaItems,
  type MediaCat, type MediaFolder, type MediaHead, type MediaItem, type MediaQuery,
} from "./MediaKit";

// Bloom v2 → Médias : le MÊME écran pour OnlyFans et MYM (25/11/2026, « Constellation »). Il remplace, dans la v2, la
// copie d'Infloww (Vault Pro) et celle de MyPulse (Votre Studio + Importer des médias). À gauche les modèles, puis les
// dossiers de la plateforme (listes du vault OnlyFans, collections du compte MYM) et les catégories de Bloom ; à
// droite la grille. Un clic ouvre le média en grand avec ce qu'on en sait : scripts qui l'utilisent, description et
// mots-clés de l'IA de Substy, et la fiche que l'équipe remplit (note, mots-clés, prix conseillé).
// Lecture : « /api/v2/medias… » (app/v2medias.mjs). Écriture : fiche et catégories par « /api/vaultpro/… » ; côté MYM,
// importer / créer une collection / ranger par « /api/mym/cloud/… » (ces deux derniers jamais vérifiés sur un vrai compte).
type Win =
  | null
  | { kind: "detail"; m: MediaItem }
  | { kind: "batch" }
  | { kind: "move" }
  | { kind: "name"; what: "cat" | "collection"; cat?: MediaCat }
  | { kind: "upload" }
  | { kind: "confirm"; title: string; text: string; button: string; go: () => Promise<unknown> };
type Info = { ai: { context: string; tags: string[]; scripts: string[]; steps: string[] } | null; bloom: { script: string; message: string }[] };

/** Ce que Bloom garde d'un média quand on lui fait une fiche (adresses qui ne périment pas, sinon rien). */
const snapOf = (m: MediaItem) => ({ id: m.id, type: m.type, thumb: m.keepThumb, full: m.keepFull, duration: m.duration, createdAt: m.createdAt, caption: m.caption });
const labelsOf = (s: string) => s.split(/[,\n]+/).map((x) => x.replace(/^#/, "").trim()).filter(Boolean).slice(0, 20);
const amountOf = (s: string) => {
  const n = Number(s.replace(",", "."));
  return n > 0 ? Math.round(n * 100) / 100 : null;
};
const dayOf = (s: string | number | null) => (s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

/** `pf` = la plateforme affichée par cet onglet (envoyée au serveur : le cookie du menu est commun aux onglets). */
export function V2Medias({ pf }: { pf: Pf }) {
  const modelKey = `bloom.v2.medias.model.${pf}`;
  const [model, setModel] = useState(() => {
    try {
      return localStorage.getItem(modelKey) || "";
    } catch {
      return "";
    }
  });
  const { head, stale, err, reload } = useMediaHead(pf, model);
  const mid = head?.model?.id ?? "";
  const [base, setBase] = useState<MediaQuery>(EMPTY_QUERY);
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 400);
  const query = useMemo(() => ({ ...base, q: dq }), [base, dq]);
  // Pendant qu'on change de modèle, les médias de la nouvelle sont demandés en même temps que ses dossiers.
  const lib = useMediaItems(pf, stale || !head ? model : mid, query);
  const [picked, setPicked] = useState<Map<string, MediaItem>>(new Map());
  const [selecting, setSelecting] = useState(false);
  const [win, setWin] = useState<Win>(null);
  const [spin, setSpin] = useState(false);

  const mym = pf === "mym";
  const pfName = mym ? "MYM" : "OnlyFans";
  const cur = head?.currency ?? (mym ? "EUR" : "USD");
  const canEdit = !!head?.canEdit;
  const m = head?.model ?? null;
  const pickModel = (id: string) => {
    setModel(id);
    setBase(EMPTY_QUERY);
    setQ("");
    setPicked(new Map());
    setSelecting(false);
    try {
      localStorage.setItem(modelKey, id);
    } catch {}
  };
  const colorOf = (id: string) => PALETTE[Math.max(0, (head?.list ?? []).findIndex((x) => x.id === id)) % PALETTE.length];
  const toggle = (x: MediaItem) => {
    const next = new Map(picked);
    if (next.has(x.id)) next.delete(x.id);
    else next.set(x.id, x);
    setPicked(next);
  };
  const clear = () => (setPicked(new Map()), setSelecting(false));
  const refresh = async () => {
    setSpin(true);
    await Promise.all([reload(true), lib.reload()]);
    setSpin(false);
  };
  /** Une fiche (ou plusieurs) vient d'être enregistrée : on la reporte sur la grille et on relit les compteurs. */
  const saved = (ids: string[], part: Partial<MediaItem>) => {
    lib.patch(ids, part);
    if (query.cat && "catId" in part && part.catId !== query.cat) void lib.reload();
    void reload();
  };

  const folder: MediaFolder | null = head && query.folder ? head.folders.find((f) => f.id === query.folder) ?? null : null;
  const cat: MediaCat | null = head && query.cat ? head.cats.find((c) => c.id === query.cat) ?? null : null;
  const title = cat ? cat.name : folder ? folder.name : "Tous les médias";
  const about = cat ? (cat.count ? plural(cat.count, "média") : "vide") : folder ? countsOf(folder) : lib.total != null ? plural(lib.total, "média") : mym ? "Tout le MYM Cloud" : "Tout le vault";
  const n = picked.size;
  const list = [...picked.values()];
  const filtered = !!(query.q || query.type || query.scripts);

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">Chatting · {pfName}</p>
          <h1 className="v2-h1 mt-1">Médias</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {m ? <button onClick={() => void refresh()} disabled={spin} className="v2-select" title={mym ? "Relire le MYM Cloud" : "Relire le vault d’OnlyFans"}><RefreshCw className={`size-4 text-muted ${spin ? "animate-spin" : ""}`} />Actualiser</button> : null}
          {m && mym ? <button onClick={() => setWin({ kind: "upload" })} className="v2-btn" style={{ height: 36 }} title={`Envoyer des photos ou des vidéos dans le MYM Cloud de ${m.name}`}><Upload className="size-4" />Importer des médias</button> : null}
        </div>
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {head?.error ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(251 191 36 / 0.3)", background: "rgb(251 191 36 / 0.07)", color: "#fbbf24" }}>{head.error}</p> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
        {/* La colonne des modèles */}
        <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 1 }}>
          <div className="v2-card p-1.5">
            <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Modèles</p>
            <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:max-h-[calc(100dvh-200px)] lg:space-y-0.5 lg:overflow-y-auto">
              {(head?.list ?? []).map((x) => (
                <button key={x.id} onClick={() => pickModel(x.id)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={mid === x.id} aria-pressed={mid === x.id} title={`Voir les médias de ${x.name}`}>
                  <Ring color={colorOf(x.id)}><Avatar src={x.avatar} name={x.name} size="size-8" /></Ring>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] leading-tight">{x.name}</b>
                    <span className="mt-0.5 block truncate text-[11.5px] text-muted">{x.fiches ? plural(x.fiches, "fiche remplie", "fiches remplies") : mym ? "MYM Cloud" : "Vault OnlyFans"}</span>
                  </span>
                </button>
              ))}
              {head && !head.list.length ? <p className="px-2 py-3 text-[12.5px] text-muted">Aucune modèle {pfName}.</p> : null}
              {!head ? <p className="px-2 py-3 text-[12.5px] text-muted">Chargement…</p> : null}
            </div>
          </div>
        </aside>

        <div className="min-w-0" style={{ opacity: stale ? 0.55 : 1, transition: "opacity 0.2s ease" }}>
          {head && !m ? <div className="v2-card v2-rise p-8 text-center text-[13.5px] text-muted">{mym ? "Aucun compte MYM relié pour l’instant." : "Aucune modèle OnlyFans pour l’instant."}</div> : null}
          {!head && !err ? <div className="v2-card p-8 text-center text-[13.5px] text-muted">Chargement…</div> : null}

          {head && m ? (
            <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
              {/* Les dossiers de la modèle */}
              <section className="v2-rise min-w-0 xl:sticky xl:top-4 xl:self-start" style={{ ["--i" as string]: 2 }}>
                <div className="v2-card v2-scroll p-2 xl:max-h-[calc(100dvh-110px)] xl:overflow-y-auto">
                  <MediaFolders
                    head={head}
                    query={query}
                    onPick={(part) => (setBase((b) => ({ ...b, ...part, type: part.folder && mym && b.type === "audio" ? "" : b.type, scripts: part.cat ? "" : b.scripts })), clear())}
                    tools={{
                      newFolder: mym ? <button type="button" onClick={() => setWin({ kind: "name", what: "collection" })} title="Nouvelle collection (créée dans le compte MYM)" aria-label="Nouvelle collection" className="grid size-5 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><Plus className="size-3.5" /></button> : undefined,
                      newCat: canEdit ? <button type="button" onClick={() => setWin({ kind: "name", what: "cat" })} title="Nouvelle catégorie" aria-label="Nouvelle catégorie" className="grid size-5 place-items-center rounded-md text-muted transition hover:bg-white/[0.07] hover:text-(--color-fg)"><Plus className="size-3.5" /></button> : undefined,
                      cat: canEdit
                        ? (c) => (
                            <RowMenu
                              name={`cat-${c.id}`}
                              items={[
                                { label: "Renommer", go: () => setWin({ kind: "name", what: "cat", cat: c }) },
                                {
                                  label: "Supprimer", danger: true,
                                  go: () => setWin({
                                    kind: "confirm", title: `Supprimer « ${c.name} » ?`, button: "Supprimer la catégorie",
                                    text: c.count ? `Ses ${plural(c.count, "média")} ne sont pas supprimés : ils restent dans le vault, simplement sans catégorie.` : "Cette catégorie est vide.",
                                    go: async () => {
                                      await api("POST", "/api/vaultpro/cats", { creatorId: mid, id: c.id, delete: true });
                                      toast("Catégorie supprimée");
                                      if (query.cat === c.id) setBase((b) => ({ ...b, cat: 0 }));
                                      await reload();
                                    },
                                  }),
                                },
                              ]}
                            />
                          )
                        : undefined,
                    }}
                  />
                  <p className="mt-3 border-t px-2 pt-2.5 pb-1 text-[11.5px] leading-relaxed text-muted" style={{ borderColor: "rgb(255 255 255 / 0.06)" }}>
                    {mym ? "Les collections sont celles du compte MYM de la modèle." : "Les listes viennent d’OnlyFans : on les crée et on y ajoute des médias là-bas, ils apparaissent ici aussitôt."}
                  </p>
                </div>
              </section>

              {/* Les médias */}
              <section className="v2-rise min-w-0" style={{ ["--i" as string]: 3 }}>
                <div className="v2-card p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pb-3">
                    <h2 className="min-w-0 truncate text-[16px] font-bold tracking-[-0.01em]">{title}</h2>
                    <p className="min-w-0 flex-1 text-[12.5px] text-muted">{about}{lib.items && (lib.next || filtered) ? ` · ${plural(lib.items.length, "affiché")}` : ""}</p>
                    <button type="button" onClick={() => (selecting || n ? clear() : setSelecting(true))} className="v2-tool" data-on={selecting || n > 0} title="Choisir plusieurs médias pour les ranger ou remplir leur fiche d’un coup"><MousePointerClick className="size-4" />{selecting || n ? "Terminer" : "Sélectionner"}</button>
                  </div>
                  <MediaFilters head={head} query={query} set={(part) => setBase((b) => ({ ...b, ...part }))} q={q} setQ={setQ} />
                  <div className="mt-3">
                    <MediaGrid lib={lib} empty={filtered ? "Aucun média ne correspond à ces filtres." : cat ? "Aucun média dans cette catégorie. Sélectionne des médias puis « Ranger »." : mym ? "Aucun média ici. « Importer des médias » en ajoute dans le MYM Cloud." : "Aucun média ici."}>
                      {(x) => <MediaTile m={x} cur={cur} on={picked.has(x.id)} selecting={selecting || n > 0} onMain={() => (selecting || n ? toggle(x) : setWin({ kind: "detail", m: x }))} onToggle={() => toggle(x)} />}
                    </MediaGrid>
                  </div>
                </div>
                {n ? (
                  <div className="sticky bottom-4 z-20 mt-4 px-2">
                    <div className="v2-card mx-auto flex max-w-[760px] flex-wrap items-center gap-2 px-3.5 py-2.5" style={{ background: "#121215", borderColor: "rgb(59 130 246 / 0.45)", boxShadow: "0 24px 60px -18px rgb(0 0 0 / 0.95)" }}>
                      <b className="text-[13px]">{plural(n, "média")} choisi{n > 1 ? "s" : ""}</b>
                      <button type="button" onClick={clear} className="v2-tool">Tout désélectionner</button>
                      <span className="flex-1" />
                      {canEdit ? <button type="button" onClick={() => setWin({ kind: "batch" })} className="v2-btn" data-kind="ghost" style={{ height: 34 }}><Pencil className="size-4" />Remplir les fiches</button> : null}
                      {mym || canEdit ? <button type="button" onClick={() => setWin({ kind: "move" })} className="v2-btn" style={{ height: 34 }}><FolderInput className="size-4" />Ranger</button> : null}
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}
        </div>
      </div>

      {win?.kind === "detail" && head ? <Detail key={win.m.id} pf={pf} creatorId={mid} m={lib.items?.find((x) => x.id === win.m.id) ?? win.m} head={head} onClose={() => setWin(null)} onSaved={(part) => (saved([win.m.id], part), setWin(null))} /> : null}
      {win?.kind === "batch" && head ? <BatchForm pf={pf} creatorId={mid} items={list} head={head} onClose={() => setWin(null)} onDone={(part) => (saved(list.map((x) => x.id), part), clear(), setWin(null))} /> : null}
      {win?.kind === "move" && head ? <MoveForm pf={pf} creatorId={mid} items={list} head={head} onClose={() => setWin(null)} onNew={() => setWin({ kind: "name", what: mym ? "collection" : "cat" })} onDone={(part) => (part ? saved(list.map((x) => x.id), part) : void reload(true), clear(), setWin(null))} /> : null}
      {win?.kind === "name" ? <NameForm what={win.what} cat={win.cat} creatorId={mid} model={m?.name ?? ""} onClose={() => setWin(null)} onDone={() => (setWin(null), void reload(win.what === "collection"))} /> : null}
      {win?.kind === "upload" && head && m ? <UploadForm creatorId={mid} model={m.name} folders={head.folders} folder={query.folder} onClose={() => setWin(null)} onSent={() => void refresh()} /> : null}
      {win?.kind === "confirm" ? <Confirm title={win.title} text={win.text} button={win.button} go={win.go} onClose={() => setWin(null)} /> : null}
    </div>
  );
}

/** Les champs de la fiche que l'équipe remplit (note, mots-clés, prix conseillé, catégorie). */
type Fiche = { note: string; labels: string; price: string; catId: number | null };
function FicheFields({ v, set, show, head, id }: { v: Fiche; set: (part: Partial<Fiche>) => void; show: { note: boolean; labels: boolean; price: boolean; cat: boolean }; head: MediaHead; id: string }) {
  const sym = head.currency === "USD" ? "$" : "€";
  return (
    <>
      {show.note ? (
        <>
          <label className="v2-label" htmlFor={`${id}-note`}>Note pour l’équipe</label>
          <textarea id={`${id}-note`} value={v.note} maxLength={256} rows={3} onChange={(e) => set({ note: e.target.value })} placeholder="Ce qu’on y voit, quand l’envoyer, à qui…" className="v2-field" style={{ height: "auto", paddingTop: 8, paddingBottom: 8, resize: "vertical" }} />
          <p className="mt-1 text-right text-[11px] text-muted"><span className="v2-num">{v.note.length} / 256</span></p>
        </>
      ) : null}
      {show.labels ? (
        <>
          <label className="v2-label mt-2" htmlFor={`${id}-labels`}>Mots-clés <span className="font-normal">(séparés par des virgules)</span></label>
          <input id={`${id}-labels`} value={v.labels} onChange={(e) => set({ labels: e.target.value })} placeholder="lingerie, douche, sans visage" className="v2-field" />
        </>
      ) : null}
      {show.price || show.cat ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {show.price ? (
            <div>
              <label className="v2-label" htmlFor={`${id}-price`}>Prix conseillé</label>
              <label className="flex h-[38px] items-center gap-1.5 rounded-[10px] border px-3" style={{ borderColor: "var(--color-line)", background: "rgb(255 255 255 / 0.03)" }}>
                <input id={`${id}-price`} value={v.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder="aucun" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-[#5d5d66]" />
                <span className="text-[12.5px] text-muted">{sym}</span>
              </label>
            </div>
          ) : null}
          {show.cat ? (
            <div>
              <label className="v2-label" htmlFor={`${id}-cat`}>Catégorie Bloom</label>
              <select id={`${id}-cat`} value={v.catId ?? ""} onChange={(e) => set({ catId: e.target.value ? Number(e.target.value) : null })} className="v2-field" style={{ colorScheme: "dark" }}>
                <option value="" style={{ background: "#121215" }}>Aucune</option>
                {head.cats.map((c) => <option key={c.id} value={c.id} style={{ background: "#121215" }}>{c.name}</option>)}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Un média en grand, ce qu'on en sait, et sa fiche. */
function Detail({ pf, creatorId, m, head, onClose, onSaved }: { pf: Pf; creatorId: string; m: MediaItem; head: MediaHead; onClose: () => void; onSaved: (part: Partial<MediaItem>) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [v, setV] = useState<Fiche>({ note: m.note, labels: m.labels.join(", "), price: m.price ? String(m.price) : "", catId: m.catId });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let off = false;
    api<Info>("GET", `/api/v2/medias/one?pf=${pf}&creatorId=${encodeURIComponent(creatorId)}&id=${encodeURIComponent(m.id)}`)
      .then((r) => void (!off && setInfo(r)))
      .catch(() => void (!off && setInfo({ ai: null, bloom: [] })));
    return () => {
      off = true;
    };
  }, [pf, creatorId, m.id]);
  const mym = pf === "mym";
  const canEdit = head.canEdit;
  const cats = !mym && head.cats.length > 0;
  // Côté OnlyFans la liste dit déjà ce que l'IA sait du média ; côté MYM on l'apprend en ouvrant la fiche.
  const ai = info?.ai ?? (!mym && (m.caption || m.tags.length || m.ai.length) ? { context: m.caption, tags: m.tags, scripts: m.ai, steps: m.steps } : null);
  const save = async () => {
    setBusy(true);
    const labels = labelsOf(v.labels);
    const price = amountOf(v.price);
    try {
      await api("POST", "/api/vaultpro/meta", { creatorId, medias: [snapOf(m)], patch: { notes: v.note.trim(), hashtags: labels, price, ...(cats ? { catId: v.catId } : {}) } });
      toast("Fiche enregistrée");
      onSaved({ note: v.note.trim(), labels, price, ...(cats ? { catId: v.catId } : {}) });
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy(false);
  };
  const chip = "v2-tag max-w-full";
  const blue = { color: "var(--v2-sky)", background: "rgb(59 130 246 / 0.14)" };
  const usedSomewhere = !!(info?.bloom.length || ai?.scripts.length || ai?.steps.length || m.usedPublic || m.usedPrivate);
  const filled = !!(m.note || m.labels.length || m.price);
  return (
    <Modal title={`${TYPE_NAME[m.type]}${m.duration ? ` · ${clockOf(m.duration)}` : ""}`} sub={[m.createdAt ? `Ajouté${m.type === "photo" || m.type === "video" ? "e" : ""} le ${dayOf(m.createdAt)}` : "", m.type !== "audio" && !/^[0-9a-f-]{16,}(\.\w+)?$/i.test(m.name) ? m.name : ""].filter(Boolean).join(" · ") || undefined} width={1040} onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_350px]">
        <div className="h-[46vh] overflow-hidden rounded-[12px] md:h-[min(68vh,620px)]" style={{ background: "#000" }}><MediaView m={m} /></div>
        <div className="v2-scroll min-w-0 md:max-h-[min(68vh,620px)] md:overflow-y-auto md:pr-1">
          {mym && m.caption ? <p className="mb-3 text-[13px] leading-relaxed whitespace-pre-wrap">{m.caption}</p> : null}

          <p className="v2-label">Utilisé dans</p>
          {usedSomewhere ? (
            <div className="flex flex-wrap gap-1.5">
              {(info?.bloom ?? []).map((b, i) => <span key={`b${i}`} className={chip} title="Script de Bloom, envoyé par l’équipe depuis la messagerie"><ListOrdered className="size-3 shrink-0" /><span className="truncate">{b.script} › {b.message}</span></span>)}
              {(ai?.scripts ?? []).map((s) => <span key={`s${s}`} className={chip} style={blue} title="Script que l’IA de Substy déroule toute seule"><Sparkles className="size-3 shrink-0" /><span className="truncate">IA · {s}</span></span>)}
              {(ai?.steps ?? []).map((s) => <span key={`t${s}`} className={chip} style={blue} title="Étape du script de l’IA qui envoie ce média"><span className="truncate">étape « {s} »</span></span>)}
              {m.usedPublic ? <span className={chip}>Posté en public sur MYM</span> : m.usedPrivate ? <span className={chip}>Posté en privé sur MYM</span> : null}
            </div>
          ) : (
            <p className="text-[12.5px] text-muted">{info ? "Aucun script ne l’utilise pour l’instant." : m.scripts ? `${plural(m.scripts, "script")} de Bloom…` : "…"}</p>
          )}

          {ai && (ai.context || ai.tags.length) ? (
            <>
              <p className="v2-label mt-4"><Sparkles className="mr-1.5 inline size-3.5 align-[-2px]" style={{ color: "var(--v2-sky)" }} />Ce que l’IA de Substy en sait</p>
              {ai.context ? <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap">{ai.context}</p> : null}
              {ai.tags.length ? <div className="mt-2 flex flex-wrap gap-1.5">{ai.tags.map((t) => <span key={t} className="v2-tag">{t.replace(/_/g, " ")}</span>)}</div> : null}
            </>
          ) : null}

          <div className="mt-4 border-t pt-4" style={{ borderColor: "rgb(255 255 255 / 0.07)" }}>
            <p className="text-[13.5px] font-bold">Fiche de l’équipe</p>
            <p className="mt-0.5 mb-3 text-[11.5px] text-muted">Gardée dans Bloom, visible par toute l’équipe{canEdit ? "" : " (remplie par les team leaders et les managers)"}.</p>
            {canEdit ? (
              <FicheFields v={v} set={(part) => setV((x) => ({ ...x, ...part }))} show={{ note: true, labels: true, price: true, cat: cats }} head={head} id="fiche" />
            ) : filled ? (
              <div className="space-y-2 text-[12.5px]">
                {m.note ? <p className="leading-relaxed whitespace-pre-wrap">{m.note}</p> : null}
                {m.labels.length ? <div className="flex flex-wrap gap-1.5">{m.labels.map((l) => <span key={l} className="v2-tag">{l}</span>)}</div> : null}
                {m.price ? <p>Prix conseillé : <b className="v2-num">{priceOf(m.price, head.currency)}</b></p> : null}
              </div>
            ) : (
              <p className="text-[12.5px] text-muted">Pas encore de fiche pour ce média.</p>
            )}
            {m.by && m.at ? <p className="mt-3 text-[11px] text-muted">Dernière modification : {m.by}, le {dayOf(m.at)}.</p> : null}
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Fermer</button>
        {canEdit ? <button type="button" onClick={() => void save()} disabled={busy} className="v2-btn">{busy ? "Enregistrement…" : "Enregistrer la fiche"}</button> : null}
      </div>
    </Modal>
  );
}

/** Remplir la fiche de plusieurs médias d'un coup : seul ce qui est coché est remplacé. */
function BatchForm({ pf, creatorId, items, head, onClose, onDone }: { pf: Pf; creatorId: string; items: MediaItem[]; head: MediaHead; onClose: () => void; onDone: (part: Partial<MediaItem>) => void }) {
  const cats = pf === "of" && head.cats.length > 0;
  const [use, setUse] = useState({ note: true, labels: false, price: false, cat: false });
  const [v, setV] = useState<Fiche>({ note: "", labels: "", price: "", catId: null });
  const [busy, setBusy] = useState(false);
  const any = use.note || use.labels || use.price || use.cat;
  const save = async () => {
    setBusy(true);
    const labels = labelsOf(v.labels);
    const price = amountOf(v.price);
    try {
      await api("POST", "/api/vaultpro/meta", { creatorId, medias: items.map(snapOf), patch: { ...(use.note ? { notes: v.note.trim() } : {}), ...(use.labels ? { hashtags: labels } : {}), ...(use.price ? { price } : {}), ...(use.cat ? { catId: v.catId } : {}) } });
      toast(`${plural(items.length, "fiche")} enregistrée${items.length > 1 ? "s" : ""}`);
      onDone({ ...(use.note ? { note: v.note.trim() } : {}), ...(use.labels ? { labels } : {}), ...(use.price ? { price } : {}), ...(use.cat ? { catId: v.catId } : {}) });
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy(false);
  };
  const opts: [keyof typeof use, string][] = [["note", "Note"], ["labels", "Mots-clés"], ["price", "Prix conseillé"], ...(cats ? ([["cat", "Catégorie"]] as [keyof typeof use, string][]) : [])];
  return (
    <Modal sticky title={`Remplir ${plural(items.length, "fiche")}`} sub="Choisis ce que tu changes : le reste de chaque fiche n’est pas touché." onClose={onClose}>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {opts.map(([k, l]) => <button key={k} type="button" aria-pressed={use[k]} onClick={() => setUse({ ...use, [k]: !use[k] })} className="v2-seg border" data-on={use[k]} style={{ borderColor: "var(--color-line)" }}>{l}</button>)}
      </div>
      <FicheFields v={v} set={(part) => setV((x) => ({ ...x, ...part }))} show={{ note: use.note, labels: use.labels, price: use.price, cat: use.cat }} head={head} id="batch" />
      {!any ? <p className="text-[12.5px] text-muted">Choisis au moins une ligne à changer.</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void save()} disabled={busy || !any} className="v2-btn">{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

/** Ranger la sélection : dans une catégorie de Bloom (OnlyFans) ou dans une collection du compte (MYM). */
function MoveForm({ pf, creatorId, items, head, onClose, onNew, onDone }: { pf: Pf; creatorId: string; items: MediaItem[]; head: MediaHead; onClose: () => void; onNew: () => void; onDone: (part: Partial<MediaItem> | null) => void }) {
  const mym = pf === "mym";
  const [busy, setBusy] = useState("");
  // Les vocaux de MYM sont rangés à part par MYM : ils n'entrent pas dans une collection.
  const movable = mym ? items.filter((x) => x.type !== "audio") : items;
  const go = async (key: string, f: () => Promise<Partial<MediaItem> | null>) => {
    setBusy(key);
    try {
      onDone(await f());
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy("");
  };
  const toCat = (id: number | null, name: string) =>
    go(`c${id}`, async () => {
      await api("POST", "/api/vaultpro/meta", { creatorId, medias: items.map(snapOf), patch: { catId: id } });
      toast(id ? `${plural(items.length, "média")} rangé${items.length > 1 ? "s" : ""} dans « ${name} »` : "Catégorie retirée");
      return { catId: id };
    });
  const toCollection = (f: MediaFolder) =>
    go(f.id, async () => {
      await api("POST", "/api/mym/cloud/collections/add", { creatorId, collectionId: f.id, mediaIds: movable.map((x) => x.id) });
      toast(`${plural(movable.length, "média")} ajouté${movable.length > 1 ? "s" : ""} à « ${f.name} »`);
      return null;
    });
  const row = "v2-menu-item border";
  const line = { borderColor: "var(--color-line)" };
  return (
    <Modal title={`Ranger ${plural(items.length, "média")}`} sub={mym ? "Dans une collection du compte MYM de la modèle (le média reste aussi dans le cloud)." : "Dans une catégorie de Bloom : le vault d’OnlyFans n’est pas modifié."} onClose={onClose}>
      {mym && movable.length < items.length ? <p className="mb-3 text-[12.5px]" style={{ color: "#fbbf24" }}>{plural(items.length - movable.length, "vocal", "vocaux")} dans la sélection : MYM ne les range pas dans les collections.</p> : null}
      <div className="v2-scroll max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
        {mym
          ? head.folders.map((f) => <button key={f.id} type="button" disabled={!!busy || !movable.length} onClick={() => void toCollection(f)} className={row} style={line}><span className="min-w-0 flex-1"><b className="block truncate">{f.name}</b><span className="block text-[11.5px] font-normal text-muted">{countsOf(f)}</span></span>{busy === f.id ? <span className="text-[11.5px] text-muted">Un instant…</span> : null}</button>)
          : head.cats.map((c) => <button key={c.id} type="button" disabled={!!busy} onClick={() => void toCat(c.id, c.name)} className={row} style={line}><span className="min-w-0 flex-1"><b className="block truncate">{c.name}</b><span className="block text-[11.5px] font-normal text-muted">{c.count ? plural(c.count, "média") : "vide"}</span></span>{busy === `c${c.id}` ? <span className="text-[11.5px] text-muted">Un instant…</span> : null}</button>)}
        {!mym && items.some((x) => x.catId) ? <button type="button" disabled={!!busy} onClick={() => void toCat(null, "")} className={row} style={{ ...line, color: "var(--color-muted)" }}>Retirer de leur catégorie</button> : null}
      </div>
      {(mym ? !head.folders.length : !head.cats.length) ? <p className="text-[12.5px] text-muted">{mym ? "Aucune collection sur ce compte pour l’instant." : "Aucune catégorie pour l’instant."}</p> : null}
      <div className="mt-5 flex justify-between gap-2">
        <button type="button" onClick={onNew} className="v2-btn" data-kind="ghost"><Plus className="size-4" />{mym ? "Nouvelle collection" : "Nouvelle catégorie"}</button>
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
      </div>
    </Modal>
  );
}

/** Nommer une catégorie de Bloom (créer / renommer) ou une nouvelle collection du compte MYM. */
function NameForm({ what, cat, creatorId, model, onClose, onDone }: { what: "cat" | "collection"; cat?: MediaCat; creatorId: string; model: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(cat?.name ?? "");
  const [busy, setBusy] = useState(false);
  const max = what === "cat" ? 64 : 60;
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      if (what === "cat") await api("POST", "/api/vaultpro/cats", { creatorId, name: name.trim(), ...(cat ? { id: cat.id } : {}) });
      else await api("POST", "/api/mym/cloud/collections", { creatorId, name: name.trim() });
      toast(what === "collection" ? "Collection créée dans le compte MYM" : cat ? "Catégorie renommée" : "Catégorie créée");
      onDone();
    } catch (e) {
      toast(errText(e), "err");
    }
    setBusy(false);
  };
  return (
    <Modal sticky title={what === "collection" ? "Nouvelle collection" : cat ? "Renommer la catégorie" : "Nouvelle catégorie"} sub={what === "collection" ? `Elle est créée dans le compte MYM de ${model} : elle y apparaît aussi.` : `Un dossier propre à Bloom pour les médias de ${model} : rien ne change dans OnlyFans.`} onClose={onClose}>
      <label className="v2-label" htmlFor="md-name">Nom</label>
      <input id="md-name" autoFocus value={name} maxLength={max} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} placeholder={what === "collection" ? "Ex : Lingerie rouge" : "Ex : Meilleures ventes"} className="v2-field" />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button type="button" onClick={() => void save()} disabled={busy || !name.trim()} className="v2-btn">{busy ? "Un instant…" : cat ? "Renommer" : "Créer"}</button>
      </div>
    </Modal>
  );
}

/** Importer des photos et des vidéos dans le MYM Cloud de la modèle (elles passent par Bloom, une par une). */
type Job = { file: File; state: "wait" | "send" | "ok" | "err"; error?: string };
const LIMIT = 100 * 1024 * 1024;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
function UploadForm({ creatorId, model, folders, folder, onClose, onSent }: { creatorId: string; model: string; folders: MediaFolder[]; folder: string; onClose: () => void; onSent: () => void }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [to, setTo] = useState(folders.some((f) => f.id === folder) ? folder : "");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const add = (files: FileList | null) => {
    const all = [...(files ?? [])];
    const ok = all.filter((f) => /^(image|video)\//.test(f.type));
    if (ok.length < all.length) toast("Photos et vidéos seulement : les autres fichiers sont laissés de côté.", "err");
    setJobs((j) => [...j, ...ok.map((file): Job => (file.size >= LIMIT ? { file, state: "err", error: "plus de 100 Mo" } : { file, state: "wait" }))]);
  };
  const set = (i: number, part: Partial<Job>) => setJobs((j) => j.map((x, k) => (k === i ? { ...x, ...part } : x)));
  const send = async () => {
    setBusy(true);
    let sent = 0;
    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i].state !== "wait") continue;
      set(i, { state: "send" });
      const f = jobs[i].file;
      try {
        const p = new URLSearchParams({ creatorId, name: f.name, ...(to ? { collectionId: to } : {}) });
        const r = await fetch(`/api/mym/cloud/upload?${p}`, { method: "POST", body: f, headers: { "content-type": f.type || "application/octet-stream" } });
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) throw new Error(b.error || `Erreur ${r.status}`);
        set(i, { state: "ok" });
        sent++;
      } catch (e) {
        set(i, { state: "err", error: errText(e) });
      }
    }
    setBusy(false);
    if (sent) {
      toast(`${plural(sent, "fichier envoyé", "fichiers envoyés")} : ils apparaissent dès que MYM les a traités.`);
      onSent();
    }
  };
  const waiting = jobs.filter((j) => j.state === "wait").length;
  const tone = { wait: "var(--color-muted)", send: "#fbbf24", ok: "var(--v2-up)", err: "var(--v2-down)" } as const;
  return (
    <Modal sticky title="Importer des médias" sub={`Dans le MYM Cloud de ${model}. Photos et vidéos, moins de 100 Mo par fichier.`} onClose={onClose}>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), busy || add(e.dataTransfer.files))}
        className="grid w-full place-items-center rounded-[12px] border border-dashed px-4 py-7 text-center transition-colors"
        style={{ borderColor: over ? "var(--v2-blue)" : "rgb(255 255 255 / 0.16)", background: over ? "rgb(59 130 246 / 0.08)" : "rgb(255 255 255 / 0.02)" }}
      >
        <UploadCloud className="size-7 text-muted" />
        <b className="mt-2 block text-[13.5px]">Dépose les fichiers ici, ou clique pour les choisir</b>
        <span className="mt-0.5 block text-[12px] text-muted">Garde cette fenêtre ouverte pendant l’envoi.</span>
      </button>
      <input ref={input} type="file" multiple accept="image/*,video/*" hidden onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      {folders.length ? (
        <>
          <label className="v2-label mt-3" htmlFor="up-to">Ranger dans</label>
          <select id="up-to" disabled={busy} value={to} onChange={(e) => setTo(e.target.value)} className="v2-field" style={{ colorScheme: "dark" }}>
            <option value="" style={{ background: "#121215" }}>Aucune collection (seulement dans le cloud)</option>
            {folders.map((f) => <option key={f.id} value={f.id} style={{ background: "#121215" }}>{f.name}</option>)}
          </select>
        </>
      ) : null}
      {jobs.length ? (
        <div className="v2-scroll mt-3 max-h-[220px] space-y-1 overflow-y-auto pr-1">
          {jobs.map((j, i) => (
            <p key={i} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px]" style={{ background: "rgb(255 255 255 / 0.03)" }}>
              <span className="min-w-0 flex-1 truncate">{j.file.name}</span>
              <span className="v2-num shrink-0 text-muted">{mb(j.file.size)}</span>
              <span className="shrink-0 font-semibold" style={{ color: tone[j.state] }} title={j.error}>{j.state === "ok" ? "Envoyé" : j.state === "err" ? `Refusé : ${j.error}` : j.state === "send" ? "Envoi…" : "En attente"}</span>
              {!busy && j.state !== "ok" ? <button type="button" onClick={() => setJobs((x) => x.filter((_, k) => k !== i))} className="shrink-0 text-muted hover:text-(--color-fg)" aria-label={`Retirer ${j.file.name}`}>✕</button> : null}
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className="v2-btn" data-kind="ghost">{jobs.some((j) => j.state === "ok") ? "Fermer" : "Annuler"}</button>
        <button type="button" onClick={() => void send()} disabled={busy || !waiting} className="v2-btn">{busy ? "Envoi en cours…" : waiting ? `Envoyer ${plural(waiting, "fichier")}` : "Envoyer"}</button>
      </div>
    </Modal>
  );
}
