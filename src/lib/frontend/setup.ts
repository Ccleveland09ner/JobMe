/**
 * The setup clipboard's sheets and their checks (pure). The checks mirror
 * CreateSessionBody and the job-link allowlist, so a sheet only turns when
 * the server would accept what is written on it.
 */

import type { InterviewMode } from "../engine/types";
import { JobLinkError, resolveJobLink } from "../job-posting";
import { LIMITS } from "../schemas";

export const SETUP_SHEETS = [
  { id: "you", title: "About you" },
  { id: "job", title: "The job" },
  { id: "resume", title: "Your resume" },
  { id: "mic", title: "Microphone" },
  { id: "review", title: "Ready to begin?" },
] as const;

export const REVIEW_SHEET = SETUP_SHEETS.length - 1;

export type JobSource = "paste" | "link";

export interface JobValue {
  targetRole: string;
  /** Optional; a posting link usually supplies it, and a stated one wins. */
  company: string;
  source: JobSource;
  roleText: string;
  jobUrl: string;
}

export type UploadStatus = "idle" | "uploading" | "error" | "review" | "ready";

/** The resume choice, with how far a new upload has got. */
export type ResumeState =
  | { choice: "existing"; resumeId: string }
  | { choice: "none" }
  | { choice: "upload"; status: UploadStatus; resumeId: string | null };

export interface SetupValues {
  displayName: string;
  job: JobValue;
  resume: ResumeState;
  mode: InterviewMode;
}

export type SetupField = "displayName" | "targetRole" | "company" | "roleText" | "jobUrl" | "resume";
export type SetupErrors = Partial<Record<SetupField, string>>;

export function resumeIdOf(resume: ResumeState): string | null {
  if (resume.choice === "existing") return resume.resumeId;
  return resume.choice === "upload" && resume.status === "ready" ? resume.resumeId : null;
}

function linkProblem(url: string): string | null {
  if (url.length > LIMITS.jobUrl) return `Keep the link to ${LIMITS.jobUrl} characters.`;
  if (!/^https?:\/\//i.test(url)) return "Enter the whole link, starting with https://.";
  try {
    resolveJobLink(url);
    return null;
  } catch (e) {
    return e instanceof JobLinkError ? e.message : "We can't read that link. Paste the job description instead.";
  }
}

function resumeProblem(resume: ResumeState): string | null {
  if (resume.choice !== "upload") return null;
  switch (resume.status) {
    case "ready":
      return null;
    case "uploading":
      return "Your resume is still uploading. Wait for it to finish.";
    case "review":
      return "Check the text we read from your resume, then confirm it or upload a different file.";
    default:
      return "Choose a PDF to upload, or pick No resume.";
  }
}

/** What is wrong on one sheet; empty when it can be turned. */
export function validateSetupSheet(sheet: number, values: SetupValues): SetupErrors {
  const errors: SetupErrors = {};
  const { job } = values;
  if (SETUP_SHEETS[sheet]?.id === "you") {
    const name = values.displayName.trim();
    if (!name) errors.displayName = "Tell the recruiter what to call you.";
    else if (name.length > LIMITS.displayName) errors.displayName = `Keep it to ${LIMITS.displayName} characters.`;
  }
  if (SETUP_SHEETS[sheet]?.id === "job") {
    if (job.targetRole.trim().length > LIMITS.targetRole)
      errors.targetRole = `Keep the job title to ${LIMITS.targetRole} characters.`;
    if (job.company.trim().length > LIMITS.company)
      errors.company = `Keep the company name to ${LIMITS.company} characters.`;
    if (job.source === "paste" && job.roleText.length > LIMITS.roleText)
      errors.roleText = `Keep the description to ${LIMITS.roleText.toLocaleString("en")} characters.`;
    const url = job.jobUrl.trim();
    const problem = job.source === "link" && url ? linkProblem(url) : null;
    if (problem) errors.jobUrl = problem;
  }
  if (SETUP_SHEETS[sheet]?.id === "resume") {
    const problem = resumeProblem(values.resume);
    if (problem) errors.resume = problem;
  }
  return errors;
}

/** The first sheet with something to fix, and what; null when all is well. */
export function validateSetup(values: SetupValues): { sheet: number; errors: SetupErrors } | null {
  for (let sheet = 0; sheet < SETUP_SHEETS.length; sheet++) {
    const errors = validateSetupSheet(sheet, values);
    if (Object.keys(errors).length) return { sheet, errors };
  }
  return null;
}

/** The POST /api/sessions body (CreateSessionBody); one job source only. */
export function sessionBody(values: SetupValues) {
  const { job } = values;
  const targetRole = job.targetRole.trim();
  const company = job.company.trim();
  const roleText = job.source === "paste" ? job.roleText.trim() : "";
  const jobUrl = job.source === "link" ? job.jobUrl.trim() : "";
  const resumeId = resumeIdOf(values.resume);
  return {
    displayName: values.displayName.trim(),
    mode: values.mode,
    ...(targetRole && { targetRole }),
    ...(company && { company }),
    ...(roleText && { roleText }),
    ...(jobUrl && { jobUrl }),
    ...(resumeId && { resumeId }),
  };
}
