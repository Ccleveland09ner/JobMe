/**
 * POST /api/sessions: create a session and its first question. The flow is
 * lib/interview/start.ts; this is auth, validation, storage and the response.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > API Contracts; docs/Scoring-Rubric.md
 */

import { NextResponse } from "next/server";

import { generateQuestionPlan } from "@/lib/ai/question-plan";
import { getUserOrNull } from "@/lib/auth";
import { defaultTopics } from "@/lib/engine/roles";
import type { CreateSessionResponse } from "@/lib/frontend/types";
import { readBody, serverError, unauthorized, unprocessable } from "@/lib/http";
import { startInterview, type StartResume, type StartStore } from "@/lib/interview/start";
import { fetchJobPosting } from "@/lib/job-posting";
import { CreateSessionBody } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

/** A posting fetch plus one model call can outrun a platform's default. */
export const maxDuration = 30;

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function POST(request: Request) {
  const user = await getUserOrNull();
  if (!user) return unauthorized();

  const parsed = await readBody(request, CreateSessionBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const outcome = await startInterview(body, {
    store: sessionStore(await createClient(), user.id),
    fetchPosting: fetchJobPosting,
    generatePlan: generateQuestionPlan,
    defaultTopics,
  });

  if (outcome.kind === "bad-link") {
    return unprocessable({ error: outcome.error.message, code: outcome.error.code });
  }
  if (outcome.kind === "failed") {
    return serverError(`[sessions] create: ${outcome.reason}`, "Couldn't start the interview. Please try again.");
  }

  const { state, posting } = outcome;
  return NextResponse.json({
    sessionId: outcome.sessionId,
    mode: state.mode,
    introLine: outcome.introLine,
    question: outcome.firstQuestion,
    /** False when nothing was given to personalise, or the plan call failed (the setup screen says so). */
    personalized: outcome.personalized,
    /** What was read from the link, so the setup screen can confirm it. */
    job: posting
      ? { title: posting.title, company: posting.company, companyInferred: posting.companyInferred, provider: posting.provider }
      : null,
    progress: {
      questionCount: state.questionCount,
      questionCap: state.questionCap,
      coverageTotal: outcome.coverageTotal,
      coverageDone: 0,
    },
  } satisfies CreateSessionResponse);
}

function sessionStore(supabase: Supabase, userId: string): StartStore {
  return {
    saveProfile: async (patch) => supabase.from("profiles").update(patch).eq("id", userId),
    async loadResume(id) {
      const { data, error } = await supabase
        .from("resumes")
        .select("coverage_items, resume_facts, role_profile, resume_chunks(seq, content)")
        .eq("id", id)
        .maybeSingle();
      // Not fatal: the interview starts without the resume, and says so in the log.
      if (error) console.warn(`[sessions] resume ${id} unreadable: ${error.message}`);
      return (data ?? null) as StartResume | null;
    },
    async insertSession(row) {
      const { data, error } = await supabase.from("interview_sessions").insert(row).select("id").single();
      return error || !data ? { error: error?.message ?? "no row returned" } : { id: data.id as string };
    },
  };
}
