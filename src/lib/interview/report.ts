/**
 * The scorecard pipeline: generate once, then serve.
 *
 * Separate from the route handler for the same reason as `turn.ts`: the parts
 * worth testing — idempotency, and unscored turns never entering an average —
 * need neither HTTP nor a database. The route supplies a Supabase-backed store.
 *
 * Ref: TechDesign > Report Generator; Backend brief §6.4
 *
 * Idempotent at two levels: an existing report is returned with NO model call,
 * and `reports.session_id` is the primary key, so a concurrent second request
 * loses the insert and returns the winner's report instead.
 */

import {
  fallbackSummary,
  generateReportText,
  pickWeakestTurn,
  reportStats,
  type ReportDraft,
  type ReportStats,
} from "../ai/report";
import type { Dimension, Scores } from "../engine/types";
import { averageScores } from "../stats";

export interface ReportTurnRow {
  id: string;
  seq: number;
  questionText: string;
  answerTranscript: string;
  /** Null means unscored: the evaluator failed and heuristics stood in. */
  scores: Scores | null;
  primaryGap: Dimension | null;
  captureMs: number | null;
}

export interface StoredReport {
  summary: string;
  weakestTurnId: string | null;
  rewrite: string | null;
  stats: ReportStats;
}

export interface ReportSessionRow {
  status: "in_progress" | "completed";
  overallScores: Record<string, number> | null;
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

  // Scored turns only — unscored ones are shown honestly but never averaged.
  const overallScores = averageScores(turns);

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

  const weakest = pickWeakestTurn(turns);
  let draft: ReportDraft = {
    summary: fallbackSummary(overallScores, turns.length),
    rewrite: null,
  };

  // No scored turn means nothing to rewrite, and no reason to spend a call.
  if (weakest) {
    try {
      draft = await (deps.generateText ?? generateReportText)({
        weakestQuestion: weakest.questionText,
        weakestAnswer: weakest.answerTranscript,
        turnCount: turns.length,
        weakestGap: weakest.primaryGap,
      });
    } catch (err) {
      // Everything else on the scorecard is computed in code and still renders.
      console.warn(
        `[report] text generation failed, saving without a rewrite: ${
          (err as Error).message?.slice(0, 200) ?? String(err)
        }`,
      );
    }
  }

  const report: StoredReport = {
    summary: draft.summary,
    weakestTurnId: weakest?.id ?? null,
    rewrite: draft.rewrite,
    stats: reportStats(turns),
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
