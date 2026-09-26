-- JobMe MVP schema
-- Ref: docs/TechDesign-JobMe-MVP.md > Data Model
--
-- RLS is on for all four tables with no public policies. Every policy is
-- `to authenticated` using `(select auth.uid()) = user_id`. API routes use the
-- cookie-based server client, so RLS applies automatically and the service-role
-- key is never used anywhere in JobMe.
--
-- Audio is never stored. Only transcripts, scores and reports.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  target_role text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

-- Create the profile row on sign-up, display_name defaulting to the email
-- local part. security definer because it writes on behalf of a brand-new user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- interview_sessions
-- ---------------------------------------------------------------------------
-- engine_state is the live source of truth for the state machine. It is
-- rewritten synchronously on every turn, which is what makes the session
-- serverless-safe and refresh-resumable.

create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  track text not null default 'behavioral_swe_intern',
  role_text text,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  question_count int not null default 0,
  engine_state jsonb not null,
  overall_scores jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists interview_sessions_user_started_idx
  on public.interview_sessions (user_id, started_at desc);

alter table public.interview_sessions enable row level security;

create policy "sessions_select_own" on public.interview_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "sessions_insert_own" on public.interview_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "sessions_update_own" on public.interview_sessions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "sessions_delete_own" on public.interview_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- turns
-- ---------------------------------------------------------------------------
-- scores is null for an unscored turn (the evaluator failed twice). Those turns
-- are kept, shown honestly, and excluded from every average.

create table if not exists public.turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seq int not null,
  topic text,
  question_type text check (question_type in ('opening', 'deepen', 'clarify')),
  difficulty int,
  question_text text,
  answer_transcript text,
  scores jsonb,
  band text check (band in ('weak', 'mediocre', 'great')),
  primary_gap text,
  evidence text,
  notepad_text text,
  reason_text text,
  wpm int,
  filler_count int,
  created_at timestamptz not null default now(),
  -- paired with clientTurnSeq in the turn route, this is what makes a
  -- double-submit harmless instead of duplicating a turn
  unique (session_id, seq)
);

create index if not exists turns_session_seq_idx
  on public.turns (session_id, seq);

alter table public.turns enable row level security;

create policy "turns_select_own" on public.turns
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "turns_insert_own" on public.turns
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "turns_update_own" on public.turns
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "turns_delete_own" on public.turns
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
-- Generated once per session, then read. session_id is the PK, which is what
-- makes the report route idempotent at the database level too.

create table if not exists public.reports (
  session_id uuid primary key references public.interview_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  summary text,
  weakest_turn_id uuid references public.turns (id) on delete set null,
  rewrite_text text,
  stats jsonb,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "reports_select_own" on public.reports
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "reports_insert_own" on public.reports
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "reports_update_own" on public.reports
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "reports_delete_own" on public.reports
  for delete to authenticated using ((select auth.uid()) = user_id);
