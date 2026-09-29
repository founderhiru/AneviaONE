-- =============================================================================
-- Phase 1 · Migration 1 — shared helpers + user profiles
--
-- * `private` schema: internal trigger/helper functions. It is NOT exposed
--   through the Supabase Data API, so none of these functions are callable
--   from the mobile app.
-- * `public.profiles`: one row per auth user, created automatically on
--   signup. Holds app-level account state (onboarding) — never health data.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to postgres, service_role;

-- Keeps `updated_at` truthful on every UPDATE.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  display_name            text check (display_name is null or char_length(display_name) between 1 and 120),
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.profiles is
  'App-level account state for each auth user (1:1 with auth.users). Contains no health data.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create the profile row automatically when someone signs up.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- Backfill any users that signed up before this migration.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Row Level Security — a user can only ever see / change their own profile.
-- Rows are created by the trigger above and removed by the auth.users cascade,
-- so the app gets no INSERT or DELETE at all.
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Least privilege at the column level too (defence in depth on top of RLS).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, onboarding_completed_at) on public.profiles to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
