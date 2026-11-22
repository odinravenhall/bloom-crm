import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page, Soon } from "@/components/ui";

// Rubriques prévues, pas encore faites.
const SOON: Record<string, [string, string]> = {
  "ia-test": ["Tester l’IA", "Discuter avec l’IA comme un fan pour vérifier ses réponses avant de la laisser chatter."],
  programmes: ["Messages programmés", "Voir, créer et annuler les messages programmés de chaque fan."],
  chatteurs: ["Chatteurs", "Les chatteurs de l’équipe, leurs créatrices et leurs chiffres."],
  planning: ["Planning", "Les shifts de chaque chatteur par créatrice, avec une alerte avant le début."],
  pointage: ["Pointage", "Pointage obligatoire avant d’entrer dans la messagerie, pauses et heures faites."],
  paies: ["Paies", "Le calcul des paies à partir des ventes et des heures de chacun."],
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = SOON[(await params).slug];
  return { title: s ? s[0] : "Introuvable" };
}

export default async function SoonPage({ params }: { params: Promise<{ slug: string }> }) {
  const s = SOON[(await params).slug];
  if (!s) notFound();
  return (
    <Page>
      <Soon title={s[0]} text={s[1]} />
    </Page>
  );
}
