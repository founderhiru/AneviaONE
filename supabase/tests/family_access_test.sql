-- =============================================================================
-- Family foundation B1 · invites, approval, revocation, granted reads. Synthetic users
-- only; runs inside a transaction that is ROLLED BACK. Success ends with
-- "ALL FAMILY ACCESS CHECKS PASSED".
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
  a uuid := gen_random_uuid();   -- owner of a relative and of their own records
  b uuid := gen_random_uuid();   -- caregiver
  d uuid := gen_random_uuid();   -- stranger
  self_a uuid; kid uuid; code text; code2 text; g uuid; doc uuid; n int; i int;
begin
  insert into auth.users (id, email) values
    (a, 'fa-a@example.invalid'), (b, 'fa-b@example.invalid'), (d, 'fa-d@example.invalid');
  select id into self_a from public.subjects where linked_user_id = a;

  -- a record that belongs to A's self subject
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'fa.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc;

  -- ------------------------------------------------ relatives --------------
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('a relative needs the authority confirmation',
    $s$select public.create_relative('Dad', 'father', null, false)$s$);
  perform pg_temp.expect_blocked('self is not a relative',
    $s$select public.create_relative('Me', 'self', null, true)$s$);
  perform pg_temp.expect_blocked('an empty name is refused',
    $s$select public.create_relative('  ', 'father', null, true)$s$);
  perform pg_temp.expect_blocked('a future birth date is refused',
    $s$select public.create_relative('Dad', 'father', current_date + 1, true)$s$);
  kid := public.create_relative('Child A', 'child', date '2018-05-01', true);
  perform pg_temp.expect_true('a relative is created and owned by the caller',
    public.can_access_subject(kid, 'manage'));
  perform pg_temp.expect_true('creating a relative is audited without health values',
    exists (select 1 from public.audit_logs where action = 'subject.created' and entity_id = kid));

  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anonymous cannot create a relative',
    $s$select public.create_relative('x', 'father', null, true)$s$);
  perform pg_temp.act_as(d);
  perform pg_temp.expect_blocked('a stranger cannot make an invite for someone else',
    format($s$select public.create_access_invite(%L, 'viewer')$s$, self_a));

  -- ------------------------------------------------ invite → request -------
  perform pg_temp.act_as(a);
  code := public.create_access_invite(self_a, 'viewer');
  perform pg_temp.expect_true('the code is shown once in XXXX-XXXX-XXXX form', code ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$');
  perform pg_temp.expect_blocked('the app cannot read invites',
    'select * from private.access_invites');

  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('a wrong code returns nothing', public.redeem_access_invite('0000-0000-0000') is null);
  g := public.redeem_access_invite(lower(code));
  perform pg_temp.expect_true('a right code (any case) creates a request', g is not null);
  perform pg_temp.expect_true('a request gives no access yet', not public.can_access_subject(self_a, 'read'));
  perform pg_temp.expect_true('a code works once', public.redeem_access_invite(code) is null);

  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('the owner can redeem nothing of their own',
    public.redeem_access_invite(public.create_access_invite(self_a, 'viewer')) is null);

  -- ------------------------------------------------ approval ---------------
  perform pg_temp.act_as(b);
  perform pg_temp.expect_blocked('the requester cannot approve themselves',
    format($s$select public.approve_access(%L)$s$, g));
  perform pg_temp.act_as(d);
  perform pg_temp.expect_blocked('a stranger cannot approve',
    format($s$select public.approve_access(%L)$s$, g));
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('the owner sees the pending request',
    (select count(*) from public.list_subject_access(self_a) where status = 'requested') = 1);
  perform pg_temp.expect_blocked('an expiry in the past is refused',
    format($s$select public.approve_access(%L, now() - interval '1 day')$s$, g));
  perform public.approve_access(g);

  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('approved viewer can read', public.can_access_subject(self_a, 'read') and not public.can_access_subject(self_a, 'write'));
  perform pg_temp.expect_true('the viewer can now read the owner''s report',
    exists (select 1 from public.documents where id = doc));
  perform pg_temp.expect_blocked('the viewer cannot change the owner''s report',
    format($s$update public.documents set original_filename = 'x' where id = %L$s$, doc));
  perform pg_temp.expect_blocked('the viewer cannot delete the owner''s report',
    format($s$delete from public.documents where id = %L$s$, doc));
  perform pg_temp.expect_blocked('the viewer cannot read who else has access',
    format($s$select * from public.list_subject_access(%L)$s$, self_a));
  select count(*) into n from public.list_subject_access(self_a);
  perform pg_temp.expect_true('list_subject_access shows nothing to a non-manager', n = 0);
  perform pg_temp.expect_blocked('the app cannot write grants directly',
    format($s$insert into public.subject_access (subject_id, grantee_user_id, role, status) values (%L, %L, 'manager', 'active')$s$, kid, b));

  perform pg_temp.act_as(d);
  perform pg_temp.expect_true('a stranger still sees nothing of A''s reports', not exists (select 1 from public.documents where id = doc));

  -- ------------------------------------------------ expiry and revoke ------
  perform pg_temp.as_admin();
  update public.subject_access set expires_at = now() - interval '1 minute' where id = g;
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('an expired grant gives no access', not public.can_access_subject(self_a, 'read')
    and not exists (select 1 from public.documents where id = doc));
  perform pg_temp.as_admin();
  update public.subject_access set expires_at = null where id = g;

  perform pg_temp.act_as(d);
  perform pg_temp.expect_blocked('a stranger cannot revoke',
    format($s$select public.revoke_access(%L)$s$, g));
  perform pg_temp.act_as(b);
  perform public.revoke_access(g);
  perform pg_temp.expect_true('the grantee can walk away: access ends', not public.can_access_subject(self_a, 'read'));

  perform pg_temp.act_as(a);
  code2 := public.create_access_invite(self_a, 'manager');
  perform pg_temp.act_as(b);
  g := public.redeem_access_invite(code2);
  perform pg_temp.act_as(a);
  perform public.approve_access(g);
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('a manager can read and write but not manage',
    public.can_access_subject(self_a, 'read') and public.can_access_subject(self_a, 'write') and not public.can_access_subject(self_a, 'manage'));
  perform pg_temp.act_as(a);
  perform public.revoke_access(g);
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('the owner can revoke at any time', not public.can_access_subject(self_a, 'read'));
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('revoked and audited',
    (select count(*) from public.audit_logs where action = 'access.revoked' and entity_id = g) = 1);

  -- ------------------------------------------------ expired and limits -----
  perform pg_temp.act_as(a);
  code := public.create_access_invite(self_a, 'viewer');
  perform pg_temp.as_admin();
  update private.access_invites set expires_at = now() - interval '1 minute';
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('an expired code does not work', public.redeem_access_invite(code) is null);

  perform pg_temp.act_as(a);
  for i in 1..5 loop perform public.create_access_invite(kid, 'viewer'); end loop;
  perform pg_temp.expect_blocked('no more than five open invites per person',
    format($s$select public.create_access_invite(%L, 'viewer')$s$, kid));

  perform pg_temp.act_as(d);
  for i in 1..10 loop perform public.redeem_access_invite('1111-1111-1111'); end loop;
  perform pg_temp.expect_blocked('guessing is rate limited after ten failures',
    $s$select public.redeem_access_invite('2222-2222-2222')$s$);

  -- audit never holds the code
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('no audit row contains a code',
    not exists (select 1 from public.audit_logs where details::text ~ '[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}'));

  raise notice '==============================================';
  raise notice 'ALL FAMILY ACCESS CHECKS PASSED';
  raise notice '==============================================';
end
$$;

rollback;
