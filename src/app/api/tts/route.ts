/**
 * GET /api/tts?text=: streams the recruiter's voice. Proxied so the key stays
 * server-side and lip-sync can read the stream same-origin. Auth-gated.
 */

import { NextResponse } from "next/server";

import { getUserOrNull } from "@/lib/auth";
import { unauthorized, unavailable } from "@/lib/http";
import { TtsQuery } from "@/lib/schemas";
import { TTS_MODEL_ID, TTS_OUTPUT_FORMAT } from "@/lib/voice/config";

export async function GET(request: Request) {
  if (!(await getUserOrNull())) return unauthorized();

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
    return unavailable({ error: "Neural TTS is not enabled; use the browser voice." });
  }

  // align=1: audio plus per-character times for lip-sync, as JSON (not streamed).
  if (url.searchParams.get("align") === "1") {
    return alignedSpeech(parsed.data.text, apiKey, voiceId);
  }

  // Validate before streaming: once it starts, the status is already sent.
  const upstream = await elevenLabs("stream", parsed.data.text, apiKey, voiceId);
  if (!upstream.ok) return upstream.error;
  if (!upstream.response.body) return badGateway(`Voice service returned ${upstream.response.status}`);

  // Never buffered: that would forfeit the first-byte target.
  return new Response(upstream.response.body, {
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
  const upstream = await elevenLabs("with-timestamps", text, apiKey, voiceId);
  if (!upstream.ok) return upstream.error;

  const body = (await upstream.response.json().catch(() => null)) as
    | { audio_base64?: string; alignment?: Alignment | null }
    | null;
  if (!body?.audio_base64) return badGateway("Voice service returned no audio");

  return NextResponse.json(
    { audio: body.audio_base64, alignment: body.alignment ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const badGateway = (error: string) => NextResponse.json({ error }, { status: 502 });

/** Asks ElevenLabs to say `text`; the 502 to answer with when it can't. */
async function elevenLabs(
  endpoint: "stream" | "with-timestamps",
  text: string,
  apiKey: string,
  voiceId: string,
): Promise<{ ok: true; response: Response } | { ok: false; error: NextResponse }> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/${endpoint}?output_format=${TTS_OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: TTS_MODEL_ID }),
      },
    );
  } catch (err) {
    return { ok: false, error: badGateway(`Voice service unreachable: ${(err as Error).message}`) };
  }
  if (!response.ok) return { ok: false, error: badGateway(`Voice service returned ${response.status}`) };
  return { ok: true, response };
}
