/**
 * POST /api/sessions/[id]/report: generate the scorecard once, then serve it
 * (pipeline: lib/interview/report.ts). 409 when nothing is answered yet.
 */

import { NextResponse } from "next/server";

import { getUserOrNull } from "@/lib/auth";
import { isSessionId, notFound, serverError, unauthorized } from "@/lib/http";
import {
  runReport,
  type ReportStore,
  type StoredReport,
} from "@/lib/interview/report";
import { jobForPrompt, parsePlan } from "@/lib/plan";
import { pickScores, reportFromRow } from "@/lib/stats";
import { saveTurnScore } from "@/lib/supabase/rescore";
import { createClient } from "@/lib/supabase/server";

/**
 * Re-scores of turns live scoring missed (up to RESCORE_TIMEOUT_MS, side by
 * side), then one model call for the text, plus a few queries.
 */
export const maxDuration = 60;

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[id]/report">,
) {
  const { id } = await ctx.params;

  if (!(await getUserOrNull())) return unauthorized();
  if (!isSessionId(id)) return notFound();

  try {
    const outcome = await runReport(reportStore(await createClient(), id));
    if (outcome.kind === "not-found") return notFound();
    if (outcome.kind === "nothing-answered") {
      return NextResponse.json({ error: "Answer at least one question before ending the interview." }, { status: 409 });
    }
    return NextResponse.json(outcome.body);
  } catch (err) {
    return serverError(`[report] session ${id}: ${(err as Error).message}`, "Couldn't build your scorecard. Please try again.");
  }
}

function reportStore(supabase: Supabase, id: string): ReportStore {
  return {
    async loadSession() {
      const { data, error } = await supabase
        .from("interview_sessions")
        .select("status, overall_scores, ended_at, role_text, question_plan")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`load session: ${error.message}`);
      if (!data) return null;
      const plan = parsePlan(data.question_plan);
      return {
        status: data.status,
        overallScores: data.overall_scores ?? null,
        endedAt: data.ended_at ?? null,
        // The role as the turns saw it, so feedback is judged against the same job.
        roleText: jobForPrompt(plan, data.role_text ?? null),
        // As turnContextFrom reads it, so a re-score is judged at the same level.
        seniority: plan?.job?.seniority ?? (plan?.role?.seniority || null),
      };
    },

    async loadReport() {
      const { data, error } = await supabase
        .from("reports")
        .select("summary, weakest_turn_id, rewrite_text, stats")
        .eq("session_id", id)
        .maybeSingle();
      if (error) throw new Error(`load report: ${error.message}`);
      return data ? (reportFromRow(data) satisfies StoredReport) : null;
    },

    async loadTurns() {
      const { data, error } = await supabase
        .from("turns")
        .select(
          "id, seq, topic, question_type, question_source, question_text, answer_transcript, scores, primary_gap, capture_ms",
        )
        .eq("session_id", id)
        .order("seq", { ascending: true });
      if (error) throw new Error(`load turns: ${error.message}`);
      return (data ?? []).map((row) => ({
        id: row.id,
        seq: row.seq,
        questionType: row.question_type ?? null,
        topic: row.topic ?? null,
        source: row.question_source ?? null,
        questionText: row.question_text ?? "",
        answerTranscript: row.answer_transcript ?? "",
        scores: pickScores(row.scores),
        primaryGap: row.primary_gap ?? null,
        captureMs: row.capture_ms ?? null,
      }));
    },

    async insertReport(report) {
      const { error } = await supabase.from("reports").insert({
        session_id: id,
        summary: report.summary,
        weakest_turn_id: report.weakestTurnId,
        rewrite_text: report.rewrite,
        stats: report.stats,
      });
      // session_id is the primary key: a concurrent request got there first.
      if (error?.code === "23505") return "exists";
      if (error) throw new Error(`insert report: ${error.message}`);
      return "inserted";
    },

    async completeSession(overallScores, endedAt) {
      const { error } = await supabase
        .from("interview_sessions")
        .update({
          status: "completed",
          overall_scores: overallScores,
          ended_at: endedAt,
        })
        .eq("id", id);
      if (error) throw new Error(`complete session: ${error.message}`);
    },

    saveRescore: (turnId, rescore) => saveTurnScore(supabase, turnId, rescore),
  };
}
