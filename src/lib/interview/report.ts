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

import { evaluateAndDraft } from "../ai/evaluate";
import {
  fallbackReport,
  generateReportText,
  type ReportDraft,
  type ReportPromptQuestion,
} from "../ai/report";
import { TOPICS } from "../engine/topics";
import { QUESTION_TYPES, type QuestionType, type StoredScores, type TopicId } from "../engine/types";
import { judgeAnswer, type LateScore } from "./turn";
import {
  groupIntoQuestions,
  overallScoresFrom,
  pickWeakest,
  questionRef,
  reportStats,
  rollupQuestions,
  type QuestionGroup,
  type ReportStats,
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
  /** Stamped by the turn route on a natural wrap; End early leaves it empty. */
  endedAt?: string | null;
  /** The target role as the turns saw it, for the report prompt. */
  roleText?: string | null;
  /** The candidate's level, which a re-score is judged against like a live one. */
  seniority?: string | null;
}

/** What a re-score writes onto the turn live scoring missed: the same as a late score. */
export type Rescore = LateScore;

export interface ReportStore {
  loadSession(): Promise<ReportSessionRow | null>;
  loadReport(): Promise<StoredReport | null>;
  /** Ordered by seq. */
  loadTurns(): Promise<ReportTurnRow[]>;
  /** `exists` when a concurrent request inserted first. */
  insertReport(report: StoredReport): Promise<"inserted" | "exists">;
  /** Marks the session completed with its overall scores and end time. Idempotent. */
  completeSession(overallScores: Record<string, number> | null, endedAt: string): Promise<void>;
  /** Writes a re-score onto a still-unscored turn (rescore_turn). Throws when it could not. */
  saveRescore(turnId: string, rescore: Rescore): Promise<void>;
}

export interface ReportBody {
  summary: string;
  weakestTurnId: string | null;
  rewrite: string | null;
  stats: ReportStats;
  overallScores: Record<string, number> | null;
}

export type ReportOutcome =
  | { kind: "filed"; body: ReportBody; generated: boolean }
  /** RLS hides other users' sessions, so "not yours" is this too. */
  | { kind: "not-found" }
  /** End early is allowed from one answer, but not from zero. */
  | { kind: "nothing-answered" };

/** One grouped question in the shape the report prompt reads. */
export function reportQuestionsFor(
  groups: QuestionGroup<ReportTurnRow>[],
): (ReportPromptQuestion & { openingId: string })[] {
  return groups.map((g, i) => ({
    ref: questionRef(i),
    openingId: g.opening.id,
    competency: TOPICS[g.opening.topic as TopicId]?.label ?? g.opening.topic ?? "General",
    kind: g.kind,
    parts: g.turns.map((t) => ({ question: t.questionText, answer: t.answerTranscript })),
    score: g.score,
    scores: g.scores,
  }));
}

/**
 * A re-score has no candidate waiting on it, so it gets far longer than a live
 * turn (EVAL_TIMEOUT_MS), but the calls run side by side and must leave the
 * report text room inside the route's maxDuration.
 */
export const RESCORE_TIMEOUT_MS = 20_000;
/** Re-scores per report: the free tier allows 15 calls a minute, and the report text needs one. */
export const MAX_RESCORES = 8;

/**
 * Scores again every question live scoring missed (no scored turn), the way
 * a follow-up is scored: the whole thread against the original question. The
 * score lands on the question's last turn, which is where groupIntoQuestions
 * looks. A re-score that fails leaves the question unscored; one that cannot
 * be saved still counts in this report.
 */
export async function rescoreUnscored(
  turns: ReportTurnRow[],
  session: Pick<ReportSessionRow, "roleText" | "seniority">,
  store: Pick<ReportStore, "saveRescore">,
  evaluate: typeof evaluateAndDraft = evaluateAndDraft,
): Promise<ReportTurnRow[]> {
  const unscored = groupIntoQuestions(turns).filter((g) => !g.scores).slice(0, MAX_RESCORES);
  if (!unscored.length) return turns;

  const rescored = new Map<string, Rescore>();
  await Promise.all(
    unscored.map(async (g) => {
      const last = g.turns[g.turns.length - 1];
      const questionType: QuestionType = (QUESTION_TYPES as readonly string[]).includes(last.questionType ?? "")
        ? (last.questionType as QuestionType)
        : "opening";
      const prior = g.turns.slice(0, -1).map((t) => ({ question: t.questionText, answer: t.answerTranscript }));
      try {
        const evaluation = await evaluate({
          kind: g.kind,
          topic: TOPICS[g.opening.topic as TopicId]?.label ?? g.opening.topic ?? "General",
          questionText: g.opening.questionText,
          questionType,
          answer: last.answerTranscript,
          followUpQuestion: prior.length ? last.questionText : null,
          priorThreadTurns: prior,
          roleText: session.roleText ?? null,
          seniority: session.seniority ?? null,
          signal: AbortSignal.timeout(RESCORE_TIMEOUT_MS),
        });
        const { band, primaryGap } = judgeAnswer({
          transcript: last.answerTranscript,
          questionType,
          kind: g.kind,
          scores: evaluation.scores,
          modelOffTopic: evaluation.off_topic,
          modelGap: evaluation.clarify_gap,
        });
        const rescore = { scores: evaluation.scores, band, primaryGap, observation: evaluation.observation };
        rescored.set(last.id, rescore);
        await store.saveRescore(last.id, rescore).catch((err: unknown) => {
          console.warn(`[report] re-score of turn ${last.id} not saved: ${(err as Error).message?.slice(0, 200) ?? String(err)}`);
        });
      } catch (err) {
        console.warn(`[report] re-score of turn ${last.id} failed: ${(err as Error).message?.slice(0, 200) ?? String(err)}`);
      }
    }),
  );

  return turns.map((t) => {
    const r = rescored.get(t.id);
    return r ? { ...t, scores: r.scores, primaryGap: r.primaryGap } : t;
  });
}

export async function runReport(
  store: ReportStore,
  deps: { generateText?: typeof generateReportText; evaluate?: typeof evaluateAndDraft } = {},
): Promise<ReportOutcome> {
  const [session, existing, loaded] = await Promise.all([
    store.loadSession(),
    store.loadReport(),
    store.loadTurns(),
  ]);

  if (!session) return { kind: "not-found" };

  if (existing) {
    // A crash mid-way left a report on an in-progress session: heal it.
    const overallScores = overallScoresFrom(rollupQuestions(groupIntoQuestions(loaded)));
    if (session.status !== "completed" || !session.overallScores) {
      await store.completeSession(overallScores, session.endedAt ?? new Date().toISOString());
    }
    return { kind: "filed", body: { ...existing, overallScores }, generated: false };
  }

  if (loaded.length === 0) return { kind: "nothing-answered" };

  // Live scoring has a candidate waiting and a short timeout; filing doesn't.
  const turns = await rescoreUnscored(loaded, session, store, deps.evaluate);

  // One score per ORIGINAL question — its latest cumulative evaluation — and
  // unscored questions are shown honestly but never averaged.
  const groups = groupIntoQuestions(turns);
  const rollup = rollupQuestions(groups);
  const overallScores = overallScoresFrom(rollup);
  const complete = () => store.completeSession(overallScores, session.endedAt ?? new Date().toISOString());

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

  // Completed first: a crash between the two writes then leaves a finished
  // interview without a report, which the folder writes again, never a filed
  // report on an interview the ledger still offers to resume.
  await complete();
  const inserted = await store.insertReport(report);

  if (inserted === "exists") {
    const winner = await store.loadReport();
    if (winner) return { kind: "filed", body: { ...winner, overallScores }, generated: false };
  }

  return { kind: "filed", body: { ...report, overallScores }, generated: true };
}
