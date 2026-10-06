/**
 * STAR rewrite of the weakest answer.
 * Ref: docs/PRD-JobMe-MVP.md > Scorecard
 *
 * Keeps the candidate's own facts and invents no achievements - [metric]
 * placeholders stand in where a fact was missing. That constraint is the whole
 * point: a rewrite that fabricates a number teaches someone to lie in a real
 * interview.
 *
 * rewrite = null (the model failed): an honest "unavailable" state. There is
 * deliberately NO retry button — the report route is idempotent and returns
 * the saved report without regenerating, so a retry could not produce one.
 * The rest of the scorecard stands on its own.
 *
 * TODO(voice, P1): the recruiter reads this aloud.
 */

import { Card } from "@/components/ui/Card";
import { DIMENSION_LABELS } from "@/lib/frontend/labels";
import type { ReportTurnView } from "@/lib/frontend/types";

export function RewriteCard({ weakest, rewrite }: { weakest: ReportTurnView | null; rewrite: string | null }) {
  return (
    <Card as="section" aria-labelledby="rewrite-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="rewrite-title" className="text-base font-semibold text-ink">
          Your weakest answer, rewritten
        </h2>
        <p className="text-sm text-muted">
          Restructured as Situation, Task, Action, Result using only what you said. Fill in the{" "}
          <span className="font-mono">[placeholders]</span> with your real details.
        </p>
      </div>

      {!weakest ? (
        <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink">
          None of your answers could be scored, so there&rsquo;s no rewrite for this interview.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted">
              Q{weakest.seq}
              {weakest.primaryGap && ` · main gap: ${DIMENSION_LABELS[weakest.primaryGap]}`}
            </p>
            <p className="font-medium text-ink">{weakest.questionText}</p>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">What you said</summary>
            <p className="mt-2 whitespace-pre-line text-ink">{weakest.answer}</p>
          </details>
          {rewrite ? (
            <p className="whitespace-pre-line rounded-lg bg-accent-soft p-4 text-sm leading-relaxed text-ink">
              {rewrite}
            </p>
          ) : (
            <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink">
              A rewrite isn&rsquo;t available for this interview. Your scores and transcript above are complete.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
