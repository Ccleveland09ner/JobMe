/**
 * The question bank: the questions that actually recur in early-career
 * screens, at three difficulty levels, with seed follow-ups per gap.
 *
 * Ref: docs/PRD-JobMe-MVP.md > Adaptive Engine; docs/Scoring-Rubric.md
 *
 * Every topic has a KIND (types.ts TOPIC_KINDS), which picks the rubric its
 * answers are scored on, and a PURPOSE, which the scorecard shows so the
 * candidate knows what each question was assessing. Most topics are
 * behavioural; `motivation` opens every interview, and the role-specific
 * topics (technical_knowledge, product_sense, data_reasoning) are chosen by
 * role family (roles.ts).
 *
 * Openings are FIXED TEXT here. The question plan may re-word them for the
 * target job, but this text is what is asked whenever it does not — which is
 * what keeps the demo reproducible, and why a model failure can never leave
 * the interview without something to ask.
 *
 * Wording rules, from the 2026-10 audit: ask about experiences a student or
 * intern can plausibly have (school, club, work and personal projects all
 * count), and never presuppose one they may not ("the time you failed at the
 * same thing twice"), which only invites an invented story.
 *
 * `seeds.clarify` is keyed by the gap being chased, so a fallback question is
 * still aimed at the right weakness. These are used whenever a model draft is
 * rejected or the evaluator is unavailable, which on a 15 requests/minute free
 * tier is not a rare path.
 */

import { TOPICS } from "./topics";
import { levelFor, TOPIC_KINDS, type Dimension, type QuestionKind, type TopicId } from "./types";

export interface TopicEntry {
  id: TopicId;
  label: string;
  kind: QuestionKind;
  /** What the question assesses, in a phrase the candidate will read. */
  purpose: string;
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
 * fallback path when the model is rate limited. None asks for a number: a
 * clear outcome is what is missing, and a metric is only one way to give it.
 */
const GENERIC_CLARIFY: Record<Dimension, string[]> = {
  relevance: [
    "Let me bring you back to the question — can you give me one specific example?",
    "That is useful context. Could you tell me about one particular occasion?",
  ],
  specificity: [
    "Can you give me a concrete example of that?",
    "What did that look like in practice?",
  ],
  ownership: [
    "Which part of that did you do yourself?",
    "What was your own role in that, as opposed to the group's?",
  ],
  reasoning: [
    "Why did you go with that approach?",
    "How did you decide what to do there?",
  ],
  outcome: [
    "How did it turn out?",
    "How did you know it had worked?",
  ],
  accuracy: [
    "Could you walk me through how that part works?",
    "Can you say a bit more about how that works under the hood?",
  ],
  communication: [
    "Could you walk me through that again, one step at a time?",
  ],
};

/** Deepen seeds for story questions. */
const GENERIC_DEEPEN = [
  "What trade-off did you weigh there?",
  "What would you do differently if you did it again?",
  "What did that teach you about how you work?",
];

/** Deepen seeds for explain-or-approach questions, where "again" makes no sense. */
const ANALYTIC_DEEPEN = [
  "What trade-off is involved there?",
  "Where would that approach break down?",
  "What would you check to know you were right?",
];

function topic(
  id: TopicId,
  [opening, harder, hardest]: [string, string, string],
  exemplars: { weak: string; strong: string },
  clarify: Partial<Record<Dimension, string[]>> = {},
  deepen: string[] = [],
): TopicEntry {
  const kind = TOPIC_KINDS[id];
  const generic =
    kind === "technical" || kind === "problem_solving" ? ANALYTIC_DEEPEN : GENERIC_DEEPEN;
  return {
    id,
    label: TOPICS[id].label,
    kind,
    purpose: TOPICS[id].purpose,
    opening,
    harder,
    hardest,
    seeds: { deepen: [...deepen, ...generic], clarify },
    exemplars,
  };
}

export const BANK: Record<TopicId, TopicEntry> = {
  motivation: topic(
    "motivation",
    [
      "Tell me a bit about yourself and what draws you to this role.",
      "What about this role fits where you want to go next?",
      "What would you want to have learned after your first six months in this role?",
    ],
    {
      weak: "I'm passionate about technology and it seems like a great company.",
      strong:
        "I've spent the last year building scheduling tools for my university's clubs, and the part I enjoy most is talking to the people using them, which is why a role that pairs engineering with real users appeals to me.",
    },
    {
      specificity: ["What specifically about this role caught your attention?"],
      reasoning: ["How does what you have done so far connect to this role?"],
    },
    ["Which part of the work do you expect to find hardest?"],
  ),

  teamwork: topic(
    "teamwork",
    [
      "Tell me about a time you worked on a team to ship something.",
      "Tell me about a time a team you were on struggled to work together, and what you did about it.",
      "Tell me about a time you worked closely with someone whose approach was very different from yours.",
    ],
    {
      weak: "We worked as a team and fixed the bug.",
      strong:
        "Three of us split the outage: I took root cause, and I proposed bucketing over caching after we compared both on staging, which cut p99 from 1,200 ms to 340 ms.",
    },
    {
      ownership: [
        "Which part of that did you take on yourself?",
        "Where did your work end and someone else's begin?",
      ],
    },
    ["How did you divide the work, and who decided that?"],
  ),

  conflict: topic(
    "conflict",
    [
      "Tell me about a time you disagreed with a teammate, and how you handled it.",
      "Tell me about a time you disagreed with someone more experienced than you.",
      "Tell me about a disagreement that did not resolve the way you hoped.",
    ],
    {
      weak: "We had a disagreement but we talked it out and it was fine.",
      strong:
        "Our tech lead wanted to ship without migrations tested. I laid out the rollback cost, we agreed on a staging dry run, it caught two broken constraints and we shipped a day late instead of rolling back in production.",
    },
    {
      reasoning: ["What did you say to them, and why that way?"],
      outcome: ["How were things between you afterwards?"],
    },
    ["What did you understand about their position that you had missed?"],
  ),

  learning_fast: topic(
    "learning_fast",
    [
      "Tell me about a time you had to learn something quickly.",
      "Tell me about a time you had to get up to speed on an unfamiliar tool, codebase or subject.",
      "Tell me about a time you learned something quickly and got it wrong at first.",
    ],
    {
      weak: "I picked up the new framework pretty fast and it went fine.",
      strong:
        "I had four days to learn Terraform well enough to migrate our staging environment. I read the state model first rather than the syntax, which is why I caught that our modules shared a backend key before it corrupted anything.",
    },
    {
      reasoning: ["How did you decide what to learn first?"],
      outcome: ["How did you know you had learned enough?"],
    },
    ["What did you deliberately decide not to learn?"],
  ),

  handling_failure: topic(
    "handling_failure",
    [
      "Tell me about a time something you worked on did not go to plan, and what you learned from it.",
      "Tell me about a mistake you made that affected other people, and how you handled it.",
      "Tell me about a mistake you made and what you changed so it would not happen again.",
    ],
    {
      weak: "A project did not go well but I learned a lot from the experience.",
      strong:
        "I shipped a migration without a dry run and locked the orders table for eleven minutes during business hours. I wrote the incident report myself, and I now refuse to run a migration without a timing estimate on production row counts.",
    },
    {
      ownership: ["What part of that was yours to own?"],
      outcome: ["What did you change afterwards?"],
    },
    ["What is the earliest point you could have caught it?"],
  ),

  leadership: topic(
    "leadership",
    [
      "Tell me about a time you took the lead on something, formally or not.",
      "Tell me about a time you got a group moving when nobody was clearly in charge.",
      "Tell me about a time you had to make a call that not everyone agreed with.",
    ],
    {
      weak: "I was the team lead on a project and I kept everyone on track.",
      strong:
        "Nobody owned our flaky test suite, so I claimed it. I got the two loudest failures fixed first to buy credibility, then convinced the team to gate merges on it. CI trust went from roughly nobody rerunning to nobody bypassing.",
    },
    {
      ownership: ["Were you formally leading, or did you take it on?"],
      reasoning: ["How did you get people on board?"],
    },
    ["Who disagreed with you, and how did you handle that?"],
  ),

  problem_solving: topic(
    "problem_solving",
    [
      "Tell me about a time you solved a difficult problem.",
      "Tell me about a problem where your first solution did not work.",
      "Tell me about a problem where it was not clear at first how to even start.",
    ],
    {
      weak: "There was a tricky bug and I eventually figured it out.",
      strong:
        "Orders were failing intermittently with no pattern in the logs. I correlated failures against deploy times, found they clustered after cache warmups, and proved it by replaying the warmup against staging.",
    },
    {
      reasoning: ["How did you narrow it down?"],
      specificity: ["What turned out to be the actual cause?"],
    },
    ["What alternatives did you rule out, and why?"],
  ),

  persuasion: topic(
    "persuasion",
    [
      "Tell me about a time you persuaded a teammate or stakeholder to consider a different approach — how you made your case and what happened.",
      "Tell me about a time you had to convince someone more experienced than you to change course.",
      "Tell me about a time you tried to change someone's mind and did not succeed.",
    ],
    {
      weak: "I explained my idea and eventually they agreed with me.",
      strong:
        "I wanted us to drop a feature two weeks from launch. I costed the remaining work against our bug backlog and showed we would ship both late rather than one on time. The PM cut it, and we hit the date.",
    },
    {
      reasoning: ["What argument did you actually make?"],
      outcome: ["Did they change their mind? What happened next?"],
    },
    ["What would have changed your own mind?"],
  ),

  prioritisation: topic(
    "prioritisation",
    [
      "Tell me about a time you had to manage multiple competing priorities.",
      "Tell me about a time you had to tell someone their work would be delayed.",
      "Tell me about a time you got your priorities wrong, and what you changed.",
    ],
    {
      weak: "I had a lot on so I made a list and worked through it.",
      strong:
        "I had a release, a customer escalation and coursework in the same week. I asked the customer what they needed by Friday versus eventually, which turned a two-day job into a two-hour workaround, and the release held.",
    },
    {
      reasoning: ["How did you decide what came first?"],
      ownership: ["Which of those were yours to deliver?"],
    },
    ["What did you drop, and who did you tell?"],
  ),

  process_improvement: topic(
    "process_improvement",
    [
      "Tell me about a time you improved a process.",
      "Tell me about a time you improved something nobody had asked you to fix.",
      "Tell me about a change you tried to make that did not stick, and why.",
    ],
    {
      weak: "I noticed our workflow was inefficient so I made it better.",
      strong:
        "Our release checklist lived in someone's head, so releases took an afternoon. I wrote it down, then automated the four steps that were mechanical. Release time went to about twenty minutes and a second person could run it.",
    },
    {
      specificity: ["What did the process look like before?"],
      outcome: ["What was different afterwards?"],
    },
    ["How did you get the rest of the team to adopt it?"],
  ),

  pressure: topic(
    "pressure",
    [
      "Tell me about a time you had to deliver under pressure.",
      "Tell me about a time you had to deliver under pressure with incomplete information.",
      "Tell me about a time a tight deadline forced you to make a hard trade-off.",
    ],
    {
      weak: "We had a tight deadline but we pushed through and delivered.",
      strong:
        "Our demo was in six hours and auth was broken. I timeboxed the real fix to ninety minutes, and when it was not working I shipped a seeded test account instead and flagged it to the presenter so nobody improvised on stage.",
    },
    {
      reasoning: ["What did you cut, and what did you protect?"],
      outcome: ["Where did things stand at the deadline?"],
    },
    ["How did you decide what good enough looked like?"],
  ),

  technical_challenge: topic(
    "technical_challenge",
    [
      "Tell me about the most technically challenging thing you have built.",
      "Tell me about a technical decision you made that you would make differently now.",
      "Tell me about a time you had to work at the edge of what you understood.",
    ],
    {
      weak: "I built a full stack app which was pretty challenging overall.",
      strong:
        "I wrote the conflict detection for a scheduler. The naive version compared every pair of sections, so it was quadratic and timed out past about 400 sections. Bucketing by day first made it linear in practice.",
    },
    {
      specificity: ["Which part of that was actually hard?"],
      reasoning: ["How did you work out what to do?"],
    },
    ["What would you change about that design now?"],
  ),

  technical_knowledge: topic(
    "technical_knowledge",
    [
      "What happens, step by step, when you type a web address into a browser and press enter?",
      "How would you explain the difference between a process and a thread, and when each is the right choice?",
      "A web page that used to load in under a second now takes ten seconds. How would you find the cause?",
    ],
    {
      weak: "The browser just loads the website from the internet.",
      strong:
        "The browser resolves the name through DNS, opens a TCP connection with a TLS handshake for HTTPS, sends an HTTP request, then parses the HTML and fetches the CSS and scripts it references before rendering.",
    },
    {
      accuracy: ["Could you walk me through how that step works?"],
      reasoning: ["Why does it work that way?"],
      specificity: ["Can you give me an example of where that matters in practice?"],
    },
    ["Which of those steps is usually the slowest, and why?"],
  ),

  product_sense: topic(
    "product_sense",
    [
      "Pick a product you use often. What is one thing you would improve, and why?",
      "How would you decide which of two features to build first when you can only build one?",
      "A key metric for a feature dropped twenty percent last week. How would you work out why?",
    ],
    {
      weak: "I would build whichever feature users want most.",
      strong:
        "I would start from the goal the team is measured on, estimate each feature's reach and impact from tickets and usage data, ask engineering for an effort size, and pick the one that is cheaper to test if it is still close.",
    },
    {
      reasoning: ["How would you decide between those options?"],
      specificity: ["Which users would you talk to first, and what would you ask them?"],
      accuracy: ["How would you know whether that had worked?"],
    },
    ["What would make you change your mind?"],
  ),

  data_reasoning: topic(
    "data_reasoning",
    [
      "How would you check whether a dataset is reliable enough to base a decision on?",
      "How would you explain the result of an A/B test to someone without a statistics background?",
      "A dashboard metric doubled overnight. How would you work out whether the change is real?",
    ],
    {
      weak: "I would look at the data and see if it looks right.",
      strong:
        "I would check where the data comes from and how it was collected, look for missing values, duplicates and outliers, compare a sample against a source I trust, and ask whether it actually measures the decision we care about.",
    },
    {
      reasoning: ["What would you check first, and why?"],
      accuracy: ["How would you rule out a problem in the data itself?"],
      specificity: ["Which numbers would you look at?"],
    },
    ["What would you do if two sources disagreed?"],
  ),
};

/** Falls back to the generic seed when a topic has nothing specific. */
export function clarifySeeds(topicId: TopicId, gap: Dimension): string[] {
  const entry = BANK[topicId] ?? BANK.problem_solving;
  return [...(entry.seeds.clarify[gap] ?? []), ...GENERIC_CLARIFY[gap]];
}

export function deepenSeeds(topicId: TopicId): string[] {
  return (BANK[topicId] ?? BANK.problem_solving).seeds.deepen;
}

/** Question text for a topic at a difficulty level (1-3). */
export function questionFor(topicId: TopicId, difficulty: number): string {
  const entry = BANK[topicId];
  return { 1: entry.opening, 2: entry.harder, 3: entry.hardest }[levelFor(difficulty)];
}
