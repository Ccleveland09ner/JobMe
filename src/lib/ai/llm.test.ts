import { describe, expect, it } from "vitest";

import { LlmError, parseModelJson } from "./llm";

describe("parseModelJson", () => {
  it("reads the model's JSON", () => {
    expect(parseModelJson('{"facts":["Go"]}')).toEqual({ facts: ["Go"] });
  });

  // The output can carry resume or answer text, and error messages are logged.
  it("never quotes the output when it can't be read", () => {
    const output = '{"roles": [{"title": "Backend Intern at Acme", "employer": "Ac';
    let error: unknown;
    try {
      parseModelJson(output);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(LlmError);
    expect((error as Error).message).toBe(`Model returned unparseable JSON (${output.length} characters)`);
    expect((error as Error).message).not.toContain("Acme");
  });
});
