/**
 * POST /api/sessions: create a session and its first question. The flow is
 * lib/interview/start.ts; this is auth, validation, storage and the response.
 */

import { NextResponse } from "next/server";

import { generateQuestionPlan } from "@/lib/ai/question-plan";
import { getUserOrNull } from "@/lib/auth";
import { pickTopics } from "@/lib/engine/bank";
import { readBody, serverError, unauthorized } from "@/lib/http";
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
    pickTopics,
  });

  if (outcome.kind === "bad-link") {
    return NextResponse.json({ error: outcome.error.message, code: outcome.error.code }, { status: 422 });
  }
  if (outcome.kind === "failed") {
    return serverError(`[sessions] create: ${outcome.reason}`, "Couldn't start the interview. Please try again.");
  }

  const { state, posting } = outcome;
  return NextResponse.json({
    sessionId: outcome.sessionId,
    mode: state.mode,
    introLine: `Thanks for making the time, ${body.displayName}. Let's get started.`,
    question: outcome.firstQuestion,
    /** False when nothing was given to personalise, or the plan call failed. */
    personalized: outcome.plan !== null,
    /** What was read from the link, so the setup screen can confirm it. */
    job: posting ? { title: posting.title, company: posting.company, provider: posting.provider } : null,
    progress: {
      questionCount: state.questionCount,
      questionCap: state.questionCap,
      coverageTotal: outcome.coverageTotal,
      coverageDone: 0,
    },
  });
}

function sessionStore(supabase: Supabase, userId: string): StartStore {
  return {
    saveProfile: async (patch) => supabase.from("profiles").update(patch).eq("id", userId),
    async loadResume(id) {
      const { data } = await supabase
        .from("resumes")
        .select("coverage_items, resume_facts, role_profile, resume_chunks(seq, content)")
        .eq("id", id)
        .maybeSingle();
      return (data ?? null) as StartResume | null;
    },
    async insertSession(row) {
      const { data, error } = await supabase.from("interview_sessions").insert(row).select("id").single();
      return error || !data ? { error: error?.message ?? "no row returned" } : { id: data.id as string };
    },
  };
}
