import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getState } from "@/lib/server";
import { Logo } from "@/components/ui";
import { FirstSetup, PasswordLogin } from "./Forms";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

// On entre dans Bloom par le bot Discord (/connexion). Les formulaires ne servent qu'à la toute première mise en route.
export default async function Connexion() {
  const s = await getState();
  if (s.me) redirect(s.me.role === "chatter" ? "/app/messagerie" : "/app");
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="card rise w-full max-w-md rounded-(--radius-card) border bg-card/80 p-7 backdrop-blur">
        <Logo href="/connexion" />
        {!s.setup ? (
          <FirstSetup />
        ) : s.discord ? (
          <div className="mt-6 flex flex-col gap-3">
            <h1 className="text-2xl">Connexion</h1>
            <p className="text-sm text-muted">
              Va sur le serveur Discord de l’agence, salon <b className="text-fg">#connexion</b>, et tape <b className="text-fg">/connexion</b>.
            </p>
            <p className="text-sm text-muted">Le bot Bloom t’envoie un lien rien que pour toi, valable 5 minutes. Pas de rôle Chatteur ? Demande à un admin.</p>
          </div>
        ) : (
          <PasswordLogin />
        )}
      </div>
    </main>
  );
}
