-- =============================================================================
-- M1 follow-up — a correction must not be silently lost when the report it was
-- made on is deleted while ANOTHER report still contains the same result.
-- Synthetic data only. Runs inside a transaction that is ROLLED BACK.
-- Success ends with "ALL CORRECTION DELETION CHECKS PASSED".
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

create function pg_temp.expect_true(label text, condition boolean) returns void
language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'FAIL  %', label;
  end if;
  raise notice 'PASS  %', label;
end
$$;

-- One report with one result, written exactly as the extraction engine writes it.
create function pg_temp.read_report(p_user uuid, p_name text, p_sha text, p_fp text, p_test text, p_value text, p_quote text, p_date date)
returns uuid
language plpgsql as $$
declare
  doc uuid; run uuid; c record;
begin
  perform pg_temp.act_as(null, 'service_role');
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (p_user, p_name, 'application/pdf', 1000, 'uploaded', now()) returning id into doc;
  select * into c from public.engine_claim_document(doc, p_user);
  perform public.engine_record_original(doc, p_user, p_sha, 1);
  run := public.engine_start_run(doc, p_user, 'g1.1', 'synthetic', 'test', 'test', 'ai-2026-10');
  perform public.engine_complete_document(run, p_user, jsonb_build_object(
    'report_date', p_date, 'identity_check', 'consistent', 'text_layer', 'present', 'chunk_count', 1, 'facts_discarded', 0,
    'pages', jsonb_build_array(jsonb_build_object('page_number', 1, 'text', p_quote)),
    'observations', jsonb_build_array(jsonb_build_object(
      'page_number', 1, 'source_text', p_quote, 'confidence', 0.95, 'confidence_gate', 'passed', 'fact_fingerprint', p_fp,
      'name_as_written', p_test, 'value_as_written', p_value, 'unit_as_written', '%', 'effective_date', p_date,
      'category', 'laboratory', 'value_numeric', p_value::numeric, 'interpretation_version', 't1'))));
  reset role;
  return doc;
end
$$;

create function pg_temp.correct(p_user uuid, p_fact uuid, p_value text, p_reason text) returns uuid
language plpgsql as $$
declare
  id uuid;
begin
  perform pg_temp.act_as(p_user);
  id := public.correct_fact('observations', p_fact, jsonb_build_object('value', p_value), p_reason);
  reset role;
  return id;
end
$$;

create function pg_temp.delete_report(p_user uuid, p_doc uuid) returns jsonb
language plpgsql as $$
declare
  r jsonb;
begin
  perform pg_temp.act_as(null, 'service_role');
  perform public.engine_begin_document_deletion(p_doc, p_user);
  r := public.engine_delete_document(p_doc, p_user);
  reset role;
  return r;
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

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  doc_a uuid; doc_b uuid; doc_c uuid; doc_d uuid; doc_e uuid; doc_f uuid; doc_g uuid; doc_bx uuid;
  orig uuid; corr uuid; corr2 uuid;
  r record;
  result jsonb;
begin
  insert into auth.users (id, email) values (a, 'cdel-a@example.invalid'), (b, 'cdel-b@example.invalid');
  perform pg_temp.act_as(a);
  insert into public.consents (consent_type, policy_version, granted) values ('ai_processing', 'ai-2026-10', true), ('health_data_processing', 'ai-2026-10', true);
  reset role;

  -- ---- S1: the other report was read BEFORE the correction -------------------
  doc_a := pg_temp.read_report(a, 'report-A.pdf', repeat('1', 64), repeat('a', 64), 'HbA1c', '5.8', 'HbA1c 5.8 %', '2026-03-12');
  doc_b := pg_temp.read_report(a, 'report-B-copy.pdf', repeat('2', 64), repeat('a', 64), 'HbA1c', '5.8', 'HbA1c: 5.8 %', '2026-03-12');
  select id into orig from public.observations where document_id = doc_a;
  perform pg_temp.expect_true('S1 setup: report B is recorded as a second source of the same result',
    exists (select 1 from public.fact_sources where fact_id = orig and document_id = doc_b)
    and not exists (select 1 from public.observations where document_id = doc_b));
  corr := pg_temp.correct(a, orig, '6.8', 'Misread');
  result := pg_temp.delete_report(a, doc_a);

  select * into r from public.observations where user_id = a and name_as_written = 'HbA1c' and superseded_at is null;
  perform pg_temp.expect_true('S1: after deleting report A, the person''s correction (6.8) is still the live result',
    r.id is not null and r.value_as_written = '6.8' and r.origin = 'user_corrected' and r.review_status = 'confirmed');
  perform pg_temp.expect_true('S1: the reason is kept', r.correction_reason = 'Misread');
  perform pg_temp.expect_true('S1: the correction now cites report B (its page and quote) and keeps the fingerprint',
    r.document_id = doc_b and r.source_text = 'HbA1c: 5.8 %' and r.document_page_id is not null and r.fact_fingerprint = repeat('a', 64));
  perform pg_temp.expect_true('S1: report B''s own reading is kept as the replaced original it corrects',
    exists (select 1 from public.observations o where o.id = r.supersedes_id and o.document_id = doc_b
              and o.origin = 'extracted' and o.value_as_written = '5.8' and o.superseded_at is not null));
  perform pg_temp.expect_true('S1: trusted Health Memory shows 6.8 only, and one live fact for the fingerprint',
    (select count(*) = 1 and min(value_as_written) = '6.8' from public.current_observations where user_id = a and name_as_written = 'HbA1c')
    and (select count(*) = 1 from public.observations where user_id = a and fact_fingerprint = repeat('a', 64) and superseded_at is null));
  perform pg_temp.expect_true('S1: report A and everything recorded from it are gone; no dangling sources',
    not exists (select 1 from public.documents where id = doc_a)
    and not exists (select 1 from public.observations where document_id = doc_a)
    and not exists (select 1 from public.fact_sources fs where fs.user_id = a
                      and not exists (select 1 from public.observations o where o.id = fs.fact_id)));
  perform pg_temp.expect_true('S1: the deletion counts the correction as kept', (result ->> 'facts_kept')::int = 1 and (result ->> 'facts_removed')::int = 0);

  -- ---- S1b: rereading report B afterwards cannot bring back 5.8 ---------------
  perform pg_temp.act_as(null, 'service_role');
  perform public.engine_claim_document(doc_b, a, true);
  result := public.engine_complete_document(public.engine_start_run(doc_b, a, 'g1.1', 'synthetic', 'test', 'test', 'ai-2026-10'), a,
    jsonb_build_object('report_date', '2026-03-12', 'identity_check', 'consistent', 'text_layer', 'present', 'chunk_count', 1, 'facts_discarded', 0,
      'pages', jsonb_build_array(jsonb_build_object('page_number', 1, 'text', 'HbA1c: 5.8 %')),
      'observations', jsonb_build_array(jsonb_build_object('page_number', 1, 'source_text', 'HbA1c: 5.8 %', 'confidence', 0.95,
        'confidence_gate', 'passed', 'fact_fingerprint', repeat('a', 64), 'name_as_written', 'HbA1c', 'value_as_written', '5.8',
        'unit_as_written', '%', 'effective_date', '2026-03-12', 'category', 'laboratory', 'value_numeric', 5.8))));
  reset role;
  perform pg_temp.expect_true('S1b: rereading report B writes nothing new; the correction stays live',
    (result ->> 'facts_written')::int = 0
    and (select value_as_written = '6.8' from public.current_observations where user_id = a and name_as_written = 'HbA1c'));

  -- ---- S2: the other report was read AFTER the correction ---------------------
  doc_c := pg_temp.read_report(a, 'report-C.pdf', repeat('3', 64), repeat('b', 64), 'LDL', '120', 'LDL 120', '2026-04-01');
  select id into orig from public.observations where document_id = doc_c;
  corr := pg_temp.correct(a, orig, '125', 'Typo');
  doc_d := pg_temp.read_report(a, 'report-D-copy.pdf', repeat('4', 64), repeat('b', 64), 'LDL', '120', 'LDL: 120', '2026-04-01');
  perform pg_temp.expect_true('S2 setup: report D is recorded as a second source of the correction',
    exists (select 1 from public.fact_sources where fact_id = corr and document_id = doc_d));
  perform pg_temp.delete_report(a, doc_c);
  perform pg_temp.expect_true('S2: the correction (125) survives deleting report C and now cites report D',
    (select count(*) = 1 and min(value_as_written) = '125' from public.current_observations where user_id = a and name_as_written = 'LDL')
    and exists (select 1 from public.observations where user_id = a and name_as_written = 'LDL' and superseded_at is null
                  and origin = 'user_corrected' and document_id = doc_d and correction_reason = 'Typo'));

  -- ---- S3: no other report contains it → removed with its report (unchanged) --
  doc_e := pg_temp.read_report(a, 'report-E.pdf', repeat('5', 64), repeat('c', 64), 'Ferritin', '30', 'Ferritin 30', '2026-05-01');
  select id into orig from public.observations where document_id = doc_e;
  perform pg_temp.correct(a, orig, '35', null);
  perform pg_temp.delete_report(a, doc_e);
  perform pg_temp.expect_true('S3: a correction no other report supports is removed with its report, as before',
    not exists (select 1 from public.observations where user_id = a and name_as_written = 'Ferritin'));

  -- ---- S4: a chain of corrections keeps the latest one -------------------------
  doc_f := pg_temp.read_report(a, 'report-F.pdf', repeat('6', 64), repeat('d', 64), 'TSH', '2.1', 'TSH 2.1', '2026-06-01');
  doc_g := pg_temp.read_report(a, 'report-G-copy.pdf', repeat('7', 64), repeat('d', 64), 'TSH', '2.1', 'TSH: 2.1', '2026-06-01');
  select id into orig from public.observations where document_id = doc_f;
  corr := pg_temp.correct(a, orig, '2.4', 'first');
  corr2 := pg_temp.correct(a, corr, '2.5', 'second');
  perform pg_temp.delete_report(a, doc_f);
  perform pg_temp.expect_true('S4: the latest correction (2.5, "second") survives and cites report G',
    (select count(*) = 1 and min(value_as_written) = '2.5' from public.current_observations where user_id = a and name_as_written = 'TSH')
    and exists (select 1 from public.observations where user_id = a and name_as_written = 'TSH' and superseded_at is null
                  and document_id = doc_g and correction_reason = 'second'));

  -- ---- S5: another person's copy never counts ---------------------------------
  doc_bx := pg_temp.read_report(b, 'b-report.pdf', repeat('8', 64), repeat('e', 64), 'Iron', '80', 'Iron 80', '2026-07-01');
  doc_a := pg_temp.read_report(a, 'a-iron.pdf', repeat('9', 64), repeat('e', 64), 'Iron', '80', 'Iron 80', '2026-07-01');
  select id into orig from public.observations where document_id = doc_a;
  perform pg_temp.correct(a, orig, '85', null);
  perform pg_temp.delete_report(a, doc_a);
  perform pg_temp.expect_true('S5: another person''s report is never treated as support; their records are untouched',
    not exists (select 1 from public.observations where user_id = a and name_as_written = 'Iron')
    and (select count(*) = 1 and min(value_as_written) = '80' from public.observations where user_id = b and name_as_written = 'Iron'));

  raise notice '==============================================';
  raise notice 'ALL CORRECTION DELETION CHECKS PASSED';
  raise notice '==============================================';
end
$$;

rollback;
