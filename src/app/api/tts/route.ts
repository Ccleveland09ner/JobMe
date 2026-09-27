/**
 * GET /api/tts?text= — streams the recruiter's voice.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Voice Output
 *
 * This proxy exists for two reasons, both load-bearing:
 *   - the API key stays server-side
 *   - being same-origin lets an AnalyserNode read the stream for the avatar's
 *     lip-sync without a CORS dance
 *
 * Auth-gated so a stranger cannot drain a metered quota.
 */

import { NextResponse } from "next/server";

import { getUserOrNull, UNAUTHORIZED } from "@/lib/auth";
import { TtsQuery } from "@/lib/schemas";
import { TTS_MODEL_ID, TTS_OUTPUT_FORMAT } from "@/lib/voice/config";

export async function GET(request: Request) {
  const user = await getUserOrNull();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const url = new URL(request.url);
  const parsed = TtsQuery.safeParse({ text: url.searchParams.get("text") ?? "" });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Text is required and must be under 600 characters." },
      { status: 413 },
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  // Not an error: browser speech synthesis is the intended development
  // default, and the client falls back on a non-200 without complaint.
  if (!apiKey || !voiceId || process.env.TTS_PROVIDER !== "elevenlabs") {
    return NextResponse.json(
      { error: "Neural TTS is not enabled; use the browser voice." },
      { status: 503 },
    );
  }

  /**
   * Everything must be validated BEFORE the stream is returned: once streaming
   * begins the status line and headers are already on the wire and cannot be
   * changed.
   */
  let upstream: Response;
  try {
    upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream` +
        `?output_format=${TTS_OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: parsed.data.text,
          model_id: TTS_MODEL_ID,
        }),
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Voice service unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Voice service returned ${upstream.status}` },
      { status: 502 },
    );
  }

  // Piped straight through, never buffered — buffering forfeits the
  // first-byte target that the whole latency plan depends on.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      // nginx and similar proxies buffer streams by default.
      "X-Accel-Buffering": "no",
    },
  });
}
