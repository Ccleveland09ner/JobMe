/**
 * The interview's opening, as a real one goes: the interviewer greets the
 * candidate and asks how they are, answers in kind, introduces themselves
 * in a role that fits the job, then starts the questions.
 *
 * The candidate's reply to the greeting is small talk, so it is answered
 * here, in code, and never reaches the turn pipeline: it is not scored, not
 * counted, and not nudged for being short ("Good, you?" is a full answer).
 */

import type { RoleFamily } from "./roles";

/** The recruiter's name (PRD open question 1). */
export const INTERVIEWER_NAME = "Jordan";

/** Spoken first; the candidate answers before anything else is said. */
export function greetingLineFor(name: string): string {
  return `Hi ${name}, thanks for making the time today. How are you doing?`;
}

type Level = "junior" | "mid" | "senior";

function levelOf(seniority: string | null | undefined): Level {
  if (seniority === "intern" || seniority === "entry-level") return "junior";
  return seniority === "senior" ? "senior" : "mid";
}

/** Data roles split by title: a data engineer is interviewed by one. */
function dataSpecialty(role: string | null | undefined): string {
  if (/\bmachine learning|\bml\b/i.test(role ?? "")) return "machine learning engineer";
  if (/engineer/i.test(role ?? "")) return "data engineer";
  if (/analy/i.test(role ?? "")) return "data analyst";
  return "data scientist";
}

/**
 * Who is interviewing: someone who does the job, a level above the
 * candidate where the job says one. A role no family matches gets the
 * hiring team, rather than a guessed specialty.
 */
export function interviewerTitle(
  family: RoleFamily,
  seniority: string | null | undefined,
  role?: string | null,
): string {
  const level = levelOf(seniority);
  switch (family) {
    case "software":
      return { junior: "a software engineer on the team", mid: "a senior software engineer on the team", senior: "a staff software engineer on the team" }[level];
    case "product":
      return { junior: "a product manager on the team", mid: "a senior product manager on the team", senior: "a group product manager here" }[level];
    case "data": {
      const noun = dataSpecialty(role);
      return { junior: `a ${noun} on the team`, mid: `a senior ${noun} on the team`, senior: `the lead ${noun} on the team` }[level];
    }
    case "general":
      return level === "senior" ? "the hiring manager for this role" : "part of the hiring team";
  }
}

/** The job title as said aloud, or null when it would sound wrong ("the  role", a pasted paragraph). */
function spokenRole(role: string | null | undefined): string | null {
  const title = role?.replace(/\s+/g, " ").trim().replace(/\s+(role|position)$/i, "");
  return title && title.length <= 60 ? title : null;
}

/**
 * Said once the candidate has answered the greeting, right before the first
 * question. Says up front that any real experience counts, so a student does
 * not hear "tell me about a time" as a request for workplace stories they do
 * not have.
 */
export function introLineFor(opts: {
  family: RoleFamily;
  seniority?: string | null;
  role?: string | null;
  notTailored?: boolean;
}): string {
  const role = spokenRole(opts.role);
  return [
    `I'm ${INTERVIEWER_NAME}, ${interviewerTitle(opts.family, opts.seniority, opts.role)},`,
    role ? `and I'll be interviewing you for the ${role} role today.` : "and I'll be interviewing you today.",
    // Said out loud rather than buried in a flag nothing reads: the candidate
    // gave job details expecting a tailored interview and should know when
    // the tailoring failed.
    opts.notTailored
      ? "I couldn't tailor every question to the job details you gave this time, so some will be standard ones for this kind of role."
      : null,
    "When I ask about your experience, examples from school, work, clubs or personal projects all count.",
    "Let's get started.",
  ]
    .filter(Boolean)
    .join(" ");
}

// Reading the reply. Speech transcripts carry no punctuation, so these
// match words, never a trailing "?".
const MEETING = /\b(nice|good|great|lovely|a pleasure) to meet you( too)?\b/gi;
const ASKS_BACK =
  /\b(and you|and yourself|how about you(rself)?|what about you(rself)?|how are you|how're you|how are things|how('s| is| has) (it going|your day|your week|your morning|your afternoon)|how have you been|how you doing|you doing (ok|okay|well|good))\b/i;
/** "Good, you?": a reply that ends on "you", unless it is thanks. */
const ENDS_ON_YOU = /(?<!\b(thank|see|love|miss) )\byou(rself)?[\s?.!]*$/i;
/** Negations that mean fine, checked before "bad" is read as bad. */
const FINE_IDIOM = /\b(not (too |so |that )?bad|can'?t complain|no complaints)\b/i;
const NERVOUS = /\b(nervous|anxious|jittery|jitters|scared)\b/i;
const LOW =
  /\b(not (so |too |that |very |really )?(great|good|well|fine)|tired|exhausted|stressed|sick|unwell|rough|bad|awful|terrible|meh)\b/i;
const WELL =
  /\b(good|great|well|fine|fantastic|amazing|wonderful|excellent|awesome|ok|okay|alright|all right|excited|happy|blessed)\b/i;

/**
 * The interviewer's answer to the candidate's reply: met in kind, their mood
 * acknowledged, and "and you?" answered. Never empty.
 */
export function greetingReply(answer: string): string {
  // "Good to meet you" says nothing about how they are.
  const rest = answer.replace(MEETING, " ");
  const met = rest !== answer;
  const mood = FINE_IDIOM.test(rest)
    ? "Glad to hear it."
    : NERVOUS.test(rest)
      ? "A few nerves are completely normal. Think of this as a conversation, not a test."
      : LOW.test(rest)
        ? "Sorry to hear that. I appreciate you making the time anyway."
        : WELL.test(rest)
          ? "Glad to hear it."
          : null;
  const lines = [
    met ? "Nice to meet you too." : null,
    mood,
    ASKS_BACK.test(rest) || ENDS_ON_YOU.test(rest.trim()) ? "I'm doing great, thanks for asking." : null,
  ].filter(Boolean);
  return lines.length ? lines.join(" ") : "Nice to meet you.";
}
