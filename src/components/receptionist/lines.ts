/**
 * Everything Ms. Crystal says at the front desk: four greetings for a first
 * visit, four for a return and four goodbyes. Each line's clip is recorded
 * from this text in the River voice (scripts/gen-receptionist-clips.ts), so
 * the bubble always shows exactly what she says.
 */

export type LineKind = "new" | "returning" | "goodbye";

export interface Line {
  id: string;
  kind: LineKind;
  /** What the bubble shows. */
  text: string;
  /** Her clip, in public/. */
  src: string;
}

/** The voice every line is recorded in: ElevenLabs "River". */
export const RECEPTIONIST_VOICE_ID = "SAz9YHcvj6GT2YYXdXww";

const RAW: Record<LineKind, readonly string[]> = {
  new: [
    "Welcome to JOBME! First time here? Don't worry, everyone starts somewhere. I'm glad you stopped by!",
    "Oh, a new face! Welcome to JOBME, where practice makes progress. Make yourself comfortable!",
    "Hello there, and welcome! You've come to the right place to sharpen those interview skills. Ready to get started?",
    "Well, look who just walked in! Welcome to JOBME. Your next big opportunity starts with a little practice!",
  ],
  returning: [
    "Welcome back to JOBME! It's good to see you again. Ready for another round?",
    "Well, well, look who's back! I hope you've been practicing. Let's see what you've got today!",
    "There you are! Welcome back. Every interview brings you one step closer to landing that dream job!",
    "Hey, welcome back! The interview rooms are ready whenever you are. Let's make today a productive one!",
  ],
  goodbye: [
    "Heading out already? No worries! Keep practicing, and I'll see you next time!",
    "Great work today! Remember, confidence comes with practice. Take care!",
    "Thanks for stopping by JOBME! I'll keep the interview rooms ready for your next visit!",
    "See you next time! And remember, every great interview starts with preparation!",
  ],
};

const FOLDER: Record<LineKind, string> = { new: "greetings", returning: "greetings", goodbye: "goodbyes" };

export const LINES: readonly Line[] = (Object.keys(RAW) as LineKind[]).flatMap((kind) =>
  RAW[kind].map((text, i) => {
    const id = `${kind}-${i + 1}`;
    return { id, kind, text, src: `/audio/receptionist/${FOLDER[kind]}/${id}.mp3` };
  }),
);

export function linesOf(kind: LineKind): Line[] {
  return LINES.filter((line) => line.kind === kind);
}

/**
 * What the voice is asked to read: the bubble's text, with the name written
 * the way it is said ("JobMe", not "J-O-B-M-E"). Same length, so the clip's
 * per-character timings line up with the bubble's text.
 */
export function spokenText(text: string): string {
  return text.replace(/JOBME/g, "JobMe");
}

/** One of `kind`'s lines at random, never `previousId` again when there's another. */
export function pickLine(kind: LineKind, previousId: string | null, random: () => number = Math.random): Line {
  const all = linesOf(kind);
  const pool = all.length > 1 ? all.filter((line) => line.id !== previousId) : all;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
