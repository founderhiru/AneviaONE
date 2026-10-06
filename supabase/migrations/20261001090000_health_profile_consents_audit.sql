-- =============================================================================
-- Approved for Gate 1 (reviewed 2026-10-06) · Health data model 1/4
-- health_profiles · consents (append-only ledger) · audit_logs (append-only)
--
-- Depends on: supabase/migrations/2026092912* (Phase 1).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared helper: same-owner composite keys.
-- Parent tables expose UNIQUE (id, user_id); children reference
-- (parent_id, user_id). The database then guarantees a row can only point at
-- rows owned by the SAME user — even for server code.
-- -----------------------------------------------------------------------------
alter table public.documents add constraint documents_id_user_key unique (id, user_id);

-- -----------------------------------------------------------------------------
-- health_profiles — self-reported baseline (1:1 with the user).
-- Measured values (weight, BP, …) are observations, not profile fields.
-- -----------------------------------------------------------------------------
create type public.sex_at_birth as enum ('female', 'male', 'intersex', 'unknown');
create type public.blood_group  as enum ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown');

create table public.health_profiles (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  date_of_birth date check (date_of_birth is null or date_of_birth >= date '1900-01-01'),
  sex_at_birth  public.sex_at_birth,
  blood_group   public.blood_group,
  height_cm     numeric(5, 1) check (height_cm is null or height_cm between 30 and 272),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.health_profiles is 'Self-reported baseline details entered by the user. Not extracted from documents.';

create trigger health_profiles_set_updated_at
  before update on public.health_profiles
  for each row execute function private.set_updated_at();

alter table public.health_profiles enable row level security;

create policy "health_profiles_select_own" on public.health_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "health_profiles_insert_own" on public.health_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "health_profiles_update_own" on public.health_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.health_profiles from anon, authenticated;
grant select on public.health_profiles to authenticated;
grant insert (date_of_birth, sex_at_birth, blood_group, height_cm) on public.health_profiles to authenticated;
grant update (date_of_birth, sex_at_birth, blood_group, height_cm) on public.health_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- consents — append-only ledger. The current state of each consent is the
-- latest row per (user, consent_type); withdrawing = a new row with
-- granted = false. Nothing is ever edited or deleted by the app.
-- -----------------------------------------------------------------------------
create type public.consent_type as enum (
  'terms_of_service',
  'privacy_policy',
  'health_data_processing',   -- store & organise my health records
  'ai_processing',            -- let AI read my documents / answer questions
  'doctor_brief_sharing',     -- allow me to generate and share a Doctor Brief
  'research_deidentified'     -- de-identified research contribution (default off)
);

create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  consent_type   public.consent_type not null,
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  granted        boolean not null,
  source         text not null default 'app' check (source in ('app', 'support')),
  -- clock_timestamp(): strictly increasing even within one transaction, so
  -- "latest decision" is never ambiguous.
  recorded_at    timestamptz not null default clock_timestamp(),
  created_at     timestamptz not null default now()
);

create index consents_user_type_recorded_idx on public.consents (user_id, consent_type, recorded_at desc);

create or replace function private.consents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_app_request() then
    new.user_id     := auth.uid();
    new.source      := 'app';
    new.recorded_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger consents_before_insert
  before insert on public.consents
  for each row execute function private.consents_before_insert();

-- Latest decision per consent type (RLS of the caller applies).
create view public.current_consents
with (security_invoker = true) as
select distinct on (user_id, consent_type)
       user_id, consent_type, granted, policy_version, recorded_at
  from public.consents
 order by user_id, consent_type, recorded_at desc;

alter table public.consents enable row level security;

create policy "consents_select_own" on public.consents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "consents_insert_own" on public.consents for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;
grant insert (consent_type, policy_version, granted) on public.consents to authenticated;
revoke all on public.current_consents from anon, authenticated;
grant select on public.current_consents to authenticated;

-- -----------------------------------------------------------------------------
-- audit_logs — append-only record of sensitive actions on a user's data.
-- `details` must never contain health values (ids, counts, codes only).
-- Kept (with user_id nulled) after account deletion as an anonymous trail.
-- -----------------------------------------------------------------------------
create type public.audit_actor as enum ('user', 'service', 'system');

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users (id) on delete set null,
  actor        public.audit_actor not null,
  action       text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_table text check (entity_table is null or entity_table ~ '^[a-z_]+$'),
  entity_id    uuid,
  details      jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at   timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only audit trail. details holds ids/codes/counts only — never health values.';

create index audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_table, entity_id);

-- Only way rows are written: from triggers / server functions.
create or replace function private.write_audit(
  p_user_id uuid, p_action text, p_entity_table text, p_entity_id uuid, p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (user_id, actor, action, entity_table, entity_id, details)
  values (
    p_user_id,
    case coalesce(auth.role(), '')
      when 'authenticated' then 'user'::public.audit_actor
      when 'service_role'  then 'service'::public.audit_actor
      else 'system'::public.audit_actor
    end,
    p_action, p_entity_table, p_entity_id, coalesce(p_details, '{}'::jsonb)
  );
$$;

-- Append-only for everyone. The only permitted change is the automatic
-- user_id → NULL when an account is deleted.
create or replace function private.audit_logs_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.user_id is null
     and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id') then
    return new;
  end if;
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function private.audit_logs_append_only();

-- Consents are append-only too.
create or replace function private.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger consents_append_only
  before update or delete on public.consents
  for each row
  when (pg_trigger_depth() = 0)  -- allow the auth.users cascade on account deletion
  execute function private.reject_change();

alter table public.audit_logs enable row level security;

create policy "audit_logs_select_own" on public.audit_logs for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

-- Audit consent decisions and document lifecycle changes.
create or replace function private.audit_consents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.write_audit(new.user_id, 'consent.recorded', 'consents', new.id,
    jsonb_build_object('consent_type', new.consent_type, 'granted', new.granted, 'policy_version', new.policy_version));
  return null;
end;
$$;

create trigger consents_audit after insert on public.consents
  for each row execute function private.audit_consents();

revoke all on all functions in schema private from public, anon, authenticated;
