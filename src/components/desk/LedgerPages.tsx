/**
 * The ledger's pages and the blocks printed on them; components/desk/Ledger.tsx
 * binds them into a book. An interview's blocks are an account of it: what was
 * asked and what was said, word for word. Its scores and feedback are in its
 * report, which the blocks point to. Every block fits on one page:
 * lib/frontend/ledger.ts splits long answers into pieces.
 */

import Link from "next/link";

import { LocalDate } from "@/components/common/LocalDate";
import { TrendChart } from "@/components/dashboard/TrendChart";
import type { DeleteTarget } from "@/components/dashboard/useDeleteSession";
import { Badge } from "@/components/ui/Badge";
import { FlipSafe } from "@/components/ui/FlipSafe";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ContentsList, kickerClass, PaperStat, SessionDateLine, StartInterviewLink } from "@/components/ui/DocumentParts";
import { DocumentPage } from "@/components/ui/DocumentPage";
import { interviewTitle, MOVE_LABELS, scoreLevelLabel, scoreOutOf } from "@/lib/frontend/labels";
import {
  answeredBy,
  entryNumber,
  LEDGER_CONTENTS_PAGE,
  LEDGER_PROGRESS_PAGE,
  ledgerVolumeHref,
  type LedgerBlock,
  type LedgerEntry,
  type LedgerOwner,
  type LedgerProgress,
  type LedgerQuestion,
  type LedgerVolume,
} from "@/lib/frontend/ledger";
import { reportPath } from "@/lib/frontend/report-document";
import type { TrendPoint } from "@/lib/frontend/types";
import { unlockAudio } from "@/lib/frontend/voiceSession";

/** Focus targets for the contents links. */
const entryHeadingId = (id: string) => `ledger-entry-${id}`;
const PROGRESS_HEADING_ID = "ledger-progress";
const TRENDS_HEADING_ID = "trend-title";

/** Pressed into the leather: shaded above, catching light below. */
const EMBOSSED = "text-leather-light [text-shadow:0_-1px_0_rgb(0_0_0/0.45),0_1px_0_rgb(255_255_255/0.14)]";

// Front matter

export function CoverPage({ volume, owner }: { volume: LedgerVolume; owner: LedgerOwner | null }) {
  return (
    <DocumentPage face="cover">
      <div className="flex flex-1 flex-col items-center justify-between px-10 pb-16 pt-28 text-center">
        <div className="brass-plate rounded-md px-7 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-ink/70">JobMe</p>
          <p className="mt-1 text-xl font-bold uppercase tracking-[0.16em] text-ink">Interview record</p>
          <p className="mt-1 text-sm font-semibold text-ink/75">Volume {volume.number}</p>
        </div>
        {owner?.username && <p className={`text-lg font-bold tracking-widest ${EMBOSSED}`}>@{owner.username}</p>}
      </div>
    </DocumentPage>
  );
}

export function BookplatePage({ owner, volume, shown }: { owner: LedgerOwner | null; volume: LedgerVolume; shown: number }) {
  return (
    <DocumentPage face="endpaper">
      <div className="flex flex-1 items-center justify-center px-9">
        <FlipSafe className="paper-label w-full -rotate-1 rounded-md px-6 py-7 text-center">
          <p className={kickerClass}>This record belongs to</p>
          <p className="mt-2 text-2xl font-bold text-ink">{owner?.username ? `@${owner.username}` : "You"}</p>
          {owner && <p className="mt-1 font-mono text-sm tracking-wider text-muted">{owner.memberCode}</p>}
          <div aria-hidden="true" className="mx-auto my-4 h-0.5 w-20 bg-ink/25" />
          <p className="text-sm leading-relaxed text-ink">
            Every interview you have done, as it happened: what you were asked and what you said, word for word. Scores
            and feedback are filed in the reports folder.
          </p>
          <p className="mt-3 text-xs text-muted">
            {shown
              ? `Volume ${volume.number} of ${volume.count} · interviews ${entryNumber(volume, shown - 1)}–${entryNumber(volume, 0)} of ${volume.total}`
              : "Nothing recorded yet"}
          </p>
        </FlipSafe>
      </div>
    </DocumentPage>
  );
}

function VolumeLinks({ volume }: { volume: LedgerVolume }) {
  if (volume.count <= 1) return null;
  const link = "font-semibold text-ink underline decoration-ink/30 underline-offset-4 hover:decoration-ink";
  return (
    <nav aria-label="Ledger volumes" className="flex items-center justify-between gap-2 text-sm">
      {volume.number > 1 ? (
        <Link href={ledgerVolumeHref(volume.number - 1)} className={link}>
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="text-xs text-muted">
        Volume {volume.number} of {volume.count}
      </span>
      {volume.number < volume.count ? (
        <Link href={ledgerVolumeHref(volume.number + 1)} className={link}>
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function ContentsPage({
  volume,
  entries,
  overviewPages,
  onOpen,
}: {
  volume: LedgerVolume;
  entries: LedgerEntry[];
  /** Where each entry's overview was printed. */
  overviewPages: number[];
  onOpen: (page: number, focusId: string) => void;
}) {
  return (
    <DocumentPage face="ledger" running="Contents" number={LEDGER_CONTENTS_PAGE}>
      <FlipSafe className="flex flex-col gap-2">
        <h2 className="text-lg font-bold text-ink">Contents</h2>
        <ContentsList
          onOpen={onOpen}
          items={[
            { key: "progress", label: "Your progress", page: LEDGER_PROGRESS_PAGE, focusId: PROGRESS_HEADING_ID },
            { key: "trends", label: "Score trends", page: LEDGER_PROGRESS_PAGE + 1, focusId: TRENDS_HEADING_ID },
            ...entries.map((e, i) => ({
              key: e.id,
              page: overviewPages[i],
              focusId: entryHeadingId(e.id),
              label: (
                <>
                  <span className="font-semibold">No. {entryNumber(volume, i)}</span> · <LocalDate iso={e.startedAt} />
                  {e.title && ` · ${e.title}`}
                  {e.status === "in_progress" && " · in progress"}
                </>
              ),
            })),
          ]}
        />
      </FlipSafe>
      <FlipSafe className="mt-auto flex flex-col gap-3">
        <VolumeLinks volume={volume} />
        <StartInterviewLink size="sm" className="self-start" />
      </FlipSafe>
    </DocumentPage>
  );
}

export function ProgressPage({ progress }: { progress: LedgerProgress }) {
  const latest = progress.latestOverall;
  return (
    <DocumentPage face="ledger" running="Your progress" number={LEDGER_PROGRESS_PAGE}>
      <FlipSafe className="flex flex-col gap-4">
        <h2 id={PROGRESS_HEADING_ID} tabIndex={-1} className="text-lg font-bold text-ink outline-none">
          Your progress
        </h2>
        <dl className="grid grid-cols-3 gap-3">
          <PaperStat label="Completed" value={String(progress.completed)} />
          <PaperStat label="In progress" value={String(progress.inProgress)} />
          <PaperStat
            label="Latest overall"
            value={latest === null ? "—" : scoreOutOf(latest)}
            note={latest === null ? undefined : scoreLevelLabel(latest)}
          />
        </dl>
        {progress.latestId ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink">The scorecard and feedback for your latest interview are in its report.</p>
            <Link href={reportPath(progress.latestId)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Read the latest report
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted">Finish an interview to see your scores here.</p>
        )}
      </FlipSafe>
    </DocumentPage>
  );
}

export function TrendsPage({ trend }: { trend: TrendPoint[] }) {
  return (
    <DocumentPage face="ledger" running="Score trends" number={LEDGER_PROGRESS_PAGE + 1}>
      <FlipSafe>
        <TrendChart points={trend} headingId={TRENDS_HEADING_ID} />
      </FlipSafe>
    </DocumentPage>
  );
}

// An interview's blocks

/** Where an interview's summary and feedback are, or the way back into it while it is unfinished. */
function NextStepLink({ entry }: { entry: LedgerEntry }) {
  return entry.status === "completed" ? (
    <Link href={reportPath(entry.id)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
      Read the report
    </Link>
  ) : (
    <Link
      href={`/interview/${entry.id}`}
      // The click is the gesture that lets the recruiter speak on arrival.
      onClick={unlockAudio}
      className={buttonClasses({ size: "sm" })}
    >
      Resume
    </Link>
  );
}

function Overview({ entry, number, onDelete }: { entry: LedgerEntry; number: number; onDelete: (target: DeleteTarget) => void }) {
  const completed = entry.status === "completed";
  return (
    <section aria-labelledby={entryHeadingId(entry.id)} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className={kickerClass}>Interview no. {number}</p>
        <h2 id={entryHeadingId(entry.id)} tabIndex={-1} className="line-clamp-2 text-xl font-bold leading-snug text-ink outline-none">
          {interviewTitle(entry.title, entry.mode)}
        </h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>
            <SessionDateLine startedAt={entry.startedAt} mode={entry.mode} titled={entry.title !== null} />
          </span>
          {completed ? <Badge>Completed</Badge> : <Badge tone="accent">In progress</Badge>}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3 border-y-2 border-dashed border-ink/20 py-3">
        <PaperStat label="Questions" value={String(entry.questions.length)} />
        <PaperStat label="Follow-ups" value={String(entry.followUps)} />
        <PaperStat label="Words you said" value={entry.words.toLocaleString("en-US")} />
      </dl>
      <p className="text-sm leading-relaxed text-ink">
        {completed
          ? "Every question and answer follows, word for word. The summary, the feedback and a rewrite of your weakest answer are in the report."
          : "What you have answered so far follows, word for word. Resume to finish; the report is written when you do."}
      </p>
      <div className="flex flex-wrap gap-2">
        <NextStepLink entry={entry} />
        <Button variant="ghost" size="sm" onClick={() => onDelete(entry)}>
          Delete<span className="sr-only"> interview no. {number}</span>
        </Button>
      </div>
    </section>
  );
}

/** Follow-ups sit indented under the question they added to. */
const INDENT = "ml-4";

/** What the interviewer asked: an original question, or a follow-up to it. */
function Ask({ question: q, turn }: { question: LedgerQuestion; turn: number }) {
  const t = q.turns[turn];
  const text = t.questionText || "The question wasn't recorded.";
  if (turn > 0) {
    return (
      <div className={`flex flex-col gap-0.5 ${INDENT}`}>
        <p className="text-xs text-muted">
          <span aria-hidden="true">↳ </span>
          {t.questionType ? `${MOVE_LABELS[t.questionType]} follow-up` : "Follow-up"}
        </p>
        <h5 className="text-sm font-semibold leading-snug text-ink">{text}</h5>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 border-t-2 border-dashed border-ink/15 pt-3">
      <p className="text-xs text-muted">
        <span className="font-bold text-ink">{q.ref}</span> · {q.label}
        {q.fromResume && " · From your resume"}
      </p>
      <h4 className="text-sm font-semibold leading-snug text-ink">{text}</h4>
    </div>
  );
}

/** A piece of what the candidate said; the last says how it was given. */
function Answer({ question: q, block }: { question: LedgerQuestion; block: LedgerBlock }) {
  const t = q.turns[block.turn ?? 0];
  const indent = (block.turn ?? 0) > 0 ? INDENT : "";
  if (!block.text) return <p className={`text-sm text-muted ${indent}`}>No answer recorded.</p>;
  return (
    <div className={`flex flex-col gap-1 ${indent}`}>
      <p className="whitespace-pre-line border-l-2 border-ink/25 pl-3 text-sm leading-relaxed text-ink">
        {block.first && <span className="sr-only">You said: </span>}
        {block.text}
      </p>
      {block.last && <p className="pl-3.5 text-xs text-muted">{answeredBy(t.spokenMs)}</p>}
    </div>
  );
}

function WhereNext({ entry }: { entry: LedgerEntry }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border-2 border-ink/15 px-3 py-2.5">
      <p className="text-sm leading-relaxed text-ink">
        {entry.status === "completed"
          ? "That's the whole interview. For the summary, the feedback and a rewrite of your weakest answer, read its report."
          : "The interview stops here for now. Resume it to answer the rest; its report is written when you finish."}
      </p>
      <NextStepLink entry={entry} />
    </div>
  );
}

export function LedgerBlockView({
  block,
  entry,
  volume,
  onDelete,
}: {
  block: LedgerBlock;
  entry: LedgerEntry;
  volume: LedgerVolume;
  onDelete: (target: DeleteTarget) => void;
}) {
  const question = block.question === undefined ? undefined : entry.questions[block.question];
  switch (block.kind) {
    case "overview":
      return <Overview entry={entry} number={entryNumber(volume, block.entry)} onDelete={onDelete} />;
    case "transcript":
      return (
        <div className="flex flex-col gap-0.5">
          <h3 className={kickerClass}>Transcript</h3>
          <p className="text-xs text-muted">What you were asked and what you said, as it was recorded.</p>
        </div>
      );
    case "ask":
      return question ? <Ask question={question} turn={block.turn ?? 0} /> : null;
    case "answer":
      return question ? <Answer question={question} block={block} /> : null;
    case "where-next":
      return <WhereNext entry={entry} />;
    case "pending":
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted">
            {entry.status === "in_progress"
              ? "This interview isn't finished. Resume it to pick up where you left off."
              : "No answers were recorded in this interview."}
          </p>
          {entry.status === "in_progress" && <NextStepLink entry={entry} />}
        </div>
      );
  }
}

// Back matter

export function NotesPage({ number }: { number: number }) {
  return <DocumentPage face="ruled" running="Notes" number={number} />;
}

export function EndPage({ volume, number }: { volume: LedgerVolume; number: number }) {
  const older = volume.number < volume.count;
  return (
    <DocumentPage face="ledger" number={number}>
      <FlipSafe className="my-auto flex flex-col items-center gap-3 text-center">
        {older ? (
          <>
            <p className="text-lg font-bold text-ink">End of volume {volume.number}</p>
            <p className="text-sm text-muted">Your earlier interviews carry on in volume {volume.number + 1}.</p>
            <Link href={ledgerVolumeHref(volume.number + 1)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Earlier interviews
            </Link>
          </>
        ) : (
          <>
            <p className="text-lg font-bold text-ink">End of the record</p>
            <p className="text-sm text-muted">That&apos;s every interview so far.</p>
            <StartInterviewLink size="sm" />
          </>
        )}
      </FlipSafe>
    </DocumentPage>
  );
}

export function EmptyPage() {
  return (
    <DocumentPage face="ledger" running="Contents" number={LEDGER_CONTENTS_PAGE}>
      <FlipSafe className="my-auto flex flex-col items-center gap-3 text-center">
        <h2 className="text-lg font-bold text-ink">No interviews yet</h2>
        <p className="text-sm text-muted">
          Your first interview takes about 8 minutes. You&apos;ll see what the recruiter noticed after every answer.
        </p>
        <StartInterviewLink />
      </FlipSafe>
    </DocumentPage>
  );
}

export function BackCoverPage() {
  return (
    <DocumentPage face="cover">
      <div className="flex flex-1 items-end justify-center pb-12">
        <p className={`text-sm font-bold uppercase tracking-[0.35em] ${EMBOSSED}`}>JobMe</p>
      </div>
    </DocumentPage>
  );
}
