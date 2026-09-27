/**
 * DELETE /api/sessions/[id] — remove a session and everything under it.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > API Contracts
 *      docs/PRD-JobMe-MVP.md > Dashboard and Progress
 *
 * Response: 204. Errors: 401, 404.
 *
 * `turns` and `reports` cascade on the FK, so one delete is enough. RLS scopes
 * the delete to the caller: another user's session is simply not matched,
 * which is the same 404 as a missing one — the difference never leaks.
 */

import { NextResponse } from "next/server";

import { getUserOrNull, UNAUTHORIZED } from "@/lib/auth";
import { SessionId } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;

  const user = await getUserOrNull();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  if (!SessionId.safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();

  // `select` returns the deleted rows; without it zero matches and one match
  // look identical, and a 404 could not be told apart from a 204.
  const { data, error } = await supabase
    .from("interview_sessions")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error(`[sessions] delete ${id}: ${error.message}`);
    return NextResponse.json(
      { error: "Couldn't delete that interview. Please try again." },
      { status: 500 },
    );
  }
  if (!data?.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
