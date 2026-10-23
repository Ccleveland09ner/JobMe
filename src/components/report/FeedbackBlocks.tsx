/** The feedback section: what went well and what to work on, one block per item. */

import { kickerClass } from "@/components/ui/DocumentParts";
import { feedbackItems, type FeedbackListId, type ReportDocument } from "@/lib/frontend/report-document";

import { CandidateQuote } from "./CandidateQuote";
import { questionName } from "./names";

const FEEDBACK_TITLES: Record<FeedbackListId, string> = { strengths: "What went well", improvements: "What to work on" };
const FEEDBACK_EMPTY: Record<FeedbackListId, string> = {
  strengths: "No specific strengths were recorded for this interview.",
  improvements: "Nothing stood out to work on.",
};

export function FeedbackListHead({ doc, list }: { doc: ReportDocument; list: FeedbackListId }) {
  const empty = feedbackItems(doc, list).length === 0;
  return (
    <div className="flex flex-col gap-1">
      <h3 className={kickerClass}>{FEEDBACK_TITLES[list]}</h3>
      {empty && <p className="text-sm text-muted">{FEEDBACK_EMPTY[list]}</p>}
    </div>
  );
}

/**
 * One item, which may land on another sheet than the rest of its list: a
 * list of its own, numbered within the whole. A strength's quote was checked
 * on the server to be the candidate's own words.
 */
export function FeedbackEntry({ doc, list, item }: { doc: ReportDocument; list: FeedbackListId; item: number }) {
  const items = feedbackItems(doc, list);
  const entry = items[item];
  if (!entry) return null;
  const q = entry.question ? doc.questions.find((x) => x.ref === entry.question) : undefined;
  return (
    <ul>
      <li aria-setsize={items.length} aria-posinset={item + 1} className="flex flex-col gap-1.5">
        {q && <p className="text-xs text-muted">{questionName(q)}</p>}
        <p className="text-sm text-ink">{entry.point}</p>
        {list === "strengths" && entry.quote && (
          <CandidateQuote className="block border-l-2 border-ink/25 pl-2 font-mono text-xs text-ink">{entry.quote}</CandidateQuote>
        )}
        {list === "improvements" && entry.recommendation && (
          <p className="text-sm text-ink">
            <span className="font-semibold">Try: </span>
            {entry.recommendation}
          </p>
        )}
      </li>
    </ul>
  );
}
