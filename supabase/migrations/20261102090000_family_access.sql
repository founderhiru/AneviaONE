-- =============================================================================
-- Family foundation, phase B1 — sharing records between accounts, server side.
--
-- Builds on 20261101090000_subjects_foundation.sql. Adds:
--   1. subject_id on document_pages and fact_sources (backfilled, auto-filled);
--   2. ADDITIONAL read policies: a granted person can READ a subject's records.
--      Existing owner policies are untouched; writes stay owner-only. The app
--      cannot WRITE another subject's records in this phase.
--   3. Server functions (the only way to create or change a subject or a grant):
--        create_relative       a relative managed without their own account
--        create_access_invite  an owner makes a one-time code (hashed at rest)
--        redeem_access_invite  someone enters a code → a REQUESTED grant
--        approve_access        the owner approves → ACTIVE
--        revoke_access         the owner, or the grantee, ends it
--        list_subject_access   the owner sees who has (or asked for) access
--
-- SAFETY NOTE: once a grant is active, the person can read the subject's rows
-- through the Data API. The mobile app must scope every read to the person
-- being viewed BEFORE grants are used (phase B2). Until then no grant exists:
-- creating one needs a code made by an owner and approved by that owner.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. subject_id on the remaining per-person tables
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['document_pages', 'fact_sources']
  loop
    execute format('alter table public.%I add column subject_id uuid references public.subjects (id)', t);
    execute format('create index %I on public.%I (subject_id)', t || '_subject_id_idx', t);
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I x set subject_id = s.id from public.subjects s where s.linked_user_id = x.user_id and x.subject_id is null', t);
    execute format('alter table public.%I enable trigger user', t);
    execute format('create trigger zz_fill_subject_id before insert on public.%I for each row execute function private.fill_subject_id()', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Read access for granted people (policies are OR-ed with the owner ones)
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['documents', 'document_pages', 'extraction_runs', 'fact_sources',
                           'observations', 'encounters', 'conditions', 'medications', 'procedures', 'allergies']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_subject(subject_id, %L))',
      t || '_select_granted', t, 'read');
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Invites: one-time codes, stored only as a hash. Never readable by the app.
-- -----------------------------------------------------------------------------
create table private.access_invites (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  role        public.subject_role not null,
  code_hash   bytea not null unique,
  created_by  uuid not null references auth.users (id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index access_invites_subject_idx on private.access_invites (subject_id) where used_at is null;
alter table private.access_invites enable row level security;
revoke all on private.access_invites from public, anon, authenticated;

create or replace function private.invite_hash(p_code text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Fa-f]', '', 'g')), 'UTF8'));
$$;

-- -----------------------------------------------------------------------------
-- 3a. A relative managed without their own account
-- -----------------------------------------------------------------------------
create or replace function public.create_relative(
  p_name text, p_relationship text, p_date_of_birth date, p_authority_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if private.account_deletion_started(v_me) then raise exception 'this account is being deleted' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 120 then raise exception 'name must be 1 to 120 characters' using errcode = '22023'; end if;
  if p_relationship is null or p_relationship not in ('mother', 'father', 'spouse', 'child', 'sibling', 'grandparent', 'other') then
    raise exception 'unsupported relationship' using errcode = '22023';
  end if;
  if p_date_of_birth is not null and (p_date_of_birth > current_date or p_date_of_birth < date '1900-01-01') then
    raise exception 'date of birth is not valid' using errcode = '22023';
  end if;
  -- Managing a relative without their own account is a declaration of authority
  -- (a parent for a child, or a caregiver for an adult who has no smartphone).
  if p_authority_confirmed is distinct from true then
    raise exception 'authority to manage this person must be confirmed' using errcode = '22023';
  end if;
  if (select count(*) from public.subjects where created_by = v_me and relationship <> 'self') >= 20 then
    raise exception 'too many relatives' using errcode = '54000';
  end if;

  insert into public.subjects (created_by, display_name, relationship, date_of_birth)
  values (v_me, v_name, p_relationship, p_date_of_birth)
  returning id into v_id;

  perform private.write_audit(v_me, 'subject.created', 'subjects', v_id, jsonb_build_object('relationship', p_relationship, 'authority_confirmed', true));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3b. Invite code (the owner shares it out of band, e.g. on WhatsApp)
-- -----------------------------------------------------------------------------
create or replace function public.create_access_invite(p_subject uuid, p_role public.subject_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_raw text;
  v_code text;
begin
  if v_me is null or not public.can_access_subject(p_subject, 'manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if private.account_deletion_started(v_me) then raise exception 'this account is being deleted' using errcode = '42501'; end if;
  if (select count(*) from private.access_invites where subject_id = p_subject and used_at is null and expires_at > now()) >= 5 then
    raise exception 'too many open invites' using errcode = '54000';
  end if;

  v_raw := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4);

  insert into private.access_invites (subject_id, role, code_hash, created_by, expires_at)
  values (p_subject, p_role, private.invite_hash(v_code), v_me, now() + interval '7 days');

  perform private.write_audit(v_me, 'access.invite_created', 'subjects', p_subject, jsonb_build_object('role', p_role));
  return v_code;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3c. Redeem: creates a REQUESTED grant; the owner still has to approve.
-- Returns the grant id, or NULL for a code that does not work (kept as a return
-- value, not an exception, so the failed attempt is recorded and counted).
-- -----------------------------------------------------------------------------
create or replace function public.redeem_access_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_inv private.access_invites%rowtype;
  v_grant uuid;
begin
  if v_me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if private.account_deletion_started(v_me) then raise exception 'this account is being deleted' using errcode = '42501'; end if;

  if (select count(*) from public.audit_logs
       where user_id = v_me and action = 'access.invite_failed' and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many attempts, try again later' using errcode = '54000';
  end if;

  select * into v_inv from private.access_invites
   where code_hash = private.invite_hash(p_code) and used_at is null and expires_at > now()
   for update;

  if not found or coalesce(
       (select coalesce(s.linked_user_id, s.created_by) = v_me from public.subjects s where s.id = v_inv.subject_id), true) then
    perform private.write_audit(v_me, 'access.invite_failed', null, null, '{}'::jsonb);
    return null;
  end if;

  select id into v_grant from public.subject_access
   where subject_id = v_inv.subject_id and grantee_user_id = v_me and status <> 'revoked';
  if v_grant is null then
    insert into public.subject_access (subject_id, grantee_user_id, role, status)
    values (v_inv.subject_id, v_me, v_inv.role, 'requested')
    returning id into v_grant;
  end if;

  update private.access_invites set used_at = now(), used_by = v_me where id = v_inv.id;
  perform private.write_audit(v_me, 'access.requested', 'subject_access', v_grant, jsonb_build_object('role', v_inv.role));
  return v_grant;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3d. Approve / revoke / list
-- -----------------------------------------------------------------------------
create or replace function public.approve_access(p_grant uuid, p_expires_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.subject_access%rowtype;
begin
  select * into v_row from public.subject_access where id = p_grant for update;
  if v_me is null or not found or not public.can_access_subject(v_row.subject_id, 'manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_row.status <> 'requested' then raise exception 'this request is not waiting for approval' using errcode = '22023'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'expiry must be in the future' using errcode = '22023'; end if;

  update public.subject_access set status = 'active', approved_at = now(), expires_at = p_expires_at where id = p_grant;
  perform private.write_audit(v_me, 'access.approved', 'subject_access', p_grant, jsonb_build_object('role', v_row.role));
end;
$$;

create or replace function public.revoke_access(p_grant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.subject_access%rowtype;
begin
  select * into v_row from public.subject_access where id = p_grant for update;
  if v_me is null or not found
     or not (v_row.grantee_user_id = v_me or public.can_access_subject(v_row.subject_id, 'manage')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_row.status = 'revoked' then return; end if;

  update public.subject_access set status = 'revoked', revoked_at = now() where id = p_grant;
  perform private.write_audit(v_me, 'access.revoked', 'subject_access', p_grant, jsonb_build_object('by_owner', v_row.grantee_user_id <> v_me));
end;
$$;

create or replace function public.list_subject_access(p_subject uuid)
returns table (grant_id uuid, grantee_name text, role public.subject_role, status public.subject_access_status,
               requested_at timestamptz, approved_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, coalesce(nullif(btrim(p.display_name), ''), 'Someone'), a.role, a.status, a.requested_at, a.approved_at, a.expires_at
  from public.subject_access a
  left join public.profiles p on p.id = a.grantee_user_id
  where a.subject_id = p_subject
    and a.status <> 'revoked'
    and public.can_access_subject(p_subject, 'manage')
  order by a.requested_at;
$$;

-- -----------------------------------------------------------------------------
-- Grants: callable by signed-in people only. Every function refuses anonymous
-- callers and works only on what the caller owns or was granted.
-- -----------------------------------------------------------------------------
revoke all on function
  public.create_relative(text, text, date, boolean),
  public.create_access_invite(uuid, public.subject_role),
  public.redeem_access_invite(text),
  public.approve_access(uuid, timestamptz),
  public.revoke_access(uuid),
  public.list_subject_access(uuid)
from public, anon;
grant execute on function
  public.create_relative(text, text, date, boolean),
  public.create_access_invite(uuid, public.subject_role),
  public.redeem_access_invite(text),
  public.approve_access(uuid, timestamptz),
  public.revoke_access(uuid),
  public.list_subject_access(uuid)
to authenticated, service_role;
