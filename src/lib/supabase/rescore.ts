import type { SupabaseClient } from "@supabase/supabase-js";

import type { LateScore } from "../interview/turn";

/**
 * rescore_turn: writes a score onto a turn saved unscored, from the turn
 * route (a late score) or the report (a re-score). The database writes only a
 * still-unscored turn of the caller's, so whichever lands first wins.
 */
export async function saveTurnScore(
  supabase: Pick<SupabaseClient, "rpc">,
  turnId: string,
  score: LateScore,
): Promise<void> {
  const { error } = await supabase.rpc("rescore_turn", {
    p_turn_id: turnId,
    p_scores: score.scores,
    p_band: score.band,
    p_primary_gap: score.primaryGap,
    p_notepad_text: score.observation || null,
  });
  if (error) throw new Error(`rescore turn: ${error.message}`);
}
