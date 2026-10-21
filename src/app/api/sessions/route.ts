/**
 * POST /api/sessions: create a session and its first question. With anything
 * to personalise, one time-boxed model call writes the thread openings; if it
 * fails, the fixed bank text is used.
 */

import { NextResponse } from "next/server";

import {
  QUICK_PLAN_RESUME_ITEMS,
  generateQuestionPlan,
  plannedBankOpening,
} from "@/lib/ai/question-plan";
import { getUserOrNull, UNAUTHORIZED } from "@/lib/auth";
import { pickTopics, questionFor } from "@/lib/engine/bank";
import { initState } from "@/lib/engine/policy";
import type { Question, ResumeItem } from "@/lib/engine/types";
import { formatRoleForPrompt, type RoleProfile } from "@/lib/jd/distill";
import { JobLinkError, fetchJobPosting } from "@/lib/job-posting";
import { formatFactsForPrompt } from "@/lib/resume/distill";
import type { ResumeFacts } from "@/lib/resume/store";
import { CreateSessionBody, LIMITS } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

/** A posting fetch plus one model call can outrun a platform's default. */
export const maxDuration = 30;

/** Drawn from a bank of 11 — this is where session-to-session variety comes from. */
const QUICK_TOPICS = 4;
const FULL_TOPICS = 6;

/** Resume text per item in the plan prompt: enough for a specific question. */
const EXCERPT_CHARS = 600;

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

  // Reads and the profile write in one round trip (chunks let the plan quote the resume).
  const [, resumeRes, postingRes] = await Promise.allSettled([
    supabase
      .from("profiles")
      .update({
        display_name: body.displayName,
        target_role: body.targetRole ?? body.roleText,
      })
      .eq("id", user.id),
    body.resumeId
      ? supabase
          .from("resumes")
          .select(
            "coverage_items, resume_facts, role_profile, resume_chunks(seq, content)",
          )
          .eq("id", body.resumeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    body.jobUrl ? fetchJobPosting(body.jobUrl) : Promise.resolve(null),
  ]);

  // A bad link is an error, never silently ignored.
  if (postingRes.status === "rejected") {
    const err = postingRes.reason;
    if (err instanceof JobLinkError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }
    throw err;
  }
  const posting = postingRes.value;

  /** Ranked at ingest. Full mode without a resume becomes a longer bank-led interview. */
  const resume =
    resumeRes.status === "fulfilled" ? resumeRes.value.data : null;
  const resumeItems = (resume?.coverage_items ?? []) as ResumeItem[];
  const chunks = (resume?.resume_chunks ?? []) as { seq: number; content: string }[];

  const topics = pickTopics(body.mode === "full" ? FULL_TOPICS : QUICK_TOPICS);
  const jobText = posting?.text ?? body.roleText ?? null;

  // Quick mode plans only a few resume threads; later ones get the fixed opening.
  const planItems =
    body.mode === "full"
      ? resumeItems
      : resumeItems.slice(0, QUICK_PLAN_RESUME_ITEMS);

  const plan = await generateQuestionPlan({
    topics,
    resumeItems: planItems.map((item) => ({
      item,
      excerpt: excerptFor(item, chunks),
    })),
    targetRole: body.targetRole ?? posting?.title ?? null,
    company: posting?.company ?? null,
    jobText,
    roleSummary: resume?.role_profile
      ? formatRoleForPrompt(resume.role_profile as RoleProfile)
      : null,
    resumeFacts: resume?.resume_facts
      ? formatFactsForPrompt(resume.resume_facts as ResumeFacts)
      : null,
  });

  const firstQuestion: Question = {
    text:
      plannedBankOpening(plan, topics[0], 1, []) ?? questionFor(topics[0], 1),
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
      // Capped as if pasted; the plan's role summary is what turns use.
      role_text: jobText ? jobText.slice(0, LIMITS.roleText) : null,
      job_url: body.jobUrl ?? null,
      question_plan: plan,
      resume_id: body.resumeId ?? null,
      engine_state: state,
      question_count: state.questionCount,
    })
    .select("id")
    .single();

  if (error || !session) {
    // The detail is for the server log only — never the candidate's screen.
    console.error(`[sessions] create: ${error?.message ?? "no row returned"}`);
    return NextResponse.json(
      { error: "Couldn't start the interview. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    sessionId: session.id,
    mode: state.mode,
    introLine: `Thanks for making the time, ${body.displayName}. Let's get started.`,
    question: firstQuestion,
    /** False when nothing was given to personalise, or the plan call failed. */
    personalized: plan !== null,
    /** What was read from the link, so the setup screen can confirm it. */
    job: posting
      ? { title: posting.title, company: posting.company, provider: posting.provider }
      : null,
    progress: {
      questionCount: state.questionCount,
      questionCap: state.questionCap,
      coverageTotal: resumeItems.length,
      coverageDone: 0,
    },
  });
}

/** The resume text behind an item, from the chunks it was built from. */
function excerptFor(
  item: ResumeItem,
  chunks: { seq: number; content: string }[],
): string {
  const text = chunks
    .filter((c) => item.chunkSeqs.includes(c.seq))
    .sort((a, b) => a.seq - b.seq)
    .map((c) => c.content.replace(/\s+/g, " ").trim())
    .join(" ")
    .slice(0, EXCERPT_CHARS);
  return text || item.label;
}
