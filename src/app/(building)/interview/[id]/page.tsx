/**
 * The interview room: loads the session and turns on the server (so a refresh
 * resumes) and keys the room on turnSeq. A finished interview goes to
 * ./report. engine_state never reaches the client.
 */

import { notFound, redirect } from "next/navigation";

import { InterviewRoom } from "@/components/room/InterviewRoom";
import { requireUser } from "@/lib/auth";
import { progressFromState, questionFromState } from "@/lib/frontend/adapters";
import { loadRoom } from "@/lib/frontend/room";
import type { InputMode } from "@/lib/frontend/types";
import { isSessionId } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export default async function InterviewRoomPage({
  params,
  searchParams,
}: PageProps<"/interview/[id]">) {
  const { id } = await params;
  const { input } = await searchParams;
  await requireUser();

  // A malformed id is the same 404 as a missing one (see the API routes).
  if (!isSessionId(id)) notFound();

  const room = await loadRoom(await createClient(), id);
  if (room.kind === "missing") notFound();
  if (room.kind === "finished") redirect(`/interview/${id}/report`);

  // Voice unless setup asked for typed answers; the room falls back where it can't listen.
  const requestedInput: InputMode = input === "typed" ? "typed" : "voice";
  const { state, notes } = room;

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
