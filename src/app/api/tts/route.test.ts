/** The HTTP contract of GET /api/tts: statuses, bodies, and the request sent upstream. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getUserOrNull: vi.fn(), UNAUTHORIZED: { error: "Unauthorized" } }));

import { getUserOrNull } from "@/lib/auth";
import { TTS_MODEL_ID, TTS_OUTPUT_FORMAT } from "@/lib/voice/config";

import { GET } from "./route";

const upstream = vi.fn<typeof fetch>();
const request = (query: string) => new Request(`http://localhost/api/tts?${query}`);

beforeEach(() => {
  vi.mocked(getUserOrNull).mockResolvedValue({ id: "user-1" });
  vi.stubGlobal("fetch", upstream);
  vi.stubEnv("ELEVENLABS_API_KEY", "key-1");
  vi.stubEnv("ELEVENLABS_VOICE_ID", "voice-1");
  vi.stubEnv("TTS_PROVIDER", "elevenlabs");
  upstream.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GET /api/tts", () => {
  it("answers 401 when signed out", async () => {
    vi.mocked(getUserOrNull).mockResolvedValue(null);
    const res = await GET(request("text=Hello"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("answers 413 for missing or over-long text", async () => {
    for (const query of ["", `text=${"a".repeat(601)}`]) {
      const res = await GET(request(query));
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: "Text is required and must be under 600 characters." });
    }
  });

  it("answers 503 when neural voice is off, so the browser voice takes over", async () => {
    vi.stubEnv("TTS_PROVIDER", "browser");
    const res = await GET(request("text=Hello"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Neural TTS is not enabled; use the browser voice." });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("streams the audio, unbuffered and uncached", async () => {
    upstream.mockResolvedValue(new Response("mp3-bytes", { status: 200 }));
    const res = await GET(request("text=Hello there"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    expect(await res.text()).toBe("mp3-bytes");
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/voice-1/stream?output_format=${TTS_OUTPUT_FORMAT}`);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe("key-1");
    expect(JSON.parse(String(init?.body))).toEqual({ text: "Hello there", model_id: TTS_MODEL_ID });
  });

  it("answers 502 when the voice service is unreachable or refuses", async () => {
    upstream.mockRejectedValueOnce(new Error("ECONNRESET"));
    let res = await GET(request("text=Hello"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Voice service unreachable: ECONNRESET" });

    upstream.mockResolvedValueOnce(new Response(null, { status: 429 }));
    res = await GET(request("text=Hello"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Voice service returned 429" });
  });

  it("returns audio with per-character timing as JSON for lip-sync", async () => {
    const alignment = { characters: ["H", "i"], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] };
    upstream.mockResolvedValue(Response.json({ audio_base64: "AAAA", alignment }));
    const res = await GET(request("text=Hi&align=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ audio: "AAAA", alignment });
    expect(upstream.mock.calls[0][0]).toBe(
      `https://api.elevenlabs.io/v1/text-to-speech/voice-1/with-timestamps?output_format=${TTS_OUTPUT_FORMAT}`,
    );
  });

  it("answers 502 when the timed voice is unreachable, refuses, or sends no audio", async () => {
    upstream.mockRejectedValueOnce(new Error("timeout"));
    let res = await GET(request("text=Hi&align=1"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Voice service unreachable: timeout" });

    upstream.mockResolvedValueOnce(new Response(null, { status: 500 }));
    res = await GET(request("text=Hi&align=1"));
    expect(await res.json()).toEqual({ error: "Voice service returned 500" });

    upstream.mockResolvedValueOnce(Response.json({ alignment: null }));
    res = await GET(request("text=Hi&align=1"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Voice service returned no audio" });
  });
});
