-- =============================================================================
-- Phase 2 · M1 — fact corrections: integrity, validation, isolation, reread.
-- Synthetic data only. Runs inside a transaction that is ROLLED BACK.
-- Success ends with "ALL FACT CORRECTION CHECKS PASSED".
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

-- Refused, and the error does not repeat what was submitted.
create function pg_temp.expect_refused_quietly(label text, stmt text, secret text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(secret in sqlerrm) > 0 or position(secret in coalesce(pg_temp.detail(), '')) > 0 then
      raise exception 'FAIL  %  — the error repeated the submitted value', label;
    end if;
    raise notice 'PASS  %  (refused: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL  %  — was allowed', label;
end
$$;
create function pg_temp.detail() returns text language sql as $$ select null::text $$;

create function pg_temp.expect_true(label text, condition boolean) returns void
language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'FAIL  %', label;
  end if;
  raise notice 'PASS  %', label;
end
$$;

-- One report: HbA1c and LDL read confidently, Vitamin D held for review.
create function pg_temp.payload() returns jsonb
language sql as $$
  select jsonb_build_object(
    'report_date', '2026-03-12',
    'identity_check', 'consistent',
    'text_layer', 'present',
    'chunk_count', 1,
    'facts_discarded', 0,
    'pages', jsonb_build_array(
      jsonb_build_object('page_number', 1, 'text', 'HbA1c 5.8 % (4.0-5.6)  LDL Cholesterol 120 mg/dL  Vitamin D 18 ng/mL')),
    'observations', jsonb_build_array(
      jsonb_build_object('page_number', 1, 'source_text', 'HbA1c 5.8 % (4.0-5.6)', 'confidence', 0.95,
        'confidence_gate', 'passed', 'fact_fingerprint', repeat('a', 64),
        'name_as_written', 'HbA1c', 'value_as_written', '5.8', 'unit_as_written', '%',
        'reference_range_as_written', '4.0-5.6', 'effective_date', '2026-03-12', 'category', 'laboratory',
        'value_numeric', 5.8, 'value_normalized', 5.8, 'unit_normalized', '%', 'reference_low', 4.0, 'reference_high', 5.6,
        'interpretation_version', 'n1'),
      jsonb_build_object('page_number', 1, 'source_text', 'LDL Cholesterol 120 mg/dL', 'confidence', 0.95,
        'confidence_gate', 'passed', 'fact_fingerprint', repeat('b', 64),
        'name_as_written', 'LDL Cholesterol', 'value_as_written', '120', 'unit_as_written', 'mg/dL',
        'effective_date', '2026-03-12', 'category', 'laboratory', 'value_numeric', 120, 'value_normalized', 120,
        'unit_normalized', 'mg/dL', 'interpretation_version', 'n1'),
      jsonb_build_object('page_number', 1, 'source_text', 'Vitamin D 18 ng/mL', 'confidence', 0.62,
        'confidence_gate', 'needs_review', 'fact_fingerprint', repeat('c', 64),
        'name_as_written', 'Vitamin D', 'value_as_written', '18', 'unit_as_written', 'ng/ml',
        'effective_date', '2026-03-12', 'category', 'laboratory', 'value_numeric', 18,
        'interpretation_version', 'n1'))
  )
$$;

-- A report that could not be matched to the person: its result is held for identity.
create function pg_temp.identity_held_payload() returns jsonb
language sql as $$
  select jsonb_build_object(
    'report_date', '2026-04-02',
    'identity_check', 'unverifiable',
    'text_layer', 'present',
    'chunk_count', 1,
    'facts_discarded', 0,
    'pages', jsonb_build_array(jsonb_build_object('page_number', 1, 'text', 'Patient: R. Sharma  Haemoglobin 13.1 g/dL')),
    'observations', jsonb_build_array(
      jsonb_build_object('page_number', 1, 'source_text', 'Haemoglobin 13.1 g/dL', 'confidence', 0.97,
        'confidence_gate', 'needs_review', 'fact_fingerprint', repeat('d', 64),
        'name_as_written', 'Haemoglobin', 'value_as_written', '13.1', 'unit_as_written', 'g/dL',
        'effective_date', '2026-04-02', 'category', 'laboratory', 'value_numeric', 13.1, 'interpretation_version', 'n1'))
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
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  v text := 'ai-2026-10';
  doc uuid; run uuid; run2 uuid; held_doc uuid; held_run uuid; held_hb uuid;
  claimed record;
  result jsonb;
  hba1c uuid; ldl uuid; vitd uuid;
  c1 uuid; c2 uuid; cv uuid; self_id uuid; ldl_direct uuid;
  r record;
  page_one uuid;
begin
  insert into auth.users (id, email) values (a, 'fix-a@example.invalid'), (b, 'fix-b@example.invalid');

  perform pg_temp.act_as(a);
  insert into public.consents (consent_type, policy_version, granted) values ('ai_processing', v, true), ('health_data_processing', v, true);
  reset role;

  perform pg_temp.act_as(null, 'service_role');
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'synthetic-report.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc;
  select * into claimed from public.engine_claim_document(doc, a);
  perform public.engine_record_original(doc, a, repeat('e', 64), 1);
  run := public.engine_start_run(doc, a, 'g1.0', 'anthropic', 'claude-opus-5-5', 'p1', v);
  result := public.engine_complete_document(run, a, pg_temp.payload());
  reset role;

  select id into hba1c from public.observations where user_id = a and name_as_written = 'HbA1c';
  select id into ldl from public.observations where user_id = a and name_as_written = 'LDL Cholesterol';
  select id into vitd from public.observations where user_id = a and name_as_written = 'Vitamin D';
  select document_page_id into page_one from public.observations where id = hba1c;
  perform pg_temp.expect_true('setup: three extracted results (Vitamin D held for review)',
    hba1c is not null and ldl is not null and vitd is not null
    and (select confidence_gate = 'needs_review' from public.observations where id = vitd));

  -- ------------------------------------------------- a correction ----------
  perform pg_temp.act_as(a);
  c1 := public.correct_fact('observations', hba1c, '{"value": "6.8"}', 'Misread from the report');
  reset role;

  select * into r from public.observations where id = c1;
  perform pg_temp.expect_true('the correction is a confirmed, trusted fact made by the person',
    r.origin = 'user_corrected' and r.review_status = 'confirmed' and r.confidence_gate = 'passed'
    and r.user_id = a and r.supersedes_id = hba1c);
  perform pg_temp.expect_true('the corrected value is stored as entered; other fields are kept',
    r.value_as_written = '6.8' and r.name_as_written = 'HbA1c' and r.unit_as_written = '%'
    and r.reference_range_as_written = '4.0-5.6' and r.effective_date = '2026-03-12' and r.category = 'laboratory');
  perform pg_temp.expect_true('interpreted values are computed on the server (number and range)',
    r.value_numeric = 6.8 and r.value_text is null and r.reference_low = 4.0 and r.reference_high = 5.6
    and r.interpretation_version = 'user-correction-1');
  perform pg_temp.expect_true('the correction keeps the original evidence (report, page, quote)',
    r.document_id = doc and r.document_page_id = page_one and r.source_text = 'HbA1c 5.8 % (4.0-5.6)');
  perform pg_temp.expect_true('a correction carries no AI confidence or extraction run',
    r.confidence is null and r.extraction_run_id is null);
  perform pg_temp.expect_true('the reason is recorded', r.correction_reason = 'Misread from the report');
  perform pg_temp.expect_true('the correction carries the original reading''s fingerprint', r.fact_fingerprint = repeat('a', 64));

  select * into r from public.observations where id = hba1c;
  perform pg_temp.expect_true('the original is kept, unchanged, and marked superseded',
    r.superseded_at is not null and r.value_as_written = '5.8' and r.value_numeric = 5.8 and r.origin = 'extracted');
  perform pg_temp.expect_true('exactly one live fact for that fingerprint',
    (select count(*) = 1 from public.observations where user_id = a and fact_fingerprint = repeat('a', 64) and superseded_at is null));
  perform pg_temp.expect_true('trusted Health Memory shows the corrected value only',
    (select count(*) = 1 and min(value_as_written) = '6.8' from public.current_observations where user_id = a and name_as_written = 'HbA1c'));
  perform pg_temp.expect_true('the correction is audited (who, what it replaced) — without the values',
    exists (select 1 from public.audit_logs where entity_id = c1 and action = 'fact.user_corrected'
                                               and actor = 'user' and details ->> 'supersedes_id' = hba1c::text)
    and exists (select 1 from public.audit_logs where entity_id = hba1c and action = 'fact.superseded')
    and not exists (select 1 from public.audit_logs where entity_id in (c1, hba1c) and details::text like '%6.8%'));

  -- ------------------------------------- the original stays superseded ----
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('a corrected (superseded) result cannot be corrected again',
    format($q$select public.correct_fact('observations', %L, '{"value": "7.0"}')$q$, hba1c));
  perform pg_temp.expect_blocked('the app cannot un-supersede the original',
    format('update public.observations set superseded_at = null where id = %L', hba1c));
  perform pg_temp.expect_blocked('the app cannot review a superseded original back into use',
    format($q$update public.observations set review_status = 'confirmed' where id = %L$q$, hba1c));
  perform pg_temp.expect_blocked('the app cannot edit the correction''s values',
    format($q$update public.observations set value_as_written = '9.9' where id = %L$q$, c1));
  perform pg_temp.expect_blocked('facts cannot be deleted from the app',
    format('delete from public.observations where id = %L', c1));
  reset role;
  perform pg_temp.act_as(null, 'service_role');
  perform pg_temp.expect_blocked('even server code cannot un-supersede the original',
    format('update public.observations set superseded_at = null where id = %L', hba1c));
  reset role;

  -- ---------------------------------------- correcting a correction --------
  perform pg_temp.act_as(a);
  c2 := public.correct_fact('observations', c1, '{"value": "6.9"}', null);
  reset role;
  perform pg_temp.expect_true('a correction can itself be corrected; the chain is kept and the fingerprint carried',
    (select supersedes_id = c1 and fact_fingerprint = repeat('a', 64) and correction_reason is null from public.observations where id = c2)
    and (select superseded_at is not null from public.observations where id = c1)
    and (select count(*) = 3 from public.observations where user_id = a and name_as_written = 'HbA1c')
    and (select count(*) = 1 from public.observations where user_id = a and fact_fingerprint = repeat('a', 64) and superseded_at is null));

  -- -------------------------------------- a held result, verified ----------
  perform pg_temp.expect_true('the held Vitamin D result is not in trusted Health Memory',
    not exists (select 1 from public.current_observations where id = vitd));
  perform pg_temp.act_as(a);
  cv := public.correct_fact('observations', vitd, '{"unit": "ng/mL", "reference_range": "30 - 100"}', 'Unit was mistyped');
  reset role;
  perform pg_temp.expect_true('correcting a held result makes the checked version trusted',
    exists (select 1 from public.current_observations where id = cv and unit_as_written = 'ng/mL'
                                                         and reference_low = 30 and reference_high = 100 and value_numeric = 18)
    and not exists (select 1 from public.current_observations where id = vitd));

  -- ----------------------------------------------- value forms -------------
  perform pg_temp.act_as(a);
  ldl := public.correct_fact('observations', ldl, '{"value": "Positive", "unit": "", "reference_range": "< 100", "effective_date": null}');
  reset role;
  perform pg_temp.expect_true('a non-numeric value stays text; "not on the report" clears unit and date; "< 100" is an upper bound',
    (select value_numeric is null and value_text = 'Positive' and unit_as_written is null and effective_date is null
            and reference_low is null and reference_high = 100 from public.observations where id = ldl));

  -- ------------------------------------------------- validation -------------
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('an empty test name is refused',
    format($q$select public.correct_fact('observations', %L, '{"name": "   "}')$q$, c2));
  perform pg_temp.expect_blocked('an empty value is refused',
    format($q$select public.correct_fact('observations', %L, '{"value": ""}')$q$, c2));
  perform pg_temp.expect_blocked('an over-long value is refused',
    format($q$select public.correct_fact('observations', %L, jsonb_build_object('value', repeat('9', 301)))$q$, c2));
  perform pg_temp.expect_blocked('control characters are refused',
    format($q$select public.correct_fact('observations', %L, jsonb_build_object('name', 'Hb' || chr(7)))$q$, c2));
  perform pg_temp.expect_blocked('an impossible date is refused',
    format($q$select public.correct_fact('observations', %L, '{"effective_date": "2026-02-30"}')$q$, c2));
  perform pg_temp.expect_blocked('a date in another format is refused',
    format($q$select public.correct_fact('observations', %L, '{"effective_date": "12/03/2026"}')$q$, c2));
  perform pg_temp.expect_refused_quietly('a future date is refused without repeating it',
    format($q$select public.correct_fact('observations', %L, '{"effective_date": "2999-01-01"}')$q$, c2), '2999');
  perform pg_temp.expect_refused_quietly('an over-long reason is refused without repeating it',
    format($q$select public.correct_fact('observations', %L, '{"value": "7.1"}', repeat('Q', 501))$q$, c2), 'QQQQ');
  perform pg_temp.expect_blocked('fields that are not correctable (category) are refused',
    format($q$select public.correct_fact('observations', %L, '{"category": "imaging"}')$q$, c2));
  perform pg_temp.expect_blocked('interpreted fields cannot be supplied',
    format($q$select public.correct_fact('observations', %L, '{"value_numeric": 1}')$q$, c2));
  perform pg_temp.expect_blocked('a non-object payload is refused',
    format($q$select public.correct_fact('observations', %L, '[]')$q$, c2));
  perform pg_temp.expect_blocked('a "correction" that changes nothing is refused',
    format($q$select public.correct_fact('observations', %L, '{"value": "6.9"}')$q$, c2));
  perform pg_temp.expect_blocked('other record kinds cannot be corrected yet (M1: results only)',
    format($q$select public.correct_fact('medications', %L, '{"name": "x"}')$q$, c2));
  perform pg_temp.expect_blocked('an unknown fact id is refused',
    $q$select public.correct_fact('observations', gen_random_uuid(), '{"value": "1"}')$q$);
  reset role;
  perform pg_temp.expect_true('refused corrections changed nothing',
    (select count(*) = 1 from public.observations where user_id = a and fact_fingerprint = repeat('a', 64) and superseded_at is null)
    and (select value_as_written = '6.9' and superseded_at is null from public.observations where id = c2));

  -- --------------------------------- direct app inserts are hardened -------
  perform pg_temp.act_as(a);
  insert into public.observations (origin, name_as_written, value_as_written, value_numeric, reference_high, fact_fingerprint, interpretation_version)
  values ('user_entered', 'Weight', '72', 999, 1, repeat('f', 64), 'forged') returning id into self_id;
  reset role;
  perform pg_temp.expect_true('a direct app insert cannot set a fingerprint or interpreted values',
    (select fact_fingerprint is null and value_numeric is null and reference_high is null and interpretation_version is null
            and review_status = 'confirmed' and confidence is null from public.observations where id = self_id));
  perform pg_temp.act_as(a);
  insert into public.observations (origin, name_as_written, value_as_written, correction_reason)
  values ('user_entered', 'Height', '170', 'because');
  reset role;
  perform pg_temp.expect_true('a reason sent outside correct_fact is not stored',
    (select correction_reason is null from public.observations where user_id = a and name_as_written = 'Height'));
  perform pg_temp.act_as(a);
  insert into public.observations (origin, supersedes_id, name_as_written, value_as_written, value_numeric)
  values ('user_corrected', ldl, 'LDL Cholesterol', '121', 121) returning id into ldl_direct;
  reset role;
  perform pg_temp.expect_true('a correction inserted directly also carries the fingerprint and supersedes first (no forged numbers)',
    (select fact_fingerprint = repeat('b', 64) and value_numeric is null from public.observations where id = ldl_direct)
    and (select superseded_at is not null from public.observations where id = ldl)
    and (select count(*) = 1 from public.observations where user_id = a and fact_fingerprint = repeat('b', 64) and superseded_at is null));

  -- a rejected result cannot be corrected
  perform pg_temp.act_as(a);
  update public.observations set review_status = 'rejected' where id = self_id;
  perform pg_temp.expect_blocked('a result marked as not correct cannot be corrected',
    format($q$select public.correct_fact('observations', %L, '{"value": "73"}')$q$, self_id));
  reset role;

  -- ------------------------------------------------- isolation -------------
  perform pg_temp.act_as(b);
  perform pg_temp.expect_blocked('B cannot correct A''s result (reads as not found)',
    format($q$select public.correct_fact('observations', %L, '{"value": "1"}')$q$, c2));
  perform pg_temp.expect_true('B sees none of A''s results, corrections or reasons',
    not exists (select 1 from public.observations) and not exists (select 1 from public.current_observations));
  reset role;
  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anonymous callers cannot correct anything',
    format($q$select public.correct_fact('observations', %L, '{"value": "1"}')$q$, c2));
  reset role;
  perform pg_temp.expect_true('B''s attempt changed nothing',
    (select value_as_written = '6.9' and superseded_at is null from public.observations where id = c2));

  -- ----------------------- REREAD: the original reading cannot come back ---
  perform pg_temp.act_as(null, 'service_role');
  select * into claimed from public.engine_claim_document(doc, a, true);
  run2 := public.engine_start_run(doc, a, 'g1.0', 'anthropic', 'claude-opus-5-5', 'p1', v);
  result := public.engine_complete_document(run2, a, pg_temp.payload());   -- same readings, same fingerprints
  reset role;
  perform pg_temp.expect_true('reread: no fact is written for readings the person already corrected',
    (result ->> 'facts_written')::int = 0 and (result ->> 'facts_duplicate')::int = 3);
  perform pg_temp.expect_true('reread: the original HbA1c value (5.8) is not active again',
    not exists (select 1 from public.observations where user_id = a and name_as_written = 'HbA1c'
                                                   and value_as_written = '5.8' and superseded_at is null));
  perform pg_temp.expect_true('reread: one live fact per fingerprint, and it is the person''s correction',
    (select count(*) = 1 and bool_and(origin = 'user_corrected') from public.observations
       where user_id = a and fact_fingerprint = repeat('a', 64) and superseded_at is null)
    and (select count(*) = 1 and bool_and(origin = 'user_corrected') from public.observations
       where user_id = a and fact_fingerprint = repeat('b', 64) and superseded_at is null)
    and (select count(*) = 1 and bool_and(origin = 'user_corrected') from public.observations
       where user_id = a and fact_fingerprint = repeat('c', 64) and superseded_at is null));
  perform pg_temp.expect_true('reread: trusted Health Memory still shows the corrected values',
    (select value_as_written = '6.9' from public.current_observations where user_id = a and name_as_written = 'HbA1c')
    and (select value_as_written = '121' from public.current_observations where user_id = a and name_as_written = 'LDL Cholesterol')
    and (select unit_as_written = 'ng/mL' from public.current_observations where user_id = a and name_as_written = 'Vitamin D'));
  perform pg_temp.expect_true('reread: the superseded history is untouched (nothing restored, nothing deleted)',
    (select count(*) = 3 from public.observations where user_id = a and name_as_written = 'HbA1c')
    and (select superseded_at is not null from public.observations where id = hba1c)
    and (select superseded_at is not null from public.observations where id = c1));

  -- ----------------------- identity safeguard (report not matched) --------
  perform pg_temp.act_as(null, 'service_role');
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'unmatched-report.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into held_doc;
  select * into claimed from public.engine_claim_document(held_doc, a);
  perform public.engine_record_original(held_doc, a, repeat('9', 64), 1);
  held_run := public.engine_start_run(held_doc, a, 'g1.0', 'anthropic', 'claude-opus-5-5', 'p1', v);
  result := public.engine_complete_document(held_run, a, pg_temp.identity_held_payload());
  reset role;
  select id into held_hb from public.observations where user_id = a and document_id = held_doc;
  perform pg_temp.expect_true('setup: a report not matched to the person keeps its result held',
    (select identity_check = 'unverifiable' from public.documents where id = held_doc)
    and not exists (select 1 from public.current_observations where id = held_hb));
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('a result held because its report is not confirmed as yours cannot be corrected',
    format($q$select public.correct_fact('observations', %L, '{"value": "13.4"}')$q$, held_hb));
  reset role;
  perform pg_temp.expect_true('the held result is unchanged and still not in trusted Health Memory',
    (select superseded_at is null and value_as_written = '13.1' and review_status = 'unreviewed' from public.observations where id = held_hb)
    and not exists (select 1 from public.observations where supersedes_id = held_hb)
    and not exists (select 1 from public.current_observations where id = held_hb));

  -- Every other app path is closed too (not only correct_fact).
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('path A: the app cannot confirm a result held because its report is not confirmed as yours',
    format($q$update public.observations set review_status = 'confirmed' where id = %L$q$, held_hb));
  perform pg_temp.expect_blocked('path C: a correction inserted directly cannot replace that held result',
    format($q$insert into public.observations (origin, supersedes_id, name_as_written, value_as_written)
              values ('user_corrected', %L, 'Haemoglobin', '13.4')$q$, held_hb));
  perform pg_temp.expect_blocked('path D: a self-entered result cannot cite a report not confirmed as yours',
    format($q$insert into public.observations (origin, document_id, name_as_written, value_as_written)
              values ('user_entered', %L, 'Haemoglobin', '13.4')$q$, held_doc));
  reset role;
  perform pg_temp.expect_true('after every refused path, the held result is unchanged, unreplaced and not trusted',
    (select superseded_at is null and review_status = 'unreviewed' from public.observations where id = held_hb)
    and not exists (select 1 from public.observations where supersedes_id = held_hb)
    and (select count(*) = 1 from public.observations where user_id = a and document_id = held_doc)
    and not exists (select 1 from public.current_observations where document_id = held_doc));
  perform pg_temp.act_as(a);
  update public.observations set review_status = 'rejected' where id = held_hb;
  reset role;
  perform pg_temp.expect_true('the person can still mark such a result as not correct (that never adds trust)',
    (select review_status = 'rejected' from public.observations where id = held_hb)
    and not exists (select 1 from public.current_observations where id = held_hb));

  -- ------------------------------- report being deleted --------------------
  perform pg_temp.act_as(null, 'service_role');
  perform public.engine_begin_document_deletion(doc, a);
  reset role;
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('a result cannot be corrected while its report is being deleted',
    format($q$select public.correct_fact('observations', %L, '{"value": "7.2"}')$q$, c2));
  reset role;

  raise notice '==============================================';
  raise notice 'ALL FACT CORRECTION CHECKS PASSED';
  raise notice '==============================================';
end
$$;

rollback;
