/**
 * POST /api/sessions/[id]/turns: the hot path. The work is submitAnswer in
 * lib/interview/turn.ts; this is auth, validation, storage, the HTTP answer
 * and telemetry.
 */

import { NextResponse, after } from "next/server";

import { getUserOrNull } from "@/lib/auth";
import { MAX_FOLLOW_UPS } from "@/lib/engine/policy";
import type { EngineState } from "@/lib/engine/types";
import type { TurnResponse } from "@/lib/frontend/types";
import { isSessionId, notFound, readBody, serverError, unauthorized } from "@/lib/http";
import { runTurn, staleTurnBody, submitAnswer, turnResponseBody, type TurnStore } from "@/lib/interview/turn";
import { TurnBody } from "@/lib/schemas";
import { saveTurnScore } from "@/lib/supabase/rescore";
import { createClient } from "@/lib/supabase/server";

/**
 * The response goes after at most EVAL_TIMEOUT_MS of scoring, but after()
 * waits up to LATE_EVAL_TIMEOUT_MS (50 s) for a slow score, within this.
 */
export const maxDuration = 60;

type Supabase = Awaited<ReturnType<typeof createClient>>;

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

  const outcome = await submitAnswer(body, turnStore(await createClient(), id), { runTurn });
  switch (outcome.kind) {
    case "load-failed":
      return serverError(
        `[turn] load session ${id}: ${outcome.reason} ` +
          "(if a column is missing, apply supabase/migrations/20260927110000)",
        "Couldn't load the interview. Please try again.",
      );
    case "not-found":
      return notFound();
    case "finished":
      return NextResponse.json({ error: "This interview has already finished." }, { status: 409 });
    case "stale":
      return NextResponse.json(staleTurnBody(outcome.state, body.clientTurnSeq), { status: 409 });
    case "nudge":
      return NextResponse.json({ kind: "nudge", line: outcome.line });
    case "save-failed":
      return serverError(
        `[turn] session ${id} seq ${outcome.seq}: ${outcome.reason}`,
        "Couldn't save your answer. Please try again.",
      );
  }

  // Telemetry only (after() runs even on errors): one timing line per turn, no candidate text.
  // TODO(integration): TTS prewarm belongs here once /api/tts has a cache.
  const { result, saveMs } = outcome;
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
  // A score that outlasted the live wait is saved once it lands.
  if (outcome.settleLate) after(outcome.settleLate);

  return NextResponse.json(turnResponseBody(result) satisfies TurnResponse);
}

function turnStore(supabase: Supabase, id: string): TurnStore {
  return {
    async load() {
      // Under RLS another user's session is the same 404. The latest turns come
      // in the same round trip, to score a follow-up in context.
      const [{ data: session, error: sessionError }, { data: recentTurns, error: turnsError }] = await Promise.all([
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
      if (sessionError) return { error: sessionError.message };
      // History only sharpens follow-up scoring; without it the turn still runs.
      if (turnsError) console.warn(`[turn] load history ${id}: ${turnsError.message}`);
      return { session: session ?? null, recentTurns: recentTurns ?? [] };
    },
    async loadResume(resumeId) {
      const { data } = await supabase.from("resumes").select("resume_facts, role_profile").eq("id", resumeId).maybeSingle();
      return data ?? null;
    },
    async submit(state, turn) {
      const { data, error } = await supabase.rpc("submit_turn", {
        p_session_id: id,
        p_seq: state.turnSeq,
        p_engine_state: state,
        p_turn: turn,
      });
      // submit_turn returns the new turn's id.
      return { error, turnId: typeof data === "string" ? data : null };
    },
    async reloadState() {
      const { data } = await supabase.from("interview_sessions").select("engine_state").eq("id", id).maybeSingle();
      return (data?.engine_state ?? null) as EngineState | null;
    },
    saveLateScore: (turnId, score) => saveTurnScore(supabase, turnId, score),
  };
}
