import { describe, expect, it } from "vitest";

import {
  ResumeParseError,
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
