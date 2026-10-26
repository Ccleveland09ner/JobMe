/**
 * The reports folder's pages, and the registry that prints each block of a
 * report (components/report/*). components/desk/ReportsFolder.tsx files
 * them. Long text arrives in pieces (lib/frontend/report-document.ts), so
 * every block fits on a sheet. Every score is the backend's: a question's is
 * its latest cumulative evaluation, so a follow-up that filled a gap counts
 * toward the question it came from.
 */

import { FeedbackEntry, FeedbackListHead } from "@/components/report/FeedbackBlocks";
import { sectionHeadingId } from "@/components/report/names";
import { QuestionScores, TurnNotes } from "@/components/report/QuestionBlocks";
import { ReportGenerator } from "@/components/report/ReportGenerator";
import { RewriteQuestion, RewriteText, SaidPiece } from "@/components/report/RewriteBlocks";
import { SectionHead } from "@/components/report/SectionHead";
import { Averages, Competencies, DimensionKey, Speaking, Strengths } from "@/components/report/SummaryBlocks";
import { AnswerPiece, TurnEvidence, TurnQuestion } from "@/components/report/TranscriptBlocks";
import { FlipSafe } from "@/components/ui/FlipSafe";
import { ContentsList, kickerClass, SessionDateLine, StartInterviewLink } from "@/components/ui/DocumentParts";
import { DocumentPage } from "@/components/ui/DocumentPage";
import { interviewTitle, scoreOutOf } from "@/lib/frontend/labels";
import type { FolderBlock, FolderSection, GeneratedReport, ReportDocument } from "@/lib/frontend/report-document";

// Pages

/** The folder's inside flap: the file label, and what is in the file. */
export function FlapPage({
  doc,
  starts,
  onOpen,
}: {
  doc: ReportDocument | null;
  starts: { id: FolderSection; title: string; page: number }[];
  onOpen: (page: number, focusId: string) => void;
}) {
  return (
    <DocumentPage face="flap" running="Reports">
      <FlipSafe className="paper-label -rotate-1 rounded-md px-5 py-4">
        <p className={kickerClass}>Interview report</p>
        {doc ? (
          <>
            <h2 className="mt-1 line-clamp-2 text-lg font-bold leading-snug text-ink">{interviewTitle(doc.title, doc.mode)}</h2>
            <p className="mt-1 text-sm text-muted">
              <SessionDateLine startedAt={doc.startedAt} mode={doc.mode} titled={doc.title !== null} />
            </p>
            <p className="mt-2 text-sm text-ink">
              {doc.questions.length} {doc.questions.length === 1 ? "question" : "questions"}
              {doc.overall !== null && (
                <>
                  {" · "}
                  <span className="font-semibold">Overall {scoreOutOf(doc.overall)}</span>
                </>
              )}
            </p>
          </>
        ) : (
          <h2 className="mt-1 text-lg font-bold text-ink">No reports filed yet</h2>
        )}
      </FlipSafe>
      {starts.length > 0 && (
        <FlipSafe className="flex flex-col gap-1">
          <h2 className={`${kickerClass} text-ink/70`}>In this file</h2>
          <ContentsList
            onOpen={onOpen}
            items={starts.map((s) => ({ key: s.id, label: s.title, page: s.page, focusId: sectionHeadingId(s.id) }))}
          />
        </FlipSafe>
      )}
      <p className="mt-auto text-xs text-ink/70">Practice feedback, not a prediction of any hiring decision.</p>
    </DocumentPage>
  );
}

/** Until the report exists: the sheet that writes it. */
export function GeneratePage({ doc, onGenerated }: { doc: ReportDocument; onGenerated: (body: GeneratedReport) => void }) {
  return (
    <DocumentPage running="Interview report" number={1}>
      <FlipSafe className="my-auto">
        <ReportGenerator sessionId={doc.id} onGenerated={onGenerated} />
      </FlipSafe>
    </DocumentPage>
  );
}

export function EmptyFolderPage() {
  return (
    <DocumentPage running="Reports" number={1}>
      <FlipSafe className="my-auto flex flex-col items-start gap-3">
        <h2 className="text-lg font-bold text-ink">The folder is empty</h2>
        <p className="text-sm text-muted">Finish an interview and its report will be filed here.</p>
        <StartInterviewLink />
      </FlipSafe>
    </DocumentPage>
  );
}

export function BlankPage({ number }: { number: number }) {
  return <DocumentPage number={number} />;
}

// Blocks

export function FolderBlockView({ block, doc }: { block: FolderBlock; doc: ReportDocument }) {
  const q = block.question === undefined ? undefined : doc.questions[block.question];
  const turn = block.turn === undefined ? undefined : doc.turns[block.turn];
  const followUp = Boolean(q && turn && turn.id !== q.opening.id);
  switch (block.kind) {
    case "summary":
    case "feedback":
    case "rewrite":
    case "questions":
    case "transcript":
      return <SectionHead id={block.kind} doc={doc} />;
    case "summary-text":
      return <p className="text-[15px] leading-relaxed text-ink">{block.text}</p>;
    case "competencies":
      return <Competencies doc={doc} range={block.range ?? [0, 0]} />;
    case "averages":
      return <Averages doc={doc} />;
    case "dimension-key":
      return <DimensionKey doc={doc} />;
    case "strengths":
      return <Strengths doc={doc} />;
    case "speaking":
      return <Speaking doc={doc} />;
    case "feedback-none":
      return <p className="text-sm text-muted">Detailed feedback isn&rsquo;t available for this interview.</p>;
    case "feedback-list":
      return block.list ? <FeedbackListHead doc={doc} list={block.list} /> : null;
    case "feedback-item":
      return block.list && block.item !== undefined ? <FeedbackEntry doc={doc} list={block.list} item={block.item} /> : null;
    case "rewrite-question":
      return q ? <RewriteQuestion q={q} /> : null;
    case "rewrite-said":
      return q && turn ? <SaidPiece q={q} turn={turn} text={block.text ?? ""} first={Boolean(block.first)} /> : null;
    case "rewrite-text":
      return <RewriteText text={block.text ?? ""} first={Boolean(block.first)} />;
    case "rewrite-missing":
      return (
        <p className="rounded-md bg-sunken px-3 py-2 text-sm text-ink">
          A rewrite isn&rsquo;t available for this interview. Your scores and transcript are complete.
        </p>
      );
    case "rewrite-none":
      return (
        <p className="rounded-md bg-sunken px-3 py-2 text-sm text-ink">
          None of your answers could be scored, so there&rsquo;s no rewrite for this interview.
        </p>
      );
    case "question-scores":
      return q ? <QuestionScores q={q} /> : null;
    case "turn-notes":
      return q && turn ? <TurnNotes q={q} turn={turn} /> : null;
    case "turn-question":
      return q && turn ? <TurnQuestion q={q} turn={turn} /> : null;
    case "turn-answer":
      return turn ? <AnswerPiece turn={turn} text={block.text ?? ""} first={Boolean(block.first)} indent={followUp} /> : null;
    case "turn-evidence":
      return turn ? <TurnEvidence turn={turn} quote={Boolean(block.quote)} indent={followUp} /> : null;
  }
}
