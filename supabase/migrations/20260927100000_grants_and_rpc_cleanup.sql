-- Two fixes discovered by applying the schema to a real database.

-- ---------------------------------------------------------------------------
-- 1. Remove the duplicate RPC overload
-- ---------------------------------------------------------------------------
-- 20260926190000 defines match_resume_chunks(uuid, extensions.vector, int) and
-- 20260927090000 defines match_resume_chunks(uuid, text, int). Both now exist,
-- and PostgREST cannot choose between them:
--   PGRST203 Could not choose the best candidate function
--
-- The text version is kept. It resolves the `vector` type at call time through
-- its own search_path rather than at definition time, so it does not care which
-- schema the extension lives in — which is what made it work when the
-- schema-qualified version did not.

drop function if exists public.match_resume_chunks(uuid, extensions.vector, int);

-- ---------------------------------------------------------------------------
-- 2. Grant table access to the authenticated role
-- ---------------------------------------------------------------------------
-- RLS decides WHICH ROWS a caller sees, but a role still needs a table-level
-- GRANT to reach the table at all. Without these every query fails with
-- `42501 permission denied` before any policy is ever consulted — which looks
-- exactly like a missing table from the client side.
--
-- Granted to `authenticated` only, never `anon`: JobMe has no public data, and
-- every route already requires a signed-in user. An unauthenticated request
-- failing here is correct behaviour, not a bug.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.interview_sessions to authenticated;
grant select, insert, update, delete on public.turns to authenticated;
grant select, insert, update, delete on public.reports to authenticated;
grant select, insert, update, delete on public.resumes to authenticated;
grant select, insert, update, delete on public.resume_chunks to authenticated;

grant execute on function public.match_resume_chunks(uuid, text, int)
  to authenticated;
