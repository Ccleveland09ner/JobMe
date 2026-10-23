/** What a resume says, distilled, and how prompts render it. Pure. */

export interface ResumeFacts {
  roles?: { title?: string; employer?: string; period?: string }[];
  projects?: string[];
  metrics?: string[];
  skills?: string[];
}

export const MAX_FACTS_CHARS = 1800;

/** Caps the object so a pathological resume cannot bloat every turn prompt. */
export function trimFacts(facts: ResumeFacts): ResumeFacts {
  const trimmed: ResumeFacts = {
    roles: (facts.roles ?? []).slice(0, 5),
    projects: (facts.projects ?? []).slice(0, 6),
    metrics: (facts.metrics ?? []).slice(0, 8),
    skills: (facts.skills ?? []).slice(0, 12),
  };

  // Drop the least load-bearing fields first if it is still too large.
  const order: (keyof ResumeFacts)[] = ["skills", "projects", "roles"];
  for (const key of order) {
    if (JSON.stringify(trimmed).length <= MAX_FACTS_CHARS) break;
    const list = trimmed[key];
    if (Array.isArray(list) && list.length > 2) {
      (trimmed[key] as unknown[]) = list.slice(0, 2);
    }
  }
  return trimmed;
}

/** Renders facts for a turn prompt. Caller wraps in `asUntrustedData`. */
export function formatFactsForPrompt(facts: ResumeFacts | null): string {
  if (!facts) return "";
  const lines: string[] = [];
  for (const role of facts.roles ?? []) {
    lines.push(
      `- ${role.title}${role.employer ? ` at ${role.employer}` : ""}` +
        `${role.period ? ` (${role.period})` : ""}`,
    );
  }
  if (facts.metrics?.length) lines.push(`Outcomes: ${facts.metrics.join("; ")}`);
  if (facts.projects?.length) lines.push(`Projects: ${facts.projects.join("; ")}`);
  if (facts.skills?.length) lines.push(`Skills: ${facts.skills.join(", ")}`);
  return lines.join("\n");
}
