-- =============================================================================
-- Family · reports for a relative you manage. Synthetic users only; runs inside a
-- transaction that is ROLLED BACK. Success ends with "ALL FAMILY UPLOAD CHECKS PASSED".
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

create function pg_temp.expect_count(label text, query text, expected bigint) returns void
language plpgsql as $$
declare
  actual bigint;
begin
  execute format('with q as (%s) select count(*) from q', query) into actual;
  if actual is distinct from expected then
    raise exception 'FAIL  %  — expected % row(s), got %', label, expected, actual;
  end if;
  raise notice 'PASS  %', label;
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

-- A validated extraction payload (as the Edge Function builds it).
create function pg_temp.payload(hba1c_conf numeric, fp_suffix text default 'a') returns jsonb
language sql as $$
  select jsonb_build_object(
    'report_date', '2026-03-12',
    'identity_check', 'consistent',
    'text_layer', 'present',
    'chunk_count', 1,
    'facts_discarded', 1,
    'pages', jsonb_build_array(
      jsonb_build_object('page_number', 1, 'text', 'HbA1c 5.8 % (4.0-5.6)  LDL Cholesterol 120 mg/dL'),
      jsonb_build_object('page_number', 2, 'text', 'Family history of diabetes. Allergy: Penicillin (rash)')),
    'observations', jsonb_build_array(
      jsonb_build_object('page_number', 1, 'source_text', 'HbA1c 5.8 % (4.0-5.6)', 'confidence', hba1c_conf,
        'confidence_gate', case when hba1c_conf >= 0.85 then 'passed' else 'needs_review' end,
        'fact_fingerprint', repeat('1', 63) || fp_suffix,
        'name_as_written', 'HbA1c', 'value_as_written', '5.8', 'unit_as_written', '%',
        'reference_range_as_written', '4.0-5.6', 'effective_date', '2026-03-12', 'category', 'laboratory',
        'value_numeric', 5.8, 'value_normalized', 5.8, 'unit_normalized', '%', 'reference_low', 4.0, 'reference_high', 5.6,
        'interpretation_version', 'n1'),
      jsonb_build_object('page_number', 1, 'source_text', 'LDL Cholesterol 120 mg/dL', 'confidence', 0.95,
        'confidence_gate', 'passed', 'fact_fingerprint', repeat('2', 64),
        'name_as_written', 'LDL Cholesterol', 'value_as_written', '120', 'unit_as_written', 'mg/dL',
        'effective_date', '2026-03-12', 'category', 'laboratory', 'value_numeric', 120, 'value_normalized', 120,
        'unit_normalized', 'mg/dL', 'interpretation_version', 'n1')),
    'conditions', jsonb_build_array(
      jsonb_build_object('page_number', 2, 'source_text', 'Family history of diabetes', 'confidence', 0.9,
        'confidence_gate', 'passed', 'fact_fingerprint', repeat('3', 64), 'name_as_written', 'diabetes',
        'assertion', 'mentioned')),
    'allergies', jsonb_build_array(
      jsonb_build_object('page_number', 2, 'source_text', 'Allergy: Penicillin (rash)', 'confidence', 0.92,
        'confidence_gate', 'passed', 'fact_fingerprint', repeat('4', 64), 'substance_as_written', 'Penicillin',
        'reaction_as_written', 'rash', 'assertion', 'reported'))
  )
$$;

do $$
declare
  tmp text := pg_my_temp_schema()::regnamespace::text;
begin
  execute format('grant usage on schema %I to anon, authenticated, service_role', tmp);
  execute format('grant execute on all functions in schema %I to anon, authenticated, service_role', tmp);
end
$$;



do $$
declare
  a uuid := gen_random_uuid();   -- account holder with a relative
  c uuid := gen_random_uuid();   -- a caregiver with a viewer grant on the relative
  e uuid := gen_random_uuid();   -- a stranger
  self_a uuid; self_e uuid; dad uuid; doc_dad uuid; doc_self uuid; run uuid; g uuid; code text; ident jsonb;
  v text := 'ai-2026-10';
  storage_writes boolean := coalesce(current_setting('hi_test.storage_writes', true), 'off') = 'on';
  doc_dad2 uuid; doc_self2 uuid;
begin
  insert into auth.users (id, email) values (a, 'fu-a@example.invalid'), (c, 'fu-c@example.invalid'), (e, 'fu-e@example.invalid');
  select id into self_a from public.subjects where linked_user_id = a;
  select id into self_e from public.subjects where linked_user_id = e;

  perform pg_temp.act_as(a);
  dad := public.create_relative('Ramesh Kumar', 'father', date '1955-02-03', true);

  -- ---------------------------------------------- naming the person --------
  insert into public.documents (subject_id, original_filename, mime_type, file_size_bytes)
  values (dad, 'dad.pdf', 'application/pdf', 1000) returning id into doc_dad;
  perform pg_temp.expect_true('a report can be added for a relative the caller manages',
    (select subject_id = dad and user_id = a from public.documents where id = doc_dad));
  insert into public.documents (original_filename, mime_type, file_size_bytes)
  values ('me.pdf', 'application/pdf', 1000) returning id into doc_self;
  perform pg_temp.expect_true('a report with no person still belongs to the caller''s own record',
    (select subject_id = self_a from public.documents where id = doc_self));
  perform pg_temp.expect_blocked('a report cannot be filed under a stranger''s record',
    format($s$insert into public.documents (subject_id, original_filename, mime_type, file_size_bytes) values (%L, 'x.pdf', 'application/pdf', 1)$s$, self_e));
  perform pg_temp.act_as(e);
  perform pg_temp.expect_blocked('a stranger cannot file a report under someone else''s relative',
    format($s$insert into public.documents (subject_id, original_filename, mime_type, file_size_bytes) values (%L, 'x.pdf', 'application/pdf', 1)$s$, dad));
  perform pg_temp.expect_blocked('the app cannot move a report to another person later',
    format($s$update public.documents set subject_id = %L where id = %L$s$, self_a, doc_dad));

  -- ---------------------------------------------- processing follows it ----
  reset role;
  perform pg_temp.act_as(null, 'service_role');
  -- Reports the app has already uploaded (the engine only reads confirmed ones).
  insert into public.documents (user_id, subject_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, dad, 'dad2.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc_dad2;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'me2.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc_self2;
  perform public.engine_claim_document(doc_dad2, a);
  run := public.engine_start_run(doc_dad2, a, 'g1.0', 'anthropic', 'm', 'p1', v);
  perform public.engine_complete_document(run, a, pg_temp.payload(0.95));
  reset role;

  perform pg_temp.expect_true('every fact, page, run and source of the relative''s report belongs to the relative',
    not exists (select 1 from public.observations where document_id = doc_dad2 and subject_id is distinct from dad)
    and not exists (select 1 from public.conditions where document_id = doc_dad2 and subject_id is distinct from dad)
    and not exists (select 1 from public.allergies where document_id = doc_dad2 and subject_id is distinct from dad)
    and not exists (select 1 from public.document_pages where document_id = doc_dad2 and subject_id is distinct from dad)
    and not exists (select 1 from public.extraction_runs where document_id = doc_dad2 and subject_id is distinct from dad)
    and not exists (select 1 from public.fact_sources where document_id = doc_dad2 and subject_id is distinct from dad)
    and exists (select 1 from public.observations where document_id = doc_dad2));

  perform pg_temp.act_as(a);
  perform pg_temp.expect_count('the caller''s own record does not receive the relative''s facts',
    format('select 1 from public.current_observations where subject_id = %L', self_a), 0);
  perform pg_temp.expect_count('the relative''s record holds them',
    format('select 1 from public.current_observations where subject_id = %L', dad), 2);
  reset role;

  -- ---------------------------------------------- who may read the file ----
  if storage_writes then
  insert into storage.objects (bucket_id, name, owner)
  select 'medical-documents', storage_path, a from public.documents where id = doc_dad2;

  perform pg_temp.act_as(c);
  perform pg_temp.expect_count('no access yet: the caregiver cannot see the original file',
    $q$select 1 from storage.objects where bucket_id = 'medical-documents'$q$, 0);
  perform pg_temp.act_as(a);
  code := public.create_access_invite(dad, 'viewer');
  perform pg_temp.act_as(c);
  g := public.redeem_access_invite(code);
  perform pg_temp.expect_count('a pending request still shows no file',
    $q$select 1 from storage.objects where bucket_id = 'medical-documents'$q$, 0);
  perform pg_temp.act_as(a);
  perform public.approve_access(g);
  perform pg_temp.act_as(c);
  perform pg_temp.expect_count('after approval the caregiver can open the relative''s original',
    $q$select 1 from storage.objects where bucket_id = 'medical-documents'$q$, 1);
  perform pg_temp.expect_blocked('the caregiver cannot delete the original',
    $s$delete from storage.objects where bucket_id = 'medical-documents'$s$);
  perform pg_temp.expect_blocked('the caregiver cannot add a report for the relative',
    format($s$insert into public.documents (subject_id, original_filename, mime_type, file_size_bytes) values (%L, 'c.pdf', 'application/pdf', 1)$s$, dad));
  perform pg_temp.act_as(a);
  perform public.revoke_access(g);
  perform pg_temp.act_as(c);
  perform pg_temp.expect_count('after revocation the file is closed again',
    $q$select 1 from storage.objects where bucket_id = 'medical-documents'$q$, 0);
  perform pg_temp.act_as(e);
  perform pg_temp.expect_count('a stranger never sees the file',
    $q$select 1 from storage.objects where bucket_id = 'medical-documents'$q$, 0);
  reset role;
  else
    raise notice 'SKIP  original-file access (needs hi_test.storage_writes, as in the local runner)';
  end if;

  -- ---------------------------------------------- the report-person check --
  perform pg_temp.act_as(null, 'service_role');
  ident := public.engine_document_identity(doc_dad2, a);
  perform pg_temp.expect_true('a relative''s report is compared with the relative, not the uploader',
    ident ->> 'full_name' = 'Ramesh Kumar' and ident ->> 'date_of_birth' = '1955-02-03');
  perform pg_temp.expect_true('the account holder''s own report still uses the identity they entered',
    public.engine_document_identity(doc_self2, a) = public.engine_account_identity(a));
  reset role;
  update public.subjects set display_name = 'Dad' where id = dad;
  perform pg_temp.act_as(null, 'service_role');
  perform pg_temp.expect_true('a nickname is never used as a name to compare',
    public.engine_document_identity(doc_dad2, a) -> 'full_name' = 'null'::jsonb);
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('the app cannot ask for anyone''s identity',
    format($s$select public.engine_document_identity(%L, %L)$s$, doc_dad2, a));
  reset role;
end
$$;

do $$ begin raise notice 'ALL FAMILY UPLOAD CHECKS PASSED'; end $$;

rollback;
