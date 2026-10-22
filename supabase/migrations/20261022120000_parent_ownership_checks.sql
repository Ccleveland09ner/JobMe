-- Inserts check that the parent row belongs to the caller, and grants the app
-- never uses are revoked.
--
-- Foreign keys are checked without row-level security. Until now a signed-in
-- user who knew another user's session id could insert a turn or a report
-- against it: their own user_id passed the policy, and the session_id passed
-- the foreign key. That blocks the owner's next turn (its sequence number is
-- taken) or their report (its primary key is taken). The same held for resume
-- chunks, and for a session pointing at someone else's resume.
--
-- Not applied automatically. Review it, try it on a staging project (the
-- cascade from deleting a session must still remove its turns and report),
-- then run `supabase db push`.

drop policy if exists "sessions_insert_own" on public.interview_sessions;
create policy "sessions_insert_own" on public.interview_sessions
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (
      resume_id is null
      or exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = (select auth.uid()))
    )
  );

drop policy if exists "turns_insert_own" on public.turns;
create policy "turns_insert_own" on public.turns
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.interview_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.interview_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );

drop policy if exists "resume_chunks_insert_own" on public.resume_chunks;
create policy "resume_chunks_insert_own" on public.resume_chunks
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = (select auth.uid()))
  );

-- The app only inserts turns (through submit_turn), reports and chunks, and
-- deletes a resume only to roll back a failed upload. Deleting a session
-- cascades without these grants.
revoke update, delete on public.turns from authenticated;
revoke update, delete on public.reports from authenticated;
revoke update on public.resumes from authenticated;
revoke update, delete on public.resume_chunks from authenticated;
revoke delete on public.profiles from authenticated;
