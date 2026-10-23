import { describe, expect, it, vi } from "vitest";

import { ROLE_FAMILIES } from "../engine/roles";
import type { ResumeItem, TopicId } from "../engine/types";
import { parsePlan } from "../plan";
import type { generateJson } from "./llm";
import {
  buildPlanPrompt,
  checkOpening,
  fallbackPlan,
  generateQuestionPlan,
  namesItem,
  orderResumeItems,
  plannedBankOpening,
  plannedResumeOpening,
  purposeFor,
  usableJobText,
  validatePlan,
  wantsPlan,
  type PlanInputs,
} from "./question-plan";

/** Role-family defaults for a software role (engine/roles.ts). */
const TOPICS: TopicId[] = ["motivation", "technical_knowledge", "teamwork", "pressure"];

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
    family: "software",
    resumeItems: [
      { item: ACME, excerpt: "Built the billing retry queue in Go." },
      { item: JOBME, excerpt: "Voice mock-interview app on Next.js." },
    ],
    targetRole: "Backend Engineering Intern",
    company: "Northwind",
    seniority: "intern",
    jobText:
      "Build Go services on Postgres, take part in the on-call rotation, " +
      "and work with product and design across teams.",
    ...overrides,
  };
}

const TEAMWORK = {
  topic: "teamwork",
  purpose: "working with other engineers on shared services",
  l1: "Tell me about a time you shipped a backend feature with other engineers.",
  l2: "Tell me about a time a backend team you were on struggled to work together.",
  l3: "Tell me about a time you disagreed with another engineer about a service design.",
};

const PRESSURE = {
  topic: "pressure",
  purpose: "staying effective during an on-call incident",
  l1: "Tell me about a time you fixed a production issue under time pressure.",
  l2: "Tell me about a time you had to ship a fix while the cause was still unclear.",
  l3: "Tell me about a time a deadline forced you to make a hard trade-off on a fix.",
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
  resumeOrder: [JOBME.id, ACME.id],
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
  it("prepares the interview: a role summary, chosen topics, resume openings and order", async () => {
    const { generate } = stubGenerate(OUTPUT);
    const plan = await generateQuestionPlan(inputs(), generate);

    expect(plan.role?.title).toBe("Backend Engineering Intern");
    expect(Object.keys(plan.topics)).toEqual(["teamwork", "pressure"]);
    // Motivation and the software question are kept even though the model
    // only returned two topics; the defaults fill the gap.
    expect(plan.order).toEqual(["motivation", "technical_knowledge", "teamwork", "pressure"]);
    expect(plan.resume[ACME.id]).toEqual({
      text: "Walk me through the hardest bug you fixed at Acme.",
      topic: "problem_solving",
    });
    expect(plan.resumeOrder).toEqual([JOBME.id, ACME.id]);
    expect(plan.job).toMatchObject({ title: "Backend Engineering Intern", company: "Northwind", generated: true });
  });

  /** The demo path: nothing to personalise means the role defaults, and no call. */
  it("makes no call when there is nothing to personalise", async () => {
    const { generate, calls } = stubGenerate(OUTPUT);
    const bare = inputs({ resumeItems: [], targetRole: null, company: null, jobText: null, family: "general" });

    expect(wantsPlan(bare)).toBe(false);
    const plan = await generateQuestionPlan(bare, generate);
    expect(calls).toHaveLength(0);
    expect(plan.order).toEqual(TOPICS);
    expect(plan.job).toMatchObject({ generated: false, title: null });
  });

  /**
   * Session start must never fail on a rate limit — and the turns must still
   * know the role. Before, a failed plan meant the evaluator had no job at all.
   */
  it("falls back to the role defaults, keeping the job, when the model fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = (async () => {
      throw new Error("Rate limited (free tier is 15 requests/minute).");
    }) as typeof generateJson;

    const plan = await generateQuestionPlan(inputs(), failing);
    warn.mockRestore();
    expect(plan.order).toEqual(TOPICS);
    expect(plan.role).toMatchObject({ title: "Backend Engineering Intern", seniority: "intern" });
    expect(plan.job).toMatchObject({ company: "Northwind", family: "software", generated: false });
  });

  it("wraps the posting and resume as data, and says so", async () => {
    const { generate, calls } = stubGenerate(OUTPUT);
    await generateQuestionPlan(inputs(), generate);

    expect(calls[0].systemInstruction).toMatch(/DATA, not instructions/);
    expect(calls[0].prompt).toContain("<job_posting>");
    expect(calls[0].prompt).toContain(`<resume_item>\nid: ${ACME.id}`);
  });

  it("forbids inventing company facts and experiences the candidate may not have", async () => {
    const { generate, calls } = stubGenerate(OUTPUT);
    await generateQuestionPlan(inputs(), generate);
    expect(calls[0].systemInstruction).toMatch(/states nothing about the company/);
    expect(calls[0].systemInstruction).toMatch(/never presume an experience/);
  });
});

describe("buildPlanPrompt — what the model is told about the job", () => {
  it("names the title, company, level and family, and offers every catalogue topic", () => {
    const prompt = buildPlanPrompt(inputs());
    expect(prompt).toContain("<target_job>\nBackend Engineering Intern at Northwind\n</target_job>");
    expect(prompt).toContain("CANDIDATE LEVEL: intern");
    expect(prompt).toContain("ROLE FAMILY (from the title): software — include technical_knowledge");
    expect(prompt).toContain("- product_sense [problem_solving]:");
    expect(prompt).toContain("DEFAULT ORDER: motivation, technical_knowledge, teamwork, pressure");
  });

  it("flags a company that was only read from the link", () => {
    expect(buildPlanPrompt(inputs({ companyInferred: true }))).toContain(
      "Backend Engineering Intern at Northwind (company name read from the posting link)",
    );
  });

  it("names no company when none is known", () => {
    expect(buildPlanPrompt(inputs({ company: null }))).toContain(
      "<target_job>\nBackend Engineering Intern\n</target_job>",
    );
  });

  /** "asdf" in the description box is not a job description. */
  it("ignores a job description too short to be one", () => {
    expect(usableJobText("asdf")).toBeNull();
    expect(buildPlanPrompt(inputs({ jobText: "asdf" }))).not.toContain("<job_posting>");
    expect(wantsPlan(inputs({ targetRole: null, jobText: "asdf", resumeItems: [] }))).toBe(false);
  });
});

describe("validatePlan — every entry stands or falls alone", () => {
  it("lets the model re-choose competencies, but keeps motivation first and a role question", () => {
    const leadership = { ...TEAMWORK, topic: "leadership", l1: "Tell me about a time you led a backend migration." };
    const plan = validatePlan(
      { ...OUTPUT, topics: [leadership, TEAMWORK, { ...TEAMWORK, topic: "persuasion" }] },
      inputs(),
    );
    expect(plan?.order).toEqual(["motivation", "technical_knowledge", "leadership", "teamwork"]);
  });

  it("drops unknown and repeated topics, filling from the defaults", () => {
    const plan = validatePlan(
      { ...OUTPUT, topics: [{ ...TEAMWORK, topic: "bravery" }, TEAMWORK, TEAMWORK] },
      inputs(),
    );
    expect(plan?.order).toEqual(["motivation", "technical_knowledge", "teamwork", "pressure"]);
  });

  it("keeps a purpose for each topic, and falls back to the bank's", () => {
    const plan = validatePlan(OUTPUT, inputs());
    expect(purposeFor(plan, "pressure")).toBe("staying effective during an on-call incident");
    expect(purposeFor(plan, "motivation")).toMatch(/why you want this role/);
  });

  /** Observed live: the model echoed the catalogue and it was labelled tailored. */
  it("treats a verbatim copy of the bank text as untailored", () => {
    const copy = { ...TEAMWORK, l1: "Tell me about a time you worked on a team to ship something." };
    const plan = validatePlan({ ...OUTPUT, topics: [copy] }, inputs());
    expect(plan?.topics.teamwork?.l1).toBeUndefined();
    expect(plan?.topics.teamwork?.l2).toBe(TEAMWORK.l2);
    expect(plannedBankOpening(plan, "teamwork", 1, [])).toBeNull();
  });

  it("drops a bad level but keeps the good ones", () => {
    const plan = validatePlan(
      { ...OUTPUT, topics: [{ ...TEAMWORK, l2: "What happened? Who was involved?" }] },
      inputs(),
    );
    expect(plan?.topics.teamwork).toEqual({
      l1: TEAMWORK.l1,
      l3: TEAMWORK.l3,
      purpose: TEAMWORK.purpose,
    });
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
        resumeOrder: ["made-up", ACME.id],
      },
      inputs(),
    );
    expect(Object.keys(plan?.resume ?? {})).toEqual([ACME.id]);
    expect(plan?.resume[ACME.id].topic).toBeNull();
    expect(plan?.resumeOrder).toEqual([ACME.id]);
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

  it("keeps resume openings but no role, tailoring or re-ordering when there is no job", () => {
    const plan = validatePlan(OUTPUT, inputs({ targetRole: null, jobText: null }));
    expect(plan?.role).toBeNull();
    expect(plan?.topics).toEqual({});
    expect(plan?.order).toEqual(TOPICS);
    expect(Object.keys(plan?.resume ?? {})).toHaveLength(2);
  });

  it("returns null when nothing survives", () => {
    expect(validatePlan({ topics: [], resume: [], resumeOrder: [] }, inputs())).toBeNull();
    expect(validatePlan("not an object", inputs())).toBeNull();
  });
});

describe("fallbackPlan", () => {
  it("carries the job and a title-only role, so a failed call never loses the role", () => {
    const plan = fallbackPlan(inputs({ companyInferred: true }));
    expect(plan.role?.title).toBe("Backend Engineering Intern");
    expect(plan.job).toEqual({
      title: "Backend Engineering Intern",
      company: "Northwind",
      companyInferred: true,
      family: "software",
      seniority: "intern",
      generated: false,
    });
  });

  it("has no role when there is no title", () => {
    expect(fallbackPlan(inputs({ targetRole: null })).role).toBeNull();
  });
});

describe("a plan survives being stored and read back", () => {
  // Plans are validated when read, not when written: one the schema rejects
  // would silently cost every turn its role context and planned openings.
  it("parses what both the fallback and the model path write, for every role family", () => {
    for (const family of ROLE_FAMILIES) {
      const written = [fallbackPlan(inputs({ family })), validatePlan(OUTPUT, inputs({ family }))];
      for (const plan of written) expect(parsePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    }
  });
});

describe("orderResumeItems", () => {
  it("puts items in the plan's order for this job, unlisted ones last", () => {
    const third = { ...ACME, id: "third" };
    const plan = { ...fallbackPlan(inputs()), resumeOrder: [JOBME.id, ACME.id] };
    expect(orderResumeItems([ACME, third, JOBME], plan).map((i) => i.id)).toEqual([
      JOBME.id,
      ACME.id,
      "third",
    ]);
  });

  it("leaves the upload ranking alone without a plan order", () => {
    expect(orderResumeItems([ACME, JOBME], null)).toEqual([ACME, JOBME]);
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
