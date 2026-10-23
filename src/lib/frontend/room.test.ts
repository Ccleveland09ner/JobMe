import { describe, expect, it } from "vitest";

import { initState } from "../engine/policy";
import { fakeSupabase } from "../testing/fake-supabase";

import { displayNameFor, loadProfile, saveDisplayName } from "./profile";
import { loadRoom } from "./room";

const FIRST = { text: "Tell me about a time…", type: "opening" as const, topic: "teamwork" as const, difficulty: 1, source: "bank" as const };
const state = initState({ mode: "quick", topics: ["teamwork"], resumeItems: [], firstQuestion: FIRST });
const NOTE = { seq: 1, topic: "teamwork", question_type: "opening", band: "mediocre", primary_gap: "outcome", scores: { relevance: 3 }, evidence: null, notepad_text: "Good start.", reason_text: "Asked how it ended.", degraded_reason: null };

describe("loadRoom", () => {
  it("opens an interview in progress with its notes so far", async () => {
    const db = fakeSupabase((q) => (q.table === "turns" ? { data: [NOTE] } : { data: { id: "s1", status: "in_progress", engine_state: state } }));
    const room = await loadRoom(db.client as never, "s1");
    expect(room.kind).toBe("open");
    if (room.kind !== "open") return;
    expect(room.state).toEqual(state);
    expect(room.notes).toEqual([expect.objectContaining({ seq: 1, band: "mediocre", observation: "Good start." })]);
  });

  it("hands a finished or wrapped interview to its report, and a missing one to a 404", async () => {
    const reading = (session: unknown) => fakeSupabase((q) => (q.table === "turns" ? { data: [] } : { data: session })).client as never;
    expect(await loadRoom(reading({ status: "completed", engine_state: state }), "s1")).toEqual({ kind: "finished" });
    expect(await loadRoom(reading({ status: "in_progress", engine_state: { ...state, done: true } }), "s1")).toEqual({ kind: "finished" });
    expect(await loadRoom(reading(null), "s1")).toEqual({ kind: "missing" });
  });

  it("fails loudly on a broken read rather than calling it missing", async () => {
    const broken = fakeSupabase((q) => (q.table === "turns" ? { error: { message: "down" } } : { data: null }));
    await expect(loadRoom(broken.client as never, "s1")).rejects.toThrow("room turns: down");
  });
});

describe("the profile", () => {
  it("calls the candidate by their saved name, else the start of their email", async () => {
    expect(displayNameFor("  Kazu ", "k@example.com")).toBe("Kazu");
    expect(displayNameFor(null, "kazu.n@example.com")).toBe("kazu.n");
    expect(displayNameFor("", null)).toBe("");
    const db = fakeSupabase(() => ({ data: { display_name: null, username: "kazu", member_code: "JM-1" } }));
    expect(await loadProfile(db.client as never, { id: "u1", email: "kazu@example.com" })).toEqual({ displayName: "kazu", username: "kazu", memberCode: "JM-1" });
    const broken = fakeSupabase(() => ({ error: { message: "down" } }));
    expect(await loadProfile(broken.client as never, { id: "u1", email: null })).toEqual({ displayName: "", username: null, memberCode: null });
  });

  it("saves a name only when the server would accept it", async () => {
    const db = fakeSupabase(() => ({}));
    expect(await saveDisplayName(db.client as never, "u1", "  ")).toEqual({ ok: false, message: "Your name can't be empty." });
    expect(await saveDisplayName(db.client as never, "u1", "x".repeat(41))).toEqual({ ok: false, message: "Keep it to 40 characters." });
    expect(db.queries).toHaveLength(0);
    expect(await saveDisplayName(db.client as never, "u1", " Kazu ")).toEqual({ ok: true });
    expect(db.queries[0]).toMatchObject({ table: "profiles", action: "update", payload: { display_name: "Kazu" } });
    const failing = fakeSupabase(() => ({ error: { message: "rls" } }));
    expect(await saveDisplayName(failing.client as never, "u1", "Kazu")).toEqual({ ok: false, message: "We couldn't save that. Try again in a moment." });
  });
});
