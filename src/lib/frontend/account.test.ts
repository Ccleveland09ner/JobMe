import { describe, expect, it } from "vitest";

import { friendlyAuthError, usernameProblem, validateSignUp } from "./account";

const ok = { username: "kaz_09", email: "kaz@example.com", password: "correct horse", confirm: "correct horse" };

describe("usernameProblem", () => {
  it("accepts 3–20 letters, digits, dots and underscores", () => {
    expect(usernameProblem("kaz")).toBeNull();
    expect(usernameProblem("Kaz.Chawana_2")).toBeNull();
    expect(usernameProblem("a".repeat(20))).toBeNull();
  });

  it("rejects empty, short, long and odd characters", () => {
    expect(usernameProblem("")).toMatch(/choose/i);
    expect(usernameProblem("ab")).toMatch(/3 to 20/);
    expect(usernameProblem("a".repeat(21))).toMatch(/3 to 20/);
    expect(usernameProblem("kaz!")).toMatch(/only letters/);
    expect(usernameProblem("kaz chawana")).toMatch(/only letters/);
  });
});

describe("validateSignUp", () => {
  it("passes a complete, consistent sign-up", () => {
    expect(validateSignUp(ok)).toEqual({});
  });

  it("flags each field that is wrong", () => {
    const errors = validateSignUp({ username: "x", email: "nope", password: "short", confirm: "other" });
    expect(Object.keys(errors).sort()).toEqual(["confirm", "email", "password", "username"]);
  });

  it("requires the confirmation to match exactly", () => {
    expect(validateSignUp({ ...ok, confirm: "correct horse " }).confirm).toMatch(/don't match/);
  });
});

describe("friendlyAuthError", () => {
  it("translates the auth server's common failures", () => {
    expect(friendlyAuthError("Invalid login credentials")).toMatch(/don't match/);
    expect(friendlyAuthError("User already registered")).toMatch(/already exists/);
    expect(friendlyAuthError("Database error saving new user")).toMatch(/username was just taken/);
    expect(friendlyAuthError("Email not confirmed")).toMatch(/confirm your email/i);
  });

  it("passes unknown messages through", () => {
    expect(friendlyAuthError("Something new")).toBe("Something new");
  });
});
