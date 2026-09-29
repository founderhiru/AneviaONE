-- =============================================================================
-- Security / user-isolation test for the Phase 1 schema.
--
-- Simulates two real users (A and B), an anonymous caller and the server
-- (service role) talking to the database exactly as the Supabase API would,
-- and checks that every attack is refused.
--
-- SAFE TO RUN ON A REAL PROJECT: everything happens inside one transaction
-- that is ROLLED BACK at the end — no users, rows or files are left behind.
--
--   * Supabase SQL Editor: paste the whole file and press Run. Success ends
--     with the notice  "ALL SECURITY CHECKS PASSED".  Any failure stops with
--     an error that starts with "FAIL".
--   * Local:  supabase/tests/local/run-local.sh  (also runs Storage writes).
--
-- Storage-write checks (uploading into storage.objects directly) only run
-- when `hi_test.storage_writes` = 'on' (set by the local runner). On hosted
-- Supabase, uploads go through the Storage API, so those are verified via
-- the app instead.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- helpers ---
create function pg_temp.act_as(p_user uuid, p_role text default 'authenticated') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end
$$;

create function pg_temp.act_as_admin() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end
$$;

-- The statement must be refused (error) or affect no rows.
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

-- The helpers live in this session's temporary schema; let the API roles call them.
do $$
declare
  tmp text := pg_my_temp_schema()::regnamespace::text;
begin
  execute format('grant usage on schema %I to anon, authenticated, service_role', tmp);
  execute format('grant execute on all functions in schema %I to anon, authenticated, service_role', tmp);
end
$$;

-- ------------------------------------------------------------- scenario -----
do $$
declare
  user_a   uuid := gen_random_uuid();
  user_b   uuid := gen_random_uuid();
  doc_a    public.documents;
  doc_b    public.documents;
  doc_srv  uuid;
  storage_writes boolean := coalesce(current_setting('hi_test.storage_writes', true), 'off') = 'on';
begin
  -- Two fresh users (profiles are created by trigger).
  insert into auth.users (id, email) values
    (user_a, 'isolation-test-a@example.invalid'),
    (user_b, 'isolation-test-b@example.invalid');

  perform pg_temp.expect_count('profile rows auto-created for new users',
    format('select 1 from public.profiles where id in (%L, %L)', user_a, user_b), 2);

  -- ------------------------------------------------ anonymous caller -------
  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anon cannot read documents',  'select * from public.documents');
  perform pg_temp.expect_blocked('anon cannot read profiles',   'select * from public.profiles');
  perform pg_temp.expect_blocked('anon cannot create documents',
    $q$insert into public.documents (original_filename, mime_type, file_size_bytes) values ('x.pdf','application/pdf',10)$q$);
  reset role; perform pg_temp.act_as_admin();

  -- ------------------------------------------------------------ user A -----
  perform pg_temp.act_as(user_a);

  perform pg_temp.expect_count('A sees only their own profile', 'select * from public.profiles', 1);
  perform pg_temp.expect_count('A can complete their own onboarding',
    'update public.profiles set onboarding_completed_at = now() returning 1', 1);
  perform pg_temp.expect_blocked('A cannot edit B''s profile',
    format('update public.profiles set display_name = %L where id = %L', 'hacked', user_b));
  perform pg_temp.expect_blocked('A cannot create profiles',
    format('insert into public.profiles (id) values (%L)', gen_random_uuid()));
  perform pg_temp.expect_blocked('A cannot delete their profile row', 'delete from public.profiles');

  insert into public.documents (original_filename, mime_type, file_size_bytes)
  values ('blood-test-2026.pdf', 'application/pdf', 123456)
  returning * into doc_a;

  perform pg_temp.expect_true('new document is owned by A', doc_a.user_id = user_a);
  perform pg_temp.expect_true('new document starts as pending_upload', doc_a.status = 'pending_upload');
  perform pg_temp.expect_true('storage path is decided by the database',
    doc_a.storage_path = user_a::text || '/documents/' || doc_a.id::text || '/original.pdf');

  perform pg_temp.expect_blocked('A cannot create a document owned by B',
    format($q$insert into public.documents (user_id, original_filename, mime_type, file_size_bytes)
              values (%L, 'x.pdf', 'application/pdf', 10)$q$, user_b));
  perform pg_temp.expect_blocked('A cannot choose their own storage path',
    $q$insert into public.documents (storage_path, original_filename, mime_type, file_size_bytes)
       values ('evil/path.pdf', 'x.pdf', 'application/pdf', 10)$q$);
  perform pg_temp.expect_blocked('A cannot create a document that is already "completed"',
    $q$insert into public.documents (status, original_filename, mime_type, file_size_bytes)
       values ('completed', 'x.pdf', 'application/pdf', 10)$q$);
  perform pg_temp.expect_blocked('non-PDF documents are rejected',
    $q$insert into public.documents (original_filename, mime_type, file_size_bytes)
       values ('x.exe', 'application/x-msdownload', 10)$q$);
  perform pg_temp.expect_blocked('documents over 20 MB are rejected',
    $q$insert into public.documents (original_filename, mime_type, file_size_bytes)
       values ('big.pdf', 'application/pdf', 20971521)$q$);

  perform pg_temp.expect_blocked('A cannot mark a document uploaded before the file exists',
    format($q$update public.documents set status = 'uploaded' where id = %L$q$, doc_a.id));
  perform pg_temp.expect_blocked('A cannot fake processing results (status = completed)',
    format($q$update public.documents set status = 'completed' where id = %L$q$, doc_a.id));
  perform pg_temp.expect_blocked('A cannot rename the original',
    format($q$update public.documents set original_filename = 'renamed.pdf' where id = %L$q$, doc_a.id));
  perform pg_temp.expect_blocked('A cannot move the original''s storage path',
    format($q$update public.documents set storage_path = 'x' where id = %L$q$, doc_a.id));
  perform pg_temp.expect_blocked('A cannot write a processing error',
    format($q$update public.documents set processing_error = 'x' where id = %L$q$, doc_a.id));

  if storage_writes then
    perform pg_temp.expect_blocked('A cannot upload into B''s folder',
      format($q$insert into storage.objects (bucket_id, name, metadata)
                values ('medical-documents', %L, '{"size": 10}')$q$,
             user_b::text || '/documents/' || gen_random_uuid()::text || '/original.pdf'));
    perform pg_temp.expect_blocked('A cannot upload a file that has no document record',
      format($q$insert into storage.objects (bucket_id, name, metadata)
                values ('medical-documents', %L, '{"size": 10}')$q$,
             user_a::text || '/documents/' || gen_random_uuid()::text || '/original.pdf'));

    insert into storage.objects (bucket_id, name, owner, metadata)
    values ('medical-documents', doc_a.storage_path, user_a,
            '{"size": 120000, "mimetype": "application/pdf"}');
    raise notice 'PASS  A can upload the original for their own pending document';

    update public.documents set status = 'uploaded' where id = doc_a.id returning * into doc_a;
    perform pg_temp.expect_true('A can confirm the upload (pending_upload → uploaded)', doc_a.status = 'uploaded');
    perform pg_temp.expect_true('uploaded_at is set by the database', doc_a.uploaded_at is not null);
    perform pg_temp.expect_true('stored size comes from Storage, not the client', doc_a.file_size_bytes = 120000);

    perform pg_temp.expect_blocked('A cannot overwrite the original file',
      format($q$update storage.objects set metadata = '{"size": 1}' where name = %L$q$, doc_a.storage_path));
    perform pg_temp.expect_blocked('A cannot delete a confirmed original file',
      format($q$delete from storage.objects where name = %L$q$, doc_a.storage_path));
    perform pg_temp.expect_blocked('A cannot upload a second file over a confirmed document',
      format($q$insert into storage.objects (bucket_id, name, metadata)
                values ('medical-documents', %L, '{"size": 10}')$q$, doc_a.storage_path));
    perform pg_temp.expect_blocked('A cannot delete a confirmed document',
      format($q$delete from public.documents where id = %L$q$, doc_a.id));
    perform pg_temp.expect_blocked('A cannot move a document back to pending_upload',
      format($q$update public.documents set status = 'pending_upload' where id = %L$q$, doc_a.id));
    perform pg_temp.expect_blocked('A cannot start processing themselves',
      format($q$update public.documents set status = 'processing' where id = %L$q$, doc_a.id));
  end if;

  perform pg_temp.expect_count('A can read their own status history',
    format('select 1 from public.document_status_history where document_id = %L', doc_a.id),
    case when storage_writes then 2 else 1 end);
  perform pg_temp.expect_blocked('A cannot write to the audit history',
    format($q$insert into public.document_status_history (document_id, user_id, to_status, changed_by)
              values (%L, %L, 'completed', 'authenticated')$q$, doc_a.id, user_a));
  perform pg_temp.expect_blocked('A cannot erase the audit history', 'delete from public.document_status_history');

  -- An abandoned upload can be cleaned up by its owner.
  insert into public.documents (original_filename, mime_type, file_size_bytes)
  values ('abandoned.pdf', 'application/pdf', 10) returning * into doc_b;
  perform pg_temp.expect_count('A can delete their own abandoned (pending) upload',
    format('delete from public.documents where id = %L returning 1', doc_b.id), 1);

  reset role; perform pg_temp.act_as_admin();

  -- ------------------------------------------------------------ user B -----
  perform pg_temp.act_as(user_b);

  perform pg_temp.expect_count('B cannot see any of A''s documents', 'select * from public.documents', 0);
  perform pg_temp.expect_count('B cannot fetch A''s document by id',
    format('select * from public.documents where id = %L', doc_a.id), 0);
  perform pg_temp.expect_count('B cannot see A''s status history', 'select * from public.document_status_history', 0);
  perform pg_temp.expect_count('B cannot see A''s profile',
    format('select * from public.profiles where id = %L', user_a), 0);
  perform pg_temp.expect_blocked('B cannot change A''s document',
    format($q$update public.documents set status = 'uploaded' where id = %L$q$, doc_a.id));
  perform pg_temp.expect_blocked('B cannot delete A''s document',
    format('delete from public.documents where id = %L', doc_a.id));

  if storage_writes then
    perform pg_temp.expect_count('B cannot see A''s original file',
      format('select * from storage.objects where name = %L', doc_a.storage_path), 0);
    perform pg_temp.expect_blocked('B cannot delete A''s original file',
      format('delete from storage.objects where name = %L', doc_a.storage_path));
  end if;

  reset role; perform pg_temp.act_as_admin();

  -- ------------------------------------------------ server (service role) ---
  perform pg_temp.act_as(null, 'service_role');

  -- On hosted runs there is no stored file, so the server seeds an uploaded doc.
  insert into public.documents (user_id, original_filename, mime_type, file_size_bytes, status, uploaded_at)
  values (user_a, 'server-seeded.pdf', 'application/pdf', 10, 'uploaded', now())
  returning id into doc_srv;

  update public.documents set status = 'processing' where id = doc_srv;
  update public.documents set status = 'extracted'  where id = doc_srv;
  update public.documents set status = 'validated'  where id = doc_srv;
  update public.documents set status = 'completed'  where id = doc_srv;
  raise notice 'PASS  server can run the full lifecycle uploaded → processing → extracted → validated → completed';

  perform pg_temp.expect_blocked('server cannot skip lifecycle steps (completed → validated)',
    format($q$update public.documents set status = 'validated' where id = %L$q$, doc_srv));
  perform pg_temp.expect_blocked('server cannot change an original''s storage path',
    format($q$update public.documents set storage_path = 'x' where id = %L$q$, doc_srv));
  perform pg_temp.expect_count('every lifecycle step was audited as the server',
    format($q$select 1 from public.document_status_history
              where document_id = %L and changed_by = 'service_role'$q$, doc_srv), 5);

  reset role; perform pg_temp.act_as_admin();

  raise notice '==============================================';
  raise notice 'ALL SECURITY CHECKS PASSED (storage writes: %)', case when storage_writes then 'tested' else 'skipped — hosted run' end;
  raise notice '==============================================';
end
$$;

rollback;
