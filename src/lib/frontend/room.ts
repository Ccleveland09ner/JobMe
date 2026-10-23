/** The interview room's rows: the session's state and the notes so far, read through RLS. */

import type { EngineState } from "../engine/types";
import type { RowReader } from "../supabase/reader";

import { noteFromTurnRow, type TurnRow } from "./adapters";
import type { NoteView } from "./types";

const NOTE_COLUMNS =
  "seq, topic, question_type, question_source, scores, band, primary_gap, evidence, notepad_text, reason_text, degraded_reason";

export type RoomLoad =
  /** Missing, or not this user's: the same 404. */
  | { kind: "missing" }
  /** Completed, or wrapped and waiting for its report: the room hands over to the report. */
  | { kind: "finished" }
  | { kind: "open"; state: EngineState; notes: NoteView[] };

/** A failed read throws: it isn't a missing interview, and the error boundary offers a retry. */
export async function loadRoom(supabase: RowReader, id: string): Promise<RoomLoad> {
  const [sessionRes, turnsRes] = await Promise.all([
    supabase.from("interview_sessions").select("id, status, engine_state").eq("id", id).maybeSingle(),
    supabase.from("turns").select(NOTE_COLUMNS).eq("session_id", id).order("seq", { ascending: true }),
  ]);
  if (sessionRes.error) throw new Error(`room session: ${sessionRes.error.message}`);
  if (turnsRes.error) throw new Error(`room turns: ${turnsRes.error.message}`);
  if (!sessionRes.data) return { kind: "missing" };

  const session = sessionRes.data as { status: string; engine_state: unknown };
  const state = session.engine_state as EngineState;
  if (session.status === "completed" || state.done) return { kind: "finished" };
  return { kind: "open", state, notes: ((turnsRes.data ?? []) as unknown as TurnRow[]).map(noteFromTurnRow) };
}
