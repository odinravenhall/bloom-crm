import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { CreatorsProvider } from "@/lib/creators";
import { SideNav } from "./SideNav";
import { PresencePing } from "@/components/PresencePing";
import { PermGuard } from "@/components/PermGuard";

export const metadata: Metadata = { title: { default: "Bloom CRM", template: "%s · Bloom CRM" } };
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  return (
    <CreatorsProvider>
      <div className="flex h-dvh w-full max-w-full flex-col md:flex-row">
        <SideNav me={me} />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <PermGuard me={me}>{children}</PermGuard>
        </main>
        <PresencePing />
      </div>
    </CreatorsProvider>
  );
}
