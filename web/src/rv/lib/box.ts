/** Boîte d'un fan (1..n), stable : le même fan tombe toujours dans la même boîte (hash FNV-1a de son id). */
export function boxOf(memberId: unknown, n: unknown) {
  const count = Math.max(1, Number(n) || 1);
  let h = 2166136261;
  for (const ch of String(memberId ?? "")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (h % count) + 1;
}

export const defaultBoxName = (i: number) => `Box ${i}`;
