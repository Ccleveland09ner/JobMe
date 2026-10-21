/**
 * GET /api/tts?text=: streams the recruiter's voice. Proxied so the key stays
 * server-side and lip-sync can read the stream same-origin. Auth-gated.
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

  // Not an error: the client falls back to the browser voice.
  if (!apiKey || !voiceId || process.env.TTS_PROVIDER !== "elevenlabs") {
    return NextResponse.json(
      { error: "Neural TTS is not enabled; use the browser voice." },
      { status: 503 },
    );
  }

  // align=1: audio plus per-character times for lip-sync, as JSON (not streamed).
  if (url.searchParams.get("align") === "1") {
    return alignedSpeech(parsed.data.text, apiKey, voiceId);
  }

  // Validate before streaming: once it starts, the status is already sent.
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

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** ElevenLabs "with-timestamps": base64 audio plus per-character times. */
async function alignedSpeech(text: string, apiKey: string, voiceId: string): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps` +
        `?output_format=${TTS_OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: TTS_MODEL_ID }),
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Voice service unreachable: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: `Voice service returned ${upstream.status}` }, { status: 502 });
  }

  const body = (await upstream.json().catch(() => null)) as
    | { audio_base64?: string; alignment?: Alignment | null }
    | null;
  if (!body?.audio_base64) {
    return NextResponse.json({ error: "Voice service returned no audio" }, { status: 502 });
  }

  return NextResponse.json(
    { audio: body.audio_base64, alignment: body.alignment ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
