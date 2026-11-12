-- =============================================================================
-- Custody and account lifecycle (Phase 2): custodian, restrict, deletion plan, typed-name decision, Synthetic users only; ROLLED BACK.
-- person removal, notices and grant expiry. Success ends with "ALL CUSTODY CHECKS PASSED".
-- =============================================================================
begin;

create function pg_temp.act_as(p_user uuid, p_role text default 'authenticated') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end $$;

create function pg_temp.as_admin() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.expect_blocked(label text, stmt text) returns void
language plpgsql as $$
declare affected bigint;
begin
  begin
    execute stmt;
    get diagnostics affected = row_count;
  exception when others then
    raise notice 'PASS  %  (refused: %)', label, sqlerrm;
    return;
  end;
  if affected = 0 then raise notice 'PASS  %  (no rows affected)', label; return; end if;
  raise exception 'FAIL  %  — was allowed and affected % row(s)', label, affected;
end $$;

create function pg_temp.expect_true(label text, condition boolean) returns void
language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAIL  %', label; end if;
  raise notice 'PASS  %', label;
end $$;

do $$
declare tmp text := pg_my_temp_schema()::regnamespace::text;
begin
  execute format('grant usage on schema %I to anon, authenticated, service_role', tmp);
  execute format('grant execute on all functions in schema %I to anon, authenticated, service_role', tmp);
end $$;

do $$
declare
  a uuid := gen_random_uuid();  -- custodian of Dad and Child
  b uuid := gen_random_uuid();  -- manager of Dad
  c uuid := gen_random_uuid();  -- viewer of Dad
  d uuid := gen_random_uuid();  -- stranger
  self_a uuid; self_b uuid; dad uuid; kid uuid; g_b uuid; g_c uuid; g_exp uuid; vf uuid; doc uuid; r jsonb; n int;
begin
  insert into auth.users (id, email) values
    (a, 'cu-a@example.invalid'), (b, 'cu-b@example.invalid'), (c, 'cu-c@example.invalid'), (d, 'cu-d@example.invalid');
  select id into self_a from public.subjects where linked_user_id = a;
  select id into self_b from public.subjects where linked_user_id = b;

  -- ---- schema facts ------------------------------------------------------------------------
  perform pg_temp.expect_true('a person''s own record has no custodian',
    (select custodian_user_id is null and created_by = a and not legal_hold from public.subjects where id = self_a));
  perform pg_temp.act_as(a);
  dad := public.create_relative('Ravi Kumar', 'father', date '1955-02-03', true);
  kid := public.create_relative('Child A', 'child', date '2018-05-01', true);
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('a relative''s custodian is the creator', (select custodian_user_id = a and created_by = a from public.subjects where id = dad));
  perform pg_temp.expect_blocked('a relative cannot exist without a custodian',
    $s$update public.subjects set custodian_user_id = null where relationship = 'father'$s$);
  perform pg_temp.expect_blocked('a person''s own record cannot name a custodian',
    format($s$update public.subjects set custodian_user_id = %L where id = %L$s$, b, self_a));
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('the app cannot change custody or the hold', format($s$update public.subjects set custodian_user_id = %L, legal_hold = true where id = %L$s$, b, dad));

  -- ---- control follows the custodian, not the creator -------------------------------------
  perform pg_temp.as_admin();
  insert into public.subject_access (subject_id, grantee_user_id, role, status, approved_at) values
    (dad, b, 'manager', 'active', now()), (dad, c, 'viewer', 'active', now());
  update public.subjects set created_by = null where id = dad;   -- the creator is no longer recorded
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('the custodian controls the relative even with no creator on record', public.can_access_subject(dad, 'manage'));
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('a manager still cannot manage', not public.can_access_subject(dad, 'manage') and public.can_access_subject(dad, 'write'));
  perform pg_temp.act_as(d);
  perform pg_temp.expect_true('a stranger has nothing', not public.can_access_subject(dad, 'read'));
  perform pg_temp.as_admin();
  update public.subjects set created_by = a where id = dad;

  -- ---- restrict: an account that is still custodian cannot be deleted ----------------------
  perform pg_temp.expect_blocked('deleting a custodian''s account is refused while they are custodian', format($s$delete from auth.users where id = %L$s$, a));
  perform pg_temp.expect_true('and nothing was lost', exists (select 1 from public.subjects where id = dad) and exists (select 1 from auth.users where id = a));

  -- ---- typed-name decision -----------------------------------------------------------------
  perform pg_temp.act_as(b);
  perform pg_temp.expect_blocked('a manager cannot record a delete decision', format($s$select public.confirm_subject_deletion(%L, 'Ravi Kumar')$s$, dad));
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('a wrong name is refused', format($s$select public.confirm_subject_deletion(%L, 'Ravi')$s$, dad));
  perform pg_temp.expect_blocked('your own record has no such decision', format($s$select public.confirm_subject_deletion(%L, 'Me')$s$, self_a));
  perform pg_temp.expect_blocked('the app cannot read the decisions table', 'select * from private.subject_deletion_confirmations');

  -- ---- the plan ----------------------------------------------------------------------------
  perform pg_temp.as_admin();
  insert into public.vault_files (subject_id, uploaded_by, category, title, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (dad, b, 'insurance', 'Policy', 'p.pdf', 'application/pdf', 10, 'stored', now()) returning id into vf;
  insert into public.documents (user_id, subject_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, dad, 'r.pdf', 'application/pdf', 10, 'uploaded', now()) returning id into doc;
  perform pg_temp.act_as(a);
  r := public.my_account_deletion_plan();
  perform pg_temp.expect_true('the plan lists both people, nothing decided, transfer unavailable',
    jsonb_array_length(r -> 'subjects') = 2 and (r ->> 'unresolved')::int = 2 and not (r ->> 'blocked_by_legal_hold')::boolean
    and not exists (select 1 from jsonb_array_elements(r -> 'subjects') e where (e ->> 'can_transfer')::boolean));
  perform pg_temp.expect_true('the plan counts files, reports and other people with access, without any content',
    exists (select 1 from jsonb_array_elements(r -> 'subjects') e where e ->> 'name' = 'Ravi Kumar'
            and (e ->> 'vault_files')::int = 1 and (e ->> 'health_reports')::int = 1 and (e ->> 'other_people_with_access')::int = 2));
  perform pg_temp.expect_true('the plan names the person''s own record, for erasing its folder', (r ->> 'self_subject_id')::uuid = self_a);
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('a manager''s own plan is empty', jsonb_array_length(public.my_account_deletion_plan() -> 'subjects') = 0);
  perform pg_temp.expect_blocked('the engine plan is for the server only', format($s$select public.engine_account_deletion_plan(%L)$s$, a));

  -- ---- deletion is blocked until every person is decided ----------------------------------
  perform pg_temp.as_admin();
  perform pg_temp.act_as('00000000-0000-0000-0000-000000000000', 'service_role');
  r := public.engine_finish_account_custody(a);
  perform pg_temp.expect_true('account deletion is refused while a person is undecided', r ->> 'status' = 'custody_unresolved');
  perform pg_temp.expect_true('and nothing was deleted', exists (select 1 from public.subjects where id in (dad, kid)));

  perform pg_temp.act_as(a);
  perform public.confirm_subject_deletion(dad, '  ravi kumar ');
  perform public.confirm_subject_deletion(kid, 'Child A');
  perform pg_temp.expect_true('a typed name (any case, trimmed) records the decision', (public.my_account_deletion_plan() ->> 'unresolved')::int = 0);
  perform public.cancel_subject_deletion(kid);
  perform pg_temp.expect_true('a decision can be withdrawn', (public.my_account_deletion_plan() ->> 'unresolved')::int = 1);
  perform public.confirm_subject_deletion(kid, 'Child A');

  -- ---- legal hold --------------------------------------------------------------------------
  perform pg_temp.as_admin();
  update public.subjects set legal_hold = true where id = kid;
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('a held person cannot be confirmed for deletion', format($s$select public.confirm_subject_deletion(%L, 'Child A')$s$, kid));
  perform pg_temp.expect_true('the plan says so', (public.my_account_deletion_plan() ->> 'blocked_by_legal_hold')::boolean);
  perform pg_temp.act_as('00000000-0000-0000-0000-000000000000', 'service_role');
  perform pg_temp.expect_true('account deletion is refused under legal hold', public.engine_finish_account_custody(a) ->> 'status' = 'legal_hold');
  perform pg_temp.as_admin();
  update public.subjects set legal_hold = false where id = kid;

  -- ---- remove one person, keep the account -------------------------------------------------
  perform pg_temp.act_as('00000000-0000-0000-0000-000000000000', 'service_role');
  perform pg_temp.expect_true('removal: a stranger''s request finds nothing', public.engine_begin_subject_removal(dad, d) ->> 'status' = 'not_found');
  perform pg_temp.expect_true('removal: a person''s health reports are removed first', public.engine_begin_subject_removal(dad, a) ->> 'status' = 'has_health_reports');
  perform pg_temp.expect_true('removal: a decided person with no reports can be removed', public.engine_begin_subject_removal(kid, a) ->> 'status' = 'ok');
  perform pg_temp.as_admin();
  update public.subjects set legal_hold = true where id = kid;
  perform pg_temp.act_as('00000000-0000-0000-0000-000000000000', 'service_role');
  perform pg_temp.expect_true('removal: refused under legal hold', public.engine_begin_subject_removal(kid, a) ->> 'status' = 'legal_hold');
  perform pg_temp.expect_blocked('removal: finish refuses under legal hold', format($s$select public.engine_finish_subject_removal(%L, %L)$s$, kid, a));
  perform pg_temp.as_admin();
  update public.subjects set legal_hold = false where id = kid;
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('the app cannot call the removal functions', format($s$select public.engine_finish_subject_removal(%L, %L)$s$, kid, a));
  perform pg_temp.act_as('00000000-0000-0000-0000-000000000000', 'service_role');
  perform public.engine_finish_subject_removal(kid, a);
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('the person is gone, the account and the other person remain',
    not exists (select 1 from public.subjects where id = kid) and exists (select 1 from public.subjects where id = dad) and exists (select 1 from auth.users where id = a));
  perform pg_temp.expect_true('removal is audited by role-free ids only', exists (select 1 from public.audit_logs where action = 'subject.removed' and entity_id = kid and user_id = a));

  -- ---- the account deletion itself ----------------------------------------------------------
  delete from public.documents where id = doc;   -- (the function does this after the originals are removed)
  perform pg_temp.act_as('00000000-0000-0000-0000-000000000000', 'service_role');
  r := public.engine_finish_account_custody(a);
  perform pg_temp.expect_true('with every person decided the custody step completes', r ->> 'status' = 'ok' and (r ->> 'people_removed')::int = 1);
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('the relative and their files are deleted', not exists (select 1 from public.subjects where id = dad) and not exists (select 1 from public.vault_files where id = vf));
  perform pg_temp.expect_true('the family who had access are told, without any health content',
    (select count(*) = 2 from public.account_notices where code = 'access_ended_account_deleted' and subject_name = 'Ravi Kumar' and user_id in (b, c)));
  perform pg_temp.expect_true('each lost grant is audited for the person who lost it',
    (select count(*) = 2 from public.audit_logs where action = 'access.removed_by_account_deletion' and user_id in (b, c)));
  delete from auth.users where id = a;
  perform pg_temp.expect_true('and now the account can be deleted', not exists (select 1 from auth.users where id = a) and not exists (select 1 from public.subjects where id = self_a));

  -- ---- notices: read by their owner only ----------------------------------------------------
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('a person sees only their own notices', (select count(*) = 1 from public.account_notices));
  perform pg_temp.expect_blocked('the app cannot write a notice', format($s$insert into public.account_notices (user_id, code) values (%L, 'access_ended_account_deleted')$s$, b));
  update public.account_notices set read_at = now();
  perform pg_temp.expect_true('a notice can be marked read', (select read_at is not null from public.account_notices limit 1));
  perform pg_temp.expect_blocked('nothing else on a notice can change', $s$update public.account_notices set code = 'access_ended_person_removed'$s$);
  perform pg_temp.act_as(d);
  perform pg_temp.expect_true('a stranger sees no notices', not exists (select 1 from public.account_notices));

  -- ---- a manager deletes their own account: the person keeps everything --------------------
  perform pg_temp.as_admin();
  insert into public.subject_access (subject_id, grantee_user_id, role, status, approved_at) values (self_b, c, 'manager', 'active', now());
  insert into public.vault_files (subject_id, uploaded_by, category, title, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (self_b, c, 'other', 'Added by c', 'x.pdf', 'application/pdf', 10, 'stored', now()) returning id into vf;
  perform pg_temp.act_as('00000000-0000-0000-0000-000000000000', 'service_role');
  perform public.engine_finish_account_custody(c);
  perform pg_temp.as_admin();
  delete from auth.users where id = c;
  perform pg_temp.expect_true('the manager''s uploads stay with the person; the uploader is unknown',
    (select uploaded_by is null and uploaded_by_role = 'manager' and subject_id = self_b from public.vault_files where id = vf));
  perform pg_temp.expect_true('the person''s controller is told in the audit log that access ended',
    exists (select 1 from public.audit_logs where action = 'access.removed_by_account_deletion' and user_id = b));

  -- ---- grant expiry: optional, tidied and audited, never imposed -----------------------------
  insert into public.subject_access (subject_id, grantee_user_id, role, status, approved_at, expires_at) values (self_b, d, 'viewer', 'active', now() - interval '2 days', now() - interval '1 day') returning id into g_exp;
  perform pg_temp.act_as(b);
  perform pg_temp.expect_blocked('the app cannot run the expiry sweeper', 'select public.expire_access_grants()');
  perform pg_temp.act_as('00000000-0000-0000-0000-000000000000', 'service_role');
  perform pg_temp.expect_true('the sweeper marks one expired grant', public.expire_access_grants() = 1);
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('the expired grant is revoked and audited for the controller',
    (select status = 'revoked' and revoked_at is not null from public.subject_access where id = g_exp)
    and exists (select 1 from public.audit_logs where action = 'access.expired' and entity_id = g_exp and user_id = b));
  insert into public.subject_access (subject_id, grantee_user_id, role, status) values (self_b, d, 'viewer', 'requested') returning id into g_c;
  perform pg_temp.act_as(b);
  perform public.approve_access(g_c);
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('no expiry is imposed when none is chosen', (select status = 'active' and expires_at is null from public.subject_access where id = g_c));
  perform pg_temp.act_as('00000000-0000-0000-0000-000000000000', 'service_role');
  perform pg_temp.expect_true('the sweeper leaves open-ended grants alone', public.expire_access_grants() = 0);

  raise notice 'ALL CUSTODY CHECKS PASSED';
end $$;

rollback;
