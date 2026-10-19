import { describe, expect, it } from "vitest";

import { FALLBACK_DEFAULTS, parseDefaults } from "./preferences";

describe("parseDefaults", () => {
  it("reads a stored value", () => {
    expect(parseDefaults(JSON.stringify({ mode: "full", inputMode: "typed" }))).toEqual({ mode: "full", inputMode: "typed" });
  });

  it("means no defaults when nothing or garbage is stored", () => {
    expect(parseDefaults(null)).toBeNull();
    expect(parseDefaults("")).toBeNull();
    expect(parseDefaults("{not json")).toBeNull();
    expect(parseDefaults("42")).toBeNull();
  });

  it("falls back field by field for unknown values", () => {
    expect(parseDefaults(JSON.stringify({ mode: "marathon", inputMode: "typed" }))).toEqual({
      mode: FALLBACK_DEFAULTS.mode,
      inputMode: "typed",
    });
    expect(parseDefaults(JSON.stringify({}))).toEqual(FALLBACK_DEFAULTS);
  });
});
