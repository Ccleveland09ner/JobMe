import { describe, expect, it } from "vitest";

import { BANK } from "../engine/bank";
import { TOPIC_IDS, type EngineState } from "../engine/types";
import {
  displayAverage,
  findEvidence,
  friendlyError,
  noteFromTurnRow,
  pickScores,
  progressFromState,
  scoreEntries,
  sessionSummaryFromRow,
} from "./adapters";
import { TOPIC_LABELS } from "./labels";

const FULL = {
  situation: 3,
  task: 2,
  action: 3,
  result: 1,
  specificity: 2,
  impact: 1,
  ownership: 1,
  relevance: 4,
};

describe("TOPIC_LABELS", () => {
  it("matches the bank's labels for every topic", () => {
    for (const id of TOPIC_IDS) expect(TOPIC_LABELS[id]).toBe(BANK[id].label);
  });
});

describe("pickScores", () => {
  it("keeps all eight dimensions", () => {
    expect(pickScores(FULL)).toEqual(FULL);
  });

  it("drops the legacy structure key and non-numbers", () => {
    expect(pickScores({ structure: 3, impact: 2, ownership: "x" })).toEqual({ impact: 2 });
  });

  it("treats null, empty and unknown-only as unscored", () => {
    expect(pickScores(null)).toBeNull();
    expect(pickScores({})).toBeNull();
    expect(pickScores({ structure: 3 })).toBeNull();
  });
});

describe("scoreEntries", () => {
  it("returns rubric order regardless of key order", () => {
    const entries = scoreEntries({ relevance: 4, situation: 1 });
    expect(entries).toEqual([
      ["situation", 1],
      ["relevance", 4],
    ]);
  });
});

describe("displayAverage", () => {
  it("averages the backend's per-dimension averages", () => {
    expect(displayAverage({ impact: 2, ownership: 3 })).toBe(2.5);
  });

  it("is null when nothing was scored", () => {
    expect(displayAverage(null)).toBeNull();
  });
});

describe("noteFromTurnRow", () => {
  const row = {
    seq: 4,
    topic: "teamwork",
    question_type: "clarify",
    question_source: "bank",
    scores: FULL,
    band: "mediocre",
    primary_gap: "ownership",
    evidence: "We worked together",
    notepad_text: "No clear individual contribution",
    reason_text: "asking what they changed",
    degraded_reason: null,
  };

  it("maps a scored turn", () => {
    const note = noteFromTurnRow(row);
    expect(note).toMatchObject({
      seq: 4,
      topic: "teamwork",
      questionType: "clarify",
      source: "bank",
      band: "mediocre",
      primaryGap: "ownership",
      degraded: false,
    });
    expect(note.scores).toEqual(FULL);
  });

  it("marks an unscored turn as degraded rather than zero-scored", () => {
    const note = noteFromTurnRow({ ...row, scores: null, band: null, degraded_reason: "timeout" });
    expect(note.degraded).toBe(true);
    expect(note.scores).toBeNull();
  });

  it("tolerates unknown enum values", () => {
    const note = noteFromTurnRow({ ...row, band: "excellent", primary_gap: "structure" });
    expect(note.band).toBeNull();
    expect(note.primaryGap).toBeNull();
  });
});

describe("sessionSummaryFromRow", () => {
  it("normalises status, mode and scores", () => {
    expect(
      sessionSummaryFromRow({
        id: "s1",
        status: "completed",
        question_count: 7,
        overall_scores: { impact: 2.5, structure: 3 },
        started_at: "2026-10-01T10:00:00Z",
        ended_at: null,
        mode: "full",
      }),
    ).toEqual({
      id: "s1",
      status: "completed",
      mode: "full",
      startedAt: "2026-10-01T10:00:00Z",
      endedAt: null,
      questionCount: 7,
      overallScores: { impact: 2.5 },
    });
  });

  it("does not invent a mode it cannot read", () => {
    const s = sessionSummaryFromRow({
      id: "s1",
      status: "in_progress",
      question_count: null,
      overall_scores: null,
      started_at: "x",
      ended_at: null,
    });
    expect(s.mode).toBeNull();
    expect(s.questionCount).toBe(0);
  });
});

describe("progressFromState", () => {
  it("passes the cap through and counts covered items", () => {
    const state = {
      mode: "full",
      questionCount: 12,
      questionCap: 22,
      topicIndex: 1,
      topics: ["teamwork", "conflict", "pressure"],
      resumeItems: [{ covered: true }, { covered: false }, { covered: true }],
    } as unknown as EngineState;
    expect(progressFromState(state)).toEqual({
      mode: "full",
      questionCount: 12,
      questionCap: 22,
      coverageDone: 2,
      coverageTotal: 3,
      topicIndex: 1,
      topicsTotal: 3,
    });
  });
});

describe("findEvidence", () => {
  it("splits around a case-insensitive match, preserving original casing", () => {
    expect(findEvidence("Honestly we Worked Together on it.", "we worked together")).toEqual({
      before: "Honestly ",
      match: "we Worked Together",
      after: " on it.",
    });
  });

  it("returns null for a paraphrase or no quote", () => {
    expect(findEvidence("We fixed it.", "the team resolved it")).toBeNull();
    expect(findEvidence("We fixed it.", null)).toBeNull();
    expect(findEvidence("We fixed it.", "  ")).toBeNull();
  });
});

describe("friendlyError", () => {
  it("passes through route messages written for the candidate", () => {
    expect(friendlyError(500, { error: "Couldn't save your answer. Please try again." })).toBe(
      "Couldn't save your answer. Please try again.",
    );
  });

  it("never surfaces validation detail or technical messages", () => {
    const msg = friendlyError(422, { error: "Invalid request", detail: [{ path: ["x"] }] });
    expect(msg).not.toMatch(/Invalid request|path/);
    expect(friendlyError(409, { error: "Stale turn sequence", state: {} })).not.toMatch(/Stale/);
  });

  it("handles bodies that are not JSON objects", () => {
    expect(friendlyError(502, "<html>")).toBe("Something went wrong. Please try again.");
    expect(friendlyError(401, null)).toMatch(/sign in/i);
  });
});
