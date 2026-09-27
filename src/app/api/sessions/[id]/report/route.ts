/**
 * POST /api/sessions/[id]/report — generate the scorecard once, then serve it.
 *
 * The pipeline lives in `lib/interview/report.ts`; this is the HTTP shell:
 * auth, the id check, and a Supabase-backed store. Every query goes through
 * the cookie client, so RLS scopes rows to the caller.
 *
 * Response: { summary, weakestTurnId, rewrite | null, stats, overallScores }
 * Errors:   401, 404, 409 (no answers yet)
 *
 * Also the target of End early, so it works from a single answered turn.
 *
 * Ref: TechDesign > Report Generator; Backend brief §6.4
 */

import { NextResponse } from "next/server";

import { getUserOrNull, UNAUTHORIZED } from "@/lib/auth";
import type { Dimension, Scores } from "@/lib/engine/types";
import {
  runReport,
  type ReportStore,
  type StoredReport,
} from "@/lib/interview/report";
import { SessionId } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

/** One model call plus a few queries; the default can be too tight on Vercel. */
export const maxDuration = 30;

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[id]/report">,
) {
  const { id } = await ctx.params;

  const user = await getUserOrNull();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  if (!SessionId.safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const outcome = await runReport(reportStore(await createClient(), id));
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (err) {
    // The detail is for the server log only — never the candidate's screen.
    console.error(`[report] session ${id}: ${(err as Error).message}`);
    return NextResponse.json(
      { error: "Couldn't build your scorecard. Please try again." },
      { status: 500 },
    );
  }
}

function reportStore(supabase: Supabase, id: string): ReportStore {
  let endedAt: string | null = null;

  return {
    async loadSession() {
      const { data, error } = await supabase
        .from("interview_sessions")
        .select("status, overall_scores, ended_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`load session: ${error.message}`);
      if (!data) return null;
      endedAt = data.ended_at ?? null;
      return { status: data.status, overallScores: data.overall_scores ?? null };
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
          "id, seq, question_text, answer_transcript, scores, primary_gap, capture_ms",
        )
        .eq("session_id", id)
        .order("seq", { ascending: true });
      if (error) throw new Error(`load turns: ${error.message}`);
      return (data ?? []).map((row) => ({
        id: row.id,
        seq: row.seq,
        questionText: row.question_text ?? "",
        answerTranscript: row.answer_transcript ?? "",
        scores: (row.scores ?? null) as Scores | null,
        primaryGap: (row.primary_gap ?? null) as Dimension | null,
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
