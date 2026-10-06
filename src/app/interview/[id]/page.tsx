/**
 * The interview room. Server Component that hydrates the client orchestrator.
 * Ref: docs/PRD-JobMe-MVP.md > Interview Room: Voice Loop
 *      docs/TechDesign-JobMe-MVP.md > The Core Journey (4)
 *
 * Loads the session and its turns server-side. A finished interview (report
 * generated, or the engine already wrapped) goes to ./report, which builds the
 * scorecard on first visit. Otherwise <InterviewRoom> gets the current
 * question and the notepad history.
 *
 * Passing that history down from the server is what makes refresh-resume
 * free. `engine_state` itself never reaches the client: only the question,
 * the turn seq and a ProgressView are extracted from it here.
 *
 * The room is keyed on the server's turnSeq, so router.refresh() after a
 * stale submit remounts it from the authoritative state.
 */

import { notFound, redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/PageContainer";
import { InterviewRoom } from "@/components/room/InterviewRoom";
import { requireUser } from "@/lib/auth";
import type { EngineState } from "@/lib/engine/types";
import {
  noteFromTurnRow,
  progressFromState,
  questionFromState,
  type TurnRow,
} from "@/lib/frontend/adapters";
import type { InputMode } from "@/lib/frontend/types";
import { SessionId } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

const NOTE_COLUMNS =
  "seq, topic, question_type, question_source, scores, band, primary_gap, evidence, notepad_text, reason_text, degraded_reason";

export default async function InterviewRoomPage({
  params,
  searchParams,
}: PageProps<"/interview/[id]">) {
  const { id } = await params;
  const { input } = await searchParams;
  await requireUser();

  // A malformed id is the same 404 as a missing one (see the API routes).
  if (!SessionId.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [sessionRes, turnsRes] = await Promise.all([
    supabase.from("interview_sessions").select("id, status, engine_state").eq("id", id).maybeSingle(),
    supabase.from("turns").select(NOTE_COLUMNS).eq("session_id", id).order("seq", { ascending: true }),
  ]);

  // A failed query is not a missing interview: let the error boundary offer
  // a retry instead of telling the candidate their interview is gone.
  if (sessionRes.error) throw new Error(`room session: ${sessionRes.error.message}`);
  if (turnsRes.error) throw new Error(`room turns: ${turnsRes.error.message}`);
  if (!sessionRes.data) notFound();

  const state = sessionRes.data.engine_state as EngineState;
  if (sessionRes.data.status === "completed" || state.done) {
    redirect(`/interview/${id}/report`);
  }

  const requestedInput: InputMode = input === "voice" ? "voice" : "typed";
  const notes = ((turnsRes.data ?? []) as unknown as TurnRow[]).map(noteFromTurnRow);

  return (
    <PageContainer width="wide" className="flex flex-1 flex-col">
      <InterviewRoom
        key={state.turnSeq}
        sessionId={id}
        question={questionFromState(state)}
        turnSeq={state.turnSeq}
        progress={progressFromState(state)}
        notes={notes}
        requestedInput={requestedInput}
      />
    </PageContainer>
  );
}
