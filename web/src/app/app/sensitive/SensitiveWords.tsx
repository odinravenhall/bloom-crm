"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Plus, Search, X } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { download, readColumnA, writeXlsx } from "@/lib/xlsx";

// Growth → Sensitive words : copie de la page d'Infloww (catégories A-Z, recherche, import / export Excel, ajout mot par mot).
// Bloom refuse tout envoi qui contient un de ces mots (messagerie, Messages Pro, envoi groupé, Smart Messages).
const BLUE = "#3a6df0";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SPECIAL = "#";
const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const catOf = (w: string) => {
  const c = fold(w).charAt(0).toUpperCase();
  return LETTERS.includes(c) ? c : SPECIAL;
};

export function SensitiveWords() {
  const { t } = useT();
  const [words, setWords] = useState<string[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [cat, setCat] = useState("A");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"" | "add" | "import">("");
  const load = () =>
    api<{ words: string[]; canEdit: boolean }>("GET", "/api/sensitive")
      .then((r) => (setWords(r.words), setCanEdit(r.canEdit)))
      .catch((e) => toast((e as Error).message, "err"));
  useEffect(() => {
    load();
  }, []);
  const shown = useMemo(() => {
    const all = words ?? [];
    if (q.trim()) return all.filter((w) => fold(w).includes(fold(q.trim())));
    return all.filter((w) => catOf(w) === cat);
  }, [words, cat, q]);
  const remove = async (w: string) => {
    if (!confirm(`${t("Delete")} « ${w} » ?`)) return;
    try {
      await api("POST", "/api/sensitive/delete", { words: [w] });
      setWords((l) => (l ?? []).filter((x) => x !== w));
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };
  const exportXlsx = () => download(writeXlsx([["Sensitive Words"], ...(words ?? []).map((w) => [w])], "Sensitive Words"), "Sensitive Words.xlsx");

  return (
    <div className="flex min-h-full flex-col" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <h1 className="border-b px-6 py-4 text-[16px] font-semibold" style={{ borderColor: "var(--of-line)" }}>{t("Sensitive words")}</h1>
      <div className="flex flex-1 flex-col px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex h-8 w-[300px] items-center rounded border px-3 text-[13px]" style={{ borderColor: "var(--of-line)" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search by letter or word")} className="min-w-0 flex-1 bg-transparent outline-none" />
            <Search className="size-3.5" style={{ color: "var(--of-muted)" }} />
          </label>
          {canEdit ? (
            <span className="flex gap-3 text-[13px]">
              <button onClick={() => setModal("import")} className="h-8 rounded border px-4" style={{ borderColor: "var(--of-line)" }}>{t("Import from Excel")}</button>
              <button onClick={exportXlsx} className="h-8 rounded px-4 text-white" style={{ background: BLUE }}>{t("Export Excel")}</button>
              <button onClick={() => setModal("add")} className="h-8 rounded px-4 text-white" style={{ background: BLUE }}>+ {t("Add word")}</button>
            </span>
          ) : (
            <button onClick={exportXlsx} className="h-8 rounded px-4 text-[13px] text-white" style={{ background: BLUE }}>{t("Export Excel")}</button>
          )}
        </div>
        <p className="mt-4 text-[15px] font-semibold">{t("Categories")}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
          {[...LETTERS, SPECIAL].map((l) => {
            const on = !q && cat === l;
            return (
              <button key={l} onClick={() => (setCat(l), setQ(""))} className="h-8 min-w-8 rounded border px-2.5" style={on ? { borderColor: BLUE, color: BLUE } : { borderColor: "transparent", background: "var(--of-card)" }}>
                {l === SPECIAL ? t("Special symbol") : l}
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex-1 rounded p-5" style={{ background: "var(--of-card)" }}>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            {shown.map((w) => (
              <div key={w} className="group relative grid h-[70px] place-items-center rounded-lg border px-6 text-center text-[14px] break-all" style={{ borderColor: "var(--of-line)" }}>
                {w}
                {canEdit ? (
                  <button onClick={() => remove(w)} title={t("Delete")} className="absolute top-1.5 right-1.5 hidden size-5 place-items-center rounded group-hover:grid" style={{ background: "var(--of-line)" }}>
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {words && !shown.length ? <p className="py-16 text-center text-[14px]" style={{ color: "var(--of-muted)" }}>{t("No Data")}</p> : null}
          {!words ? <p className="py-16 text-center text-[14px]" style={{ color: "var(--of-muted)" }}>…</p> : null}
        </div>
        <p className="mt-3 text-[12px]" style={{ color: "var(--of-muted)" }}>
          {words ? `${words.length} ${t("words")} · ` : ""}{t("Messages that contain one of these words are blocked before sending.")}
        </p>
      </div>
      {modal === "add" ? <AddWords onClose={() => setModal("")} onDone={() => (setModal(""), load())} t={t} /> : null}
      {modal === "import" ? <ImportWords onClose={() => setModal("")} onDone={() => (setModal(""), load())} t={t} /> : null}
    </div>
  );
}

function Shell({ title, children, onClose, onOk, okLabel, busy, t }: { title: string; children: React.ReactNode; onClose: () => void; onOk: () => void; okLabel: string; busy: boolean; t: (s: string) => string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-[520px] rounded-lg" style={{ background: "#2b2b2b", color: "#eee" }} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="border-b px-4 py-3.5 text-[15px] font-semibold" style={{ borderColor: "#3a3a3a" }}>{title}</h3>
        <div className="px-4 py-4 text-[13px]">{children}</div>
        <div className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: "#3a3a3a" }}>
          <button onClick={onClose} className="h-8 rounded border px-4 text-[13px]" style={{ borderColor: "#4a4a4a" }}>{t("Cancel")}</button>
          <button disabled={busy} onClick={onOk} className="h-8 rounded px-4 text-[13px] text-white disabled:opacity-50" style={{ background: BLUE }}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** « Add sensitive word(s) » : un mot par case, 32 caractères au plus. */
function AddWords({ onClose, onDone, t }: { onClose: () => void; onDone: () => void; t: (s: string) => string }) {
  const [list, setList] = useState([""]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const words = list.map((w) => w.trim()).filter(Boolean);
    if (!words.length) return toast(t("Enter a word"), "err");
    setBusy(true);
    try {
      const r = await api<{ added: number; skipped: number }>("POST", "/api/sensitive", { words });
      toast(`${r.added} ${t("word(s) added")}${r.skipped ? ` · ${r.skipped} ${t("already in the list")}` : ""}`);
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title={t("Add sensitive word(s)")} onClose={onClose} onOk={save} okLabel={t("Save")} busy={busy} t={t}>
      <div className="space-y-2">
        {list.map((w, i) => (
          <label key={i} className="flex h-9 items-center gap-2 rounded border px-3" style={{ borderColor: "#4a4a4a", background: "#333" }}>
            <input autoFocus={i === list.length - 1} value={w} maxLength={32} onChange={(e) => setList(list.map((x, j) => (j === i ? e.target.value : x)))} onKeyDown={(e) => e.key === "Enter" && setList([...list, ""])} placeholder={t("Enter a word")} className="min-w-0 flex-1 bg-transparent outline-none" />
            <span style={{ color: "#888" }}>{[...w].length} / 32</span>
            {list.length > 1 ? <button onClick={() => setList(list.filter((_, j) => j !== i))}><X className="size-3.5" /></button> : null}
          </label>
        ))}
      </div>
      <button onClick={() => setList([...list, ""])} className="mt-3 flex items-center gap-1.5" style={{ color: BLUE }}><Plus className="size-4" /> {t("Add word")}</button>
    </Shell>
  );
}

/** « Import sensitive words from Excel » : modèle à télécharger, puis fichier .xlsx (1re colonne, 1re ligne = en-tête). */
function ImportWords({ onClose, onDone, t }: { onClose: () => void; onDone: () => void; t: (s: string) => string }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const template = () =>
    download(writeXlsx([["Sensitive Words", "*Guidelines"], ["17 years", "Character limits\nSensitive Word: Up to 32 characters"]], "Sensitive Words"), "Sensitive words template.xlsx");
  const run = async () => {
    if (!file) return toast(t("Select a file"), "err");
    setBusy(true);
    try {
      const col = await readColumnA(file);
      const words = [...new Set(col.slice(1).map((w) => w.trim()).filter(Boolean))];
      if (!words.length) throw new Error(t("No words found in column A"));
      let added = 0, skipped = 0;
      for (let i = 0; i < words.length; i += 400) {
        const r = await api<{ added: number; skipped: number }>("POST", "/api/sensitive", { words: words.slice(i, i + 400), import: true });
        added += r.added;
        skipped += r.skipped;
      }
      toast(`${added} ${t("word(s) added")}${skipped ? ` · ${skipped} ${t("skipped (already there or over 32 characters)")}` : ""}`);
      onDone();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title={t("Import sensitive words from Excel")} onClose={onClose} onOk={run} okLabel={t("Import")} busy={busy} t={t}>
      <p>{t("Step1: Download the template and fill in the data:")}</p>
      <button onClick={template} className="mt-2 flex items-center gap-2 rounded px-3 py-2" style={{ background: "#333", color: BLUE }}><Download className="size-4" /> Sensitive words template.xlsx</button>
      <p className="mt-5">{t("Step2: Upload the Excel file below (.xlsx only):")}</p>
      <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={() => input.current?.click()} className="mt-2 grid h-[120px] w-[120px] place-items-center rounded border border-dashed p-2 text-center" style={{ borderColor: "#777", color: BLUE }}>
        {file ? <span className="text-[12px] break-all" style={{ color: "#ddd" }}>{file.name}</span> : <span className="grid place-items-center gap-1"><Plus className="size-6" />{t("Select")}</span>}
      </button>
    </Shell>
  );
}
