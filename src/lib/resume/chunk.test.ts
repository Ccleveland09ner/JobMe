import { describe, expect, it } from "vitest";

import {
  CHARS_PER_TOKEN,
  MAX_CHUNK_TOKENS,
  TARGET_CHUNK_TOKENS,
  chunkResume,
  estimateTokens,
  isSectionHeading,
} from "./chunk";

const RESUME = `EXPERIENCE

Senior Site Reliability Engineer, Acme Corp
2021 - 2024
- Reduced p99 latency from 1,200 ms to 340 ms.
- Led a team of 6 engineers through a Kubernetes migration.

Backend Engineer, Initech
2019 - 2021
- Shipped a scheduling API used by 3,000 employees.

EDUCATION

BSc Computer Science, University of Springfield, 2015 - 2019

SKILLS

Go, TypeScript, Kubernetes, PostgreSQL
`;

describe("isSectionHeading", () => {
  it.each(["EXPERIENCE", "EDUCATION", "Skills", "Projects:", "TECHNICAL SKILLS"])(
    "recognises %s",
    (line) => expect(isSectionHeading(line)).toBe(true),
  );

  it.each([
    "- Reduced p99 latency from 1,200 ms to 340 ms.",
    "Senior Site Reliability Engineer, Acme Corp",
    "",
    "Go, TypeScript, Kubernetes, PostgreSQL",
  ])("rejects %s", (line) => expect(isSectionHeading(line)).toBe(false));
});

describe("chunkResume", () => {
  const chunks = chunkResume(RESUME);

  it("produces one chunk per resume entry", () => {
    expect(chunks.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps each role in a single chunk", () => {
    const acme = chunks.find((c) => c.content.includes("Acme Corp"));
    expect(acme).toBeDefined();
    expect(acme!.content).toContain("1,200 ms");
    expect(acme!.content).toContain("team of 6");
  });

  it("does not merge two different employers into one chunk", () => {
    const both = chunks.filter(
      (c) => c.content.includes("Acme Corp") && c.content.includes("Initech"),
    );
    expect(both).toHaveLength(0);
  });

  it("tags chunks with their section and prefixes it for context", () => {
    const acme = chunks.find((c) => c.content.includes("Acme Corp"))!;
    expect(acme.section).toBe("EXPERIENCE");
    expect(acme.content.startsWith("EXPERIENCE")).toBe(true);
  });

  it("stays under the API's hard token limit", () => {
    for (const c of chunks) {
      expect(c.estimatedTokens).toBeLessThanOrEqual(MAX_CHUNK_TOKENS);
    }
  });

  it("numbers chunks contiguously from zero", () => {
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it("returns nothing for empty input", () => {
    expect(chunkResume("")).toEqual([]);
    expect(chunkResume("   \n\n  ")).toEqual([]);
  });

  it("splits a single oversized entry rather than emitting it whole", () => {
    const huge = `EXPERIENCE\n\nEngineer, BigCo\n${"- did a thing that mattered\n".repeat(900)}`;
    const out = chunkResume(huge);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) {
      expect(c.estimatedTokens).toBeLessThanOrEqual(MAX_CHUNK_TOKENS);
    }
  });
});

describe("estimateTokens", () => {
  /**
   * The estimate must never UNDER-count, or a chunk sails past the API's hard
   * 2048-token limit and the embed call fails. A separate probe checks the
   * ratio against the real tokenizer; this just pins the direction of the
   * safety margin.
   */
  it("is pessimistic relative to typical English", () => {
    expect(CHARS_PER_TOKEN).toBeLessThan(4);
  });

  it("scales with length", () => {
    expect(estimateTokens("a".repeat(300))).toBe(100);
  });
});

describe("chunk granularity", () => {
  /** A real section: four projects that previously became one chunk. */
  const projects = [
    "PROJECTS",
    "",
    ...Array.from({ length: 4 }, (_, i) =>
      [
        `Project ${i} — a service built with Python and PostgreSQL`,
        `- Designed the ingestion path and reduced failures from 4% to 0.1%`,
        `- Added structured logging and a dead letter queue for retries`,
        `- Cut build time from 9 minutes to under 2 by reordering layers`,
      ].join("\n"),
    ),
  ].join("\n\n");

  it("splits a large section instead of emitting one chunk for it", () => {
    const chunks = chunkResume(projects);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("keeps chunks near the target rather than near the hard ceiling", () => {
    for (const c of chunkResume(projects)) {
      // The old behaviour split only at MAX, producing chunks ~7x this size.
      expect(c.estimatedTokens).toBeLessThanOrEqual(TARGET_CHUNK_TOKENS * 1.5);
    }
  });

  it("never exceeds the API's hard limit", () => {
    for (const c of chunkResume(projects)) {
      expect(c.estimatedTokens).toBeLessThanOrEqual(MAX_CHUNK_TOKENS);
    }
  });

  it("is deterministic — the same text always chunks the same way", () => {
    const a = chunkResume(projects);
    const b = chunkResume(projects);
    expect(b.map((c) => c.content)).toEqual(a.map((c) => c.content));
  });

  it("splits on line boundaries, never mid-line", () => {
    const lines = new Set(
      projects.split("\n").map((l) => l.trim()).filter(Boolean),
    );
    for (const c of chunkResume(projects)) {
      for (const line of c.content.split("\n").slice(1)) {
        if (line.trim()) expect(lines.has(line.trim())).toBe(true);
      }
    }
  });

  it("tags every piece of a split section with that section", () => {
    for (const c of chunkResume(projects)) expect(c.section).toBe("PROJECTS");
  });
});
