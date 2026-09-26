/**
 * Zod schemas: validates every request body and every piece of LLM JSON.
 * Replaces the brief's Pydantic.
 *
 * TODO(slice 2): implement once `zod` is installed (see README > Dependencies).
 * Ref: docs/TechDesign-JobMe-MVP.md > API Contracts
 *
 * Kept import-free for now so the scaffold typechecks before deps land.
 * The Evaluation schema, verbatim from the tech design:
 *
 *   const Score = z.number().int().min(1).max(4);
 *   export const Evaluation = z.object({
 *     scores: z.object({
 *       structure: Score, specificity: Score, impact: Score,
 *       ownership: Score, relevance: Score,
 *     }),
 *     primary_gap: z.enum([
 *       'structure','specificity','impact','ownership','relevance',
 *     ]),
 *     evidence: z.string().max(200),     // verbatim quote
 *     observation: z.string().max(90),   // notepad line
 *     off_topic: z.boolean(),
 *     drafts: z.object({
 *       deepen: z.string().max(220), clarify: z.string().max(220),
 *     }),
 *   });
 *
 * NOTE: primary_gap is recomputed in code (classify.computePrimaryGap) and
 * overrides the model's value when they disagree. Determinism beats deference.
 *
 * Request bodies to validate:
 *   POST /api/sessions            { displayName: 1..40, roleText?: ..2000 }
 *   POST /api/sessions/[id]/turns { transcript: 1..5000, durationMs: int,
 *                                   clientTurnSeq: int }
 *   GET  /api/tts?text=           text <= 600 chars
 */

/** Input caps, enforced by Zod once it lands. Ref: TechDesign > Security */
export const LIMITS = {
  transcript: 5000,
  roleText: 2000,
  ttsText: 600,
  displayName: 40,
} as const;

export {};
