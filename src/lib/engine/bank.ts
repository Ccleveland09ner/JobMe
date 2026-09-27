/**
 * The generic question bank: the behavioural questions that actually recur in
 * screens, at three difficulty levels, with seed follow-ups per gap.
 *
 * Ref: docs/PRD-JobMe-MVP.md > Adaptive Engine
 *
 * Openings are FIXED TEXT, never generated. That is what makes the demo
 * reproducible — the same scripted answer meets the same question every run —
 * and it is why a model failure can never leave the interview without
 * something to ask.
 *
 * `seeds.clarify` is keyed by the gap being chased, so a fallback question is
 * still aimed at the right weakness. These are used whenever a model draft is
 * rejected or the evaluator is unavailable, which on a 15 requests/minute free
 * tier is not a rare path.
 */

import type { Dimension, TopicId } from "./types";

export interface TopicEntry {
  id: TopicId;
  label: string;
  /** L1 / L2 / L3. Difficulty rises when a thread ends `great`. */
  opening: string;
  harder: string;
  hardest: string;
  seeds: {
    deepen: string[];
    clarify: Partial<Record<Dimension, string[]>>;
  };
  /** Anchors for the embedding cross-check. */
  exemplars: { weak: string; strong: string };
}

/**
 * Clarify seeds that apply to any topic, used when a topic has no more
 * specific seed for the gap. Every gap needs coverage, because this is the
 * fallback path when the model is rate limited.
 */
const GENERIC_CLARIFY: Record<Dimension, string[]> = {
  situation: [
    "Before we go further — what was the project, and when was this?",
    "Can you set the scene a bit more? What was going on at the time?",
  ],
  task: [
    "What exactly were you responsible for in that?",
    "What was your own remit, as opposed to the team's goal?",
  ],
  action: [
    "Walk me through what you actually did, step by step.",
    "What was the first thing you changed, and what came after?",
  ],
  result: [
    "How did it turn out? What changed as a result?",
    "What did things look like afterwards compared to before?",
  ],
  specificity: [
    "Can you give me a concrete example of that?",
    "Which system or tool was that, specifically?",
  ],
  impact: [
    "Was there a number attached to that outcome?",
    "How did you know it worked? What did you measure?",
  ],
  ownership: [
    "You said the team did that. What did you personally change?",
    "Which part of that was your own decision?",
  ],
  relevance: [
    "Let me bring you back to the question — can you give me a specific time this happened?",
    "That is useful context, but tell me about one particular occasion.",
  ],
};

/** Deepen seeds that work for any topic. */
const GENERIC_DEEPEN = [
  "What trade-off did you weigh there?",
  "What would you do differently if you ran it again?",
  "What did that teach you about how you work?",
];

function topic(
  id: TopicId,
  label: string,
  opening: string,
  harder: string,
  hardest: string,
  exemplars: { weak: string; strong: string },
  clarify: Partial<Record<Dimension, string[]>> = {},
  deepen: string[] = [],
): TopicEntry {
  return {
    id,
    label,
    opening,
    harder,
    hardest,
    seeds: {
      deepen: [...deepen, ...GENERIC_DEEPEN],
      clarify,
    },
    exemplars,
  };
}

export const BANK: Record<TopicId, TopicEntry> = {
  teamwork: topic(
    "teamwork",
    "Teamwork",
    "Tell me about a time you worked on a team to ship something.",
    "Tell me about a time a teammate was not pulling their weight.",
    "Tell me about a time you had to work with someone whose approach you disagreed with.",
    {
      weak: "We worked as a team and fixed the bug.",
      strong:
        "Three of us split the outage: I took root cause, and I proposed bucketing over caching after we compared both on staging, which cut p99 from 1,200 ms to 340 ms.",
    },
    {
      ownership: [
        "You said the team fixed it. What did you change?",
        "Where did your work end and someone else's begin?",
      ],
    },
    ["How did you divide the work, and who decided that?"],
  ),

  conflict: topic(
    "conflict",
    "Conflict",
    "Tell me about a time you faced a conflict at work or on a project.",
    "Tell me about a time you disagreed with your manager or a senior person.",
    "Tell me about a time a conflict you were in did not get resolved well.",
    {
      weak: "We had a disagreement but we talked it out and it was fine.",
      strong:
        "Our tech lead wanted to ship without migrations tested. I laid out the rollback cost, we agreed on a staging dry run, it caught two broken constraints and we shipped a day late instead of rolling back in production.",
    },
    {
      action: ["What did you actually say to them?"],
      result: ["How did the relationship look afterwards?"],
    },
    ["What did you understand about their position that you had missed?"],
  ),

  learning_fast: topic(
    "learning_fast",
    "Learning quickly",
    "Tell me about a time you had to learn something quickly.",
    "Tell me about a time you had to become productive in an unfamiliar codebase or domain.",
    "Tell me about a time you had to learn something quickly and got it wrong first.",
    {
      weak: "I picked up the new framework pretty fast and it went fine.",
      strong:
        "I had four days to learn Terraform well enough to migrate our staging environment. I read the state model first rather than the syntax, which is why I caught that our modules shared a backend key before it corrupted anything.",
    },
    {
      action: ["How did you go about learning it? What did you do first?"],
      result: ["How did you know you had learned enough?"],
    },
    ["What did you deliberately decide not to learn?"],
  ),

  handling_failure: topic(
    "handling_failure",
    "Handling failure",
    "Tell me about a time you failed, and what you learned from it.",
    "Tell me about a time your mistake affected other people.",
    "Tell me about a time you failed at the same thing twice.",
    {
      weak: "A project did not go well but I learned a lot from the experience.",
      strong:
        "I shipped a migration without a dry run and locked the orders table for eleven minutes during business hours. I wrote the incident report myself, and I now refuse to run a migration without a timing estimate on production row counts.",
    },
    {
      ownership: ["What part of that was yours to own?"],
      result: ["What did you change afterwards, concretely?"],
    },
    ["What is the earliest point you could have caught it?"],
  ),

  leadership: topic(
    "leadership",
    "Leadership",
    "Tell me about a time you showed leadership.",
    "Tell me about a time you had to lead people who did not report to you.",
    "Tell me about a time you had to make an unpopular call.",
    {
      weak: "I was the team lead on a project and I kept everyone on track.",
      strong:
        "Nobody owned our flaky test suite, so I claimed it. I got the two loudest failures fixed first to buy credibility, then convinced the team to gate merges on it. CI trust went from roughly nobody rerunning to nobody bypassing.",
    },
    {
      task: ["Were you formally leading, or did you take it on?"],
      action: ["How did you get people to follow that?"],
    },
    ["Who disagreed with you, and how did you handle that?"],
  ),

  problem_solving: topic(
    "problem_solving",
    "Problem solving",
    "Tell me about a time you solved a difficult problem.",
    "Tell me about a problem where your first solution did not work.",
    "Tell me about a problem nobody on the team knew how to approach.",
    {
      weak: "There was a tricky bug and I eventually figured it out.",
      strong:
        "Orders were failing intermittently with no pattern in the logs. I correlated failures against deploy times, found they clustered after cache warmups, and proved it by replaying the warmup against staging.",
    },
    {
      action: ["How did you narrow it down?"],
      specificity: ["What was the actual root cause?"],
    },
    ["What alternatives did you rule out, and why?"],
  ),

  persuasion: topic(
    "persuasion",
    "Persuasion",
    "Tell me about a time you had to persuade someone.",
    "Tell me about a time you had to persuade someone more senior than you.",
    "Tell me about a time you tried to persuade someone and failed.",
    {
      weak: "I explained my idea and eventually they agreed with me.",
      strong:
        "I wanted us to drop a feature two weeks from launch. I costed the remaining work against our bug backlog and showed we would ship both late rather than one on time. The PM cut it, and we hit the date.",
    },
    {
      action: ["What argument did you actually make?"],
      result: ["Did they change their mind? What happened next?"],
    },
    ["What would have changed your own mind?"],
  ),

  prioritisation: topic(
    "prioritisation",
    "Managing priorities",
    "Tell me about a time you had to manage multiple competing priorities.",
    "Tell me about a time you had to tell someone their work would be delayed.",
    "Tell me about a time you got the prioritisation wrong.",
    {
      weak: "I had a lot on so I made a list and worked through it.",
      strong:
        "I had a release, a customer escalation and coursework in the same week. I asked the customer what they needed by Friday versus eventually, which turned a two-day job into a two-hour workaround, and the release held.",
    },
    {
      action: ["How did you decide what came first?"],
      task: ["Which of those were actually yours to deliver?"],
    },
    ["What did you drop, and who did you tell?"],
  ),

  process_improvement: topic(
    "process_improvement",
    "Improving a process",
    "Tell me about a time you improved a process.",
    "Tell me about a time you improved something nobody had asked you to fix.",
    "Tell me about a process change you made that did not stick.",
    {
      weak: "I noticed our workflow was inefficient so I made it better.",
      strong:
        "Our release checklist lived in someone's head, so releases took an afternoon. I wrote it down, then automated the four steps that were mechanical. Release time went to about twenty minutes and a second person could run it.",
    },
    {
      situation: ["What did the process look like before?"],
      impact: ["How much time or cost did that actually save?"],
    },
    ["How did you get the rest of the team to adopt it?"],
  ),

  pressure: topic(
    "pressure",
    "Delivering under pressure",
    "Tell me about a time you had to deliver under pressure.",
    "Tell me about a time you had to deliver under pressure with incomplete information.",
    "Tell me about a time the pressure got to you.",
    {
      weak: "We had a tight deadline but we pushed through and delivered.",
      strong:
        "Our demo was in six hours and auth was broken. I timeboxed the real fix to ninety minutes, and when it was not working I shipped a seeded test account instead and flagged it to the presenter so nobody improvised on stage.",
    },
    {
      action: ["What did you cut, and what did you protect?"],
      result: ["Did it land? What was the state of it at the deadline?"],
    },
    ["How did you decide what good enough looked like?"],
  ),

  technical_challenge: topic(
    "technical_challenge",
    "Technical challenge",
    "Tell me about the most technically challenging thing you have built.",
    "Tell me about a technical decision you made that you later regretted.",
    "Tell me about a time you had to work at the edge of what you understood.",
    {
      weak: "I built a full stack app which was pretty challenging overall.",
      strong:
        "I wrote the conflict detection for a scheduler. The naive version compared every pair of sections, so it was quadratic and timed out past about 400 sections. Bucketing by day first made it linear in practice.",
    },
    {
      specificity: ["Which part of that was actually hard?"],
      action: ["What did you have to figure out that you did not already know?"],
    },
    ["What would you change about that design now?"],
  ),
};

/** Falls back to the generic seed when a topic has nothing specific. */
export function clarifySeeds(topicId: TopicId, gap: Dimension): string[] {
  return [...(BANK[topicId].seeds.clarify[gap] ?? []), ...GENERIC_CLARIFY[gap]];
}

export function deepenSeeds(topicId: TopicId): string[] {
  return BANK[topicId].seeds.deepen;
}

/** Question text for a topic at a difficulty level (1-3). */
export function questionFor(topicId: TopicId, difficulty: number): string {
  const entry = BANK[topicId];
  if (difficulty >= 3) return entry.hardest;
  if (difficulty === 2) return entry.harder;
  return entry.opening;
}

/**
 * Picks `count` topics at random.
 *
 * Randomised once at session creation and captured into `EngineState.topics`,
 * never re-rolled — `step()` must stay pure, and a session that reshuffled its
 * own topics on reload would be unresumable.
 */
export function pickTopics(count: number, exclude: TopicId[] = []): TopicId[] {
  const pool = (Object.keys(BANK) as TopicId[]).filter(
    (t) => !exclude.includes(t),
  );
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
