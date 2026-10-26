/**
 * Each line's recorded timings (clips.json, written by
 * scripts/gen-receptionist-clips.ts) as a lip-sync timeline, and how much of
 * the line has been said at a moment, for the bubble's reveal.
 */

import { alignedTimeline, estimatedTimeline, type SpeechTimeline } from "@/lib/voice/lipsync";

import timingsJson from "./clips.json";
import { spokenText, type Line } from "./lines";

export interface ClipTimings {
  /** The text the clip was recorded from (lines.spokenText). */
  text: string;
  /** Seconds, to the end of the last character. */
  duration: number;
  /** Each character's start and end, in seconds. */
  starts: number[];
  ends: number[];
}

const TIMINGS = timingsJson as Record<string, ClipTimings>;

/** River's pace, for a line with no timings yet (letters per second). */
const FALLBACK_PACE = 15;

/** The line's timeline: recorded when its timings match its text, else estimated. */
export function timelineFor(line: Line): SpeechTimeline {
  const spoken = spokenText(line.text);
  const t = TIMINGS[line.id];
  if (t && t.text === spoken && t.starts.length === spoken.length) {
    // Timed against the spoken text, which matches the bubble's character for character.
    return { ...alignedTimeline(spoken, Array.from(spoken), t.starts, t.ends), text: line.text };
  }
  return { ...estimatedTimeline(spoken, FALLBACK_PACE), text: line.text };
}

/** How many of the line's characters have been said `t` seconds in: whole words, never mid-word. */
export function revealedChars(timeline: SpeechTimeline, t: number): number {
  let shown = 0;
  for (const word of timeline.words) {
    if (word.start > t) break;
    shown = word.charEnd;
  }
  // Punctuation after the word comes with it.
  while (shown < timeline.text.length && /[^\sA-Za-z0-9]/.test(timeline.text[shown])) shown++;
  return shown;
}
