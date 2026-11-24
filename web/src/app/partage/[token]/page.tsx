import type { Metadata } from "next";
import { ShareView } from "./ShareView";

// Page publique d'un « partage externe » de liens de suivi MYM : sans compte Bloom. Le jeton est dans l'adresse.
export const metadata: Metadata = { title: "Statistiques partagées", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareView token={token} />;
}
