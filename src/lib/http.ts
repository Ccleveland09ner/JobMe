/**
 * What route handlers answer in the cases they share: nobody signed in, a
 * malformed request, an id that can't exist, and failures whose detail is
 * for the server log only. Statuses and bodies are API contract; the route
 * tests under src/app/api pin them.
 */

import { NextResponse } from "next/server";
import type { z } from "zod";

import { UNAUTHORIZED } from "@/lib/auth";
import { SessionId } from "@/lib/schemas";

export function unauthorized(): NextResponse {
  return NextResponse.json(UNAUTHORIZED, { status: 401 });
}

/** Also the answer for another user's row: under RLS the two look the same. */
export function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** A failure the candidate gets a plain sentence for; the detail goes to the log only. */
export function serverError(logLine: string, message: string): NextResponse {
  console.error(logLine);
  return NextResponse.json({ error: message }, { status: 500 });
}

/** The request's JSON body, checked against `schema`; a 422 with the issues if it doesn't fit. */
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    response: NextResponse.json({ error: "Invalid request", detail: parsed.error.issues }, { status: 422 }),
  };
}

/** A `[id]` segment that can name a session; anything else is the same 404 as a missing one. */
export function isSessionId(id: string): boolean {
  return SessionId.safeParse(id).success;
}
