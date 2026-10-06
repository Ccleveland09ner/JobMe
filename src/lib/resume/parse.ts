/**
 * Extracts text from an uploaded resume PDF, locally.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > External Services and Dependencies
 *
 * Local extraction rather than Gemini's PDF vision, deliberately: it takes
 * milliseconds instead of a model round trip, costs no quota against a 15 RPM
 * free tier, and — most importantly — keeps the resume on our server instead
 * of shipping a document full of personal data to a service whose free tier
 * trains on input. Gemini vision is reserved as an OCR fallback for scanned
 * resumes, where local extraction legitimately returns nothing.
 */

import { extractText, getDocumentProxy } from "unpdf";

/** Below this, the PDF is almost certainly scanned images rather than text. */
export const MIN_EXTRACTED_CHARS = 100;

export type ParseMethod = "local" | "ocr";

export class ResumeParseError extends Error {
  constructor(
    public readonly code:
      | "NOT_A_PDF"
      | "SCANNED_PDF"
      | "EMPTY_PDF"
      | "CORRUPT_PDF",
    message: string,
  ) {
    super(message);
    this.name = "ResumeParseError";
  }
}

export interface ParsedResume {
  text: string;
  pageCount: number;
  method: ParseMethod;
  /**
   * True when the extracted text looks like a multi-column layout was
   * flattened in the wrong reading order. We do not try to repair it — column
   * reconstruction is its own project — but the caller must show the user what
   * was extracted and let them confirm before it is embedded.
   */
  layoutSuspect: boolean;
}

/**
 * PDFs begin with `%PDF-`. Checking the bytes rather than the filename or the
 * browser-supplied MIME type, both of which are trivially wrong or spoofed.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d //  -
  );
}

/**
 * Heuristic for a mangled two-column extraction: lots of very short lines, and
 * few lines of normal prose length. A single-column resume has long bullets; a
 * flattened two-column one produces a stream of fragments.
 */
export function detectSuspectLayout(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 12) return false;

  const veryShort = lines.filter((l) => l.length < 15).length;
  const normal = lines.filter((l) => l.length >= 40).length;

  return veryShort / lines.length > 0.5 && normal / lines.length < 0.15;
}

/**
 * Section headings a resume is likely to use. Used only to repair
 * letter-spaced text, never to decide what a heading is.
 */
const HEADING_WORDS = [
  "PROFESSIONAL", "TECHNICAL", "RELEVANT", "ADDITIONAL", "EXTRACURRICULAR",
  "EDUCATION", "EXPERIENCE", "EMPLOYMENT", "SKILLS", "PROJECTS", "PROJECT",
  "CERTIFICATIONS", "CERTIFICATES", "AWARDS", "HONORS", "LEADERSHIP",
  "ACTIVITIES", "SUMMARY", "OBJECTIVE", "PROFILE", "PUBLICATIONS",
  "INTERESTS", "LANGUAGES", "VOLUNTEER", "VOLUNTEERING", "COURSEWORK",
  "WORK", "HISTORY", "ACHIEVEMENTS", "REFERENCES", "CONTACT", "ABOUT",
];

/**
 * Greedily splits a despaced run into known heading words.
 *
 * Returns null unless the WHOLE run is consumed, so a near-miss is left alone
 * rather than mangled: repairing nothing beats inventing a heading.
 */
export function splitHeadingWords(run: string): string | null {
  const words: string[] = [];
  let rest = run;

  while (rest.length > 0) {
    // Longest match first, so PROJECTS wins over PROJECT.
    const match = HEADING_WORDS.filter((w) => rest.startsWith(w)).sort(
      (a, b) => b.length - a.length,
    )[0];
    if (!match) return null;
    words.push(match);
    rest = rest.slice(match.length);
  }

  return words.length ? words.join(" ") : null;
}

/**
 * True when a line looks like letter-spaced display text rather than prose.
 *
 * Requires several tokens, most too short to be words, and no lowercase or
 * digits — the signature of tracking applied to a heading. "Data Structures
 * and Algorithms" fails the lowercase test; "GPA 3.81 May 2028" fails both.
 */
export function looksLetterSpaced(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 8) return false;
  if (/[a-z0-9]/.test(line)) return false;
  if (!/[A-Z]/.test(line)) return false;

  const short = tokens.filter((t) => t.length <= 4).length;
  return short / tokens.length >= 0.5;
}

/**
 * Repairs headings whose letters were spaced apart by the authoring tool.
 *
 * Observed on a real resume: `EDUC ATIO N`, `T EC HNIC AL SKILLS`. These are
 * NOT an extraction artifact — pdfjs reports them as single text items with
 * the spaces already inside, because the PDF genuinely contains them. No
 * extractor setting can fix that, so the text is repaired here instead.
 *
 * Deliberately conservative: a line is rewritten only when it looks
 * letter-spaced AND its despaced form is entirely known heading vocabulary.
 * Everything else is returned untouched.
 */
export function repairLetterSpacing(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!looksLetterSpaced(line)) return line;
      const repaired = splitHeadingWords(line.replace(/\s+/g, ""));
      return repaired ?? line;
    })
    .join("\n");
}

/** Collapses the ragged whitespace PDF extraction always produces. */
export function normalizeText(raw: string): string {
  const collapsed = raw
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    // Join words hyphenated across a line break.
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // After collapsing, so a heading split across runs is one line by now.
  return repairLetterSpacing(collapsed);
}

export async function parseResumePdf(bytes: Uint8Array): Promise<ParsedResume> {
  if (!looksLikePdf(bytes)) {
    throw new ResumeParseError(
      "NOT_A_PDF",
      "That file is not a PDF. Export your resume as a PDF and try again.",
    );
  }

  let pageCount = 0;
  let raw = "";
  try {
    const pdf = await getDocumentProxy(bytes);
    pageCount = pdf.numPages;
    const result = await extractText(pdf, { mergePages: true });
    raw = Array.isArray(result.text) ? result.text.join("\n") : result.text;
  } catch (err) {
    throw new ResumeParseError(
      "CORRUPT_PDF",
      `That PDF could not be read (${(err as Error).message}). ` +
        `Try re-exporting it.`,
    );
  }

  const text = normalizeText(raw);

  if (!text) {
    throw new ResumeParseError("EMPTY_PDF", "That PDF contains no text.");
  }

  if (text.length < MIN_EXTRACTED_CHARS) {
    // Actionable copy, not a generic failure: the user can fix this themselves.
    throw new ResumeParseError(
      "SCANNED_PDF",
      "That looks like a scanned image rather than a text PDF. " +
        "Upload a version exported directly from a word processor, or paste " +
        "your resume as text.",
    );
  }

  return {
    text,
    pageCount,
    method: "local",
    layoutSuspect: detectSuspectLayout(text),
  };
}
