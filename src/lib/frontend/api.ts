/**
 * The app's own API as the browser calls it: each call says what happened,
 * typed, instead of handing back a raw response. Failures carry a message a
 * candidate can read (friendlyError); a request that never reached the server
 * is `offline`, which each caller words for its own situation.
 */

import { friendlyError } from "./adapters";
import type { GeneratedReport } from "./report-document";
import type { CreateSessionResponse, ResumeUploadResponse, TurnResponse } from "./types";

/** The usual words for a request that never got there. */
export const OFFLINE_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; offline: false; status: number; message: string; body: unknown }
  | { ok: false; offline: true };

/** A request, its JSON body (null when there is none), and the status. */
async function request<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { ok: false, offline: true };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  return { ok: false, offline: false, status: res.status, message: friendlyError(res.status, body), body };
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** POST /api/sessions: a new interview and its first question. */
export function createSession(body: unknown) {
  return request<CreateSessionResponse>("/api/sessions", postJson(body));
}

/** POST /api/resume: a PDF read, redacted and ranked. */
export function uploadResume(form: FormData) {
  return request<ResumeUploadResponse>("/api/resume", { method: "POST", body: form });
}

/** POST /api/sessions/[id]/report: the report, written once. A 409 means nothing was answered. */
export function generateReport(sessionId: string) {
  return request<GeneratedReport | null>(`/api/sessions/${sessionId}/report`, { method: "POST" });
}

/** DELETE /api/sessions/[id]. */
export function deleteSession(sessionId: string) {
  return request<null>(`/api/sessions/${sessionId}`, { method: "DELETE" });
}

export type TurnOutcome =
  | { kind: "turn"; turn: Extract<TurnResponse, { kind: "turn" }> }
  /** Not counted: say the line and listen again. */
  | { kind: "nudge"; line: string }
  /** Another submit of this turn counted first: resync from the server. */
  | { kind: "stale" }
  /** The interview is over (finished elsewhere): its scorecard is the place to go. */
  | { kind: "finished" }
  | { kind: "failed"; message: string }
  | { kind: "offline" };

/** POST /api/sessions/[id]/turns: one answer in, what the room does next out. */
export async function submitTurn(
  sessionId: string,
  answer: { transcript: string; clientTurnSeq: number; holdMs: number; captureMs?: number },
): Promise<TurnOutcome> {
  const result = await request<TurnResponse>(`/api/sessions/${sessionId}/turns`, postJson(answer));
  if (!result.ok) {
    if (result.offline) return { kind: "offline" };
    if (result.status === 409) {
      const body = result.body;
      return body && typeof body === "object" && "state" in body ? { kind: "stale" } : { kind: "finished" };
    }
    return { kind: "failed", message: result.message };
  }
  const turn = result.data;
  return turn.kind === "nudge" ? { kind: "nudge", line: turn.line } : { kind: "turn", turn };
}
