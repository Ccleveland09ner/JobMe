/**
 * POST /api/sessions/[id]/report: generate the scorecard once, then serve it
 * (pipeline: lib/interview/report.ts). 409 when nothing is answered yet.
 */

import { NextResponse } from "next/server";

import { getUserOrNull } from "@/lib/auth";
import type { StoredScores } from "@/lib/engine/types";
import { isSessionId, notFound, serverError, unauthorized } from "@/lib/http";
import {
  runReport,
  type ReportStore,
  type StoredReport,
} from "@/lib/interview/report";
import { formatRoleForPrompt } from "@/lib/jd/distill";
import { QuestionPlan } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

/** One model call plus a few queries; the default can be too tight on Vercel. */
export const maxDuration = 30;

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
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (err) {
    return serverError(`[report] session ${id}: ${(err as Error).message}`, "Couldn't build your scorecard. Please try again.");
  }
}

function reportStore(supabase: Supabase, id: string): ReportStore {
  let endedAt: string | null = null;

  return {
    async loadSession() {
      const { data, error } = await supabase
        .from("interview_sessions")
        .select("status, overall_scores, ended_at, role_text, question_plan")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`load session: ${error.message}`);
      if (!data) return null;
      endedAt = data.ended_at ?? null;
      // The role as the turns saw it, so feedback is judged against the same job.
      const plan = QuestionPlan.safeParse(data.question_plan);
      const role = plan.success ? plan.data.role : null;
      return {
        status: data.status,
        overallScores: data.overall_scores ?? null,
        roleText: role ? formatRoleForPrompt(role) : (data.role_text ?? null),
      };
    },

    async loadReport() {
      const { data, error } = await supabase
        .from("reports")
        .select("summary, weakest_turn_id, rewrite_text, stats")
        .eq("session_id", id)
        .maybeSingle();
      if (error) throw new Error(`load report: ${error.message}`);
      if (!data) return null;
      return {
        summary: data.summary ?? "",
        weakestTurnId: data.weakest_turn_id ?? null,
        rewrite: data.rewrite_text ?? null,
        stats: data.stats,
      } satisfies StoredReport;
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
        scores: (row.scores ?? null) as StoredScores | null,
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

    async completeSession(overallScores) {
      const { error } = await supabase
        .from("interview_sessions")
        .update({
          status: "completed",
          overall_scores: overallScores,
          // The turn route stamps this on a natural wrap; End early does not.
          ended_at: endedAt ?? new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(`complete session: ${error.message}`);
    },
  };
}
