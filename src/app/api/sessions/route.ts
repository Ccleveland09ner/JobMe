/**
 * POST /api/sessions — create a session and return its first question.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > API Contracts
 */

import { NextResponse } from "next/server";

import { getUserOrNull, UNAUTHORIZED } from "@/lib/auth";
import { pickTopics, questionFor } from "@/lib/engine/bank";
import { initState } from "@/lib/engine/policy";
import type { Question, ResumeItem } from "@/lib/engine/types";
import { CreateSessionBody } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

/** Drawn from a bank of 11 — this is where session-to-session variety comes from. */
const QUICK_TOPICS = 4;
const FULL_TOPICS = 6;

export async function POST(request: Request) {
  const user = await getUserOrNull();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const parsed = CreateSessionBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", detail: parsed.error.issues },
      { status: 422 },
    );
  }
  const body = parsed.data;

  const supabase = await createClient();

  await supabase
    .from("profiles")
    .update({ display_name: body.displayName, target_role: body.roleText })
    .eq("id", user.id);

  /**
   * Already ranked against the job description at ingest. Full mode without a
   * resume has nothing to cover, so it degrades to a longer bank-led
   * interview rather than failing.
   */
  let resumeItems: ResumeItem[] = [];
  let resumeFacts: unknown = null;

  if (body.resumeId) {
    const { data: resume } = await supabase
      .from("resumes")
      .select("coverage_items, resume_facts")
      .eq("id", body.resumeId)
      .maybeSingle();

    if (resume) {
      resumeItems = (resume.coverage_items ?? []) as ResumeItem[];
      resumeFacts = resume.resume_facts;
    }
  }

  const topics = pickTopics(body.mode === "full" ? FULL_TOPICS : QUICK_TOPICS);

  const firstQuestion: Question = {
    text: questionFor(topics[0], 1),
    type: "opening",
    topic: topics[0],
    difficulty: 1,
    source: "bank",
  };

  const state = initState({
    mode: body.mode,
    topics,
    resumeItems,
    firstQuestion,
  });

  const { data: session, error } = await supabase
    .from("interview_sessions")
    .insert({
      role_text: body.roleText ?? null,
      resume_id: body.resumeId ?? null,
      engine_state: state,
      question_count: state.questionCount,
    })
    .select("id")
    .single();

  if (error || !session) {
    return NextResponse.json(
      { error: `Could not start the interview: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  void resumeFacts;

  return NextResponse.json({
    sessionId: session.id,
    mode: state.mode,
    introLine: `Thanks for making the time, ${body.displayName}. Let's get started.`,
    question: firstQuestion,
    progress: {
      questionCount: state.questionCount,
      questionCap: state.questionCap,
      coverageTotal: resumeItems.length,
      coverageDone: 0,
    },
  });
}
