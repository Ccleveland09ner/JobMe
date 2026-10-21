/**
 * POST /api/sessions/[id]/turns: the hot path. The orchestration is
 * lib/interview/turn.ts; this is auth, validation, idempotency, persistence.
 */

import { NextResponse, after } from "next/server";

import { getUserOrNull, UNAUTHORIZED } from "@/lib/auth";
import { MAX_FOLLOW_UPS } from "@/lib/engine/policy";
import type { EngineState } from "@/lib/engine/types";
import { formatFactsForPrompt } from "@/lib/resume/distill";
import {
  isStaleSubmit,
  runTurn,
  threadHistory,
  turnRowFor,
  type TurnContext,
} from "@/lib/interview/turn";
import { QuestionPlan, SessionId, TurnBody } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { formatRoleForPrompt, type RoleProfile } from "@/lib/jd/distill";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/sessions/[id]/turns">,
) {
  const started = performance.now();
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

  if (!SessionId.safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();

  // Under RLS another user's session is the same 404. The latest turns come in
  // the same round trip, to score a follow-up in context.
  const [
    { data: session, error: sessionError },
    { data: recentTurns, error: turnsError },
  ] = await Promise.all([
    supabase
      .from("interview_sessions")
      .select("id, engine_state, resume_id, status, role_text, question_plan")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("turns")
      .select("seq, question_text, answer_transcript")
      .eq("session_id", id)
      .order("seq", { ascending: false })
      .limit(MAX_FOLLOW_UPS),
  ]);

  // A failed query isn't a missing row (often an unapplied migration): not a 404.
  if (sessionError) {
    console.error(
      `[turn] load session ${id}: ${sessionError.message} ` +
        "(if a column is missing, apply supabase/migrations/20260927110000)",
    );
    return NextResponse.json(
      { error: "Couldn't load the interview. Please try again." },
      { status: 500 },
    );
  }
  // History only sharpens follow-up scoring; without it the turn still runs.
  if (turnsError) {
    console.warn(`[turn] load history ${id}: ${turnsError.message}`);
  }

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

  /** Idempotency: a double-fired submit gets the state to resync from, not a second turn. */
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

  // Parsed, not trusted: a malformed plan means the fixed openings, not a 500.
  const planParse = QuestionPlan.safeParse(session.question_plan);
  const plan = planParse.success ? planParse.data : null;

  // Distilled facts go in every prompt (a fixed prefix).
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

  const turnCtx: TurnContext = {
    state,
    transcript: body.transcript,
    holdMs: body.holdMs,
    captureMs: body.captureMs,
    resumeFacts,
    role,
    // This session's job outranks the resume's; the plan's summary beats the raw posting.
    roleText: plan?.role
      ? formatRoleForPrompt(plan.role)
      : (session.role_text ?? null),
    priorThreadTurns: threadHistory(state, recentTurns ?? []),
    plan,
  };

  const result = await runTurn(turnCtx);

  if (result.kind === "nudge") {
    // Not persisted, not counted: a cough must not cost a question.
    return NextResponse.json({ kind: "nudge", line: result.line });
  }

  /**
   * Synchronous and atomic: submit_turn writes the turn and advances
   * engine_state in one transaction, only from the turnSeq read above.
   */
  const saveStarted = performance.now();
  const { error: submitError } = await supabase.rpc("submit_turn", {
    p_session_id: id,
    p_seq: result.state.turnSeq,
    p_engine_state: result.state,
    p_turn: turnRowFor(turnCtx, result),
  });
  const saveMs = Math.round(performance.now() - saveStarted);

  if (isStaleSubmit(submitError)) {
    // Lost the race: the other submit counts; the client resyncs.
    const { data: latest } = await supabase
      .from("interview_sessions")
      .select("engine_state")
      .eq("id", id)
      .maybeSingle();
    const current = (latest?.engine_state ?? state) as EngineState;
    return NextResponse.json(
      {
        error: "Stale turn sequence",
        expected: current.turnSeq + 1,
        received: body.clientTurnSeq,
        state: current,
      },
      { status: 409 },
    );
  }

  if (submitError) {
    // The detail is for the server log only — never the candidate's screen.
    console.error(
      `[turn] session ${id} seq ${result.state.turnSeq}: ${submitError.message}`,
    );
    return NextResponse.json(
      { error: "Couldn't save your answer. Please try again." },
      { status: 500 },
    );
  }

  // Telemetry only (after() runs even on errors): one timing line per turn, no candidate text.
  // TODO(integration): TTS prewarm belongs here once /api/tts has a cache.
  const totalMs = Math.round(performance.now() - started);
  after(() => {
    const line = {
      event: "turn",
      session: id,
      seq: result.state.turnSeq,
      move: result.move,
      band: result.notepad.band,
      degraded: result.degradedReason,
      evalMs: result.evalMs,
      saveMs,
      totalMs,
    };
    if (result.degradedReason) console.warn(`[turn] ${JSON.stringify(line)}`);
    else console.info(`[turn] ${JSON.stringify(line)}`);
  });

  const covered = result.state.resumeItems.filter((i) => i.covered).length;

  return NextResponse.json({
    kind: "turn",
    move: result.move,
    notepad: result.notepad,
    // `lead` (a new thread only) is spoken before `text`, never shown alone.
    next: result.next ? { ...result.next, lead: result.lead } : null,
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
