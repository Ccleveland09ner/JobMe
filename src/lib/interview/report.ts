/**
 * The scorecard pipeline: generate once, then serve.
 *
 * Separate from the route handler for the same reason as `turn.ts`: the parts
 * worth testing — idempotency, unscored turns never entering an average, and
 * follow-ups counting toward the question they came from — need neither HTTP
 * nor a database. The route supplies a Supabase-backed store.
 *
 * Ref: TechDesign > Report Generator; Backend brief §6.4; docs/Scoring-Rubric.md
 *
 * Idempotent at two levels: an existing report is returned with NO model call,
 * and `reports.session_id` is the primary key, so a concurrent second request
 * loses the insert and returns the winner's report instead.
 */

import {
  fallbackReport,
  generateReportText,
  pickWeakest,
  reportStats,
  type ReportDraft,
  type ReportQuestion,
  type ReportStats,
} from "../ai/report";
import { BANK } from "../engine/bank";
import type { StoredScores, TopicId } from "../engine/types";
import {
  groupIntoQuestions,
  overallScoresFor,
  rollupQuestions,
  type QuestionGroup,
} from "../stats";

export interface ReportTurnRow {
  id: string;
  seq: number;
  questionType: string | null;
  topic: string | null;
  source: string | null;
  questionText: string;
  answerTranscript: string;
  /** Null means unscored: the evaluator failed and heuristics stood in. */
  scores: StoredScores | null;
  primaryGap: string | null;
  captureMs: number | null;
}

export interface StoredReport {
  summary: string;
  /** The OPENING turn of the weakest question. */
  weakestTurnId: string | null;
  rewrite: string | null;
  stats: ReportStats;
}

export interface ReportSessionRow {
  status: "in_progress" | "completed";
  overallScores: Record<string, number> | null;
  /** The target role as the turns saw it, for the report prompt. */
  roleText?: string | null;
}

export interface ReportStore {
  loadSession(): Promise<ReportSessionRow | null>;
  loadReport(): Promise<StoredReport | null>;
  /** Ordered by seq. */
  loadTurns(): Promise<ReportTurnRow[]>;
  /** `exists` when a concurrent request inserted first. */
  insertReport(report: StoredReport): Promise<"inserted" | "exists">;
  /** Marks the session completed with its overall scores. Idempotent. */
  completeSession(overallScores: Record<string, number> | null): Promise<void>;
}

export interface ReportBody {
  summary: string;
  weakestTurnId: string | null;
  rewrite: string | null;
  stats: ReportStats;
  overallScores: Record<string, number> | null;
}

export type ReportOutcome =
  | { status: 200; body: ReportBody; generated: boolean }
  | { status: 404 | 409; body: { error: string } };

/** One grouped question in the shape the report prompt reads. */
export function reportQuestionsFor(
  groups: QuestionGroup<ReportTurnRow>[],
): (ReportQuestion & { openingId: string })[] {
  return groups.map((g, i) => ({
    ref: `Q${i + 1}`,
    openingId: g.opening.id,
    competency: BANK[g.opening.topic as TopicId]?.label ?? g.opening.topic ?? "General",
    kind: g.kind,
    parts: g.turns.map((t) => ({ question: t.questionText, answer: t.answerTranscript })),
    score: g.score,
    scores: g.scores,
  }));
}

export async function runReport(
  store: ReportStore,
  deps: { generateText?: typeof generateReportText } = {},
): Promise<ReportOutcome> {
  const [session, existing, turns] = await Promise.all([
    store.loadSession(),
    store.loadReport(),
    store.loadTurns(),
  ]);

  // RLS hides other users' sessions, so "not yours" is this same 404.
  if (!session) return { status: 404, body: { error: "Not found" } };

  // One score per ORIGINAL question — its latest cumulative evaluation — and
  // unscored questions are shown honestly but never averaged.
  const groups = groupIntoQuestions(turns);
  const rollup = rollupQuestions(groups);
  const overallScores = overallScoresFor(turns);

  if (existing) {
    // A crash between insert and completion would leave the session "in
    // progress" with a report; heal it rather than regenerate.
    if (session.status !== "completed" || !session.overallScores) {
      await store.completeSession(overallScores);
    }
    return { status: 200, body: { ...existing, overallScores }, generated: false };
  }

  // End early is allowed from one answer, but not from zero.
  if (turns.length === 0) {
    return {
      status: 409,
      body: { error: "Answer at least one question before ending the interview." },
    };
  }

  const questions = reportQuestionsFor(groups);
  const weakest = pickWeakest(questions);
  let draft: ReportDraft = { ...fallbackReport(rollup), rewrite: null };

  // No scored question means nothing to rewrite, and no reason to spend a call.
  if (weakest) {
    try {
      draft = await (deps.generateText ?? generateReportText)({
        questions,
        weakestRef: weakest.ref,
        roleText: session.roleText ?? null,
      });
    } catch (err) {
      // Everything else on the scorecard is computed in code and still renders.
      console.warn(
        `[report] text generation failed, saving the fallback: ${
          (err as Error).message?.slice(0, 200) ?? String(err)
        }`,
      );
    }
  }

  const report: StoredReport = {
    summary: draft.summary,
    weakestTurnId: weakest?.openingId ?? null,
    rewrite: draft.rewrite,
    stats: { ...reportStats(turns, rollup), feedback: draft.feedback },
  };

  const inserted = await store.insertReport(report);
  await store.completeSession(overallScores);

  if (inserted === "exists") {
    const winner = await store.loadReport();
    if (winner) {
      return { status: 200, body: { ...winner, overallScores }, generated: false };
    }
  }

  return { status: 200, body: { ...report, overallScores }, generated: true };
}
