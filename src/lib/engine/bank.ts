/**
 * Question bank: 5 topics x 3 difficulties, plus seed follow-ups and the
 * weak/strong exemplars the embedding anchor check compares against.
 *
 * TODO(slice 2): fill in all 5 topics.
 * Ref: docs/TechDesign-JobMe-MVP.md > Adaptive Engine > bank.ts
 *
 * Shape per topic:
 *   opening/harder/hardest  - L1/L2/L3 question text
 *   seeds.deepen[3]         - fallbacks when the LLM draft is unusable
 *   seeds.clarify[dimension]- fallback probes, keyed by the gap being chased
 *   exemplars               - one weak + one strong answer, embedded by
 *                             scripts/embed-bank.ts into data/bank-embeddings.json
 */

import type { Dimension, TopicId } from "./types";

export interface TopicEntry {
  id: TopicId;
  label: string;
  opening: string;
  harder: string;
  hardest: string;
  seeds: {
    deepen: string[];
    clarify: Partial<Record<Dimension, string[]>>;
  };
  exemplars: { weak: string; strong: string };
}

/**
 * Partial until slice 2 fills all 5 topics, then tighten to
 * Record<TopicId, TopicEntry>. Deliberately not cast to the complete type - a
 * lying type here would surface as a confusing runtime crash instead of a
 * compile error.
 */
export const BANK: Partial<Record<TopicId, TopicEntry>> = {
  // TODO(slice 2): author the real bank. One entry sketched for shape only.
  teamwork: {
    id: "teamwork",
    label: "Teamwork",
    opening: "Tell me about a time you worked on a team to ship something.",
    harder: "",
    hardest: "",
    seeds: {
      deepen: [],
      clarify: {
        ownership: ["You said the team fixed it. What did you change?"],
      },
    },
    exemplars: { weak: "", strong: "" },
  },
  // TODO(slice 2): handling_failure, technical_challenge, conflict, learning_fast
};

/** Pick 4 of the 5 topics, shuffled. Called once when a session is created. */
export function pickTopics(): TopicId[] {
  throw new Error("TODO(slice 2): pickTopics not implemented");
}

/** Question text for a topic at a difficulty level (1-3). */
export function questionFor(topic: TopicId, difficulty: number): string {
  void topic;
  void difficulty;
  throw new Error("TODO(slice 2): questionFor not implemented");
}
