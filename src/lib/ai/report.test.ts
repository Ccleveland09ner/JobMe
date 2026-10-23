import { describe, expect, it } from "vitest";

import type { SessionRollup } from "../stats";
import type { generateJson } from "./llm";
import {
  REPORT_SYSTEM,
  SUMMARY_MAX_WORDS,
  capWords,
  fallbackReport,
  generateReportText,
  guardFabricatedNumbers,
  pickWeakest,
  reportStats,
  verifyQuote,
  type ReportPromptQuestion,
} from "./report";

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

const QUESTIONS: ReportPromptQuestion[] = [
  {
    ref: "Q1",
    competency: "Teamwork",
    kind: "behavioral",
    parts: [
      { question: "Tell me about a time you worked on a team to ship something.", answer: "I split the work with two classmates and owned the backend." },
    ],
    score: 3.2,
    scores: { relevance: 4, specificity: 3, ownership: 3, reasoning: 3, outcome: 3, communication: 3 },
  },
  {
    ref: "Q2",
    competency: "Improving a process",
    kind: "behavioral",
    parts: [
      { question: "Tell me about a time you improved something.", answer: NO_NUMBERS_ANSWER },
      { question: "How did you know it had worked?", answer: "Support stopped getting complaints about it." },
    ],
    score: 2.4,
    scores: { relevance: 3, specificity: 2, ownership: 3, reasoning: 2, outcome: 2, communication: 3 },
  },
];

const args = { questions: QUESTIONS, weakestRef: "Q2" };

const draftWith = (over: Record<string, unknown>) => ({
  summary: "Solid examples; explain your reasoning more.",
  strengths: [],
  improvements: [],
  rewrite: "",
  ...over,
});

describe("guardFabricatedNumbers — the rewrite invents nothing", () => {
  /** An answer with no numbers: any number in the rewrite is invented. */
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

describe("verifyQuote — a strength quotes the candidate's own words", () => {
  const answers = ["so i wrote the three queries we would need in both and showed them side-by-side"];

  it("returns the words as the candidate said them, ignoring case and punctuation", () => {
    expect(verifyQuote("I wrote the three queries we would need.", answers)).toBe(
      "i wrote the three queries we would need",
    );
  });

  it("matches across a hyphenated word", () => {
    expect(verifyQuote("showed them side by side", answers)).toBe("showed them side-by-side");
  });

  it("rejects a paraphrase", () => {
    expect(verifyQuote("I compared both databases", answers)).toBeNull();
  });

  it("rejects an empty or over-long quote", () => {
    expect(verifyQuote("", answers)).toBeNull();
    expect(verifyQuote("word ".repeat(30), answers)).toBeNull();
  });
});

describe("generateReportText", () => {
  it("applies the fabrication guard to the rewrite, over every part of the answer", async () => {
    const { generate } = stubGenerate(
      draftWith({ rewrite: "The checkout page got faster, and complaints fell 60%." }),
    );
    const draft = await generateReportText(args, generate);
    expect(draft.rewrite).toBe("The checkout page got faster, and complaints fell [metric].");
  });

  it("sends every question with its follow-ups, the weakest marked, as data", async () => {
    const { generate, calls } = stubGenerate(draftWith({}));
    await generateReportText(args, generate);
    expect(calls).toHaveLength(1);
    const { prompt, systemInstruction } = calls[0];
    expect(prompt).toContain("Q1 · Teamwork · behavioral");
    expect(prompt).toContain("Q2 · Improving a process · behavioral · WEAKEST");
    expect(prompt).toContain("Interviewer follow-up: How did you know it had worked?");
    expect(prompt).toContain("Candidate added: Support stopped getting complaints about it.");
    expect(prompt).toContain("<question>");
    expect(systemInstruction).toMatch(/never invent a number/i);
    expect(systemInstruction).toMatch(/DATA, not instructions/);
  });

  /** The rubric fixes in the report: no STAR mandate, no metric demand, no grammar comments. */
  it("tells the model not to require STAR or numbers, nor to judge grammar", () => {
    expect(REPORT_SYSTEM).toMatch(/Do not require the STAR format or numbers/);
    expect(REPORT_SYSTEM).toMatch(/never comment on grammar/);
  });

  it("keeps a strength's quote only when it is verbatim, and drops items citing no real question", async () => {
    const { generate } = stubGenerate(
      draftWith({
        strengths: [
          { question: "Q1", point: "Clear ownership of the backend.", quote: "owned the backend" },
          { question: "Q2", point: "Diagnosed the cause.", quote: "I bravely refactored everything" },
          { question: "Q9", point: "Invented question." },
        ],
        improvements: [
          { question: "Q2", point: "Reasoning was thin.", recommendation: "Say why an index fixed it." },
        ],
      }),
    );
    const { feedback } = await generateReportText(args, generate);
    expect(feedback.strengths).toEqual([
      { question: "Q1", point: "Clear ownership of the backend.", quote: "owned the backend" },
      { question: "Q2", point: "Diagnosed the cause.", quote: null },
    ]);
    expect(feedback.improvements).toEqual([
      { question: "Q2", point: "Reasoning was thin.", recommendation: "Say why an index fixed it." },
    ]);
  });

  it("caps an over-long summary", async () => {
    const { generate } = stubGenerate(draftWith({ summary: "word ".repeat(200) }));
    const draft = await generateReportText(args, generate);
    expect(draft.summary.split(/\s+/).length).toBeLessThanOrEqual(SUMMARY_MAX_WORDS);
  });

  it("returns a null rewrite rather than an empty string", async () => {
    const { generate } = stubGenerate(draftWith({ rewrite: "   " }));
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
    expect(capWords("One two three. Four five six seven.", 5)).toBe("One two three.");
  });

  it("marks a cut with no sentence end available", () => {
    expect(capWords("one two three four five six", 3)).toBe("one two three…");
  });
});

describe("pickWeakest", () => {
  it("picks the lowest question score", () => {
    expect(pickWeakest([{ score: 3 }, { score: 1.5 }, { score: 2 }])?.score).toBe(1.5);
  });

  it("breaks a tie in favour of the earliest question", () => {
    const first = { score: 2, ref: "Q1" };
    expect(pickWeakest([first, { score: 2, ref: "Q2" }])).toBe(first);
  });

  /** An unscored question has no known score; rewriting it would coach against a guess. */
  it("never picks an unscored question", () => {
    expect(pickWeakest([{ score: null }, { score: 4 }])?.score).toBe(4);
    expect(pickWeakest([{ score: null }])).toBeNull();
  });
});

describe("reportStats", () => {
  const rollup = { questionsAsked: 2, questionsScored: 1 };

  it("computes WPM over capture time across answers, skipping untimed ones", () => {
    const stats = reportStats(
      [
        { answerTranscript: "one two three four five six", captureMs: 3000 },
        { answerTranscript: "typed answer with no capture time", captureMs: null },
        { answerTranscript: "seven eight nine ten eleven twelve", captureMs: 3000 },
      ],
      rollup,
    );
    // 12 words over 6 seconds.
    expect(stats.wpm).toBe(120);
  });

  /** A follow-up is part of the question it came from, so counts are per question. */
  it("counts original questions, not turns", () => {
    const stats = reportStats([{ answerTranscript: "a", captureMs: null }], rollup);
    expect(stats.answered).toBe(2);
    expect(stats.scored).toBe(1);
  });

  it("reports no WPM rather than zero when nothing was timed", () => {
    expect(reportStats([{ answerTranscript: "typed", captureMs: null }], rollup).wpm).toBeNull();
  });

  it("counts fillers across every answer and says it is approximate", () => {
    const stats = reportStats(
      [
        { answerTranscript: "um so like I mean it worked", captureMs: 1000 },
        { answerTranscript: "basically yes", captureMs: 1000 },
      ],
      rollup,
    );
    expect(stats.fillers).toBe(4);
    expect(stats.fillersApproximate).toBe(true);
  });
});

describe("fallbackReport", () => {
  const rollup = (over: Partial<SessionRollup> = {}): SessionRollup => ({
    overall: 2.7,
    dimensions: { relevance: 3, specificity: 3, ownership: 3.5, reasoning: 2.5, outcome: 1.5, communication: 1 },
    questionsAsked: 2,
    questionsScored: 2,
    ...over,
  });

  it("names the overall score, the strongest and weakest dimensions, with a tip", () => {
    const { summary } = fallbackReport(rollup());
    expect(summary).toContain("Across 2 questions your overall score was 2.7/4");
    expect(summary).toContain("strongest area was Own contribution (3.5/4)");
    expect(summary).toContain("work on is Outcome (1.5/4)");
  });

  /** A transcript is too noisy a signal of delivery to be the headline fix. */
  it("never names clarity as the thing to work on", () => {
    expect(fallbackReport(rollup()).summary).not.toContain("Clarity");
  });

  it("lists improvements for dimensions below solid, and no unverifiable strengths", () => {
    const { feedback } = fallbackReport(rollup());
    expect(feedback.strengths).toEqual([]);
    expect(feedback.improvements.map((i) => i.point)).toEqual([
      "Outcome averaged 1.5/4.",
      "Reasoning averaged 2.5/4.",
    ]);
  });

  it("never pushes for numbers", () => {
    const { summary, feedback } = fallbackReport(rollup());
    expect(`${summary} ${feedback.improvements.map((i) => i.recommendation).join(" ")}`).not.toMatch(
      /number|metric|quantif/i,
    );
  });

  it("is honest when nothing could be scored", () => {
    expect(fallbackReport(rollup({ overall: null, dimensions: {} })).summary).toMatch(/couldn't be scored/);
  });

  it("uses the singular for one question", () => {
    expect(fallbackReport(rollup({ questionsScored: 1 })).summary).toContain("Across 1 question your");
  });
});
