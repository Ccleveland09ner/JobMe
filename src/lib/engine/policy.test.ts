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

export {};
