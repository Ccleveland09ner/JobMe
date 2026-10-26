-- rescore_turn: fills in a turn that live scoring missed.
--
-- A turn whose evaluation outlasts the live wait is saved with scores null,
-- and the interview moves on. Two callers then fill it in, so the scorecard,
-- the ledger and the trend line all see the score:
--   - the turn route, when that same evaluation lands a few seconds later;
--   - the report, which scores again any question still unscored when it is
--     filed, onto that question's last turn.
--
-- Users lost UPDATE on turns in 20261022120000, so this is `security definer`
-- and does its own checks: the turn must be the caller's, and still unscored.
-- A scored turn is never overwritten. degraded_reason is kept, for diagnosing
-- live latency; a turn with scores is no longer shown as unscored.
--
-- Not applied automatically. Review it, then run `supabase db push`. Until it
-- is applied the report still uses the re-scores, but the turn rows stay
-- unscored.

create or replace function public.rescore_turn (
  p_turn_id uuid,
  p_scores jsonb,
  p_band text,
  p_primary_gap text,
  p_notepad_text text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if jsonb_typeof(p_scores) is distinct from 'object' then
    raise exception 'p_scores must be an object' using errcode = '22023';
  end if;

  update public.turns
     set scores = p_scores,
         band = p_band,
         primary_gap = p_primary_gap,
         notepad_text = coalesce(p_notepad_text, notepad_text)
   where id = p_turn_id
     and user_id = (select auth.uid())
     and scores is null;

  return found;
end;
$fn$;

revoke execute on function public.rescore_turn(uuid, jsonb, text, text, text)
  from public, anon;
grant execute on function public.rescore_turn(uuid, jsonb, text, text, text)
  to authenticated, service_role;
