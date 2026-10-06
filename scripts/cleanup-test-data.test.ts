import { describe, expect, it } from "vitest";

import {
  DELETE_ORDER,
  TEST_EMAIL_PATTERN,
  isTestEmail,
  ownerColumn,
} from "./cleanup-test-data";

describe("isTestEmail", () => {
  it.each([
    "jobme-e2e@example.com",
    "jobme-resume-e2e@example.com",
    "JOBME-E2E@EXAMPLE.COM",
    "  jobme-e2e@example.com  ",
  ])("matches the harness address %s", (email) => {
    expect(isTestEmail(email)).toBe(true);
  });

  /**
   * The destructive half of the contract: this script deletes rows, so an
   * over-broad pattern would delete a real candidate's interview history.
   */
  it.each([
    "kazundachawana@gmail.com",
    "jobme-e2e@example.com.evil.com",
    "notjobme-e2e@example.com",
    "jobme-e2e@gmail.com",
    "e2e@example.com",
    "",
    undefined,
  ])("refuses to match %s", (email) => {
    expect(isTestEmail(email as string | undefined)).toBe(false);
  });

  it("is anchored at both ends", () => {
    expect(TEST_EMAIL_PATTERN.source.startsWith("^")).toBe(true);
    expect(TEST_EMAIL_PATTERN.source.endsWith("$")).toBe(true);
  });
});

describe("DELETE_ORDER", () => {
  /**
   * Children before parents, so a delete never depends on a cascade and a
   * missing grant surfaces on the table that lacks it rather than passing
   * silently.
   */
  it("deletes children before their parents", () => {
    const at = (t: string) => DELETE_ORDER.indexOf(t as never);
    expect(at("turns")).toBeLessThan(at("interview_sessions"));
    expect(at("reports")).toBeLessThan(at("interview_sessions"));
    expect(at("resume_chunks")).toBeLessThan(at("resumes"));
    expect(at("interview_sessions")).toBeLessThan(at("resumes"));
    expect(at("profiles")).toBe(DELETE_ORDER.length - 1);
  });

  it("covers every table that holds candidate data", () => {
    for (const t of [
      "profiles",
      "interview_sessions",
      "turns",
      "reports",
      "resumes",
      "resume_chunks",
    ]) {
      expect(DELETE_ORDER).toContain(t);
    }
  });

  it("lists each table exactly once", () => {
    expect(new Set(DELETE_ORDER).size).toBe(DELETE_ORDER.length);
  });
});

describe("ownerColumn", () => {
  it("keys profiles by id and everything else by user_id", () => {
    expect(ownerColumn("profiles")).toBe("id");
    for (const t of DELETE_ORDER.filter((x) => x !== "profiles")) {
      expect(ownerColumn(t)).toBe("user_id");
    }
  });
});
