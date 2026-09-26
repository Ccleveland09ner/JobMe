/**
 * Precomputes the question-bank vectors into data/bank-embeddings.json.
 *
 * TODO(slice 7): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Embedding Checks
 *
 * Embeds ~15 question texts + 10 exemplars (2 per topic). The output IS
 * COMMITTED, so Vercel never makes a cold-start embedding call just to score
 * the first answer of a session.
 *
 * Re-run whenever lib/engine/bank.ts changes.
 *
 * Usage: npx tsx scripts/embed-bank.ts
 */

async function embedBank() {
  throw new Error("TODO(slice 7): embed-bank not implemented");
}

void embedBank();

export {};
