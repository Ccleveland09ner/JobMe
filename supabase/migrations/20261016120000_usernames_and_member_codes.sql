-- Usernames and member codes, for email + password accounts.
--
-- Every account now has:
--   - a USERNAME the user chooses at sign-up. Unique regardless of case
--     ("Kaz" and "kaz" are the same name), 3–20 letters, digits, "_" or ".".
--   - a MEMBER CODE the system assigns, e.g. JM-7K3Q9TXP: unique, never
--     reused, never chosen by the user. It tells two people apart even when
--     their display names match.
--
-- The username arrives in the sign-up request's user metadata
-- (supabase.auth.signUp({ options: { data: { username } } })) and the
-- existing on_auth_user_created trigger copies it into profiles. A taken
-- username makes that insert fail, which fails the sign-up itself: the unique
-- index is the guarantee, and username_available() below is only a courtesy
-- check so the form can say so before submitting.
--
-- Accounts created before this migration (email-code sign-in) get a member
-- code here but no username; username stays nullable for them.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists username text,
  add column if not exists member_code text;

alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[A-Za-z0-9_.]{3,20}$');

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

alter table public.profiles
  add constraint profiles_member_code_format
  check (member_code ~ '^JM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$');

create unique index if not exists profiles_member_code_key
  on public.profiles (member_code);

-- ---------------------------------------------------------------------------
-- Member codes
-- ---------------------------------------------------------------------------
-- 8 characters from a 31-letter alphabet with no 0/O, 1/I/L: about 8.5e11
-- codes, read aloud without ambiguity. A clash is astronomically rare and
-- simply retried; the unique index is what guarantees uniqueness.

create or replace function public.new_member_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text;
begin
  loop
    code := 'JM-';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.member_code = code);
  end loop;
  return code;
end;
$$;

-- Backfill existing accounts, then require a code from now on.
update public.profiles set member_code = public.new_member_code() where member_code is null;

alter table public.profiles alter column member_code set not null;
alter table public.profiles alter column member_code set default public.new_member_code();

-- Profiles are created only by the sign-up trigger, so the member code is
-- always the system's and the username always the one checked at sign-up.
-- Users may change their display name and target role, never their member
-- code or username.
revoke insert, update on public.profiles from authenticated;
grant update (display_name, target_role) on public.profiles to authenticated;
drop policy if exists "profiles_insert_own" on public.profiles;

-- ---------------------------------------------------------------------------
-- Sign-up trigger: copy the chosen username, assign the member code
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
begin
  insert into public.profiles (id, display_name, username, member_code)
  values (
    new.id,
    coalesce(chosen, split_part(new.email, '@', 1)),
    chosen,
    public.new_member_code()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- username_available(name): may the sign-up form offer this name?
-- ---------------------------------------------------------------------------
-- security definer: profiles is RLS-protected, and a signed-out visitor must
-- be able to ask. It returns only a boolean — never whose name it is.

create or replace function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select name ~ '^[A-Za-z0-9_.]{3,20}$'
     and not exists (select 1 from public.profiles p where lower(p.username) = lower(name));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

revoke all on function public.new_member_code() from public;
