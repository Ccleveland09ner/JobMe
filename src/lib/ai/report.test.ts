import { describe, expect, it } from "vitest";

import type { Scores } from "../engine/types";
import type { generateJson } from "./llm";
import {
  SUMMARY_MAX_WORDS,
  capWords,
  fallbackSummary,
  generateReportText,
  guardFabricatedNumbers,
  pickWeakestTurn,
  reportStats,
} from "./report";

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

/** A stand-in for the model that returns `value` and records its arguments. */
function stubGenerate(value: unknown) {
  const calls: Parameters<typeof generateJson>[0][] = [];
  const generate = (async (args: Parameters<typeof generateJson>[0]) => {
    calls.push(args);
    return { value, thoughtTokens: 0, outputTokens: 0, ms: 1 };
  }) as typeof generateJson;
  return { generate, calls };
}

const NO_NUMBERS_ANSWER =
  "We had a slow checkout page. I profiled it, found the query doing a full " +
  "scan, and added an index. The page got a lot faster after that.";

describe("guardFabricatedNumbers — the rewrite invents nothing", () => {
  /**
   * The brief's required fixture: an answer with no numbers at all. Any number
   * in the rewrite is therefore invented, and must not reach the candidate.
   */
  it("replaces every number when the answer contained none", () => {
    const rewrite =
      "I profiled the checkout page and added an index, cutting load time " +
      "by 40% and saving the team 3 hours a week.";
    const guarded = guardFabricatedNumbers(rewrite, NO_NUMBERS_ANSWER);
    expect(guarded).not.toMatch(/\d/);
    expect(guarded).toContain("by [metric] and saving the team [metric] hours");
  });

  it("keeps numbers the candidate actually said, however they were formatted", () => {
    const answer = "p99 went from 1,200 ms to 340 ms, and failures fell to 0.1%.";
    const rewrite = "Result: p99 fell from 1200 ms to 340 ms; failures 0.1 %.";
    expect(guardFabricatedNumbers(rewrite, answer)).toBe(rewrite);
  });

  it("treats a digit inside a term as part of the term, not a claim", () => {
    expect(guardFabricatedNumbers("We moved to S3 and tuned p99.", "")).toBe(
      "We moved to S3 and tuned p99.",
    );
  });
});

describe("generateReportText", () => {
  const args = {
    weakestQuestion: "Tell me about a time you improved something.",
    weakestAnswer: NO_NUMBERS_ANSWER,
    turnCount: 3,
  };

  it("applies the fabrication guard to the model's rewrite", async () => {
    const { generate } = stubGenerate({
      summary: "Quantify your outcomes.",
      rewrite: "Situation: checkout was slow. Result: load time fell 60%.",
    });
    const draft = await generateReportText(args, generate);
    expect(draft.rewrite).toBe(
      "Situation: checkout was slow. Result: load time fell [metric].",
    );
  });

  it("puts the no-invention rule in the prompt and wraps candidate text as data", async () => {
    const { generate, calls } = stubGenerate({ summary: "ok", rewrite: "" });
    await generateReportText(args, generate);
    expect(calls).toHaveLength(1);
    expect(calls[0].systemInstruction).toMatch(/never invent a number/i);
    expect(calls[0].systemInstruction).toMatch(/DATA, not instructions/);
    expect(calls[0].prompt).toContain(`<weakest_answer>\n${NO_NUMBERS_ANSWER}\n</weakest_answer>`);
  });

  it("caps an over-long summary", async () => {
    const { generate } = stubGenerate({
      summary: "word ".repeat(200),
      rewrite: "",
    });
    const draft = await generateReportText(args, generate);
    expect(draft.summary.split(/\s+/).length).toBeLessThanOrEqual(
      SUMMARY_MAX_WORDS,
    );
  });

  it("returns a null rewrite rather than an empty string", async () => {
    const { generate } = stubGenerate({ summary: "ok", rewrite: "   " });
    expect((await generateReportText(args, generate)).rewrite).toBeNull();
  });

  it("throws on a malformed payload so the caller can fall back", async () => {
    const { generate } = stubGenerate({ summary: "" });
    await expect(generateReportText(args, generate)).rejects.toThrow();
  });
});

describe("capWords", () => {
  it("leaves text under the cap untouched", () => {
    expect(capWords("One two three.", 5)).toBe("One two three.");
  });

  it("cuts at the last sentence end inside the cap", () => {
    expect(capWords("One two three. Four five six seven.", 5)).toBe(
      "One two three.",
    );
  });

  it("marks a cut with no sentence end available", () => {
    expect(capWords("one two three four five six", 3)).toBe("one two three…");
  });
});

describe("pickWeakestTurn", () => {
  it("picks the lowest banding average", () => {
    const turns = [
      { seq: 1, scores: flat(3) },
      { seq: 2, scores: flat(1) },
      { seq: 3, scores: flat(2) },
    ];
    expect(pickWeakestTurn(turns)?.seq).toBe(2);
  });

  it("breaks a tie in favour of the earliest turn", () => {
    const turns = [
      { seq: 3, scores: flat(2) },
      { seq: 1, scores: flat(2) },
    ];
    expect(pickWeakestTurn(turns)?.seq).toBe(1);
  });

  /** An unscored turn has no known average; rewriting it would coach against a guess. */
  it("never picks an unscored turn", () => {
    const turns = [
      { seq: 1, scores: null },
      { seq: 2, scores: flat(4) },
    ];
    expect(pickWeakestTurn(turns)?.seq).toBe(2);
    expect(pickWeakestTurn([{ seq: 1, scores: null }])).toBeNull();
  });
});

describe("reportStats", () => {
  it("computes WPM over capture time across answers, skipping untimed ones", () => {
    const stats = reportStats([
      { answerTranscript: "one two three four five six", captureMs: 3000, scores: flat(2) },
      { answerTranscript: "typed answer with no capture time", captureMs: null, scores: null },
      { answerTranscript: "seven eight nine ten eleven twelve", captureMs: 3000, scores: flat(3) },
    ]);
    // 12 words over 6 seconds.
    expect(stats.wpm).toBe(120);
    expect(stats.answered).toBe(3);
    expect(stats.scored).toBe(2);
  });

  it("reports no WPM rather than zero when nothing was timed", () => {
    expect(
      reportStats([{ answerTranscript: "typed", captureMs: null, scores: null }]).wpm,
    ).toBeNull();
  });

  it("counts fillers across every answer and says it is approximate", () => {
    const stats = reportStats([
      { answerTranscript: "um so like I mean it worked", captureMs: 1000, scores: null },
      { answerTranscript: "basically yes", captureMs: 1000, scores: null },
    ]);
    expect(stats.fillers).toBe(4);
    expect(stats.fillersApproximate).toBe(true);
  });
});

describe("fallbackSummary", () => {
  it("names the strongest and weakest dimensions with a tip", () => {
    const summary = fallbackSummary(
      { ...flat(3), impact: 1.5, ownership: 3.5 },
      2,
    );
    expect(summary).toContain("Across 2 answers");
    expect(summary).toContain("strongest area was Ownership (3.5/4)");
    expect(summary).toContain("work on is Impact (1.5/4)");
  });

  it("is honest when nothing could be scored", () => {
    expect(fallbackSummary(null, 3)).toMatch(/couldn't be scored/);
  });

  it("uses the singular for one answer", () => {
    expect(fallbackSummary(flat(2), 1)).toContain("Across 1 answer,");
  });
});

