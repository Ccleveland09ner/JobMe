/**
 * What went well and what to work on, each tied to the question it is about.
 * Ref: docs/Scoring-Rubric.md > Feedback
 *
 * A strength's quote was checked on the server to be the candidate's own
 * words (lib/ai/report.ts verifyQuote); an unverified quote never reaches
 * here. Reports written before this existed have no feedback, and the section
 * says so rather than disappearing.
 */

import { Card } from "@/components/ui/Card";
import type { FeedbackItem, ReportFeedback } from "@/lib/ai/report";
import type { ReportQuestionView } from "@/lib/frontend/types";

export function FeedbackList({
  feedback,
  questions,
}: {
  feedback: ReportFeedback | null;
  questions: ReportQuestionView[];
}) {
  const labelFor = (ref: string | null) => {
    if (!ref) return null;
    const q = questions.find((x) => x.ref === ref);
    return q ? `${q.ref} · ${q.label}` : null;
  };

  return (
    <Card as="section" aria-labelledby="feedback-title" className="flex flex-col gap-5">
      <h2 id="feedback-title" className="text-base font-semibold text-ink">
        Feedback
      </h2>
      {!feedback ? (
        <p className="text-sm text-muted">Detailed feedback isn&rsquo;t available for this interview.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Column title="What went well" empty="No specific strengths were recorded for this interview.">
            {feedback.strengths.map((item, i) => (
              <Entry key={i} item={item} label={labelFor(item.question)}>
                {item.quote && (
                  <q className="block border-l-2 border-line pl-2 font-mono text-xs text-ink">{item.quote}</q>
                )}
              </Entry>
            ))}
          </Column>
          <Column title="What to work on" empty="Nothing stood out to work on.">
            {feedback.improvements.map((item, i) => (
              <Entry key={i} item={item} label={labelFor(item.question)}>
                {item.recommendation && (
                  <p className="text-sm text-ink">
                    <span className="font-medium">Try: </span>
                    {item.recommendation}
                  </p>
                )}
              </Entry>
            ))}
          </Column>
        </div>
      )}
    </Card>
  );
}

function Column({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children.length ? (
        <ul className="flex flex-col gap-4">{children}</ul>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

function Entry({
  item,
  label,
  children,
}: {
  item: FeedbackItem;
  label: string | null;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-1.5">
      {label && <p className="text-xs text-muted">{label}</p>}
      <p className="text-sm text-ink">{item.point}</p>
      {children}
    </li>
  );
}
