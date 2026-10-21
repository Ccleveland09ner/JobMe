/**
 * A stronger version of the weakest answer.
 * Ref: docs/PRD-JobMe-MVP.md > Scorecard; docs/Scoring-Rubric.md > Feedback
 *
 * Built from everything the candidate said to that question, follow-ups
 * included, and shaped to the question type — a story for a behavioural
 * question, a clear explanation for a technical one. STAR is one good shape
 * for a story, not a requirement.
 *
 * Keeps the candidate's own facts and invents no achievements: [placeholders]
 * stand in where a fact was missing. That constraint is the whole point: a
 * rewrite that fabricates a number teaches someone to lie in a real
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
import { DIMENSION_LABELS, KIND_LABELS } from "@/lib/frontend/labels";
import type { ReportQuestionView } from "@/lib/frontend/types";

export function RewriteCard({
  weakest,
  rewrite,
}: {
  weakest: ReportQuestionView | null;
  rewrite: string | null;
}) {
  const gap = weakest?.scoredTurn?.primaryGap;

  return (
    <Card as="section" aria-labelledby="rewrite-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="rewrite-title" className="text-base font-semibold text-ink">
          A stronger version of your weakest answer
        </h2>
        <p className="text-sm text-muted">
          Built only from what you said, follow-ups included. Fill in the{" "}
          <span className="font-mono">[placeholders]</span> with your real details — never with ones you
          don&rsquo;t have.
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
              {weakest.ref} · {weakest.label} · {KIND_LABELS[weakest.kind]}
              {gap && ` · main gap: ${DIMENSION_LABELS[gap]}`}
            </p>
            <p className="font-medium text-ink">{weakest.opening.questionText}</p>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">What you said</summary>
            <div className="mt-2 flex flex-col gap-2">
              {weakest.turns.map((t, i) => (
                <div key={t.id}>
                  {i > 0 && <p className="text-xs text-muted">Follow-up: {t.questionText}</p>}
                  <p className="whitespace-pre-line text-ink">{t.answer}</p>
                </div>
              ))}
            </div>
          </details>
          {rewrite ? (
            <p className="whitespace-pre-line rounded-lg bg-accent-soft p-4 text-sm leading-relaxed text-ink">
              {rewrite}
            </p>
          ) : (
            <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink">
              A rewrite isn&rsquo;t available for this interview. Your scores and transcript are complete.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
