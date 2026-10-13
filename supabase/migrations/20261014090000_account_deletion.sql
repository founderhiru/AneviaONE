-- =============================================================================
-- Account deletion — a person deletes their account and everything in it.
--
-- Done by the `delete-account` Edge Function (service role), in this order:
--
--   1. engine_begin_account_deletion (this file): marks the account as being
--      deleted, so no new report can be reserved, removes unfinished upload
--      reservations (an in-flight upload then fails the Storage insert policy,
--      which needs a `pending_upload` row), and freezes every report as
--      `deleting` (no reading can start). Refuses while a report is being read.
--   2. Storage: every object under `<user>/` in both buckets is removed through
--      the Storage API. storage.objects has NO foreign key to auth.users and
--      direct SQL deletes are blocked, so deleting the user alone would leave
--      every original behind.
--   3. auth.admin.deleteUser: removes the auth user; every user-owned table
--      cascades (on delete cascade), audit_logs keep their rows with user_id
--      set to null (an anonymous trail of ids, codes and counts only), and the
--      consents append-only trigger lets the cascade through.
--
-- Every step is safe to repeat: a failure leaves the account marked and its
-- reports `deleting`, and calling again resumes. Nothing is reported as
-- deleted until the auth user is gone.
--
-- No table DDL on existing tables, no data change at deploy time.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Accounts being deleted (server only; no app access at all)
-- -----------------------------------------------------------------------------
create table private.account_deletions (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table private.account_deletions enable row level security;
revoke all on private.account_deletions from public, anon, authenticated;

create or replace function private.account_deletion_started(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.account_deletions where user_id = p_user_id);
$$;

revoke all on function private.account_deletion_started(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. No new report once deletion has started
-- -----------------------------------------------------------------------------
create or replace function private.documents_refuse_during_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.account_deletion_started(new.user_id) then
    raise exception 'documents: this account is being deleted' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.documents_refuse_during_account_deletion() from public, anon, authenticated;

-- Runs after documents_before_insert (alphabetical), which sets user_id for app inserts.
create trigger documents_zz_refuse_during_account_deletion
  before insert on public.documents
  for each row execute function private.documents_refuse_during_account_deletion();

-- -----------------------------------------------------------------------------
-- 3. Begin (service role only; idempotent)
-- -----------------------------------------------------------------------------
create or replace function public.engine_begin_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  frozen integer;
  abandoned integer;
begin
  perform private.require_service_role();

  if not exists (select 1 from auth.users where id = p_user_id) then
    return jsonb_build_object('status', 'deleted');
  end if;

  -- One deletion (and no reader) at a time for this person's reports.
  perform 1 from public.documents where user_id = p_user_id for update;

  -- A report being read right now: try again shortly. Nothing is marked, so
  -- an account whose deletion was refused keeps working normally.
  if not private.account_deletion_started(p_user_id) and exists (
    select 1 from public.documents
     where user_id = p_user_id
       and status in ('processing', 'extracted', 'validated')
       and coalesce(processing_started_at, now()) > now() - interval '15 minutes'
  ) then
    return jsonb_build_object('status', 'busy');
  end if;

  insert into private.account_deletions (user_id) values (p_user_id) on conflict do nothing;

  -- Unfinished uploads: drop the reservation, so an upload still in flight is
  -- refused by Storage (its insert policy needs this pending row).
  delete from public.documents where user_id = p_user_id and status = 'pending_upload';
  get diagnostics abandoned = row_count;

  -- Stale readers (crashed runs) are closed, as engine_claim_document does.
  update public.extraction_runs
     set status = 'failed', error_code = 'abandoned', failure_kind = 'transient', completed_at = now()
   where user_id = p_user_id and status = 'running';

  -- Freeze every report that can be: no reading can start on `deleting`.
  update public.documents set status = 'deleting'
   where user_id = p_user_id and status in ('uploaded', 'completed', 'failed', 'processing');
  get diagnostics frozen = row_count;

  if frozen > 0 or abandoned > 0 or not exists (
    select 1 from public.audit_logs where user_id = p_user_id and action = 'account.deletion_started'
  ) then
    perform private.write_audit(p_user_id, 'account.deletion_started', null, null,
      jsonb_build_object('reports', frozen, 'unfinished_uploads', abandoned));
  end if;

  return jsonb_build_object('status', 'deleting');
end;
$$;

revoke all on function public.engine_begin_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.engine_begin_account_deletion(uuid) to service_role;
