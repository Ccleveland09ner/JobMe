/** A distilled job description, and how prompts and ranking render it. Pure. */

export interface RoleProfile {
  title: string;
  seniority: string;
  /** Skills and technologies the posting asks for, most emphasised first. */
  requiredSkills: string[];
  /** What the person will actually be doing. */
  responsibilities: string[];
  /** Competencies worth probing behaviourally, e.g. "cross-team influence". */
  competencies: string[];
}

/** The text resume items are ranked against: skills and responsibilities, not just the title. */
export function roleProfileToQuery(profile: RoleProfile): string {
  return [
    profile.title,
    profile.seniority,
    ...profile.requiredSkills,
    ...profile.responsibilities,
  ]
    .filter(Boolean)
    .join(". ");
}

/** Renders the role for a turn prompt. Caller wraps in `asUntrustedData`. */
export function formatRoleForPrompt(profile: RoleProfile | null): string {
  if (!profile) return "";
  const level = profile.seniority?.trim();
  const parts = [`Target role: ${profile.title}${level ? ` (${level})` : ""}`];
  if (profile.requiredSkills.length) {
    parts.push(`Wants: ${profile.requiredSkills.join(", ")}`);
  }
  if (profile.competencies.length) {
    parts.push(`Competencies to probe: ${profile.competencies.join(", ")}`);
  }
  return parts.join("\n");
}
