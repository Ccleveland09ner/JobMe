/**
 * STAR rewrite of the weakest answer.
 *
 * TODO(slice 5): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Scorecard
 *
 * Keeps the candidate's own facts and invents no achievements - [metric]
 * placeholders stand in where a fact was missing. That constraint is the whole
 * point: a rewrite that fabricates a number teaches someone to lie in a real
 * interview.
 *
 * rewrite = null (the LLM failed) -> "Rewrite unavailable - try again" plus a
 * retry button. The rest of the scorecard still stands on its own.
 *
 * P1: the recruiter reads this aloud.
 */

export function RewriteCard() {
  return <section className="rounded-lg border border-muted/20 p-4">{/* TODO(slice 5) */}</section>;
}
