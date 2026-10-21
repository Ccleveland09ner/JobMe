/**
 * Which topics an interview covers, chosen from the target job.
 *
 * Before 2026-10 a session drew its topics at random from eleven behavioural
 * ones, so a Product Manager Intern could be asked "the most technically
 * challenging thing you have built" word for word, and a Software Engineering
 * Intern was never asked anything technical. Now every interview opens with
 * motivation, includes the role family's own question when it has one, and
 * fills the rest from behavioural competencies that family is screened on.
 *
 * Deterministic apart from the injected `random`, and model-free: the
 * question plan (lib/ai/question-plan.ts) may choose differently for a
 * specific job description, but these defaults are what a session gets when
 * there is no plan, so even a rate-limited session is role-appropriate.
 *
 * Ref: docs/Scoring-Rubric.md > Question selection
 */

import type { TopicId } from "./types";

export type RoleFamily = "software" | "product" | "data" | "general";

/** Checked in order: "Data Engineer" is data, "Product Engineer" software. */
const FAMILY_PATTERNS: [RoleFamily, RegExp][] = [
  ["product", /\b(product (manager|management|owner|analyst)|apm|associate pm|pm intern)\b/i],
  ["data", /\b(data (scien\w*|analy\w*|engineer\w*)|analytics|machine learning|business intelligence|statistic\w*)\b/i],
  [
    "software",
    /\b(software|developer|programmer|swe|sde|front[- ]?end|back[- ]?end|full[- ]?stack|devops|web|mobile|ios|android|engineer\w*)\b/i,
  ],
];

/**
 * The job title decides when it matches; otherwise the opening of the job
 * description, where postings name the role. A role nothing matches is
 * `general`, which keeps the interview behavioural rather than guessing.
 */
export function roleFamily(title?: string | null, jobText?: string | null): RoleFamily {
  for (const text of [title, jobText?.slice(0, 400)]) {
    if (!text?.trim()) continue;
    for (const [family, pattern] of FAMILY_PATTERNS) {
      if (pattern.test(text)) return family;
    }
  }
  return "general";
}

/**
 * The candidate level "solid" is judged against. Null when nothing says, in
 * which case the evaluator judges against a reasonable candidate for the role
 * rather than assuming one.
 */
export function inferSeniority(title?: string | null, jobText?: string | null): string | null {
  // Only the posting's first line or so: "lead a project" further down is a
  // responsibility, not a level.
  for (const text of [title, jobText?.slice(0, 160)]) {
    if (!text?.trim()) continue;
    if (/\b(intern|internship|co-?op|placement|apprentice\w*)\b/i.test(text)) return "intern";
    if (/\b(new grad\w*|graduate|entry[- ]level|junior|jr\.?)\b/i.test(text)) return "entry-level";
    if (/\b(senior|sr\.?|staff|principal|lead|head of|director)\b/i.test(text)) return "senior";
  }
  return null;
}

/** The family's own question, asked second, right after motivation. */
export const ROLE_SPECIFIC_TOPIC: Record<RoleFamily, TopicId | null> = {
  software: "technical_knowledge",
  product: "product_sense",
  data: "data_reasoning",
  general: null,
};

export const ROLE_SPECIFIC_TOPICS: readonly TopicId[] = [
  "technical_knowledge",
  "product_sense",
  "data_reasoning",
];

/** Behavioural competencies each family is typically screened on. */
export const BEHAVIOURAL_POOL: Record<RoleFamily, TopicId[]> = {
  software: [
    "technical_challenge",
    "problem_solving",
    "teamwork",
    "learning_fast",
    "handling_failure",
    "conflict",
  ],
  product: [
    "prioritisation",
    "persuasion",
    "conflict",
    "teamwork",
    "problem_solving",
    "leadership",
  ],
  data: [
    "problem_solving",
    "persuasion",
    "learning_fast",
    "teamwork",
    "prioritisation",
    "handling_failure",
  ],
  general: [
    "teamwork",
    "problem_solving",
    "learning_fast",
    "handling_failure",
    "prioritisation",
    "leadership",
    "conflict",
    "persuasion",
    "pressure",
    "process_improvement",
  ],
};

/**
 * `count` topics in ask order: motivation, then the family's own question,
 * then behavioural ones from the family's pool in random order — which is
 * where session-to-session variety comes from.
 *
 * The role question goes SECOND, not last: quick mode's cap and the
 * bank/resume alternation can end an interview after two or three bank
 * threads, and the question that makes the interview about this role must
 * not be the one that gets cut.
 */
export function defaultTopics(
  family: RoleFamily,
  count: number,
  random: () => number = Math.random,
): TopicId[] {
  const pool = [...BEHAVIOURAL_POOL[family]];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const roleTopic = ROLE_SPECIFIC_TOPIC[family];
  const topics: TopicId[] = ["motivation", ...(roleTopic ? [roleTopic] : []), ...pool];
  return topics.slice(0, Math.max(1, count));
}

/**
 * Accepts a model's choice of topics, repaired rather than discarded: unknown
 * and repeated ids are dropped, motivation is moved to the front, a role with
 * a family question keeps one, at most two role-specific questions survive,
 * and the defaults fill whatever is left. So a plan can re-order and swap
 * competencies for a specific job, but cannot drop the parts every interview
 * needs.
 */
export function repairTopics(
  chosen: readonly string[],
  defaults: TopicId[],
  family: RoleFamily,
  known: readonly TopicId[],
): TopicId[] {
  const count = defaults.length;
  const out: TopicId[] = [];
  let roleSpecific = 0;
  for (const raw of chosen) {
    const id = raw as TopicId;
    if (!known.includes(id) || out.includes(id) || id === "motivation") continue;
    if (ROLE_SPECIFIC_TOPICS.includes(id)) {
      if (roleSpecific >= 2) continue;
      roleSpecific++;
    }
    out.push(id);
  }

  const roleTopic = ROLE_SPECIFIC_TOPIC[family];
  if (roleTopic && roleSpecific === 0) out.unshift(roleTopic);
  out.unshift("motivation");

  for (const id of defaults) {
    if (out.length >= count) break;
    if (!out.includes(id)) out.push(id);
  }
  return out.slice(0, count);
}
