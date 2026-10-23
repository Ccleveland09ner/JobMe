import { describe, expect, it, vi } from "vitest";

import { distillJobDescription } from "../jd/distill";
import { LlmError, type generateJson } from "../ai/llm";
import { distillResume } from "./distill";

const answering = (value: unknown) =>
  vi.fn(async () => ({ value, thoughtTokens: 0, outputTokens: 0, ms: 1 })) as unknown as typeof generateJson;
const failing = (error: Error) =>
  vi.fn(async () => {
    throw error;
  }) as unknown as typeof generateJson;

const POSTING = "We are hiring a backend intern to build payment APIs in Go, with on-call rotation.";

describe("distillResume", () => {
  it("keeps what fits a prompt prefix", async () => {
    const facts = { skills: Array.from({ length: 20 }, (_, i) => `skill ${i}`), roles: [{ title: "Intern", employer: "Acme" }] };
    const out = await distillResume("redacted resume text", answering(facts));
    expect(out?.skills).toHaveLength(12);
    expect(out?.roles).toEqual([{ title: "Intern", employer: "Acme" }]);
  });

  it("falls back to no facts when the model fails, saying why without quoting it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await distillResume("text", failing(new LlmError("Rate limited (free tier is 15 requests/minute).", true)))).toBeNull();
    expect(warn.mock.calls[0][0]).toContain("Rate limited");
    warn.mockRestore();
  });
});

describe("distillJobDescription", () => {
  it("caps each list and fills missing fields", async () => {
    const profile = await distillJobDescription(
      POSTING,
      answering({ title: "Backend Intern", requiredSkills: Array.from({ length: 15 }, (_, i) => `s${i}`) }),
    );
    expect(profile).toEqual({
      title: "Backend Intern",
      seniority: "",
      requiredSkills: Array.from({ length: 12 }, (_, i) => `s${i}`),
      responsibilities: [],
      competencies: [],
    });
  });

  it("skips text too short to be a posting, and survives a failed call", async () => {
    const generate = answering({});
    expect(await distillJobDescription("short", generate)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await distillJobDescription(POSTING, failing(new Error("network")))).toBeNull();
    warn.mockRestore();
  });
});
