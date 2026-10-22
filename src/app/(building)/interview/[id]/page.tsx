/**
 * The interview room: loads the session and turns on the server (so a refresh
 * resumes) and keys the room on turnSeq. A finished interview goes to
 * ./report. engine_state never reaches the client.
 */

import { notFound, redirect } from "next/navigation";

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

  // A failed query isn't a missing interview: let the error boundary offer a retry.
  if (sessionRes.error) throw new Error(`room session: ${sessionRes.error.message}`);
  if (turnsRes.error) throw new Error(`room turns: ${turnsRes.error.message}`);
  if (!sessionRes.data) notFound();

  const state = sessionRes.data.engine_state as EngineState;
  if (sessionRes.data.status === "completed" || state.done) {
    redirect(`/interview/${id}/report`);
  }

  // Voice unless setup asked for typed answers; the room falls back where it can't listen.
  const requestedInput: InputMode = input === "typed" ? "typed" : "voice";
  const notes = ((turnsRes.data ?? []) as unknown as TurnRow[]).map(noteFromTurnRow);

  return (
    <InterviewRoom
      key={state.turnSeq}
      sessionId={id}
      question={questionFromState(state)}
      turnSeq={state.turnSeq}
      progress={progressFromState(state)}
      notes={notes}
      requestedInput={requestedInput}
    />
  );
}
