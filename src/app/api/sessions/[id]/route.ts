/**
 * DELETE /api/sessions/[id]: turns and reports cascade. Under RLS another
 * user's session is the same 404 as a missing one.
 */

import { getUserOrNull } from "@/lib/auth";
import { isSessionId, notFound, serverError, unauthorized } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;

  if (!(await getUserOrNull())) return unauthorized();
  if (!isSessionId(id)) return notFound();

  const supabase = await createClient();

  // `select` returns the deleted rows, to tell a 404 from a 204.
  const { data, error } = await supabase
    .from("interview_sessions")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    return serverError(`[sessions] delete ${id}: ${error.message}`, "Couldn't delete that interview. Please try again.");
  }
  if (!data?.length) return notFound();

  return new Response(null, { status: 204 });
}
