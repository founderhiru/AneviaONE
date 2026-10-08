-- =============================================================================
-- Phase D · identity profile: full name + date of birth
--
-- Reuses the existing owner-only tables — no new profile system:
--   • profiles.full_name (new): the person's full name exactly as they enter
--     it, for checking later that a health report belongs to them. Separate
--     from display_name, which is how the app greets them (it may be filled
--     automatically from Apple sign-in, or be a nickname).
--   • health_profiles.date_of_birth (existing DATE): now also never in the
--     future.
--
-- Backward compatible: both stay NULL until the person provides them. No
-- backfill, nothing inferred (never from the email address or a document).
-- No identity matching here — engine_account_identity only exposes the two
-- values to server code for a later phase.
-- Nothing here is written to audit_logs or logs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Full name
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column full_name text
    constraint profiles_full_name_valid check (
      full_name is null
      or (char_length(full_name) between 1 and 200
          and full_name = btrim(full_name)
          and full_name !~ '[[:cntrl:]]')
    );

comment on column public.profiles.full_name is
  'Full name as the person entered it (identity checks). Never derived from the email, sign-in provider or documents.';

grant update (full_name) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Date of birth: a real date, not in the future (the 1900 floor exists).
-- -----------------------------------------------------------------------------
create or replace function private.health_profiles_check_date_of_birth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date_of_birth is not null and new.date_of_birth > current_date then
    -- The value is never echoed back.
    raise exception 'health_profiles: date of birth cannot be in the future' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger health_profiles_check_date_of_birth
  before insert or update of date_of_birth on public.health_profiles
  for each row execute function private.health_profiles_check_date_of_birth();

-- -----------------------------------------------------------------------------
-- 3. The app saves both in one step, as the signed-in person (RLS applies:
--    SECURITY INVOKER, own rows only). NULL clears a value; a name that is
--    empty after trimming is refused rather than stored as nothing.
-- -----------------------------------------------------------------------------
create or replace function public.set_my_identity(p_full_name text, p_date_of_birth date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'identity: not signed in' using errcode = '42501';
  end if;
  -- Checked here first so a refusal never carries the value (a constraint
  -- violation's error detail would include the row); the constraints and
  -- trigger remain the backstop for any other write path.
  if p_full_name is not null and btrim(p_full_name) = '' then
    raise exception 'identity: full name is empty' using errcode = '22023';
  end if;
  if p_full_name is not null and (char_length(btrim(p_full_name)) > 200 or p_full_name ~ '[[:cntrl:]]') then
    raise exception 'identity: full name is not valid' using errcode = '22023';
  end if;
  if p_date_of_birth is not null and (p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01') then
    raise exception 'identity: date of birth is not valid' using errcode = '22023';
  end if;

  update public.profiles set full_name = btrim(p_full_name) where id = uid;
  if not found then
    raise exception 'identity: profile not found' using errcode = 'P0002';
  end if;

  insert into public.health_profiles (date_of_birth) values (p_date_of_birth)
  on conflict (user_id) do update set date_of_birth = excluded.date_of_birth;
end;
$$;

revoke all on function public.set_my_identity(text, date) from public, anon;
grant execute on function public.set_my_identity(text, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Server-side read for a later phase (identity checks). Service role only.
--    Returns the values as stored — no normalisation, no matching.
-- -----------------------------------------------------------------------------
create or replace function public.engine_account_identity(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role();
  return jsonb_build_object(
    'full_name', (select p.full_name from public.profiles p where p.id = p_user_id),
    'date_of_birth', (select h.date_of_birth from public.health_profiles h where h.user_id = p_user_id)
  );
end;
$$;

revoke all on function public.engine_account_identity(uuid) from public, anon, authenticated;
grant execute on function public.engine_account_identity(uuid) to service_role;

revoke all on all functions in schema private from public, anon, authenticated;
