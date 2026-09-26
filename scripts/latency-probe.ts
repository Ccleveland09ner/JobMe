/**
 * HOUR 1. Run this before building anything else.
 *
 * TODO(slice 1): implement. Requires `tsx` (see README > Dependencies).
 * Ref: docs/TechDesign-JobMe-MVP.md > Latency Plan
 *
 * This answers the one genuine unknown in the design: can a full turn fit in
 * 2.5s on free tiers?
 *
 * Runs 10 evaluateAndDraft() calls and 10 TTS first-byte timings, prints
 * p50/p90 for each.
 *
 * Evidence needed to proceed as designed:
 *   eval p50 <= 1.5s   AND   TTS first byte <= 0.6s
 *
 * If eval p50 comes in above 1.5s: switch LLM_MODEL to a lighter tier, or cut
 * the prompt/few-shot examples down. Do that now, not in hour 20.
 *
 * Usage: npx tsx scripts/latency-probe.ts
 */

async function probeLatency() {
  throw new Error("TODO(slice 1): latency probe not implemented");
}

void probeLatency();

export {};
