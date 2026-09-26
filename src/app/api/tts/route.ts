/**
 * GET /api/tts?text= - streams the recruiter's voice.
 *
 * TODO(slice 3): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Voice Output
 *
 * Response: audio/mpeg stream. Errors: 401, 413, 502 (client falls back).
 *
 * Pipe the upstream body straight through - do not buffer it, or the first-byte
 * target (<= 0.6s) is gone.
 *
 * POST https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/stream
 *   ?output_format=mp3_44100_128
 *   header: xi-api-key
 *   body:   { text, model_id: 'eleven_flash_v2_5' }
 *
 * Two things this route exists for, both load-bearing:
 *   - the API key stays server-side
 *   - being same-origin lets the AnalyserNode read the stream without CORS
 *
 * Requires auth, so a stranger cannot drain the free-tier quota.
 * Caps text at 600 chars.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
