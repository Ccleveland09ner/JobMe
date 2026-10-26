/**
 * Every word the landing page shows, in one place to edit. No em dashes.
 * The About Us and Guide text are placeholders until confirmed.
 */

/** Under the title; one is picked per visit, never the last one shown (useTagline.ts). */
export const TAGLINES = [
  "Tired of being rejected after interviews? Practice until you walk in ready.",
  "Tired of feeling underprepared? Rehearse with a recruiter before the real one.",
  "Tired of freezing on the hard questions? Face them here first.",
] as const;

/** On the plaque above the front door. */
export const ENTRANCE_SIGN = "INTERVIEW CENTER";

/** On the placard over the beaming tile, and its button for the keyboard. */
export const STEP_INSIDE = "Step inside";

export type Poster = "about" | "guide";

export interface PosterCopy {
  /** Painted on the board, and the zoomed card's heading. */
  title: string;
  /** PLACEHOLDER: to confirm. */
  body: readonly string[];
  /** A numbered list, after the body. PLACEHOLDER: to confirm. */
  steps?: readonly string[];
  /** After the steps. PLACEHOLDER: to confirm. */
  closing?: string;
  /** The hidden button that opens it. */
  open: string;
}

export const POSTER_COPY: Record<Poster, PosterCopy> = {
  about: {
    title: "About Us",
    body: [
      "JobMe is a 3D mock interview app. Meet an AI recruiter, answer real questions for the role you want, and get a clear report on how you did.",
    ],
    open: "Read the About Us poster",
  },
  guide: {
    title: "Guide",
    body: [],
    steps: ["Step inside", "Set up your role", "Sit the interview", "Review your results"],
    closing: "Simple as that.",
    open: "Read the Guide poster",
  },
};

/** The zoomed poster's controls. */
export const POSTER_CONTROLS = {
  close: "Close",
  next: { label: "Next: Guide", aria: "Next poster: Guide" },
  previous: { label: "Back: About Us", aria: "Previous poster: About Us" },
  /** "1 of 2". */
  position: (index: number, total: number) => `${index} of ${total}`,
} as const;
