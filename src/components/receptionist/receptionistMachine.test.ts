import { describe, expect, it } from "vitest";

import { LINES } from "./lines";
import { dialogueReducer, initialDialogue, receptionistState, type DialogueEvent, type ReceptionistDialogue } from "./receptionistMachine";

const [hello, other] = LINES;
const run = (events: DialogueEvent[], from: ReceptionistDialogue = initialDialogue) => events.reduce(dialogueReducer, from);

describe("dialogueReducer", () => {
  it("runs a line from start to finish: preparing, speaking, finishing, idle", () => {
    const prepared = run([{ type: "PREPARE", line: hello, purpose: "greeting" }]);
    expect(prepared).toMatchObject({ phase: "preparing", id: 1, line: hello, purpose: "greeting" });
    const { id } = prepared;
    const speaking = run([{ type: "SPEAK", id }], prepared);
    expect(speaking.phase).toBe("speaking");
    const finishing = run([{ type: "SPOKEN", id }], speaking);
    expect(finishing).toMatchObject({ phase: "finishing", cut: false, line: hello });
    expect(run([{ type: "GONE", id }], finishing)).toEqual({ ...initialDialogue, id });
  });

  it("says one line at a time: a second waits for idle", () => {
    const busy = run([{ type: "PREPARE", line: hello, purpose: "greeting" }, { type: "SPEAK", id: 1 }]);
    expect(run([{ type: "PREPARE", line: other, purpose: "goodbye" }], busy)).toBe(busy);
  });

  it("ignores late events from a line that was cut short", () => {
    const first = run([{ type: "PREPARE", line: hello, purpose: "greeting" }, { type: "CANCEL" }]);
    const second = run([{ type: "PREPARE", line: other, purpose: "goodbye" }], first);
    expect(second.id).toBe(2);
    // The first line's voice finishing, or its bubble leaving, changes nothing now.
    expect(run([{ type: "SPEAK", id: 1 }, { type: "SPOKEN", id: 1 }, { type: "GONE", id: 1 }], second)).toBe(second);
  });

  it("drops a line not yet shown at once, and fades one being said", () => {
    expect(run([{ type: "PREPARE", line: hello, purpose: "greeting" }, { type: "CANCEL" }]).phase).toBe("idle");
    const cut = run([{ type: "PREPARE", line: hello, purpose: "greeting" }, { type: "SPEAK", id: 1 }, { type: "CANCEL" }]);
    expect(cut).toMatchObject({ phase: "finishing", cut: true });
    // Its voice ending afterwards doesn't bring it back.
    expect(run([{ type: "SPOKEN", id: 1 }], cut)).toBe(cut);
    expect(run([{ type: "GONE", id: 1 }], cut).phase).toBe("idle");
  });

  it("does nothing to cancel when she is quiet", () => {
    expect(run([{ type: "CANCEL" }])).toBe(initialDialogue);
  });
});

describe("receptionistState", () => {
  it("names what she is doing", () => {
    expect(receptionistState(initialDialogue)).toBe("idle");
    const greeting = run([{ type: "PREPARE", line: hello, purpose: "greeting" }]);
    expect(receptionistState(greeting)).toBe("preparing");
    expect(receptionistState(run([{ type: "SPEAK", id: 1 }], greeting))).toBe("greeting");
    const goodbye = run([{ type: "PREPARE", line: other, purpose: "goodbye" }, { type: "SPEAK", id: 1 }]);
    expect(receptionistState(goodbye)).toBe("goodbye");
    expect(receptionistState(run([{ type: "SPOKEN", id: 1 }], goodbye))).toBe("finishing");
  });
});
