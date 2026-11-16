-- =============================================================================
-- Medicines added by hand: who may add, what is stored, edit / stop / remove, the independence from
-- reports, and removing a relative who has them. Synthetic users only; ROLLED BACK.
-- Success ends with "ALL MANUAL MEDICATION CHECKS PASSED".
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
  a uuid := gen_random_uuid();  -- the person; custodian of Dad
  b uuid := gen_random_uuid();  -- manager of Dad
  d uuid := gen_random_uuid();  -- stranger
  self_a uuid; dad uuid; m1 uuid; m2 uuid; m3 uuid; m4 uuid; doc_ok uuid; doc_held uuid; doc_other uuid;
begin
  insert into auth.users (id, email) values (a, 'mm-a@example.invalid'), (b, 'mm-b@example.invalid'), (d, 'mm-d@example.invalid');
  select id into self_a from public.subjects where linked_user_id = a;
  perform pg_temp.act_as(a);
  dad := public.create_relative('Ravi Kumar', 'father', date '1955-02-03', true);
  perform pg_temp.as_admin();
  insert into public.subject_access (subject_id, grantee_user_id, role, status, approved_at) values (dad, b, 'manager', 'active', now());
  insert into public.documents (user_id, subject_id, original_filename, mime_type, file_size_bytes, status, uploaded_at, identity_check)
  values (a, dad, 'rx.pdf', 'application/pdf', 10, 'uploaded', now(), 'owner_attested') returning id into doc_ok;

  -- ---- add ---------------------------------------------------------------------------------
  perform pg_temp.act_as(a);
  m1 := public.add_medication(self_a, '{"name": "  Metformin ", "dose": "500 mg", "frequency": "1-0-1", "instructions": "after food"}');
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('a typed-in medicine is stored as entered by the person, confirmed, exactly as typed',
    (select origin = 'user_entered' and review_status = 'confirmed' and user_id = a and subject_id = self_a
            and name_as_written = 'Metformin' and frequency_as_written = '1-0-1' and status = 'active'
            and confidence is null and extraction_run_id is null and document_id is null and generic_name is null and code is null
       from public.medications where id = m1));
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('it is in the person''s current medicines', exists (select 1 from public.current_medications where id = m1));

  m2 := public.add_medication(dad, '{"name": "Amlodipine", "dose": "5 mg", "prescriber": "Dr. Rao", "status": "as_needed"}');
  m3 := public.add_medication(dad, '{"name": "Aspirin"}');
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('the custodian can add for a relative; it is never tied to a report',
    (select subject_id = dad and user_id = a and document_id is null and prescriber_name = 'Dr. Rao' and status = 'as_needed' from public.medications where id = m2));

  -- ---- who may not -------------------------------------------------------------------------
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('a manager can read the relative''s medicines', (select count(*) = 2 from public.current_medications where subject_id = dad));
  perform pg_temp.expect_blocked('a manager cannot add a medicine', format($s$select public.add_medication(%L, '{"name": "X"}')$s$, dad));
  perform pg_temp.expect_blocked('a manager cannot change one', format($s$select public.update_medication(%L, '{"status": "stopped"}')$s$, m2));
  perform pg_temp.expect_blocked('a manager cannot remove one', format($s$select public.remove_medication(%L)$s$, m2));
  perform pg_temp.act_as(d);
  perform pg_temp.expect_blocked('a stranger cannot add for someone else', format($s$select public.add_medication(%L, '{"name": "X"}')$s$, self_a));
  perform pg_temp.expect_blocked('a stranger cannot change someone else''s medicine', format($s$select public.update_medication(%L, '{"dose": "1 g"}')$s$, m1));
  perform pg_temp.expect_true('a stranger sees none of them', (select count(*) = 0 from public.current_medications));
  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('signed-out callers cannot add', format($s$select public.add_medication(%L, '{"name": "X"}')$s$, self_a));

  -- ---- what is refused ---------------------------------------------------------------------
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('a name is required', format($s$select public.add_medication(%L, '{"dose": "5 mg"}')$s$, self_a));
  perform pg_temp.expect_blocked('unknown fields are refused (no codes or generic names from the app)', format($s$select public.add_medication(%L, '{"name": "X", "generic_name": "y"}')$s$, self_a));
  perform pg_temp.expect_blocked('an over-long entry is refused', format($s$select public.add_medication(%L, %L)$s$, self_a, json_build_object('name', 'X', 'dose', repeat('9', 101))::text));
  perform pg_temp.expect_blocked('an unsupported status is refused', format($s$select public.add_medication(%L, '{"name": "X", "status": "cured"}')$s$, self_a));
  perform pg_temp.expect_blocked('a future start date is refused', format($s$select public.add_medication(%L, '{"name": "X", "start_date": "2999-01-01"}')$s$, self_a));
  perform pg_temp.expect_blocked('the app cannot tie a typed-in medicine to a report', format($s$select public.add_medication(%L, '{"name": "X", "document_id": %s}')$s$, dad, to_json(doc_ok::text)));
  perform pg_temp.expect_blocked('the app still cannot write an "extracted" medicine directly',
    format($s$insert into public.medications (origin, subject_id, name_as_written) values ('extracted', %L, 'X')$s$, self_a));

  -- ---- change / stop -----------------------------------------------------------------------
  m4 := public.update_medication(m1, format('{"status": "stopped", "end_date": %s}', to_json(current_date::text))::jsonb);
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('stopping adds a new version and keeps the old one as history',
    (select origin = 'user_corrected' and supersedes_id = m1 and status = 'stopped' and end_date = current_date
            and name_as_written = 'Metformin' and dose_as_written = '500 mg' and instructions_as_written = 'after food' and subject_id = self_a
       from public.medications where id = m4)
    and (select superseded_at is not null from public.medications where id = m1));
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('only the newer version is current', (select array_agg(id) = array[m4] from public.current_medications where subject_id = self_a));
  perform pg_temp.expect_blocked('the old version can no longer be changed', format($s$select public.update_medication(%L, '{"dose": "1 g"}')$s$, m1));
  perform pg_temp.expect_blocked('a change that changes nothing is refused', format($s$select public.update_medication(%L, '{"status": "stopped"}')$s$, m4));
  perform pg_temp.expect_blocked('the name cannot be emptied', format($s$select public.update_medication(%L, '{"name": " "}')$s$, m4));

  -- ---- remove ------------------------------------------------------------------------------
  perform public.remove_medication(m3);
  perform pg_temp.expect_true('a removed medicine leaves the current list', not exists (select 1 from public.current_medications where id = m3));
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('…but is kept as history, marked rejected', (select review_status = 'rejected' from public.medications where id = m3));
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('it cannot be removed twice', format($s$select public.remove_medication(%L)$s$, m3));
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('every add, change and removal is audited',
    (select count(*) >= 5 from public.audit_logs where entity_table = 'medications' and user_id = a));

  -- ---- deleting the prescription photo keeps what was typed ----------------------------------
  delete from public.documents where subject_id = dad;
  perform pg_temp.expect_true('deleting the relative''s reports leaves the typed-in medicine', exists (select 1 from public.medications where id = m2 and superseded_at is null));

  -- ---- removing the relative ---------------------------------------------------------------
  perform pg_temp.act_as(a);
  perform public.confirm_subject_deletion(dad, 'Ravi Kumar');
  perform pg_temp.act_as('00000000-0000-0000-0000-000000000000', 'service_role');
  perform pg_temp.expect_true('a relative with hand-added medicines can be removed',
    (public.engine_finish_subject_removal(dad, a) ->> 'status') = 'removed');
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('their medicines went with them; the person''s own are untouched',
    not exists (select 1 from public.medications where id in (m2, m3)) and exists (select 1 from public.medications where id = m4));

  raise notice 'ALL MANUAL MEDICATION CHECKS PASSED';
end $$;

rollback;
