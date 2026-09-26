/**
 * Strips identifying details from resume text before it leaves the server.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Security (prompt injection + privacy)
 *
 * WHY THE ORDER MATTERS. A phone-number pattern and a metric look alike to a
 * regex: `1,200 ms`, `$1.2M` and `555 123 4567` are all digit runs with
 * separators. Redacting first would eat exactly the evidence the `impact` and
 * `specificity` scores are built on, and the damage would be invisible — the
 * resume would simply produce blander questions.
 *
 * So: PROTECT metric spans -> REDACT identity -> RESTORE metrics.
 *
 * This is defense-in-depth and token reduction, NOT a compliance story. A
 * redacted resume is still personal data: "Senior SRE, 2021-2024, cut p99 40%"
 * resolves to one person given a search engine. The spoken answers are richer
 * PII again and cannot be redacted at all, since they are the thing being
 * scored. The real fix is a paid API tier that does not train on input.
 */

/** A span temporarily swapped out so identity patterns cannot match inside it. */
const PROTECT_PREFIX = "\u0000P";
const PROTECT_SUFFIX = "\u0000";

/**
 * Spans that must survive redaction intact. These ARE the scoring signal:
 * without numbers there is no measurable impact to grade.
 */
const PROTECTED_PATTERNS: RegExp[] = [
  // Currency: $1.2M, $45,000, £2k
  /[$£€]\s?\d[\d,]*(?:\.\d+)?\s*[KkMmBb]?\b/g,
  // Percentages: 40%, 99.95 %
  /\b\d+(?:\.\d+)?\s?%/g,
  // Date ranges and standalone years: 2021-2024, 2019 – Present
  /\b(?:19|20)\d{2}\s*[-–—to]{1,3}\s*(?:(?:19|20)\d{2}|present|current)\b/gi,
  /\b(?:19|20)\d{2}\b/g,
  // Quantity + unit: 1,200 ms, 340ms, 2.5s, 500GB, 3x, 10k
  /\b\d[\d,]*(?:\.\d+)?\s?(?:ms|s|sec|secs|seconds?|mins?|minutes?|hrs?|hours?|days?|weeks?|months?|years?|[KMGT]B|[kKMB]|x)\b/g,
  // Headcount and scale: team of 6, 4 engineers, 12 people
  /\bteams?\s+of\s+\d+\b/gi,
  /\b\d+\s+(?:people|persons|engineers?|developers?|designers?|members?|students?|interns?|clients?|customers?|users?)\b/gi,
  // Ordinals and plain "N+" scale claims: 10+, 3rd
  /\b\d+\+/g,
];

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
const URL = /\bhttps?:\/\/\S+/gi;
const PROFILE =
  /\b(?:www\.)?(?:linkedin\.com\/in\/[\w-]+|github\.com\/[\w-]+|gitlab\.com\/[\w-]+)\/?/gi;
const PHONE =
  /(?:\+\d{1,3}[\s.\-()]*)?(?:\(\d{2,4}\)[\s.-]*)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{3,4})?\b/g;
const ZIP = /\b\d{5}(?:-\d{4})?\b/g;
const STREET =
  /\b\d+[A-Za-z]?\s+[A-Z][\w']*(?:\s+[A-Z][\w']*)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Way|Ct|Court|Pl|Place|Terrace|Close)\b\.?/g;
/** Whole lines that exist only to state a protected characteristic. */
const SENSITIVE_LINE =
  /^\s*(?:date of birth|d\.?o\.?b\.?|age|gender|sex|marital status|nationality|citizenship|visa status|work authorization|work authorisation|national insurance|ssn|social security|passport)\b.*$/gim;
/** Everything from a References heading onward, including referee details. */
const REFERENCES_BLOCK = /^\s*references?\b.*$[\s\S]*/im;

export interface RedactionResult {
  /** Redacted text, metric spans intact. */
  text: string;
  /** The detected candidate name, so the caller can avoid persisting it. */
  candidateName: string | null;
  /** Counts by category — surfaced in tests and logs, never to the model. */
  removed: Record<string, number>;
}

/**
 * Best-effort name detection: resumes almost always open with the name on its
 * own line. Requires a short, digit-free, symbol-free line so headings like
 * "CURRICULUM VITAE" or a job title do not get mistaken for it.
 */
export function detectName(text: string): string | null {
  for (const raw of text.split(/\r?\n/).slice(0, 6)) {
    const line = raw.trim();
    if (!line) continue;
    if (/[@\d|•·]/.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (/^(curriculum vitae|resume|cv)$/i.test(line)) continue;
    /**
     * Each word is either capitalised (allowing an initial's trailing period,
     * as in "Jane Q. Doe") or a lowercase nobiliary particle ("van", "de").
     * The trailing period is easy to forget and silently disables the whole
     * redactor, since a name that is never detected is never stripped.
     */
    const titleCase = words.every(
      (w) =>
        /^[A-Z][\w'’-]*\.?$/.test(w) ||
        /^(van|von|de|del|della|der|den|di|da|du|la|le|bin|ibn|al)$/i.test(w),
    );
    const allCaps = /^[A-Z][A-Z\s'’.-]+$/.test(line);
    if (titleCase || allCaps) return line;
  }
  return null;
}

export function redact(raw: string): RedactionResult {
  const removed: Record<string, number> = {};
  const count = (key: string, n: number) => {
    if (n > 0) removed[key] = (removed[key] ?? 0) + n;
  };

  // ---- 1. Protect metric spans -------------------------------------------
  const protectedSpans: string[] = [];
  let text = raw;
  for (const pattern of PROTECTED_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const token = `${PROTECT_PREFIX}${protectedSpans.length}${PROTECT_SUFFIX}`;
      protectedSpans.push(match);
      return token;
    });
  }

  // ---- 2. Redact identity ------------------------------------------------
  const candidateName = detectName(raw);

  // Structural blocks first, so their contents are not partially rewritten.
  const beforeRefs = text;
  text = text.replace(REFERENCES_BLOCK, "");
  count("references_block", beforeRefs === text ? 0 : 1);

  const swap = (pattern: RegExp, replacement: string, key: string) => {
    let n = 0;
    text = text.replace(pattern, () => {
      n++;
      return replacement;
    });
    count(key, n);
  };

  swap(SENSITIVE_LINE, "", "sensitive_line");
  swap(EMAIL, "[EMAIL]", "email");
  swap(PROFILE, "[LINK]", "profile");
  swap(URL, "[LINK]", "url");
  swap(STREET, "[ADDRESS]", "street");
  swap(PHONE, "[PHONE]", "phone");
  swap(ZIP, "[ADDRESS]", "zip");

  if (candidateName) {
    const escaped = candidateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    swap(new RegExp(escaped, "gi"), "[CANDIDATE]", "name");

    // Surname alone is common in headers and footers. Only replace name tokens
    // that are >= 3 chars, to avoid mangling initials and short words.
    for (const part of candidateName.split(/\s+/)) {
      if (part.length < 3) continue;
      const p = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      swap(new RegExp(`\\b${p}\\b`, "g"), "[CANDIDATE]", "name_part");
    }
  }

  // ---- 3. Restore metrics ------------------------------------------------
  text = text.replace(
    new RegExp(`${PROTECT_PREFIX}(\\d+)${PROTECT_SUFFIX}`, "g"),
    (_m, i: string) => protectedSpans[Number(i)] ?? "",
  );

  // Collapse the blank space left by removed lines.
  text = text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

  return { text, candidateName, removed };
}

/** Patterns a redacted document must not contain. Used by the golden test. */
export const PII_PATTERNS: Record<string, RegExp> = {
  email: /[\w.+-]+@[\w-]+\.[\w.]{2,}/,
  url: /https?:\/\//i,
  linkedin: /linkedin\.com\/in\//i,
  github: /github\.com\/[\w-]/i,
};
