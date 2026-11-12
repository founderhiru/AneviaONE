-- =============================================================================
-- Custody and account lifecycle (data-ownership spec, Phase 2).  NOT APPLIED to any database.
--
-- A person's records must remain theirs, even when the family member who created or
-- manages them leaves AneviaONE. Today a relative is deleted when its creator deletes their
-- account (subjects.created_by cascades). This migration makes that impossible by accident:
--
--   * subjects.custodian_user_id: who answers for a relative who has no account.
--     NULL for a person's own record; ON DELETE RESTRICT, so an account that is still
--     someone's custodian cannot be deleted by the database.
--   * subjects.created_by stays as a historical fact and now SETs NULL (never cascades).
--   * Controller = coalesce(linked_user_id, custodian_user_id) everywhere it was
--     coalesce(linked_user_id, created_by).
--   * subjects.legal_hold: set by the service role only; blocks every deletion path.
--   * Account deletion is a plan, never a silent cascade: for each person the account
--     is custodian of there must be a recorded, typed-name delete confirmation
--     (confirm_subject_deletion). Custody TRANSFER is deliberately NOT built here: it is
--     unsafe while health reports are keyed to the uploader's folder (spec Stream C).
--   * account_notices: short in-app notices ("your access ended because an account was deleted").
--   * Expired grants are tidied and audited by expire_access_grants() (no default expiry).
--
-- Additive: new columns/tables/functions; existing functions are replaced in place with
-- the same signatures and behaviour except for who counts as controller.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema
-- -----------------------------------------------------------------------------
alter table public.subjects add column custodian_user_id uuid references auth.users (id) on delete restrict;
alter table public.subjects add column legal_hold boolean not null default false;

update public.subjects set custodian_user_id = created_by where relationship <> 'self';

alter table public.subjects
  add constraint subjects_custodian_iff_relative check ((relationship = 'self') = (custodian_user_id is null));

alter table public.subjects drop constraint subjects_created_by_fkey;
alter table public.subjects alter column created_by drop not null;
alter table public.subjects
  add constraint subjects_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

-- A relative is never created without a custodian: if the writer did not name one, it is the creator.
create or replace function private.subjects_default_custodian()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.relationship <> 'self' and new.custodian_user_id is null then
    new.custodian_user_id := new.created_by;
  end if;
  return new;
end;
$$;

create trigger subjects_default_custodian
  before insert on public.subjects
  for each row execute function private.subjects_default_custodian();

create index subjects_custodian_idx on public.subjects (custodian_user_id) where custodian_user_id is not null;

comment on column public.subjects.custodian_user_id is
  'Who answers for a relative without an account. NULL for a person''s own record. Never cascades: an account that is still custodian cannot be deleted.';
comment on column public.subjects.legal_hold is
  'Service role only. While true, neither this person nor an account that is their custodian can be deleted.';

-- -----------------------------------------------------------------------------
-- 2. Controller = the person themself, else their custodian
-- -----------------------------------------------------------------------------
create or replace function private.subject_controller(p_subject uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(s.linked_user_id, s.custodian_user_id) from public.subjects s where s.id = p_subject
$$;

create or replace function private.vault_actor_role(p_subject uuid, p_actor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.linked_user_id = p_actor then 'self'
    when coalesce(s.linked_user_id, s.custodian_user_id) = p_actor then 'custodian'
    else 'manager'
  end
  from public.subjects s where s.id = p_subject
$$;

create or replace function private.subject_access_no_self_grant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.subjects s
    where s.id = new.subject_id and coalesce(s.linked_user_id, s.custodian_user_id) = new.grantee_user_id
  ) then
    raise exception 'subject_access: the owner already has full access';
  end if;
  return new;
end;
$$;

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
          coalesce(s.linked_user_id, s.custodian_user_id) = auth.uid()
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
       (select coalesce(s.linked_user_id, s.custodian_user_id) = v_me from public.subjects s where s.id = v_inv.subject_id), true) then
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
  if (select count(*) from public.subjects where custodian_user_id = v_me and relationship <> 'self') >= 20 then
    raise exception 'too many relatives' using errcode = '54000';
  end if;

  insert into public.subjects (created_by, custodian_user_id, display_name, relationship, date_of_birth)
  values (v_me, v_me, v_name, p_relationship, p_date_of_birth)
  returning id into v_id;

  perform private.write_audit(v_me, 'subject.created', 'subjects', v_id, jsonb_build_object('relationship', p_relationship, 'authority_confirmed', true));
  return v_id;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. In-app notices (no health content; a short code and the person's name)
-- -----------------------------------------------------------------------------
create table public.account_notices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  code         text not null check (code in ('access_ended_account_deleted', 'access_ended_person_removed')),
  subject_name text check (subject_name is null or char_length(subject_name) <= 120),
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index account_notices_user_idx on public.account_notices (user_id, created_at desc);

alter table public.account_notices enable row level security;
create policy "account_notices_select_own" on public.account_notices for select to authenticated using (user_id = (select auth.uid()));
create policy "account_notices_mark_read_own" on public.account_notices for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.account_notices from public, anon, authenticated;
grant select on public.account_notices to authenticated;
grant update (read_at) on public.account_notices to authenticated;
grant all on public.account_notices to service_role;

-- -----------------------------------------------------------------------------
-- 4. Recorded decision to delete a person (typed name), server-side only
-- -----------------------------------------------------------------------------
create table private.subject_deletion_confirmations (
  subject_id   uuid primary key references public.subjects (id) on delete cascade,
  confirmed_by uuid not null references auth.users (id) on delete cascade,
  confirmed_at timestamptz not null default now()
);
alter table private.subject_deletion_confirmations enable row level security;
revoke all on private.subject_deletion_confirmations from public, anon, authenticated;

create or replace function public.confirm_subject_deletion(p_subject uuid, p_typed_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_s public.subjects%rowtype;
begin
  if v_me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into v_s from public.subjects where id = p_subject;
  if not found or v_s.relationship = 'self' or v_s.custodian_user_id is distinct from v_me then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_s.legal_hold then raise exception 'this record is on hold and cannot be deleted' using errcode = '55000'; end if;
  if lower(btrim(coalesce(p_typed_name, ''))) <> lower(btrim(v_s.display_name)) then
    raise exception 'the name does not match' using errcode = '22023';
  end if;
  insert into private.subject_deletion_confirmations (subject_id, confirmed_by) values (p_subject, v_me)
  on conflict (subject_id) do update set confirmed_by = excluded.confirmed_by, confirmed_at = now();
  perform private.write_audit(v_me, 'subject.deletion_confirmed', 'subjects', p_subject, jsonb_build_object('relationship', v_s.relationship));
end;
$$;

-- Changing your mind: the decision is withdrawn; nothing was deleted.
create or replace function public.cancel_subject_deletion(p_subject uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.subjects where id = p_subject and custodian_user_id = auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from private.subject_deletion_confirmations where subject_id = p_subject;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. The deletion plan: what an account is custodian of and what is still undecided.
--    The app reads its OWN plan; the delete-account function reads it for the caller.
-- -----------------------------------------------------------------------------
create or replace function private.deletion_plan(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select s.* from public.subjects s where s.custodian_user_id = p_user and s.relationship <> 'self'
  ), per as (
    select jsonb_build_object(
      'subject_id', m.id,
      'name', m.display_name,
      'relationship', m.relationship,
      'vault_files', (select count(*) from public.vault_files f where f.subject_id = m.id and f.status = 'stored'),
      'health_reports', (select count(*) from public.documents d where d.subject_id = m.id),
      'other_people_with_access', (select count(*) from public.subject_access a where a.subject_id = m.id and a.status = 'active'),
      'legal_hold', m.legal_hold,
      'delete_confirmed', exists (select 1 from private.subject_deletion_confirmations c where c.subject_id = m.id),
      -- Custody transfer is not available yet (spec Phase 6): the only choices are delete or keep the account.
      'can_transfer', false
    ) as j, m.legal_hold as hold,
    exists (select 1 from private.subject_deletion_confirmations c where c.subject_id = m.id) as confirmed
    from mine m
  )
  select jsonb_build_object(
    -- The person's own record: its vault folder is theirs to erase with the account.
    'self_subject_id', (select s.id from public.subjects s where s.linked_user_id = p_user),
    'subjects', coalesce((select jsonb_agg(j order by j ->> 'name') from per), '[]'::jsonb),
    'unresolved', (select count(*) from per where not confirmed),
    'blocked_by_legal_hold', coalesce((select bool_or(hold) from per), false)
       or exists (select 1 from public.subjects s where s.linked_user_id = p_user and s.legal_hold)
  )
$$;

create or replace function public.my_account_deletion_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  return private.deletion_plan(auth.uid());
end;
$$;

create or replace function public.engine_account_deletion_plan(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role();
  return private.deletion_plan(p_user_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Finish the custody part of an account deletion (service role, after the storage
--    for those people has been emptied). Everything the account is custodian of must
--    have a recorded decision; otherwise nothing is deleted. Safe to repeat.
-- -----------------------------------------------------------------------------
create or replace function public.engine_finish_account_custody(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  v_subject record;
  v_grant record;
  v_removed int := 0;
  v_notices int := 0;
begin
  perform private.require_service_role();
  v_plan := private.deletion_plan(p_user_id);
  if (v_plan ->> 'blocked_by_legal_hold')::boolean then
    return jsonb_build_object('status', 'legal_hold');
  end if;
  if (v_plan ->> 'unresolved')::int > 0 then
    return jsonb_build_object('status', 'custody_unresolved');
  end if;

  -- 1. People this account is custodian of (each with a recorded delete decision).
  for v_subject in
    select s.id, s.display_name from public.subjects s
     where s.custodian_user_id = p_user_id and s.relationship <> 'self'
  loop
    for v_grant in
      select a.id, a.grantee_user_id, a.role from public.subject_access a
       where a.subject_id = v_subject.id and a.status = 'active' and a.grantee_user_id <> p_user_id
    loop
      insert into public.account_notices (user_id, code, subject_name) values (v_grant.grantee_user_id, 'access_ended_account_deleted', v_subject.display_name);
      perform private.write_audit(v_grant.grantee_user_id, 'access.removed_by_account_deletion', 'subject_access', v_grant.id, jsonb_build_object('role', v_grant.role));
      v_notices := v_notices + 1;
    end loop;
    -- Their health reports are removed with the records (their files were removed first).
    delete from public.documents where subject_id = v_subject.id;
    delete from public.subjects where id = v_subject.id;
    perform private.write_audit(p_user_id, 'subject.deleted', 'subjects', v_subject.id, jsonb_build_object('by', 'account_deletion'));
    v_removed := v_removed + 1;
  end loop;

  -- 2. Access other people had to this person's own record.
  for v_grant in
    select a.id, a.grantee_user_id, a.role, s.display_name
      from public.subject_access a join public.subjects s on s.id = a.subject_id
     where s.linked_user_id = p_user_id and a.status = 'active' and a.grantee_user_id <> p_user_id
  loop
    insert into public.account_notices (user_id, code, subject_name) values (v_grant.grantee_user_id, 'access_ended_account_deleted', v_grant.display_name);
    perform private.write_audit(v_grant.grantee_user_id, 'access.removed_by_account_deletion', 'subject_access', v_grant.id, jsonb_build_object('role', v_grant.role));
    v_notices := v_notices + 1;
  end loop;

  -- 3. Access this account held on other people goes with the account (their records stay).
  for v_grant in
    select a.id, a.role, s.id as subject_id from public.subject_access a join public.subjects s on s.id = a.subject_id
     where a.grantee_user_id = p_user_id and a.status = 'active'
  loop
    perform private.write_audit(private.subject_controller(v_grant.subject_id), 'access.removed_by_account_deletion', 'subject_access', v_grant.id, jsonb_build_object('role', v_grant.role));
  end loop;

  return jsonb_build_object('status', 'ok', 'people_removed', v_removed, 'notices', v_notices);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Removing a relative while keeping your own account (service role: the Edge Function
--    empties the person's files in storage first, then calls finish).
-- -----------------------------------------------------------------------------
create or replace function public.engine_begin_subject_removal(p_subject uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.subjects%rowtype;
begin
  perform private.require_service_role();
  select * into v_s from public.subjects where id = p_subject;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_s.relationship = 'self' or v_s.custodian_user_id is distinct from p_user_id then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_s.legal_hold then return jsonb_build_object('status', 'legal_hold'); end if;
  if not exists (select 1 from private.subject_deletion_confirmations where subject_id = p_subject) then
    return jsonb_build_object('status', 'not_confirmed');
  end if;
  -- Health reports are removed one by one first (their originals live in the health bucket).
  if exists (select 1 from public.documents where subject_id = p_subject) then
    return jsonb_build_object('status', 'has_health_reports');
  end if;
  return jsonb_build_object('status', 'ok', 'name', v_s.display_name);
end;
$$;

create or replace function public.engine_finish_subject_removal(p_subject uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.subjects%rowtype;
  v_grant record;
begin
  perform private.require_service_role();
  select * into v_s from public.subjects where id = p_subject;
  if not found then return jsonb_build_object('status', 'removed'); end if;
  if v_s.relationship = 'self' or v_s.custodian_user_id is distinct from p_user_id or v_s.legal_hold
     or not exists (select 1 from private.subject_deletion_confirmations where subject_id = p_subject)
     or exists (select 1 from public.documents where subject_id = p_subject) then
    raise exception 'subject removal is not permitted' using errcode = '42501';
  end if;
  for v_grant in select a.id, a.grantee_user_id, a.role from public.subject_access a where a.subject_id = p_subject and a.status = 'active' loop
    insert into public.account_notices (user_id, code, subject_name) values (v_grant.grantee_user_id, 'access_ended_person_removed', v_s.display_name);
    perform private.write_audit(v_grant.grantee_user_id, 'access.removed_by_person_removal', 'subject_access', v_grant.id, jsonb_build_object('role', v_grant.role));
  end loop;
  delete from public.subjects where id = p_subject;
  perform private.write_audit(p_user_id, 'subject.removed', 'subjects', p_subject, jsonb_build_object('relationship', v_s.relationship));
  return jsonb_build_object('status', 'removed');
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Expired grants: tidy and audit. No default expiry is ever imposed (expires_at stays optional).
-- -----------------------------------------------------------------------------
create or replace function public.expire_access_grants()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_n integer := 0;
begin
  perform private.require_service_role();
  for v_row in
    select a.id, a.role, a.subject_id from public.subject_access a
     where a.status = 'active' and a.expires_at is not null and a.expires_at <= now()
       for update
  loop
    update public.subject_access set status = 'revoked', revoked_at = now() where id = v_row.id;
    perform private.write_audit(private.subject_controller(v_row.subject_id), 'access.expired', 'subject_access', v_row.id, jsonb_build_object('role', v_row.role));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Grants
-- -----------------------------------------------------------------------------
revoke all on function public.confirm_subject_deletion(uuid, text) from public, anon;
revoke all on function public.cancel_subject_deletion(uuid) from public, anon;
revoke all on function public.my_account_deletion_plan() from public, anon;
grant execute on function public.confirm_subject_deletion(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_subject_deletion(uuid) to authenticated, service_role;
grant execute on function public.my_account_deletion_plan() to authenticated, service_role;

revoke all on function public.engine_account_deletion_plan(uuid) from public, anon, authenticated;
revoke all on function public.engine_finish_account_custody(uuid) from public, anon, authenticated;
revoke all on function public.engine_begin_subject_removal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.engine_finish_subject_removal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.expire_access_grants() from public, anon, authenticated;
grant execute on function public.engine_account_deletion_plan(uuid) to service_role;
grant execute on function public.engine_finish_account_custody(uuid) to service_role;
grant execute on function public.engine_begin_subject_removal(uuid, uuid) to service_role;
grant execute on function public.engine_finish_subject_removal(uuid, uuid) to service_role;
grant execute on function public.expire_access_grants() to service_role;

revoke all on all functions in schema private from public, anon, authenticated;
