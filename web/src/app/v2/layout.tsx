import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { requireMe } from "@/lib/server";
import { CreatorsProvider } from "@/lib/creators";
import { PresencePing } from "@/components/PresencePing";
import { V2Backdrop } from "./V2Backdrop";
import { V2Shell } from "./V2Shell";
import "./v2.css";

// Bloom v2 : le nouveau design unique (OnlyFans + MYM), construit à part sur /v2. Même serveur et mêmes données que
// la version actuelle (/app), qui reste en service tant que la v2 n'est pas prête.
// Police : Plus Jakarta Sans, celle de Raven CRM (la version actuelle de Bloom garde Geist).
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-v2" });
export const metadata: Metadata = { title: { default: "Bloom", template: "%s · Bloom" } };
export const dynamic = "force-dynamic";

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  return (
    <CreatorsProvider>
      <div className={`v2 ${jakarta.variable} relative flex h-dvh w-full max-w-full overflow-hidden`}>
        <V2Backdrop />
        <V2Shell me={me}>{children}</V2Shell>
        <PresencePing />
      </div>
    </CreatorsProvider>
  );
}
