import { describe, expect, it, vi } from "vitest";

import { EvalError, type RawEvaluation } from "../ai/evaluate";
import { fallbackResumeQuestion } from "../ai/resume-questions";
import { questionFor } from "../engine/bank";
import { FULLY_ANSWERED_LINE, SCORING_FAILED_LINE, SCORING_LATE_LINE } from "../engine/notepad";
import { initState } from "../engine/policy";
import type { EngineState, Question, ResumeItem, Scores } from "../engine/types";
import type { QuestionPlan } from "../schemas";
import { heuristicGap } from "../ai/questions";
import {
  degradedReasonFor,
  isStaleSubmit,
  judgeAnswer,
  runTurn,
  staleTurnBody,
  threadHistory,
  turnContextFrom,
  turnResponseBody,
  turnRowFor,
  submitAnswer,
  type LateScore,
  type TurnStore,
  type TurnContext,
  type TurnResult,
} from "./turn";

const flat = (n: number): Scores => ({
  relevance: n,
  specificity: n,
  ownership: n,
  reasoning: n,
  outcome: n,
  communication: n,
});

const FIRST: Question = {
  text: "Tell me about a time you worked on a team to ship something.",
  type: "opening",
  topic: "teamwork",
  difficulty: 1,
  source: "bank",
};

function freshState(): EngineState {
  return initState({
    mode: "quick",
    topics: ["teamwork", "conflict", "pressure", "leadership"],
    resumeItems: [],
    firstQuestion: FIRST,
  });
}

const ANSWER =
  "I owned the checkout outage: I profiled the service, found a quadratic " +
  "comparison, bucketed it by SKU, and p99 went from 1,200 ms to 340 ms.";

function raw(scores: Scores): RawEvaluation {
  return {
    scores,
    status: "complete",
    clarify_gap: null,
    observation: "Clear ownership; outcome quantified",
    off_topic: false,
    repeats_previous: false,
    drafts: {
      deepen: "What trade-off did you weigh when you chose bucketing?",
      clarify: "What did you personally change in the checkout service?",
    },
  };
}

function ctx(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    state: freshState(),
    transcript: ANSWER,
    holdMs: 30_000,
    captureMs: 24_000,
    evaluate: async () => raw(flat(3)),
    ...overrides,
  };
}

describe("runTurn — context reaches the evaluator", () => {
  /** A follow-up is scored as the whole answer so far, against the original question. */
  it("scores a follow-up as an addition to the original question", async () => {
    const evaluate = vi.fn(async () => raw(flat(3)));
    const history = [{ question: FIRST.text, answer: "We fixed the bug." }];
    const clarify: Question = { ...FIRST, type: "clarify", text: "What did you change yourself?" };
    const state = { ...freshState(), currentQuestion: clarify, threadScores: [flat(2)] };

    await runTurn(ctx({ state, evaluate, priorThreadTurns: history }));

    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        questionText: FIRST.text,
        followUpQuestion: clarify.text,
        questionType: "clarify",
        priorThreadTurns: history,
      }),
    );
  });

  it("scores an opening on its own, against its own question", async () => {
    const evaluate = vi.fn(async () => raw(flat(3)));
    await runTurn(ctx({ evaluate }));
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        questionText: FIRST.text,
        followUpQuestion: null,
        priorThreadTurns: [],
        kind: "behavioral",
      }),
    );
  });

  it("tells the evaluator the candidate's level and what was already asked", async () => {
    const evaluate = vi.fn(async () => raw(flat(3)));
    await runTurn(ctx({ evaluate, seniority: "intern" }));
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ seniority: "intern", askedQuestions: [FIRST.text] }),
    );
  });

  it("uses the technical rubric for a technical question", async () => {
    const evaluate = vi.fn(async () => ({
      ...raw({ relevance: 3, accuracy: 3, reasoning: 3, specificity: 3, communication: 3 }),
    }));
    const technical: Question = {
      text: "What happens when you type a web address into a browser and press enter?",
      type: "opening",
      topic: "technical_knowledge",
      difficulty: 1,
      source: "bank",
    };
    const result = await runTurn(
      ctx({ evaluate, state: { ...freshState(), currentQuestion: technical } }),
    );
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({ kind: "technical" }));
    if (result.kind !== "turn") throw new Error("expected a turn");
    expect(result.notepad.kind).toBe("technical");
    expect(result.notepad.primaryGap).not.toBe("ownership");
  });

  it("prefers the session's own job description over the resume's role title", async () => {
    const evaluate = vi.fn(async () => raw(flat(3)));
    await runTurn(
      ctx({
        evaluate,
        roleText: "Backend intern: Go, Postgres, on-call rotation.",
        role: {
          title: "Software Engineer",
          seniority: "intern",
          requiredSkills: [],
          responsibilities: [],
          competencies: [],
        },
      }),
    );
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        roleText: "Backend intern: Go, Postgres, on-call rotation.",
      }),
    );
  });

  it("falls back to the resume's role title when the session has no job description", async () => {
    const evaluate = vi.fn(async () => raw(flat(3)));
    await runTurn(
      ctx({
        evaluate,
        role: {
          title: "Software Engineer",
          seniority: "intern",
          requiredSkills: [],
          responsibilities: [],
          competencies: [],
        },
      }),
    );
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ roleText: "Software Engineer" }),
    );
  });
});

describe("runTurn — degraded path", () => {
  it("records why scoring failed, but never says so on the notepad", async () => {
    const result = await runTurn(
      ctx({
        evaluate: async () => {
          throw new EvalError("Rate limited (free tier is 15 requests/minute).", true);
        },
      }),
    );

    if (result.kind !== "turn") throw new Error("expected a turn");
    expect(result.degradedReason).toBe("rate_limited");
    expect(result.persistedScores).toBeNull();
    expect(result.notepad.observation).toBe(SCORING_FAILED_LINE);
    expect(JSON.stringify(result.notepad)).not.toMatch(/rate|limit|gemini|error/i);
  });

  it("moves on instead of following up on a heuristic guess", async () => {
    const result = await runTurn(ctx({ evaluate: async () => { throw new EvalError("timeout"); } }));
    if (result.kind !== "turn") throw new Error("expected a turn");
    expect(result.move).toBe("opening");
  });

  it("classifies each failure", () => {
    const live = new AbortController().signal;
    expect(degradedReasonFor(new Error("x"), AbortSignal.abort())).toBe("timeout");
    expect(degradedReasonFor(new EvalError("x", true), live)).toBe("rate_limited");
    expect(degradedReasonFor(new EvalError("x"), live)).toBe("unavailable");
    expect(degradedReasonFor(new Error("network"), live)).toBe("unavailable");
  });
});

describe("runTurn — a follow-up only when something is missing", () => {
  async function moveFor(evaluation: RawEvaluation) {
    const result = await runTurn(ctx({ evaluate: async () => evaluation }));
    if (result.kind !== "turn") throw new Error("expected a turn");
    return result;
  }

  it("moves on from a complete, solid answer and says why", async () => {
    const result = await moveFor(raw(flat(3)));
    expect(result.move).toBe("opening");
    expect(result.notepad.reason).toBe(FULLY_ANSWERED_LINE);
  });

  it("still clarifies a complete answer with a real gap", async () => {
    expect((await moveFor(raw({ ...flat(3), outcome: 2 }))).move).toBe("clarify");
  });

  it("still follows up an answer the evaluator called incomplete", async () => {
    expect((await moveFor({ ...raw(flat(3)), status: "incomplete" })).move).toBe("clarify");
  });

  it("moves on once a follow-up completes the answer", async () => {
    const opening = await moveFor(raw({ ...flat(3), outcome: 1 }));
    expect(opening.move).toBe("clarify");
    const reply = await runTurn(
      ctx({
        state: opening.state,
        transcript: "In the end checkout stopped timing out and refunds dropped.",
        priorThreadTurns: [{ question: FIRST.text, answer: ANSWER }],
        evaluate: async () => raw(flat(3)),
      }),
    );
    if (reply.kind !== "turn") throw new Error("expected a turn");
    expect(reply.move).toBe("opening");
  });
});

describe("runTurn — speaking rate", () => {
  it("computes WPM over capture time", async () => {
    const result = await runTurn(ctx({ captureMs: 60_000 }));
    if (result.kind !== "turn") throw new Error("expected a turn");
    expect(result.stats.wpm).toBe(ANSWER.split(/\s+/).length);
  });

  /** Brief §2.8: hold time under-reports pace, so it is never a stand-in. */
  it("reports no WPM when no capture time was sent, rather than using hold time", async () => {
    const result = await runTurn(ctx({ captureMs: undefined }));
    if (result.kind !== "turn") throw new Error("expected a turn");
    expect(result.stats.wpm).toBeNull();
  });
});

describe("threadHistory", () => {
  const recent = [
    { seq: 5, question_text: "Q5?", answer_transcript: "A5" },
    { seq: 4, question_text: "Q4?", answer_transcript: "A4" },
    { seq: 3, question_text: "Q3?", answer_transcript: "A3" },
  ];

  it("returns exactly this thread's earlier answers, oldest first", () => {
    const state = { ...freshState(), turnSeq: 5, threadScores: [flat(2), flat(2)] };
    expect(threadHistory(state, recent)).toEqual([
      { question: "Q4?", answer: "A4" },
      { question: "Q5?", answer: "A5" },
    ]);
  });

  it("is empty when answering a thread's opening", () => {
    const state = { ...freshState(), turnSeq: 5, threadScores: [] };
    expect(threadHistory(state, recent)).toEqual([]);
  });
});

describe("turnRowFor", () => {
  it("describes the question that was answered, not the next one", async () => {
    const c = ctx();
    const result = await runTurn(c);
    if (result.kind !== "turn") throw new Error("expected a turn");

    const row = turnRowFor(c, result);
    expect(row).toMatchObject({
      question_text: FIRST.text,
      answer_transcript: ANSWER,
      question_source: "bank",
      resume_item_id: null,
      hold_ms: 30_000,
      capture_ms: 24_000,
      degraded_reason: null,
    });
    expect(row.question_text).not.toBe(result.next?.text);
  });

  it("persists an unscored turn with null scores and its reason", async () => {
    const c = ctx({
      captureMs: undefined,
      evaluate: async () => {
        throw new EvalError("boom");
      },
    });
    const result = await runTurn(c);
    if (result.kind !== "turn") throw new Error("expected a turn");

    expect(turnRowFor(c, result)).toMatchObject({
      scores: null,
      band: null,
      primary_gap: null,
      degraded_reason: "unavailable",
      capture_ms: null,
      wpm: null,
    });
  });
});

describe("isStaleSubmit", () => {
  it("recognises both ways a racing duplicate is refused", () => {
    expect(isStaleSubmit({ code: "PT409" })).toBe(true);
    expect(isStaleSubmit({ code: "23505" })).toBe(true);
  });

  it("does not mistake other failures for a race", () => {
    expect(isStaleSubmit({ code: "42501" })).toBe(false);
    expect(isStaleSubmit(null)).toBe(false);
  });
});

describe("runTurn — openings come from the question plan", () => {
  const ACME: ResumeItem = {
    id: "role-0-backend-intern-at-acme",
    kind: "role",
    label: "Backend Intern at Acme",
    employer: "Acme",
    chunkSeqs: [0],
    relevanceToRole: 0.9,
    covered: false,
  };

  const TAILORED_L2 =
    "Tell me about a time you pushed back on a senior engineer's service design.";
  const ACME_OPENING = "Walk me through the hardest bug you fixed at Acme.";

  const PLAN: QuestionPlan = {
    version: 1,
    role: null,
    topics: { conflict: { l2: TAILORED_L2 } },
    resume: { [ACME.id]: { text: ACME_OPENING, topic: "problem_solving" } },
  };

  /** One great, complete answer: nothing to follow up, so the next thread opens a level harder. */
  async function nextThread(items: ResumeItem[], plan: QuestionPlan | null) {
    const state = initState({
      mode: "quick",
      topics: ["teamwork", "conflict", "pressure", "leadership"],
      resumeItems: items,
      firstQuestion: FIRST,
    });
    const first = await runTurn(ctx({ state, plan, evaluate: async () => raw(flat(4)) }));
    if (first.kind !== "turn") throw new Error("expected a turn");
    expect(first.move).toBe("opening");
    return first;
  }

  it("uses the role-tailored wording at the new difficulty", async () => {
    const result = await nextThread([], PLAN);
    expect(result.next).toMatchObject({ topic: "conflict", difficulty: 2, text: TAILORED_L2 });
    expect(result.lead).toMatch(/switch gears|something different|somewhere else/);
  });

  it("falls back to the bank's fixed text without a plan", async () => {
    const result = await nextThread([], null);
    expect(result.next?.text).toBe(questionFor("conflict", 2));
  });

  it("opens a resume thread with the planned question and its competency", async () => {
    const result = await nextThread([ACME], PLAN);
    expect(result.next).toMatchObject({
      source: "resume",
      resumeItemId: ACME.id,
      text: ACME_OPENING,
      topic: "problem_solving",
    });
    expect(result.lead).toMatch(/resume|experience/);
  });

  /** A rate limit at session start costs polish, never coverage. */
  it("still opens on the resume item without a plan, naming it", async () => {
    const result = await nextThread([ACME], null);
    expect(result.next?.text).toBe(fallbackResumeQuestion(ACME));
    expect(result.next?.text).toContain("Acme");
  });

  it("makes no model call to word an opening", async () => {
    const evaluate = vi.fn(async () => raw(flat(4)));
    const state = initState({
      mode: "quick",
      topics: ["teamwork", "conflict", "pressure", "leadership"],
      resumeItems: [ACME],
      firstQuestion: FIRST,
    });
    const first = await runTurn(ctx({ state, plan: PLAN, evaluate }));
    if (first.kind !== "turn") throw new Error("expected a turn");
    await runTurn(ctx({ state: first.state, plan: PLAN, evaluate }));
    // One evaluation per answer, and nothing else.
    expect(evaluate).toHaveBeenCalledTimes(2);
  });
});

describe("runTurn — nudge", () => {
  /** Brief §8: a 3-word answer increments neither questionCount nor turnSeq. */
  it("does not score, count or advance on an answer under five words", async () => {
    const evaluate = vi.fn(async () => raw(flat(3)));
    const c = ctx({ evaluate, transcript: "um I dunno" });

    const result = await runTurn(c);

    expect(result.kind).toBe("nudge");
    // The very same state comes back: nothing to persist, nothing counted.
    expect(result.state).toBe(c.state);
    expect(result.state.turnSeq).toBe(0);
    expect(result.state.questionCount).toBe(c.state.questionCount);
    expect(evaluate).not.toHaveBeenCalled();
  });
});

describe("runTurn — telemetry", () => {
  it("reports how long the evaluation took, whether it succeeded or failed", async () => {
    const ok = await runTurn(ctx());
    const failed = await runTurn(
      ctx({
        evaluate: async () => {
          throw new EvalError("boom");
        },
      }),
    );
    for (const result of [ok, failed]) {
      if (result.kind !== "turn") throw new Error("expected a turn");
      expect(Number.isInteger(result.evalMs)).toBe(true);
      expect(result.evalMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("turnContextFrom", () => {
  const answer = { transcript: ANSWER, holdMs: 9000, captureMs: 8000 };
  const role = { title: "Backend Intern", seniority: "intern", requiredSkills: ["Go"], responsibilities: [], competencies: [] };

  it("prefers the plan's role summary to the raw posting, and parses the plan", () => {
    const plan: QuestionPlan = { version: 1, role, topics: {}, resume: {} };
    const ctx = turnContextFrom({ state: freshState(), answer, storedPlan: plan, postingText: "Raw posting", resume: null, recentTurns: [] });
    expect(ctx).toMatchObject({ transcript: ANSWER, holdMs: 9000, captureMs: 8000, plan, resumeFacts: null, role: null });
    expect(ctx.roleText).toContain("Backend Intern");
  });

  it("adds the plan's company and judges against the job's level", () => {
    const job = { title: "Backend Intern", company: "Acme", companyInferred: true, family: "software" as const, seniority: "junior", generated: false };
    const plan: QuestionPlan = { version: 1, role, topics: {}, resume: {}, job };
    const ctx = turnContextFrom({ state: freshState(), answer, storedPlan: plan, postingText: null, resume: null, recentTurns: [] });
    expect(ctx.roleText).toMatch(/Backend Intern[\s\S]*\nCompany: Acme \(read from the posting link\)$/);
    expect(ctx.seniority).toBe("junior");

    const stated = { ...plan, role: null, job: { ...job, companyInferred: false, seniority: null } };
    const bare = turnContextFrom({ state: freshState(), answer, storedPlan: stated, postingText: null, resume: null, recentTurns: [] });
    expect(bare.roleText).toBe("Company: Acme");
    expect(bare.seniority).toBeNull();
    // Without a job, the plan's role still gives the level.
    const roleOnly = turnContextFrom({ state: freshState(), answer, storedPlan: { ...plan, job: undefined }, postingText: null, resume: null, recentTurns: [] });
    expect(roleOnly.seniority).toBe("intern");
  });

  it("falls back to the posting, and to no plan, when the stored plan is malformed", () => {
    const ctx = turnContextFrom({ state: freshState(), answer, storedPlan: { version: 2 }, postingText: "Raw posting", resume: null, recentTurns: [] });
    expect(ctx.plan).toBeNull();
    expect(ctx.roleText).toBe("Raw posting");
  });

  it("reads the resume's facts and role when there is a resume, even without facts", () => {
    const withFacts = turnContextFrom({
      state: freshState(),
      answer,
      storedPlan: null,
      postingText: null,
      resume: { resume_facts: { skills: ["Go"] }, role_profile: role },
      recentTurns: [],
    });
    expect(withFacts.resumeFacts).toContain("Go");
    expect(withFacts.role).toEqual(role);
    const bare = turnContextFrom({ state: freshState(), answer, storedPlan: null, postingText: null, resume: {}, recentTurns: [] });
    expect(bare.resumeFacts).toBe("");
    expect(bare.role).toBeNull();
  });

  it("keeps only this thread's earlier answers, oldest first", () => {
    const state = { ...freshState(), turnSeq: 3, threadScores: [flat(2), flat(2)] };
    const recentTurns = [3, 2, 1].map((seq) => ({ seq, question_text: `Q${seq}`, answer_transcript: `A${seq}` }));
    const ctx = turnContextFrom({ state, answer, storedPlan: null, postingText: null, resume: null, recentTurns });
    expect(ctx.priorThreadTurns).toEqual([
      { question: "Q2", answer: "A2" },
      { question: "Q3", answer: "A3" },
    ]);
  });
});

describe("turnResponseBody and staleTurnBody", () => {
  const item = (covered: boolean): ResumeItem => ({ id: "x", kind: "role", label: "Role", chunkSeqs: [], relevanceToRole: 1, covered });

  it("answers with the note, the next question with its lead, and progress", () => {
    const state = { ...freshState(), turnSeq: 1, questionCount: 2, topicIndex: 1, resumeItems: [item(true), item(false)] };
    const result = {
      kind: "turn",
      state,
      move: "opening",
      notepad: { seq: 1 },
      next: FIRST,
      lead: "Let's switch topics.",
      done: false,
      wrapLine: undefined,
    } as unknown as Extract<TurnResult, { kind: "turn" }>;
    expect(turnResponseBody(result)).toEqual({
      kind: "turn",
      move: "opening",
      notepad: { seq: 1 },
      next: { ...FIRST, lead: "Let's switch topics." },
      done: false,
      wrapLine: undefined,
      progress: { questionCount: 2, questionCap: state.questionCap, topicIndex: 1, topicsTotal: 4, coverageDone: 1, coverageTotal: 2 },
    });
    expect(turnResponseBody({ ...result, next: null }).next).toBeNull();
  });

  it("tells a stale submit which turn is expected, with the state to resync from", () => {
    const state = { ...freshState(), turnSeq: 4 };
    expect(staleTurnBody(state, 2)).toEqual({ error: "Stale turn sequence", expected: 5, received: 2, state });
  });
});

describe("judgeAnswer", () => {
  const LONG = "I led the rollout across three teams and measured how many tickets we closed each week afterwards.";

  it("bands a short opening weak whatever the scores, but never a short follow-up reply", () => {
    expect(judgeAnswer({ transcript: "We fixed the bug.", questionType: "opening", kind: "behavioral", scores: flat(4) }).band).toBe("weak");
    expect(judgeAnswer({ transcript: "I wrote the script.", questionType: "clarify", kind: "behavioral", scores: flat(4) }).band).toBe("great");
  });

  it("keeps the model's gap only when the scores agree it is one", () => {
    const scores = { ...flat(3), outcome: 2, ownership: 1 };
    expect(judgeAnswer({ transcript: LONG, questionType: "opening", kind: "behavioral", scores, modelGap: "outcome" }).primaryGap).toBe("outcome");
    expect(judgeAnswer({ transcript: LONG, questionType: "opening", kind: "behavioral", scores, modelGap: "relevance" }).primaryGap).toBe("ownership");
  });

  // runTurn used a separate heuristic gap when the model was down; with no
  // model gap, judging gives the same answer, so the two paths are one.
  it("chases the same gap the heuristics would when the model gave none", () => {
    for (const kind of ["behavioral", "technical", "motivational"] as const) {
      for (const scores of [flat(2), { ...flat(3), specificity: 1 }, { ...flat(4), reasoning: 2, relevance: 2 }]) {
        expect(judgeAnswer({ transcript: LONG, questionType: "opening", kind, scores }).primaryGap).toBe(heuristicGap(scores, kind));
      }
    }
  });
});

describe("submitAnswer", () => {
  const ANSWER_BODY = { transcript: ANSWER, holdMs: 9000, captureMs: 8000, clientTurnSeq: 1 };

  function memoryStore(patch: Partial<{ status: string; state: EngineState; submitError: { code?: string; message: string } | null; winner: EngineState }> = {}) {
    const submitted: Record<string, unknown>[] = [];
    const lateScores = new Map<string, LateScore>();
    const store: TurnStore = {
      load: async () => ({
        session: { engine_state: patch.state ?? freshState(), resume_id: null, status: patch.status ?? "in_progress", role_text: null, question_plan: null },
        recentTurns: [],
      }),
      loadResume: async () => null,
      submit: async (_state, turn) => {
        submitted.push(turn);
        return { error: patch.submitError ?? null, turnId: `turn-${submitted.length}` };
      },
      reloadState: async () => patch.winner ?? null,
      saveLateScore: async (turnId, score) => {
        lateScores.set(turnId, score);
      },
    };
    return { store, submitted, lateScores };
  }

  it("saves a score that outlasted the live wait onto the turn, once it lands", async () => {
    const { store, submitted, lateScores } = memoryStore();
    let land!: (e: RawEvaluation) => void;
    const slow = new Promise<RawEvaluation>((resolve) => (land = resolve));

    const outcome = await submitAnswer(ANSWER_BODY, store, {
      runTurn: (c) => runTurn({ ...c, evaluate: () => slow, liveTimeoutMs: 5 }),
    });

    if (outcome.kind !== "saved") throw new Error("expected a saved turn");
    // Saved unscored, and the interview moved on rather than following up.
    expect(submitted[0]).toMatchObject({ scores: null, degraded_reason: "timeout", notepad_text: SCORING_LATE_LINE });
    expect(outcome.result.move).toBe("opening");
    expect(outcome.settleLate).not.toBeNull();

    land(raw(flat(4)));
    await outcome.settleLate!();
    expect(lateScores.get("turn-1")).toMatchObject({ scores: flat(4), band: "great", observation: "Clear ownership; outcome quantified" });
  });

  it("has nothing to settle when the score came back in time, or failed outright", async () => {
    const onTime = await submitAnswer(ANSWER_BODY, memoryStore().store, { runTurn: (c) => runTurn({ ...c, evaluate: async () => raw(flat(3)) }) });
    const failed = await submitAnswer(ANSWER_BODY, memoryStore().store, {
      runTurn: (c) => runTurn({ ...c, evaluate: async () => { throw new EvalError("quota", true); } }),
    });
    expect(onTime).toMatchObject({ kind: "saved", settleLate: null });
    expect(failed).toMatchObject({ kind: "saved", settleLate: null });
  });

  it("saves nothing when the late evaluation fails after all", async () => {
    const { store, lateScores } = memoryStore();
    let fail!: (e: Error) => void;
    const slow = new Promise<RawEvaluation>((_, reject) => (fail = reject));

    const outcome = await submitAnswer(ANSWER_BODY, store, {
      runTurn: (c) => runTurn({ ...c, evaluate: () => slow, liveTimeoutMs: 5 }),
    });
    if (outcome.kind !== "saved") throw new Error("expected a saved turn");

    fail(new EvalError("503"));
    await outcome.settleLate!();
    expect(lateScores.size).toBe(0);
  });

  it("saves an answered turn through the store", async () => {
    const { store, submitted } = memoryStore();
    const outcome = await submitAnswer(ANSWER_BODY, store, { runTurn: (c) => runTurn({ ...c, evaluate: async () => raw(flat(3)) }) });
    expect(outcome.kind).toBe("saved");
    expect(submitted[0]).toMatchObject({ question_text: FIRST.text, answer_transcript: ANSWER });
  });

  it("refuses a finished interview, and a turn that isn't the next one", async () => {
    expect((await submitAnswer(ANSWER_BODY, memoryStore({ status: "completed" }).store)).kind).toBe("finished");
    const stale = await submitAnswer({ ...ANSWER_BODY, clientTurnSeq: 5 }, memoryStore().store);
    expect(stale).toMatchObject({ kind: "stale", state: { turnSeq: 0 } });
  });

  it("hands back the winner's state when another submit got there first", async () => {
    const winner = { ...freshState(), turnSeq: 1 };
    const { store } = memoryStore({ submitError: { code: "PT409", message: "stale" }, winner });
    const outcome = await submitAnswer(ANSWER_BODY, store, { runTurn: (c) => runTurn({ ...c, evaluate: async () => raw(flat(3)) }) });
    expect(outcome).toEqual({ kind: "stale", state: winner });
  });

  it("reports a failed save and a failed read, and saves nothing for a nudge", async () => {
    const failing = memoryStore({ submitError: { message: "rls denied" } });
    const saved = await submitAnswer(ANSWER_BODY, failing.store, { runTurn: (c) => runTurn({ ...c, evaluate: async () => raw(flat(3)) }) });
    expect(saved).toEqual({ kind: "save-failed", reason: "rls denied", seq: 1 });
    expect(await submitAnswer(ANSWER_BODY, { ...failing.store, load: async () => ({ error: "column missing" }) })).toEqual({ kind: "load-failed", reason: "column missing" });
    const quiet = memoryStore();
    expect((await submitAnswer({ ...ANSWER_BODY, transcript: "um" }, quiet.store)).kind).toBe("nudge");
    expect(quiet.submitted).toEqual([]);
  });
});
