/**
 * GET /api/tts?text= — streams the recruiter's voice.
 *
 * The proxy exists for two load-bearing reasons: the API key stays
 * server-side, and being same-origin lets an AnalyserNode read the stream for
 * lip-sync without CORS. Auth-gated, so a stranger cannot drain the quota.
 *
 * Ref: TechDesign > Voice Output
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

  // Not an error: browser synthesis is the intended dev default, and the
  // client falls back on a non-200 without complaint.
  if (!apiKey || !voiceId || process.env.TTS_PROVIDER !== "elevenlabs") {
    return NextResponse.json(
      { error: "Neural TTS is not enabled; use the browser voice." },
      { status: 503 },
    );
  }

  // Validate BEFORE returning the stream: once it begins, the status line and
  // headers are already on the wire.
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

  // Never buffered: that would forfeit the first-byte target.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      // nginx and friends buffer streams by default.
      "X-Accel-Buffering": "no",
    },
  });
}
