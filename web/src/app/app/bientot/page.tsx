import type { Metadata } from "next";
import { Hourglass } from "lucide-react";
import { requireMe } from "@/lib/server";

export const metadata: Metadata = { title: "Bientôt" };
export const dynamic = "force-dynamic";

/** Page pas encore faite (entrée du menu copiée d'Infloww, on la construira ensuite). */
export default async function Soon({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requireMe();
  const f = String((await searchParams).f || "Cette page").slice(0, 60);
  return (
    <div className="grid min-h-full place-items-center p-8">
      <div className="max-w-sm text-center">
        <Hourglass className="mx-auto size-8 text-muted" />
        <h1 className="mt-4 text-xl font-semibold">{f}</h1>
        <p className="mt-1 text-sm text-muted">Bientôt : cette page arrive dans une prochaine étape.</p>
      </div>
    </div>
  );
}
