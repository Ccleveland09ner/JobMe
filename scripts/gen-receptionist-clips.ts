/**
 * Records Ms. Crystal's twelve lines (src/components/receptionist/lines.ts)
 * in the ElevenLabs "River" voice, once, and commits them:
 *
 *   public/audio/receptionist/greetings/new-1.mp3 … returning-4.mp3
 *   public/audio/receptionist/goodbyes/goodbye-1.mp3 … goodbye-4.mp3
 *   src/components/receptionist/clips.json   per-character timings (lip-sync, the bubble)
 *
 * The voice is fixed here, not read from ELEVENLABS_VOICE_ID (the recruiter's).
 * A line whose clip exists and whose text is unchanged is skipped; --force
 * records everything again. Needs ELEVENLABS_API_KEY (~1,100 characters).
 *
 * Usage: npm run gen:receptionist [-- --force]
 */

import "./_load-env";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { LINES, RECEPTIONIST_VOICE_ID, spokenText } from "../src/components/receptionist/lines";
import type { ClipTimings } from "../src/components/receptionist/clips";

import { requireEnv } from "./_env";

/** The higher-quality model: these are recorded once, so latency doesn't matter. */
const MODEL_ID = "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";
/** A little livelier than River's calm default: she is welcoming people in. */
const VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true };

const TIMINGS_PATH = "src/components/receptionist/clips.json";

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

async function record(text: string, apiKey: string): Promise<{ audio: Buffer; alignment: Alignment }> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${RECEPTIONIST_VOICE_ID}/with-timestamps?output_format=${OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
    },
  );
  if (!response.ok) throw new Error(`ElevenLabs answered ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as { audio_base64?: string; alignment?: Alignment | null };
  if (!body.audio_base64 || !body.alignment) throw new Error("ElevenLabs returned no audio or no timings");
  return { audio: Buffer.from(body.audio_base64, "base64"), alignment: body.alignment };
}

async function main() {
  const force = process.argv.includes("--force");
  const apiKey = requireEnv("ELEVENLABS_API_KEY");
  const timings: Record<string, ClipTimings> = existsSync(TIMINGS_PATH)
    ? (JSON.parse(readFileSync(TIMINGS_PATH, "utf8")) as Record<string, ClipTimings>)
    : {};

  for (const line of LINES) {
    const spoken = spokenText(line.text);
    const file = join("public", line.src);
    if (!force && existsSync(file) && timings[line.id]?.text === spoken) {
      console.log(`  ${line.id}: up to date`);
      continue;
    }

    const { audio, alignment } = await record(spoken, apiKey);
    // The bubble reveals the line by these timings, character for character.
    if (alignment.characters.join("") !== spoken) {
      throw new Error(`${line.id}: the timings don't spell the line ("${alignment.characters.join("")}")`);
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, audio);
    timings[line.id] = {
      text: spoken,
      duration: round(Math.max(...alignment.character_end_times_seconds)),
      starts: alignment.character_start_times_seconds.map(round),
      ends: alignment.character_end_times_seconds.map(round),
    };
    console.log(`  ${line.id}: ${(audio.length / 1024).toFixed(0)} KB, ${timings[line.id].duration}s`);
  }

  // In LINES order, so a re-record only changes the lines it touched.
  const ordered = Object.fromEntries(LINES.filter((l) => timings[l.id]).map((l) => [l.id, timings[l.id]]));
  // Each list of times on one line.
  const json = JSON.stringify(ordered, null, 2).replace(/\[\s+([-\d.,\s]+?)\s+\]/g, (_, n: string) => `[${n.split(/,\s*/).join(", ")}]`);
  writeFileSync(TIMINGS_PATH, `${json}\n`);
  console.log(`Wrote ${TIMINGS_PATH}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
