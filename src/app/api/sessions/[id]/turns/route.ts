/**
 * POST /api/sessions/[id]/turns — the hot path.
 *
 * The orchestration lives in `lib/interview/turn.ts` so the rehearsal harness
 * runs identical code. This is the HTTP shell: auth, validation, idempotency,
 * persistence.
 *
 * Ref: TechDesign > The Core Journey (8)
 */

import { NextResponse, after } from "next/server";

import { getUserOrNull, UNAUTHORIZED } from "@/lib/auth";
import type { EngineState } from "@/lib/engine/types";
import { formatFactsForPrompt } from "@/lib/resume/distill";
import { retrieveRelevantChunks, formatChunksForPrompt } from "@/lib/resume/retrieve";
import { runTurn } from "@/lib/interview/turn";
import { TurnBody } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import type { RoleProfile } from "@/lib/jd/distill";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/sessions/[id]/turns">,
) {
  const { id } = await ctx.params;

  const user = await getUserOrNull();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const parsed = TurnBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", detail: parsed.error.issues },
      { status: 422 },
    );
  }
  const body = parsed.data;

  const supabase = await createClient();

  // RLS makes another user's session invisible: "not found" and "not yours"
  // are the same 404, so the difference never leaks.
  const { data: session } = await supabase
    .from("interview_sessions")
    .select("id, engine_state, resume_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (session.status === "completed") {
    return NextResponse.json(
      { error: "This interview has already finished." },
      { status: 409 },
    );
  }

  const state = session.engine_state as EngineState;

  /**
   * Idempotency. Push-to-talk double-fires constantly; without this the same
   * answer is scored twice and the engine advanced twice. The client resyncs
   * from the state in this body rather than retrying.
   */
  if (body.clientTurnSeq !== state.turnSeq + 1) {
    return NextResponse.json(
      {
        error: "Stale turn sequence",
        expected: state.turnSeq + 1,
        received: body.clientTurnSeq,
        state,
      },
      { status: 409 },
    );
  }

  // Distilled facts go in every prompt — a fixed prefix, cheap and
  // reproducible. Retrieval only grounds a resume-led opening.
  let resumeFacts: string | null = null;
  let role: RoleProfile | null = null;

  if (session.resume_id) {
    const { data: resume } = await supabase
      .from("resumes")
      .select("resume_facts, role_profile")
      .eq("id", session.resume_id)
      .maybeSingle();
    if (resume) {
      resumeFacts = formatFactsForPrompt(resume.resume_facts ?? null);
      role = (resume.role_profile ?? null) as RoleProfile | null;
    }
  }

  const result = await runTurn({
    state,
    transcript: body.transcript,
    holdMs: body.holdMs,
    captureMs: body.captureMs,
    resumeFacts,
    role,
    excerptFor: async (itemId) => {
      const item = state.resumeItems.find((i) => i.id === itemId);
      if (!session.resume_id || !item) return item?.label ?? "";
      const chunks = await retrieveRelevantChunks(
        session.resume_id,
        item.label,
        3,
      );
      return formatChunksForPrompt(chunks) || item.label;
    },
  });

  if (result.kind === "nudge") {
    // Not persisted, not counted: a cough must not cost a question.
    return NextResponse.json({ kind: "nudge", line: result.line });
  }

  /**
   * Both writes are SYNCHRONOUS. The tech design put the turn insert in
   * `after()` for latency, which is wrong: if it fails after the response is
   * sent, the candidate heard a question that was never persisted and the next
   * `clientTurnSeq` check mismatches, silently breaking idempotency.
   */
  const { error: updateError } = await supabase
    .from("interview_sessions")
    .update({
      engine_state: result.state,
      question_count: result.state.questionCount,
      ...(result.done ? { status: "completed", ended_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: `Could not save progress: ${updateError.message}` },
      { status: 500 },
    );
  }

  const { error: turnError } = await supabase.from("turns").insert({
    session_id: id,
    seq: result.state.turnSeq,
    topic: result.notepad.topic,
    question_type: result.notepad.questionType,
    difficulty: state.difficulty,
    question_text: state.currentQuestion.text,
    answer_transcript: body.transcript,
    scores: result.persistedScores,
    band: result.notepad.band,
    primary_gap: result.notepad.primaryGap,
    evidence: result.notepad.evidence,
    notepad_text: result.notepad.observation,
    reason_text: result.notepad.reason,
    wpm: result.stats.wpm,
    filler_count: result.stats.fillers,
    hold_ms: body.holdMs,
    capture_ms: body.captureMs ?? body.holdMs,
  });

  if (turnError) {
    return NextResponse.json(
      { error: `Could not save the answer: ${turnError.message}` },
      { status: 500 },
    );
  }

  // Telemetry only. `after()` runs even when the response errored, so nothing
  // here may be load-bearing.
  after(() => {
    if (result.notepad.degraded) {
      console.warn(`[turn] session ${id} seq ${result.state.turnSeq} degraded`);
    }
  });

  const covered = result.state.resumeItems.filter((i) => i.covered).length;

  return NextResponse.json({
    kind: "turn",
    move: result.move,
    notepad: result.notepad,
    next: result.next,
    done: result.done,
    wrapLine: result.wrapLine,
    progress: {
      questionCount: result.state.questionCount,
      questionCap: result.state.questionCap,
      topicIndex: result.state.topicIndex,
      topicsTotal: result.state.topics.length,
      coverageDone: covered,
      coverageTotal: result.state.resumeItems.length,
    },
  });
}
