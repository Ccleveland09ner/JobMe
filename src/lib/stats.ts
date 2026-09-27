/**
 * Speaking stats, computed in code so they never depend on an AI call.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Speaking Stats
 */

/**
 * Over CAPTURE time, not hold time: hold includes thinking pauses and
 * under-reports speaking rate by 20-40% on a considered answer, which would
 * tell a well-paced candidate they speak too slowly.
 */
export function wpm(text: string, captureMs: number): number {
  if (captureMs <= 0) return 0;
  return Math.round(wordCount(text) / (captureMs / 60000));
}

/**
 * Labelled "approximate" wherever it surfaces: Chrome drops most "um"/"uh"
 * before the server sees the transcript, so a low count means little.
 */
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
