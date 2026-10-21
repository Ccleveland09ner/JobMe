/** Speaking stats, computed in code so they never depend on an AI call. */

/** Over capture time, not hold time (which includes pauses and under-reports pace). */
export function wpm(text: string, captureMs: number): number {
  if (captureMs <= 0) return 0;
  return Math.round(wordCount(text) / (captureMs / 60000));
}

/** Approximate: Chrome drops most "um"/"uh" before the server sees the text. */
export const FILLER_RE =
  /\b(um+|uh+|erm|like|you know|basically|actually|kind of|sort of|i mean)\b/gi;

export function fillerCount(text: string): number {
  return (text.match(FILLER_RE) ?? []).length;
}

/** Under 5 words -> nudge instead of scoring, and don't count toward the cap. */
export const MIN_ANSWER_WORDS = 5;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Per-dimension averages across scored turns. Unscored turns are excluded. */
export function averageScores(
  turns: { scores: Record<string, number> | null }[],
): Record<string, number> | null {
  const scored = turns.filter((t) => t.scores);
  if (!scored.length) return null;

  const totals: Record<string, number> = {};
  for (const turn of scored) {
    for (const [key, value] of Object.entries(turn.scores!)) {
      totals[key] = (totals[key] ?? 0) + value;
    }
  }
  for (const key of Object.keys(totals)) {
    totals[key] = Number((totals[key] / scored.length).toFixed(2));
  }
  return totals;
}
