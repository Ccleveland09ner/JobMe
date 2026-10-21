/**
 * POST /api/sessions — create a session and return its first question.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > API Contracts; docs/Scoring-Rubric.md
 *
 * The interview is prepared here, before it starts:
 *   1. the job — title, company, posting text (pasted, or read from a link);
 *   2. role-family defaults (engine/roles.ts): motivation first, the family's
 *      own question second, then behavioural competencies for that family;
 *   3. one model call (lib/ai/question-plan.ts) that may re-choose and
 *      re-word those topics for this specific job and order the resume.
 * It is this route's only model call, it is time-boxed, and if it fails the
 * session starts on the role defaults with the job context still stored: a
 * rate limit costs polish, never the interview or its relevance to the role.
 */

import { NextResponse } from "next/server";

import {
  QUICK_PLAN_RESUME_ITEMS,
  generateQuestionPlan,
  orderResumeItems,
  plannedBankOpening,
  usableJobText,
} from "@/lib/ai/question-plan";
import { getUserOrNull, UNAUTHORIZED } from "@/lib/auth";
import { questionFor } from "@/lib/engine/bank";
import { introLineFor } from "@/lib/engine/notepad";
import { initState } from "@/lib/engine/policy";
import { defaultTopics, inferSeniority, roleFamily } from "@/lib/engine/roles";
import type { Question, ResumeItem } from "@/lib/engine/types";
import { formatRoleForPrompt, type RoleProfile } from "@/lib/jd/distill";
import { JobLinkError, fetchJobPosting } from "@/lib/job-posting";
import { formatFactsForPrompt } from "@/lib/resume/distill";
import type { ResumeFacts } from "@/lib/resume/store";
import { CreateSessionBody } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

/** A posting fetch plus one model call can outrun a platform's default. */
export const maxDuration = 30;

/** Bank threads per session, before resume coverage. */
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

  // Independent reads and the profile write, in one round trip. The resume's
  // chunks come along so the plan can quote the text behind each item.
  const [, resumeRes, postingRes] = await Promise.allSettled([
    supabase
      .from("profiles")
      .update({
        display_name: body.displayName,
        // The title only. This used to fall back to the pasted description,
        // writing up to 2000 characters into a 100-character title field.
        ...(body.targetRole && { target_role: body.targetRole }),
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

  // The candidate chose to give a link; ignoring a bad one silently would
  // start an interview that is quietly not about their job.
  if (postingRes.status === "rejected") {
    const err = postingRes.reason;
    if (err instanceof JobLinkError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }
    throw err;
  }
  const posting = postingRes.value;

  /**
   * Already ranked against the job description given at upload; the plan
   * re-orders them for THIS job. Full mode without a resume has nothing to
   * cover, so it degrades to a longer bank-led interview rather than failing.
   */
  const resume =
    resumeRes.status === "fulfilled" ? resumeRes.value.data : null;
  const uploadRanked = (resume?.coverage_items ?? []) as ResumeItem[];
  const chunks = (resume?.resume_chunks ?? []) as { seq: number; content: string }[];

  // ---- the job ------------------------------------------------------------
  const targetRole = body.targetRole ?? (posting?.title || null);
  // A stated company wins over one guessed from a link's board name.
  const company = body.company ?? posting?.company ?? null;
  const companyInferred = !body.company && Boolean(posting?.companyInferred);
  // Too short to be a description ("asdf") is treated as none at all.
  const jobText = usableJobText(posting?.text ?? body.roleText ?? null);
  const family = roleFamily(targetRole, jobText);
  const seniority = inferSeniority(targetRole, jobText);

  const defaults = defaultTopics(
    family,
    body.mode === "full" ? FULL_TOPICS : QUICK_TOPICS,
  );

  // Quick mode's cap leaves room for only a few resume threads; items past
  // those still get the deterministic opening if they are reached.
  const planItems =
    body.mode === "full"
      ? uploadRanked
      : uploadRanked.slice(0, QUICK_PLAN_RESUME_ITEMS);

  const plan = await generateQuestionPlan({
    topics: defaults,
    family,
    resumeItems: planItems.map((item) => ({
      item,
      excerpt: excerptFor(item, chunks),
    })),
    targetRole,
    company,
    companyInferred,
    jobText,
    roleSummary: resume?.role_profile
      ? formatRoleForPrompt(resume.role_profile as RoleProfile)
      : null,
    resumeFacts: resume?.resume_facts
      ? formatFactsForPrompt(resume.resume_facts as ResumeFacts)
      : null,
    seniority,
  });

  const topics = plan.order?.length ? plan.order : defaults;
  const resumeItems = orderResumeItems(uploadRanked, plan);

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
      // The plan's distilled role is what turns use; this is the fallback.
      role_text: jobText,
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
    introLine: introLineFor(
      body.displayName,
      Boolean(targetRole || jobText || planItems.length) && plan.job?.generated !== true,
    ),
    question: firstQuestion,
    /**
     * False when nothing was given to personalise, or the plan call failed;
     * the interview then runs on role-family defaults, which the setup
     * screen says.
     */
    personalized: plan.job?.generated === true,
    /** What was read from the link, so the setup screen can confirm it. */
    job: posting
      ? {
          title: posting.title,
          company: posting.company,
          companyInferred: posting.companyInferred,
          provider: posting.provider,
        }
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
