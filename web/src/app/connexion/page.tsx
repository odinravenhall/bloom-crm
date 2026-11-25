import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sparkle } from "lucide-react";
import { getState } from "@/lib/server";
import { homeOf } from "@/lib/types";
import { isV2Host } from "@/lib/v2host";
import { Logo } from "@/components/ui";
import { jakarta } from "../v2/font";
import { V2Backdrop } from "../v2/V2Backdrop";
import { FirstSetup, PasswordLogin } from "./Forms";
// Les styles de la nouvelle version (tout y est sous « .v2 » : sans effet sur la page de l'adresse principale).
import "../v2/v2.css";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

const ERR: Record<string, string> = {
  off: "La connexion par Discord n’est pas encore branchée.",
  cancel: "Connexion annulée sur Discord.",
  state: "Le lien de connexion a expiré : recommence.",
};

function DiscordLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.25a18.3 18.3 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.89 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01l.37.29a.08.08 0 0 1 0 .13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.16-1.08-2.16-2.42s.96-2.42 2.16-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42z" />
    </svg>
  );
}

// On entre dans Bloom par Discord : bouton (OAuth2) ou /connexion sur le serveur. Les formulaires ne servent qu'à la mise en route.
export default async function Connexion({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const s = await getState();
  // bloomcrm.fr : tout le site est la nouvelle version (accueil « / », messagerie « /messagerie »).
  const v2 = isV2Host((await headers()).get("host"));
  if (s.me) redirect(v2 ? (s.me.role === "chatter" ? "/messagerie" : "/") : homeOf(s.me.role));
  const e = (await searchParams).e;
  const err = e ? (ERR[e] ?? e.slice(0, 200)) : "";
  const body = (
    <>
        {!s.setup ? (
          <FirstSetup />
        ) : s.discord ? (
          <div className="mt-6 flex flex-col gap-4">
            <div>
              <h1 className="text-2xl">Connexion</h1>
              <p className="mt-1 text-sm text-muted">Bloom est réservé à l’équipe : il faut être sur le serveur Discord de l’agence avec le rôle Chatteur, Manager ou Admin.</p>
            </div>
            {s.oauth ? (
              <a href="/api/auth/discord" className="inline-flex h-11 items-center justify-center gap-2.5 rounded-xl bg-[#5865F2] px-4 text-sm font-bold text-white transition-colors hover:bg-[#4752c4]">
                <DiscordLogo /> Se connecter avec Discord
              </a>
            ) : null}
            {err ? <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200">{err}</p> : null}
            {/* Le lien envoyé par le bot ouvre la session sur l'adresse principale (donc la version actuelle) : sur
                bloomcrm.fr on ne le propose pas tant que le bouton Discord est là. */}
            {v2 && s.oauth ? null : (
            <p className="text-sm text-muted">
              {s.oauth ? "Ou bien : " : ""}va dans le salon <b className="text-fg">#connexion</b> du serveur Discord et tape <b className="text-fg">/connexion</b>. Le bot t’envoie un lien rien que pour toi, valable 5 minutes.
            </p>
            )}
          </div>
        ) : (
          <PasswordLogin />
        )}
    </>
  );
  // Sur bloomcrm.fr, la même page dans l'habillage de la nouvelle version (ciel étoilé, logo, police) : mêmes liens.
  if (v2)
    return (
      <main className={`v2 ${jakarta.variable} relative grid min-h-dvh w-full place-items-center overflow-hidden px-4 py-10`}>
        <V2Backdrop />
        <div className="v2-card v2-rise z-[1] w-full max-w-md p-7">
          <p className="v2-logo" style={{ padding: 0 }}><Sparkle /><span>Bloom</span></p>
          {body}
        </div>
      </main>
    );
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="card w-full max-w-md rounded-(--radius-card) border bg-card p-7">
        <Logo href="/connexion" />
        {body}
      </div>
    </main>
  );
}
