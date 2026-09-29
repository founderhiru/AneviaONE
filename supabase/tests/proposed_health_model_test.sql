-- =============================================================================
-- Integrity + isolation test for the PROPOSED health data model
-- (supabase/migrations_proposed). Runs entirely inside a transaction that is
-- ROLLED BACK. Success ends with "ALL HEALTH MODEL CHECKS PASSED".
--
-- Local: supabase/tests/local/run-local.sh --with-proposed
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
  doc uuid; run uuid; page uuid; enc uuid; obs uuid; corr uuid; ins uuid; mine uuid;
  fact_tables text[] := array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies'];
  own_tables  text[] := array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies',
                              'document_pages', 'extraction_runs', 'health_events', 'insights', 'insight_sources'];
  t text;
  storage_writes boolean := coalesce(current_setting('hi_test.storage_writes', true), 'off') = 'on';
  evidence text;
begin
  insert into auth.users (id, email) values (a, 'model-test-a@example.invalid'), (b, 'model-test-b@example.invalid');

  -- ------------------------------------------- server extracts A's report ---
  perform pg_temp.act_as(null, 'service_role');

  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'lipid.pdf', 'application/pdf', 1000, 'uploaded', now()) returning id into doc;
  insert into public.extraction_runs (user_id, document_id, status, pipeline_version, model_provider, model_name, prompt_version)
  values (a, doc, 'succeeded', 'p2.0', 'test', 'test-model', 'v1') returning id into run;
  insert into public.document_pages (user_id, document_id, page_number, text_content, text_source, extraction_run_id)
  values (a, doc, 1, 'HbA1c 6.5 %', 'pdf_text_layer', run) returning id into page;

  evidence := format('%L, %L, %L, %L, %L, 0.93', 'extracted', doc, page, run, 'HbA1c 6.5 %');
  execute format('insert into public.encounters (user_id, encounter_type, encounter_date, origin, document_id, document_page_id, extraction_run_id, source_text, confidence)
                  values (%L, ''lab_test'', ''2026-08-12'', %s) returning id', a, evidence) into enc;
  execute format('insert into public.observations (user_id, encounter_id, name_as_written, value_as_written, unit_as_written, effective_date, origin, document_id, document_page_id, extraction_run_id, source_text, confidence)
                  values (%L, %L, ''HbA1c'', ''6.5'', ''%%'', ''2026-08-12'', %s) returning id', a, enc, evidence) into obs;
  execute format('insert into public.conditions (user_id, name_as_written, origin, document_id, document_page_id, extraction_run_id, source_text, confidence) values (%L, ''Prediabetes'', %s)', a, evidence);
  execute format('insert into public.medications (user_id, name_as_written, origin, document_id, document_page_id, extraction_run_id, source_text, confidence) values (%L, ''Metformin 500 mg'', %s)', a, evidence);
  execute format('insert into public.procedures (user_id, name_as_written, origin, document_id, document_page_id, extraction_run_id, source_text, confidence) values (%L, ''Venepuncture'', %s)', a, evidence);
  execute format('insert into public.allergies (user_id, substance_as_written, origin, document_id, document_page_id, extraction_run_id, source_text, confidence) values (%L, ''Penicillin'', %s)', a, evidence);

  insert into public.health_events (user_id, event_type, event_date, title, document_id, encounter_id, derivation_version)
  values (a, 'blood_test', '2026-08-12', 'Blood test', doc, enc, 'd1');

  insert into public.insights (user_id, insight_type, subject_display, title, body_text, current_value_text, generated_by, generator_version)
  values (a, 'value_change', 'HbA1c', 'HbA1c changed', 'Your HbA1c was 6.5 % on 12 Aug 2026.', '6.5', 'rules', 'r1') returning id into ins;
  insert into public.insight_sources (user_id, insight_id, role, observation_id) values (a, ins, 'current', obs);
  set constraints all immediate;
  raise notice 'PASS  server can record extracted facts with full evidence, a timeline event and a grounded insight';
  set constraints all deferred;

  perform pg_temp.expect_blocked('extracted facts without page/confidence/source text are rejected',
    format($q$insert into public.observations (user_id, name_as_written, value_as_written, origin, document_id, extraction_run_id)
              values (%L, 'LDL', '120', 'extracted', %L, %L)$q$, a, doc, run));
  perform pg_temp.expect_blocked('a timeline event must point to a document or encounter',
    format($q$insert into public.health_events (user_id, event_type, event_date, title, derivation_version)
              values (%L, 'other', '2026-01-01', 'Orphan', 'd1')$q$, a));
  perform pg_temp.expect_blocked('an AI insight must name its model',
    format($q$insert into public.insights (user_id, insight_type, subject_display, title, body_text, generated_by, generator_version)
              values (%L, 'trend_summary', 'LDL', 't', 'b', 'ai', 'g1')$q$, a));

  begin
    insert into public.insights (user_id, insight_type, subject_display, title, body_text, generated_by, generator_version)
    values (a, 'trend_summary', 'LDL', 'Ungrounded', 'No evidence', 'rules', 'r1');
    set constraints all immediate;
    raise exception 'FAIL  an insight without sources was accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS  an insight with no evidence cannot be saved  (refused: %)', sqlerrm;
  end;
  set constraints all deferred;

  perform pg_temp.expect_blocked('even the server cannot change what the document said (value_as_written)',
    format($q$update public.observations set value_as_written = '5.9' where id = %L$q$, obs));
  perform pg_temp.expect_blocked('even the server cannot move a fact to another document/page',
    format($q$update public.observations set document_page_id = null where id = %L$q$, obs));
  update public.observations set code_system = 'LOINC', code = '4548-4', display_name = 'Hemoglobin A1c', value_numeric = 6.5 where id = obs;
  perform pg_temp.expect_count('the server can refine interpretation (code/normalisation) and it is audited',
    format($q$select 1 from public.audit_logs where entity_id = %L and action = 'fact.reinterpreted'$q$, obs), 1);
  update public.documents set content_sha256 = repeat('a', 64), page_count = 1 where id = doc;
  perform pg_temp.expect_blocked('a stored document hash is write-once',
    format($q$update public.documents set content_sha256 = repeat('b', 64) where id = %L$q$, doc));

  reset role;

  -- ------------------------------------------------------------- user A ------
  perform pg_temp.act_as(a);

  foreach t in array own_tables loop
    perform pg_temp.expect_count(format('A can read their own %s', t), format('select 1 from public.%I', t), 1);
  end loop;

  perform pg_temp.expect_blocked('A cannot record an "extracted" (AI) fact',
    format($q$insert into public.observations (name_as_written, value_as_written, origin, document_id, document_page_id, source_text)
              values ('LDL', '99', 'extracted', %L, %L, 'LDL 99')$q$, doc, page));

  insert into public.observations (name_as_written, value_as_written, unit_as_written, origin, confidence)
  values ('Weight', '72', 'kg', 'user_entered', 0.99) returning id into mine;
  perform pg_temp.expect_count('A can add a self-reported fact; it is confirmed and carries no AI confidence',
    format($q$select 1 from public.observations where id = %L and review_status = 'confirmed' and confidence is null and origin = 'user_entered'$q$, mine), 1);

  perform pg_temp.expect_blocked('A cannot edit a recorded value',
    format($q$update public.observations set value_as_written = '5.9' where id = %L$q$, obs));
  perform pg_temp.expect_blocked('A cannot change the interpretation/code',
    format($q$update public.observations set code = 'x' where id = %L$q$, obs));
  perform pg_temp.expect_blocked('A cannot delete a fact',
    format('delete from public.observations where id = %L', obs));

  perform pg_temp.expect_count('A can confirm an extracted fact (review)',
    format($q$update public.observations set review_status = 'confirmed' where id = %L returning 1$q$, obs), 1);

  insert into public.observations (name_as_written, value_as_written, unit_as_written, origin, supersedes_id)
  values ('HbA1c', '6.3', '%', 'user_corrected', obs) returning id into corr;
  perform pg_temp.expect_count('a correction keeps the original, marks it superseded, and inherits its evidence',
    format($q$select 1 from public.observations o join public.observations c on c.supersedes_id = o.id
              where o.id = %L and o.superseded_at is not null and o.value_as_written = '6.5'
                and c.id = %L and c.document_id = o.document_id and c.document_page_id = o.document_page_id$q$, obs, corr), 1);
  perform pg_temp.expect_count('current_observations shows the correction, not the superseded value',
    $q$select 1 from public.current_observations where value_as_written in ('6.5', '6.3')$q$, 1);
  perform pg_temp.expect_blocked('a fact cannot be corrected twice (correct the correction instead)',
    format($q$insert into public.observations (name_as_written, value_as_written, origin, supersedes_id)
              values ('HbA1c', '6.0', 'user_corrected', %L)$q$, obs));
  perform pg_temp.expect_blocked('a superseded fact can no longer be reviewed',
    format($q$update public.observations set review_status = 'rejected' where id = %L$q$, obs));
  perform pg_temp.expect_count('the correction is in the audit trail',
    format($q$select 1 from public.audit_logs where entity_id = %L and action = 'fact.user_corrected'$q$, corr), 1);

  foreach t in array array['document_pages', 'extraction_runs', 'health_events', 'insight_sources'] loop
    perform pg_temp.expect_blocked(format('A cannot write %s', t), format('insert into public.%I default values', t));
  end loop;
  perform pg_temp.expect_blocked('A cannot create insights',
    $q$insert into public.insights (insight_type, subject_display, title, body_text, generated_by, generator_version)
       values ('value_change', 'x', 'x', 'x', 'rules', 'x')$q$);
  perform pg_temp.expect_blocked('A cannot rewrite an insight',
    format($q$update public.insights set body_text = 'edited' where id = %L$q$, ins));
  perform pg_temp.expect_count('A can dismiss an insight',
    format('update public.insights set dismissed_at = now() where id = %L returning 1', ins), 1);

  insert into public.consents (consent_type, policy_version, granted) values ('ai_processing', '2026-09', true);
  insert into public.consents (consent_type, policy_version, granted) values ('ai_processing', '2026-09', false);
  perform pg_temp.expect_count('consent withdrawals are new ledger rows; current state is the latest',
    $q$select 1 from public.current_consents where consent_type = 'ai_processing' and granted = false$q$, 1);
  perform pg_temp.expect_blocked('consents cannot be edited', $q$update public.consents set granted = true$q$);
  perform pg_temp.expect_blocked('consents cannot be deleted', 'delete from public.consents');

  insert into public.health_profiles (date_of_birth, blood_group) values ('1985-04-02', 'O+');
  perform pg_temp.expect_count('A can keep a self-reported health profile', 'select 1 from public.health_profiles', 1);

  perform pg_temp.expect_true('A can see their own audit trail',
    (select count(*) from public.audit_logs) > 0);
  perform pg_temp.expect_blocked('A cannot write audit logs',
    $q$insert into public.audit_logs (actor, action) values ('user', 'fake.entry')$q$);
  perform pg_temp.expect_blocked('A cannot erase audit logs', 'delete from public.audit_logs');

  perform pg_temp.expect_true('get_health_summary() counts A''s current records',
    (select record_count = 2 and document_count = 1 from public.get_health_summary()));

  reset role;

  -- ------------------------------------------------------------- user B ------
  perform pg_temp.act_as(b);

  foreach t in array own_tables || array['health_profiles', 'consents', 'audit_logs', 'current_observations', 'current_insights'] loop
    perform pg_temp.expect_count(format('B sees none of A''s %s', t), format('select 1 from public.%I', t), 0);
  end loop;
  perform pg_temp.expect_true('B''s health summary is empty',
    (select record_count = 0 and document_count = 0 from public.get_health_summary()));
  perform pg_temp.expect_blocked('B cannot attach a fact to A''s document',
    format($q$insert into public.observations (name_as_written, value_as_written, origin, document_id)
              values ('x', '1', 'user_entered', %L)$q$, doc));
  perform pg_temp.expect_blocked('B cannot "correct" A''s fact',
    format($q$insert into public.observations (name_as_written, value_as_written, origin, supersedes_id)
              values ('x', '1', 'user_corrected', %L)$q$, corr));
  perform pg_temp.expect_blocked('B cannot review A''s fact',
    format($q$update public.observations set review_status = 'rejected' where id = %L$q$, corr));

  if storage_writes then
    reset role;
    insert into storage.objects (bucket_id, name, metadata)
    values ('document-derivatives', a::text || '/documents/' || doc::text || '/pages/1.webp', '{"size": 10}');
    perform pg_temp.act_as(b);
    perform pg_temp.expect_count('B cannot read A''s page images', $q$select 1 from storage.objects where bucket_id = 'document-derivatives'$q$, 0);
    perform pg_temp.expect_blocked('users cannot write derivatives (server only)',
      format($q$insert into storage.objects (bucket_id, name, metadata) values ('document-derivatives', %L, '{}')$q$,
             b::text || '/documents/x/pages/1.webp'));
    reset role;
    perform pg_temp.act_as(a);
    perform pg_temp.expect_count('A can read their own page images', $q$select 1 from storage.objects where bucket_id = 'document-derivatives'$q$, 1);
  end if;

  reset role;

  -- ------------------------------------------------- account deletion -------
  perform set_config('request.jwt.claims', '', true);
  delete from auth.users where id = a;
  foreach t in array own_tables || array['documents', 'health_profiles', 'consents', 'document_status_history'] loop
    perform pg_temp.expect_count(format('deleting the account removes A''s %s', t),
      format('select 1 from public.%I where user_id = %L', t, a), 0);
  end loop;
  perform pg_temp.expect_true('the audit trail survives account deletion, anonymised',
    (select count(*) > 0 from public.audit_logs where user_id is null and entity_id = obs));

  raise notice '==============================================';
  raise notice 'ALL HEALTH MODEL CHECKS PASSED (storage writes: %)', case when storage_writes then 'tested' else 'skipped' end;
  raise notice '==============================================';
end
$$;

rollback;
