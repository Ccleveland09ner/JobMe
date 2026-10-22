import { describe, expect, it, vi } from "vitest";

import { evaluateAndDraft } from "./evaluate";
import type { generateJson } from "./llm";
import { FOLLOWUP_GUIDANCE } from "./prompts";

const ARGS = {
  kind: "behavioral" as const,
  topic: "Teamwork",
  questionText: "What did you change yourself?",
  questionType: "clarify",
  answer: "I wrote the sharding script.",
};

/** A model that always fails, so the call's system prompt can be read off it. */
function failing() {
  return vi.fn(async () => {
    throw new Error("no model in tests");
  }) as unknown as typeof generateJson & ReturnType<typeof vi.fn>;
}

const systemOf = (generate: ReturnType<typeof failing>) =>
  (generate.mock.calls[0][0] as { systemInstruction: string }).systemInstruction;

describe("evaluateAndDraft — what the evaluator is told about a follow-up", () => {
  it("scores a follow-up as the whole answer so far when it has the thread", async () => {
    const generate = failing();
    await expect(
      evaluateAndDraft(
        {
          ...ARGS,
          questionText: "Tell me about a time you worked closely with someone very different.",
          followUpQuestion: ARGS.questionText,
          priorThreadTurns: [{ question: "Tell me about a time…", answer: "We fixed the bug." }],
        },
        generate,
      ),
    ).rejects.toThrow();
    expect(systemOf(generate)).toContain(FOLLOWUP_GUIDANCE.trim());
  });

  // A failed history read leaves a lone reply: telling the model it is the
  // whole answer to the original question would misjudge it.
  it("scores the reply on its own when the thread is missing", async () => {
    const generate = failing();
    await expect(evaluateAndDraft({ ...ARGS, followUpQuestion: null, priorThreadTurns: [] }, generate)).rejects.toThrow();
    expect(systemOf(generate)).not.toContain(FOLLOWUP_GUIDANCE.trim());
  });

  it("retries once, then gives up", async () => {
    const generate = failing();
    await expect(evaluateAndDraft(ARGS, generate)).rejects.toThrow("Evaluation failed after 2 attempts");
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
