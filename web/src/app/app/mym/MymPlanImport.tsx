"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Info, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { download, readRows, writeXlsx } from "@/lib/xlsx";

// MYM → Médias → Planification → « Import Excel » : copie de MyPulse pour les POSTS. Mêmes colonnes que le modèle de
// MyPulse (media_id, date_schedule, feed_visibility, post_action, post_action_delay, caption), avec deux différences :
//  - media_id = l'identifiant du média dans le mym.cloud tel que Bloom le voit (fichier « Mes médias » ci-dessous), pas
//    le numéro de MyPulse (MYM ne donne pas ce numéro à Bloom) ;
//  - post_action doit rester « none » : Bloom ne sait pas encore supprimer / passer en privé un post après coup.
// Les stories ne sont pas prises en charge.
type Acc = { id: string; name: string; linked: boolean };
type Line = { line: number; ok: boolean; why?: string; at?: number; visibility?: string };
type Report = { simulate: boolean; total: number; ok: number; lines: Line[] };
const COLS = ["media_id", "date_schedule", "feed_visibility", "post_action", "post_action_delay", "caption"];
const card = { background: "var(--mp-card)", border: "1px solid var(--mp-line)" };
const inp = { background: "var(--mp-card-2)", border: "1px solid var(--mp-line)", color: "var(--mp-head)" };
const stamp = (t: number) => new Date(t).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function PlanImport({ accounts, onDone }: { accounts: Acc[]; onDone: () => void }) {
  const linked = accounts.filter((a) => a.linked);
  const [creatorId, setCreatorId] = useState(linked[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [simulate, setSimulate] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [rep, setRep] = useState<Report | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const name = linked.find((a) => a.id === creatorId)?.name || "compte";
  const template = () => download(writeXlsx([COLS, ["(colle ici un identifiant de « Mes médias »)", "2026-12-01 21:00", "public", "none", "", "Texte du post (facultatif)"]], "Posts"), "bloom_import_posts.xlsx");
  const medias = async () => {
    setBusy("medias");
    setErr("");
    try {
      const r = await api<{ name: string; medias: { id: string; type: string; filename: string; description: string; createdAt: string | null }[] }>("GET", `/api/mym/plan/medias?creatorId=${encodeURIComponent(creatorId)}`);
      download(writeXlsx([["Identifiant (media_id)", "Type", "Ajouté le", "Nom du fichier", "Description"], ...r.medias.map((m) => [m.id, m.type === "video" ? "Vidéo" : "Photo", m.createdAt ? stamp(Date.parse(m.createdAt)) : "", m.filename, m.description])], "Mes médias"), `bloom_medias_${r.name.replace(/[^a-z0-9]+/gi, "_")}.xlsx`);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  };
  const run = async () => {
    if (!file || !creatorId) return;
    setBusy("import");
    setErr("");
    setRep(null);
    try {
      const rows = await readRows(file, "Posts");
      const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
      const at = (k: string) => head.indexOf(k);
      if (at("media_id") < 0 || at("date_schedule") < 0 || at("feed_visibility") < 0) throw new Error("Colonnes attendues sur la première ligne : media_id, date_schedule, feed_visibility (puis post_action, post_action_delay, caption).");
      const data = rows.slice(1).map((r, i) => ({ line: i + 2, ...Object.fromEntries(COLS.map((k) => [k, at(k) >= 0 ? (r[at(k)] ?? "").trim() : ""])) })).filter((r) => COLS.some((k) => (r as Record<string, unknown>)[k] && !String((r as Record<string, unknown>)[k]).startsWith("(colle ici")));
      if (!data.length) throw new Error("Aucune ligne remplie dans l’onglet « Posts ».");
      if (data.length > 500) throw new Error("500 lignes au plus par fichier.");
      const all: Report = { simulate, total: 0, ok: 0, lines: [] };
      // Par paquets de 40 lignes (les légendes peuvent être longues).
      for (let i = 0; i < data.length; i += 40) {
        const r = await api<Report>("POST", "/api/mym/plan/import", { creatorId, simulate, rows: data.slice(i, i + 40) });
        all.total += r.total;
        all.ok += r.ok;
        all.lines.push(...r.lines);
        setRep({ ...all });
      }
      if (!simulate && all.ok) onDone();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy("");
  };
  const Step = ({ n, title, text }: { n: number; title: string; text: string }) => <div className="flex gap-3 rounded-lg p-4" style={{ background: "var(--mp-card-2)", border: "1px solid var(--mp-line)" }}><span className="grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: "var(--mp-accent)", color: "var(--mp-on-accent)" }}>{n}</span><div><b className="text-[13.5px]" style={{ color: "var(--mp-head)" }}>{title}</b><p className="mt-1 text-[12.5px] leading-relaxed">{text}</p></div></div>;
  const Col = ({ k, need, text }: { k: string; need?: boolean; text: string }) => <div className="mt-3"><p className="flex items-center gap-2"><code className="text-[12.5px]" style={{ color: "#ff5c8a" }}>{k}</code><span className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold" style={need ? { borderColor: "var(--mp-accent)", color: "var(--mp-accent)" } : { borderColor: "var(--mp-line)" }}>{need ? "obligatoire" : "facultative"}</span></p><p className="mt-1 text-[12.5px] leading-relaxed">{text}</p></div>;
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg p-5" style={card}>
        <p className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}><FileSpreadsheet className="size-4" /> Programmer tout un planning depuis Excel</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Step n={1} title="Téléchargez le modèle et vos médias" text="Le modèle contient les colonnes ; « Mes médias » liste les médias du mym.cloud du compte avec leur identifiant." />
          <Step n={2} title="Une ligne par publication" text="Date en heure de Paris (2026-12-01 21:00), public ou private. Les mots en français sont acceptés." />
          <Step n={3} title="Simulez, puis importez" text="Avec « Simulation », chaque ligne est vérifiée sans rien programmer. Corrigez, puis relancez pour de bon." />
        </div>
      </div>
      <p className="flex items-start gap-2 rounded-lg px-4 py-3 text-[13px]" style={{ background: "#16323d", border: "1px solid #22607a", color: "#9fdcf0" }}><Info className="mt-0.5 size-4 shrink-0" /> Import des posts (un média par ligne). Les stories, et « supprimer / passer en privé après un délai », ne sont pas encore pris en charge par Bloom. Un fichier rempli pour MyPulse ne passe pas tel quel : ses numéros de média ne sont pas ceux de Bloom.</p>
      <div className="rounded-lg p-5" style={card}>
        <p className="flex flex-wrap items-center gap-2"><b className="flex-1 text-[14.5px]" style={{ color: "var(--mp-head)" }}>Importer des Posts</b>
          <button onClick={template} className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12.5px] font-semibold" style={{ background: "#0ab39c22", color: "#0ab39c" }}><Download className="size-3.5" /> Télécharger le modèle</button>
          <button onClick={medias} disabled={!creatorId || busy === "medias"} className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50" style={{ background: "#0ab39c22", color: "#0ab39c" }}><Download className="size-3.5" /> {busy === "medias" ? "Lecture du mym.cloud…" : `Mes médias (${name})`}</button>
        </p>
        <details className="mt-3 rounded-lg p-4" style={{ background: "var(--mp-card-2)", border: "1px solid var(--mp-line)" }}>
          <summary className="cursor-pointer text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>Colonnes et valeurs acceptées</summary>
          <Col k="media_id" need text="L’identifiant du média à publier, copié depuis le fichier « Mes médias » (une suite de lettres et de chiffres avec des tirets)." />
          <Col k="date_schedule" need text="Date et heure de publication en heure de Paris, au format AAAA-MM-JJ HH:MM (ex. 2026-12-01 21:00). Une date déjà passée est ignorée." />
          <Col k="feed_visibility" need text="public : visible de tous (5 posts publics par jour au maximum sur MYM). private : réservé aux abonnés." />
          <Col k="post_action" text="Laissez vide ou « none ». « delete » et « make_private » ne sont pas encore pris en charge : la ligne serait refusée." />
          <Col k="post_action_delay" text="Ignorée pour l’instant." />
          <Col k="caption" text="Texte du post, 1 500 caractères au maximum." />
        </details>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button onClick={() => input.current?.click()} className="flex h-14 items-center gap-3 rounded-lg px-4 text-left text-[13.5px]" style={inp}><Upload className="size-4" /><span><span className="block text-[11.5px]" style={{ color: "var(--mp-text)" }}>Fichier .xlsx</span>{file ? file.name : "Choisir un fichier"}</span></button>
          <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setRep(null), (e.target.value = ""))} />
          <label className="flex h-14 flex-col justify-center rounded-lg px-4 text-[11.5px]" style={inp}>Créateur<select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} className="bg-transparent text-[13.5px] outline-none" style={{ color: "var(--mp-head)" }}>{linked.map((a) => <option key={a.id} value={a.id} style={{ background: "#222" }}>{a.name}</option>)}</select></label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13.5px]" style={{ color: "var(--mp-head)" }}><input type="checkbox" checked={simulate} onChange={() => setSimulate(!simulate)} /> Simulation (validation uniquement)</label>
        <button onClick={run} disabled={!file || !creatorId || busy === "import"} className="mt-3 h-10 w-full rounded-lg text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: "#4a57a8" }}>{busy === "import" ? "Lecture du fichier…" : simulate ? "Vérifier le fichier" : "Importer les Posts"}</button>
        {err ? <p className="mt-3 text-[13px]" style={{ color: "var(--mp-down)" }}>{err}</p> : null}
        {rep ? (
          <div className="mt-4">
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--mp-head)" }}>{rep.simulate ? "Simulation" : "Import"} : {rep.ok} ligne(s) {rep.simulate ? "valides" : "programmées"} sur {rep.total}{rep.simulate && rep.ok ? " — rien n’a été programmé." : ""}</p>
            <div className="mt-2 max-h-72 overflow-y-auto rounded-lg" style={{ border: "1px solid var(--mp-line)" }}>
              {rep.lines.map((l) => <p key={l.line} className="flex gap-3 border-b px-3 py-1.5 text-[12.5px] last:border-0" style={{ borderColor: "var(--mp-line)" }}><span className="w-16 shrink-0">Ligne {l.line}</span>{l.ok ? <span style={{ color: "#3cd188" }}>OK · {l.at ? stamp(l.at) : ""} · {l.visibility === "private" ? "privé" : "public"}</span> : <span style={{ color: "#f06548" }}>{l.why}</span>}</p>)}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
