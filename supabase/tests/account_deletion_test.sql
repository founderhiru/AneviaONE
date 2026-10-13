-- =============================================================================
-- Account deletion: begin (service role), then deleting the auth user (as
-- auth.admin.deleteUser does) removes every row of that person and nothing of
-- anyone else. Runs inside a transaction that is ROLLED BACK. Success ends with
-- "ALL ACCOUNT DELETION CHECKS PASSED".
--
-- Synthetic users and fictional values only. Storage-object removal happens in
-- the delete-account Edge Function (Storage API) and is tested there.
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

create function pg_temp.obs(fp text, name text, value text) returns jsonb
language sql as $$
  select jsonb_build_object('page_number', 1, 'source_text', name || ' ' || value, 'confidence', 0.95,
    'confidence_gate', 'passed', 'fact_fingerprint', fp, 'name_as_written', name, 'value_as_written', value,
    'effective_date', '2026-03-12', 'category', 'laboratory', 'value_numeric', value::numeric, 'interpretation_version', 'n1')
$$;

create function pg_temp.read_doc(p_doc uuid, p_user uuid, p_observations jsonb) returns jsonb
language plpgsql as $$
declare
  run uuid;
begin
  perform public.engine_claim_document(p_doc, p_user, false);
  run := public.engine_start_run(p_doc, p_user, 'g1.1', 'anthropic', 'model', 'p1', 'ai-2026-10');
  return public.engine_complete_document(run, p_user, jsonb_build_object('report_date', '2026-03-12',
    'identity_check', 'consistent', 'text_layer', 'present', 'chunk_count', 1, 'facts_discarded', 0,
    'pages', jsonb_build_array(jsonb_build_object('page_number', 1, 'text', 'fictional synthetic report text')),
    'observations', p_observations));
end
$$;

/** Rows of one person in every public table that has user_id (plus profiles by id). */
create function pg_temp.rows_of(p_user uuid) returns bigint
language plpgsql as $$
declare
  t text;
  n bigint;
  total bigint := 0;
begin
  for t in
    select c.table_name from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'user_id'
  loop
    execute format('select count(*) from public.%I where user_id = $1', t) into n using p_user;
    total := total + n;
  end loop;
  select total + count(*) into total from public.profiles where id = p_user;
  return total;
end
$$;

/** A fingerprint of everything one person has, across the same tables. */
create function pg_temp.fingerprint_of(p_user uuid) returns text
language plpgsql as $$
declare
  t text;
  h text;
  acc text := '';
begin
  for t in
    select c.table_name from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'user_id'
     order by c.table_name
  loop
    execute format('select md5(coalesce(string_agg(x::text, ''|'' order by x::text), '''')) from public.%I x where x.user_id = $1', t) into h using p_user;
    acc := acc || t || ':' || h || ';';
  end loop;
  select acc || 'profiles:' || md5(coalesce(string_agg(p::text, '|'), '')) into acc from public.profiles p where p.id = p_user;
  return md5(acc);
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
  doc1 uuid; doc2 uuid; doc_busy uuid; doc_pending uuid; doc_b uuid;
  fp_shared text := repeat('a', 64);
  hba1c uuid; corrected uuid;
  r jsonb;
  b_before text;
  a_rows_before bigint;
  audit_before bigint;
  claimed bigint;
begin
  insert into auth.users (id, email) values (a, 'account-a@example.invalid'), (b, 'account-b@example.invalid');
  insert into public.profiles (id) values (a), (b) on conflict do nothing;

  foreach r in array array[to_jsonb(a), to_jsonb(b)] loop
    perform pg_temp.act_as((r #>> '{}')::uuid);
    insert into public.consents (consent_type, policy_version, granted)
    values ('ai_processing', 'ai-2026-10', true), ('health_data_processing', 'ai-2026-10', true);
    reset role;
  end loop;

  perform pg_temp.act_as(null, 'service_role');
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'first.pdf', 'application/pdf', 100, 'uploaded', now()) returning id into doc1;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'second.pdf', 'application/pdf', 100, 'uploaded', now()) returning id into doc2;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (a, 'busy.pdf', 'application/pdf', 100, 'uploaded', now()) returning id into doc_busy;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status)
  values (a, 'unfinished.pdf', 'application/pdf', 100, 'pending_upload') returning id into doc_pending;
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (b, 'b.pdf', 'application/pdf', 100, 'uploaded', now()) returning id into doc_b;

  -- A: two reports sharing a result (a cross-report source), plus a correction.
  perform pg_temp.read_doc(doc1, a, jsonb_build_array(pg_temp.obs(fp_shared, 'Test X', '5.8'), pg_temp.obs(repeat('b', 64), 'HbA1c', '6.1')));
  perform pg_temp.read_doc(doc2, a, jsonb_build_array(pg_temp.obs(fp_shared, 'Test X', '5.8')));
  -- B holds the very same fingerprint: it must survive A's deletion untouched.
  perform pg_temp.read_doc(doc_b, b, jsonb_build_array(pg_temp.obs(fp_shared, 'Test X', '5.8')));
  select id into hba1c from public.observations where document_id = doc1 and name_as_written = 'HbA1c';
  reset role;

  perform pg_temp.act_as(a);
  corrected := public.correct_fact('observations', hba1c, '{"value": "6.4"}', 'Misread from the report');
  reset role;
  insert into public.health_profiles (user_id) values (a) on conflict do nothing;

  -- doc_busy is being read right now.
  perform pg_temp.act_as(null, 'service_role');
  perform public.engine_claim_document(doc_busy, a, false);
  reset role;

  perform pg_temp.expect_true('setup: A has a correction, a cross-report source and rows in many tables',
    exists (select 1 from public.observations where id = corrected and origin = 'user_corrected')
    and exists (select 1 from public.fact_sources where user_id = a and document_id = doc2)
    and pg_temp.rows_of(a) > 15);

  b_before := pg_temp.fingerprint_of(b);
  a_rows_before := pg_temp.rows_of(a);

  -- ------------------------------------------------------ who may begin it
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('the app cannot begin an account deletion itself',
    format('select public.engine_begin_account_deletion(%L)', a));
  perform pg_temp.expect_blocked('the app cannot begin deleting someone else''s account',
    format('select public.engine_begin_account_deletion(%L)', b));
  reset role;
  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anon cannot begin an account deletion',
    format('select public.engine_begin_account_deletion(%L)', a));
  reset role;
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('the app cannot read which accounts are being deleted',
    'select * from private.account_deletions');
  reset role;

  -- ------------------------------------------------- busy: nothing changes
  perform pg_temp.act_as(null, 'service_role');
  r := public.engine_begin_account_deletion(a);
  reset role;
  perform pg_temp.expect_true('while a report is being read: busy, and nothing is marked or changed',
    r ->> 'status' = 'busy'
    and not exists (select 1 from private.account_deletions where user_id = a)
    and pg_temp.rows_of(a) = a_rows_before
    and (select status from public.documents where id = doc1) = 'completed'
    and (select status from public.documents where id = doc_pending) = 'pending_upload');

  -- The reader crashed long ago: its run is stale.
  update public.documents set processing_started_at = now() - interval '1 hour' where id = doc_busy;

  -- ------------------------------------------------------------------ begin
  audit_before := (select count(*) from public.audit_logs where user_id = a);
  perform pg_temp.act_as(null, 'service_role');
  r := public.engine_begin_account_deletion(a);
  reset role;
  perform pg_temp.expect_true('begin: deleting, and the account is marked',
    r ->> 'status' = 'deleting' and exists (select 1 from private.account_deletions where user_id = a));
  perform pg_temp.expect_true('every report is frozen as deleting (incl. the stale one being read)',
    (select bool_and(status = 'deleting') from public.documents where user_id = a)
    and (select count(*) from public.documents where user_id = a) = 3);
  perform pg_temp.expect_true('the unfinished upload''s reservation is removed (an in-flight upload is then refused by Storage)',
    not exists (select 1 from public.documents where id = doc_pending));
  perform pg_temp.expect_true('the stale run is closed',
    not exists (select 1 from public.extraction_runs where user_id = a and status = 'running'));
  perform pg_temp.expect_true('begin is audited once, with counts only',
    (select count(*) from public.audit_logs where user_id = a and action = 'account.deletion_started') = 1
    and (select details from public.audit_logs where user_id = a and action = 'account.deletion_started') = '{"reports": 3, "unfinished_uploads": 1}'::jsonb);
  perform pg_temp.expect_true('B is untouched by A''s begin', pg_temp.fingerprint_of(b) = b_before);

  -- ---------------------------------------------- nothing new can start
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('A can no longer reserve a new report',
    $q$insert into public.documents (original_filename, mime_type, file_size_bytes) values ('new.pdf', 'application/pdf', 100)$q$);
  reset role;
  perform pg_temp.act_as(null, 'service_role');
  perform pg_temp.expect_blocked('the server cannot create a report for A either',
    format($q$insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at) values (%L, 'x.pdf', 'application/pdf', 1, 'uploaded', now())$q$, a));
  select count(*) into claimed from public.engine_claim_document(doc1, a, true);
  perform pg_temp.expect_true('no report of A can be claimed for reading', claimed = 0);
  reset role;
  perform pg_temp.act_as(b);
  insert into public.documents (original_filename, mime_type, file_size_bytes) values ('b-new.pdf', 'application/pdf', 100);
  reset role;
  perform pg_temp.expect_true('B can still add reports', (select count(*) from public.documents where user_id = b) = 2);
  delete from public.documents where user_id = b and original_filename = 'b-new.pdf';
  perform pg_temp.expect_true('(B back to its starting state)', pg_temp.fingerprint_of(b) = b_before);

  -- ------------------------------------------------------- retry is safe
  perform pg_temp.act_as(null, 'service_role');
  r := public.engine_begin_account_deletion(a);
  reset role;
  perform pg_temp.expect_true('begin again (a retry): still deleting, nothing new audited',
    r ->> 'status' = 'deleting'
    and (select count(*) from public.audit_logs where user_id = a and action = 'account.deletion_started') = 1);

  -- ------------------------------------- delete the auth user (deleteUser)
  audit_before := (select count(*) from public.audit_logs where user_id = a);
  delete from auth.users where id = a;

  perform pg_temp.expect_true('every row of A is gone, in every table (cascade, incl. consents and corrections)',
    pg_temp.rows_of(a) = 0);
  perform pg_temp.expect_true('the deletion mark is gone with the account',
    not exists (select 1 from private.account_deletions where user_id = a));
  perform pg_temp.expect_true('A''s audit trail is kept anonymously (user_id null, ids/counts only)',
    not exists (select 1 from public.audit_logs where user_id = a)
    and (select count(*) from public.audit_logs where user_id is null and action = 'account.deletion_started'
          and details = '{"reports": 3, "unfinished_uploads": 1}'::jsonb) >= 1);
  perform pg_temp.expect_true('no fact or source of A remains under any id',
    not exists (select 1 from public.observations where id in (hba1c, corrected))
    and not exists (select 1 from public.fact_sources where document_id in (doc1, doc2)));
  perform pg_temp.expect_true('B is completely unaffected (every table, incl. the same fingerprint)',
    pg_temp.fingerprint_of(b) = b_before
    and exists (select 1 from public.current_observations where user_id = b and fact_fingerprint = fp_shared));

  perform pg_temp.act_as(null, 'service_role');
  r := public.engine_begin_account_deletion(a);
  reset role;
  perform pg_temp.expect_true('begin after the account is gone: deleted (a retry after success is harmless)',
    r ->> 'status' = 'deleted');

  raise notice 'ALL ACCOUNT DELETION CHECKS PASSED';
end
$$;

rollback;
