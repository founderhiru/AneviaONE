-- =============================================================================
-- S9 · obligations isolation and rules. Synthetic users only; ROLLED BACK.
-- Success ends with "ALL OBLIGATION CHECKS PASSED".
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
  a uuid := gen_random_uuid();  -- owner
  b uuid := gen_random_uuid();  -- viewer
  c uuid := gen_random_uuid();  -- manager
  d uuid := gen_random_uuid();  -- stranger
  self_a uuid; kid uuid; doc uuid; ob uuid; ob_x uuid;
begin
  insert into auth.users (id, email) values
    (a, 'ob-a@example.invalid'), (b, 'ob-b@example.invalid'),
    (c, 'ob-c@example.invalid'), (d, 'ob-d@example.invalid');
  select id into self_a from public.subjects where linked_user_id = a;
  insert into public.subject_access (subject_id, grantee_user_id, role, status, approved_at)
  values (self_a, b, 'viewer', 'active', now()), (self_a, c, 'manager', 'active', now());
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'ob.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc;

  -- owner can create a user-typed obligation
  perform pg_temp.act_as(a);
  insert into public.obligations (subject_id, created_by, kind, title, due_on, source, state)
  values (self_a, a, 'renewal', 'Policy renewal', current_date + 30, 'user', 'open') returning id into ob;
  perform pg_temp.expect_true('owner creates an open user obligation',
    exists (select 1 from public.obligations where id = ob));

  perform pg_temp.expect_blocked('app cannot create an extracted obligation',
    format($s$insert into public.obligations (subject_id, created_by, document_id, kind, title, due_on, source, state)
              values (%L, %L, %L, 'followup', 'x', current_date, 'extracted', 'proposed')$s$, self_a, a, doc));
  perform pg_temp.expect_blocked('app cannot create a done obligation directly',
    format($s$insert into public.obligations (subject_id, created_by, kind, title, due_on, source, state, completed_at)
              values (%L, %L, 'due', 'x', current_date, 'user', 'done', now())$s$, self_a, a));
  perform pg_temp.expect_blocked('empty title refused',
    format($s$insert into public.obligations (subject_id, created_by, kind, title, due_on, source, state)
              values (%L, %L, 'due', '   ', current_date, 'user', 'open')$s$, self_a, a));
  perform pg_temp.expect_blocked('cannot attribute to another user',
    format($s$insert into public.obligations (subject_id, created_by, kind, title, due_on, source, state)
              values (%L, %L, 'due', 'x', current_date, 'user', 'open')$s$, self_a, b));

  -- viewer reads, cannot write
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('viewer can read', exists (select 1 from public.obligations where id = ob));
  perform pg_temp.expect_blocked('viewer cannot insert',
    format($s$insert into public.obligations (subject_id, created_by, kind, title, due_on, source, state)
              values (%L, %L, 'due', 'x', current_date, 'user', 'open')$s$, self_a, b));
  perform pg_temp.expect_blocked('viewer cannot update', format($s$update public.obligations set title = 'y' where id = %L$s$, ob));
  perform pg_temp.expect_blocked('viewer cannot delete', format($s$delete from public.obligations where id = %L$s$, ob));

  -- manager writes
  perform pg_temp.act_as(c);
  update public.obligations set state = 'done' where id = ob;
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('done sets completed_at',
    (select completed_at is not null from public.obligations where id = ob));
  perform pg_temp.act_as(c);
  update public.obligations set state = 'open' where id = ob;
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('reopening clears completed_at',
    (select completed_at is null from public.obligations where id = ob));
  -- identity is frozen even for the owner of both people
  perform pg_temp.act_as(a);
  kid := public.create_relative('Child A', 'child', date '2018-05-01', true);
  perform pg_temp.expect_blocked('obligation cannot be moved to another person',
    format($s$update public.obligations set subject_id = %L where id = %L$s$, kid, ob));
  perform pg_temp.expect_blocked('created_by cannot be rewritten',
    format($s$update public.obligations set created_by = %L where id = %L$s$, b, ob));
  perform pg_temp.expect_blocked('a user obligation cannot become extracted',
    format($s$update public.obligations set source = 'extracted' where id = %L$s$, ob));

  -- stranger sees nothing
  perform pg_temp.act_as(d);
  perform pg_temp.expect_true('stranger cannot read', not exists (select 1 from public.obligations));
  perform pg_temp.expect_blocked('stranger cannot update', format($s$update public.obligations set title = 'z' where id = %L$s$, ob));

  -- anonymous
  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anonymous cannot read', 'select * from public.obligations');

  -- revoked and expired grants stop access
  perform pg_temp.as_admin();
  update public.subject_access set status = 'revoked', revoked_at = now() where grantee_user_id = b and subject_id = self_a;
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('revoked viewer sees nothing', not exists (select 1 from public.obligations));
  perform pg_temp.as_admin();
  update public.subject_access set expires_at = now() - interval '1 day' where grantee_user_id = c and subject_id = self_a;
  perform pg_temp.act_as(c);
  perform pg_temp.expect_blocked('expired manager cannot update', format($s$update public.obligations set title = 'q' where id = %L$s$, ob));

  -- service role proposes an extracted obligation; deleting the report removes it
  perform pg_temp.as_admin();
  insert into public.obligations (subject_id, document_id, kind, title, due_on, source, state, source_page, source_text)
  values (self_a, doc, 'followup', 'Follow-up visit', current_date + 90, 'extracted', 'proposed', 2, 'Review after 3 months')
  returning id into ob_x;
  perform pg_temp.expect_true('service role can propose', exists (select 1 from public.obligations where id = ob_x));
  delete from public.documents where id = doc;
  perform pg_temp.expect_true('deleting the report deletes its proposals',
    not exists (select 1 from public.obligations where id = ob_x));

  -- a caregiver account deletion does not delete the subject's obligation
  delete from auth.users where id = c;
  perform pg_temp.expect_true('manager deletion keeps the person''s obligation',
    exists (select 1 from public.obligations where id = ob));

  raise notice '==============================================';
  raise notice 'ALL OBLIGATION CHECKS PASSED';
  raise notice '==============================================';
end $$;

rollback;
