-- =============================================================================
-- Vault files: isolation and rules. Synthetic users only; ROLLED BACK.
-- Run with: PGOPTIONS="-c hi_test.storage_writes=on". Success ends with "ALL VAULT FILE CHECKS PASSED".
-- =============================================================================
begin;

create function pg_temp.act_as(p_user uuid, p_role text default 'authenticated') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  perform set_config('role', p_role, true);
end $$;

create function pg_temp.as_admin() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.expect_blocked(label text, stmt text) returns void
language plpgsql as $$
declare affected bigint;
begin
  begin
    execute stmt;
    get diagnostics affected = row_count;
  exception when others then
    raise notice 'PASS  %  (refused: %)', label, sqlerrm;
    return;
  end;
  if affected = 0 then raise notice 'PASS  %  (no rows affected)', label; return; end if;
  raise exception 'FAIL  %  — was allowed and affected % row(s)', label, affected;
end $$;

create function pg_temp.expect_true(label text, condition boolean) returns void
language plpgsql as $$
begin
  if condition is distinct from true then raise exception 'FAIL  %', label; end if;
  raise notice 'PASS  %', label;
end $$;

do $$
declare tmp text := pg_my_temp_schema()::regnamespace::text;
begin
  execute format('grant usage on schema %I to anon, authenticated, service_role', tmp);
  execute format('grant execute on all functions in schema %I to anon, authenticated, service_role', tmp);
end $$;

do $$
declare
  a uuid := gen_random_uuid();  -- owner
  b uuid := gen_random_uuid();  -- viewer
  c uuid := gen_random_uuid();  -- manager
  d uuid := gen_random_uuid();  -- stranger
  self_a uuid; kid uuid; f uuid; f_kid uuid; path text; kid_path text; sz bigint;
begin
  insert into auth.users (id, email) values
    (a, 'vf-a@example.invalid'), (b, 'vf-b@example.invalid'),
    (c, 'vf-c@example.invalid'), (d, 'vf-d@example.invalid');
  select id into self_a from public.subjects where linked_user_id = a;
  insert into public.subject_access (subject_id, grantee_user_id, role, status, approved_at)
  values (self_a, b, 'viewer', 'active', now()), (self_a, c, 'manager', 'active', now());

  -- owner reserves a file (no subject named = their own record); the server decides everything else
  perform pg_temp.act_as(a);
  insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes)
  values ('identity', '  Passport  ', 'IMG_0001.jpg', 'image/jpeg', 1000) returning id into f;
  perform pg_temp.as_admin();
  select storage_path into path from public.vault_files where id = f;
  perform pg_temp.expect_true('owner reserves a file for their own record',
    (select subject_id = self_a and user_id = a and status = 'pending_upload' and uploaded_at is null and title = 'Passport' from public.vault_files where id = f));
  perform pg_temp.expect_true('the database assigns the path', path = a::text || '/files/' || f::text || '/original.jpg');

  -- confirming before the file exists is refused
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('cannot confirm a file that was never uploaded',
    format($s$update public.vault_files set status = 'stored' where id = %L$s$, f));

  -- the app cannot upload to someone else's folder or a path it invented
  perform pg_temp.act_as(b);
  perform pg_temp.expect_blocked('viewer cannot write into the owner''s folder',
    format($s$insert into storage.objects (bucket_id, name, owner) values ('personal-vault', %L, %L)$s$, path, b));
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('owner cannot upload to a path that is not a pending file of theirs',
    format($s$insert into storage.objects (bucket_id, name, owner) values ('personal-vault', %L, %L)$s$, a::text || '/files/' || gen_random_uuid()::text || '/original.jpg', a));

  -- the real upload, then confirm
  insert into storage.objects (bucket_id, name, owner, metadata) values ('personal-vault', path, a, '{"size": 2048}'::jsonb);
  update public.vault_files set status = 'stored' where id = f;
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('confirming records the size storage actually holds and the time',
    (select status = 'stored' and file_size_bytes = 2048 and uploaded_at is not null from public.vault_files where id = f));

  -- constraints
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('unknown category refused',
    $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('aadhaar_numbers', 'x', 'x.pdf', 'application/pdf', 10)$s$);
  perform pg_temp.expect_blocked('unsupported file type refused',
    $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('other', 'x', 'x.exe', 'application/x-msdownload', 10)$s$);
  perform pg_temp.expect_blocked('blank title refused',
    $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('other', '   ', 'x.pdf', 'application/pdf', 10)$s$);
  perform pg_temp.expect_blocked('over 20 MB refused',
    $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('other', 'x', 'x.pdf', 'application/pdf', 20971521)$s$);
  perform pg_temp.expect_blocked('cannot choose owner, status or path',
    $s$insert into public.vault_files (user_id, category, title, original_filename, mime_type, file_size_bytes, status, storage_path) values (gen_random_uuid(), 'other', 'x', 'x.pdf', 'application/pdf', 10, 'stored', 'a/b')$s$);

  -- owner edits what is editable; identity and the file are frozen
  update public.vault_files set title = 'Passport (Ravi)', category = 'identity', expires_on = date '2031-03-14' where id = f;
  perform pg_temp.expect_true('owner can rename, re-file and set an expiry',
    (select title = 'Passport (Ravi)' and expires_on = date '2031-03-14' from public.vault_files where id = f));
  perform pg_temp.expect_blocked('file path cannot change', format($s$update public.vault_files set storage_path = 'x/y' where id = %L$s$, f));
  perform pg_temp.expect_blocked('file type cannot change', format($s$update public.vault_files set mime_type = 'application/pdf' where id = %L$s$, f));
  perform pg_temp.expect_blocked('size cannot be rewritten', format($s$update public.vault_files set file_size_bytes = 5 where id = %L$s$, f));
  perform pg_temp.expect_blocked('stored file cannot go back to pending', format($s$update public.vault_files set status = 'pending_upload' where id = %L$s$, f));
  kid := public.create_relative('Child A', 'child', date '2018-05-01', true);
  perform pg_temp.expect_blocked('file cannot be moved to another person', format($s$update public.vault_files set subject_id = %L where id = %L$s$, kid, f));

  -- a relative the owner manages: the owner can add files for them
  insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes)
  values (kid, 'certificate', 'Birth certificate', 'bc.pdf', 'application/pdf', 500) returning id into f_kid;
  perform pg_temp.as_admin();
  select storage_path into kid_path from public.vault_files where id = f_kid;
  perform pg_temp.expect_true('owner reserves a file for a relative they manage', kid_path = a::text || '/files/' || f_kid::text || '/original.pdf');

  -- viewer: reads the row and opens the file, cannot write
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('viewer sees the owner''s file record', exists (select 1 from public.vault_files where id = f));
  perform pg_temp.expect_true('viewer can open the stored file', exists (select 1 from storage.objects where bucket_id = 'personal-vault' and name = path));
  perform pg_temp.expect_true('viewer does not see the relative''s file (no grant on that person)', not exists (select 1 from public.vault_files where id = f_kid));
  perform pg_temp.expect_blocked('viewer cannot add a file',
    format($s$insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes) values (%L, 'other', 'x', 'x.pdf', 'application/pdf', 10)$s$, self_a));
  perform pg_temp.expect_blocked('viewer cannot edit', format($s$update public.vault_files set title = 'y' where id = %L$s$, f));
  perform pg_temp.expect_blocked('viewer cannot delete', format($s$delete from public.vault_files where id = %L$s$, f));
  perform pg_temp.expect_blocked('viewer cannot delete the stored file', format($s$delete from storage.objects where bucket_id = 'personal-vault' and name = %L$s$, path));

  -- manager: can read, still cannot upload or delete (owner only)
  perform pg_temp.act_as(c);
  perform pg_temp.expect_true('manager can read', exists (select 1 from public.vault_files where id = f));
  perform pg_temp.expect_blocked('manager cannot add a file',
    format($s$insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes) values (%L, 'other', 'x', 'x.pdf', 'application/pdf', 10)$s$, self_a));
  perform pg_temp.expect_blocked('manager cannot delete', format($s$delete from public.vault_files where id = %L$s$, f));

  -- stranger and anonymous
  perform pg_temp.act_as(d);
  perform pg_temp.expect_true('stranger sees no files', not exists (select 1 from public.vault_files));
  perform pg_temp.expect_true('stranger cannot open the stored file', not exists (select 1 from storage.objects where bucket_id = 'personal-vault'));
  perform pg_temp.expect_blocked('stranger cannot add a file for someone else',
    format($s$insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes) values (%L, 'other', 'x', 'x.pdf', 'application/pdf', 10)$s$, self_a));
  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anonymous cannot read', 'select * from public.vault_files');

  -- revoked and expired grants stop reading, files included
  perform pg_temp.as_admin();
  update public.subject_access set status = 'revoked', revoked_at = now() where grantee_user_id = b and subject_id = self_a;
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('revoked viewer sees no files', not exists (select 1 from public.vault_files));
  perform pg_temp.expect_true('revoked viewer cannot open the file', not exists (select 1 from storage.objects where bucket_id = 'personal-vault'));
  perform pg_temp.as_admin();
  update public.subject_access set expires_at = now() - interval '1 day' where grantee_user_id = c and subject_id = self_a;
  perform pg_temp.act_as(c);
  perform pg_temp.expect_true('expired manager sees no files', not exists (select 1 from public.vault_files));

  -- owner deletes: the file, then the record
  perform pg_temp.act_as(a);
  delete from storage.objects where bucket_id = 'personal-vault' and name = path;
  delete from public.vault_files where id = f;
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('owner can delete a file and its record',
    not exists (select 1 from public.vault_files where id = f) and not exists (select 1 from storage.objects where name = path));

  -- an account being deleted can add nothing
  insert into private.account_deletions (user_id) values (a);
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('no new file once account deletion has started',
    $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('other', 'x', 'x.pdf', 'application/pdf', 10)$s$);
  perform pg_temp.as_admin();
  delete from private.account_deletions where user_id = a;

  -- deleting the account removes every record (the function removes the files)
  delete from auth.users where id = a;
  perform pg_temp.expect_true('account deletion cascades the owner''s files, relatives included',
    not exists (select 1 from public.vault_files where user_id = a or id = f_kid));

  raise notice 'ALL VAULT FILE CHECKS PASSED';
end $$;

rollback;
