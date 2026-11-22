"use client";

import { Hourglass } from "lucide-react";
import { useT } from "@/lib/i18n";

/** Page pas encore faite (entrée du menu copiée d'Infloww, on la construira ensuite). */
export function Soon({ name }: { name: string }) {
  const { t } = useT();
  return (
    <div className="grid min-h-full place-items-center p-8" style={{ background: "var(--of-page)", color: "var(--of-text)" }}>
      <div className="max-w-sm text-center">
        <Hourglass className="mx-auto size-8" style={{ color: "var(--of-muted)" }} />
        <h1 className="mt-4 text-xl font-semibold">{t(name)}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--of-muted)" }}>
          {t("Soon")} · {t("This page is coming in a next step.")}
        </p>
      </div>
    </div>
  );
}
