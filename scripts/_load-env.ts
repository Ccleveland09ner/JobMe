/**
 * Import this first, before any app module: it fills process.env from
 * .env.local, and some modules read their settings as they load
 * (lib/ai/llm.ts reads the model names), so a loadEnv() call in the script's
 * body would come too late for them.
 */

import { loadEnv } from "./_env";

loadEnv();
