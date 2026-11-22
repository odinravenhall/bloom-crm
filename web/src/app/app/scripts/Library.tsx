"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, Copy, ImagePlus, Lock, MoreHorizontal, Pencil, Plus, Search, Send, Trash2, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn, moneyC, num, usd } from "@/lib/fmt";
import { useCreators } from "@/lib/creators";
import type { LibGroup, LibItem, Library as LibraryT, Media } from "@/lib/types";
import { Pill, btnCls, inputCls } from "@/components/ui";
import { VaultPicker } from "../messagerie/VaultPicker";

const WORD: Record<LibGroup["kind"], { one: string; item: string; add: string; empty: string }> = {
  tag: { one: "tag", item: "script", add: "Ajouter un script", empty: "Aucun tag. Crée-en un pour ranger tes scripts (ex. PHRASE VIP, RELANCE, NEGO)." },
  sequence: { one: "séquence", item: "étape", add: "Ajouter une étape", empty: "Aucune séquence. Crée-en une (ex. KYC DÉCOUVERTE) puis ajoute ses étapes dans l’ordre." },
};
// Consignes rapides pour le chatteur (quand envoyer l'étape).
const NOTES = ["Envoyer directement", "Si le fan répond", "Si pas de réponse (10 min)", "Après un achat", "Si le fan refuse", "Relance le lendemain"];

export const conv = (sales: number, sent: number) => (sent ? Math.round((sales / sent) * 100) : null);
/** Chiffres d'un ensemble de scripts : envois, PPV envoyés, achats, argent (même devise pour une créatrice). */
export function sumItems(items: LibItem[]) {
  return items.reduce(
    (a, i) => ({ uses: a.uses + i.uses, ppv: a.ppv + i.ppvSent, sales: a.sales + i.sales, revenue: a.revenue + i.revenue, currency: a.currency || i.currency }),
    { uses: 0, ppv: 0, sales: 0, revenue: 0, currency: null as string | null },
  );
}

/** Bibliothèque d'une créatrice : liste des tags (ou séquences) à gauche, leurs scripts à droite. */
export function Library({ kind }: { kind: LibGroup["kind"] }) {
  const { creatorId, creators } = useCreators();
  const [lib, setLib] = useState<LibraryT | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<number | "all" | null>(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ groupId: number; item: Partial<LibItem> } | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  // Sur téléphone : la liste, puis le détail en plein écran.
  const [mobile, setMobile] = useState(false);
  const w = WORD[kind];

  const load = useCallback(() => {
    if (!creatorId) return;
    api<LibraryT>("GET", `/api/lib?creatorId=${encodeURIComponent(creatorId)}`)
      .then((l) => {
        setLib(l);
        setErr("");
      })
      .catch((e) => setErr((e as Error).message));
  }, [creatorId]);
  useEffect(() => {
    setLib(null);
    setSel(null);
    load();
  }, [load]);

  const groups = useMemo(() => (lib?.groups ?? []).filter((g) => g.kind === kind), [lib, kind]);
  const canEdit = !!lib?.canEdit;
  useEffect(() => {
    if (sel === null && groups.length) setSel(kind === "tag" ? "all" : groups[0].id);
  }, [groups, sel, kind]);
  const group = typeof sel === "number" ? groups.find((g) => g.id === sel) ?? null : null;
  const items = useMemo(() => {
    const base = sel === "all" ? groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.name, groupId: g.id }))) : (group?.items ?? []).map((i) => ({ ...i, group: group!.name, groupId: group!.id }));
    const s = q.trim().toLowerCase();
    return s ? base.filter((i) => (i.name + " " + i.text + " " + i.group).toLowerCase().includes(s)) : base;
  }, [sel, groups, group, q]);

  const call = async (path: string, data: unknown, ok?: string) => {
    try {
      const r = await api<{ id?: number; mediasDropped?: boolean }>("POST", path, data);
      if (ok) toast(ok);
      load();
      return r;
    } catch (e) {
      toast((e as Error).message, "err");
      return null;
    }
  };
  const newGroup = async () => {
    const name = window.prompt(`Nom du ${w.one} :`)?.trim();
    if (!name) return;
    const r = await call("/api/lib/group", { creatorId, kind, name });
    if (r?.id) setSel(r.id);
  };
  const rename = async (g: LibGroup) => {
    const name = window.prompt(`Nouveau nom :`, g.name)?.trim();
    if (name && name !== g.name) call("/api/lib/group", { id: g.id, name });
  };
  const remove = async (g: LibGroup) => {
    if (!window.confirm(`Supprimer « ${g.name} » et ses ${g.items.length} ${w.item}s ? Impossible de revenir en arrière.`)) return;
    await call("/api/lib/group/delete", { id: g.id }, "Supprimé");
    setSel(null);
  };
  const moveGroup = (g: LibGroup, d: -1 | 1) => {
    const ids = groups.map((x) => x.id);
    const i = ids.indexOf(g.id);
    if (i + d < 0 || i + d >= ids.length) return;
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    call("/api/lib/group/order", { creatorId, ids });
  };
  const copy = async (g: LibGroup, to: string) => {
    const r = await call("/api/lib/group/copy", { id: g.id, toCreatorId: to });
    if (r) toast(r.mediasDropped ? "Copié (sans les médias : ajoute ceux du vault de l’autre créatrice)" : "Copié");
  };
  const moveItem = (g: LibGroup, id: number, d: -1 | 1) => {
    const ids = g.items.map((x) => x.id);
    const i = ids.indexOf(id);
    if (i + d < 0 || i + d >= ids.length) return;
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    call("/api/lib/item/order", { groupId: g.id, ids });
  };
  const delItem = (i: LibItem) => window.confirm(`Supprimer « ${i.name || i.text.slice(0, 40)} » ?`) && call("/api/lib/item/delete", { id: i.id }, "Supprimé");

  const all = sumItems(groups.flatMap((g) => g.items));
  const cur = sumItems(group ? group.items : groups.flatMap((g) => g.items));

  return (
    <div className="flex min-h-0 flex-1">
      {/* Tags / séquences */}
      <aside className={cn("flex w-full min-w-0 flex-col border-r bg-panel md:w-[300px] md:shrink-0", mobile && "max-md:hidden")}>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
          {kind === "tag" && groups.length ? (
            <GroupRow active={sel === "all"} name="Tous les scripts" unit={w.item} count={groups.reduce((a, g) => a + g.items.length, 0)} s={all} onClick={() => (setSel("all"), setMobile(true))} />
          ) : null}
          {groups.map((g) => (
            <div key={g.id} className="relative">
              <GroupRow active={sel === g.id} name={g.name} unit={w.item} count={g.items.length} s={sumItems(g.items)} onClick={() => (setSel(g.id), setMobile(true))} onMenu={canEdit ? () => setMenu(menu === g.id ? null : g.id) : undefined} />
              {menu === g.id ? (
                <div className="absolute top-10 right-2 z-20 w-60 rounded-2xl border bg-card p-1 text-sm shadow-xl" onMouseLeave={() => setMenu(null)}>
                  <MenuBtn icon={Pencil} label="Renommer" onClick={() => (setMenu(null), rename(g))} />
                  <MenuBtn icon={ArrowUp} label="Monter" onClick={() => (setMenu(null), moveGroup(g, -1))} />
                  <MenuBtn icon={ArrowDown} label="Descendre" onClick={() => (setMenu(null), moveGroup(g, 1))} />
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted uppercase">Copier vers</p>
                  {creators.map((c) => (
                    <MenuBtn key={c.id} icon={Copy} label={c.id === creatorId ? `${c.name} (dupliquer)` : c.name} onClick={() => (setMenu(null), copy(g, c.id))} />
                  ))}
                  <MenuBtn icon={Trash2} label="Supprimer" danger onClick={() => (setMenu(null), remove(g))} />
                </div>
              ) : null}
            </div>
          ))}
          {lib && !groups.length ? <p className="p-4 text-sm text-muted">{w.empty}</p> : null}
          {!lib && !err ? <p className="p-4 text-sm text-muted">Chargement…</p> : null}
          {err ? <p className="p-4 text-sm font-semibold text-rose-400">{err}</p> : null}
        </div>
        {canEdit ? (
          <div className="border-t p-3">
            <button onClick={newGroup} className={cn(btnCls.secondary, "w-full justify-center")}>
              <Plus className="size-4" /> {kind === "tag" ? "Nouveau tag" : "Nouvelle séquence"}
            </button>
          </div>
        ) : null}
      </aside>

      {/* Scripts du tag / étapes de la séquence */}
      <section className={cn("scroll-thin min-w-0 flex-1 overflow-y-auto", mobile ? "block" : "hidden md:block")}>
        {sel !== null && (group || sel === "all") ? (
          <div className="mx-auto max-w-5xl px-4 py-5 md:px-6">
            <button onClick={() => setMobile(false)} className="mb-2 flex items-center gap-1 text-sm text-muted md:hidden">
              <ChevronLeft className="size-4" /> Retour
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-3xl">{group ? group.name : "Tous les scripts"}</h2>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  <Pill>
                    {group ? group.items.length : items.length} {w.item}s
                  </Pill>
                  <Pill tone="info">envoyé {num(cur.uses)}×</Pill>
                  {cur.ppv ? <Pill tone="accent">{conv(cur.sales, cur.ppv)} % des PPV achetés</Pill> : null}
                  {cur.revenue ? <Pill tone="good">{moneyC(cur.revenue, cur.currency, 0)}</Pill> : null}
                </p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input className={cn(inputCls, "w-full pl-9 sm:w-60")} placeholder="Chercher un message…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {canEdit && group ? (
                <button onClick={() => setEdit({ groupId: group.id, item: {} })} className={btnCls.primary}>
                  <Plus className="size-4" /> {w.add}
                </button>
              ) : null}
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {items.map((i, k) => (
                <article key={i.id} className="flex gap-3 rounded-2xl border bg-card p-3">
                  <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r pr-3">
                    <span className="grid size-8 place-items-center rounded-full bg-petal text-sm font-bold text-primary-soft">{kind === "sequence" ? k + 1 : "•"}</span>
                    {canEdit && group && !q ? (
                      <>
                        <button disabled={k === 0} onClick={() => moveItem(group, i.id, -1)} className="rounded p-0.5 text-muted hover:text-fg disabled:opacity-30" title="Monter">
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button disabled={k === items.length - 1} onClick={() => moveItem(group, i.id, 1)} className="rounded p-0.5 text-muted hover:text-fg disabled:opacity-30" title="Descendre">
                          <ArrowDown className="size-3.5" />
                        </button>
                      </>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-muted">{i.name}</span>
                      {sel === "all" ? <Pill>{i.group}</Pill> : null}
                      {i.price > 0 ? (
                        <Pill tone="accent">
                          <Lock className="size-3" /> PPV {usd(i.price)}
                        </Pill>
                      ) : null}
                      {i.note ? <Pill tone="info">{i.note}</Pill> : null}
                    </div>
                    {i.text ? <p className="mt-1 text-[15px] font-medium whitespace-pre-wrap">{i.text}</p> : <p className="mt-1 text-sm text-muted italic">Médias sans texte</p>}
                    {i.medias.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {i.medias.slice(0, 8).map((m) => (
                          <span key={m.id} className="relative block size-14 overflow-hidden rounded-xl bg-card-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {m.thumb ? <img src={m.thumb} alt="" loading="lazy" className="size-full object-cover" /> : null}
                            {m.type === "video" ? <span className="absolute bottom-0.5 left-0.5 rounded bg-black/65 px-1 text-[9px] font-bold text-white">▶</span> : null}
                          </span>
                        ))}
                        {i.medias.length > 8 ? <span className="grid size-14 place-items-center rounded-xl bg-card-2 text-xs text-muted">+{i.medias.length - 8}</span> : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <div className="grid min-w-20 place-items-center rounded-xl border px-3 py-2 text-center" title={`Envoyé ${i.uses} fois à ${i.fans} fans`}>
                      <Send className="size-4 text-primary" />
                      <span className="text-sm font-semibold tabular-nums">{num(i.uses)}</span>
                      {i.price > 0 && i.ppvSent ? (
                        <span className="text-[10px] text-muted">
                          {conv(i.sales, i.ppvSent)} % · {moneyC(i.revenue, i.currency, 0)}
                        </span>
                      ) : null}
                    </div>
                    {canEdit ? (
                      <div className="flex flex-col gap-1">
                        <button onClick={() => setEdit({ groupId: i.groupId, item: i })} className="rounded-lg p-1.5 text-muted hover:bg-card-2 hover:text-fg" title="Modifier">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => delItem(i)} className="rounded-lg p-1.5 text-muted hover:bg-card-2 hover:text-rose-400" title="Supprimer">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
              {!items.length ? (
                <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted">
                  {q ? "Rien ne correspond." : canEdit && group ? `Vide pour l’instant : « ${w.add} ».` : "Vide pour l’instant."}
                </p>
              ) : null}
            </div>
            <p className="mt-5 text-xs text-muted">
              Dans la messagerie, bouton « Scripts » : {kind === "sequence" ? "Bloom montre où en est le fan et prépare l’étape suivante." : "choisis un script, il arrive dans la zone de message."} {"{prenom}"} est remplacé par le prénom du fan.
            </p>
          </div>
        ) : (
          <p className="mt-20 text-center text-sm text-muted">{groups.length ? `Choisis un ${w.one}` : ""}</p>
        )}
      </section>

      {edit && creatorId ? <ItemEditor creatorId={creatorId} kind={kind} groupId={edit.groupId} item={edit.item} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), load())} /> : null}
    </div>
  );
}

function GroupRow({ active, name, unit, count, s, onClick, onMenu }: { active: boolean; name: string; unit: string; count: number; s: ReturnType<typeof sumItems>; onClick: () => void; onMenu?: () => void }) {
  const c = conv(s.sales, s.ppv);
  return (
    <div className={cn("mb-1 flex items-start rounded-2xl", active ? "bg-card shadow-sm ring-1 ring-line" : "hover:bg-card-2")}>
      <button onClick={onClick} className="min-w-0 flex-1 px-3 py-2.5 text-left">
        <p className="truncate font-semibold">{name}</p>
        <p className="mt-1 flex gap-3 text-[11px] text-muted tabular-nums">
          <span>
            {count} {unit}
            {count > 1 ? "s" : ""}
          </span>
          <span>{c == null ? "—" : `${c} %`}</span>
          <span>{s.revenue ? moneyC(s.revenue, s.currency, 0) : "0"}</span>
        </p>
      </button>
      {onMenu ? (
        <button onClick={onMenu} className="m-2 rounded-lg p-1 text-muted hover:bg-card-2 hover:text-fg" title="Options">
          <MoreHorizontal className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function MenuBtn({ icon: Icon, label, onClick, danger }: { icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left hover:bg-card-2", danger && "text-rose-400")}>
      <Icon className="size-3.5" /> <span className="truncate">{label}</span>
    </button>
  );
}

/** Créer / modifier un script : nom, message, consigne, médias du vault et prix. */
function ItemEditor({ creatorId, kind, groupId, item, onClose, onSaved }: { creatorId: string; kind: LibGroup["kind"]; groupId: number; item: Partial<LibItem>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item.name ?? "");
  const [text, setText] = useState(item.text ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [medias, setMedias] = useState<Media[]>(item.medias ?? []);
  const [price, setPrice] = useState(item.price ?? 0);
  const [vault, setVault] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !vault && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, vault]);
  const save = async () => {
    setBusy(true);
    try {
      await api("POST", "/api/lib/item", { id: item.id, groupId, name, text, note, medias, price });
      toast("Enregistré");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const what = kind === "sequence" ? "l’étape" : "le script";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#2b1a26]/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[92vh] w-[min(720px,100%)] flex-col overflow-hidden rounded-3xl border bg-card shadow-xl">
        <header className="flex items-center gap-3 border-b px-5 py-3">
          <h2 className="flex-1 text-xl">{item.id ? `Modifier ${what}` : kind === "sequence" ? "Nouvelle étape" : "Nouveau script"}</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-full text-muted hover:bg-card-2">
            <X className="size-4" />
          </button>
        </header>
        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
          <label className="text-sm font-semibold">Nom</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "sequence" ? "ex. 1, PPV1, question âge" : "ex. VIP 1, relance douce"} />
          <label className="mt-1 text-sm font-semibold">Message</label>
          <textarea className={cn(inputCls, "min-h-32 py-3")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Le message envoyé au fan. {prenom} = prénom du fan." autoFocus />
          <label className="mt-1 text-sm font-semibold">Consigne pour le chatteur</label>
          <div className="flex flex-wrap gap-1">
            {NOTES.map((n) => (
              <button key={n} onClick={() => setNote(note === n ? "" : n)} className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", note === n ? "border-primary bg-petal text-primary-soft" : "bg-card text-muted hover:text-fg")}>
                {n}
              </button>
            ))}
          </div>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ou écris ta consigne (facultatif)" />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button onClick={() => setVault(true)} className={btnCls.ghost}>
              <ImagePlus className="size-4" /> Médias / PPV
            </button>
            <span className="text-sm text-muted">
              {medias.length ? `${medias.length} média${medias.length > 1 ? "s" : ""} · ${price > 0 ? `PPV ${usd(price)}` : "gratuit"}` : "Pas de média"}
            </span>
            {medias.length ? (
              <button onClick={() => (setMedias([]), setPrice(0))} className="text-xs font-semibold text-primary-soft">
                retirer
              </button>
            ) : null}
          </div>
          {medias.length ? (
            <div className="flex flex-wrap gap-1.5">
              {medias.map((m) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.id} src={m.thumb || ""} alt="" className="size-14 rounded-xl bg-card-2 object-cover" />
              ))}
            </div>
          ) : null}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className={btnCls.ghost}>
            Annuler
          </button>
          <button onClick={save} disabled={busy || (!text.trim() && !medias.length)} className={btnCls.primary}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </footer>
      </div>
      {vault ? (
        <VaultPicker
          creatorId={creatorId}
          initial={medias}
          initialPrice={price}
          onClose={() => setVault(false)}
          onDone={(m, p) => {
            setMedias(m);
            setPrice(m.length ? p : 0);
            setVault(false);
          }}
        />
      ) : null}
    </div>
  );
}
