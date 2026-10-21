/**
 * The dashboard, shown as the ledger on the front desk: the user's interviews
 * in volumes of six (`?page=`), newest first, each with its questions, answer
 * excerpts and notes. RLS scopes rows to the user. Without `?open=ledger` the
 * desk is shown and the ledger stays shut, so nothing is fetched.
 */

import { redirect } from "next/navigation";

import type { TrendPoint } from "@/components/dashboard/TrendChart";
import { Ledger } from "@/components/desk/Ledger";
import { requireUser } from "@/lib/auth";
import { FULL_QUESTION_CAP_MAX } from "@/lib/engine/types";
import { pickScores } from "@/lib/frontend/adapters";
import {
  ledgerEntries,
  ledgerVolumeHref,
  type LedgerReportRow,
  type LedgerSessionRow,
  type LedgerTurnRow,
} from "@/lib/frontend/ledger";
import { clampPage, pageCount, rowRange } from "@/lib/frontend/pagination";
import { createClient } from "@/lib/supabase/server";

/** Interviews per volume of the ledger. */
const VOLUME_SIZE = 6;

/** Completed sessions plotted on the trend chart, most recent. */
const TREND_LIMIT = 20;

const SESSION_COLUMNS =
  "id, status, question_count, overall_scores, started_at, ended_at, mode:engine_state->>mode, role_title:question_plan->role->>title";

const TURN_COLUMNS =
  "id, session_id, seq, topic, question_type, question_source, question_text, answer_transcript, scores, band, primary_gap, evidence, notepad_text, reason_text";

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const { open, page: pageParam, section, entry } = await searchParams;
  if (one(open) !== "ledger") return null;
  const supabase = await createClient();

  const [totalRes, trendRes, profileRes] = await Promise.all([
    supabase.from("interview_sessions").select("id", { count: "exact", head: true }),
    supabase
      .from("interview_sessions")
      .select("id, started_at, overall_scores", { count: "exact" })
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(TREND_LIMIT),
    // Not essential: without it the ledger just doesn't say whose it is.
    supabase.from("profiles").select("username, member_code").eq("id", user.id).maybeSingle(),
  ]);
  const profile = profileRes.error ? null : (profileRes.data as { username: string | null; member_code: string } | null);
  if (totalRes.error) throw new Error(`dashboard count: ${totalRes.error.message}`);
  if (trendRes.error) throw new Error(`dashboard trend: ${trendRes.error.message}`);

  const total = totalRes.count ?? 0;
  const completed = trendRes.count ?? 0;
  const volumes = pageCount(total, VOLUME_SIZE);
  const volume = clampPage(one(pageParam), volumes);

  // Normalise a volume that no longer exists (e.g. after a delete).
  if (pageParam !== undefined && String(volume) !== String(one(pageParam))) {
    redirect(ledgerVolumeHref(volume));
  }

  const [from, to] = rowRange(volume, VOLUME_SIZE);
  const { data: rows, error } = total
    ? await supabase
        .from("interview_sessions")
        .select(SESSION_COLUMNS)
        .order("started_at", { ascending: false })
        .range(from, to)
    : { data: [], error: null };
  if (error) throw new Error(`dashboard sessions: ${error.message}`);
  const sessions = (rows ?? []) as unknown as LedgerSessionRow[];
  const ids = sessions.map((s) => s.id);

  const [turnsRes, reportsRes] = ids.length
    ? await Promise.all([
        supabase
          .from("turns")
          .select(TURN_COLUMNS)
          .in("session_id", ids)
          .order("seq", { ascending: true })
          .limit(VOLUME_SIZE * FULL_QUESTION_CAP_MAX),
        supabase.from("reports").select("session_id, summary, stats").in("session_id", ids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (turnsRes.error) throw new Error(`dashboard turns: ${turnsRes.error.message}`);
  // Not essential: without them the ledger just doesn't quote the summaries.
  const reports = reportsRes.error ? [] : ((reportsRes.data ?? []) as unknown as LedgerReportRow[]);

  const entries = ledgerEntries(sessions, (turnsRes.data ?? []) as unknown as LedgerTurnRow[], reports);

  const trendRows = (trendRes.data ?? []) as { id: string; started_at: string; overall_scores: unknown }[];
  const trend: TrendPoint[] = trendRows
    .map((r) => ({ id: r.id, startedAt: r.started_at, scores: pickScores(r.overall_scores) }))
    .reverse();

  return (
    <Ledger
      owner={profile ? { username: profile.username, memberCode: profile.member_code } : null}
      volume={{ number: volume, count: volumes, offset: from, total }}
      entries={entries}
      progress={{
        completed,
        inProgress: Math.max(0, total - completed),
        latestScores: trend.at(-1)?.scores ?? null,
      }}
      trend={trend}
      // A volume link (?page=) opens at the contents.
      link={{ section: one(section) ?? (pageParam !== undefined ? "history" : undefined), entry: one(entry) }}
    />
  );
}
