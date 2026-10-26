/** The head of each report section: its title, and what the section holds. */

import { SCORE_MAX, scoreLevelLabel } from "@/lib/frontend/labels";
import { FOLDER_SECTIONS, type FolderSection, type ReportDocument } from "@/lib/frontend/report-document";

import { sectionHeadingId } from "./names";

const SECTION_INTRO: Partial<Record<FolderSection, string>> = {
  questions:
    "What the interviewer saw in each answer, and why they asked what came next. Your answers in full are in the ledger's transcript.",
};

export function SectionHead({ id, doc }: { id: FolderSection; doc: ReportDocument }) {
  const title = FOLDER_SECTIONS.find((s) => s.id === id)?.title ?? id;
  const heading = (
    <h2 id={sectionHeadingId(id)} tabIndex={-1} className="text-lg font-bold text-ink outline-none">
      {title}
    </h2>
  );
  return (
    <div className="flex flex-col gap-1.5">
      {id === "summary" && doc.overall !== null ? (
        <div className="flex items-start justify-between gap-4">
          {heading}
          <p className="text-right">
            <span className="block text-3xl font-bold tabular-nums text-ink">
              {doc.overall.toFixed(1)}
              <span className="text-base font-normal text-muted"> / {SCORE_MAX}</span>
            </span>
            <span className="text-sm text-muted">Overall · {scoreLevelLabel(doc.overall)}</span>
          </p>
        </div>
      ) : (
        heading
      )}
      {SECTION_INTRO[id] && <p className="text-sm text-muted">{SECTION_INTRO[id]}</p>}
      {id === "rewrite" && (
        <p className="text-sm text-muted">
          Built only from what you said, follow-ups included. Fill in the <span className="font-mono">[placeholders]</span>{" "}
          with your real details — never with ones you don&rsquo;t have.
        </p>
      )}
    </div>
  );
}
