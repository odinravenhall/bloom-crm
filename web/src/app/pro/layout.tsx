import type { Metadata } from "next";
import { CHAT_ROLES, requireMe } from "@/lib/server";
import { Toaster as RvToaster } from "@/rv/components/Toaster";

// Messages Pro : fenêtre à part (comme l'application Infloww), sans le menu de Bloom.
export const metadata: Metadata = { title: { default: "Messages Pro", template: "%s · Messages Pro" } };
export const dynamic = "force-dynamic";

export default async function ProLayout({ children }: { children: React.ReactNode }) {
  await requireMe(CHAT_ROLES);
  return (
    <>
      {children}
      <RvToaster />
    </>
  );
}
