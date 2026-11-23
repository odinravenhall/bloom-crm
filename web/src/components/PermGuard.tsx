"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { canOpen } from "@/lib/perms";
import { useT } from "@/lib/i18n";
import type { Me } from "@/lib/types";

/** Page fermée par le rôle Bloom (Role settings) : message à la place de la page. */
export function PermGuard({ me, children }: { me: Me; children: React.ReactNode }) {
  const path = usePathname() || "";
  const { t } = useT();
  if (canOpen(me, path)) return <>{children}</>;
  return (
    <div className="grid min-h-full place-items-center p-6 text-center">
      <div>
        <ShieldOff className="mx-auto size-10 opacity-60" />
        <p className="mt-3 text-[17px] font-semibold">{t("Your role does not give access to this page")}</p>
        <p className="mt-1 text-[14px] opacity-70">{t("Ask an admin to change your permissions in Role settings.")}</p>
        <Link href="/app" className="mt-4 inline-block rounded-md border px-4 py-2 text-[14px]">{t("Back to home")}</Link>
      </div>
    </div>
  );
}
