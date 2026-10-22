import { describe, expect, it } from "vitest";

import { extractEvidence, validateEvaluation, EvalError } from "./evaluate";
import {
  checkDraft,
  chooseQuestionText,
  heuristicGap,
  heuristicScores,
  preClassify,
  repairDraft,
} from "./questions";

const VALID = {
  scores: {
    relevance: 4,
    specificity: 2,
    ownership: 1,
    reasoning: 3,
    outcome: 1,
    communication: 3,
  },
  status: "incomplete",
  observation: "Says we throughout; own role unclear",
  clarify_gap: "ownership",
  repeats_previous: false,
  drafts: {
    deepen: "What trade-off did you weigh when you chose that approach?",
    clarify: "You said the team fixed it. What did you change?",
  },
};

describe("validateEvaluation", () => {
  it("accepts a well-formed payload", () => {
    const v = validateEvaluation(VALID, "behavioral");
    expect(v.scores.outcome).toBe(1);
    expect(v.status).toBe("incomplete");
    expect(v.clarify_gap).toBe("ownership");
  });

  it.each([
    ["null", null],
    ["missing scores", { ...VALID, scores: undefined }],
    ["a score out of range", { ...VALID, scores: { ...VALID.scores, outcome: 7 } }],
    ["a non-integer score", { ...VALID, scores: { ...VALID.scores, outcome: 2.5 } }],
    ["a missing dimension of the kind", { ...VALID, scores: { ...VALID.scores, reasoning: undefined } }],
    ["a missing draft", { ...VALID, drafts: { deepen: "x?" } }],
  ])("rejects %s", (_label, payload) => {
    expect(() => validateEvaluation(payload, "behavioral")).toThrow(EvalError);
  });

  it("truncates an over-long observation rather than failing the turn", () => {
    const long = { ...VALID, observation: "x".repeat(200) };
    expect(validateEvaluation(long, "behavioral").observation).toHaveLength(90);
  });

  /** A stray key must not reach a weighted score or the notepad. */
  it("keeps only the dimensions the kind is scored on", () => {
    const technical = {
      ...VALID,
      scores: { relevance: 3, accuracy: 2, reasoning: 3, specificity: 3, communication: 3, ownership: 1 },
      clarify_gap: "accuracy",
    };
    const v = validateEvaluation(technical, "technical");
    expect(Object.keys(v.scores).sort()).toEqual(
      ["accuracy", "communication", "reasoning", "relevance", "specificity"],
    );
    expect(v.scores.ownership).toBeUndefined();
  });

  it("drops a clarify gap the kind cannot chase", () => {
    expect(validateEvaluation({ ...VALID, clarify_gap: "accuracy" }, "behavioral").clarify_gap).toBeNull();
    expect(validateEvaluation({ ...VALID, clarify_gap: "communication" }, "behavioral").clarify_gap).toBeNull();
  });

  it("derives off_topic from the status, and tolerates an unknown status", () => {
    expect(validateEvaluation({ ...VALID, status: "off_topic" }, "behavioral").off_topic).toBe(true);
    const unknown = validateEvaluation({ ...VALID, status: "bogus" }, "behavioral");
    expect(unknown.status).toBe("complete");
    expect(unknown.off_topic).toBe(false);
  });
});

describe("extractEvidence", () => {
  const ANSWER =
    "We had a problem with the checkout service. " +
    "I rewrote the conflict detection to bucket by day, which cut p99 from 1200ms to 340ms. " +
    "The team was happy about it.";

  /** Evidence is always a verbatim substring, so the scorecard highlight is reliable. */
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
  /** The demo's scripted weak answer must land weak without the model. */
  it("forces weak for the scripted weak answer", () => {
    expect(preClassify("We worked as a team and fixed the bug.")).toBe("weak");
  });

  it("forces weak for an opening under the word floor", () => {
    expect(preClassify("I did the thing and it worked out well enough.")).toBe(
      "weak",
    );
  });

  /**
   * The rule this replaced forced `weak` on any answer with no digit and no
   * mid-sentence capital. Chrome's recogniser returns lowercase text without
   * punctuation, so it overrode the model on nearly every voice answer —
   * measured on the calibration fixtures, including one the model scored 4/4.
   */
  it("defers to the model on an unpunctuated, lowercase voice transcript", () => {
    const voice =
      "so last semester in my software class my group wanted a nosql database " +
      "but i thought our data was really relational so i wrote the queries we " +
      "would need in both and showed them side by side and they agreed to switch";
    expect(preClassify(voice)).toBeNull();
  });

  it("defers to the model on a qualitative story with no numbers or names", () => {
    const qualitative =
      "The officers liked the paper form because it was what they had always " +
      "used, so instead of arguing I sat at the sign-up table for an afternoon " +
      "and wrote down every problem I saw, then brought that list to the next meeting.";
    expect(preClassify(qualitative)).toBeNull();
  });

  /**
   * A follow-up reply adds to the original answer; short is what was asked
   * for. The 25-word floor this replaced banded focused replies weak.
   */
  it("never forces a band on a follow-up reply, however short", () => {
    expect(preClassify("It shipped on time and the team kept my setup.", "clarify")).toBeNull();
    expect(preClassify("Mostly the trade-off on cost.", "deepen")).toBeNull();
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

  it("scores only the dimensions the kind uses", () => {
    expect(Object.keys(heuristicScores("anything at all here", "technical")).sort()).toEqual(
      ["accuracy", "communication", "reasoning", "relevance", "specificity"],
    );
  });

  it("scores ownership lower when there is no first person", () => {
    const mine = heuristicScores("I rebuilt the pipeline myself").ownership!;
    const ours = heuristicScores("we rebuilt the pipeline as a team").ownership!;
    expect(mine).toBeGreaterThan(ours);
  });

  it("credits a stated reason as reasoning evidence", () => {
    expect(heuristicScores("I chose it because the data was relational").reasoning!)
      .toBeGreaterThan(heuristicScores("I chose it").reasoning!);
  });

  it("picks the lowest dimension, tie-broken by priority", () => {
    expect(
      heuristicGap(
        { relevance: 3, specificity: 3, ownership: 1, reasoning: 3, outcome: 1, communication: 3 },
        "behavioral",
      ),
    ).toBe("ownership");
  });

  it("never picks communication, which no follow-up chases", () => {
    expect(
      heuristicGap(
        { relevance: 4, specificity: 4, ownership: 4, reasoning: 4, outcome: 3, communication: 1 },
        "behavioral",
      ),
    ).toBe("outcome");
  });
});

describe("already asked", () => {
  // One test everywhere: case, punctuation and spacing don't make a new question.
  it("is caught whatever the case, punctuation or spacing", () => {
    expect(checkDraft("What did  you change , yourself?", ["what did you change yourself?"])).toEqual({ ok: false, reason: "repeat" });
  });

  it("moves on to an unused seed rather than repeating one", () => {
    const chosen = chooseQuestionText({
      draft: undefined,
      seeds: ["What did you change yourself?", "How did you know it worked?"],
      askedQuestions: ["what did you change YOURSELF"],
    });
    expect(chosen).toMatchObject({ text: "How did you know it worked?", source: "seed" });
  });
});
