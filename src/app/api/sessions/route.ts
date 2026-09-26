/**
 * POST /api/sessions - create a session and return its first question.
 *
 * TODO(slice 2): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > API Contracts
 *      docs/TechDesign-JobMe-MVP.md > The Core Journey Through the System (3)
 *
 * Request:  { displayName: string(1..40), roleText?: string(..2000) }
 * Response: { sessionId, introLine, question: { text, type: 'opening', topic,
 *             difficulty }, progress: { topicIndex, topicsTotal: 4,
 *             questionCount } }
 * Errors:   401, 422
 *
 * Steps: requireUser -> update profile (display_name, target_role) ->
 * pickTopics() -> initState() -> insert interview_sessions -> return.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Not implemented" },
    { status: 501 },
  );
}
