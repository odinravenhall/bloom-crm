"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { api, toast } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Avatar } from "@/components/ui";

// Growth → Auto-follow (OnlyFans) : copie de la page d'Infloww. Suivre automatiquement les fans dont l'abonnement a
// expiré. Substy ne le permet pas encore : les interrupteurs sont gardés par Bloom, les compteurs restent à 0.
type Account = { id: string; name: string; avatar: string | null };
const BLUE = "#2f6bff";
const PAGE = 10;

export function AutoFollow({ canEdit }: { canEdit: boolean }) {
  const { t } = useT();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [creator, setCreator] = useState("");
  const [state, setState] = useState<"" | "on" | "off">("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    api<{ accounts: Account[] }>("GET", "/api/of-reports/creators").then((r) => setAccounts(r.accounts)).catch(() => setAccounts([]));
    api<{ on: Record<string, boolean> }>("GET", "/api/autofollow").then((r) => setOn(r.on)).catch(() => {});
  }, []);
  const rows = useMemo(
    () => (accounts ?? []).filter((a) => (!creator || a.id === creator) && (!state || (state === "on") === !!on[a.id])).sort((a, b) => a.name.localeCompare(b.name)),
    [accounts, creator, state, on],
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const toggle = async (a: Account) => {
    const v = !on[a.id];
    setOn((x) => ({ ...x, [a.id]: v }));
    try {
      await api("POST", "/api/autofollow", { account: a.id, on: v });
    } catch (e) {
      setOn((x) => ({ ...x, [a.id]: !v }));
      toast((e as Error).message, "err");
    }
  };
  return (
    <div className="min-h-full p-4 md:p-5" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <h1 className="border-b pb-3 text-[17px] font-semibold" style={{ borderColor: "var(--of-line)" }}>{t("Auto-follow")}</h1>
      <p className="mt-4 text-[14px]">{t("Automatically follow fans whose subscriptions have expired")}</p>
      <p className="mt-3 flex items-start gap-2 rounded-md px-3 py-2.5 text-[12px]" style={{ background: "#2a2412", color: "#e7b94a" }}>
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {t("Not active yet: Substy can't follow fans for the agency yet. Your choices are saved and will apply as soon as it's possible.")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-[14px]">
        <label className="flex items-center gap-2">
          {t("Creator")}:
          <span className="relative">
            <select value={creator} onChange={(e) => (setCreator(e.target.value), setPage(1))} className="h-9 w-[190px] appearance-none rounded-md border bg-transparent px-3 outline-none" style={{ borderColor: "var(--of-line)", color: creator ? "var(--of-text)" : "var(--of-muted)" }}>
              <option value="" style={{ background: "#222" }}>{t("Search Creator name")}</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id} style={{ background: "#222", color: "#fff" }}>{a.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-2.5 right-2.5 size-4" style={{ color: "var(--of-muted)" }} />
          </span>
        </label>
        <label className="flex items-center gap-2">
          {t("Auto-follow")}:
          <span className="relative">
            <select value={state} onChange={(e) => (setState(e.target.value as typeof state), setPage(1))} className="h-9 w-[190px] appearance-none rounded-md border bg-transparent px-3 outline-none" style={{ borderColor: "var(--of-line)" }}>
              <option value="" style={{ background: "#222" }}>{t("All")}</option>
              <option value="on" style={{ background: "#222" }}>{t("On")}</option>
              <option value="off" style={{ background: "#222" }}>{t("Off")}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute top-2.5 right-2.5 size-4" style={{ color: "var(--of-muted)" }} />
          </span>
        </label>
        <button onClick={() => (setCreator(""), setState(""), setPage(1))} className="ml-auto h-9 rounded-md border px-4" style={{ borderColor: BLUE, color: BLUE }}>{t("Reset")}</button>
      </div>
      <div className="of-scroll mt-4 overflow-x-auto rounded-md">
        <table className="w-full min-w-[900px] text-[14px]">
          <thead>
            <tr className="text-left" style={{ background: "var(--of-line)" }}>
              {["Creator name", "Total follows", "Today", "Yesterday", "7 days", "30 days", "Last followed", "Action"].map((h) => (
                <th key={h} className="px-4 py-4 font-medium">{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice((page - 1) * PAGE, page * PAGE).map((a) => (
              <tr key={a.id} className="border-b" style={{ borderColor: "var(--of-line)" }}>
                <td className="px-4 py-4">
                  <span className="flex items-center gap-2.5"><Avatar src={a.avatar} name={a.name} size="size-8" /> {a.name}</span>
                </td>
                {[0, 0, 0, 0, 0].map((v, i) => (
                  <td key={i} className="border-l px-4" style={{ borderColor: "var(--of-line)" }}>{v}</td>
                ))}
                <td className="border-l px-4" style={{ borderColor: "var(--of-line)" }}>-</td>
                <td className="border-l px-4" style={{ borderColor: "var(--of-line)" }}>
                  <button role="switch" aria-checked={!!on[a.id]} disabled={!canEdit} onClick={() => toggle(a)} className="relative h-6 w-11 rounded-full transition-colors disabled:opacity-50" style={{ background: on[a.id] ? BLUE : "#555" }}>
                    <span className="absolute top-0.5 size-5 rounded-full bg-white transition-all" style={{ left: on[a.id] ? 22 : 2 }} />
                  </button>
                </td>
              </tr>
            ))}
            {accounts && !rows.length ? (
              <tr><td colSpan={8} className="py-14 text-center" style={{ color: "var(--of-muted)" }}>{t("No Data")}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="mt-4 flex items-center gap-2 text-[14px]">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 disabled:opacity-30">‹</button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => setPage(n)} className="grid size-8 place-items-center rounded-md border" style={n === page ? { borderColor: BLUE, color: BLUE } : { borderColor: "transparent" }}>{n}</button>
          ))}
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-2 disabled:opacity-30">›</button>
        </div>
      ) : null}
    </div>
  );
}
