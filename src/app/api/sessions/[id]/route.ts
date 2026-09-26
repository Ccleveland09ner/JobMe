/**
 * DELETE /api/sessions/[id] - remove a session and everything under it.
 *
 * TODO(slice 6): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > API Contracts
 *      docs/PRD-JobMe-MVP.md > Dashboard and Progress
 *
 * Response: 204. Errors: 401, 404.
 *
 * turns and reports cascade on the FK, so one delete is enough. RLS already
 * scopes the row to the caller - a row belonging to someone else simply is not
 * found, which is the 404.
 *
 * In Next 16 dynamic params are a Promise: const { id } = await ctx.params;
 */

import { NextResponse } from "next/server";

export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;
  void id;
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
