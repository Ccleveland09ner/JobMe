/**
 * Minimal .env.local loader: `next dev` loads it automatically, tsx does not,
 * and Node's --env-file hard-fails when the file is absent. Existing
 * process.env values always win, so CI and shell overrides still work.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnv(file = ".env.local"): void {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;

  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/** Reads a required env var or exits with an actionable message. */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(
      `\nMissing ${key}.\n` +
        `  cp .env.example .env.local, then fill it in.\n` +
        `  Free-tier limits: https://aistudio.google.com/rate-limit\n`,
    );
    process.exit(1);
  }
  return value;
}

/** p50 / p90 / max over a list of millisecond timings. */
export function percentiles(ms: number[]): {
  p50: number;
  p90: number;
  max: number;
} {
  const s = [...ms].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { p50: at(0.5), p90: at(0.9), max: s[s.length - 1] };
}
