-- =============================================================================
-- Family foundation · subjects and delegated access. Synthetic users
-- only; runs inside a transaction that is ROLLED BACK. Success ends with
-- "ALL SUBJECT FOUNDATION CHECKS PASSED".
--
-- Local: supabase/tests/local/run-local.sh
-- =============================================================================

begin;

create function pg_temp.act_as(p_user uuid, p_role text default 'authenticated') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end
$$;

create function pg_temp.expect_blocked(label text, stmt text) returns void
language plpgsql as $$
declare
  affected bigint;
begin
  begin
    execute stmt;
    get diagnostics affected = row_count;
  exception when others then
    raise notice 'PASS  %  (refused: %)', label, sqlerrm;
    return;
  end;
  if affected = 0 then
    raise notice 'PASS  %  (no rows affected)', label;
    return;
  end if;
  raise exception 'FAIL  %  — was allowed and affected % row(s)', label, affected;
end
$$;

create function pg_temp.expect_true(label text, condition boolean) returns void
language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'FAIL  %', label;
  end if;
  raise notice 'PASS  %', label;
end
$$;

do $$
declare
  tmp text := pg_my_temp_schema()::regnamespace::text;
begin
  execute format('grant usage on schema %I to anon, authenticated, service_role', tmp);
  execute format('grant execute on all functions in schema %I to anon, authenticated, service_role', tmp);
end
$$;

create function pg_temp.as_admin() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end
$$;

do $$
declare
  a uuid := gen_random_uuid();   -- account holder with a managed child
  b uuid := gen_random_uuid();   -- adult with their own account
  c uuid := gen_random_uuid();   -- caregiver of B
  d uuid := gen_random_uuid();   -- stranger
  self_a uuid; self_b uuid; self_d uuid; kid uuid; grant_c uuid; doc uuid;
begin
  insert into auth.users (id, email) values
    (a, 'sub-a@example.invalid'), (b, 'sub-b@example.invalid'), (c, 'sub-c@example.invalid'), (d, 'sub-d@example.invalid');

  -- ------------------------------------------------ self subjects ----------
  select id into self_a from public.subjects where linked_user_id = a;
  select id into self_b from public.subjects where linked_user_id = b;
  select id into self_d from public.subjects where linked_user_id = d;
  perform pg_temp.expect_true('every new account gets exactly one self subject',
    self_a is not null and self_b is not null and self_d is not null
    and (select count(*) from public.subjects where created_by in (a, b, c, d)) = 4);
  perform pg_temp.expect_blocked('a duplicate self subject is refused',
    format($s$insert into public.subjects (created_by, linked_user_id, display_name, relationship) values (%L, %L, 'x', 'self')$s$, a, a));
  perform pg_temp.expect_blocked('a self subject must be linked to its creator',
    format($s$insert into public.subjects (created_by, linked_user_id, display_name, relationship) values (%L, %L, 'x', 'self')$s$, a, b));
  perform pg_temp.expect_blocked('a non-self subject cannot carry an account link',
    format($s$insert into public.subjects (created_by, linked_user_id, display_name, relationship) values (%L, %L, 'x', 'child')$s$, a, c));

  -- A relative managed without an account, created by A.
  insert into public.subjects (created_by, display_name, relationship, date_of_birth)
  values (a, 'Child A', 'child', date '2018-05-01') returning id into kid;

  -- ------------------------------------------------ owner access -----------
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('owner: read, write and manage the own self subject',
    public.can_access_subject(self_a, 'read') and public.can_access_subject(self_a, 'write') and public.can_access_subject(self_a, 'manage'));
  perform pg_temp.expect_true('the creator owns a relative managed without an account',
    public.can_access_subject(kid, 'read') and public.can_access_subject(kid, 'write') and public.can_access_subject(kid, 'manage'));
  perform pg_temp.expect_true('the app lists only the subjects it can access (own + managed)',
    (select count(*) from public.subjects) = 2);
  perform pg_temp.expect_true('an unknown need is refused',
    not public.can_access_subject(self_a, 'delete') and not public.can_access_subject(self_a, null));

  -- ------------------------------------------------ strangers --------------
  perform pg_temp.act_as(d);
  perform pg_temp.expect_true('stranger: no access to anyone else',
    not public.can_access_subject(self_a, 'read') and not public.can_access_subject(kid, 'read') and not public.can_access_subject(self_b, 'read'));
  perform pg_temp.expect_true('stranger sees only their own subject', (select count(*) from public.subjects) = 1);
  perform pg_temp.expect_true('an unknown subject is refused', not public.can_access_subject(gen_random_uuid(), 'read'));

  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anonymous cannot call the access check', format($s$select public.can_access_subject(%L, 'read')$s$, self_a));
  perform pg_temp.expect_blocked('anonymous cannot read subjects', 'select 1 from public.subjects limit 1');

  -- ------------------------------------------------ a caregiver's request --
  perform pg_temp.as_admin();
  insert into public.subject_access (subject_id, grantee_user_id, role) values (self_b, c, 'manager') returning id into grant_c;
  perform pg_temp.act_as(c);
  perform pg_temp.expect_true('a REQUESTED grant gives no access (the adult has not approved)',
    not public.can_access_subject(self_b, 'read'));

  perform pg_temp.as_admin();
  update public.subject_access set status = 'active', approved_at = now() where id = grant_c;
  perform pg_temp.act_as(c);
  perform pg_temp.expect_true('approved manager: read and write, but not manage',
    public.can_access_subject(self_b, 'read') and public.can_access_subject(self_b, 'write') and not public.can_access_subject(self_b, 'manage'));
  perform pg_temp.expect_true('the caregiver now lists the adult plus their own subject', (select count(*) from public.subjects) = 2);
  perform pg_temp.expect_true('access to one adult is not access to anyone else', not public.can_access_subject(self_a, 'read') and not public.can_access_subject(kid, 'read'));

  perform pg_temp.as_admin();
  update public.subject_access set role = 'viewer' where id = grant_c;
  perform pg_temp.act_as(c);
  perform pg_temp.expect_true('viewer: read only', public.can_access_subject(self_b, 'read') and not public.can_access_subject(self_b, 'write'));

  -- Who can see the grant row.
  perform pg_temp.expect_true('the grantee sees their own grant', (select count(*) from public.subject_access) = 1);
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('the subject’s owner sees who has access', (select count(*) from public.subject_access) = 1);
  perform pg_temp.act_as(d);
  perform pg_temp.expect_true('a stranger sees no grants', (select count(*) from public.subject_access) = 0);

  -- Expiry and revocation.
  perform pg_temp.as_admin();
  update public.subject_access set expires_at = now() - interval '1 minute' where id = grant_c;
  perform pg_temp.act_as(c);
  perform pg_temp.expect_true('an expired grant gives no access', not public.can_access_subject(self_b, 'read'));
  perform pg_temp.as_admin();
  update public.subject_access set expires_at = now() + interval '1 day' where id = grant_c;
  perform pg_temp.act_as(c);
  perform pg_temp.expect_true('a grant that has not yet expired works', public.can_access_subject(self_b, 'read'));
  perform pg_temp.as_admin();
  update public.subject_access set status = 'revoked', revoked_at = now() where id = grant_c;
  perform pg_temp.act_as(c);
  perform pg_temp.expect_true('a revoked grant gives no access', not public.can_access_subject(self_b, 'read'));

  -- ------------------------------------------------ rules on the tables ----
  perform pg_temp.as_admin();
  perform pg_temp.expect_blocked('the owner cannot be given a grant on their own subject',
    format($s$insert into public.subject_access (subject_id, grantee_user_id, role) values (%L, %L, 'viewer')$s$, self_b, b));
  perform pg_temp.expect_blocked('an active grant must record its approval',
    format($s$insert into public.subject_access (subject_id, grantee_user_id, role, status) values (%L, %L, 'viewer', 'active')$s$, self_b, d));
  insert into public.subject_access (subject_id, grantee_user_id, role) values (self_b, d, 'viewer');
  perform pg_temp.expect_blocked('only one live grant per person per subject',
    format($s$insert into public.subject_access (subject_id, grantee_user_id, role) values (%L, %L, 'manager')$s$, self_b, d));

  -- ------------------------------------------------ the app cannot write ---
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('the app cannot create a subject',
    format($s$insert into public.subjects (created_by, display_name, relationship) values (%L, 'x', 'child')$s$, a));
  perform pg_temp.expect_blocked('the app cannot rename a subject', format($s$update public.subjects set display_name = 'x' where id = %L$s$, self_a));
  perform pg_temp.expect_blocked('the app cannot delete a subject', format($s$delete from public.subjects where id = %L$s$, kid));
  perform pg_temp.act_as(b);
  perform pg_temp.expect_blocked('the app cannot grant access',
    format($s$insert into public.subject_access (subject_id, grantee_user_id, role, status, approved_at) values (%L, %L, 'manager', 'active', now())$s$, self_b, a));
  perform pg_temp.expect_blocked('the app cannot approve or change a grant',
    format($s$update public.subject_access set role = 'manager' where subject_id = %L$s$, self_b));

  -- ------------------------------------------------ existing rows ----------
  perform pg_temp.as_admin();
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'subject-test.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc;
  perform pg_temp.expect_true('a new health row is filled with its owner''s self subject',
    (select subject_id from public.documents where id = doc) = self_a);

  -- ------------------------------------------------ deleting an account ----
  perform pg_temp.as_admin();
  delete from auth.users where id = c;
  perform pg_temp.expect_true('deleting a caregiver removes their grants and subjects only',
    not exists (select 1 from public.subject_access where grantee_user_id = c)
    and not exists (select 1 from public.subjects where created_by = c)
    and exists (select 1 from public.subjects where id = self_b));

  raise notice '==============================================';
  raise notice 'ALL SUBJECT FOUNDATION CHECKS PASSED';
  raise notice '==============================================';
end
$$;

rollback;
