import type { Media } from "./types";

/** Une étape (un message) d'un script. */
export type LibScript = {
  id: number;
  title: string;
  content: string;
  note: string | null;
  price: number | null;
  medias: Media[];
  tags: string[];
  fromReveal: boolean;
  uses: number;
  sales: number;
  revenue: number;
  usedWithFan: string | null;
  usedBy?: string | null;
};
/** Un script = une suite d'étapes rangée dans un dossier ; « séquence » = se déroule étape par étape dans le chat. */
export type LibSequence = {
  id: number;
  title: string;
  folder: string;
  isSequence: boolean;
  fromReveal: boolean;
  steps: number[];
  uses: number;
  sales: number;
  ppvSent: number;
  revenue: number;
  updatedAt: number;
  pushedAt: number | null;
};
export type Lib = { scripts: LibScript[]; sequences: LibSequence[]; progress: { sequenceId: number; step: number; active: boolean }[]; canEdit: boolean };

export const conv = (sales: number, sent: number) => (sent ? Math.round((sales / sent) * 100) : null);
