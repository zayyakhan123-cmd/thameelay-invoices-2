-- ============================================================================
-- Approval gate + per-user daily AI rate limit
-- ============================================================================
-- Two protections layered on top of normal Supabase auth:
--   1. user_profiles.approved must be true before the Edge Function will
--      accept the user's AI request (server-enforced).
--   2. ai_usage tracks per-user, per-day extraction counts; the Edge
--      Function rejects with 429 after the daily cap is hit.
--
-- Approve a new user (run in SQL Editor):
--   update user_profiles set approved=true, approved_at=now()
--     where email='friend@example.com';
--
-- List pending users:
--   select email, created_at from user_profiles
--     where not approved order by created_at desc;
-- ============================================================================

-- USER PROFILES --------------------------------------------------------------
create table if not exists user_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text,
  approved    boolean not null default false,
  approved_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table user_profiles enable row level security;

-- A user can read their own profile (client uses this to detect pending state).
drop policy if exists "users_read_own_profile" on user_profiles;
create policy "users_read_own_profile" on user_profiles
  for select using (user_id = auth.uid());

-- Auto-create a profile row whenever a new auth.users row is created.
-- SECURITY DEFINER so it can write into public.user_profiles even though the
-- trigger fires in the auth schema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.user_profiles(user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: existing users are auto-approved so the admin (and any current
-- test accounts) aren't locked out the moment this migration runs.
insert into user_profiles(user_id, email, approved, approved_at)
select id, email, true, now() from auth.users
on conflict (user_id) do update
  set approved = true,
      approved_at = coalesce(user_profiles.approved_at, excluded.approved_at);

-- AI USAGE -------------------------------------------------------------------
create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

alter table ai_usage enable row level security;

-- A user can see their own counters (useful if we surface usage in the UI).
drop policy if exists "users_read_own_usage" on ai_usage;
create policy "users_read_own_usage" on ai_usage
  for select using (user_id = auth.uid());

-- Atomic check-and-increment. Uses auth.uid() inside so a caller can only
-- spend against their own counter, even if they call the RPC directly with
-- the Supabase JS client (defense in depth — the Edge Function calls this
-- on every AI request).
--
-- Returns one row: (allowed boolean, current_count int).
--   allowed=true   → request is under the cap; count was incremented
--   allowed=false  → request is over the cap; the failed increment was rolled
--                    back so a blocked user's counter doesn't keep climbing.
create or replace function check_and_increment_ai_usage(lim int)
returns table(allowed boolean, current_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c   int;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into ai_usage(user_id, day, count)
    values (uid, current_date, 1)
  on conflict (user_id, day) do update
    set count = ai_usage.count + 1
  returning count into c;

  if c > lim then
    update ai_usage set count = count - 1
      where user_id = uid and day = current_date;
    return query select false, c - 1;
  else
    return query select true, c;
  end if;
end;
$$;

revoke execute on function check_and_increment_ai_usage(int) from public;
grant  execute on function check_and_increment_ai_usage(int) to authenticated;
