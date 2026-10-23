/** Pacing for scripts that call the model: the free tier's rate, with a margin. Import after ./_load-env. */

import { FREE_TIER_RPM } from "../src/lib/ai/llm";

export const PACE_MS = Math.ceil(60_000 / FREE_TIER_RPM) + 200;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
