"use client";

import { useEffect, useRef, useState } from "react";
import { CloudUpload, Send, Trash2 } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useCreators } from "@/lib/creators";
import { Avatar } from "@/components/ui";

// MYM → Médias → Importer des médias : copie de MyPulse. Les fichiers partent dans le vault de la modèle chez Substy
// (en passant par Bloom), rangés dans la collection choisie.
type Folder = { id: string; name: string };
type Job = { file: File; state: "wait" | "send" | "ok" | "err"; error?: string };
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} Mo`;

export function MymImport() {
  const { creators, creatorId, creator, setCreator } = useCreators();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [listId, setListId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!creatorId) return;
    setListId("");
    api<{ lists: Folder[] }>("GET", `/api/vaultpro/cats?creatorId=${encodeURIComponent(creatorId)}`).then((r) => setFolders(r.lists)).catch(() => setFolders([]));
  }, [creatorId]);
  const send = async () => {
    if (!creatorId || !jobs.length) return;
    setBusy(true);
    for (let i = 0; i < jobs.length; i++) {
      if (jobs[i].state === "ok") continue;
      setJobs((j) => j.map((x, k) => (k === i ? { ...x, state: "send" } : x)));
      const f = jobs[i].file;
      try {
        const p = new URLSearchParams({ creatorId, name: f.name, size: String(f.size), ...(listId ? { listId } : {}) });
        const r = await fetch(`/api/vaultpro/upload?${p}`, { method: "POST", body: f, headers: { "content-type": f.type || "application/octet-stream" } });
        const b = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) throw new Error(b.error || `Erreur ${r.status}`);
        setJobs((j) => j.map((x, k) => (k === i ? { ...x, state: "ok" } : x)));
      } catch (e) {
        setJobs((j) => j.map((x, k) => (k === i ? { ...x, state: "err", error: (e as Error).message } : x)));
      }
    }
    setBusy(false);
    toast("Envoi terminé : les médias apparaissent dans le Studio dès que MYM les a traités.");
  };
  const field = "mt-1.5 h-10 w-full rounded-md px-3 outline-none";
  const fieldSt = { background: "var(--mp-card-2)", color: "var(--mp-head)" };
  return (
    <div className="mp-font min-h-full p-4 md:p-6" style={{ background: "var(--mp-page)", color: "var(--mp-text)" }}>
      <div className="mx-auto max-w-[1000px] rounded-lg" style={card}>
        <h1 className="flex items-center gap-2 border-b px-5 py-3.5 text-[15px] font-semibold" style={{ borderColor: "var(--mp-line)", color: "var(--mp-head)" }}><CloudUpload className="size-4" /> Importer des médias</h1>
        <div className="px-5 py-4 text-[13px]">
          <p className="font-semibold" style={{ color: "var(--mp-head)" }}>Compte destinataire</p>
          <span className="mt-1.5 flex h-10 items-center gap-2 rounded-md px-3" style={fieldSt}>
            <Avatar src={creator?.avatar} name={creator?.name} size="size-6" />
            <select disabled={busy} value={creatorId ?? ""} onChange={(e) => setCreator(e.target.value)} className="flex-1 bg-transparent outline-none">
              {creators.map((c) => <option key={c.id} value={c.id} style={{ background: "#222" }}>{c.name}</option>)}
            </select>
            <span className="text-[11px]" style={{ color: "var(--mp-muted)" }}>MYM</span>
          </span>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Les fichiers partent sur ce compte. Changer de compte recharge ses collections.</p>
          <p className="mt-4 font-semibold" style={{ color: "var(--mp-head)" }}>Collection</p>
          <select disabled={busy} value={listId} onChange={(e) => setListId(e.target.value)} className={field} style={fieldSt}>
            <option value="">Sans collection</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Vous pouvez associer vos médias à une collection existante.</p>
          <p className="mt-4 font-semibold" style={{ color: "var(--mp-head)" }}>Fichiers à envoyer</p>
          <div className="mt-1.5 flex items-center gap-3 rounded-md px-3 py-2" style={fieldSt}>
            <button disabled={busy} onClick={() => input.current?.click()} className="rounded px-3 py-1.5" style={{ background: "#3a4047" }}>Sélect. fichiers</button>
            <span style={{ color: "var(--mp-muted)" }}>{jobs.length ? `${jobs.length} fichier(s) choisi(s)` : "Aucun fichier choisi"}</span>
            <input ref={input} type="file" multiple accept="image/*,video/*,audio/*" hidden onChange={(e) => setJobs([...(e.target.files ?? [])].map((file) => ({ file, state: "wait" as const })))} />
          </div>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--mp-muted)" }}>Photos, vidéos et audios acceptés (500 Mo max par fichier). Garde la page ouverte pendant l’envoi.</p>
          {jobs.length ? (
            <div className="mt-3 space-y-1">
              {jobs.map((j, i) => (
                <p key={i} className="flex items-center gap-2 rounded px-3 py-1.5 text-[12px]" style={{ background: "var(--mp-card-2)" }}>
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--mp-head)" }}>{j.file.name}</span>
                  <span style={{ color: "var(--mp-muted)" }}>{mb(j.file.size)}</span>
                  <span style={{ color: j.state === "ok" ? "#0ab39c" : j.state === "err" ? "#f06548" : j.state === "send" ? "#f7b84b" : "var(--mp-muted)" }} title={j.error}>{j.state === "ok" ? "Envoyé" : j.state === "err" ? `Échec : ${j.error}` : j.state === "send" ? "Envoi…" : "En attente"}</span>
                </p>
              ))}
            </div>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button disabled={busy || !jobs.some((j) => j.state !== "ok")} onClick={send} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md font-medium text-white disabled:opacity-50" style={{ background: "#405189" }}><Send className="size-4" /> {busy ? "Envoi en cours…" : "Envoyer"}</button>
            <button disabled={busy} onClick={() => setJobs([])} title="Vider" className="grid size-10 place-items-center rounded-md" style={{ background: "var(--mp-card-2)" }}><Trash2 className="size-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
