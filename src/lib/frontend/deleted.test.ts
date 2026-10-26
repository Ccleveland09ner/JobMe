import { describe, expect, it } from "vitest";

import { deletedInterviews, markDeleted } from "./deleted";

describe("markDeleted", () => {
  it("lists each delete, in a new set each time", () => {
    const before = deletedInterviews();
    markDeleted("s1");
    const after = deletedInterviews();
    expect(after).not.toBe(before);
    expect(after.has("s1")).toBe(true);
    expect(before.has("s1")).toBe(false);
  });

  it("keeps the same set when the interview was already listed", () => {
    markDeleted("s2");
    const listed = deletedInterviews();
    markDeleted("s2");
    expect(deletedInterviews()).toBe(listed);
  });
});
