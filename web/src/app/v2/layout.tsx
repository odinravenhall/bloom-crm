import type { Metadata } from "next";
import { requireMe } from "@/lib/server";
import { CreatorsProvider } from "@/lib/creators";
import { PresencePing } from "@/components/PresencePing";
import { V2Shell } from "./V2Shell";
import "./v2.css";

// Bloom v2 : le nouveau design unique (OnlyFans + MYM), construit à part sur /v2. Même serveur et mêmes données que
// la version actuelle (/app), qui reste en service tant que la v2 n'est pas prête.
export const metadata: Metadata = { title: { default: "Bloom", template: "%s · Bloom" } };
export const dynamic = "force-dynamic";

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  return (
    <CreatorsProvider>
      <div className="v2 relative flex h-dvh w-full max-w-full overflow-hidden">
        <div className="v2-backdrop" aria-hidden />
        <V2Shell me={me}>{children}</V2Shell>
        <PresencePing />
      </div>
    </CreatorsProvider>
  );
}
