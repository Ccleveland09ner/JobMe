/**
 * Scorecard. Server Component.
 * Ref: docs/PRD-JobMe-MVP.md > Scorecard
 *      docs/TechDesign-JobMe-MVP.md > Scorecard Page
 *
 * Loads session, turns and report under RLS. If no report row exists yet,
 * <ReportGenerator> POSTs /api/sessions/[id]/report once and refreshes; the
 * saved row then renders here, instantly on every later visit.
 *
 * The report route does not return the turns, so they are read here.
 * Overall scores are the session's stored `overall_scores` (scored turns
 * only); nothing is averaged on the client.
 *
 * Scores are practice feedback, never framed as a prediction of a hiring
 * outcome. Ref: docs/PRD-JobMe-MVP.md > Non-Goals
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { LocalDate } from "@/components/common/LocalDate";
import { PageContainer, PageHeader } from "@/components/layout/PageContainer";
import { HighlightedTranscript } from "@/components/report/HighlightedTranscript";
import { ReportGenerator } from "@/components/report/ReportGenerator";
import { RewriteCard } from "@/components/report/RewriteCard";
import { ScoreSummary } from "@/components/report/ScoreSummary";
import { ScoreTable } from "@/components/report/ScoreTable";
import { SpeakingStats } from "@/components/report/SpeakingStats";
import { buttonClasses } from "@/components/ui/Button";
import type { ReportStats } from "@/lib/ai/report";
import { requireUser } from "@/lib/auth";
import { pickScores, reportTurnFromRow, type TurnRow } from "@/lib/frontend/adapters";
import { MODE_LABELS } from "@/lib/frontend/labels";
import { SessionId } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

const TURN_COLUMNS =
  "id, seq, topic, question_type, question_source, question_text, answer_transcript, scores, band, primary_gap, evidence, notepad_text, reason_text, wpm, filler_count";

export default async function ReportPage({ params }: PageProps<"/interview/[id]/report">) {
  const { id } = await params;
  await requireUser();
  if (!SessionId.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [sessionRes, turnsRes, reportRes] = await Promise.all([
    supabase
      .from("interview_sessions")
      .select("id, status, overall_scores, started_at, mode:engine_state->>mode")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("turns").select(TURN_COLUMNS).eq("session_id", id).order("seq", { ascending: true }),
    supabase
      .from("reports")
      .select("summary, weakest_turn_id, rewrite_text, stats")
      .eq("session_id", id)
      .maybeSingle(),
  ]);

  if (sessionRes.error) throw new Error(`report session: ${sessionRes.error.message}`);
  if (turnsRes.error) throw new Error(`report turns: ${turnsRes.error.message}`);
  if (reportRes.error) throw new Error(`report row: ${reportRes.error.message}`);

  const session = sessionRes.data as
    | { id: string; status: string; overall_scores: unknown; started_at: string; mode: string | null }
    | null;
  if (!session) notFound();

  const turns = ((turnsRes.data ?? []) as unknown as (TurnRow & { id: string })[]).map(reportTurnFromRow);
  const report = reportRes.data as
    | { summary: string | null; weakest_turn_id: string | null; rewrite_text: string | null; stats: ReportStats | null }
    | null;

  const mode = session.mode === "quick" || session.mode === "full" ? MODE_LABELS[session.mode] : null;
  const backLink = (
    <Link href="/dashboard" className={buttonClasses({ variant: "secondary" })}>
      Back to dashboard
    </Link>
  );

  return (
    <PageContainer width="base">
      <PageHeader
        title="Your scorecard"
        description={
          <>
            {mode && `${mode} · `}
            <LocalDate iso={session.started_at} format="dateTime" />
          </>
        }
        actions={backLink}
      />

      {/* A report on a session still marked in progress means a crash
          between insert and completion; the POST heals it without a model call. */}
      {!report || session.status !== "completed" ? (
        <ReportGenerator sessionId={id} />
      ) : (
        <div className="flex flex-col gap-8">
          <ScoreSummary
            summary={report.summary ?? ""}
            overallScores={pickScores(session.overall_scores)}
            answered={report.stats?.answered ?? turns.length}
            scored={report.stats?.scored ?? turns.filter((t) => t.scores).length}
          />
          <RewriteCard
            weakest={turns.find((t) => t.id === report.weakest_turn_id) ?? null}
            rewrite={report.rewrite_text}
          />
          <ScoreTable turns={turns} />
          <SpeakingStats wpm={report.stats?.wpm ?? null} fillers={report.stats?.fillers ?? null} turns={turns} />
          <HighlightedTranscript turns={turns} />
          <div className="flex justify-center border-t border-line pt-8">
            <Link href="/dashboard" className={buttonClasses({ size: "lg" })}>
              Back to dashboard
            </Link>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
