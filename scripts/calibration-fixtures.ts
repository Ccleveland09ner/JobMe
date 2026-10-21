/**
 * Reproducible calibration fixtures for the evaluator and the question plan.
 *
 * Each answer is written to a known quality level, so a run checks ORDER and
 * RANGES rather than whether scores went up. `scripts/calibrate-evaluator.ts`
 * and `scripts/compare-plans.ts` both read these, so a before/after
 * comparison always uses identical inputs.
 *
 * Nothing here is tuned to make answers score higher. The expectations
 * describe what a fair structured interviewer would conclude, including the
 * answers that SHOULD score low.
 */

export type FixtureKind =
  | "behavioral"
  | "resume"
  | "technical"
  | "problem_solving"
  | "motivational";

export interface RoleContext {
  id: "swe_intern" | "pm_intern";
  title: string;
  company: string | null;
  seniority: string;
  /** What a job posting would supply. */
  jobText: string;
}

export interface AnswerFixture {
  id: string;
  role: RoleContext["id"];
  /** The quality level this answer was written to. */
  level:
    | "strong"
    | "good_not_star"
    | "concise_complete"
    | "evasive"
    | "partial"
    | "incorrect"
    | "strong_technical"
    | "transcription_errors";
  topic: string;
  kind: FixtureKind;
  question: string;
  answer: string;
  /** Set when this fixture is a voice-transcript twin of another one. */
  cleanTwinOf?: string;
}

export const SWE_INTERN: RoleContext = {
  id: "swe_intern",
  title: "Software Engineering Intern",
  company: "Northwind Labs",
  seniority: "intern",
  jobText: [
    "Software Engineering Intern (Summer). Northwind Labs builds scheduling",
    "software for clinics. As an intern you will join a product team and ship",
    "features in our TypeScript and React web app and our Node.js services.",
    "Responsibilities: write and review code with your mentor; fix bugs and",
    "write tests; take a small feature from design to production; take part",
    "in code review and stand-ups. Requirements: currently pursuing a degree",
    "in computer science or a related field; experience with at least one",
    "programming language through coursework or projects; understanding of",
    "data structures, algorithms and how the web works; curiosity and a",
    "willingness to ask questions. Nice to have: SQL, Git, any web framework.",
  ].join(" "),
};

export const PM_INTERN: RoleContext = {
  id: "pm_intern",
  title: "Product Manager Intern",
  company: null,
  seniority: "intern",
  jobText: [
    "Product Manager Intern. Work with designers, engineers and customer",
    "support to improve our mobile banking app for first-time account",
    "holders. Responsibilities: interview users and synthesise what you",
    "learn; write clear problem statements and requirements; help prioritise",
    "the backlog by weighing user impact against engineering effort; define",
    "success metrics and read experiment results; present recommendations to",
    "stakeholders. Requirements: pursuing a degree in any field; strong",
    "written and verbal communication; comfort with data and spreadsheets;",
    "evidence of leading a project, club or initiative. No coding required.",
  ].join(" "),
};

export const ROLES: Record<RoleContext["id"], RoleContext> = {
  swe_intern: SWE_INTERN,
  pm_intern: PM_INTERN,
};

const PERSUADE =
  "Tell me about a time you persuaded a teammate or stakeholder to consider a different approach — how you made your case and what happened.";
const URL_QUESTION =
  "What happens, step by step, when you type a web address into a browser and press enter?";

export const ANSWERS: AnswerFixture[] = [
  // ---- Software Engineering Intern -----------------------------------------
  {
    id: "swe_strong",
    role: "swe_intern",
    level: "strong",
    topic: "teamwork",
    kind: "behavioral",
    question: "Tell me about a time you worked on a team to ship something.",
    answer:
      "Our checkout service was timing out at peak, about 3% of orders " +
      "failing. Three of us split it up: one on monitoring, one on the " +
      "rollback plan, and I took the root cause. I profiled it and found the " +
      "conflict detection compared every pair of line items, so it was " +
      "quadratic. I proposed bucketing by SKU; our tech lead pushed for " +
      "caching instead, so I built both behind a flag and we compared them on " +
      "staging traffic. Bucketing won because the catalog changed hourly and " +
      "a stale cache shipped wrong prices. I paired with the monitoring owner " +
      "to add p99 alerts before we rolled out. p99 went from 1,200 ms to " +
      "340 ms, failed orders under 0.1%, and it held through Black Friday.",
  },
  {
    id: "swe_good_not_star",
    role: "swe_intern",
    level: "good_not_star",
    topic: "persuasion",
    kind: "behavioral",
    question: PERSUADE,
    answer:
      "The group ended up switching to Postgres, and the scheduling feature " +
      "we added later was much easier because of it. What happened was our " +
      "class project team wanted MongoDB because it felt quicker to start " +
      "with. I thought our data was really relational — students, courses " +
      "and sections all point at each other — so I wrote the three queries " +
      "we would need most in both databases and showed them side by side at " +
      "our next meeting. Seeing the joins next to the nested lookups is what " +
      "convinced them, and I offered to set up the schema so nobody lost time.",
  },
  {
    id: "swe_transcribed",
    role: "swe_intern",
    level: "transcription_errors",
    topic: "persuasion",
    kind: "behavioral",
    question: PERSUADE,
    cleanTwinOf: "swe_good_not_star",
    // Lowercase and unpunctuated, as Chrome's recogniser returns it, with
    // misheard terms ("post grass", "mongo d b") and non-native grammar.
    answer:
      "the group end up switching to post grass and the scheduling feature " +
      "we add later was much more easier because of it what happened was our " +
      "class project team want mongo d b because it feel quicker to start " +
      "with i was thinking our data is really relational students courses " +
      "and sections all pointing at each other so i have write the three " +
      "queries we would need most in both database and show them side by " +
      "side in our next meeting seeing the joins next to the nested lookups " +
      "is what convince them and i offer to set up the schema so nobody lose time",
  },
  {
    id: "swe_concise",
    role: "swe_intern",
    level: "concise_complete",
    topic: "learning_fast",
    kind: "behavioral",
    question: "Tell me about a time you had to learn something quickly.",
    answer:
      "In my internship I had a week to learn Docker. I did the official " +
      "tutorial, then containerised our Flask app myself and asked a senior " +
      "engineer to review it. By Friday the team was using my setup for " +
      "local development.",
  },
  {
    id: "swe_evasive",
    role: "swe_intern",
    level: "evasive",
    topic: "teamwork",
    kind: "behavioral",
    question: "Tell me about a time you worked on a team to ship something.",
    answer:
      "I think teamwork is really important. I always try to be a good team " +
      "player and communicate well with everyone, because when everyone is " +
      "on the same page things go much smoother and the project is more " +
      "successful in the end. I am also very flexible.",
  },
  {
    id: "swe_partial",
    role: "swe_intern",
    level: "partial",
    topic: "handling_failure",
    kind: "behavioral",
    question: "Tell me about a time you failed, and what you learned from it.",
    answer:
      "In my data structures class I underestimated how long the final " +
      "project would take. I started about a week late because I had other " +
      "assignments, and then I had to stay up two nights in a row to finish " +
      "the hash table implementation and write the test cases for it.",
  },
  {
    id: "swe_incorrect",
    role: "swe_intern",
    level: "incorrect",
    topic: "technical_knowledge",
    kind: "technical",
    question: URL_QUESTION,
    answer:
      "The browser sends the web address straight to the website's server, " +
      "which it can find because every domain name is stored inside the " +
      "browser when you install it. The server then sends back the whole " +
      "website as one image file and the browser displays that image. HTTPS " +
      "is just a setting that makes the image load faster.",
  },
  {
    id: "swe_strong_technical",
    role: "swe_intern",
    level: "strong_technical",
    topic: "technical_knowledge",
    kind: "technical",
    question: URL_QUESTION,
    answer:
      "First the browser needs an IP address, so it checks its own cache, " +
      "then the operating system, then asks a DNS resolver, which walks from " +
      "the root servers to the top-level domain to the site's authoritative " +
      "server if it has nothing cached. With the IP it opens a TCP " +
      "connection, and for HTTPS does a TLS handshake so the traffic is " +
      "encrypted and the certificate is checked. Then it sends an HTTP GET " +
      "request. The server, often behind a load balancer, returns HTML. The " +
      "browser parses it, requests the CSS, JavaScript and images it " +
      "references, builds the DOM and CSSOM, lays the page out and paints " +
      "it. Caching headers decide whether some of those requests are skipped " +
      "next time.",
  },

  // ---- Product Manager Intern ----------------------------------------------
  {
    id: "pm_strong",
    role: "pm_intern",
    level: "strong",
    topic: "prioritisation",
    kind: "behavioral",
    question: "Tell me about a time you had to manage multiple competing priorities.",
    answer:
      "As president of our university's hackathon club I had sponsor " +
      "outreach, the venue booking and the registration site all due in the " +
      "same two weeks. I listed what would break the event if it slipped: " +
      "the venue had a hard deadline and the site could launch late, so I " +
      "booked the venue first. I asked a member who knew web development to " +
      "own the site and gave her the copy I had written. For sponsors I " +
      "called the three companies that had given before rather than emailing " +
      "twenty new ones. We kept the venue, two of the three sponsors renewed, " +
      "and registrations opened four days late but still filled all 150 places.",
  },
  {
    id: "pm_good_not_star",
    role: "pm_intern",
    level: "good_not_star",
    topic: "persuasion",
    kind: "behavioral",
    question: PERSUADE,
    answer:
      "Honestly the thing I'm proudest of is getting our student union to " +
      "drop a paper sign-up form. The officers liked paper because it was " +
      "what they had always used. Instead of arguing about it, I sat at the " +
      "sign-up table for an afternoon and wrote down every problem I saw — " +
      "lost sheets, unreadable emails, people leaving because the queue was " +
      "long. I brought that list to the next meeting with a free online form " +
      "already set up so they could try it. They agreed to run both for one " +
      "event, and after that nobody wanted the paper version back.",
  },
  {
    id: "pm_evasive",
    role: "pm_intern",
    level: "evasive",
    topic: "persuasion",
    kind: "behavioral",
    question: PERSUADE,
    answer:
      "Persuasion is all about communication. You have to know your audience " +
      "and listen to what they want. I would say I am a very persuasive " +
      "person in general and people usually agree with me once I explain " +
      "things clearly, so it is something I am good at.",
  },
  {
    id: "pm_partial",
    role: "pm_intern",
    level: "partial",
    topic: "product_sense",
    kind: "problem_solving",
    question:
      "How would you decide which of two features to build first when you can only build one?",
    answer:
      "I would look at which feature more users are asking for, maybe by " +
      "checking support tickets or doing a quick survey. The one more people " +
      "want is probably the one to build first.",
  },
  {
    id: "pm_strong_problem",
    role: "pm_intern",
    level: "strong_technical",
    topic: "product_sense",
    kind: "problem_solving",
    question:
      "How would you decide which of two features to build first when you can only build one?",
    answer:
      "I would start from the goal the team is measured on this quarter, " +
      "because the right feature depends on that. Then for each feature I " +
      "would estimate how many users it reaches, how much it changes their " +
      "behaviour, and how confident we are, using support tickets, usage " +
      "data and a few user interviews. I would ask engineering for a rough " +
      "effort size, since a small feature with medium impact can beat a big " +
      "one. I would also check for anything that isn't optional, like a " +
      "regulatory requirement or a feature that unblocks other work. If it " +
      "is still close, I would pick the one that is cheaper to reverse or to " +
      "test with a small experiment, and agree up front which metric would " +
      "tell us it worked.",
  },
];

/**
 * The fairness case for follow-ups: a partial opening, then a follow-up that
 * supplies what was missing. The original question's cumulative score should
 * rise to near the same story told complete in one answer.
 */
export const FOLLOW_UP_CASE = {
  role: "swe_intern" as const,
  topic: "handling_failure",
  kind: "behavioral" as FixtureKind,
  question: "Tell me about a time you failed, and what you learned from it.",
  opening: ANSWERS.find((a) => a.id === "swe_partial")!.answer,
  followUpQuestion: "How did it turn out, and what did you change afterwards?",
  followUpAnswer:
    "I submitted it on time but two of my edge-case tests were failing, so I " +
    "lost marks I didn't need to lose. Since then I break every project into " +
    "milestones on the first day and start the hardest part first, and on " +
    "the next project I finished three days early.",
  /** The same story, complete, in one answer. */
  complete:
    "In my data structures class I underestimated how long the final " +
    "project would take. I started about a week late because I had other " +
    "assignments, and then I had to stay up two nights in a row to finish " +
    "the hash table implementation and write the test cases for it. I " +
    "submitted it on time but two of my edge-case tests were failing, so I " +
    "lost marks I didn't need to lose. Since then I break every project into " +
    "milestones on the first day and start the hardest part first, and on " +
    "the next project I finished three days early.",
};

/** Session-creation inputs for the question-plan comparison. */
export const PLAN_CASES = [
  {
    id: "swe_jd",
    label: "SWE intern with job description",
    targetRole: SWE_INTERN.title,
    company: SWE_INTERN.company,
    jobText: SWE_INTERN.jobText,
  },
  {
    id: "pm_jd",
    label: "PM intern with job description",
    targetRole: PM_INTERN.title,
    company: PM_INTERN.company,
    jobText: PM_INTERN.jobText,
  },
  {
    id: "pm_title_only",
    label: "PM intern, title only",
    targetRole: PM_INTERN.title,
    company: null,
    jobText: null,
  },
  {
    id: "nothing",
    label: "No job details at all",
    targetRole: null,
    company: null,
    jobText: null,
  },
  {
    id: "too_short_jd",
    label: "Invalid job description (too short to use)",
    targetRole: null,
    company: null,
    jobText: "asdf",
  },
] as const;
