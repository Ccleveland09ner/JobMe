/**
 * POST /api/sessions/[id]/turns - the hot path. One turn of the interview.
 *
 * TODO(slice 2): implement. This route is the product.
 * Ref: docs/TechDesign-JobMe-MVP.md > The Core Journey Through the System (8)
 *      docs/TechDesign-JobMe-MVP.md > Turn API
 *
 * Request:  { transcript: 1..5000, durationMs: int, clientTurnSeq: int }
 * Response: { kind: 'nudge', line }
 *        OR { kind: 'turn', notepad: {...}, next: {...} | null, done,
 *             wrapLine?, progress }
 * Errors:   401, 404, 409 (stale seq - body carries the current state), 422
 *
 * Order of operations (the latency budget depends on it - target <= 1.5s):
 *   1. Auth, then load engine_state from interview_sessions.
 *   2. Fewer than 5 words -> return a nudge. No scoring, no cap increment.
 *   3. Promise.all([evaluateAndDraft(...), embed(answer)])  <- parallel, and
 *      the single reason a turn fits the budget. Do not serialise these.
 *   4. Relevance blend + anchor check -> classifyBand().
 *   5. engine.step(state, evaluation) -> { nextState, move, nextQuestion }.
 *   6. UPDATE interview_sessions (synchronous - this is the source of truth).
 *   7. Return the response.
 *   8. after() inserts the turns row (non-blocking).
 *
 * clientTurnSeq must equal state.turnSeq + 1, else 409 with the current state.
 * That plus unique(session_id, seq) is what makes a double-submit harmless.
 *
 * On EvalError: retry once, then fall back to a seed Clarify and save the turn
 * with scores = null. The notepad says so in plain language. The interview
 * keeps moving.
 *
 * Open Question #4: verify after() behaves as documented on Next 16 + Vercel.
 * If it does not, just await the insert (+~80ms).
 */

import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/sessions/[id]/turns">,
) {
  const { id } = await ctx.params;
  void id;
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
