/**
 * Engine regression harness. This is what proves the kernel.
 *
 * TODO(slice 2): write these. Requires `vitest` (see README > Dependencies).
 * Ref: docs/TechDesign-JobMe-MVP.md > Testing Strategy
 *
 * Must cover:
 *   - band edges: avg exactly 3.5 with min 3, avg exactly 2.0, offTopic
 *   - anchor downgrade (great -> mediocre when simWeak - simStrong > 0.05)
 *   - each of the 4 resolution rules, in isolation
 *   - difficulty bump capped at 3
 *   - hard cap at 10 questions, checked before a follow-up is issued
 *   - plateau detection
 *   - scripted all-weak session:   Clarify -> resolve -> next, 4-8 questions
 *   - scripted all-strong session: Deepen -> resolve -> harder, fewer questions
 */

import { describe, it } from "vitest";

/**
 * Declared as todos rather than left empty so `npm test` stays green and the
 * required coverage is visible in the runner output instead of buried in a
 * comment. The engine itself is owned by the backend workstream — see
 * docs/Backend-Implementation-Brief.md.
 */
describe("classifyBand", () => {
  it.todo("weak at avg exactly 2.0");
  it.todo("great at avg exactly 3.5 with min 3");
  it.todo("weak when offTopic regardless of scores");
  it.todo("anchor downgrade turns great into mediocre when flag is on");
  it.todo("anchor downgrade is inert when flag is off (demo default)");
});

describe("step — topic resolution", () => {
  it.todo("resolves after 2 follow-ups");
  it.todo("resolves on plateau: no dimension rose by >= 1");
  it.todo("resolves when a deepen answer is great");
  it.todo("resolves when a clarify after weak stays weak");
});

describe("step — progression", () => {
  it.todo("bumps difficulty only when a thread ended great");
  it.todo("caps difficulty at 3");
  it.todo("checks the 10-question cap BEFORE issuing a follow-up");
  it.todo("caps followUpsUsed at 2");
});

describe("scripted sessions", () => {
  it.todo("all-weak: clarify -> resolve -> next topic, 4-8 questions");
  it.todo("all-strong: deepen -> resolve -> harder, fewer questions");
  it.todo("same weak answer always yields clarify (demo reproducibility)");
  it.todo("full session with a stubbed evaluator makes zero network calls");
});

export {};
