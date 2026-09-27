import { describe, expect, it } from "vitest";

import { extractEvidence, validateEvaluation, EvalError } from "./evaluate";
import {
  checkDraft,
  chooseQuestionText,
  hasProperNoun,
  heuristicGap,
  heuristicScores,
  preClassify,
  repairDraft,
} from "./questions";

const VALID = {
  scores: {
    situation: 3,
    task: 2,
    action: 3,
    result: 1,
    specificity: 2,
    impact: 1,
    ownership: 1,
    relevance: 4,
  },
  observation: "Says we throughout; own role unclear",
  off_topic: false,
  repeats_previous: false,
  drafts: {
    deepen: "What trade-off did you weigh when you chose that approach?",
    clarify: "You said the team fixed it. What did you change?",
  },
};

describe("validateEvaluation", () => {
  it("accepts a well-formed payload", () => {
    expect(validateEvaluation(VALID).scores.impact).toBe(1);
  });

  it.each([
    ["null", null],
    ["missing scores", { ...VALID, scores: undefined }],
    ["a score out of range", { ...VALID, scores: { ...VALID.scores, impact: 7 } }],
    ["a non-integer score", { ...VALID, scores: { ...VALID.scores, impact: 2.5 } }],
    ["a missing draft", { ...VALID, drafts: { deepen: "x?" } }],
  ])("rejects %s", (_label, payload) => {
    expect(() => validateEvaluation(payload)).toThrow(EvalError);
  });

  it("truncates an over-long observation rather than failing the turn", () => {
    const long = { ...VALID, observation: "x".repeat(200) };
    expect(validateEvaluation(long).observation).toHaveLength(90);
  });
});

describe("extractEvidence", () => {
  const ANSWER =
    "We had a problem with the checkout service. " +
    "I rewrote the conflict detection to bucket by day, which cut p99 from 1200ms to 340ms. " +
    "The team was happy about it.";

  /**
   * The verbatim guarantee is what makes the scorecard's highlight reliable —
   * the tech design has a whole fallback path for when the quote cannot be
   * found in the transcript. Computing it locally removes that failure mode.
   */
  it("returns an exact substring of the answer", () => {
    expect(ANSWER).toContain(extractEvidence(ANSWER));
  });

  it("prefers the sentence with numbers and first-person ownership", () => {
    expect(extractEvidence(ANSWER)).toContain("I rewrote");
  });

  it("respects the word cap while staying verbatim", () => {
    const quote = extractEvidence(ANSWER, 6);
    expect(quote.split(/\s+/)).toHaveLength(6);
    expect(ANSWER).toContain(quote);
  });

  it("handles an answer with no sentence breaks", () => {
    const short = "we just fixed it together somehow";
    expect(short).toContain(extractEvidence(short));
  });

  it("handles an empty answer without throwing", () => {
    expect(() => extractEvidence("")).not.toThrow();
  });
});

describe("checkDraft", () => {
  it("accepts a well-formed follow-up", () => {
    expect(checkDraft("What did you change in the scheduler?").ok).toBe(true);
  });

  it.each([
    ["empty", "   ", "empty"],
    ["a statement", "Tell me more about that.", "not_a_question"],
    [
      "two questions",
      "What did you do? And why did you do it that way instead?",
      "multi_question",
    ],
    [
      "a leaked redaction placeholder",
      "What did [CANDIDATE] change about the scheduler?",
      "placeholder_leak",
    ],
  ])("rejects %s", (_label, draft, reason) => {
    expect(checkDraft(draft)).toMatchObject({ ok: false, reason });
  });

  it("rejects a draft over the word cap", () => {
    const long = `${"word ".repeat(30)}?`;
    expect(checkDraft(long).reason).toBe("too_long");
  });

  it("rejects a question already asked", () => {
    const q = "What did you change?";
    expect(checkDraft(q, [q]).reason).toBe("repeat");
  });
});

describe("chooseQuestionText", () => {
  const seeds = ["What did you personally change?"];

  it("uses a valid draft", () => {
    const r = chooseQuestionText({ draft: "What did you change?", seeds });
    expect(r).toMatchObject({ source: "draft" });
  });

  it("falls back to a bank seed when the draft is unusable", () => {
    const r = chooseQuestionText({ draft: "Tell me more.", seeds });
    expect(r).toMatchObject({ source: "seed", rejected: "not_a_question" });
    expect(r.text).toBe(seeds[0]);
  });

  it("repairs rather than going silent when there is no seed", () => {
    const r = chooseQuestionText({ draft: "Tell me more.", seeds: [] });
    expect(r.text).toBe("Tell me more?");
    expect(r.source).toBe("draft");
  });

  it("avoids a seed already used when another is available", () => {
    const r = chooseQuestionText({
      draft: undefined,
      seeds: ["A?", "B?"],
      askedQuestions: ["A?"],
    });
    expect(r.text).toBe("B?");
  });

  it("throws only when there is genuinely nothing to ask", () => {
    expect(() => chooseQuestionText({ draft: undefined, seeds: [] })).toThrow();
  });
});

describe("repairDraft", () => {
  it("adds a question mark", () => {
    expect(repairDraft("What did you change")).toBe("What did you change?");
  });

  it("does not double up punctuation", () => {
    expect(repairDraft("What did you change.")).toBe("What did you change?");
  });
});

describe("preClassify — demo insurance", () => {
  /**
   * The scripted weak answer from the demo script. It MUST land weak without
   * the model getting a vote, or the weak-vs-strong contrast on stage becomes
   * a coin flip.
   */
  it("forces weak for the scripted weak answer", () => {
    expect(preClassify("We worked as a team and fixed the bug.")).toBe("weak");
  });

  it("forces weak for anything under the word floor", () => {
    expect(preClassify("I did the thing and it worked out well enough.")).toBe(
      "weak",
    );
  });

  it("forces weak for a long answer with no concrete anchor", () => {
    const vague =
      "we worked really well as a group and everyone contributed their part " +
      "and it all came together in the end which was good for everyone " +
      "involved and we learned a lot from the whole process overall too";
    expect(preClassify(vague)).toBe("weak");
  });

  /**
   * The regression that motivated `hasProperNoun`: the obvious regex matches
   * the word after a full stop, which is sentence-initial, so any
   * multi-sentence answer looked like it named something and the
   * pre-classifier silently stopped firing.
   */
  it("does not treat a sentence-initial capital as naming something", () => {
    expect(
      hasProperNoun("we shipped it on time. The team was happy about that."),
    ).toBe(false);
  });

  it("recognises an actual named system mid-sentence", () => {
    expect(hasProperNoun("I rewrote the scheduler in Kubernetes.")).toBe(true);
    expect(hasProperNoun("we migrated to AWS last spring")).toBe(true);
  });

  it("defers to the model when the answer has substance", () => {
    const strong =
      "I rewrote the conflict detection in the Scheduler service because it " +
      "was quadratic over section pairs, bucketing by day first, which cut " +
      "p99 from 1200ms to 340ms and let us ship on time for the demo day.";
    expect(preClassify(strong)).toBeNull();
  });
});

describe("heuristicScores — degraded turn", () => {
  it("stays inside the rubric range for any input", () => {
    for (const answer of ["", "short", "x ".repeat(500)]) {
      const scores = heuristicScores(answer);
      for (const v of Object.values(scores)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(4);
      }
    }
  });

  it("credits a number as impact evidence", () => {
    expect(heuristicScores("I cut latency by 40% last quarter").impact).toBe(3);
  });

  it("scores ownership lower when the answer hides behind we", () => {
    const mine = heuristicScores("I rebuilt the pipeline myself").ownership;
    const ours = heuristicScores("we rebuilt the pipeline as a team").ownership;
    expect(mine).toBeGreaterThan(ours);
  });

  it("picks the lowest dimension, tie-broken by priority", () => {
    expect(
      heuristicGap({
        situation: 3,
        task: 3,
        action: 3,
        result: 3,
        specificity: 3,
        impact: 1,
        ownership: 1,
        relevance: 3,
      }),
    ).toBe("ownership");
  });

  it("chases the missing STAR component when that is the weakest part", () => {
    expect(
      heuristicGap({
        situation: 4,
        task: 4,
        action: 4,
        result: 1,
        specificity: 3,
        impact: 3,
        ownership: 3,
        relevance: 4,
      }),
    ).toBe("result");
  });

  it("credits an explicitly stated responsibility as Task", () => {
    expect(heuristicScores("I was responsible for the billing service").task)
      .toBeGreaterThan(heuristicScores("we shipped the billing service").task);
  });

  it("credits a number as Result evidence", () => {
    expect(heuristicScores("it cut errors by 40%").result).toBeGreaterThan(
      heuristicScores("it went well in the end").result,
    );
  });
});
