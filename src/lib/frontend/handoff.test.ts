import { describe, expect, it } from "vitest";

import { parseOpening } from "./handoff";

describe("parseOpening", () => {
  it("reads the greeting and the line saved at setup", () => {
    expect(parseOpening(JSON.stringify({ greeting: "Hi Kazu, how are you?", line: "I'm Jordan." }))).toEqual({
      greeting: "Hi Kazu, how are you?",
      line: "I'm Jordan.",
    });
  });

  it("opens without small talk when there is no greeting", () => {
    expect(parseOpening(JSON.stringify({ greeting: "  ", line: "I'm Jordan." }))).toEqual({ greeting: null, line: "I'm Jordan." });
  });

  it("says a line saved before greetings existed as it was", () => {
    expect(parseOpening("Thanks for making the time, Kazu.")).toEqual({ greeting: null, line: "Thanks for making the time, Kazu." });
    expect(parseOpening('"just a string"')).toEqual({ greeting: null, line: '"just a string"' });
  });
});
