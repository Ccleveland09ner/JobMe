/**
 * Every word the landing page shows, in one place to edit. No em dashes.
 * The ABOUT US and GUIDE content are placeholders until confirmed.
 */

/** Under the title; one is picked per visit, never the last one shown (useTagline.ts). Tagline.tsx adds the quotation marks. */
export const TAGLINES = [
  "Tired of being rejected after interviews? Practice until you walk in ready.",
  "Tired of feeling underprepared? Rehearse with a recruiter before the real one.",
  "Tired of freezing on the hard questions? Face them here first.",
] as const;

/** On the plaque above the front door. */
export const ENTRANCE_SIGN = "INTERVIEW CENTER";

/** Hovering words in the scene: always capitals. */
const caps = (s: string) => s.toUpperCase();

export const LABELS = {
  stepInside: caps("Step inside"),
  next: caps("Next: Guide"),
  back: caps("Back: About Us"),
  close: caps("Close"),
} as const;

export type Poster = "about" | "guide";

export interface PosterCopy {
  /** Hovering over its signpost, and the opened view's heading. */
  title: string;
  /** Paragraphs. PLACEHOLDER: to confirm. */
  body: readonly string[];
  /** A numbered list, after the body. PLACEHOLDER: to confirm. */
  steps?: readonly string[];
  /** After the steps. PLACEHOLDER: to confirm. */
  closing?: string;
}

export const POSTER_COPY: Record<Poster, PosterCopy> = {
  about: {
    title: caps("About Us"),
    body: [
      "JobMe is a mock interview center you can walk around in. Pick the role you are aiming for, step into a 3D office, and sit down with a recruiter who asks the questions an interviewer would actually ask.",
      "Nothing is on the line, so you can stumble, try again and sharpen your answers. When you are done, your results are filed in a report that shows what landed well and what to work on.",
      "Practice as often as you like, until walking into the real interview feels like the tenth time and not the first.",
    ],
  },
  guide: {
    title: caps("Guide"),
    body: [],
    steps: ["Step inside", "Set up your role", "Sit the interview", "Review your results"],
    closing: "Simple as that.",
  },
};

/** What the hidden buttons say to screen readers (the words in the scene are their visible twins). */
export const PROXY_LABELS = {
  stepInside: "Step inside",
  open: { about: "About us", guide: "Guide" } satisfies Record<Poster, string>,
  next: "Next: Guide",
  back: "Back: About us",
  close: "Close",
} as const;

/** "Page 1 of 2", for screen readers. */
export const pageOf = (index: number, total: number) => `Page ${index} of ${total}`;
