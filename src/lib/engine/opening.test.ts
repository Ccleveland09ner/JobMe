import { describe, expect, it } from "vitest";

import { greetingLineFor, greetingReply, interviewerTitle, introLineFor } from "./opening";

describe("greetingLineFor", () => {
  it("greets the candidate by name and asks how they are", () => {
    expect(greetingLineFor("Kazu")).toBe("Hi Kazu, thanks for making the time today. How are you doing?");
  });
});

describe("interviewerTitle", () => {
  it("sends someone who does the job, a level above the candidate", () => {
    expect(interviewerTitle("software", "intern")).toBe("a software engineer on the team");
    expect(interviewerTitle("software", null)).toBe("a senior software engineer on the team");
    expect(interviewerTitle("software", "senior")).toBe("a staff software engineer on the team");
    expect(interviewerTitle("product", "entry-level")).toBe("a product manager on the team");
    expect(interviewerTitle("product", "senior")).toBe("a group product manager here");
  });

  it("matches a data role's specialty from its title", () => {
    expect(interviewerTitle("data", "intern", "Data Analyst Intern")).toBe("a data analyst on the team");
    expect(interviewerTitle("data", null, "Data Engineer")).toBe("a senior data engineer on the team");
    expect(interviewerTitle("data", "senior", "Senior Machine Learning Engineer")).toBe("the lead machine learning engineer on the team");
    expect(interviewerTitle("data", null, null)).toBe("a senior data scientist on the team");
  });

  it("falls back to the hiring team when no family matches", () => {
    expect(interviewerTitle("general", "intern")).toBe("part of the hiring team");
    expect(interviewerTitle("general", "senior")).toBe("the hiring manager for this role");
  });
});

describe("introLineFor", () => {
  it("introduces the interviewer for the role, then says any real experience counts", () => {
    expect(introLineFor({ family: "software", seniority: "senior", role: "Senior Software Engineer" })).toBe(
      "I'm Jordan, a staff software engineer on the team, and I'll be interviewing you for the Senior Software Engineer role today. When I ask about your experience, examples from school, work, clubs or personal projects all count. Let's get started.",
    );
  });

  it("names no role when there isn't one that can be said aloud", () => {
    expect(introLineFor({ family: "general" })).toMatch(/^I'm Jordan, part of the hiring team, and I'll be interviewing you today\./);
    expect(introLineFor({ family: "general", role: "x".repeat(80) })).toContain("interviewing you today.");
    // "the Backend role role" never happens.
    expect(introLineFor({ family: "software", role: "Backend Engineer role" })).toContain("for the Backend Engineer role today.");
  });

  it("says out loud when the questions couldn't be tailored to the job", () => {
    expect(introLineFor({ family: "product", role: "Product Manager", notTailored: true })).toMatch(
      /role today\. I couldn't tailor every question .* Let's get started\.$/,
    );
  });
});

describe("greetingReply", () => {
  // Speech transcripts have no punctuation, so each case is checked as heard, too.
  it("answers 'and you?' in kind", () => {
    expect(greetingReply("I'm good, and you?")).toBe("Glad to hear it. I'm doing great, thanks for asking.");
    expect(greetingReply("doing well thanks how are you")).toBe("Glad to hear it. I'm doing great, thanks for asking.");
    expect(greetingReply("pretty good how about yourself")).toBe("Glad to hear it. I'm doing great, thanks for asking.");
    expect(greetingReply("how's your day going")).toBe("I'm doing great, thanks for asking.");
    expect(greetingReply("Good, you?")).toBe("Glad to hear it. I'm doing great, thanks for asking.");
    expect(greetingReply("good you")).toBe("Glad to hear it. I'm doing great, thanks for asking.");
  });

  it("hears thanks as thanks, not a question", () => {
    expect(greetingReply("I'm good thank you")).toBe("Glad to hear it.");
  });

  it("acknowledges how they are without asking back when they don't ask", () => {
    expect(greetingReply("I'm great, thank you")).toBe("Glad to hear it.");
    expect(greetingReply("not bad")).toBe("Glad to hear it.");
    expect(greetingReply("not too bad can't complain")).toBe("Glad to hear it.");
  });

  it("puts a nervous candidate at ease, and is kind to one having a bad day", () => {
    expect(greetingReply("honestly a little nervous")).toMatch(/^A few nerves are completely normal\./);
    expect(greetingReply("a bit nervous but good, you?")).toMatch(/^A few nerves .* I'm doing great, thanks for asking\.$/);
    expect(greetingReply("not great to be honest")).toBe("Sorry to hear that. I appreciate you making the time anyway.");
    expect(greetingReply("pretty tired")).toBe("Sorry to hear that. I appreciate you making the time anyway.");
  });

  it("meets 'nice to meet you' in kind, without reading it as a mood", () => {
    expect(greetingReply("Good to meet you")).toBe("Nice to meet you too.");
    expect(greetingReply("nice to meet you I'm well and you")).toBe("Nice to meet you too. Glad to hear it. I'm doing great, thanks for asking.");
  });

  it("always says something", () => {
    expect(greetingReply("hello")).toBe("Nice to meet you.");
    expect(greetingReply("hmm")).toBe("Nice to meet you.");
  });

  it("gives the same reply every time (no regex state between calls)", () => {
    expect(greetingReply("nice to meet you")).toBe(greetingReply("nice to meet you"));
  });
});
