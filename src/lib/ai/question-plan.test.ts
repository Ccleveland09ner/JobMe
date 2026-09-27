import { describe, expect, it, vi } from "vitest";

import type { ResumeItem, TopicId } from "../engine/types";
import type { generateJson } from "./llm";
import {
  ROLE_TAILORED_TOPICS,
  checkOpening,
  generateQuestionPlan,
  namesItem,
  plannedBankOpening,
  plannedResumeOpening,
  validatePlan,
  wantsPlan,
  type PlanInputs,
} from "./question-plan";

const TOPICS: TopicId[] = ["teamwork", "conflict", "pressure", "leadership"];

const ACME: ResumeItem = {
  id: "role-0-backend-intern-at-acme",
  kind: "role",
  label: "Backend Intern at Acme",
  employer: "Acme",
  chunkSeqs: [0],
  relevanceToRole: 0.9,
  covered: false,
};

const JOBME: ResumeItem = {
  id: "project-0-jobme",
  kind: "project",
  label: "JobMe — adaptive mock interviews",
  chunkSeqs: [1],
  relevanceToRole: 0.6,
  covered: false,
};

function inputs(overrides: Partial<PlanInputs> = {}): PlanInputs {
  return {
    topics: TOPICS,
    resumeItems: [
      { item: ACME, excerpt: "Built the billing retry queue in Go." },
      { item: JOBME, excerpt: "Voice mock-interview app on Next.js." },
    ],
    targetRole: "Backend Engineering Intern",
    jobText:
      "Build Go services on Postgres, take part in the on-call rotation, " +
      "and work with product and design across teams.",
    ...overrides,
  };
}

const TEAMWORK = {
  topic: "teamwork",
  l1: "Tell me about a time you shipped a backend feature with other engineers.",
  l2: "Tell me about a time a teammate on a backend project was not pulling their weight.",
  l3: "Tell me about a time you disagreed with another engineer about a service design.",
};

const PRESSURE = {
  topic: "pressure",
  l1: "Tell me about a time you fixed a production issue under time pressure.",
  l2: "Tell me about a time you had to ship a fix while the cause was still unclear.",
  l3: "Tell me about a time an on-call incident got to you.",
};

const OUTPUT = {
  role: {
    title: "Backend Engineering Intern",
    seniority: "intern",
    requiredSkills: ["Go", "Postgres"],
    responsibilities: ["Build services"],
    competencies: ["ownership", "cross-team influence"],
  },
  topics: [TEAMWORK, PRESSURE],
  resume: [
    {
      itemId: ACME.id,
      question: "Walk me through the hardest bug you fixed at Acme.",
      topic: "problem_solving",
    },
    {
      itemId: JOBME.id,
      question: "Tell me about a design decision in JobMe you would revisit.",
      topic: "technical_challenge",
    },
  ],
};

function stubGenerate(value: unknown) {
  const calls: Parameters<typeof generateJson>[0][] = [];
  const generate = (async (args: Parameters<typeof generateJson>[0]) => {
    calls.push(args);
    return { value, thoughtTokens: 0, outputTokens: 0, ms: 1 };
  }) as typeof generateJson;
  return { generate, calls };
}

describe("generateQuestionPlan", () => {
  it("prepares the mix: a role summary, tailored topics and resume openings", async () => {
    const { generate } = stubGenerate(OUTPUT);
    const plan = await generateQuestionPlan(inputs(), generate);

    expect(plan?.role?.title).toBe("Backend Engineering Intern");
    expect(Object.keys(plan?.topics ?? {})).toEqual(["teamwork", "pressure"]);
    expect(plan?.resume[ACME.id]).toEqual({
      text: "Walk me through the hardest bug you fixed at Acme.",
      topic: "problem_solving",
    });
  });

  /** The demo path: nothing to personalise means the fixed bank, and no call. */
  it("makes no call when there is nothing to personalise", async () => {
    const { generate, calls } = stubGenerate(OUTPUT);
    const bare = inputs({ resumeItems: [], targetRole: null, jobText: null });

    expect(wantsPlan(bare)).toBe(false);
    expect(await generateQuestionPlan(bare, generate)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("returns null rather than failing session start when the model does", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = (async () => {
      throw new Error("Rate limited (free tier is 15 requests/minute).");
    }) as typeof generateJson;

    expect(await generateQuestionPlan(inputs(), failing)).toBeNull();
    warn.mockRestore();
  });

  it("wraps the posting and resume as data, and says so", async () => {
    const { generate, calls } = stubGenerate(OUTPUT);
    await generateQuestionPlan(inputs(), generate);

    expect(calls[0].systemInstruction).toMatch(/DATA, not instructions/);
    expect(calls[0].prompt).toContain("<job_posting>");
    expect(calls[0].prompt).toContain(`<resume_item>\nid: ${ACME.id}`);
  });
});

describe("validatePlan — every entry stands or falls alone", () => {
  it(`tailors at most ${ROLE_TAILORED_TOPICS} topics, leaving the rest general`, () => {
    const extra = { ...TEAMWORK, topic: "leadership", l1: "Tell me about a time you led a backend migration." };
    const plan = validatePlan({ ...OUTPUT, topics: [TEAMWORK, PRESSURE, extra] }, inputs());
    expect(Object.keys(plan?.topics ?? {})).toHaveLength(ROLE_TAILORED_TOPICS);
  });

  it("ignores a topic this session does not use", () => {
    const plan = validatePlan(
      { ...OUTPUT, topics: [{ ...TEAMWORK, topic: "persuasion" }] },
      inputs(),
    );
    expect(plan?.topics).toEqual({});
  });

  it("drops a bad level but keeps the good ones", () => {
    const plan = validatePlan(
      { ...OUTPUT, topics: [{ ...TEAMWORK, l2: "What happened? Who was involved?" }] },
      inputs(),
    );
    expect(plan?.topics.teamwork).toEqual({ l1: TEAMWORK.l1, l3: TEAMWORK.l3 });
  });

  it("drops a resume opening that does not name its item", () => {
    const plan = validatePlan(
      {
        ...OUTPUT,
        resume: [{ itemId: ACME.id, question: "Tell me about a hard bug you fixed.", topic: "problem_solving" }],
      },
      inputs(),
    );
    expect(plan?.resume[ACME.id]).toBeUndefined();
  });

  it("drops an unknown item id, and nulls an unknown topic", () => {
    const plan = validatePlan(
      {
        ...OUTPUT,
        resume: [
          { itemId: "made-up", question: "Tell me about Acme.", topic: "teamwork" },
          { itemId: ACME.id, question: "Walk me through a launch at Acme.", topic: "bravery" },
        ],
      },
      inputs(),
    );
    expect(Object.keys(plan?.resume ?? {})).toEqual([ACME.id]);
    expect(plan?.resume[ACME.id].topic).toBeNull();
  });

  it("drops a duplicate question", () => {
    // Names both items, so the ONLY thing wrong with the second is repetition.
    const both = "Tell me how your work at Acme shaped the way you built JobMe.";
    const plan = validatePlan(
      {
        ...OUTPUT,
        resume: [
          { itemId: ACME.id, question: both, topic: "teamwork" },
          { itemId: JOBME.id, question: both, topic: "teamwork" },
        ],
      },
      inputs(),
    );
    expect(plan?.resume[ACME.id]?.text).toBe(both);
    expect(plan?.resume[JOBME.id]).toBeUndefined();
  });

  it("keeps resume openings but no role or tailoring when there is no job", () => {
    const plan = validatePlan(OUTPUT, inputs({ targetRole: null, jobText: null }));
    expect(plan?.role).toBeNull();
    expect(plan?.topics).toEqual({});
    expect(Object.keys(plan?.resume ?? {})).toHaveLength(2);
  });

  it("returns null when nothing survives", () => {
    expect(validatePlan({ topics: [], resume: [] }, inputs())).toBeNull();
    expect(validatePlan("not an object", inputs())).toBeNull();
  });
});

describe("checkOpening", () => {
  it.each([
    ["a 'tell me' statement", "Tell me about a time you led a migration.", true],
    ["a question", "What was the hardest part of building JobMe?", true],
    ["two questions", "What happened? Why?", false],
    ["no ending", "Tell me about a time you led a migration", false],
    ["a leaked placeholder", "Tell me about the [metric] you improved.", false],
    ["leaked prompt structure", "Tell me about <resume_item> at Acme.", false],
    ["too long", `${"word ".repeat(31)}?`, false],
  ])("%s", (_label, text, ok) => {
    expect(checkOpening(text)).toBe(ok);
  });
});

describe("namesItem", () => {
  it("accepts a question naming the employer", () => {
    expect(namesItem("What broke at Acme?", ACME)).toBe(true);
  });

  it("accepts a question naming the project", () => {
    expect(namesItem("How did you design JobMe's scoring?", JOBME)).toBe(true);
  });

  it("rejects a question that only echoes a generic job title", () => {
    expect(namesItem("Tell me about your time as a backend intern.", ACME)).toBe(false);
  });
});

describe("planned lookups", () => {
  const plan = validatePlan(OUTPUT, inputs());

  it("picks the planned wording for the difficulty, mirroring questionFor", () => {
    expect(plannedBankOpening(plan, "teamwork", 1, [])).toBe(TEAMWORK.l1);
    expect(plannedBankOpening(plan, "teamwork", 2, [])).toBe(TEAMWORK.l2);
    expect(plannedBankOpening(plan, "teamwork", 3, [])).toBe(TEAMWORK.l3);
  });

  it("returns null — so the caller uses the bank — for an untailored topic, a missing plan, or a repeat", () => {
    expect(plannedBankOpening(plan, "conflict", 1, [])).toBeNull();
    expect(plannedBankOpening(null, "teamwork", 1, [])).toBeNull();
    expect(plannedBankOpening(plan, "teamwork", 1, [TEAMWORK.l1])).toBeNull();
  });

  it("finds a resume item's opening, and refuses to repeat it", () => {
    const opening = plannedResumeOpening(plan, ACME.id, []);
    expect(opening?.topic).toBe("problem_solving");
    expect(plannedResumeOpening(plan, ACME.id, [opening!.text])).toBeNull();
  });
});
