/**
 * Generates public/audio/ack/ack-01..10.mp3 once, in the recruiter's voice.
 *
 * TODO(slice 3): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Voice Output, > Latency Plan
 *
 * These static clips are what make the interview feel live: one starts within
 * ~0.3s of submit and covers roughly 1.5s of the turn latency, so the candidate
 * never sits in silence waiting for the next question.
 *
 * Lines are short acknowledgments, not answers - "Okay, thanks for walking me
 * through that." Nothing content-specific, or they will contradict the answer.
 *
 * Generated once with ELEVENLABS_VOICE_ID and committed, so they cost no
 * runtime quota. Also generate an intro fallback clip.
 *
 * Usage: npx tsx scripts/gen-ack-clips.ts
 */

async function genAckClips() {
  throw new Error("TODO(slice 3): gen-ack-clips not implemented");
}

void genAckClips();

export {};
