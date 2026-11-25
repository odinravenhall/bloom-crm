"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Ticket } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/rv/components/ui";
import { Confirm, Modal, PALETTE, Ring, RowMenu } from "../kit";
import { errText, plural } from "../media/MediaKit";

// Bloom v2 → MYM → Bons de réduction (25/11/2026, « Constellation »). Remplace, dans la v2, la copie de MyPulse
// (`MymVouchers`). Mêmes routes (« /api/mym/vouchers… », mymvouchers.mjs) : le bon est créé et supprimé CHEZ MYM avec le
// compte relié (admins et managers), derrière une confirmation. ⚠️ Jamais encore essayé sur un vrai bon. MYM ne donne
// pas sa liste de bons : l'écran montre ceux créés depuis Bloom.
type Voucher = { id: number; code: string; duration: string; product: string; unit: "currency" | "percent"; discount: number; maxUse: number | null; createdBy: string | null; createdAt: number; expiresAt: number | null };
type LinkRow = { creatorId: string; name: string; username: string | null; linked: boolean };
const DUR: [string, string][] = [["3hours", "3 heures"], ["6hours", "6 heures"], ["12hours", "12 heures"], ["1days", "1 jour"], ["2days", "2 jours"], ["7days", "7 jours"], ["1months", "1 mois"], ["3months", "3 mois"], ["UNLIMITED", "Sans limite"]];
const PROD: [string, string][] = [["subscription", "Abonnement"], ["media", "Push / média privé"], ["booking", "Show privé"]];
const when = (ms: number) => new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const left = (ms: number) => {
  const s = (ms - Date.now()) / 1000;
  if (s < 3600) return `encore ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `encore ${Math.round(s / 3600)} h`;
  return `encore ${Math.round(s / 86400)} j`;
};
const copy = (code: string) => void navigator.clipboard.writeText(code).then(() => toast(`Code « ${code} » copié`)).catch(() => toast("Copie impossible", "err"));

export function V2Vouchers() {
  const { creators } = useCreators();
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [cur, setCur] = useState("");
  const [list, setList] = useState<{ key: string; v: Voucher[]; canEdit: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<Voucher | null>(null);
  useEffect(() => {
    api<{ links: LinkRow[] }>("GET", "/api/mym/links").then((r) => setLinks(r.links)).catch((e) => setErr(errText(e)));
  }, []);
  const models = links ?? [];
  const m = models.find((x) => x.creatorId === cur) ?? models.find((x) => x.linked) ?? models[0] ?? null;
  const mid = m?.creatorId ?? "";
  const avatarOf = (id: string) => creators.find((c) => c.id === id)?.avatar ?? null;
  const load = useCallback(() => {
    if (!mid) return;
    api<{ vouchers: Voucher[]; canEdit: boolean }>("GET", `/api/mym/vouchers?creatorId=${encodeURIComponent(mid)}`)
      .then((r) => (setList({ key: mid, v: r.vouchers, canEdit: r.canEdit }), setErr("")))
      .catch((e) => (setList({ key: mid, v: [], canEdit: false }), setErr(errText(e))));
  }, [mid]);
  useEffect(() => void load(), [load]);
  const mine = list && list.key === mid ? list : null;
  const now = Date.now();
  const live = (mine?.v ?? []).filter((v) => !v.expiresAt || v.expiresAt > now);
  const tile = (label: string, value: React.ReactNode, sub?: string) => (
    <div className="min-w-0 rounded-[12px] border px-3.5 py-2.5" style={{ borderColor: "var(--color-line)" }}>
      <p className="truncate text-[11.5px] font-semibold text-muted">{label}</p>
      <p className="v2-num mt-0.5 truncate text-[20px] leading-tight font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub ?? " "}</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">MYM · Promotions</p>
          <h1 className="v2-h1 mt-1">Bons de réduction</h1>
          <p className="mt-1 max-w-[680px] text-[13px] text-muted">Un code à donner aux fans pour une réduction sur l’abonnement, un push ou un show privé. Créé directement sur le compte MYM de la modèle.</p>
        </div>
        {mine?.canEdit && m?.linked ? <button onClick={() => setOpen(true)} className="v2-btn" style={{ height: 36 }}><Plus className="size-4" />Nouveau bon</button> : null}
      </div>
      {err ? <p className="mt-4 rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "rgb(244 63 94 / 0.35)", background: "rgb(244 63 94 / 0.08)", color: "var(--v2-down)" }}>{err}</p> : null}
      {!links && !err ? <p className="py-20 text-center text-[13px] text-muted">Chargement…</p> : null}
      {links && !models.length ? <p className="py-20 text-center text-[13px] text-muted">Aucun compte MYM visible pour toi.</p> : null}

      {m ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[232px_minmax(0,1fr)]">
          <aside className="v2-rise min-w-0 lg:sticky lg:top-4 lg:self-start" style={{ ["--i" as string]: 1 }}>
            <div className="v2-card p-1.5">
              <p className="hidden px-2 pt-1.5 pb-1.5 text-[10.5px] font-bold tracking-[0.14em] text-muted uppercase lg:block">Comptes MYM</p>
              <div className="v2-noscroll flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
                {models.map((x, i) => (
                  <button key={x.creatorId} onClick={() => setCur(x.creatorId)} className="v2-pick w-auto shrink-0 lg:w-full" data-on={mid === x.creatorId} aria-pressed={mid === x.creatorId}>
                    <Ring color={PALETTE[i % PALETTE.length]}><Avatar src={avatarOf(x.creatorId)} name={x.name} size="size-8" /></Ring>
                    <span className="min-w-0 flex-1 text-left">
                      <b className="block truncate text-[13px] leading-tight">{x.name}</b>
                      <span className="block truncate text-[11.5px] text-muted">{x.linked ? (x.username ? `@${x.username}` : "relié") : "pas relié à Bloom"}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="v2-rise min-w-0" style={{ ["--i" as string]: 2 }}>
            <div className="v2-card p-3">
              {!m.linked ? (
                <p className="p-6 text-center text-[13px] text-muted">Le compte MYM de {m.name} n’est pas relié à Bloom : relie-le dans MYM → Compte Creator pour créer des bons.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 pb-3 md:grid-cols-3">
                    {tile("Bons en cours", mine ? live.length : "…", "utilisables par les fans")}
                    {tile("Expirés", mine ? mine.v.length - live.length : "…")}
                    {tile("Créés depuis Bloom", mine ? mine.v.length : "…", "au total")}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-[13px]">
                      <thead><tr className="text-[11.5px] text-muted">{["Code", "Réduction", "Sur", "Utilisations", "Créé", "Validité", ""].map((h, i) => <th key={i} className="px-3 py-2.5 text-left font-semibold">{h}</th>)}</tr></thead>
                      <tbody>
                        {(mine?.v ?? []).map((v) => {
                          const done = !!v.expiresAt && v.expiresAt <= now;
                          return (
                            <tr key={v.id} className="border-t" style={{ borderColor: "var(--color-line)", opacity: done ? 0.55 : 1 }}>
                              <td className="px-3 py-2.5"><button onClick={() => copy(v.code)} title="Copier le code" className="inline-flex items-center gap-2 rounded-md px-2 py-1 font-mono text-[13px] font-bold transition hover:bg-white/[0.06]" style={{ background: "rgb(59 130 246 / 0.12)", color: "var(--v2-sky)" }}>{v.code}<Copy className="size-3.5 opacity-70" /></button></td>
                              <td className="v2-num px-3 font-semibold">{v.unit === "percent" ? `−${v.discount} %` : `−${v.discount.toLocaleString("fr-FR")} €`}</td>
                              <td className="px-3">{PROD.find(([k]) => k === v.product)?.[1] ?? v.product}</td>
                              <td className="px-3 text-muted">{v.maxUse ? `${v.maxUse} au plus` : "sans limite"}</td>
                              <td className="px-3"><span className="block">{when(v.createdAt)}</span>{v.createdBy ? <span className="text-[11.5px] text-muted">par {v.createdBy}</span> : null}</td>
                              <td className="px-3">{!v.expiresAt ? <span className="v2-tag">sans limite</span> : done ? <span className="text-muted">expiré le {when(v.expiresAt)}</span> : <span><span className="block" style={{ color: "var(--v2-up)" }}>{left(v.expiresAt)}</span><span className="text-[11.5px] text-muted">jusqu’au {when(v.expiresAt)}</span></span>}</td>
                              <td className="px-2 text-right"><RowMenu name={`v-${v.id}`} items={[{ label: "Copier le code", go: () => copy(v.code) }, ...(mine?.canEdit ? [{ label: "Supprimer chez MYM", danger: true, go: () => setDel(v) }] : [])]} /></td>
                            </tr>
                          );
                        })}
                        {mine && !mine.v.length ? <tr><td colSpan={7} className="py-12 text-center text-muted"><Ticket className="mx-auto mb-2 size-6 opacity-50" />Aucun bon créé depuis Bloom pour {m.name}.</td></tr> : null}
                        {!mine ? <tr><td colSpan={7} className="py-12 text-center text-muted">Chargement…</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-1 pt-3 text-[11.5px] text-muted">MYM ne donne pas la liste de ses bons : un bon créé directement sur le site de MYM n’apparaît pas ici.</p>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {open && m ? <Create creatorId={m.creatorId} model={m.name} onClose={() => setOpen(false)} onDone={() => (setOpen(false), load())} /> : null}
      {del ? (
        <Confirm
          title={`Supprimer le bon « ${del.code} » ?`}
          text="Il est supprimé sur le compte MYM : les fans ne pourront plus l’utiliser. Ça ne se défait pas."
          button="Supprimer chez MYM"
          go={async () => {
            await api("POST", "/api/mym/vouchers/delete", { id: del.id });
            toast("Bon supprimé");
            load();
          }}
          onClose={() => setDel(null)}
        />
      ) : null}
    </div>
  );
}

/** Le formulaire : rien n'est envoyé à MYM avant « Créer chez MYM », puis une confirmation. */
function Create({ creatorId, model, onClose, onDone }: { creatorId: string; model: string; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ code: "", duration: "1days", product: "subscription", unit: "percent", discount: "", maxUse: "" });
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const hint = `${model.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12) || "CODE"}10`;
  const n = Number(v.discount.replace(",", "."));
  const ok = /^[A-Za-z0-9_-]{3,25}$/.test(v.code) && n > 0 && (v.unit !== "percent" || n <= 100);
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await api("POST", "/api/mym/vouchers", { creatorId, ...v });
      toast(`Bon « ${v.code} » créé chez MYM`);
      onDone();
    } catch (e) {
      setErr(errText(e));
      setSure(false);
    }
    setBusy(false);
  };
  const seg = (_on: boolean) => "v2-seg border justify-center";
  const label = (t: string) => <p className="v2-label mt-4">{t}</p>;
  const summary = `${v.unit === "percent" ? `−${n || "?"} %` : `−${n || "?"} €`} sur ${(PROD.find(([k]) => k === v.product)?.[1] ?? "").toLowerCase()}, ${v.duration === "UNLIMITED" ? "sans limite de temps" : `pendant ${DUR.find(([k]) => k === v.duration)?.[1]}`}${Number(v.maxUse) > 0 ? `, ${plural(Number(v.maxUse), "utilisation")} au plus` : ""}`;
  return (
    <Modal sticky title="Nouveau bon de réduction" sub={`Sur le compte MYM de ${model}`} onClose={onClose}>
      {!sure ? (
        <>
          <label className="v2-label" htmlFor="v-code">Code à donner aux fans</label>
          <input id="v-code" value={v.code} maxLength={25} onChange={(e) => setV({ ...v, code: e.target.value.replace(/[^A-Za-z0-9_-]/g, "") })} placeholder={hint} className="v2-field font-mono" />
          <p className="mt-1 text-[11.5px] text-muted">3 à 25 lettres ou chiffres, sans espace.</p>
          {label("Réduction sur")}
          <div className="grid grid-cols-3 gap-1.5">{PROD.map(([k, l]) => <button key={k} type="button" onClick={() => setV({ ...v, product: k })} className={seg(v.product === k)} data-on={v.product === k} style={{ borderColor: "var(--color-line)" }}>{l}</button>)}</div>
          {label("Montant")}
          <div className="flex gap-2">
            <div className="v2-segbar shrink-0">{([["percent", "%"], ["currency", "€"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setV({ ...v, unit: k })} className="v2-seg" data-on={v.unit === k}>{l}</button>)}</div>
            <input value={v.discount} onChange={(e) => setV({ ...v, discount: e.target.value.replace(/[^\d.,]/g, "") })} inputMode="decimal" placeholder={v.unit === "percent" ? "ex. 20" : "ex. 5"} className="v2-field" aria-label="Réduction" />
          </div>
          {label("Valable")}
          <div className="grid grid-cols-3 gap-1.5">{DUR.map(([k, l]) => <button key={k} type="button" onClick={() => setV({ ...v, duration: k })} className={seg(v.duration === k)} data-on={v.duration === k} style={{ borderColor: "var(--color-line)" }}>{l}</button>)}</div>
          <label className="v2-label mt-4" htmlFor="v-max">Nombre d’utilisations au plus <span className="font-normal">(vide = sans limite)</span></label>
          <input id="v-max" value={v.maxUse} onChange={(e) => setV({ ...v, maxUse: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="sans limite" className="v2-field" />
          <p className="mt-3 rounded-[10px] border px-3 py-2 text-[12px] leading-relaxed text-muted" style={{ borderColor: "var(--color-line)" }}>Règles de MYM : sur un abonnement, la réduction ne vaut que pour le premier paiement (pas pour les abonnements de 6 mois) ; à 50 % ou plus, un fan ne peut s’en servir qu’une fois tous les 6 mois.</p>
          {err ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
            <button type="button" onClick={() => setSure(true)} disabled={!ok} className="v2-btn">Vérifier</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-muted">Le bon est créé tout de suite sur le compte MYM de {model} et les fans peuvent l’utiliser dès maintenant.</p>
          <div className="mt-3 rounded-[12px] border p-3" style={{ borderColor: "var(--color-line)" }}>
            <p className="font-mono text-[18px] font-bold" style={{ color: "var(--v2-sky)" }}>{v.code}</p>
            <p className="mt-1 text-[13px]">{summary}</p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setSure(false)} disabled={busy} className="v2-btn" data-kind="ghost">Modifier</button>
            <button type="button" onClick={() => void go()} disabled={busy} className="v2-btn">{busy ? "Création chez MYM…" : "Créer chez MYM"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
