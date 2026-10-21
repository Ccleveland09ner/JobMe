import type { SupabaseClient } from "@supabase/supabase-js";

/** What a loader needs from a Supabase client, server or browser: table reads, under RLS. */
export type RowReader = Pick<SupabaseClient, "from">;
