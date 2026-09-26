-- Resume ingestion + the second answer duration.
-- Ref: docs/TechDesign-JobMe-MVP.md > Data Model
--
-- Follows the conventions of 20260926120000_jobme_schema.sql exactly: RLS on
-- every table, policies `to authenticated` using `(select auth.uid()) = user_id`,
-- no public policies, and the service-role key is never used.
--
-- The uploaded PDF is parsed and DISCARDED. Only redacted text, distilled
-- facts and embeddings are persisted, so no Supabase Storage bucket is
-- involved and the 1GB storage quota is untouched.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- resumes
-- ---------------------------------------------------------------------------
-- One current resume per user. `resume_facts` is a small distilled JSON blob
-- (roles, projects, metrics, skills) injected verbatim into every turn prompt.
-- Distilling once at upload keeps the prompt prefix identical across turns,
-- which is better for both latency and reproducibility than retrieving per
-- answer -- an answer-keyed lookup would force embed -> prompt -> LLM in
-- series and destroy the parallelism the turn budget depends on.

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Redacted at ingest. The raw text and the original filename are never
  -- persisted; the filename is usually the candidate's name.
  redacted_text text not null,
  resume_facts jsonb,
  parse_method text not null default 'local'
    check (parse_method in ('local', 'ocr')),
  -- Set when extraction looked like a flattened multi-column layout. The UI
  -- must show the extracted text for confirmation before embedding.
  layout_suspect boolean not null default false,
  page_count int,
  -- What redaction removed, by category. Diagnostics only, never prompted.
  redaction_report jsonb,
  created_at timestamptz not null default now()
);

create index if not exists resumes_user_created_idx
  on public.resumes (user_id, created_at desc);

alter table public.resumes enable row level security;

create policy "resumes_select_own" on public.resumes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "resumes_insert_own" on public.resumes
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "resumes_update_own" on public.resumes
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "resumes_delete_own" on public.resumes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- resume_chunks
-- ---------------------------------------------------------------------------
-- Deliberately UNINDEXED. pgvector without an index does exact nearest
-- neighbour with perfect recall, which at ~10-30 chunks per user is both
-- faster and more correct than an approximate index. An HNSW index would also
-- trigger the documented "fewer rows than requested when filtering on another
-- column" behaviour, and we always filter by resume_id. Add
--   create index on public.resume_chunks using hnsw (embedding vector_cosine_ops);
-- only if this table ever grows past a few thousand rows.

create table if not exists public.resume_chunks (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seq int not null,
  section text,
  content text not null,
  -- 768 dims: gemini-embedding-001 with outputDimensionality 768. Changing
  -- this value invalidates every stored vector -- they cannot be compared
  -- across dimensionalities.
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  unique (resume_id, seq)
);

create index if not exists resume_chunks_resume_idx
  on public.resume_chunks (resume_id, seq);

alter table public.resume_chunks enable row level security;

create policy "resume_chunks_select_own" on public.resume_chunks
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "resume_chunks_insert_own" on public.resume_chunks
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "resume_chunks_update_own" on public.resume_chunks
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "resume_chunks_delete_own" on public.resume_chunks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- match_resume_chunks
-- ---------------------------------------------------------------------------
-- `security invoker` (the default) on purpose, so RLS still applies INSIDE the
-- function and a caller can only ever match their own chunks. Supabase
-- explicitly recommends invoker over definer; a definer function here would
-- need a pinned search_path and would silently bypass the policies above.

create or replace function public.match_resume_chunks (
  p_resume_id uuid,
  p_query extensions.vector(768),
  p_match_count int default 5
)
returns table (id uuid, seq int, section text, content text, similarity float)
language sql
stable
as $$
  select
    c.id,
    c.seq,
    c.section,
    c.content,
    1 - (c.embedding operator(extensions.<=>) p_query) as similarity
  from public.resume_chunks c
  where c.resume_id = p_resume_id
    and c.embedding is not null
  order by c.embedding operator(extensions.<=>) p_query asc
  limit least(greatest(p_match_count, 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- Additions to existing tables
-- ---------------------------------------------------------------------------

-- The resume is candidate history; interview_sessions.role_text is the target
-- job description. They carry different information and both are kept.
-- Nullable and without an FK constraint would be safer if resumes might not
-- exist, but this migration creates it above, so the constraint is safe.
alter table public.interview_sessions
  add column if not exists resume_id uuid references public.resumes (id) on delete set null;

-- Two legitimate durations per answer:
--   hold time    - how long the talk button was held, including thinking pauses
--   capture time - how long the recognizer was actually capturing, summed
--                  across the auto-restarts Web Speech forces on long answers
-- `wpm` must be computed over CAPTURE time; hold time under-reports speaking
-- rate by 20-40% on a considered answer. Hold time is still worth keeping for
-- pacing feedback.
alter table public.turns
  add column if not exists capture_ms int;

alter table public.turns
  add column if not exists hold_ms int;
