import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireMe } from "@/lib/server";
import { CreatorsProvider } from "@/lib/creators";
import { PresencePing } from "@/components/PresencePing";
import { v2BaseOf } from "@/lib/v2host";
import { V2Nav } from "./nav";
import { jakarta } from "./font";
import { V2Backdrop } from "./V2Backdrop";
import { V2Shell } from "./V2Shell";
import "./v2.css";

// Bloom v2 : le nouveau design unique (OnlyFans + MYM). Même serveur et mêmes données que la version actuelle (/app).
// Sur l'adresse principale elle vit sous « /v2 » ; sur bloomcrm.fr elle est le site entier, sans « /v2 » dans l'adresse
// (next.config.mjs réécrit les adresses, `V2Nav` donne aux écrans le bon début de lien).
// Police : Plus Jakarta Sans (font.ts).
export const metadata: Metadata = { title: { default: "Bloom", template: "%s · Bloom" } };
export const dynamic = "force-dynamic";

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  const base = v2BaseOf((await headers()).get("host"));
  return (
    <CreatorsProvider>
      <V2Nav base={base}>
        <div className={`v2 ${jakarta.variable} relative flex h-dvh w-full max-w-full overflow-hidden`}>
          <V2Backdrop />
          <V2Shell me={me}>{children}</V2Shell>
          <PresencePing />
        </div>
      </V2Nav>
    </CreatorsProvider>
  );
}
