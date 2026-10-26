import { describe, expect, it } from "vitest";

import { BANK } from "../engine/bank";
import { TOPIC_IDS, type EngineState } from "../engine/types";
import {
  displayAverage,
  friendlyError,
  modeFromRow,
  noteFromTurnRow,
  pickOverall,
  pickScores,
  progressFromState,
  scoreEntries,
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
  it("keeps all eight legacy dimensions, so an old session still renders", () => {
    expect(pickScores(FULL)).toEqual(FULL);
  });

  it("keeps the current dimensions", () => {
    const technical = { relevance: 3, accuracy: 2, reasoning: 3, specificity: 3, communication: 4 };
    expect(pickScores(technical)).toEqual(technical);
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
  it("returns display order regardless of key order", () => {
    expect(scoreEntries({ relevance: 4, situation: 1 })).toEqual([
      ["situation", 1],
      ["relevance", 4],
    ]);
    expect(scoreEntries({ communication: 3, accuracy: 2, relevance: 4 })).toEqual([
      ["relevance", 4],
      ["accuracy", 2],
      ["communication", 3],
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

describe("pickOverall", () => {
  it("uses the stored overall score, and never renders it as a dimension", () => {
    const stored = { reasoning: 2, outcome: 4, overall: 3.24 };
    expect(pickOverall(stored)).toBe(3.2);
    expect(pickScores(stored)).toEqual({ reasoning: 2, outcome: 4 });
  });

  it("stands in the plain mean for a session stored before `overall` existed", () => {
    expect(pickOverall({ impact: 2.5, structure: 3 })).toBe(2.5);
    expect(pickOverall(null)).toBeNull();
  });
});

describe("modeFromRow", () => {
  it("does not invent a mode it cannot read", () => {
    expect(modeFromRow("full")).toBe("full");
    expect(modeFromRow("marathon")).toBeNull();
    expect(modeFromRow(undefined)).toBeNull();
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
