import { describe, expect, it } from "vitest";

import {
  HYSTERESIS,
  classifyBand,
  computePrimaryGap,
  isOffTopic,
  noDimensionRose,
} from "./classify";
import {
  commitQuestion,
  initState,
  isPlateau,
  maxFollowUpsFor,
  nextSource,
  shouldResolveTopic,
  shouldWrap,
  step,
  uncovered,
  type StepInput,
} from "./policy";
import {
  FULL_BANK_THREADS,
  QUICK_QUESTION_CAP,
  fullModeCap,
  maxCoverableItems,
  type Band,
  type EngineState,
  type Question,
  type ResumeItem,
  type Scores,
  type TopicId,
} from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const flat = (n: number): Scores => ({
  situation: n,
  task: n,
  action: n,
  result: n,
  specificity: n,
  impact: n,
  ownership: n,
  relevance: n,
});

const WEAK = flat(1);
const MEDIOCRE = flat(2);
const GREAT = flat(4);

function item(id: string, covered = false): ResumeItem {
  return {
    id,
    kind: "role",
    label: id,
    chunkSeqs: [],
    relevanceToRole: 1,
    covered,
  };
}

function question(over: Partial<Question> = {}): Question {
  return {
    text: "Tell me about a time you worked on a team.",
    type: "opening",
    topic: "teamwork",
    difficulty: 1,
    source: "bank",
    ...over,
  };
}

function makeState(over: Partial<EngineState> = {}): EngineState {
  const base = initState({
    mode: "quick",
    topics: ["teamwork", "conflict", "leadership"] as TopicId[],
    resumeItems: [],
    firstQuestion: question(),
  });
  return { ...base, ...over };
}

const input = (
  scores: Scores,
  band: Band,
  over: Partial<StepInput> = {},
): StepInput => ({
  scores,
  band,
  primaryGap: computePrimaryGap(scores),
  ...over,
});

// ---------------------------------------------------------------------------
// classifyBand
// ---------------------------------------------------------------------------

describe("classifyBand", () => {
  it("is weak at exactly the ceiling boundary", () => {
    expect(classifyBand(flat(1.9), false)).toBe("weak");
    expect(classifyBand(flat(2), false)).toBe("mediocre");
  });

  it("is great at exactly the floor with no low dimension", () => {
    expect(classifyBand(flat(3.5), false)).toBe("great");
  });

  /**
   * The reason banding uses the STAR roll-up rather than all eight dimensions:
   * a genuinely strong answer that folds Task into Situation must still reach
   * `great`, or the weak-vs-strong demo contrast dies.
   */
  it("still reaches great when one STAR component is soft", () => {
    const scores: Scores = { ...GREAT, task: 2 };
    expect(classifyBand(scores, false)).toBe("great");
  });

  it("does not reach great when a non-STAR dimension is low", () => {
    expect(classifyBand({ ...GREAT, ownership: 2 }, false)).toBe("mediocre");
  });

  describe("off-topic gating", () => {
    it("forces weak when relevance corroborates the model", () => {
      expect(classifyBand({ ...GREAT, relevance: 1 }, true)).toBe("weak");
    });

    /**
     * Observed live: a strong answer averaging 3.60 was flagged off-topic and
     * banded weak. One model boolean must not outrank eight scores.
     */
    it("ignores an off-topic claim that relevance contradicts", () => {
      expect(classifyBand({ ...GREAT, relevance: 4 }, true)).toBe("great");
      expect(isOffTopic({ ...GREAT, relevance: 4 }, true)).toBe(false);
    });
  });

  describe("hysteresis", () => {
    it("holds mediocre when the average dips just below the ceiling", () => {
      const borderline = flat(2 - HYSTERESIS / 2);
      expect(classifyBand(borderline, false)).toBe("weak");
      expect(classifyBand(borderline, false, { previousBand: "mediocre" })).toBe(
        "mediocre",
      );
    });

    it("lets a decisive drop through", () => {
      expect(classifyBand(flat(1.5), false, { previousBand: "mediocre" })).toBe(
        "weak",
      );
    });

    it("holds great when the average dips just below the floor", () => {
      const borderline = { ...flat(3.5 - HYSTERESIS / 2) };
      expect(classifyBand(borderline, false, { previousBand: "great" })).toBe(
        "great",
      );
    });

    it("requires a real improvement to leave weak", () => {
      expect(classifyBand(flat(2.05), false, { previousBand: "weak" })).toBe(
        "weak",
      );
      expect(classifyBand(flat(2.5), false, { previousBand: "weak" })).toBe(
        "mediocre",
      );
    });

    it("never smooths away an off-topic answer", () => {
      expect(
        classifyBand({ ...flat(3), relevance: 1 }, true, {
          previousBand: "great",
        }),
      ).toBe("weak");
    });
  });

  describe("anchor downgrade", () => {
    const anchor = { simWeak: 0.9, simStrong: 0.7 };

    it("is inert by default — the demo must not depend on a threshold", () => {
      expect(classifyBand(GREAT, false, { anchor })).toBe("great");
    });

    it("downgrades when explicitly enabled", () => {
      expect(
        classifyBand(GREAT, false, { anchor, anchorDowngradeEnabled: true }),
      ).toBe("mediocre");
    });
  });
});

describe("computePrimaryGap", () => {
  it("picks the lowest dimension", () => {
    expect(computePrimaryGap({ ...flat(3), result: 1 })).toBe("result");
  });

  it("breaks ties by priority, not by key order", () => {
    expect(computePrimaryGap({ ...flat(3), situation: 1, ownership: 1 })).toBe(
      "ownership",
    );
  });
});

describe("noDimensionRose", () => {
  it("is true when nothing moved", () => {
    expect(noDimensionRose(flat(2), flat(2))).toBe(true);
  });

  it("is false when one dimension gained a full point", () => {
    expect(noDimensionRose(flat(2), { ...flat(2), result: 3 })).toBe(false);
  });

  it("ignores gains smaller than a whole point", () => {
    expect(noDimensionRose(flat(2), { ...flat(2), result: 2.5 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Topic resolution
// ---------------------------------------------------------------------------

describe("shouldResolveTopic", () => {
  it("resolves after two follow-ups", () => {
    const state = makeState({ followUpsUsed: 2, lastMove: "clarify" });
    expect(shouldResolveTopic(state, input(MEDIOCRE, "mediocre"))).toBe(true);
  });

  it("resolves on a plateau", () => {
    const state = makeState({
      followUpsUsed: 1,
      lastMove: "clarify",
      threadScores: [MEDIOCRE],
    });
    expect(shouldResolveTopic(state, input(MEDIOCRE, "mediocre"))).toBe(true);
  });

  it("does not resolve when a follow-up lifted something", () => {
    const state = makeState({
      followUpsUsed: 1,
      lastMove: "clarify",
      threadScores: [MEDIOCRE],
    });
    const improved = { ...MEDIOCRE, result: 4 };
    expect(shouldResolveTopic(state, input(improved, "mediocre"))).toBe(false);
  });

  it("resolves when a deepen landed great", () => {
    const state = makeState({
      followUpsUsed: 1,
      lastMove: "deepen",
      threadScores: [GREAT],
    });
    const better = { ...GREAT, situation: 4 };
    expect(shouldResolveTopic(state, input(better, "great"))).toBe(true);
  });

  it("resolves when a weak thread stayed weak after its clarify", () => {
    const state = makeState({
      followUpsUsed: 1,
      lastMove: "clarify",
      lastBand: "weak",
      threadScores: [WEAK],
    });
    const stillWeak = { ...WEAK, result: 2 };
    expect(shouldResolveTopic(state, input(stillWeak, "weak"))).toBe(true);
  });

  it("never resolves on the opening answer alone", () => {
    const state = makeState({ followUpsUsed: 0, lastMove: "opening" });
    expect(shouldResolveTopic(state, input(MEDIOCRE, "mediocre"))).toBe(false);
  });
});

describe("isPlateau", () => {
  it("treats a repeated answer as a plateau even if scores moved", () => {
    const state = makeState({ lastMove: "clarify", threadScores: [MEDIOCRE] });
    const better = { ...MEDIOCRE, result: 4 };
    expect(
      isPlateau(state, input(better, "mediocre", { repeatsPrevious: true })),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// step()
// ---------------------------------------------------------------------------

describe("step — move selection", () => {
  it("clarifies a weak answer, aimed at the primary gap", () => {
    const state = makeState();
    const scores = { ...MEDIOCRE, ownership: 1 };
    const result = step(state, input(scores, "weak"));
    expect(result.move).toBe("clarify");
    expect(result.next?.gap).toBe("ownership");
  });

  it("deepens a great answer", () => {
    expect(step(makeState(), input(GREAT, "great")).move).toBe("deepen");
  });

  /** The demo's guarantee, asserted directly. */
  it("always clarifies the same weak answer", () => {
    for (let i = 0; i < 20; i++) {
      expect(step(makeState(), input(WEAK, "weak")).move).toBe("clarify");
    }
  });

  it("counts a follow-up against the cap", () => {
    const result = step(makeState(), input(WEAK, "weak"));
    expect(result.state.questionCount).toBe(2);
    expect(result.state.followUpsUsed).toBe(1);
  });
});

describe("step — progression", () => {
  it("bumps difficulty only when the thread ended great", () => {
    const resolving = makeState({ followUpsUsed: 2, lastMove: "deepen" });
    expect(step(resolving, input(GREAT, "great")).state.difficulty).toBe(2);
    expect(step(resolving, input(WEAK, "weak")).state.difficulty).toBe(1);
  });

  it("caps difficulty at 3", () => {
    const state = makeState({
      difficulty: 3,
      followUpsUsed: 2,
      lastMove: "deepen",
    });
    expect(step(state, input(GREAT, "great")).state.difficulty).toBe(3);
  });

  it("advances to the next bank topic when a thread resolves", () => {
    const state = makeState({ followUpsUsed: 2, lastMove: "clarify" });
    const result = step(state, input(MEDIOCRE, "mediocre"));
    expect(result.move).toBe("opening");
    expect(result.next?.topic).toBe("conflict");
    expect(result.state.followUpsUsed).toBe(0);
    expect(result.state.threadScores).toEqual([]);
  });
});

describe("step — the cap", () => {
  it("wraps rather than issuing a follow-up it cannot finish", () => {
    const state = makeState({ questionCount: QUICK_QUESTION_CAP });
    const result = step(state, input(WEAK, "weak"));
    expect(result.move).toBe("wrap");
    expect(result.state.done).toBe(true);
    expect(result.next).toBeNull();
  });

  it("never exceeds the cap across a whole scripted session", () => {
    let state = makeState();
    for (let i = 0; i < 40 && !state.done; i++) {
      const result = step(state, input(WEAK, "weak"));
      state = result.state;
      if (result.next) {
        state = commitQuestion(state, question({ text: `q${i}` }));
      }
    }
    expect(state.questionCount).toBeLessThanOrEqual(QUICK_QUESTION_CAP);
    expect(state.done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Coverage — the promise of full mode
// ---------------------------------------------------------------------------

describe("coverage enforcement", () => {
  const items = [item("role-a"), item("role-b"), item("project-c")];

  function fullState(over: Partial<EngineState> = {}): EngineState {
    const base = initState({
      mode: "full",
      topics: ["teamwork", "conflict"] as TopicId[],
      resumeItems: items,
      firstQuestion: question(),
    });
    return { ...base, ...over };
  }

  it("sizes the cap from the resume", () => {
    expect(fullState().questionCap).toBe(fullModeCap(items.length));
  });

  it("refuses to wrap while any item is uncovered", () => {
    const state = fullState({ topicIndex: 1 });
    expect(shouldWrap(state)).toBe(false);
  });

  it("wraps once everything is covered and topics are exhausted", () => {
    const state = fullState({
      topicIndex: 1,
      resumeItems: items.map((i) => ({ ...i, covered: true })),
    });
    expect(shouldWrap(state)).toBe(true);
  });

  it("marks an item covered when its thread resolves", () => {
    const state = fullState({
      followUpsUsed: 2,
      lastMove: "clarify",
      currentQuestion: question({ source: "resume", resumeItemId: "role-a" }),
    });
    const result = step(state, input(MEDIOCRE, "mediocre"));
    expect(
      result.state.resumeItems.find((i) => i.id === "role-a")?.covered,
    ).toBe(true);
  });

  it("does not mark anything covered for a bank-led thread", () => {
    const state = fullState({ followUpsUsed: 2, lastMove: "clarify" });
    const result = step(state, input(MEDIOCRE, "mediocre"));
    expect(uncovered(result.state)).toHaveLength(items.length);
  });

  /**
   * The mode's entire promise: run a full session to completion and every
   * listed role and project must have been asked about.
   */
  it("covers every resume item before finishing", () => {
    let state = fullState();
    let guard = 0;

    while (!state.done && guard++ < 100) {
      const result = step(state, input(MEDIOCRE, "mediocre"));
      state = result.state;
      if (result.next) {
        state = commitQuestion(
          state,
          question({
            text: `q${guard}`,
            type: result.next.type,
            topic: result.next.topic,
            source: result.next.source,
            resumeItemId: result.next.resumeItem?.id,
          }),
        );
      }
    }

    expect(state.done).toBe(true);
    expect(uncovered(state)).toHaveLength(0);
    expect(state.questionCount).toBeLessThanOrEqual(state.questionCap);
  });

  it("prioritises coverage over variety when running out of room", () => {
    const state = fullState({
      questionCount: 10,
      questionCap: 12,
      lastQuestionSource: "resume",
      topicIndex: 0,
    });
    // Normally alternation would pick `bank` after a resume question.
    expect(uncovered(state).length).toBeGreaterThan(0);
    const result = step(
      { ...state, followUpsUsed: 2, lastMove: "clarify" },
      input(MEDIOCRE, "mediocre"),
    );
    if (result.move !== "wrap") expect(result.next?.source).toBe("resume");
  });

  it("quick mode may finish with items uncovered", () => {
    const state = makeState({
      resumeItems: items,
      topicIndex: 2,
      questionCount: QUICK_QUESTION_CAP,
    });
    expect(shouldWrap(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scripted sessions — the regression harness
// ---------------------------------------------------------------------------

describe("scripted sessions", () => {
  function run(band: Band, scores: Scores, mode: "quick" | "full" = "quick") {
    let state = initState({
      mode,
      topics: ["teamwork", "conflict", "leadership"] as TopicId[],
      resumeItems: [],
      firstQuestion: question(),
    });
    const moves: string[] = [];
    let guard = 0;

    while (!state.done && guard++ < 60) {
      const result = step(state, input(scores, band));
      moves.push(result.move);
      state = result.state;
      if (result.next) {
        state = commitQuestion(state, question({ text: `q${guard}` }));
      }
    }
    return { state, moves };
  }

  it("all-weak: clarifies, resolves, moves on, and stays bounded", () => {
    const { state, moves } = run("weak", WEAK);
    expect(moves).toContain("clarify");
    expect(moves).not.toContain("deepen");
    expect(state.done).toBe(true);
    expect(state.questionCount).toBeLessThanOrEqual(QUICK_QUESTION_CAP);
  });

  it("all-strong: deepens and raises difficulty", () => {
    const { state, moves } = run("great", GREAT);
    expect(moves).toContain("deepen");
    expect(moves).not.toContain("clarify");
    expect(state.difficulty).toBeGreaterThan(1);
  });

  /** The contrast the demo is built on, asserted as a property. */
  it("weak and strong answers produce different move types", () => {
    const weak = run("weak", WEAK).moves.filter((m) => m !== "opening");
    const strong = run("great", GREAT).moves.filter((m) => m !== "opening");
    expect(weak[0]).toBe("clarify");
    expect(strong[0]).toBe("deepen");
  });

  it("is deterministic — identical inputs give identical move sequences", () => {
    expect(run("weak", WEAK).moves).toEqual(run("weak", WEAK).moves);
  });

  it("makes no network calls", () => {
    // `step` is pure; if it ever gained I/O this import-time assertion is the
    // cheapest place to notice.
    expect(typeof step).toBe("function");
    expect(step.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Pacing — full mode must be able to keep its coverage promise
// ---------------------------------------------------------------------------

describe("full-mode pacing", () => {
  const BANDS: Band[][] = [
    ["mediocre"],
    ["weak"],
    ["great"],
    ["weak", "mediocre", "great"],
    ["great", "weak", "weak", "mediocre"],
  ];

  function manyItems(n: number): ResumeItem[] {
    return Array.from({ length: n }, (_, i) => ({
      ...item(`item-${i}`),
      relevanceToRole: 1 - i * 0.05,
    }));
  }

  /** Drives a full session; returns the state it finished in. */
  function runFull(itemCount: number, bands: Band[]): EngineState {
    let state = initState({
      mode: "full",
      topics: ["teamwork", "conflict", "leadership"] as TopicId[],
      resumeItems: manyItems(itemCount),
      firstQuestion: question(),
    });

    for (let i = 0; i < 300 && !state.done; i++) {
      const band = bands[i % bands.length];
      const scores = band === "weak" ? WEAK : band === "great" ? GREAT : MEDIOCRE;
      const result = step(state, input(scores, band));
      state = result.state;
      if (result.next) {
        state = commitQuestion(
          state,
          question({
            text: `q${i}`,
            type: result.next.type,
            topic: result.next.topic,
            source: result.next.source,
            resumeItemId: result.next.resumeItem?.id,
          }),
        );
      }
    }
    return state;
  }

  /**
   * The regression this whole section exists for. Six items previously needed
   * 36 turns against a cap of 16, and anything past the bank topic count was
   * never covered at all because running out of VARIETY ended the interview.
   */
  it.each([1, 2, 3, 4, 6, 8, 10])(
    "covers all %i items within the cap, whatever the answers",
    (count) => {
      for (const bands of BANDS) {
        const state = runFull(count, bands);
        expect(state.done).toBe(true);
        expect(uncovered(state)).toHaveLength(0);
        expect(state.questionCount).toBeLessThanOrEqual(state.questionCap);
      }
    },
  );

  it("covers more items than there are bank topics", () => {
    // Three topics, eight items: the old policy wrapped at the third topic.
    const state = runFull(8, ["mediocre"]);
    expect(uncovered(state)).toHaveLength(0);
  });

  it("trims an over-long resume rather than reporting uncoverable items", () => {
    const state = initState({
      mode: "full",
      topics: ["teamwork"] as TopicId[],
      resumeItems: manyItems(40),
      firstQuestion: question(),
    });
    expect(state.resumeItems).toHaveLength(maxCoverableItems());
    // Trimmed by rank, so the most relevant survive.
    expect(state.resumeItems[0].id).toBe("item-0");
  });

  it("keeps every item in quick mode, which makes no coverage promise", () => {
    const state = initState({
      mode: "quick",
      topics: ["teamwork"] as TopicId[],
      resumeItems: manyItems(40),
      firstQuestion: question(),
    });
    expect(state.resumeItems).toHaveLength(40);
  });

  it("caps full-mode resume threads at one follow-up", () => {
    const state = makeState({
      mode: "full",
      followUpsUsed: 1,
      lastMove: "clarify",
      currentQuestion: question({ source: "resume", resumeItemId: "a" }),
    });
    expect(maxFollowUpsFor(state)).toBe(1);
    // An improving answer would otherwise earn a second follow-up.
    const better = { ...MEDIOCRE, result: 4 };
    expect(shouldResolveTopic(state, input(better, "mediocre"))).toBe(true);
  });

  it("still allows two follow-ups on a bank thread", () => {
    const state = makeState({
      mode: "full",
      followUpsUsed: 1,
      lastMove: "clarify",
      threadScores: [MEDIOCRE],
      currentQuestion: question({ source: "bank" }),
    });
    expect(maxFollowUpsFor(state)).toBe(2);
    const better = { ...MEDIOCRE, result: 4 };
    expect(shouldResolveTopic(state, input(better, "mediocre"))).toBe(false);
  });

  it("spends only a fixed bank budget before switching to coverage", () => {
    const state = makeState({
      mode: "full",
      topics: ["teamwork", "conflict", "leadership", "pressure"] as TopicId[],
      topicIndex: FULL_BANK_THREADS - 1,
      resumeItems: manyItems(4),
      lastQuestionSource: "resume",
    });
    // Alternation alone would say bank here; the budget is spent.
    expect(nextSource(state)).toBe("resume");
  });

  it("cap always exceeds the measured worst case", () => {
    for (const count of [1, 2, 3, 4, 6, 8, 10]) {
      for (const bands of BANDS) {
        const state = runFull(count, bands);
        expect(state.questionCount).toBeLessThanOrEqual(fullModeCap(count));
      }
    }
  });
});
