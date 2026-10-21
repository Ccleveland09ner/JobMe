/**
 * Lip-sync: spoken text -> a timed sequence of the model's 15 visemes (pure).
 * alignedTimeline() uses the TTS service's per-character times (exact);
 * estimatedTimeline() estimates from the text for the browser voice. Aimed at
 * the shapes a viewer reads, not phonetics.
 */

export const VISEMES = ["sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "I", "O", "U"] as const;
export type Viseme = (typeof VISEMES)[number];
export type VisemeWeights = Partial<Record<Viseme, number>>;

/** One mouth shape held over [start, end), in seconds from the start of speech. */
export interface VisemeCue {
  start: number;
  end: number;
  viseme: Viseme;
}

/** One word on the timeline, with its place in the spoken text (end exclusive). */
export interface WordSpan {
  start: number;
  end: number;
  charStart: number;
  charEnd: number;
}

export interface SpeechTimeline {
  text: string;
  cues: VisemeCue[];
  words: WordSpan[];
  duration: number;
}

/** How far each shape is applied at full strength: lip closures read best fully shut. */
const STRENGTH: Record<Viseme, number> = {
  sil: 0,
  PP: 1,
  FF: 0.85,
  TH: 0.6,
  DD: 0.55,
  kk: 0.5,
  CH: 0.75,
  SS: 0.6,
  nn: 0.5,
  RR: 0.6,
  aa: 0.85,
  E: 0.7,
  I: 0.6,
  O: 0.8,
  U: 0.75,
};

/** Shapes ease in and out over this long, so the mouth moves rather than snaps. */
export const FADE_SECONDS = 0.06;

const VOWEL: Record<string, Viseme> = { a: "aa", e: "E", i: "I", o: "O", u: "U", y: "I" };
const CONSONANT: Record<string, Viseme> = {
  b: "PP",
  m: "PP",
  p: "PP",
  f: "FF",
  v: "FF",
  t: "DD",
  d: "DD",
  k: "kk",
  g: "kk",
  q: "kk",
  s: "SS",
  z: "SS",
  j: "CH",
  l: "nn",
  n: "nn",
  r: "RR",
  w: "U",
};
const DIGRAPH: Record<string, Viseme> = {
  th: "TH",
  sh: "CH",
  ch: "CH",
  ph: "FF",
  wh: "U",
  ck: "kk",
  ng: "nn",
  ee: "I",
  ea: "I",
  ie: "I",
  oo: "U",
  ou: "U",
  ai: "E",
  ay: "E",
  oa: "O",
  ow: "O",
};

/** One word's visemes and the letters each covers; shapeless letters join a neighbour. */
export function wordVisemes(word: string): { viseme: Viseme; from: number; to: number }[] {
  const w = word.toLowerCase();
  const out: { viseme: Viseme; from: number; to: number }[] = [];
  const push = (viseme: Viseme, from: number, to: number) => {
    const last = out.at(-1);
    // Doubled letters ("ll", "ss") and repeats are one held shape.
    if (last && last.viseme === viseme && last.to === from) last.to = to;
    else out.push({ viseme, from, to });
  };
  // A final "e" after a consonant is silent: "make", "like", "role".
  const silentE = w.length > 2 && w.endsWith("e") && !(w[w.length - 2] in VOWEL);

  for (let i = 0; i < w.length; ) {
    const c = w[i];
    if (i === w.length - 1 && silentE) {
      if (out.length) out[out.length - 1].to = i + 1;
      i++;
      continue;
    }
    if (w.startsWith("tch", i)) {
      push("CH", i, i + 3);
      i += 3;
      continue;
    }
    const two = w.slice(i, i + 2);
    if (two.length === 2 && DIGRAPH[two]) {
      push(DIGRAPH[two], i, i + 2);
      i += 2;
      continue;
    }
    if (c === "c") {
      push("ei".includes(w[i + 1] ?? "") || w[i + 1] === "y" ? "SS" : "kk", i, i + 1);
    } else if (c === "x") {
      push("kk", i, i + 1);
      push("SS", i, i + 1);
    } else if (c === "q" && w[i + 1] === "u") {
      push("kk", i, i + 1);
      push("U", i + 1, i + 2);
      i += 2;
      continue;
    } else if (c in VOWEL) {
      push(VOWEL[c], i, i + 1);
    } else if (c in CONSONANT) {
      push(CONSONANT[c], i, i + 1);
    } else if (/[0-9]/.test(c)) {
      // Spoken numbers: an open, neutral shape per digit is better than none.
      push("E", i, i + 1);
    } else if (out.length) {
      // h, apostrophes, anything else: carried by the previous shape.
      out[out.length - 1].to = i + 1;
    }
    i++;
  }
  return out;
}

const WORD_RE = /[A-Za-z0-9']+/g;

function wordsIn(text: string): { charStart: number; charEnd: number }[] {
  return [...text.matchAll(WORD_RE)].map((m) => ({ charStart: m.index!, charEnd: m.index! + m[0].length }));
}

/** Seconds of pause after the text between two words: longer after a sentence. */
function pauseAfter(between: string): number {
  if (/[.?!]/.test(between)) return 0.35;
  if (/[,;:—–-]/.test(between)) return 0.18;
  return 0.05;
}

/** A timeline from the text alone (browser voice), at a learned letters-per-second rate. */
export function estimatedTimeline(text: string, charsPerSecond: number): SpeechTimeline {
  const cues: VisemeCue[] = [];
  const words: WordSpan[] = [];
  const perChar = 1 / Math.max(1, charsPerSecond);
  let t = 0;
  const spans = wordsIn(text);
  spans.forEach((span, n) => {
    const word = text.slice(span.charStart, span.charEnd);
    const start = t;
    for (const v of wordVisemes(word)) {
      cues.push({ viseme: v.viseme, start: start + v.from * perChar, end: start + v.to * perChar });
    }
    t = start + word.length * perChar;
    words.push({ start, end: t, charStart: span.charStart, charEnd: span.charEnd });
    const next = spans[n + 1];
    t += pauseAfter(text.slice(span.charEnd, next ? next.charStart : text.length));
  });
  return { text, cues, words, duration: t };
}

/** A timeline from per-character audio times; the estimate stands in if they don't spell the text. */
export function alignedTimeline(
  text: string,
  characters: string[],
  starts: number[],
  ends: number[],
): SpeechTimeline {
  if (characters.join("") !== text || starts.length !== characters.length || ends.length !== characters.length) {
    const duration = ends.at(-1) ?? 0;
    const letters = (text.match(/[A-Za-z0-9]/g) ?? []).length;
    return estimatedTimeline(text, duration > 0 ? letters / duration : 14);
  }
  const cues: VisemeCue[] = [];
  const words: WordSpan[] = [];
  for (const span of wordsIn(text)) {
    const word = text.slice(span.charStart, span.charEnd);
    for (const v of wordVisemes(word)) {
      cues.push({ viseme: v.viseme, start: starts[span.charStart + v.from], end: ends[span.charStart + v.to - 1] });
    }
    words.push({ start: starts[span.charStart], end: ends[span.charEnd - 1], charStart: span.charStart, charEnd: span.charEnd });
  }
  return { text, cues, words, duration: ends.at(-1) ?? 0 };
}

/** The mouth at time `t`: shapes within a fade of `t`, blended. Silence weighs nothing. */
export function sampleVisemes(timeline: SpeechTimeline, t: number): VisemeWeights {
  const out: VisemeWeights = {};
  for (const cue of timeline.cues) {
    if (cue.start - FADE_SECONDS > t) break; // cues are in time order
    if (cue.end + FADE_SECONDS < t) continue;
    const rise = (t - (cue.start - FADE_SECONDS)) / FADE_SECONDS;
    const fall = (cue.end + FADE_SECONDS - t) / FADE_SECONDS;
    const w = Math.max(0, Math.min(1, rise, fall)) * STRENGTH[cue.viseme];
    if (w > (out[cue.viseme] ?? 0)) out[cue.viseme] = w;
  }
  return out;
}

/** The word being spoken at `t` (by index into `timeline.words`), or null between words. */
export function wordAt(timeline: SpeechTimeline, t: number): number | null {
  const i = timeline.words.findIndex((w) => t >= w.start && t < w.end + 0.05);
  return i < 0 ? null : i;
}

/** The word containing (or starting at) a character offset, for word-boundary events. */
export function wordAtChar(timeline: SpeechTimeline, charIndex: number): number | null {
  const i = timeline.words.findIndex((w) => charIndex >= w.charStart && charIndex < w.charEnd);
  if (i >= 0) return i;
  const next = timeline.words.findIndex((w) => w.charStart >= charIndex);
  return next < 0 ? null : next;
}

/** One number for how open the mouth is, for anything that only takes openness. */
export function openness(weights: VisemeWeights): number {
  const open =
    (weights.aa ?? 0) * 1 +
    (weights.O ?? 0) * 0.8 +
    (weights.E ?? 0) * 0.7 +
    (weights.I ?? 0) * 0.55 +
    (weights.U ?? 0) * 0.5 +
    Math.max(weights.DD ?? 0, weights.kk ?? 0, weights.nn ?? 0, weights.RR ?? 0, weights.SS ?? 0, weights.TH ?? 0, weights.CH ?? 0) *
      0.35;
  return Math.min(1, open);
}
