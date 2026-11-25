"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, Link2, RefreshCw, Settings2, Unlink, XCircle } from "lucide-react";
import { api, toast } from "@/lib/api";
import { Confirm, Modal } from "../kit";
import { errText } from "../media/MediaKit";

// Bloom v2 → OnlyFans → Comptes OnlyFans (26/11/2026). Liaison DIRECTE Bloom ↔ compte OnlyFans d'une modèle, sans
// Substy (`app/onlyfans.mjs`, extension `extension-of/`). Même principe que « Relier à MYM » : un code à usage unique,
// puis l'extension envoie la session du Chrome connecté à onlyfans.com. Rien ne change pour Substy : la messagerie,
// les chiffres et tout le reste continuent de passer par Substy tant que les écrans ne lisent pas cette liaison.
type Link = { creatorId: string; name: string; username?: string | null; linked: boolean; ok?: boolean; error?: string | null; checkedAt?: number | null; linkedBy?: string | null; linkedAt?: number | null };
type Data = { canEdit: boolean; hasRules: boolean; links: Link[] };
const when = (ms?: number | null) => (ms ? new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "");

export function V2OfAccounts() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [linking, setLinking] = useState<Link | null>(null);
  const [unlink, setUnlink] = useState<Link | null>(null);
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => api<Data>("GET", "/api/of/links").then((r) => (setD(r), setErr(""))).catch((e) => setErr(errText(e))), []);
  useEffect(() => void load(), [load]);
  const check = async (l: Link) => {
    setBusy(l.creatorId);
    const r = await api<{ ok: boolean; error?: string }>("POST", "/api/of/check", { creatorId: l.creatorId }).catch((e) => ({ ok: false, error: errText(e) }));
    toast(r.ok ? `La liaison de ${l.name} marche ✓` : r.error || "Liaison cassée", r.ok ? undefined : "err");
    setBusy("");
    void load();
  };
  const linked = d?.links.filter((l) => l.linked).length ?? 0;

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6 md:px-7 md:py-7">
      <div className="v2-rise relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="v2-eyebrow">OnlyFans · Liaison directe</p>
          <h1 className="v2-h1 mt-1">Comptes OnlyFans</h1>
          <p className="mt-1 text-[13px] text-muted">Relier chaque modèle directement à son compte OnlyFans, sans passer par Substy. Substy reste branché : rien ne change tant qu’on ne bascule pas un écran.</p>
        </div>
        {d?.canEdit ? <button onClick={() => setRules(true)} className="v2-btn" data-kind="ghost" style={{ height: 36 }}><Settings2 className="size-4" />Règles de signature</button> : null}
      </div>

      {d && !d.hasRules ? (
        <div className="v2-rise v2-card mt-5 p-4 text-[13px]" style={{ borderColor: "rgb(251 191 36 / 0.45)", ["--i" as string]: 1 }}>
          <p className="font-semibold" style={{ color: "#fbbf24" }}>Règles de signature pas encore configurées</p>
          <p className="mt-1 text-muted">OnlyFans exige une signature sur chaque requête. Sans ces règles, aucune modèle ne peut être reliée ni vérifiée. Un admin ou un manager les configure avec le bouton « Règles de signature ».</p>
        </div>
      ) : null}

      {err ? <p className="mt-5 text-[13px]" style={{ color: "var(--v2-down)" }}>{err}</p> : null}

      <div className="v2-rise v2-card mt-5 overflow-hidden" style={{ ["--i" as string]: 2 }}>
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
          <p className="v2-card-title flex-1">Modèles OnlyFans</p>
          <span className="text-[12px] text-muted">{d ? `${linked} reliée${linked > 1 ? "s" : ""} sur ${d.links.length}` : "…"}</span>
        </div>
        {d && !d.links.length ? <p className="px-4 py-6 text-[13px] text-muted">Aucune modèle OnlyFans visible.</p> : null}
        {d?.links.map((l) => (
          <div key={l.creatorId} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0" style={{ borderColor: "var(--color-line)" }}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{l.name}</p>
              <p className="truncate text-[12px] text-muted">
                {l.linked ? `@${l.username || "?"} · relié${l.linkedBy ? ` par ${l.linkedBy}` : ""}${l.checkedAt ? ` · vérifié le ${when(l.checkedAt)}` : ""}` : l.username ? `@${l.username}` : "Pas encore relié"}
              </p>
              {l.linked && l.error ? <p className="mt-0.5 text-[12px]" style={{ color: "var(--v2-down)" }}>{l.error}</p> : null}
            </div>
            {l.linked ? (
              <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={l.ok ? { background: "rgb(52 211 153 / 0.14)", color: "var(--v2-up)" } : { background: "rgb(248 113 113 / 0.14)", color: "var(--v2-down)" }}>
                {l.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}{l.ok ? "Relié" : "Liaison cassée"}
              </span>
            ) : null}
            {d.canEdit ? (
              <div className="flex gap-2">
                {l.linked ? <button onClick={() => void check(l)} disabled={busy === l.creatorId || !d.hasRules} className="v2-btn" data-kind="ghost" style={{ height: 32, padding: "0 12px" }}><RefreshCw className="size-3.5" />Vérifier</button> : null}
                <button onClick={() => setLinking(l)} disabled={!d.hasRules} className="v2-btn" data-kind={l.linked ? "ghost" : undefined} style={{ height: 32, padding: "0 12px" }}><Link2 className="size-3.5" />{l.linked ? "Relier à nouveau" : "Relier"}</button>
                {l.linked ? <button onClick={() => setUnlink(l)} className="v2-sq" style={{ width: 32, height: 32 }} title="Délier"><Unlink className="size-3.5" /></button> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {linking ? <LinkModal link={linking} onClose={() => (setLinking(null), void load())} /> : null}
      {unlink ? <Confirm title={`Délier ${unlink.name} ?`} text="Bloom efface la session OnlyFans de cette modèle. Substy n’est pas touché." button="Délier" go={() => api("POST", "/api/of/unlink", { creatorId: unlink.creatorId }).then(load)} onClose={() => setUnlink(null)} /> : null}
      {rules ? <RulesModal onClose={() => (setRules(false), void load())} /> : null}
    </div>
  );
}

function LinkModal({ link, onClose }: { link: Link; onClose: () => void }) {
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [done, setDone] = useState(false);
  const newCode = async () => {
    try {
      setCode(await api<{ code: string; expiresAt: number }>("POST", "/api/of/link-code", { creatorId: link.creatorId }));
    } catch (e) {
      toast(errText(e), "err");
    }
  };
  // Pendant qu'on relie : on regarde toutes les 3 s si la liaison est arrivée.
  useEffect(() => {
    if (!code || done) return;
    const t = setInterval(async () => {
      const r = await api<Data>("GET", "/api/of/links").catch(() => null);
      const s = r?.links.find((x) => x.creatorId === link.creatorId);
      if (s?.linked && s.ok && (s.linkedAt ?? 0) > (link.linkedAt ?? 0)) {
        setDone(true);
        toast(`${link.name} est reliée à OnlyFans ✓`);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [code, done, link]);
  const n = "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold";
  const nst = { background: "var(--v2-blue)", color: "#fff" };
  return (
    <Modal title={`Relier ${link.name} à OnlyFans`} sub="Le mot de passe n’est jamais lu : seule la session est gardée, chiffrée." onClose={onClose}>
      {done ? (
        <div className="text-[13px]">
          <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--v2-up)" }}><CheckCircle2 className="size-4" />Reliée ✓</p>
          <div className="mt-5 flex justify-end"><button onClick={onClose} className="v2-btn">Fermer</button></div>
        </div>
      ) : (
        <div className="space-y-4 text-[13px]">
          <div className="flex gap-3"><span className={n} style={nst}>1</span><div>Une seule fois par ordinateur : installe l’extension. <a href="/bloom-relier-of.zip" download className="inline-flex items-center gap-1 font-semibold underline" style={{ color: "var(--v2-sky)" }}><Download className="size-3.5" />Télécharger</a><p className="mt-1 text-[12px] text-muted">Dézippe, ouvre chrome://extensions, active « Mode développeur », puis « Charger l’extension non empaquetée » et choisis le dossier « bloom-relier-of ».</p></div></div>
          <div className="flex gap-3"><span className={n} style={nst}>2</span><div>Dans ce Chrome, connecte-toi à <b>onlyfans.com</b> avec le compte de {link.name} et <b>laisse l’onglet ouvert</b>.</div></div>
          <div className="flex gap-3"><span className={n} style={nst}>3</span><div className="flex-1">
            Clique sur l’extension « Bloom – Relier OnlyFans » et colle ce code :
            {code ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-lg px-3 py-2 font-mono text-[20px] font-bold tracking-[4px]" style={{ background: "rgb(255 255 255 / 0.05)" }}>{code.code}</span>
                <button onClick={() => (void navigator.clipboard.writeText(code.code), toast("Code copié"))} className="v2-sq" title="Copier"><Copy className="size-4" /></button>
                <span className="text-[11.5px] text-muted">valable 15 min · en attente…</span>
              </div>
            ) : (
              <button onClick={() => void newCode()} className="v2-btn mt-2">Créer le code</button>
            )}
          </div></div>
        </div>
      )}
    </Modal>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("POST", "/api/of/rules", { url: url.trim(), json: json.trim() });
      toast("Règles enregistrées ✓");
      onClose();
    } catch (e) {
      toast(errText(e), "err");
      setBusy(false);
    }
  };
  return (
    <Modal title="Règles de signature OnlyFans" sub="OnlyFans les change régulièrement : une adresse qui les publie à jour est préférable à un JSON collé." onClose={onClose} sticky>
      <label className="v2-label">Adresse des règles (https://…, JSON)</label>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/rules.json" className="v2-field" />
      <label className="v2-label mt-4">Ou JSON collé (secours, si l’adresse ne répond pas)</label>
      <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={6} placeholder='{"app_token": "…", "static_param": "…", "checksum_indexes": […], "checksum_constant": …, "prefix": "…", "suffix": "…"}' className="v2-field font-mono text-[12px]" style={{ height: "auto", padding: 12 }} />
      <p className="mt-2 text-[12px] text-muted">Laisser un champ vide l’efface. Bloom vérifie les règles avant de les garder.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="v2-btn" data-kind="ghost">Annuler</button>
        <button onClick={() => void save()} disabled={busy || (!url.trim() && !json.trim())} className="v2-btn">{busy ? "Vérification…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}
