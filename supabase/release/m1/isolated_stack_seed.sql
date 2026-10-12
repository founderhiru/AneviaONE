-- Reproduces the isolated production-like dataset used for the M1 migration review.
-- LOCAL ISOLATED STACK ONLY (see README.md). Never run against production.
-- ISOLATED production-like stack only (port 56322). Synthetic data.
\set ON_ERROR_STOP on
create or replace function pg_temp.payload(u int, d int, held boolean, identity text) returns jsonb language sql as $f$
  select jsonb_build_object(
    'report_date', (date '2025-01-01' + (d * 17)), 'identity_check', identity, 'text_layer', 'present', 'chunk_count', 1, 'facts_discarded', 0,
    'pages', jsonb_build_array(jsonb_build_object('page_number', 1, 'text', 'synthetic page ' || u || '-' || d)),
    'observations', (select jsonb_agg(jsonb_build_object(
        'page_number', 1, 'source_text', t.name || ' ' || (t.base + d * 0.1)::text, 'confidence', case when held and t.i = 1 then 0.6 else 0.95 end,
        'confidence_gate', case when (held and t.i = 1) or identity <> 'consistent' then 'needs_review' else 'passed' end,
        'fact_fingerprint', md5(u || ':' || d || ':' || t.name) || md5('obs' || u || ':' || d || ':' || t.name),
        'name_as_written', t.name, 'value_as_written', (t.base + d * 0.1)::text, 'unit_as_written', t.unit,
        'reference_range_as_written', t.rng, 'effective_date', (date '2025-01-01' + (d * 17)), 'category', 'laboratory',
        'value_numeric', t.base + d * 0.1, 'interpretation_version', 'seed'))
      from (values (1, 'HbA1c', 5.4, '%', '4.0-5.6'), (2, 'LDL Cholesterol', 110, 'mg/dL', '< 100'), (3, 'Haemoglobin', 13.0, 'g/dL', '12.0-15.0'),
                   (4, 'Vitamin D', 22, 'ng/mL', '30-100'), (5, 'TSH', 2.1, 'mIU/L', '0.4-4.0'), (6, 'Creatinine', 0.9, 'mg/dL', '0.6-1.2'),
                   (7, 'Glucose', 98, 'mg/dL', '70-99'), (8, 'Ferritin', 45, 'ng/mL', '15-150')) t(i, name, base, unit, rng)),
    'conditions', jsonb_build_array(jsonb_build_object('page_number', 1, 'source_text', 'History of hypertension', 'confidence', 0.9, 'confidence_gate', 'passed',
        'fact_fingerprint', md5('c' || u || ':' || d) || md5('cond' || u || ':' || d), 'name_as_written', 'Hypertension', 'assertion', 'mentioned')),
    'medications', jsonb_build_array(jsonb_build_object('page_number', 1, 'source_text', 'Metformin 500 mg', 'confidence', 0.92, 'confidence_gate', 'passed',
        'fact_fingerprint', md5('m' || u || ':' || d) || md5('med' || u || ':' || d), 'name_as_written', 'Metformin', 'dose_as_written', '500 mg')))
$f$;

do $$
declare
  u int; d int; uid uuid; doc uuid; run uuid; c record; ident text;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  for u in 1..60 loop
    uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pl-user-' || u || '@example.invalid', '', now(), now(), now(), '{}', '{}');
    insert into public.consents (user_id, consent_type, policy_version, granted) values (uid, 'ai_processing', 'ai-2026-10', true), (uid, 'health_data_processing', 'ai-2026-10', true);
    for d in 1..12 loop
      ident := case when d = 12 then 'unverifiable' when d = 11 then 'no_identifiers' else 'consistent' end;
      insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
      values (uid, 'pl-report-' || d || '.pdf', 'application/pdf', 100000 + d, 'uploaded', now()) returning id into doc;
      select * into c from public.engine_claim_document(doc, uid);
      perform public.engine_record_original(doc, uid, md5('sha' || u || ':' || d) || md5('sha2' || u || ':' || d), 1);
      run := public.engine_start_run(doc, uid, 'g1.1', 'synthetic', 'seed', 'seed', 'ai-2026-10');
      perform public.engine_complete_document(run, uid, pg_temp.payload(u, d, d % 3 = 0, ident));
      -- Every 4th report is read again (supersedes its unreviewed facts).
      if d % 4 = 0 then
        select * into c from public.engine_claim_document(doc, uid, true);
        run := public.engine_start_run(doc, uid, 'g1.1', 'synthetic', 'seed', 'seed', 'ai-2026-10');
        perform public.engine_complete_document(run, uid, pg_temp.payload(u, d, d % 3 = 0, ident) || jsonb_build_object('observations',
          jsonb_build_array(jsonb_build_object('page_number', 1, 'source_text', 'Urea 30', 'confidence', 0.9, 'confidence_gate', 'passed',
            'fact_fingerprint', md5('r' || u || ':' || d) || md5('reread' || u || ':' || d), 'name_as_written', 'Urea', 'value_as_written', '30',
            'unit_as_written', 'mg/dL', 'effective_date', date '2025-01-01' + (d * 17), 'category', 'laboratory', 'value_numeric', 30))));
      end if;
    end loop;
    -- A duplicate upload of report 2 → fact_sources rows (second source for live facts).
    insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
    values (uid, 'pl-report-2-copy.pdf', 'application/pdf', 100002, 'uploaded', now()) returning id into doc;
    select * into c from public.engine_claim_document(doc, uid);
    perform public.engine_record_original(doc, uid, md5('dup' || u) || md5('dup2' || u), 1);
    run := public.engine_start_run(doc, uid, 'g1.1', 'synthetic', 'seed', 'seed', 'ai-2026-10');
    perform public.engine_complete_document(run, uid, pg_temp.payload(u, 2, false, 'consistent'));
  end loop;
  -- Some people confirmed held results (app-style review), done as each owner.
  perform set_config('hi.fact_supersede', 'off', true);
end $$;

do $$
declare r record;
begin
  for r in select id, user_id from public.observations where confidence_gate = 'needs_review' and superseded_at is null
            and document_id in (select id from public.documents where identity_check = 'consistent') and random() < 0.4 loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.observations set review_status = 'confirmed' where id = r.id;
    reset role;
  end loop;
end $$;

select 'users' k, count(*) from auth.users union all
select 'documents', count(*) from public.documents union all
select 'observations', count(*) from public.observations union all
select 'observations live', count(*) from public.observations where superseded_at is null union all
select 'observations superseded', count(*) from public.observations where superseded_at is not null union all
select 'observations held (unconfirmed)', count(*) from public.observations where confidence_gate='needs_review' and review_status<>'confirmed' and superseded_at is null union all
select 'observations confirmed after hold', count(*) from public.observations where confidence_gate='needs_review' and review_status='confirmed' union all
select 'conditions', count(*) from public.conditions union all
select 'medications', count(*) from public.medications union all
select 'fact_sources', count(*) from public.fact_sources union all
select 'audit_logs', count(*) from public.audit_logs;
