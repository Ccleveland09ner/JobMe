import { describe, expect, it } from "vitest";

import { CreateSessionBody } from "../schemas";
import { REVIEW_SHEET, sessionBody, SETUP_SHEETS, validateSetup, validateSetupSheet, type SetupValues } from "./setup";

const RESUME = "6f1c1d1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";
const sheet = (id: (typeof SETUP_SHEETS)[number]["id"]) => SETUP_SHEETS.findIndex((s) => s.id === id);

const values = (patch: Partial<SetupValues> = {}): SetupValues => ({
  displayName: "Kazu",
  job: { targetRole: "", source: "paste", roleText: "", jobUrl: "" },
  resume: { choice: "none" },
  mode: "quick",
  ...patch,
});

describe("validateSetupSheet", () => {
  it("needs a name before the first sheet turns", () => {
    expect(validateSetupSheet(sheet("you"), values({ displayName: "   " })).displayName).toBeTruthy();
    expect(validateSetupSheet(sheet("you"), values({ displayName: "x".repeat(41) })).displayName).toBeTruthy();
    expect(validateSetupSheet(sheet("you"), values())).toEqual({});
  });

  it("only accepts posting links the server can read", () => {
    const link = (jobUrl: string) =>
      validateSetupSheet(sheet("job"), values({ job: { targetRole: "", source: "link", roleText: "", jobUrl } })).jobUrl;
    expect(link("javascript:alert(1)")).toMatch(/https/);
    expect(link("https://example.com/careers/123")).toMatch(/paste the job description/i);
    expect(link("https://boards.greenhouse.io/acme/jobs/123456")).toBeUndefined();
    expect(link("")).toBeUndefined();
  });

  it("checks the description only when it is the source", () => {
    const long = "x".repeat(2001);
    expect(validateSetupSheet(sheet("job"), values({ job: { targetRole: "", source: "paste", roleText: long, jobUrl: "" } })).roleText).toBeTruthy();
    expect(validateSetupSheet(sheet("job"), values({ job: { targetRole: "", source: "link", roleText: long, jobUrl: "" } }))).toEqual({});
  });

  it("holds the resume sheet until an upload is ready or another choice is made", () => {
    const upload = (status: "idle" | "uploading" | "error" | "review" | "ready") =>
      validateSetupSheet(sheet("resume"), values({ resume: { choice: "upload", status, resumeId: status === "ready" ? RESUME : null } })).resume;
    expect(upload("idle")).toBeTruthy();
    expect(upload("uploading")).toMatch(/still uploading/);
    expect(upload("review")).toMatch(/confirm/);
    expect(upload("ready")).toBeUndefined();
    expect(validateSetupSheet(sheet("resume"), values({ resume: { choice: "existing", resumeId: RESUME } }))).toEqual({});
  });
});

describe("validateSetup", () => {
  it("sends the reader to the first sheet with a problem", () => {
    const bad = values({ displayName: "", resume: { choice: "upload", status: "idle", resumeId: null } });
    expect(validateSetup(bad)?.sheet).toBe(sheet("you"));
    expect(validateSetup(values({ resume: { choice: "upload", status: "error", resumeId: null } }))?.sheet).toBe(sheet("resume"));
    expect(validateSetup(values())).toBeNull();
    expect(REVIEW_SHEET).toBe(SETUP_SHEETS.length - 1);
  });
});

describe("sessionBody", () => {
  it("is what the server accepts, with one job source and the ready resume", () => {
    const body = sessionBody(
      values({
        displayName: "  Kazu ",
        job: { targetRole: " Backend Intern ", source: "link", roleText: "left over", jobUrl: " https://jobs.lever.co/acme/abc-123 " },
        resume: { choice: "upload", status: "ready", resumeId: RESUME },
        mode: "full",
      }),
    );
    expect(body).toEqual({
      displayName: "Kazu",
      mode: "full",
      targetRole: "Backend Intern",
      jobUrl: "https://jobs.lever.co/acme/abc-123",
      resumeId: RESUME,
    });
    expect(CreateSessionBody.safeParse(body).success).toBe(true);
    expect(sessionBody(values({ resume: { choice: "upload", status: "review", resumeId: null } }))).not.toHaveProperty("resumeId");
  });
});
