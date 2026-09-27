-- Atomic turn submission, turn markers, and the pre-generated question plan.
-- Ref: docs/Backend-Implementation-Brief.md §2.4, §6.3, §6.5
--
-- Follows the conventions of 20260926120000_jobme_schema.sql: RLS on every
-- table, `to authenticated` only, no public access, and the service-role key
-- is never used. No new tables — the columns below inherit their table's
-- existing policies and grants.

-- ---------------------------------------------------------------------------
-- 1. Turn markers
-- ---------------------------------------------------------------------------
-- degraded_reason: why a turn is unscored (`scores` is null). A rate limit and
--   a timeout need different fixes before a demo, and the notepad deliberately
--   never says which one happened.
-- question_source / resume_item_id: which thread the question belonged to, so
--   the scorecard can show resume coverage question by question.

alter table public.turns
  add column if not exists degraded_reason text
    check (degraded_reason in ('timeout', 'rate_limited', 'unavailable'));

alter table public.turns
  add column if not exists question_source text
    check (question_source in ('bank', 'resume'));

alter table public.turns
  add column if not exists resume_item_id text;

-- ---------------------------------------------------------------------------
-- 2. The pre-generated question plan
-- ---------------------------------------------------------------------------
-- question_plan: personalised thread openings written once at session start
--   (lib/ai/question-plan.ts), so no turn spends a model call wording an
--   opening. Null means no plan, and the fixed bank text is used as before.
-- job_url: the posting link, when the job description came from one.

alter table public.interview_sessions
  add column if not exists question_plan jsonb;

alter table public.interview_sessions
  add column if not exists job_url text;

-- ---------------------------------------------------------------------------
-- 3. submit_turn — one answered turn, written atomically
-- ---------------------------------------------------------------------------
-- The turn route used to write twice: UPDATE engine_state, then INSERT the
-- turn. Two ways that went wrong:
--   - Push-to-talk double-fires. Two near-simultaneous submits of the same
--     answer both passed the clientTurnSeq check, both updated the session
--     (last write wins), and one insert then failed unique(session_id, seq).
--     The surviving state could belong to the request whose turn was lost.
--   - A failure between the two writes left the state advanced with no turn.
--
-- One transaction fixes both. The update applies only while the stored
-- turnSeq is still the one the caller read (optimistic concurrency); otherwise
-- it raises SQLSTATE PT409, which PostgREST answers as HTTP 409.
--
-- `security invoker`, so RLS applies inside: a caller can only advance their
-- own session and insert their own turn. The search_path is pinned empty and
-- every name is schema-qualified.

create or replace function public.submit_turn (
  p_session_id uuid,
  p_seq int,
  p_engine_state jsonb,
  p_turn jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_done boolean := coalesce((p_engine_state ->> 'done')::boolean, false);
  v_turn_id uuid;
begin
  -- A caller bug, not a race: the state and the row must describe one turn.
  if (p_engine_state ->> 'turnSeq')::int is distinct from p_seq then
    raise exception 'engine_state.turnSeq does not match p_seq'
      using errcode = '22023';
  end if;

  update public.interview_sessions
     set engine_state = p_engine_state,
         question_count = (p_engine_state ->> 'questionCount')::int,
         status = case when v_done then 'completed' else status end,
         ended_at = case when v_done then coalesce(ended_at, now()) else ended_at end
   where id = p_session_id
     and status = 'in_progress'
     and (engine_state ->> 'turnSeq')::int = p_seq - 1;

  if not found then
    raise exception 'stale turn: session is not at turn %', p_seq - 1
      using errcode = 'PT409';
  end if;

  -- user_id is left to its auth.uid() default, like every other insert.
  insert into public.turns (
    session_id, seq, topic, question_type, difficulty, question_text,
    answer_transcript, scores, band, primary_gap, evidence, notepad_text,
    reason_text, wpm, filler_count, hold_ms, capture_ms, degraded_reason,
    question_source, resume_item_id
  )
  select
    p_session_id, p_seq, t.topic, t.question_type, t.difficulty,
    t.question_text, t.answer_transcript, t.scores, t.band, t.primary_gap,
    t.evidence, t.notepad_text, t.reason_text, t.wpm, t.filler_count,
    t.hold_ms, t.capture_ms, t.degraded_reason, t.question_source,
    t.resume_item_id
  from jsonb_populate_record(null::public.turns, p_turn) as t
  returning id into v_turn_id;

  return v_turn_id;
end;
$fn$;

-- Supabase's default privileges grant new functions to anon as well; JobMe has
-- no anonymous callers, so only signed-in users may execute this.
revoke execute on function public.submit_turn(uuid, int, jsonb, jsonb)
  from public, anon;
grant execute on function public.submit_turn(uuid, int, jsonb, jsonb)
  to authenticated;
