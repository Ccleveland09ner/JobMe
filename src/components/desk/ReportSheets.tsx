/**
 * The reports folder's pages and the blocks printed on them;
 * components/desk/ReportsFolder.tsx files them. Long text arrives in pieces
 * (lib/frontend/report-document.ts), so every block fits on a sheet. Every
 * score is the backend's: a question's is its latest cumulative evaluation,
 * so a follow-up that filled a gap counts toward the question it came from.
 */

import Link from "next/link";

import { LocalDate } from "@/components/common/LocalDate";
import { ReportGenerator } from "@/components/report/ReportGenerator";
import { BandBadge } from "@/components/score/BandBadge";
import { ScoreBar } from "@/components/score/ScoreBar";
import { ScoreList } from "@/components/score/ScoreList";
import { FlipSafe } from "@/components/ui/book-slider";
import { buttonClasses } from "@/components/ui/Button";
import { ContentsList, kickerClass, PaperStat } from "@/components/ui/DocumentParts";
import { DocumentPage } from "@/components/ui/DocumentPage";
import { findEvidence, scoreEntries, scoreLevel } from "@/lib/frontend/adapters";
import {
  DIMENSION_HINTS,
  DIMENSION_LABELS,
  KIND_LABELS,
  MODE_LABELS,
  MOVE_LABELS,
  scoreLevelLabel,
} from "@/lib/frontend/labels";
import {
  FOLDER_SECTIONS,
  questionCounts,
  strengths,
  weakestQuestion,
  type FeedbackListId,
  type FolderBlock,
  type FolderSection,
  type GeneratedReport,
  type ReportDocument,
  type ReportQuestion,
  type ReportTurn,
} from "@/lib/frontend/report-document";

const SCORE_TEXT = { 1: "text-score-1", 2: "text-score-2", 3: "text-score-3", 4: "text-score-4" } as const;

export const sectionHeadingId = (id: FolderSection) => `report-${id}`;

export function reportTitle(doc: ReportDocument): string {
  return doc.title ?? "Behavioral interview";
}

/** "Q2 · Influencing others": how the feedback cites a question. */
const questionName = (q: ReportQuestion) => `${q.ref} · ${q.label}`;

/** "Clarify follow-up". */
const followUpName = (turn: ReportTurn) => (turn.questionType ? `${MOVE_LABELS[turn.questionType]} follow-up` : "Follow-up");

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
      <FlipSafe className="-rotate-1 rounded-md border-2 border-ink bg-paper px-5 py-4 shadow-[4px_5px_0_0_rgb(28_27_26/0.2)]">
        <p className={kickerClass}>Interview report</p>
        {doc ? (
          <>
            <p className="mt-1 line-clamp-2 text-lg font-bold leading-snug text-ink">{reportTitle(doc)}</p>
            <p className="mt-1 text-sm text-muted">
              <LocalDate iso={doc.startedAt} format="dateTime" />
              {doc.mode && ` · ${MODE_LABELS[doc.mode]}`}
            </p>
            <p className="mt-2 text-sm text-ink">
              {doc.questions.length} {doc.questions.length === 1 ? "question" : "questions"}
              {doc.overall !== null && (
                <>
                  {" · "}
                  <span className="font-semibold">Overall {doc.overall.toFixed(1)} / 4</span>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="mt-1 text-lg font-bold text-ink">No reports filed yet</p>
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
        <Link href="/interview/new" className={buttonClasses()}>
          Start an interview
        </Link>
      </FlipSafe>
    </DocumentPage>
  );
}

export function BlankPage({ number }: { number: number }) {
  return <DocumentPage number={number} />;
}

// Blocks

const SECTION_INTRO: Partial<Record<FolderSection, string>> = {
  questions: "What the interviewer saw in each answer, and why they asked what came next.",
  transcript: "Everything you said, with the evidence for each answer's main gap marked.",
};

function SectionHead({ id, doc }: { id: FolderSection; doc: ReportDocument }) {
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
              <span className="text-base font-normal text-muted"> / 4</span>
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

function Competencies({ doc, range: [from, to] }: { doc: ReportDocument; range: [number, number] }) {
  return (
    <div className="flex flex-col gap-2">
      {from === 0 && <h3 className={kickerClass}>By competency</h3>}
      <ul className="flex flex-col gap-2.5">
        {doc.questions.slice(from, to).map((q) => (
          <li key={q.opening.id} className="flex flex-col gap-0.5">
            {q.score !== null ? (
              <ScoreBar label={questionName(q)} value={Number(q.score.toFixed(1))} />
            ) : (
              <p className="text-sm text-ink">
                {questionName(q)} <span className="text-muted">— not scored</span>
              </p>
            )}
            <p className="text-xs text-muted">
              {KIND_LABELS[q.kind]}
              {q.purpose && ` · assessed ${q.purpose}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Averages({ doc }: { doc: ReportDocument }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className={kickerClass}>Average by dimension, 1–4</h3>
      {doc.overallScores ? (
        <ScoreList scores={doc.overallScores} />
      ) : (
        <p className="text-sm text-muted">None of your answers could be scored this time, so there are no averages.</p>
      )}
    </div>
  );
}

/** What each dimension means, and what the averages are based on. */
function DimensionKey({ doc }: { doc: ReportDocument }) {
  const { answered, scored } = questionCounts(doc);
  const left = answered - scored;
  return (
    <div className="flex flex-col gap-2 text-xs text-muted">
      {doc.overallScores && (
        <dl className="flex flex-col gap-0.5">
          {scoreEntries(doc.overallScores).map(([d]) => (
            <div key={d} className="flex gap-1">
              <dt className="font-medium text-ink">{DIMENSION_LABELS[d]}:</dt>
              <dd>{DIMENSION_HINTS[d]}</dd>
            </div>
          ))}
        </dl>
      )}
      <p>
        {left > 0
          ? `Based on ${scored} of ${answered} questions. ${left} couldn't be scored and ${left === 1 ? "is" : "are"} left out.`
          : `Based on ${answered} ${answered === 1 ? "question" : "questions"}.`}{" "}
        Follow-up answers count toward the question they followed. Each dimension is averaged only over the questions it
        applies to.
      </p>
    </div>
  );
}

function Strengths({ doc }: { doc: ReportDocument }) {
  const { strongest, weakest } = strengths(doc.overallScores);
  const list = (title: string, rows: typeof strongest) => (
    <div className="flex flex-col gap-1">
      <h3 className={kickerClass}>{title}</h3>
      <ul className="flex flex-col gap-0.5">
        {rows.map(([dim, value]) => (
          <li key={dim} className="flex items-baseline justify-between gap-2 text-sm text-ink">
            {DIMENSION_LABELS[dim]}
            <span className={`font-semibold tabular-nums ${SCORE_TEXT[scoreLevel(value)]}`}>{value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-5 rounded-md border-2 border-ink/15 px-3 py-2.5">
      {list("Strongest", strongest)}
      {weakest.length > 0 && list("To work on", weakest)}
    </div>
  );
}

function Speaking({ doc }: { doc: ReportDocument }) {
  const wpm = doc.report?.stats?.wpm ?? null;
  const fillers = doc.report?.stats?.fillers ?? null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className={kickerClass}>Speaking</h3>
      <dl className="grid grid-cols-2 gap-4">
        <PaperStat size="lg" label="Words per minute" value={wpm ?? "—"} note={wpm === null ? "Measured on spoken answers only." : undefined} />
        <PaperStat size="lg" label="Filler words (approx.)" value={fillers ?? "—"} />
      </dl>
    </div>
  );
}

const FEEDBACK_TITLES: Record<FeedbackListId, string> = { strengths: "What went well", improvements: "What to work on" };
const FEEDBACK_EMPTY: Record<FeedbackListId, string> = {
  strengths: "No specific strengths were recorded for this interview.",
  improvements: "Nothing stood out to work on.",
};

function FeedbackListHead({ doc, list }: { doc: ReportDocument; list: FeedbackListId }) {
  const empty = !doc.report?.stats?.feedback?.[list].length;
  return (
    <div className="flex flex-col gap-1">
      <h3 className={kickerClass}>{FEEDBACK_TITLES[list]}</h3>
      {empty && <p className="text-sm text-muted">{FEEDBACK_EMPTY[list]}</p>}
    </div>
  );
}

/** A strength's quote was checked on the server to be the candidate's own words. */
function FeedbackEntry({ doc, list, item }: { doc: ReportDocument; list: FeedbackListId; item: number }) {
  const entry = doc.report?.stats?.feedback?.[list][item];
  if (!entry) return null;
  const q = entry.question ? doc.questions.find((x) => x.ref === entry.question) : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      {q && <p className="text-xs text-muted">{questionName(q)}</p>}
      <p className="text-sm text-ink">{entry.point}</p>
      {list === "strengths" && entry.quote && (
        <q className="block border-l-2 border-ink/25 pl-2 font-mono text-xs text-ink">{entry.quote}</q>
      )}
      {list === "improvements" && entry.recommendation && (
        <p className="text-sm text-ink">
          <span className="font-semibold">Try: </span>
          {entry.recommendation}
        </p>
      )}
    </div>
  );
}

function RewriteQuestion({ q }: { q: ReportQuestion }) {
  const gap = q.scoredTurn?.primaryGap;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-muted">
        {questionName(q)} · {KIND_LABELS[q.kind]}
        {gap && ` · main gap: ${DIMENSION_LABELS[gap]}`}
      </p>
      <p className="text-sm font-semibold leading-snug text-ink">{q.opening.questionText}</p>
    </div>
  );
}

/** What was said to the weakest question, follow-ups included, before its rewrite. */
function SaidPiece({ q, turn, text, first }: { q: ReportQuestion; turn: ReportTurn; text: string; first: boolean }) {
  const opening = turn.id === q.opening.id;
  return (
    <div className="flex flex-col gap-1">
      {first && opening && <h3 className={kickerClass}>What you said</h3>}
      {first && !opening && <p className="text-xs text-muted">Follow-up: {turn.questionText}</p>}
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{text || "No answer recorded."}</p>
    </div>
  );
}

function QuestionScores({ q }: { q: ReportQuestion }) {
  const band = q.scoredTurn?.band ?? null;
  return (
    <article className="flex flex-col gap-1.5 border-t-2 border-dashed border-ink/15 pt-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-bold text-ink">{questionName(q)}</span>
        <span>{KIND_LABELS[q.kind]}</span>
        {q.score !== null ? (
          <>
            <span className="font-bold tabular-nums text-ink">{q.score.toFixed(1)} / 4</span>
            {band && <BandBadge band={band} />}
          </>
        ) : (
          <span>Not scored</span>
        )}
      </p>
      <p className="text-sm font-semibold leading-snug text-ink">{q.opening.questionText}</p>
      {q.followUps.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted">
          {q.followUps.map((f) => (
            <li key={f.id} className="line-clamp-2">
              <span aria-hidden="true">↳ </span>
              {f.questionType ? `${MOVE_LABELS[f.questionType]}: ` : ""}
              {f.questionText}
            </li>
          ))}
        </ul>
      )}
      {q.scores ? (
        // Only the dimensions its question type is scored on.
        <ul className="grid grid-cols-3 gap-x-2 gap-y-1">
          {scoreEntries(q.scores).map(([d, v]) => (
            <li key={d} className="flex items-baseline justify-between gap-1 rounded-sm bg-sunken px-1.5 py-0.5 text-[11px] text-muted">
              <span className="truncate">{DIMENSION_LABELS[d]}</span>
              <span className={`font-bold tabular-nums ${SCORE_TEXT[scoreLevel(v)]}`}>{v}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">This question couldn&rsquo;t be scored.</p>
      )}
    </article>
  );
}

function TurnNotes({ q, turn }: { q: ReportQuestion; turn: ReportTurn }) {
  // With follow-ups, each set of notes says which answer it is about.
  const label = q.followUps.length ? (turn.id === q.opening.id ? "First answer" : followUpName(turn)) : null;
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-snug text-ink">
      {label && <p className="text-xs text-muted">{label}</p>}
      {turn.evidence && (
        <p>
          <span className="font-semibold">Quoted: </span>
          <q className="bg-highlight px-0.5">{turn.evidence}</q>
          {turn.primaryGap && <span className="text-muted"> (main gap: {DIMENSION_LABELS[turn.primaryGap]})</span>}
        </p>
      )}
      {turn.note && (
        <p>
          <span className="font-semibold">Noted: </span>
          {turn.note}
        </p>
      )}
      {turn.reason && (
        <p className="text-muted">
          <span className="font-semibold text-ink">Next: </span>
          {turn.reason}
        </p>
      )}
    </div>
  );
}

/** Follow-ups sit indented under the question they added to. */
const INDENT = "border-l-2 border-ink/20 pl-3";

function TurnQuestion({ q, turn }: { q: ReportQuestion; turn: ReportTurn }) {
  if (turn.id !== q.opening.id) {
    return (
      <div className={`flex flex-col gap-0.5 ${INDENT}`}>
        <p className="text-xs text-muted">{followUpName(turn)}</p>
        <p className="text-sm font-semibold leading-snug text-ink">{turn.questionText}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 border-t-2 border-dashed border-ink/15 pt-3">
      <p className="text-xs text-muted">
        {questionName(q)} · {KIND_LABELS[q.kind]}
      </p>
      <p className="text-sm font-semibold leading-snug text-ink">{turn.questionText}</p>
    </div>
  );
}

function AnswerPiece({ turn, text, first, indent }: { turn: ReportTurn; text: string; first: boolean; indent: boolean }) {
  const gap = turn.primaryGap ? DIMENSION_LABELS[turn.primaryGap] : null;
  const split = findEvidence(text, turn.evidence);
  if (!text) return <p className={`text-sm text-muted ${indent ? INDENT : ""}`}>No answer recorded.</p>;
  return (
    <div className={`flex flex-col gap-1.5 ${indent ? INDENT : ""}`}>
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
        {first && <span className="sr-only">Your answer: </span>}
        {split ? (
          <>
            {split.before}
            <mark className="rounded bg-highlight px-0.5 text-ink">
              {split.match}
              {gap && <span className="sr-only"> (evidence for gap: {gap})</span>}
            </mark>
            {split.after}
          </>
        ) : (
          text
        )}
      </p>
      {split && gap && (
        <p className="text-xs text-muted">
          Highlighted: <span className="font-medium text-ink">{gap}</span> was the main gap at this point.
        </p>
      )}
    </div>
  );
}

/** Beneath an answer: a quote no piece of it holds, and whether it went unscored. */
function TurnEvidence({ turn, quote, indent }: { turn: ReportTurn; quote: boolean; indent: boolean }) {
  const gap = turn.primaryGap ? DIMENSION_LABELS[turn.primaryGap] : null;
  return (
    <div className={`flex flex-col gap-1 text-xs text-muted ${indent ? INDENT : ""}`}>
      {quote && turn.evidence && (
        <p>
          {gap && `Gap: ${gap} · `}Noted: <q className="font-mono text-ink">{turn.evidence}</q>
        </p>
      )}
      {!turn.scores && <p>This answer couldn&rsquo;t be scored.</p>}
    </div>
  );
}

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
    case "rewrite-said": {
      const weakest = weakestQuestion(doc);
      return weakest && turn ? <SaidPiece q={weakest} turn={turn} text={block.text ?? ""} first={Boolean(block.first)} /> : null;
    }
    case "rewrite-text":
      return <p className="whitespace-pre-line rounded-md bg-accent-soft p-3 text-sm leading-relaxed text-ink">{block.text}</p>;
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
