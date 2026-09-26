import { describe, expect, it } from "vitest";

import { PII_PATTERNS, detectName, redact } from "./redact";

/**
 * A fixture that deliberately mixes PII with the numeric achievements the
 * scoring rubric depends on. Both halves of this test matter equally: a
 * redactor that strips everything passes the privacy half and destroys the
 * product.
 */
const FIXTURE = `Jane Q. Doe
jane.doe@example.com | +1 (555) 123-4567 | linkedin.com/in/janeqdoe
742 Evergreen Terrace, Springfield, 62704
Date of birth: 1 April 1998
Nationality: British

EXPERIENCE

Senior Site Reliability Engineer, Acme Corp
2021 - 2024
- Reduced p99 latency from 1,200 ms to 340 ms across the checkout path.
- Cut infrastructure spend by $1.2M annually, a 40% reduction.
- Led a team of 6 engineers through a migration to Kubernetes.
- Owned 12 services and reduced on-call pages by 55%.

Backend Engineer, Initech
2019 - 2021
- Shipped an internal scheduling API used by 3,000 employees.
- Improved build times 3x by parallelising the test suite.

EDUCATION

BSc Computer Science, University of Springfield, 2015 - 2019

REFERENCES

Dr. Alan Grant, Professor of Computer Science
alan.grant@springfield.ac.uk | +44 20 7946 0958
`;

describe("detectName", () => {
  it("finds a name on the first line", () => {
    expect(detectName(FIXTURE)).toBe("Jane Q. Doe");
  });

  it("skips a CV heading", () => {
    expect(detectName("CURRICULUM VITAE\nMaria Santos\nEngineer")).toBe(
      "Maria Santos",
    );
  });

  it("does not mistake a contact line for a name", () => {
    expect(detectName("bob@example.com\nBob Smith")).toBe("Bob Smith");
  });

  it("returns null when there is no plausible name", () => {
    expect(detectName("EXPERIENCE\n- did things")).toBeNull();
  });
});

describe("redact — strips identifying data", () => {
  const { text } = redact(FIXTURE);

  it.each(Object.entries(PII_PATTERNS))(
    "removes every %s",
    (_label, pattern) => {
      expect(text).not.toMatch(pattern);
    },
  );

  it("removes the candidate name everywhere it appears", () => {
    expect(text).not.toMatch(/Jane/);
    expect(text).not.toMatch(/\bDoe\b/);
  });

  it("removes the phone number", () => {
    expect(text).not.toMatch(/555.{0,3}123.{0,3}4567/);
  });

  it("removes the street address and postcode", () => {
    expect(text).not.toMatch(/Evergreen Terrace/);
    expect(text).not.toMatch(/62704/);
  });

  it("removes date of birth and nationality lines", () => {
    expect(text).not.toMatch(/Date of birth/i);
    expect(text).not.toMatch(/Nationality/i);
  });

  it("removes the entire references block, including the referee", () => {
    expect(text).not.toMatch(/Alan Grant/);
    expect(text).not.toMatch(/alan\.grant/);
    expect(text).not.toMatch(/REFERENCES/i);
  });
});

describe("redact — preserves the scoring signal", () => {
  const { text } = redact(FIXTURE);

  /**
   * These are the assertions that stop the redactor from quietly gutting the
   * product. Every one of them is a number a phone/ZIP pattern would happily
   * eat if the protect-first ordering regressed.
   */
  it.each([
    ["latency before", "1,200 ms"],
    ["latency after", "340 ms"],
    ["cost saved", "$1.2M"],
    ["percentage reduction", "40%"],
    ["on-call reduction", "55%"],
    ["team size", "team of 6"],
    ["service count", "12 services"],
    ["user scale", "3,000 employees"],
    ["build speedup", "3x"],
  ])("keeps %s verbatim", (_label, value) => {
    expect(text).toContain(value);
  });

  it("keeps employment dates and tenure", () => {
    expect(text).toContain("2021 - 2024");
    expect(text).toContain("2019 - 2021");
  });

  it("keeps employers, titles and technologies", () => {
    for (const kept of [
      "Acme Corp",
      "Initech",
      "Site Reliability Engineer",
      "Kubernetes",
      "Computer Science",
    ]) {
      expect(text).toContain(kept);
    }
  });
});

describe("redact — reporting", () => {
  it("reports what it removed, by category", () => {
    const { removed } = redact(FIXTURE);
    expect(removed.email).toBeGreaterThan(0);
    expect(removed.phone).toBeGreaterThan(0);
    expect(removed.references_block).toBe(1);
    expect(removed.name).toBeGreaterThan(0);
  });

  it("is idempotent — redacting twice changes nothing further", () => {
    const once = redact(FIXTURE).text;
    expect(redact(once).text).toBe(once);
  });

  it("handles an empty document without throwing", () => {
    expect(redact("").text).toBe("");
  });
});
