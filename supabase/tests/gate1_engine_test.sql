-- =============================================================================
-- Gate 1 · document understanding — engine, consent, idempotency, confidence
-- gate, retry policy and isolation. Runs inside a transaction that is ROLLED
-- BACK. Success ends with "ALL GATE 1 ENGINE CHECKS PASSED".
--
-- Local: supabase/tests/local/run-local.sh   (runs after the security test)
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
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  doc uuid; doc2 uuid; doc_b uuid; run uuid; run2 uuid; run3 uuid;
  claimed record;
  result jsonb;
  hba1c_v1 uuid;
  v text := 'ai-2026-10';
begin
  insert into auth.users (id, email) values (a, 'gate1-a@example.invalid'), (b, 'gate1-b@example.invalid');

  perform pg_temp.act_as(null, 'service_role');
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'report-a.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'report-a-copy.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc2;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (b, 'report-b.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc_b;
  reset role;

  -- --------------------------------------------- engine is service-only ----
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('the app cannot claim a document for processing',
    format('select * from public.engine_claim_document(%L, %L)', doc, a));
  perform pg_temp.expect_blocked('the app cannot complete an extraction',
    format('select public.engine_complete_document(gen_random_uuid(), %L, ''{}''::jsonb)', a));
  perform pg_temp.expect_blocked('the app cannot read consent status through the engine',
    format('select public.engine_has_ai_consent(%L, %L)', a, v));
  perform pg_temp.expect_blocked('the app cannot write processing state (failure_kind)',
    format('update public.documents set failure_kind = ''transient'' where id = %L', doc));
  reset role;
  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anonymous callers cannot use the engine',
    format('select * from public.engine_claim_document(%L, %L)', doc, a));
  reset role;

  -- ------------------------------------------------------------ consent ----
  perform pg_temp.act_as(null, 'service_role');
  perform pg_temp.expect_true('no consent recorded → no AI processing', not public.engine_has_ai_consent(a, v));
  reset role;

  perform pg_temp.act_as(a);
  insert into public.consents (consent_type, policy_version, granted) values ('ai_processing', v, true);
  reset role;
  perform pg_temp.act_as(null, 'service_role');
  perform pg_temp.expect_true('one of two consents is not enough', not public.engine_has_ai_consent(a, v));
  reset role;

  perform pg_temp.act_as(a);
  insert into public.consents (consent_type, policy_version, granted) values ('health_data_processing', v, true);
  perform pg_temp.expect_blocked('a person cannot record consent for someone else',
    format($q$insert into public.consents (user_id, consent_type, policy_version, granted) values (%L, 'ai_processing', %L, true)$q$, b, v));
  perform pg_temp.expect_blocked('consent records cannot be edited',
    format($q$update public.consents set granted = false where user_id = %L$q$, a));
  reset role;
  perform pg_temp.act_as(null, 'service_role');
  perform pg_temp.expect_true('both consents at the current version → AI processing allowed', public.engine_has_ai_consent(a, v));
  perform pg_temp.expect_true('consent to an older policy version does not count', not public.engine_has_ai_consent(a, 'ai-2099-01'));
  perform pg_temp.expect_true('B has not consented', not public.engine_has_ai_consent(b, v));
  reset role;

  -- --------------------------------------------- claim & ownership ---------
  perform pg_temp.act_as(null, 'service_role');
  perform pg_temp.expect_count('claiming someone else''s document returns nothing',
    format('select * from public.engine_claim_document(%L, %L)', doc_b, a), 0);
  perform pg_temp.expect_true('B''s document is untouched',
    (select status = 'uploaded' from public.documents where id = doc_b));

  select * into claimed from public.engine_claim_document(doc, a);
  perform pg_temp.expect_true('the owner''s uploaded document is claimed (status processing, attempt 1)',
    claimed.id = doc and claimed.processing_attempts = 1
    and (select status = 'processing' from public.documents where id = doc));
  perform pg_temp.expect_count('a document already processing cannot be claimed twice',
    format('select * from public.engine_claim_document(%L, %L)', doc, a), 0);

  perform public.engine_record_original(doc, a, repeat('c', 64), 2);
  perform pg_temp.expect_blocked('a different hash for the same original is refused',
    format('select public.engine_record_original(%L, %L, %L, 2)', doc, a, repeat('d', 64)));

  run := public.engine_start_run(doc, a, 'g1.0', 'anthropic', 'claude-opus-5-5', 'p1', v);
  perform pg_temp.expect_blocked('only one running extraction per document',
    format('select public.engine_start_run(%L, %L, ''g1.0'', ''anthropic'', ''m'', ''p1'', %L)', doc, a, v));

  -- A fact citing a page that does not exist is rejected (and nothing is written).
  perform pg_temp.expect_blocked('a fact citing a non-existent page is refused',
    format($q$select public.engine_complete_document(%L, %L,
      jsonb_set(pg_temp.payload(0.95), '{observations,0,page_number}', '9'))$q$, run, a));

  -- -------------------------------------------------------- complete -------
  result := public.engine_complete_document(run, a, pg_temp.payload(0.62));
  perform pg_temp.expect_true('completion writes the facts (low-confidence HbA1c held for review)',
    (result ->> 'facts_written')::int = 4 and (result ->> 'facts_needs_review')::int = 1);
  perform pg_temp.expect_true('document is completed with report date and identity result',
    (select status = 'completed' and report_date = '2026-03-12' and identity_check = 'consistent'
       from public.documents where id = doc));
  perform pg_temp.expect_count('lifecycle is fully audited: processing → extracted → validated → completed',
    format($q$select 1 from public.document_status_history where document_id = %L
               and to_status in ('processing', 'extracted', 'validated', 'completed')$q$, doc), 4);
  perform pg_temp.expect_true('run succeeded with counts',
    (select status = 'succeeded' and facts_written = 4 and facts_needs_review = 1 and facts_discarded = 1
            and consent_version = v from public.extraction_runs where id = run));
  perform pg_temp.expect_count('both pages stored with their text', format(
    'select 1 from public.document_pages where document_id = %L and text_content is not null', doc), 2);
  perform pg_temp.expect_true('every fact carries document, page, run, source text and confidence',
    not exists (select 1 from public.observations o where o.document_id = doc
                 and (o.document_page_id is null or o.extraction_run_id is null or o.source_text is null or o.confidence is null)));
  perform pg_temp.expect_true('a family-history mention is stored as mentioned, not diagnosed',
    (select assertion = 'mentioned' from public.conditions where document_id = doc));
  reset role;

  -- --------------------------------------- confidence gate (owner view) ----
  perform pg_temp.act_as(a);
  perform pg_temp.expect_count('low-confidence HbA1c is NOT a current observation (cannot feed trends)',
    $q$select 1 from public.current_observations where name_as_written = 'HbA1c'$q$, 0);
  perform pg_temp.expect_count('high-confidence LDL is a current observation',
    $q$select 1 from public.current_observations where name_as_written = 'LDL Cholesterol'$q$, 1);
  select id into hba1c_v1 from public.observations where name_as_written = 'HbA1c' and document_id = doc;
  update public.observations set review_status = 'confirmed' where id = hba1c_v1;
  perform pg_temp.expect_count('once the person confirms it, HbA1c becomes current',
    $q$select 1 from public.current_observations where name_as_written = 'HbA1c'$q$, 1);
  perform pg_temp.expect_blocked('the person cannot lower the confidence gate themselves',
    format($q$update public.observations set confidence_gate = 'passed' where id = %L$q$, hba1c_v1));
  reset role;

  -- --------------------------------------------- idempotent reprocess ------
  perform pg_temp.act_as(null, 'service_role');
  select * into claimed from public.engine_claim_document(doc, a, false);
  perform pg_temp.expect_true('a completed document is not reclaimed without an explicit reprocess', claimed.id is null);
  select * into claimed from public.engine_claim_document(doc, a, true);
  perform pg_temp.expect_true('explicit reprocess claims the completed document', claimed.id = doc);
  run2 := public.engine_start_run(doc, a, 'g1.0', 'anthropic', 'claude-opus-5-5', 'p1', v);
  result := public.engine_complete_document(run2, a, pg_temp.payload(0.95));
  perform pg_temp.expect_count('reprocessing does not duplicate current observations',
    format('select 1 from public.current_observations where document_id = %L', doc), 2);
  perform pg_temp.expect_true('the person''s confirmed HbA1c survives reprocessing (not replaced by the new run)',
    (select superseded_at is null and review_status = 'confirmed' from public.observations where id = hba1c_v1));
  perform pg_temp.expect_count('earlier run''s unreviewed facts are superseded, not deleted (auditable)',
    format('select 1 from public.observations where document_id = %L and extraction_run_id = %L and superseded_at is not null', doc, run), 1);
  perform pg_temp.expect_count('both extraction runs are kept', format('select 1 from public.extraction_runs where document_id = %L', doc), 2);
  perform pg_temp.expect_true('the reprocess reports the skipped duplicate',
    (result ->> 'facts_duplicate')::int = 1);

  -- --------------------------------------------- duplicate upload ----------
  perform public.engine_claim_document(doc2, a);
  run3 := public.engine_start_run(doc2, a, 'g1.0', 'anthropic', 'claude-opus-5-5', 'p1', v);
  -- This copy arrived as a scan: its pages are a transcription (text_source 'ocr').
  result := public.engine_complete_document(run3, a, jsonb_set(pg_temp.payload(0.95), '{pages}',
    (select jsonb_agg(p || '{"text_source": "ocr"}'::jsonb) from jsonb_array_elements(pg_temp.payload(0.95) -> 'pages') p)));
  perform pg_temp.expect_count('a text PDF''s pages are recorded as from its text layer', format(
    $q$select 1 from public.document_pages where document_id = %L and text_source = 'pdf_text_layer'$q$, doc), 2);
  perform pg_temp.expect_count('a scan''s pages are recorded as transcribed (ocr)', format(
    $q$select 1 from public.document_pages where document_id = %L and text_source = 'ocr'$q$, doc2), 2);
  perform pg_temp.expect_true('the same report uploaded twice adds no duplicate current facts',
    (result ->> 'facts_written')::int = 0 and (result ->> 'facts_duplicate')::int = 4);
  perform pg_temp.expect_count('still exactly two current observations for A',
    'select 1 from public.current_observations where user_id = ' || quote_literal(a), 2);

  -- ------------------------------------------------ retry policy -----------
  perform public.engine_claim_document(doc_b, b);
  perform public.engine_fail_document(doc_b, b, null, 'unsupported', 'scanned_pdf', 'Scanned PDFs aren''t supported yet.');
  perform pg_temp.expect_count('an unsupported (scanned) document is not retried',
    format('select * from public.engine_claim_document(%L, %L)', doc_b, b), 0);
  update public.documents set status = 'processing' where id = doc_b; -- (failed → processing is a legal step; simulate a new attempt)
  perform public.engine_fail_document(doc_b, b, null, 'transient', 'network', 'Couldn''t read this report yet.');
  perform pg_temp.expect_count('a transient failure can be retried', format('select * from public.engine_claim_document(%L, %L)', doc_b, b), 1);
  perform public.engine_fail_document(doc_b, b, null, 'validation', 'invalid_output', 'Couldn''t read this report yet.');
  -- Two attempts used so far: with a limit of 2 the next retry is refused.
  perform pg_temp.expect_count('…until the attempt limit is reached',
    format('select * from public.engine_claim_document(%L, %L, false, 2)', doc_b, b), 0);
  perform pg_temp.expect_true('the failure is recorded with a user-safe message',
    (select status = 'failed' and failure_kind = 'validation' and processing_error = 'Couldn''t read this report yet.'
       from public.documents where id = doc_b));
  update public.documents set status = 'processing' where id = doc_b;
  perform public.engine_fail_document(doc_b, b, null, 'identity_mismatch', 'identity_mismatch',
    'This report may belong to someone else.', 'identity_mismatch', 'mismatch');
  perform pg_temp.expect_true('a wrong-person report is failed, flagged for review, and not retried',
    (select failure_kind = 'identity_mismatch' and review_reason = 'identity_mismatch' and identity_check = 'mismatch'
       from public.documents where id = doc_b)
    and not exists (select 1 from public.engine_claim_document(doc_b, b)));
  perform pg_temp.expect_count('no health facts were written for the wrong-person report',
    format('select 1 from public.observations where document_id = %L', doc_b), 0);
  reset role;

  -- ------------------------------------------------ cross-user isolation ---
  -- Positive control: A does see its own trusted records through the views.
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('A sees its own current conditions and allergies',
    exists (select 1 from public.current_conditions) and exists (select 1 from public.current_allergies));
  reset role;
  perform pg_temp.act_as(b);
  perform pg_temp.expect_count('B cannot see A''s observations', 'select 1 from public.observations', 0);
  perform pg_temp.expect_count('B cannot see A''s current observations', 'select 1 from public.current_observations', 0);
  perform pg_temp.expect_count('B cannot see A''s pages', format('select 1 from public.document_pages where document_id = %L', doc), 0);
  perform pg_temp.expect_count('B cannot see A''s extraction runs', format('select 1 from public.extraction_runs where document_id = %L', doc), 0);
  perform pg_temp.expect_count('B cannot see A''s consents', 'select 1 from public.consents', 0);
  -- Gates 2–3 read only these, as the caller: every one must be isolated.
  perform pg_temp.expect_count('B cannot see A''s documents (names, report dates)', format('select 1 from public.documents where id = %L', doc), 0);
  perform pg_temp.expect_count('B cannot see A''s current conditions', 'select 1 from public.current_conditions', 0);
  perform pg_temp.expect_count('B cannot see A''s current medications', 'select 1 from public.current_medications', 0);
  perform pg_temp.expect_count('B cannot see A''s current allergies', 'select 1 from public.current_allergies', 0);
  perform pg_temp.expect_count('B cannot see A''s current procedures', 'select 1 from public.current_procedures', 0);
  perform pg_temp.expect_count('B cannot see A''s current encounters', 'select 1 from public.current_encounters', 0);
  perform pg_temp.expect_count('B cannot see A''s current consents', 'select 1 from public.current_consents', 0);
  perform pg_temp.expect_blocked('B cannot confirm A''s fact',
    format($q$update public.observations set review_status = 'confirmed' where document_id = %L$q$, doc));
  reset role;

  raise notice '==============================================';
  raise notice 'ALL GATE 1 ENGINE CHECKS PASSED';
  raise notice '==============================================';
end
$$;

rollback;
