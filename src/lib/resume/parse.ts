/** Extracts text from a resume PDF locally: fast, no quota, and the resume stays on our server. */

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
  /** Looks like a flattened multi-column layout: the user must confirm the text before use. */
  layoutSuspect: boolean;
}

/** Checks the bytes for %PDF- (filenames and MIME types can lie). */
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

/** Heuristic for a mangled two-column extraction: many very short lines, little prose. */
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

/** Likely resume headings, used only to repair letter-spaced text. */
const HEADING_WORDS = [
  "PROFESSIONAL", "TECHNICAL", "RELEVANT", "ADDITIONAL", "EXTRACURRICULAR",
  "EDUCATION", "EXPERIENCE", "EMPLOYMENT", "SKILLS", "PROJECTS", "PROJECT",
  "CERTIFICATIONS", "CERTIFICATES", "AWARDS", "HONORS", "LEADERSHIP",
  "ACTIVITIES", "SUMMARY", "OBJECTIVE", "PROFILE", "PUBLICATIONS",
  "INTERESTS", "LANGUAGES", "VOLUNTEER", "VOLUNTEERING", "COURSEWORK",
  "WORK", "HISTORY", "ACHIEVEMENTS", "REFERENCES", "CONTACT", "ABOUT",
];

/** Splits a despaced run into known heading words; null unless the whole run is consumed. */
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

/** Looks like letter-spaced display text: several short tokens, no lowercase or digits. */
export function looksLetterSpaced(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 8) return false;
  if (/[a-z0-9]/.test(line)) return false;
  if (!/[A-Z]/.test(line)) return false;

  const short = tokens.filter((t) => t.length <= 4).length;
  return short / tokens.length >= 0.5;
}

/**
 * Repairs headings the authoring tool letter-spaced ("EDUC ATIO N"), only when
 * the result is entirely known heading words.
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
