-- =============================================================================
-- Gate 1 test — document understanding database behaviour.
-- Runs inside a transaction that is ROLLED BACK. Success ends with
-- "ALL GATE 1 CHECKS PASSED".
--
-- Covers: server-only claim/commit/fail functions, retry rules, the
-- confidence gate (needs_review is invisible to current_* views),
-- idempotent re-processing (no duplicate current facts, user decisions
-- respected), atomic commit, assertion levels, cross-user isolation.
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

create function pg_temp.fp(seed text) returns text language sql as $$
  select encode(sha256(convert_to(seed, 'UTF8')), 'hex')
$$;

-- One observation row as server code would send it.
create function pg_temp.obs(seed text, name text, val text, conf numeric, gate text default 'unreviewed', reason text default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'fingerprint', pg_temp.fp(seed), 'page_number', 1,
    'source_text', name || ' ' || val || ' %', 'confidence', conf,
    'review_status', gate, 'review_reason', reason,
    'name_as_written', name, 'value_as_written', val, 'unit_as_written', '%',
    'effective_date', '2026-03-12', 'effective_date_basis', 'observation',
    'category', 'laboratory', 'code_system', 'LOCAL', 'code', lower(name), 'display_name', name,
    'value_numeric', val::numeric, 'value_normalized', val::numeric, 'unit_normalized', '%',
    'normalization_rule', 'identity')
$$;

create function pg_temp.result(p_obs jsonb, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql as $$
  select jsonb_build_object(
    'page_count', 1,
    'content_sha256', pg_temp.fp('original-pdf-bytes'),
    'document', jsonb_build_object('title', 'Synthetic Report', 'report_date', '2026-03-12',
                                   'document_type', 'blood_test', 'identity_check', 'match'),
    'pages', jsonb_build_array(jsonb_build_object('page_number', 1,
              'text_content', 'SYNTHETIC REPORT HbA1c 5.8 %', 'text_source', 'pdf_text_layer')),
    'observations', p_obs,
    'stats', jsonb_build_object('pages', 1))
  || p_extra
$$;

create function pg_temp.new_run(p_user uuid, p_doc uuid) returns uuid language plpgsql as $$
declare r uuid;
begin
  insert into public.extraction_runs (user_id, document_id, status, pipeline_version, model_provider, model_name, prompt_version, started_at)
  values (p_user, p_doc, 'running', 'gate1.0', 'test', 'test-model', 'v1', now()) returning id into r;
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
  doc uuid; doc2 uuid; run1 uuid; run2 uuid; run3 uuid;
  claim jsonb; counts jsonb;
  obs_low uuid; obs_hi uuid; conf_id uuid; rej_id uuid; corr_id uuid;
  status_now text;
begin
  insert into auth.users (id, email) values (a, 'g1-a@example.invalid'), (b, 'g1-b@example.invalid');

  perform pg_temp.act_as(null, 'service_role');
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'synthetic-a.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc;

  -- ------------------------------------------------------ claim rules -----
  claim := public.claim_document_processing(doc, b);
  perform pg_temp.expect_true('another user cannot claim A''s document (reported as not found)',
    claim ->> 'claimed' = 'false' and claim ->> 'reason' = 'not_found');

  claim := public.claim_document_processing(doc, a);
  perform pg_temp.expect_true('the owner can claim an uploaded document (attempt 1)',
    claim ->> 'claimed' = 'true' and (claim ->> 'attempt')::int = 1);
  perform pg_temp.expect_true('claiming moved the document to processing',
    (select status::text from public.documents where id = doc) = 'processing');

  claim := public.claim_document_processing(doc, a);
  perform pg_temp.expect_true('a second concurrent claim is refused (already processing)',
    claim ->> 'claimed' = 'false' and claim ->> 'reason' = 'already_processing');

  -- ----------------------------------------------- server-only functions --
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('the app cannot call claim_document_processing',
    format($q$select public.claim_document_processing(%L, %L)$q$, doc, a));
  perform pg_temp.expect_blocked('the app cannot call commit_document_extraction',
    format($q$select public.commit_document_extraction(%L, %L, '{}'::jsonb)$q$, doc, gen_random_uuid()));
  perform pg_temp.expect_blocked('the app cannot call fail_document_processing',
    format($q$select public.fail_document_processing(%L, null, 'x', true, 'transient', 'x')$q$, doc));
  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anonymous callers cannot call claim_document_processing',
    format($q$select public.claim_document_processing(%L, %L)$q$, doc, a));
  perform pg_temp.act_as(null, 'service_role');

  -- ------------------------------------------------- failure + retry -------
  run1 := pg_temp.new_run(a, doc);
  perform public.fail_document_processing(doc, run1, 'provider_unavailable', true, 'provider', 'We couldn''t reach the reading service. Please try again.');
  perform pg_temp.expect_true('a failure records code, retryability and a user-safe message',
    (select status::text = 'failed' and failure_code = 'provider_unavailable' and failure_retryable and processing_error is not null
       from public.documents where id = doc));
  perform pg_temp.expect_true('the failed run is recorded with its error kind',
    (select status::text = 'failed' and error_kind = 'provider' and completed_at is not null from public.extraction_runs where id = run1));

  claim := public.claim_document_processing(doc, a);
  perform pg_temp.expect_true('a retryable failure can be retried (attempt 2) and the failure is cleared',
    claim ->> 'claimed' = 'true' and (claim ->> 'attempt')::int = 2
    and (select failure_code is null and failure_retryable is null and processing_error is null from public.documents where id = doc));

  perform public.fail_document_processing(doc, null, 'scanned_pdf', false, 'unsupported', 'Scanned PDFs aren''t supported yet.');
  claim := public.claim_document_processing(doc, a);
  perform pg_temp.expect_true('an unsupported/permanent failure is NOT retried automatically',
    claim ->> 'claimed' = 'false' and claim ->> 'reason' = 'not_retryable');
  claim := public.claim_document_processing(doc, a, true);
  perform pg_temp.expect_true('an explicit reprocess request can override a permanent failure (attempt 3)',
    claim ->> 'claimed' = 'true' and (claim ->> 'attempt')::int = 3);

  -- stale lease
  update public.documents set processing_started_at = now() - interval '2 hours' where id = doc;
  claim := public.claim_document_processing(doc, a);
  perform pg_temp.expect_true('a run that died mid-way is recovered after the lease expires',
    claim ->> 'claimed' = 'true' and (claim ->> 'attempt')::int = 4);

  -- attempt cap
  perform public.fail_document_processing(doc, null, 'provider_unavailable', true, 'provider', 'Try again.');
  update public.documents set processing_attempts = 5 where id = doc;
  claim := public.claim_document_processing(doc, a);
  perform pg_temp.expect_true('attempts are capped (no endless retries)',
    claim ->> 'claimed' = 'false' and claim ->> 'reason' = 'too_many_attempts');

  -- report-person mismatch
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'other-person.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc2;
  perform public.claim_document_processing(doc2, a);
  perform public.fail_document_processing(doc2, null, 'patient_mismatch', false, 'permanent',
    'This report appears to be for a different person.', 'mismatch');
  perform pg_temp.expect_true('a report for a different person is marked mismatch and nothing is ingested',
    (select identity_check = 'mismatch' and status::text = 'failed' and failure_retryable = false from public.documents where id = doc2)
    and not exists (select 1 from public.observations where document_id = doc2));

  -- ------------------------------------------------ happy path commit -----
  update public.documents set processing_attempts = 0 where id = doc;
  perform public.claim_document_processing(doc, a, true);
  run1 := pg_temp.new_run(a, doc);
  counts := public.commit_document_extraction(doc, run1, pg_temp.result(
    jsonb_build_array(
      pg_temp.obs('hba1c-p1', 'HbA1c', '5.8', 0.95),
      pg_temp.obs('ldl-p1',   'LDL',   '120', 0.55, 'needs_review', 'low_confidence')),
    jsonb_build_object(
      'conditions', jsonb_build_array(jsonb_build_object(
        'fingerprint', pg_temp.fp('cond-fh-diabetes'), 'page_number', 1,
        'source_text', 'Family history: diabetes', 'confidence', 0.9, 'review_status', 'unreviewed', 'review_reason', null,
        'name_as_written', 'Diabetes', 'clinical_status', 'unknown', 'assertion', 'mentioned')),
      'medications', jsonb_build_array(jsonb_build_object(
        'fingerprint', pg_temp.fp('med-metformin'), 'page_number', 1,
        'source_text', 'Metformin 500 mg', 'confidence', 0.9, 'review_status', 'unreviewed', 'review_reason', null,
        'name_as_written', 'Metformin', 'strength_as_written', '500 mg', 'status', 'unknown')))));

  perform pg_temp.expect_true('commit completed the document through the existing lifecycle',
    (select status::text = 'completed' and current_extraction_run_id = run1 and page_count = 1
            and content_sha256 = pg_temp.fp('original-pdf-bytes') and document_type::text = 'blood_test'
            and identity_check = 'match' and failure_code is null
       from public.documents where id = doc));
  perform pg_temp.expect_true('every lifecycle step is in the audit history, written by the server',
    (select array_agg(to_status::text order by id) from public.document_status_history where document_id = doc and changed_by = 'service_role')
      @> array['processing', 'extracted', 'validated', 'completed']);
  perform pg_temp.expect_true('the run is marked succeeded with counts only',
    (select status::text = 'succeeded' and stats ? 'commit' from public.extraction_runs where id = run1));
  perform pg_temp.expect_true('the page text is stored for evidence',
    (select text_content like 'SYNTHETIC REPORT%' and text_source::text = 'pdf_text_layer' from public.document_pages where document_id = doc and page_number = 1));
  perform pg_temp.expect_true('facts link to document, page, run, source text and confidence',
    (select bool_and(document_id = doc and document_page_id is not null and extraction_run_id = run1 and source_text is not null and confidence is not null and fingerprint is not null)
       from public.observations where document_id = doc));
  perform pg_temp.expect_true('a "family history of diabetes" mention is stored only as mentioned, never diagnosed',
    (select assertion::text = 'mentioned' from public.conditions where document_id = doc));

  select id into obs_low from public.observations where document_id = doc and name_as_written = 'LDL';
  select id into obs_hi  from public.observations where document_id = doc and name_as_written = 'HbA1c';

  -- ------------------------------------------------- confidence gate ------
  perform pg_temp.expect_count('high-confidence fact IS in current_observations',
    format($q$select 1 from public.current_observations where id = %L$q$, obs_hi), 1);
  perform pg_temp.expect_count('low-confidence fact is NOT in current_observations (cannot feed trends / what changed / Ask)',
    format($q$select 1 from public.current_observations where id = %L$q$, obs_low), 0);
  perform pg_temp.expect_count('...but it is stored and waiting for review',
    format($q$select 1 from public.observations where id = %L and review_status = 'needs_review' and review_reason = 'low_confidence'$q$, obs_low), 1);

  perform pg_temp.expect_blocked('a needs_review fact must carry a reason',
    format($q$insert into public.observations (user_id, name_as_written, value_as_written, origin, review_status, document_id, document_page_id, extraction_run_id, source_text, confidence, fingerprint)
              select %L, 'X', '1', 'extracted', 'needs_review', document_id, document_page_id, extraction_run_id, 'X 1', 0.1, %L from public.observations where id = %L$q$,
            a, pg_temp.fp('no-reason'), obs_hi));
  perform pg_temp.expect_blocked('an extracted fact must carry a fingerprint',
    format($q$insert into public.observations (user_id, name_as_written, value_as_written, origin, document_id, document_page_id, extraction_run_id, source_text, confidence)
              select %L, 'X', '1', 'extracted', document_id, document_page_id, extraction_run_id, 'X 1', 0.9 from public.observations where id = %L$q$, a, obs_hi));
  perform pg_temp.expect_blocked('the server cannot pre-confirm an extracted fact',
    format($q$insert into public.observations (user_id, name_as_written, value_as_written, origin, review_status, document_id, document_page_id, extraction_run_id, source_text, confidence, fingerprint)
              select %L, 'X', '1', 'extracted', 'confirmed', document_id, document_page_id, extraction_run_id, 'X 1', 0.9, %L from public.observations where id = %L$q$,
            a, pg_temp.fp('preconfirmed'), obs_hi));

  perform pg_temp.act_as(a);
  perform pg_temp.expect_count('the owner can see their needs_review fact (to review it)',
    format($q$select 1 from public.observations where id = %L$q$, obs_low), 1);
  perform pg_temp.expect_blocked('the app cannot put a fact into needs_review',
    format($q$update public.observations set review_status = 'needs_review' where id = %L$q$, obs_hi));
  update public.observations set review_status = 'confirmed' where id = obs_low;
  perform pg_temp.expect_count('once the owner confirms it, the fact enters current_observations',
    format($q$select 1 from public.current_observations where id = %L$q$, obs_low), 1);
  perform pg_temp.expect_blocked('a confirmed fact cannot go back to needs_review',
    format($q$update public.observations set review_status = 'needs_review' where id = %L$q$, obs_low));
  perform pg_temp.expect_blocked('the app cannot change a fact''s source text',
    format($q$update public.observations set source_text = 'forged' where id = %L$q$, obs_low));

  perform pg_temp.act_as(b);
  perform pg_temp.expect_count('B sees none of A''s facts (including needs_review)',
    format($q$select 1 from public.observations where document_id = %L$q$, doc), 0);
  perform pg_temp.expect_count('B sees none of A''s current facts',
    format($q$select 1 from public.current_observations where user_id = %L$q$, a), 0);
  perform pg_temp.expect_count('B sees none of A''s pages',
    format($q$select 1 from public.document_pages where document_id = %L$q$, doc), 0);
  perform pg_temp.expect_count('B sees none of A''s extraction runs',
    format($q$select 1 from public.extraction_runs where document_id = %L$q$, doc), 0);

  -- ---------------------------------------- idempotent reprocessing -------
  -- State now: HbA1c current (unreviewed); LDL confirmed by the person;
  -- one condition + one medication current.
  perform pg_temp.act_as(null, 'service_role');
  claim := public.claim_document_processing(doc, a, true);
  perform pg_temp.expect_true('a completed document can be explicitly reprocessed', claim ->> 'claimed' = 'true');
  run2 := pg_temp.new_run(a, doc);
  -- The model now finds: HbA1c again (same fingerprint), LDL again (confirmed
  -- by the person), a NEW fact, but not the condition or the medication.
  counts := public.commit_document_extraction(doc, run2, pg_temp.result(
    jsonb_build_array(
      pg_temp.obs('hba1c-p1', 'HbA1c', '5.8', 0.96),
      pg_temp.obs('ldl-p1',   'LDL',   '120', 0.60, 'needs_review', 'low_confidence'),
      pg_temp.obs('hdl-p1',   'HDL',   '48',  0.93))));

  perform pg_temp.expect_count('reprocessing does not duplicate current HbA1c',
    format($q$select 1 from public.current_observations where document_id = %L and name_as_written = 'HbA1c'$q$, doc), 1);
  perform pg_temp.expect_count('the old HbA1c row is superseded, not deleted (old run stays auditable)',
    format($q$select 1 from public.observations where document_id = %L and name_as_written = 'HbA1c' and superseded_at is not null and extraction_run_id = %L$q$, doc, run1), 1);
  perform pg_temp.expect_true('the current HbA1c now comes from the newest run',
    (select extraction_run_id = run2 from public.current_observations where document_id = doc and name_as_written = 'HbA1c'));
  perform pg_temp.expect_count('a fact the person confirmed is kept as-is (not duplicated, not replaced)',
    format($q$select 1 from public.observations where document_id = %L and name_as_written = 'LDL'$q$, doc), 1);
  perform pg_temp.expect_true('...and it is still confirmed and current',
    (select review_status::text = 'confirmed' and extraction_run_id = run1 from public.current_observations where document_id = doc and name_as_written = 'LDL'));
  perform pg_temp.expect_count('a new fact in the new run is added',
    format($q$select 1 from public.current_observations where document_id = %L and name_as_written = 'HDL'$q$, doc), 1);
  perform pg_temp.expect_count('facts the new run did not find are retired from current (condition)',
    format($q$select 1 from public.current_conditions where document_id = %L$q$, doc), 0);
  perform pg_temp.expect_count('facts the new run did not find are retired from current (medication)',
    format($q$select 1 from public.current_medications where document_id = %L$q$, doc), 0);
  perform pg_temp.expect_count('retired facts are kept, marked rejected with a reason',
    format($q$select 1 from public.conditions where document_id = %L and review_status = 'rejected' and review_reason = 'reprocess_not_found'$q$, doc), 1);
  perform pg_temp.expect_true('the commit reports what it did',
    (counts -> 'observations' ->> 'inserted')::int = 2 and (counts -> 'observations' ->> 'kept')::int = 1
    and (counts -> 'observations' ->> 'superseded')::int = 1 and (counts -> 'conditions' ->> 'retired')::int = 1);
  perform pg_temp.expect_true('the document points at the newest trusted run',
    (select current_extraction_run_id = run2 and status::text = 'completed' from public.documents where id = doc));

  -- Third pass with identical content: current facts do not change identity.
  perform public.claim_document_processing(doc, a, true);
  run3 := pg_temp.new_run(a, doc);
  perform public.commit_document_extraction(doc, run3, pg_temp.result(
    jsonb_build_array(
      pg_temp.obs('hba1c-p1', 'HbA1c', '5.8', 0.96),
      pg_temp.obs('ldl-p1',   'LDL',   '120', 0.60, 'needs_review', 'low_confidence'),
      pg_temp.obs('hdl-p1',   'HDL',   '48',  0.93))));
  perform pg_temp.expect_count('after three runs there is still exactly one current fact per fingerprint',
    format($q$select 1 from public.current_observations where document_id = %L$q$, doc), 3);
  perform pg_temp.expect_count('...and no fingerprint appears twice among current facts',
    format($q$select fingerprint from public.current_observations where document_id = %L group by fingerprint having count(*) > 1$q$, doc), 0);

  -- A person's rejection and correction survive reprocessing.
  select id into rej_id from public.observations where document_id = doc and name_as_written = 'HDL' and superseded_at is null;
  perform pg_temp.act_as(a);
  update public.observations set review_status = 'rejected' where id = rej_id;
  select id into conf_id from public.observations where document_id = doc and name_as_written = 'HbA1c' and superseded_at is null;
  insert into public.observations (name_as_written, value_as_written, unit_as_written, origin, supersedes_id)
  values ('HbA1c', '5.9', '%', 'user_corrected', conf_id) returning id into corr_id;
  perform pg_temp.act_as(null, 'service_role');
  perform public.claim_document_processing(doc, a, true);
  run3 := pg_temp.new_run(a, doc);
  perform public.commit_document_extraction(doc, run3, pg_temp.result(
    jsonb_build_array(
      pg_temp.obs('hba1c-p1', 'HbA1c', '5.8', 0.96),
      pg_temp.obs('ldl-p1',   'LDL',   '120', 0.60, 'needs_review', 'low_confidence'),
      pg_temp.obs('hdl-p1',   'HDL',   '48',  0.93))));
  perform pg_temp.expect_true('the person''s correction still stands after reprocessing (HbA1c = 5.9, current)',
    (select value_as_written = '5.9' from public.current_observations where document_id = doc and name_as_written = 'HbA1c'));
  perform pg_temp.expect_count('reprocessing does not resurrect a fact the person rejected',
    format($q$select 1 from public.current_observations where document_id = %L and name_as_written = 'HDL'$q$, doc), 0);

  -- ------------------------------------------------------ atomicity ------
  perform public.claim_document_processing(doc, a, true);
  run3 := pg_temp.new_run(a, doc);
  perform pg_temp.expect_blocked('a commit that points a fact at a page that does not exist is refused',
    format($q$select public.commit_document_extraction(%L, %L, %L::jsonb)$q$, doc, run3,
      pg_temp.result(jsonb_build_array(jsonb_set(pg_temp.obs('bad-page', 'TSH', '2.1', 0.9), '{page_number}', '9'::jsonb)))::text));
  perform pg_temp.expect_true('...and nothing from that attempt was written (atomic)',
    not exists (select 1 from public.observations where document_id = doc and name_as_written = 'TSH')
    and (select status::text = 'processing' from public.documents where id = doc));
  perform pg_temp.expect_blocked('a commit for a run that is not running is refused',
    format($q$select public.commit_document_extraction(%L, %L, %L::jsonb)$q$, doc, run1, pg_temp.result('[]'::jsonb)::text));

  -- A user cannot be handed another user's document through a forged claim.
  perform public.fail_document_processing(doc, run3, 'internal_error', true, 'transient', 'Try again.');
  perform pg_temp.expect_true('a failed run leaves earlier trusted facts untouched',
    (select count(*) = 2 from public.current_observations where document_id = doc));

  raise notice '==============================================';
  raise notice 'ALL GATE 1 CHECKS PASSED';
  raise notice '==============================================';
end
$$;

rollback;
