-- =============================================================================
-- Phase B · document deletion + source integrity. Runs inside a transaction
-- that is ROLLED BACK. Success ends with "ALL DOCUMENT DELETION CHECKS PASSED".
--
-- Synthetic users and fictional values only. Storage-object removal happens in
-- the delete-document Edge Function (Storage API) and is tested there.
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

create function pg_temp.obs(page integer, fp text, name text, value text) returns jsonb
language sql as $$
  select jsonb_build_object('page_number', page, 'source_text', name || ' ' || value, 'confidence', 0.95,
    'confidence_gate', 'passed', 'fact_fingerprint', fp, 'name_as_written', name, 'value_as_written', value,
    'effective_date', '2026-03-12', 'category', 'laboratory', 'value_numeric', value::numeric, 'interpretation_version', 'n1')
$$;

create function pg_temp.payload(observations jsonb) returns jsonb
language sql as $$
  select jsonb_build_object('report_date', '2026-03-12', 'identity_check', 'consistent', 'text_layer', 'present',
    'chunk_count', 1, 'facts_discarded', 0,
    'pages', jsonb_build_array(jsonb_build_object('page_number', 1, 'text', 'fictional synthetic report text')),
    'observations', observations)
$$;

-- Claim → run → complete, as the process-document function does.
create function pg_temp.read_doc(p_doc uuid, p_user uuid, p_payload jsonb, p_reprocess boolean default false) returns jsonb
language plpgsql as $$
declare
  run uuid;
begin
  perform public.engine_claim_document(p_doc, p_user, p_reprocess);
  run := public.engine_start_run(p_doc, p_user, 'g1.1', 'anthropic', 'model', 'p1', 'ai-2026-10');
  return public.engine_complete_document(run, p_user, p_payload);
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
  doc1 uuid; doc2 uuid; doc3 uuid; doc_busy uuid; doc_stale uuid; doc_b uuid;
  fp_shared text := repeat('a', 64);
  fp_only1 text := repeat('b', 64);
  fp_only2 text := repeat('c', 64);
  x_id uuid; x_new uuid; x_reprocessed uuid;
  r jsonb;
  b_facts_before bigint;
begin
  insert into auth.users (id, email) values (a, 'delete-a@example.invalid'), (b, 'delete-b@example.invalid');

  perform pg_temp.act_as(a);
  insert into public.consents (consent_type, policy_version, granted) values ('ai_processing', 'ai-2026-10', true), ('health_data_processing', 'ai-2026-10', true);
  reset role;
  perform pg_temp.act_as(b);
  insert into public.consents (consent_type, policy_version, granted) values ('ai_processing', 'ai-2026-10', true), ('health_data_processing', 'ai-2026-10', true);
  reset role;

  perform pg_temp.act_as(null, 'service_role');
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'first.pdf', 'application/pdf', 100, 'uploaded', now()) returning id into doc1;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'second.pdf', 'application/pdf', 100, 'uploaded', now()) returning id into doc2;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'third.pdf', 'application/pdf', 100, 'uploaded', now()) returning id into doc3;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'busy.pdf', 'application/pdf', 100, 'uploaded', now()) returning id into doc_busy;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'stale.pdf', 'application/pdf', 100, 'uploaded', now()) returning id into doc_stale;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (b, 'b.pdf', 'application/pdf', 100, 'uploaded', now()) returning id into doc_b;

  -- doc1: shared fact X + a fact only it supports. doc2: X again (a duplicate) + its own fact.
  perform pg_temp.read_doc(doc1, a, pg_temp.payload(jsonb_build_array(pg_temp.obs(1, fp_shared, 'Test X', '5.8'), pg_temp.obs(1, fp_only1, 'Test Y', '120'))));
  r := pg_temp.read_doc(doc2, a, pg_temp.payload(jsonb_build_array(pg_temp.obs(1, fp_shared, 'Test X', '5.8'), pg_temp.obs(1, fp_only2, 'Test Z', '42'))));
  perform pg_temp.read_doc(doc_b, b, pg_temp.payload(jsonb_build_array(pg_temp.obs(1, fp_shared, 'Test X', '5.8'))));
  select id into x_id from public.observations where document_id = doc1 and fact_fingerprint = fp_shared;

  -- ------------------------------------------------------- source recording
  perform pg_temp.expect_true('a duplicate from another document is not stored twice',
    (r ->> 'facts_duplicate')::int = 1
    and (select count(*) from public.observations where user_id = a and fact_fingerprint = fp_shared and superseded_at is null) = 1);
  perform pg_temp.expect_true('…but that document is recorded as an additional source of the fact (page, run, quote, gate)',
    exists (select 1 from public.fact_sources where fact_table = 'observations' and fact_id = x_id and document_id = doc2
             and document_page_id is not null and extraction_run_id is not null and source_text is not null and confidence_gate = 'passed'));
  perform pg_temp.expect_true('another person''s identical fact is never a source of this person''s fact',
    not exists (select 1 from public.fact_sources where fact_id = x_id and document_id = doc_b));

  -- Reprocessing doc1 replaces its unreviewed facts; doc2's support follows the new row.
  perform pg_temp.read_doc(doc1, a, pg_temp.payload(jsonb_build_array(pg_temp.obs(1, fp_shared, 'Test X', '5.8'), pg_temp.obs(1, fp_only1, 'Test Y', '120'))), true);
  select id into x_reprocessed from public.observations where document_id = doc1 and fact_fingerprint = fp_shared and superseded_at is null;
  perform pg_temp.expect_true('after reprocessing, the additional source points at the new live fact',
    x_reprocessed <> x_id
    and exists (select 1 from public.fact_sources where fact_id = x_reprocessed and document_id = doc2)
    and not exists (select 1 from public.fact_sources where fact_id = x_id));
  x_id := x_reprocessed;
  reset role;

  -- ------------------------------------------------- app & anon are refused
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('the app cannot start a deletion directly',
    format('select public.engine_begin_document_deletion(%L, %L)', doc1, a));
  perform pg_temp.expect_blocked('the app cannot run a deletion directly',
    format('select public.engine_delete_document(%L, %L)', doc1, a));
  perform pg_temp.expect_blocked('the app cannot move a document to deleting',
    format($q$update public.documents set status = 'deleting' where id = %L$q$, doc1));
  perform pg_temp.expect_blocked('the app cannot delete a read document row itself (RLS: abandoned uploads only)',
    format('delete from public.documents where id = %L', doc1));
  perform pg_temp.expect_blocked('the app cannot write fact sources',
    format($q$insert into public.fact_sources (user_id, fact_table, fact_id, document_id, document_page_id, extraction_run_id, source_text, confidence, confidence_gate)
              select user_id, fact_table, gen_random_uuid(), document_id, document_page_id, extraction_run_id, source_text, confidence, confidence_gate
                from public.fact_sources limit 1$q$));
  perform pg_temp.expect_blocked('the app cannot remove fact sources',
    format('delete from public.fact_sources where document_id = %L', doc2));
  perform pg_temp.expect_blocked('the app cannot delete extracted facts',
    format('delete from public.observations where document_id = %L', doc1));
  perform pg_temp.expect_true('A sees their own fact sources', (select count(*) from public.fact_sources) = 1);
  reset role;
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('B cannot see A''s fact sources', (select count(*) from public.fact_sources) = 0);
  reset role;
  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anonymous callers cannot start a deletion',
    format('select public.engine_begin_document_deletion(%L, %L)', doc1, a));
  perform pg_temp.expect_blocked('anonymous callers cannot run a deletion',
    format('select public.engine_delete_document(%L, %L)', doc1, a));
  reset role;

  -- ------------------------------------------------------- cross-person
  perform pg_temp.act_as(null, 'service_role');
  select count(*) into b_facts_before from public.observations where user_id = b;
  perform pg_temp.expect_true('A cannot start deleting B''s document (looks not found)',
    public.engine_begin_document_deletion(doc_b, a) ->> 'status' = 'not_found');
  perform pg_temp.expect_blocked('A cannot run a deletion of B''s document',
    format('select public.engine_delete_document(%L, %L)', doc_b, a));
  perform pg_temp.expect_true('B''s document, pages and facts are untouched',
    (select status = 'completed' from public.documents where id = doc_b)
    and (select count(*) from public.observations where user_id = b) = b_facts_before
    and exists (select 1 from public.document_pages where document_id = doc_b));

  -- ------------------------------------------------------- lifecycle guards
  perform pg_temp.expect_blocked('a deletion can''t run before it was started',
    format('select public.engine_delete_document(%L, %L)', doc1, a));
  perform public.engine_claim_document(doc_busy, a);
  perform pg_temp.expect_true('a document being read right now is busy, and stays as it is',
    public.engine_begin_document_deletion(doc_busy, a) ->> 'status' = 'busy'
    and (select status = 'processing' from public.documents where id = doc_busy));
  perform public.engine_claim_document(doc_stale, a);
  perform public.engine_start_run(doc_stale, a, 'g1.1', 'anthropic', 'model', 'p1', 'ai-2026-10');
  update public.documents set processing_started_at = now() - interval '1 hour' where id = doc_stale;
  r := public.engine_begin_document_deletion(doc_stale, a);
  perform pg_temp.expect_true('a stale (crashed) read can be deleted; its run is closed',
    r ->> 'status' = 'deleting'
    and not exists (select 1 from public.extraction_runs where document_id = doc_stale and status = 'running'));

  -- -------------------------------------------------- delete doc1 (shared)
  r := public.engine_begin_document_deletion(doc1, a);
  perform pg_temp.expect_true('starting a deletion marks the document deleting and returns the server-recorded path',
    r ->> 'status' = 'deleting'
    and r ->> 'storage_path' = (select storage_path from public.documents where id = doc1)
    and r ->> 'storage_path' = a::text || '/documents/' || doc1::text || '/original.pdf'
    and (select status = 'deleting' from public.documents where id = doc1));
  r := public.engine_begin_document_deletion(doc1, a);
  perform pg_temp.expect_true('starting again is safe (same answer, no second audit row)',
    r ->> 'status' = 'deleting'
    and (select count(*) from public.audit_logs where entity_id = doc1 and action = 'document.deletion_started') = 1);
  perform pg_temp.expect_true('a document being deleted can''t be claimed for reading',
    not exists (select 1 from public.engine_claim_document(doc1, a, true)));

  r := public.engine_delete_document(doc1, a);
  perform pg_temp.expect_true('deletion reports one fact removed and one kept',
    r ->> 'status' = 'deleted' and (r ->> 'facts_removed')::int = 1 and (r ->> 'facts_kept')::int = 1);
  perform pg_temp.expect_true('the document row, its pages, runs and status history are gone',
    not exists (select 1 from public.documents where id = doc1)
    and not exists (select 1 from public.document_pages where document_id = doc1)
    and not exists (select 1 from public.extraction_runs where document_id = doc1)
    and not exists (select 1 from public.document_status_history where document_id = doc1));
  perform pg_temp.expect_true('no fact still points at the deleted document',
    not exists (select 1 from public.observations where document_id = doc1)
    and not exists (select 1 from public.fact_sources where document_id = doc1));
  select id into x_new from public.observations where user_id = a and fact_fingerprint = fp_shared and superseded_at is null;
  perform pg_temp.expect_true('the fact still supported by doc2 survives, now evidenced by doc2',
    x_new is not null
    and (select document_id = doc2 and value_as_written = '5.8' and source_text is not null and document_page_id is not null
           from public.observations where id = x_new));
  perform pg_temp.expect_true('…and doc2 is now its primary source (no leftover source row)',
    not exists (select 1 from public.fact_sources where fact_id in (x_id, x_new)));
  perform pg_temp.expect_true('the fact only doc1 supported is gone',
    not exists (select 1 from public.observations where user_id = a and fact_fingerprint = fp_only1));
  perform pg_temp.expect_true('doc2''s own fact is untouched',
    exists (select 1 from public.observations where document_id = doc2 and fact_fingerprint = fp_only2 and superseded_at is null));
  perform pg_temp.expect_true('the deletion audit holds ids and counts only',
    (select details = jsonb_build_object('facts_removed', 1, 'facts_kept', 1) and entity_table = 'documents' and actor = 'service'
       from public.audit_logs where entity_id = doc1 and action = 'document.deleted'));
  perform pg_temp.expect_true('no audit row for this deletion mentions a value, name or quote',
    not exists (select 1 from public.audit_logs where entity_id = doc1 and details::text ~* '(5\.8|Test X|Test Y|fictional|first\.pdf)'));
  perform pg_temp.expect_true('deleting again is safe: reported as already deleted',
    public.engine_begin_document_deletion(doc1, a) ->> 'status' = 'deleted');
  perform pg_temp.expect_true('B''s identical fact is untouched by A''s deletion',
    exists (select 1 from public.observations where user_id = b and fact_fingerprint = fp_shared and superseded_at is null));
  reset role;

  -- Health Memory (the person's own view) reflects it.
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('the deleted document is gone from the person''s documents',
    not exists (select 1 from public.documents where id = doc1));
  perform pg_temp.expect_true('current observations: X and Z remain, Y is gone',
    (select count(*) from public.current_observations where name_as_written in ('Test X', 'Test Z')) = 2
    and not exists (select 1 from public.current_observations where name_as_written = 'Test Y'));
  reset role;

  -- -------------------------------------------- delete doc2 (now sole source)
  perform pg_temp.act_as(null, 'service_role');
  perform public.engine_begin_document_deletion(doc2, a);
  r := public.engine_delete_document(doc2, a);
  perform pg_temp.expect_true('deleting the last source removes the fact',
    (r ->> 'facts_removed')::int = 2 and (r ->> 'facts_kept')::int = 0
    and not exists (select 1 from public.observations where user_id = a and superseded_at is null and fact_fingerprint in (fp_shared, fp_only2)));
  perform pg_temp.expect_true('an untouched document of the same person stays as it was',
    (select status = 'uploaded' from public.documents where id = doc3));
  reset role;

  raise notice '==============================================';
  raise notice 'ALL DOCUMENT DELETION CHECKS PASSED';
  raise notice '==============================================';
end
$$;

rollback;
