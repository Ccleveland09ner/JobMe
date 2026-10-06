-- Grants for the service_role key, used by operational tooling only.
--
-- WHY THIS WAS MISSING. 20260927100000 granted the application tables to
-- `authenticated` and nothing else, on the reasoning that JobMe never uses the
-- service key. That is still true of the APPLICATION — every route goes
-- through RLS with the cookie-based server client — but it left admin tooling
-- unable to touch its own tables:
--
--   permission denied for table resumes
--
-- `service_role` bypasses RLS, but bypassing row policies is not the same as
-- having a table-level GRANT, and Postgres checks the grant first. Supabase's
-- own default privileges normally cover this; tables created by a migration
-- do not inherit them.
--
-- The safety property is unchanged and does not come from withholding grants:
-- the key is server-side only, never prefixed NEXT_PUBLIC_, and no application
-- code reads it.

grant usage on schema public to service_role;

grant all on public.profiles to service_role;
grant all on public.interview_sessions to service_role;
grant all on public.turns to service_role;
grant all on public.reports to service_role;
grant all on public.resumes to service_role;
grant all on public.resume_chunks to service_role;

grant execute on function public.match_resume_chunks(uuid, text, int)
  to service_role;
grant execute on function public.submit_turn(uuid, int, jsonb, jsonb)
  to service_role;

-- Future tables in this schema, so the next migration does not reintroduce
-- the same gap.
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
