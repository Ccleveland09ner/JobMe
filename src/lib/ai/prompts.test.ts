import { describe, expect, it } from "vitest";

import { QUESTION_KINDS, dimensionsFor } from "../engine/types";
import { ASKED_IN_PROMPT, buildTurnPrompt, evaluatorSystemFor } from "./prompts";

describe("evaluatorSystemFor — the rubric each kind is scored on", () => {
  it("lists exactly the kind's dimensions", () => {
    const all = ["RELEVANCE", "SPECIFICITY", "OWNERSHIP", "REASONING", "OUTCOME", "ACCURACY", "COMMUNICATION"];
    for (const kind of QUESTION_KINDS) {
      const system = evaluatorSystemFor(kind, "opening");
      const expected = dimensionsFor(kind).map((d) => d.toUpperCase());
      for (const dim of all) {
        const listed = new RegExp(`^${dim} \\(`, "m").test(system);
        expect(listed, `${kind} ${dim}`).toBe(expected.includes(dim));
      }
    }
  });

  /** The defects the audit found in the old rubric, each closed explicitly. */
  it("does not require STAR, numbers or length, and calibrates to the candidate's level", () => {
    const system = evaluatorSystemFor("behavioral", "opening");
    expect(system).not.toMatch(/needs all four/i);
    expect(system).toMatch(/never require it, its order, or its labels/);
    expect(system).toMatch(/Numbers are welcome but never required/);
    expect(system).toMatch(/Longer is not better/);
    expect(system).toMatch(/Calibrate to the CANDIDATE LEVEL/);
    expect(system).toMatch(/class, club, volunteer and personal projects are full-value evidence/);
  });

  it("tells the model the answer is a speech transcript, and not to judge grammar or accent", () => {
    const system = evaluatorSystemFor("technical", "opening");
    expect(system).toMatch(/speech-to-text transcript/);
    expect(system).toMatch(/Never penalise grammar,\s+accent, filler words or non-native phrasing on ANY dimension/);
    // Calibration found a garbled transcript scoring ~0.7 below its clean twin.
    expect(system).toMatch(/The same content must get the same scores whether it arrived\s+clean or garbled/);
  });

  it("separates incomplete from incorrect", () => {
    expect(evaluatorSystemFor("technical", "opening")).toMatch(/Incomplete is not incorrect/);
  });

  it("scores a technical explanation as an explanation, not a story", () => {
    expect(evaluatorSystemFor("technical", "opening")).toMatch(/does not need to be a story/);
  });

  it("asks drafts for missing evidence without demanding numbers", () => {
    expect(evaluatorSystemFor("behavioral", "opening")).toMatch(/do not demand numbers/);
  });

  /** A follow-up adds to the original question; it is scored as the whole answer. */
  it("scores a follow-up as part of the original question, never lowering earned credit", () => {
    const system = evaluatorSystemFor("behavioral", "clarify");
    expect(system).toMatch(/Score the whole of it against the ORIGINAL\s+question/);
    expect(system).toMatch(/Never lower a dimension that an earlier part already earned/);
    expect(evaluatorSystemFor("behavioral", "opening")).not.toMatch(/THIS QUESTION HAS FOLLOW-UPS/);
  });
});

describe("buildTurnPrompt", () => {
  const base = {
    kind: "behavioral" as const,
    topic: "Influencing others",
    questionText: "Tell me about a time you persuaded a teammate to consider a different approach.",
    answer: "I wrote the queries both ways and showed them side by side.",
  };

  it("names the level, kind and competency, and wraps the answer as data", () => {
    const prompt = buildTurnPrompt({ ...base, seniority: "intern", roleText: "Target role: SWE Intern" });
    expect(prompt).toContain("CANDIDATE LEVEL: intern");
    expect(prompt).toContain("QUESTION TYPE: behavioral");
    expect(prompt).toContain("COMPETENCY: Influencing others");
    expect(prompt).toContain(`<answer>\n${base.answer}\n</answer>`);
    expect(prompt).toContain("<target_role>");
  });

  it("says when the level is unknown instead of assuming one", () => {
    expect(buildTurnPrompt(base)).toMatch(/CANDIDATE LEVEL: not stated/);
  });

  it("puts a follow-up reply together with everything said to the original question", () => {
    const prompt = buildTurnPrompt({
      ...base,
      priorThreadTurns: [
        { question: base.questionText, answer: "Our group wanted MongoDB." },
        { question: "Why did you prefer Postgres?", answer: "The data was relational." },
      ],
      followUpQuestion: "How did it turn out?",
      answer: "They switched, and the next feature was easier.",
    });
    expect(prompt).toContain(`ORIGINAL QUESTION: ${base.questionText}`);
    expect(prompt).toContain(
      [
        "<answer>",
        "First answer:\nOur group wanted MongoDB.",
        "",
        "Interviewer follow-up: Why did you prefer Postgres?\nCandidate added:\nThe data was relational.",
        "",
        "Interviewer follow-up: How did it turn out?\nCandidate added:\nThey switched, and the next feature was easier.",
        "</answer>",
      ].join("\n"),
    );
  });

  /** The old prompt said "never ask something already asked" without saying what had been. */
  it("lists what was already asked, most recent last and capped", () => {
    const asked = Array.from({ length: 20 }, (_, i) => `Question ${i}?`);
    const prompt = buildTurnPrompt({ ...base, askedQuestions: asked });
    expect(prompt).toContain("ALREADY ASKED (do not repeat):");
    expect(prompt).toContain("- Question 19?");
    expect(prompt).not.toContain(`- Question ${20 - ASKED_IN_PROMPT - 1}?`);
  });
});
