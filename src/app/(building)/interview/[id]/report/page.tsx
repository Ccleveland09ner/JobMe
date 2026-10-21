/**
 * Scorecard. Server Component.
 * Ref: docs/PRD-JobMe-MVP.md > Scorecard
 *      docs/TechDesign-JobMe-MVP.md > Scorecard Page
 *
 * Loads session, turns and report under RLS. If no report row exists yet,
 * <ReportGenerator> POSTs /api/sessions/[id]/report once and refreshes; the
 * saved row then renders here, instantly on every later visit.
 *
 * The report route does not return the turns, so they are read here, and
 * grouped by original question exactly as the report pipeline grouped them.
 * The overall score is the session's stored `overall`; nothing is re-scored
 * on the client.
 *
 * Scores are practice feedback, never framed as a prediction of a hiring
 * outcome. Ref: docs/PRD-JobMe-MVP.md > Non-Goals
 *
 * In the building this page is the top sheet in the reports folder
 * (components/desk/ReportsFolder.tsx); it also reads the ids of every
 * completed interview, newest first, to know which sheets lie either side.
 */

import { notFound } from "next/navigation";

import { LocalDate } from "@/components/common/LocalDate";
import { ReportsFolder } from "@/components/desk/ReportsFolder";
import { FeedbackList } from "@/components/report/FeedbackList";
import { HighlightedTranscript } from "@/components/report/HighlightedTranscript";
import { ReportGenerator } from "@/components/report/ReportGenerator";
import { RewriteCard } from "@/components/report/RewriteCard";
import { ScoreSummary } from "@/components/report/ScoreSummary";
import { ScoreTable } from "@/components/report/ScoreTable";
import { SpeakingStats } from "@/components/report/SpeakingStats";
import { BANK } from "@/lib/engine/bank";
import type { ReportStats } from "@/lib/ai/report";
import { requireUser } from "@/lib/auth";
import type { TopicId } from "@/lib/engine/types";
import { pickOverall, pickScores, reportTurnFromRow, type TurnRow } from "@/lib/frontend/adapters";
import { MODE_LABELS, topicLabel } from "@/lib/frontend/labels";
import type { ReportQuestionView } from "@/lib/frontend/types";
import { SessionId } from "@/lib/schemas";
import { groupIntoQuestions, rollupQuestions } from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";

const TURN_COLUMNS =
  "id, seq, topic, question_type, question_source, question_text, answer_transcript, scores, band, primary_gap, evidence, notepad_text, reason_text, wpm, filler_count";

export default async function ReportPage({ params }: PageProps<"/interview/[id]/report">) {
  const { id } = await params;
  await requireUser();
  if (!SessionId.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [sessionRes, turnsRes, reportRes, stackRes] = await Promise.all([
    supabase
      .from("interview_sessions")
      .select("id, status, overall_scores, question_plan, started_at, mode:engine_state->>mode")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("turns").select(TURN_COLUMNS).eq("session_id", id).order("seq", { ascending: true }),
    supabase
      .from("reports")
      .select("summary, weakest_turn_id, rewrite_text, stats")
      .eq("session_id", id)
      .maybeSingle(),
    // The folder's stack, newest on top. Ids only; not essential.
    supabase.from("interview_sessions").select("id").eq("status", "completed").order("started_at", { ascending: false }),
  ]);

  if (sessionRes.error) throw new Error(`report session: ${sessionRes.error.message}`);
  if (turnsRes.error) throw new Error(`report turns: ${turnsRes.error.message}`);
  if (reportRes.error) throw new Error(`report row: ${reportRes.error.message}`);

  const session = sessionRes.data as
    | {
        id: string;
        status: string;
        overall_scores: unknown;
        question_plan: unknown;
        started_at: string;
        mode: string | null;
      }
    | null;
  if (!session) notFound();

  const turns = ((turnsRes.data ?? []) as unknown as (TurnRow & { id: string })[]).map(reportTurnFromRow);

  // One entry per ORIGINAL question: a follow-up is part of the answer to the
  // question it came from, and the question's score is its latest cumulative
  // evaluation. The same grouping the report pipeline used, so "Q2" in the
  // feedback is Q2 here.
  const questions: ReportQuestionView[] = groupIntoQuestions(turns).map((g, i) => ({
    ...g,
    ref: `Q${i + 1}`,
    label: topicLabel(g.opening.topic),
    purpose: BANK[g.opening.topic as TopicId]?.purpose ?? "",
  }));
  const rollup = rollupQuestions(questions);
  const report = reportRes.data as
    | { summary: string | null; weakest_turn_id: string | null; rewrite_text: string | null; stats: ReportStats | null }
    | null;

  const mode = session.mode === "quick" || session.mode === "full" ? MODE_LABELS[session.mode] : null;

  const stack = stackRes.error ? [] : ((stackRes.data ?? []) as { id: string }[]).map((r) => r.id);
  const at = stack.indexOf(id);
  const neighbours =
    at === -1
      ? undefined
      : { newer: stack[at - 1] ?? null, older: stack[at + 1] ?? null, position: at + 1, total: stack.length };

  return (
    <ReportsFolder
      sessionId={id}
      title="Interview report"
      kicker={
        <>
          {mode && `${mode} · `}
          <LocalDate iso={session.started_at} format="dateTime" />
        </>
      }
      neighbours={neighbours}
    >

      {/* A report on a session still marked in progress means a crash
          between insert and completion; the POST heals it without a model call. */}
      {!report || session.status !== "completed" ? (
        <ReportGenerator sessionId={id} />
      ) : (
        <div className="flex flex-col gap-8">
          <ScoreSummary
            summary={report.summary ?? ""}
            overall={pickOverall(session.overall_scores) ?? rollup.overall}
            overallScores={pickScores(session.overall_scores)}
            questions={questions}
            answered={rollup.questionsAsked}
            scored={rollup.questionsScored}
          />
          <FeedbackList feedback={report.stats?.feedback ?? null} questions={questions} />
          <RewriteCard
            weakest={
              questions.find((q) => q.turns.some((t) => t.id === report.weakest_turn_id)) ?? null
            }
            rewrite={report.rewrite_text}
          />
          <ScoreTable questions={questions} />
          <SpeakingStats wpm={report.stats?.wpm ?? null} fillers={report.stats?.fillers ?? null} turns={turns} />
          <HighlightedTranscript questions={questions} />
        </div>
      )}
    </ReportsFolder>
  );
}
