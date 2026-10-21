/**
 * POST /api/sessions/[id]/turns: the hot path. The orchestration is
 * lib/interview/turn.ts; this is auth, validation, idempotency, persistence.
 */

import { NextResponse, after } from "next/server";

import { getUserOrNull } from "@/lib/auth";
import { MAX_FOLLOW_UPS } from "@/lib/engine/policy";
import type { EngineState } from "@/lib/engine/types";
import { isSessionId, notFound, readBody, serverError, unauthorized } from "@/lib/http";
import {
  isStaleSubmit,
  runTurn,
  staleTurnBody,
  turnContextFrom,
  turnResponseBody,
  turnRowFor,
} from "@/lib/interview/turn";
import { TurnBody } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/sessions/[id]/turns">,
) {
  const started = performance.now();
  const { id } = await ctx.params;

  if (!(await getUserOrNull())) return unauthorized();

  const parsed = await readBody(request, TurnBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (!isSessionId(id)) return notFound();

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
    return serverError(
      `[turn] load session ${id}: ${sessionError.message} ` +
        "(if a column is missing, apply supabase/migrations/20260927110000)",
      "Couldn't load the interview. Please try again.",
    );
  }
  // History only sharpens follow-up scoring; without it the turn still runs.
  if (turnsError) {
    console.warn(`[turn] load history ${id}: ${turnsError.message}`);
  }

  if (!session) return notFound();
  if (session.status === "completed") {
    return NextResponse.json(
      { error: "This interview has already finished." },
      { status: 409 },
    );
  }

  const state = session.engine_state as EngineState;

  /** Idempotency: a double-fired submit gets the state to resync from, not a second turn. */
  if (body.clientTurnSeq !== state.turnSeq + 1) {
    return NextResponse.json(staleTurnBody(state, body.clientTurnSeq), { status: 409 });
  }

  const resume = session.resume_id
    ? (await supabase.from("resumes").select("resume_facts, role_profile").eq("id", session.resume_id).maybeSingle()).data
    : null;

  const turnCtx = turnContextFrom({
    state,
    answer: body,
    storedPlan: session.question_plan,
    postingText: session.role_text ?? null,
    resume,
    recentTurns: recentTurns ?? [],
  });

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
    return NextResponse.json(staleTurnBody(current, body.clientTurnSeq), { status: 409 });
  }

  if (submitError) {
    return serverError(
      `[turn] session ${id} seq ${result.state.turnSeq}: ${submitError.message}`,
      "Couldn't save your answer. Please try again.",
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

  return NextResponse.json(turnResponseBody(result));
}
