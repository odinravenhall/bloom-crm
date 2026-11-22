"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import { api, toast } from "@/lib/api";
import { cn } from "@/lib/fmt";
import type { QuickReply } from "@/lib/types";
import { btnCls, inputCls } from "@/components/ui";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Messages rapides de la créatrice (et ceux pour toutes), les plus utilisés d'abord. */
export function useQuickReplies(creatorId: string) {
  const [list, setList] = useState<QuickReply[]>([]);
  const reload = useCallback(() => {
    api<QuickReply[]>("GET", `/api/quick?creatorId=${encodeURIComponent(creatorId)}`)
      .then(setList)
      .catch(() => setList([]));
  }, [creatorId]);
  useEffect(reload, [reload]);
  return { list, reload };
}

export const matchQuick = (list: QuickReply[], query: string) => {
  const s = norm(query.trim());
  if (!s) return list;
  const byTitle = list.filter((r) => norm(r.title).includes(s));
  return [...byTitle, ...list.filter((r) => !byTitle.includes(r) && norm(r.text).includes(s))];
};

/** « {prenom} » devient le prénom du fan. */
export const fillQuick = (text: string, fanName: string) => text.replace(/\{pr[ée]nom\}/gi, (fanName.split(/\s+/)[0] || "").trim());

/** Menu au-dessus de la zone de message : choisir (flèches + Entrée), créer, modifier, supprimer. */
export function QuickMenu({
  creatorId,
  boss,
  items,
  active,
  query,
  onPick,
  onClose,
  onChanged,
}: {
  creatorId: string;
  boss: boolean;
  items: QuickReply[];
  active: number;
  query: string;
  onPick: (r: QuickReply) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [edit, setEdit] = useState<{ id?: number; title: string; text: string; all: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      await api("POST", "/api/quick", { ...edit, creatorId });
      setEdit(null);
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (r: QuickReply) => {
    if (!window.confirm(`Supprimer « ${r.title} » ?`)) return;
    try {
      await api("POST", "/api/quick/delete", { id: r.id });
      onChanged();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  };

  return (
    <div className="absolute right-4 bottom-full left-4 z-20 mb-2 flex max-h-[min(420px,60vh)] flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
      <header className="flex items-center gap-2 border-b px-3 py-2 text-sm">
        <Zap className="size-4 text-primary" />
        <b>Messages rapides</b>
        <span className="text-xs text-muted">{query ? `« ${query} »` : "tape / puis un mot · ↑ ↓ puis Entrée"}</span>
        <button onClick={() => setEdit({ title: query, text: "", all: false })} className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-primary-soft hover:bg-card-2">
          <Plus className="size-3.5" /> Nouveau
        </button>
        <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-card-2" title="Fermer (Échap)">
          <X className="size-4" />
        </button>
      </header>
      {edit ? (
        <div className="flex flex-col gap-2 p-3">
          <input className={inputCls} autoFocus placeholder="Nom (ce que tu taperas après /)" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <textarea className={cn(inputCls, "min-h-24 py-2")} placeholder="Texte du message. {prenom} = prénom du fan." value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
          <div className="flex flex-wrap items-center gap-2">
            {boss ? (
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={edit.all} onChange={(e) => setEdit({ ...edit, all: e.target.checked })} /> Pour toutes les créatrices
              </label>
            ) : null}
            <button onClick={() => setEdit(null)} className={cn(btnCls.ghost, "ml-auto")}>
              Annuler
            </button>
            <button onClick={save} disabled={busy || !edit.title.trim() || !edit.text.trim()} className={btnCls.primary}>
              Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1">
          {items.map((r, i) => (
            <div key={r.id} className={cn("group flex items-start gap-2 rounded-xl px-3 py-2", i === active ? "bg-petal/70" : "hover:bg-card-2")}>
              <button onMouseDown={(e) => (e.preventDefault(), onPick(r))} className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  /{r.title}
                  {r.all ? <span className="text-[10px] font-normal text-muted">toutes</span> : null}
                </span>
                <span className="line-clamp-2 text-xs text-muted">{r.text}</span>
              </button>
              {r.mine || boss ? (
                <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                  <button onClick={() => setEdit({ id: r.id, title: r.title, text: r.text, all: r.all })} className="rounded-lg p-1 text-muted hover:text-fg" title="Modifier">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => remove(r)} className="rounded-lg p-1 text-muted hover:text-rose-400" title="Supprimer">
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              ) : null}
            </div>
          ))}
          {!items.length ? <p className="p-4 text-center text-sm text-muted">{query ? "Aucun message rapide trouvé. « Nouveau » pour le créer." : "Pas encore de message rapide. « Nouveau » pour en créer un."}</p> : null}
        </div>
      )}
    </div>
  );
}
