/**
 * POST /api/sessions/[id]/report - generate the scorecard once, then serve it.
 *
 * TODO(slice 5): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Report Generator
 *
 * Response: { summary, weakestTurnId, rewrite | null, stats, overallScores }
 * Errors:   401, 404
 *
 * IDEMPOTENT: if a reports row already exists, return it and make no LLM call.
 * Also the target of End early, so it must work with as few as 1 answered turn.
 *
 * Check the Vercel function max duration covers this (~5s).
 */

import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  ctx: RouteContext<"/api/sessions/[id]/report">,
) {
  const { id } = await ctx.params;
  void id;
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
