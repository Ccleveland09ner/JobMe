import { describe, expect, it } from "vitest";

import {
  ResumeParseError,
  looksLetterSpaced,
  repairLetterSpacing,
  splitHeadingWords,
  detectSuspectLayout,
  looksLikePdf,
  normalizeText,
  parseResumePdf,
} from "./parse";

const bytesOf = (s: string) => new TextEncoder().encode(s);

describe("looksLikePdf", () => {
  it("accepts a real PDF header", () => {
    expect(looksLikePdf(bytesOf("%PDF-1.7\n..."))).toBe(true);
  });

  /**
   * The point of checking magic bytes rather than the filename or the
   * browser-supplied MIME type: both are trivially wrong. A .docx renamed to
   * .pdf arrives claiming to be a PDF.
   */
  it("rejects a renamed non-PDF", () => {
    expect(looksLikePdf(bytesOf("PK\u0003\u0004docx payload"))).toBe(false);
    expect(looksLikePdf(bytesOf("Just some plain text"))).toBe(false);
  });

  it("rejects a truncated file", () => {
    expect(looksLikePdf(bytesOf("%PD"))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});

describe("parseResumePdf", () => {
  it("rejects a non-PDF with an actionable code", async () => {
    await expect(parseResumePdf(bytesOf("hello"))).rejects.toMatchObject({
      name: "ResumeParseError",
      code: "NOT_A_PDF",
    });
  });

  it("reports a corrupt PDF rather than throwing something opaque", async () => {
    // Valid header, garbage body.
    await expect(
      parseResumePdf(bytesOf("%PDF-1.7\nnot actually a pdf body")),
    ).rejects.toBeInstanceOf(ResumeParseError);
  });
});

describe("detectSuspectLayout", () => {
  it("flags a flattened two-column extraction", () => {
    // Many fragments, almost no prose-length lines.
    const mangled = [
      "Skills",
      "Go",
      "React",
      "SQL",
      "AWS",
      "Docker",
      "2021",
      "Acme",
      "SRE",
      "2019",
      "Initech",
      "Backend",
      "BSc",
      "2015",
    ].join("\n");
    expect(detectSuspectLayout(mangled)).toBe(true);
  });

  it("does not flag a normal single-column resume", () => {
    const normal = Array.from(
      { length: 14 },
      (_, i) =>
        `- Delivered project ${i} on time, reducing processing latency substantially.`,
    ).join("\n");
    expect(detectSuspectLayout(normal)).toBe(false);
  });

  it("does not flag a document too short to judge", () => {
    expect(detectSuspectLayout("Go\nReact\nSQL")).toBe(false);
  });
});

describe("normalizeText", () => {
  it("rejoins words hyphenated across a line break", () => {
    expect(normalizeText("Kuber-\nnetes migration")).toBe("Kubernetes migration");
  });

  it("collapses runs of spaces and blank lines", () => {
    expect(normalizeText("a    b\n\n\n\nc")).toBe("a b\n\nc");
  });

  it("normalises non-breaking spaces", () => {
    expect(normalizeText("team of 6")).toBe("team of 6");
  });

  it("preserves paragraph separation", () => {
    expect(normalizeText("EXPERIENCE\n\nAcme Corp")).toBe("EXPERIENCE\n\nAcme Corp");
  });
});

describe("repairLetterSpacing", () => {
  /**
   * Both of these came off a real resume. pdfjs reports them as single text
   * items with the spaces already inside — the PDF genuinely contains them,
   * because the author applied letter-spacing in their word processor. No
   * extractor setting can fix it, so it is repaired in the text.
   */
  it.each([
    ["EDUC ATIO N", "EDUCATION"],
    ["T EC HNIC AL SKILLS", "TECHNICAL SKILLS"],
    ["P ROJ ECTS", "PROJECTS"],
    ["W ORK EXPE RIENCE", "WORK EXPERIENCE"],
  ])("repairs %s", (broken, fixed) => {
    expect(repairLetterSpacing(broken)).toBe(fixed);
  });

  it("leaves an already-correct heading alone", () => {
    expect(repairLetterSpacing("TECHNICAL SKILLS")).toBe("TECHNICAL SKILLS");
    expect(repairLetterSpacing("EDUCATION")).toBe("EDUCATION");
  });

  /** The risk of a repair pass is that it mangles text that was fine. */
  it.each([
    "Bachelor of Science in Computer Science: GPA 3.81 May 2028",
    "Relevant Coursework: Data Structures and Algorithms",
    "Java, Python, JavaScript, TypeScript, SQL",
    "Grambling State University Grambling, LA",
    "- Reduced p99 latency from 1,200 ms to 340 ms",
  ])("leaves prose untouched: %s", (line) => {
    expect(repairLetterSpacing(line)).toBe(line);
  });

  it("leaves an unrecognised all-caps run alone rather than guessing", () => {
    // Not heading vocabulary, so repairing it would be inventing a word.
    expect(repairLetterSpacing("X YZ QQ WW")).toBe("X YZ QQ WW");
  });

  it("repairs only the affected lines of a document", () => {
    const doc = "Jane Doe\nEDUC ATIO N\nBSc Computer Science, 2024\nP ROJ ECTS";
    expect(repairLetterSpacing(doc)).toBe(
      "Jane Doe\nEDUCATION\nBSc Computer Science, 2024\nPROJECTS",
    );
  });
});

describe("looksLetterSpaced", () => {
  it.each(["EDUC ATIO N", "T EC HNIC AL SKILLS"])("flags %s", (l) => {
    expect(looksLetterSpaced(l)).toBe(true);
  });

  it.each([
    "TECHNICAL SKILLS",
    "GPA 3.81 May 2028",
    "Data Structures and Algorithms",
    "SKILLS",
  ])("does not flag %s", (l) => {
    expect(looksLetterSpaced(l)).toBe(false);
  });
});

describe("splitHeadingWords", () => {
  it("splits a despaced run into known words", () => {
    expect(splitHeadingWords("TECHNICALSKILLS")).toBe("TECHNICAL SKILLS");
  });

  it("prefers the longest match", () => {
    expect(splitHeadingWords("PROJECTS")).toBe("PROJECTS");
  });

  it("returns null unless the whole run is consumed", () => {
    expect(splitHeadingWords("EDUCATIONXYZ")).toBeNull();
    expect(splitHeadingWords("NOTAHEADING")).toBeNull();
  });
});

describe("normalizeText applies the repair", () => {
  it("fixes a letter-spaced heading end to end", () => {
    expect(normalizeText("Jane\n\nEDUC ATIO N\n\nBSc")).toContain("EDUCATION");
  });
});
