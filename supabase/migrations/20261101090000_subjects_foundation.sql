-- =============================================================================
-- Family foundation, phase A — subjects and delegated access.
--
-- WHY: every health row is owned by one auth user (`user_id`). Family health
-- needs three separate ideas: the ACCOUNT HOLDER, the SUBJECT (whose records
-- they are) and a GRANTEE (someone allowed to see or manage them). This
-- migration adds the model, and changes NO existing behaviour:
--
--   * every existing user gets one "self" subject (backfilled, and created for
--     every new user by trigger);
--   * every existing health row gets a `subject_id` pointing at its owner's
--     self subject (new rows are filled automatically);
--   * Row Level Security on the existing tables is UNCHANGED — they still key
--     on `user_id`. Phase B switches the policies to `public.can_access_subject`.
--
-- RULES (enforced by public.can_access_subject, tested in tests/subjects_foundation_test.sql):
--   * A subject's OWNER is the person whose own account it is (`linked_user_id`),
--     or, for a relative managed without their own account (a child, or an
--     adult who has no smartphone), the person who created it.
--   * Anyone else needs an ACTIVE grant: status 'active', not revoked, not expired.
--   * A caregiver never silently owns another adult's records: access to an
--     adult's own account is requested ('requested') and only becomes 'active'
--     when that adult approves. Grants are created and changed only by
--     server functions added in phase B — the app has read access, never write.
--   * Roles: owner = everything; manager = read + write; viewer = read.
-- =============================================================================

create type public.subject_role as enum ('manager', 'viewer');
create type public.subject_access_status as enum ('requested', 'active', 'revoked');

-- -----------------------------------------------------------------------------
-- subjects
-- -----------------------------------------------------------------------------
create table public.subjects (
  id               uuid primary key default gen_random_uuid(),
  -- Who created it. For a self subject this is the same person as linked_user_id.
  created_by       uuid not null references auth.users (id) on delete cascade,
  -- The subject's own account, when they have one. Set for self subjects only.
  linked_user_id   uuid unique references auth.users (id) on delete cascade,
  display_name     text not null check (char_length(display_name) between 1 and 120),
  relationship     text not null check (relationship in
                     ('self', 'mother', 'father', 'spouse', 'child', 'sibling', 'grandparent', 'other')),
  date_of_birth    date check (date_of_birth is null or (date_of_birth <= current_date and date_of_birth >= date '1900-01-01')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint subjects_self_has_account check ((relationship = 'self') = (linked_user_id is not null)),
  constraint subjects_self_is_creator check (linked_user_id is null or linked_user_id = created_by)
);

comment on table public.subjects is
  'Whose health records they are. One self subject per account, plus relatives managed by an account holder. Contains no health data.';

create index subjects_created_by_idx on public.subjects (created_by);

create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- subject_access
-- -----------------------------------------------------------------------------
create table public.subject_access (
  id               uuid primary key default gen_random_uuid(),
  subject_id       uuid not null references public.subjects (id) on delete cascade,
  grantee_user_id  uuid not null references auth.users (id) on delete cascade,
  role             public.subject_role not null,
  status           public.subject_access_status not null default 'requested',
  requested_at     timestamptz not null default now(),
  approved_at      timestamptz,
  expires_at       timestamptz,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint subject_access_active_is_approved check (status <> 'active' or approved_at is not null),
  constraint subject_access_revoked_is_marked check (status <> 'revoked' or revoked_at is not null)
);

-- One live relationship per person per subject.
create unique index subject_access_one_live_idx
  on public.subject_access (subject_id, grantee_user_id)
  where status <> 'revoked';
create index subject_access_grantee_idx on public.subject_access (grantee_user_id) where status = 'active';

create trigger subject_access_set_updated_at
  before update on public.subject_access
  for each row execute function private.set_updated_at();

-- A grantee cannot be the owner (that would be a pointless, confusing row).
create or replace function private.subject_access_no_self_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.subjects s
    where s.id = new.subject_id and coalesce(s.linked_user_id, s.created_by) = new.grantee_user_id
  ) then
    raise exception 'subject_access: the owner already has full access';
  end if;
  return new;
end;
$$;

create trigger subject_access_no_self_grant
  before insert or update of subject_id, grantee_user_id on public.subject_access
  for each row execute function private.subject_access_no_self_grant();

-- -----------------------------------------------------------------------------
-- The one access decision. Every policy in phase B calls this. It lives in
-- `public` (not `private`) because a policy runs as the calling role, which has
-- no access to the private schema. It only ever answers about the CALLER, so
-- exposing it as an RPC reveals nothing: it is false for anything not theirs.
-- p_need: 'read' | 'write' | 'manage'   (manage = change who has access, delete the subject)
-- Anonymous callers (no auth.uid()) are always refused.
-- -----------------------------------------------------------------------------
create or replace function public.can_access_subject(p_subject uuid, p_need text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null or p_need is null or p_need not in ('read', 'write', 'manage') then false
    else exists (
      select 1
      from public.subjects s
      where s.id = p_subject
        and (
          coalesce(s.linked_user_id, s.created_by) = auth.uid()
          or (
            p_need <> 'manage'
            and exists (
              select 1 from public.subject_access a
              where a.subject_id = s.id
                and a.grantee_user_id = auth.uid()
                and a.status = 'active'
                and a.revoked_at is null
                and (a.expires_at is null or a.expires_at > now())
                and (p_need = 'read' or a.role = 'manager')
            )
          )
        )
    )
  end;
$$;

revoke all on function public.can_access_subject(uuid, text) from public, anon;
grant execute on function public.can_access_subject(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security: the app can READ what it can access. It cannot write.
-- -----------------------------------------------------------------------------
alter table public.subjects enable row level security;
alter table public.subject_access enable row level security;

create policy "subjects_select_accessible"
  on public.subjects for select to authenticated
  using (public.can_access_subject(id, 'read'));

-- A grantee sees their own grants; the subject's owner sees everyone's.
create policy "subject_access_select_party"
  on public.subject_access for select to authenticated
  using (grantee_user_id = (select auth.uid()) or public.can_access_subject(subject_id, 'manage'));

revoke all on public.subjects, public.subject_access from anon;
revoke insert, update, delete, truncate on public.subjects, public.subject_access from authenticated;
grant select on public.subjects, public.subject_access to authenticated;

-- -----------------------------------------------------------------------------
-- Self subject: backfill existing accounts, create for every new one.
-- -----------------------------------------------------------------------------
create or replace function private.ensure_self_subject(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.subjects where linked_user_id = p_user;
  if v_id is not null then return v_id; end if;
  insert into public.subjects (created_by, linked_user_id, display_name, relationship)
  select p_user, p_user, coalesce(nullif(btrim(p.display_name), ''), 'Me'), 'self'
  from public.profiles p where p.id = p_user
  on conflict (linked_user_id) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.subjects where linked_user_id = p_user; end if;
  return v_id;
end;
$$;

revoke all on function private.ensure_self_subject(uuid) from public;
grant execute on function private.ensure_self_subject(uuid) to postgres, service_role;

create or replace function private.profiles_create_self_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_self_subject(new.id);
  return new;
end;
$$;

create trigger profiles_create_self_subject
  after insert on public.profiles
  for each row execute function private.profiles_create_self_subject();

select private.ensure_self_subject(id) from public.profiles;

-- -----------------------------------------------------------------------------
-- subject_id on the existing health tables (nullable in phase A; phase B makes it
-- required once every writer sets it). New rows are filled from the row's owner.
-- -----------------------------------------------------------------------------
create or replace function private.fill_subject_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_id is null and new.user_id is not null then
    select s.id into new.subject_id from public.subjects s where s.linked_user_id = new.user_id;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['documents', 'extraction_runs', 'observations', 'encounters', 'conditions', 'medications', 'procedures', 'allergies']
  loop
    execute format('alter table public.%I add column subject_id uuid references public.subjects (id)', t);
    execute format('create index %I on public.%I (subject_id)', t || '_subject_id_idx', t);
    -- The backfill is a one-off write to columns the tables' own triggers
    -- normally forbid changing; pause them for this statement only.
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I x set subject_id = s.id from public.subjects s where s.linked_user_id = x.user_id and x.subject_id is null', t);
    execute format('alter table public.%I enable trigger user', t);
    -- Named to sort after the tables' own BEFORE INSERT triggers, which set user_id.
    execute format('create trigger zz_fill_subject_id before insert on public.%I for each row execute function private.fill_subject_id()', t);
  end loop;
end;
$$;
