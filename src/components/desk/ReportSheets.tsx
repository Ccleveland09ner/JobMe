/**
 * The reports folder's pages and the blocks printed on them;
 * components/desk/ReportsFolder.tsx files them. Long text arrives in pieces
 * (lib/frontend/report-document.ts), so every block fits on a sheet.
 */

import Link from "next/link";

import { LocalDate } from "@/components/common/LocalDate";
import { ReportGenerator } from "@/components/report/ReportGenerator";
import { BandBadge } from "@/components/score/BandBadge";
import { ScoreList } from "@/components/score/ScoreList";
import { FlipSafe } from "@/components/ui/book-slider";
import { buttonClasses } from "@/components/ui/Button";
import { ContentsList, kickerClass, PaperStat } from "@/components/ui/DocumentParts";
import { DocumentPage } from "@/components/ui/DocumentPage";
import { DIMENSIONS } from "@/lib/engine/types";
import { displayAverage, findEvidence, scoreLevel } from "@/lib/frontend/adapters";
import { DIMENSION_LABELS, MODE_LABELS, MOVE_LABELS, topicLabel } from "@/lib/frontend/labels";
import {
  FOLDER_SECTIONS,
  strengths,
  type FolderBlock,
  type FolderSection,
  type GeneratedReport,
  type ReportDocument,
  type ReportTurn,
} from "@/lib/frontend/report-document";

const SCORE_TEXT = { 1: "text-score-1", 2: "text-score-2", 3: "text-score-3", 4: "text-score-4" } as const;

export const sectionHeadingId = (id: FolderSection) => `report-${id}`;

export function reportTitle(doc: ReportDocument): string {
  return doc.title ?? "Behavioral interview";
}

function TurnLabel({ turn }: { turn: ReportTurn }) {
  return (
    <>
      Q{turn.seq} · {topicLabel(turn.topic)}
      {turn.questionType && ` · ${MOVE_LABELS[turn.questionType]}`}
    </>
  );
}

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
  const average = doc ? displayAverage(doc.overallScores) : null;
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
              {doc.turns.length} {doc.turns.length === 1 ? "answer" : "answers"}
              {average !== null && (
                <>
                  {" · "}
                  <span className="font-semibold">Average {average} / 4</span>
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
  performance: "Your averages across scored answers, and how each answer landed.",
  feedback: "What the interviewer saw in each answer, and why they asked what came next.",
  transcript: "Everything you said, with the evidence for each answer's main gap marked.",
};

function SectionHead({ id, doc }: { id: FolderSection; doc: ReportDocument }) {
  const title = FOLDER_SECTIONS.find((s) => s.id === id)?.title ?? id;
  const weakest = id === "rewrite" ? doc.turns.find((t) => t.id === doc.report?.weakestTurnId) : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <h2 id={sectionHeadingId(id)} tabIndex={-1} className="text-lg font-bold text-ink outline-none">
        {title}
      </h2>
      {SECTION_INTRO[id] && <p className="text-sm text-muted">{SECTION_INTRO[id]}</p>}
      {id === "rewrite" && (
        <>
          <p className="text-sm text-muted">
            Restructured as Situation, Task, Action, Result using only what you said. Fill in the{" "}
            <span className="font-mono">[placeholders]</span> with your real details.
          </p>
          {weakest && (
            <div className="flex flex-col gap-0.5 pt-1">
              <p className="text-xs text-muted">
                Q{weakest.seq}
                {weakest.primaryGap && ` · main gap: ${DIMENSION_LABELS[weakest.primaryGap]}`}
              </p>
              <p className="text-sm font-semibold text-ink">{weakest.questionText}</p>
            </div>
          )}
          {!doc.report?.rewrite && (
            <p className="rounded-md bg-sunken px-3 py-2 text-sm text-ink">
              A rewrite isn&rsquo;t available for this interview. Your scores and transcript are complete.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Averages({ doc }: { doc: ReportDocument }) {
  const answered = doc.report?.stats?.answered ?? doc.turns.length;
  const scored = doc.report?.stats?.scored ?? doc.turns.filter((t) => t.scores).length;
  const left = answered - scored;
  return (
    <div className="flex flex-col gap-2">
      <h3 className={kickerClass}>Average scores, 1–4</h3>
      {doc.overallScores ? (
        <ScoreList scores={doc.overallScores} />
      ) : (
        <p className="text-sm text-muted">None of your answers could be scored this time, so there are no averages.</p>
      )}
      <p className="text-xs text-muted">
        {left > 0
          ? `Based on ${scored} of ${answered} answers. ${left} couldn't be scored and ${left === 1 ? "is" : "are"} left out of the averages.`
          : `Based on ${answered} ${answered === 1 ? "answer" : "answers"}.`}
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
    <dl className="grid grid-cols-2 gap-4">
      <PaperStat size="lg" label="Words per minute" value={wpm ?? "—"} note={wpm === null ? "Measured on spoken answers only." : undefined} />
      <PaperStat size="lg" label="Filler words (approx.)" value={fillers ?? "—"} />
    </dl>
  );
}

function Bands({ doc, range: [from, to] }: { doc: ReportDocument; range: [number, number] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {from === 0 && <h3 className={kickerClass}>How each answer landed</h3>}
      <ul className="flex flex-col">
        {doc.turns.slice(from, to).map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 border-b border-dashed border-ink/15 py-1 text-sm text-ink">
            <span className="min-w-0 truncate">
              <TurnLabel turn={t} />
            </span>
            {t.band ? <BandBadge band={t.band} /> : <span className="text-xs text-muted">Not scored</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TurnFeedback({ turn }: { turn: ReportTurn }) {
  return (
    <article className="flex flex-col gap-1.5 border-t-2 border-dashed border-ink/15 pt-3">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-bold text-ink">
          <TurnLabel turn={turn} />
        </span>
        {turn.band ? <BandBadge band={turn.band} /> : <span>Not scored</span>}
      </p>
      <p className="text-sm font-semibold leading-snug text-ink">{turn.questionText}</p>
      {turn.scores ? (
        <ul className="grid grid-cols-4 gap-x-2 gap-y-1">
          {DIMENSIONS.map((d) => {
            const v = turn.scores?.[d];
            return (
              <li key={d} className="flex items-baseline justify-between gap-1 rounded-sm bg-sunken px-1.5 py-0.5 text-[11px] text-muted">
                <span className="truncate">{DIMENSION_LABELS[d]}</span>
                {typeof v === "number" ? (
                  <span className={`font-bold tabular-nums ${SCORE_TEXT[scoreLevel(v)]}`}>{v}</span>
                ) : (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">not scored</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted">This answer couldn&rsquo;t be scored.</p>
      )}
    </article>
  );
}

function TurnNotes({ turn }: { turn: ReportTurn }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-snug text-ink">
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

function AnswerPiece({ turn, text, first }: { turn: ReportTurn; text: string; first: boolean }) {
  const gap = turn.primaryGap ? DIMENSION_LABELS[turn.primaryGap] : null;
  const split = findEvidence(text, turn.evidence);
  if (!text) return <p className="text-sm text-muted">No answer recorded.</p>;
  return (
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
  );
}

export function FolderBlockView({ block, doc }: { block: FolderBlock; doc: ReportDocument }) {
  const turn = block.turn === undefined ? undefined : doc.turns[block.turn];
  switch (block.kind) {
    case "summary":
    case "performance":
    case "feedback":
    case "rewrite":
    case "transcript":
      return <SectionHead id={block.kind} doc={doc} />;
    case "summary-text":
      return <p className="text-[15px] leading-relaxed text-ink">{block.text}</p>;
    case "averages":
      return <Averages doc={doc} />;
    case "strengths":
      return <Strengths doc={doc} />;
    case "speaking":
      return <Speaking doc={doc} />;
    case "bands":
      return <Bands doc={doc} range={block.range ?? [0, 0]} />;
    case "turn-feedback":
      return turn ? <TurnFeedback turn={turn} /> : null;
    case "turn-notes":
      return turn ? <TurnNotes turn={turn} /> : null;
    case "rewrite-text":
      return <p className="whitespace-pre-line rounded-md bg-accent-soft p-3 text-sm leading-relaxed text-ink">{block.text}</p>;
    case "turn-question":
      return turn ? (
        <div className="flex flex-col gap-0.5 border-t-2 border-dashed border-ink/15 pt-3">
          <p className="text-xs text-muted">
            <TurnLabel turn={turn} />
          </p>
          <p className="text-sm font-semibold leading-snug text-ink">{turn.questionText}</p>
        </div>
      ) : null;
    case "turn-answer":
      return turn ? <AnswerPiece turn={turn} text={block.text ?? ""} first={block.id.endsWith("-0")} /> : null;
    case "turn-evidence":
      return turn ? (
        <p className="text-xs text-muted">
          {turn.primaryGap && `Gap: ${DIMENSION_LABELS[turn.primaryGap]} · `}Noted: <q className="font-mono text-ink">{turn.evidence}</q>
        </p>
      ) : null;
  }
}
