// Lecture de la fiche modèle collée telle quelle (format de l'agence : titres avec emoji, puces ➡️, interdits ⛔, alertes 🚨…)
// pour l'afficher en rubriques lisibles dans la messagerie. Aucune case à remplir : on colle, on lit.

export type SheetLine = { text: string; kind: "item" | "no" | "alert" | "ok" | "plain" };
export type SheetTone = "danger" | "warn" | "price" | "intim" | null;
export type SheetBlock = { title: string | null; tone: SheetTone; lines: SheetLine[] };

const BULLET = /^(➡️|➡|⛔️?|❌|🚫|✔️|✔|✅|🚨|▶️|►|•|·|-|\*|–)\s*/u;
const STARTS_WITH_EMOJI = /^(\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])/u;

function lineKind(marker: string): SheetLine["kind"] {
  if (/⛔|❌|🚫/u.test(marker)) return "no";
  if (/🚨/u.test(marker)) return "alert";
  if (/✔|✅/u.test(marker)) return "ok";
  return "item";
}

function isHeading(line: string): boolean {
  if (BULLET.test(line)) return false;
  if (line.length > 48) return false;
  if (STARTS_WITH_EMOJI.test(line) && !line.includes(":")) return true;
  // Titre en majuscules (« PRIX MINIMUM », « NADIA ⬇️ »)
  const letters = line.replace(/[^\p{L}]/gu, "");
  return letters.length >= 3 && letters === letters.toLocaleUpperCase("fr-FR") && !line.includes(":");
}

function toneOf(title: string): SheetTone {
  const t = title.toLowerCase();
  if (/limite|interdit|ne fait pas|jamais|refus/.test(t)) return "danger";
  if (/prix|tarif|minimum|€|\$/.test(t)) return "price";
  if (/sexu|🔞|intime|fantasme/.test(t)) return "intim";
  if (/demande|règle|regle|à savoir|important|attention/.test(t)) return "warn";
  return null;
}

export function parseSheet(text: string): SheetBlock[] {
  const blocks: SheetBlock[] = [];
  let cur: SheetBlock | null = null;
  for (const raw of String(text || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) {
      cur = { title: line, tone: toneOf(line), lines: [] };
      blocks.push(cur);
      continue;
    }
    if (!cur) {
      cur = { title: null, tone: null, lines: [] };
      blocks.push(cur);
    }
    const m = BULLET.exec(line);
    if (m) {
      const rest = line.slice(m[0].length).trim();
      if (rest) cur.lines.push({ text: rest, kind: lineKind(m[1]) });
    } else {
      cur.lines.push({ text: line, kind: "plain" });
    }
  }
  return blocks;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ne garde que les lignes qui contiennent la recherche (avec leur rubrique) ; une rubrique dont le titre correspond reste entière. */
export function filterSheet(blocks: SheetBlock[], q: string): SheetBlock[] {
  const n = fold(q.trim());
  if (!n) return blocks;
  return blocks
    .map((b) => (b.title && fold(b.title).includes(n) ? b : { ...b, lines: b.lines.filter((l) => fold(l.text).includes(n)) }))
    .filter((b) => b.lines.length || (b.title && fold(b.title).includes(n)));
}
