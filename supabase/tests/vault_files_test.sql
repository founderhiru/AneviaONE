-- =============================================================================
-- Vault files: ownership model (subject / uploader / role / access are separate facts), isolation and rules. Synthetic users only; ROLLED BACK.
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
  a uuid := gen_random_uuid();  -- controller of the relative, and a person with their own record
  b uuid := gen_random_uuid();  -- viewer
  c uuid := gen_random_uuid();  -- manager (family)
  d uuid := gen_random_uuid();  -- stranger
  self_a uuid; kid uuid; f uuid; fm uuid; fm2 uuid; fk uuid; path text; mpath text; sz bigint; n int;
begin
  insert into auth.users (id, email) values
    (a, 'vf-a@example.invalid'), (b, 'vf-b@example.invalid'),
    (c, 'vf-c@example.invalid'), (d, 'vf-d@example.invalid');
  select id into self_a from public.subjects where linked_user_id = a;
  insert into public.subject_access (subject_id, grantee_user_id, role, status, approved_at)
  values (self_a, b, 'viewer', 'active', now()), (self_a, c, 'manager', 'active', now());

  -- ---- the person reserves a file for their own record -------------------------------------
  perform pg_temp.act_as(a);
  insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes)
  values ('identity', '  Passport  ', 'IMG_0001.jpg', 'image/jpeg', 1000) returning id into f;
  perform pg_temp.as_admin();
  select storage_path into path from public.vault_files where id = f;
  perform pg_temp.expect_true('self upload: subject, uploader and role are recorded separately',
    (select subject_id = self_a and uploaded_by = a and uploaded_by_role = 'self' and status = 'pending_upload' and uploaded_at is null and title = 'Passport' from public.vault_files where id = f));
  perform pg_temp.expect_true('the path is keyed by the PERSON, not the uploader', path = self_a::text || '/files/' || f::text || '/original.jpg');

  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('cannot confirm a file that was never uploaded',
    format($s$update public.vault_files set status = 'stored' where id = %L$s$, f));

  -- the app cannot upload to a path it invented or into the person's folder without a pending row
  perform pg_temp.act_as(b);
  perform pg_temp.expect_blocked('viewer cannot write into the person''s folder',
    format($s$insert into storage.objects (bucket_id, name, owner) values ('personal-vault', %L, %L)$s$, path, b));
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('cannot upload to a path that is not a pending file',
    format($s$insert into storage.objects (bucket_id, name, owner) values ('personal-vault', %L, %L)$s$, self_a::text || '/files/' || gen_random_uuid()::text || '/original.jpg', a));

  insert into storage.objects (bucket_id, name, owner, metadata) values ('personal-vault', path, a, '{"size": 2048}'::jsonb);
  update public.vault_files set status = 'stored' where id = f;
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('confirming records the size storage holds and the time',
    (select status = 'stored' and file_size_bytes = 2048 and uploaded_at is not null from public.vault_files where id = f));
  perform pg_temp.expect_true('the controller''s activity shows the file was added, by role not by name',
    exists (select 1 from public.subject_activity where subject_id = self_a and action = 'added' and entity_title = 'Passport' and actor_role = 'self'));

  -- ---- constraints ---------------------------------------------------------------------------
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('unknown category refused',
    $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('aadhaar_numbers', 'x', 'x.pdf', 'application/pdf', 10)$s$);
  perform pg_temp.expect_blocked('unsupported file type refused',
    $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('other', 'x', 'x.exe', 'application/x-msdownload', 10)$s$);
  perform pg_temp.expect_blocked('blank title refused',
    $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('other', '   ', 'x.pdf', 'application/pdf', 10)$s$);
  perform pg_temp.expect_blocked('over 20 MB refused',
    $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('other', 'x', 'x.pdf', 'application/pdf', 20971521)$s$);
  perform pg_temp.expect_blocked('cannot choose uploader, role, status or path',
    $s$insert into public.vault_files (uploaded_by, uploaded_by_role, category, title, original_filename, mime_type, file_size_bytes, status, storage_path) values (gen_random_uuid(), 'self', 'other', 'x', 'x.pdf', 'application/pdf', 10, 'stored', 'a/b')$s$);
  perform pg_temp.expect_blocked('an old category name is refused', $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('vehicle', 'x', 'x.pdf', 'application/pdf', 10)$s$);
  perform pg_temp.expect_blocked('a blank kind is refused', $s$insert into public.vault_files (category, kind, title, original_filename, mime_type, file_size_bytes) values ('identity', '   ', 'x', 'x.pdf', 'application/pdf', 10)$s$);
  perform pg_temp.expect_blocked('an over-long kind is refused', format($s$insert into public.vault_files (category, kind, title, original_filename, mime_type, file_size_bytes) values ('identity', %L, 'x', 'x.pdf', 'application/pdf', 10)$s$, repeat('k', 41)));

  update public.vault_files set title = 'Passport (Ravi)', category = 'identity', expires_on = date '2031-03-14' where id = f;
  perform pg_temp.expect_true('controller can rename, re-file and set an expiry',
    (select title = 'Passport (Ravi)' and expires_on = date '2031-03-14' from public.vault_files where id = f));
  perform pg_temp.expect_blocked('file path cannot change', format($s$update public.vault_files set storage_path = 'x/y' where id = %L$s$, f));
  perform pg_temp.expect_blocked('file type cannot change', format($s$update public.vault_files set mime_type = 'application/pdf' where id = %L$s$, f));
  perform pg_temp.expect_blocked('size cannot be rewritten', format($s$update public.vault_files set file_size_bytes = 5 where id = %L$s$, f));
  perform pg_temp.expect_blocked('stored file cannot go back to pending', format($s$update public.vault_files set status = 'pending_upload' where id = %L$s$, f));
  perform pg_temp.expect_blocked('uploader cannot be rewritten', format($s$update public.vault_files set uploaded_by = %L where id = %L$s$, b, f));
  perform pg_temp.expect_blocked('uploader role cannot be rewritten', format($s$update public.vault_files set uploaded_by_role = 'manager' where id = %L$s$, f));
  kid := public.create_relative('Child A', 'child', date '2018-05-01', true);
  perform pg_temp.expect_blocked('file cannot be moved to another person', format($s$update public.vault_files set subject_id = %L where id = %L$s$, kid, f));

  -- ---- the controller adds for a relative they look after -------------------------------------
  insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes)
  values (kid, 'education', 'Birth certificate', 'bc.pdf', 'application/pdf', 500) returning id into fk;
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('controller upload for a relative: role custodian, path keyed by the relative',
    (select uploaded_by = a and uploaded_by_role = 'custodian' and storage_path = kid::text || '/files/' || fk::text || '/original.pdf' from public.vault_files where id = fk));

  -- ---- D1: a manager can add a document for the person -----------------------------------------
  perform pg_temp.act_as(c);
  insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes)
  values (self_a, 'insurance', 'Health policy', 'pol.pdf', 'application/pdf', 700) returning id into fm;
  perform pg_temp.as_admin();
  select storage_path into mpath from public.vault_files where id = fm;
  perform pg_temp.expect_true('manager upload: subject is the person, uploader is the manager, role manager',
    (select subject_id = self_a and uploaded_by = c and uploaded_by_role = 'manager' from public.vault_files where id = fm));
  perform pg_temp.expect_true('manager path is the PERSON''s folder, not the manager''s', mpath = self_a::text || '/files/' || fm::text || '/original.pdf');
  perform pg_temp.act_as(c);
  insert into storage.objects (bucket_id, name, owner, metadata) values ('personal-vault', mpath, c, '{"size": 900}'::jsonb);
  update public.vault_files set status = 'stored', title = 'Health policy 2026' where id = fm;
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('the controller sees the manager''s upload', exists (select 1 from public.vault_files where id = fm and status = 'stored'));
  perform pg_temp.expect_true('the controller''s activity says a manager added it',
    exists (select 1 from public.subject_activity where subject_id = self_a and action = 'added' and actor_role = 'manager'));
  perform pg_temp.act_as(c);
  perform pg_temp.expect_true('the manager sees no activity rows at all', not exists (select 1 from public.subject_activity));
  perform pg_temp.expect_blocked('a manager cannot add for a person they have no access to',
    format($s$insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes) values (%L, 'other', 'x', 'x.pdf', 'application/pdf', 10)$s$, kid));
  perform pg_temp.expect_blocked('a manager cannot touch the controller''s file',
    format($s$update public.vault_files set title = 'hijack' where id = %L$s$, f));
  perform pg_temp.expect_blocked('a manager cannot edit another uploader''s file at all (zero rows)', format($s$update public.vault_files set title = 'y' where id = %L and title <> 'y'$s$, f));
  update public.vault_files set expires_on = date '2030-01-01' where id = fm;
  get diagnostics n = row_count;
  perform pg_temp.expect_true('manager edit of their own upload works', n = 1);

  -- ---- viewer: reads and opens, never writes ---------------------------------------------------
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('viewer sees the person''s files', exists (select 1 from public.vault_files where id = f) and exists (select 1 from public.vault_files where id = fm));
  perform pg_temp.expect_true('viewer can open a stored file', exists (select 1 from storage.objects where bucket_id = 'personal-vault' and name = path));
  perform pg_temp.expect_true('viewer does not see the relative''s file (no grant on that person)', not exists (select 1 from public.vault_files where id = fk));
  perform pg_temp.expect_blocked('viewer cannot add a file',
    format($s$insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes) values (%L, 'other', 'x', 'x.pdf', 'application/pdf', 10)$s$, self_a));
  perform pg_temp.expect_blocked('viewer cannot edit', format($s$update public.vault_files set title = 'y' where id = %L$s$, f));
  perform pg_temp.expect_blocked('viewer cannot delete a row', format($s$delete from public.vault_files where id = %L$s$, f));
  perform pg_temp.expect_blocked('viewer cannot delete the stored file', format($s$delete from storage.objects where bucket_id = 'personal-vault' and name = %L$s$, path));
  perform pg_temp.expect_blocked('viewer cannot ask to delete', format($s$select public.vault_delete_check(%L)$s$, f));

  -- ---- stranger and anonymous ------------------------------------------------------------------
  perform pg_temp.act_as(d);
  perform pg_temp.expect_true('stranger sees no files', not exists (select 1 from public.vault_files));
  perform pg_temp.expect_true('stranger cannot open any stored file', not exists (select 1 from storage.objects where bucket_id = 'personal-vault'));
  perform pg_temp.expect_blocked('stranger cannot add a file for someone else',
    format($s$insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes) values (%L, 'other', 'x', 'x.pdf', 'application/pdf', 10)$s$, self_a));
  perform pg_temp.expect_blocked('stranger cannot ask to delete', format($s$select public.vault_delete_check(%L)$s$, f));
  perform pg_temp.act_as(null, 'anon');
  perform pg_temp.expect_blocked('anonymous cannot read', 'select * from public.vault_files');

  -- ---- D2: delete rules ------------------------------------------------------------------------
  -- a manager can ask to delete their own upload, not the controller's
  perform pg_temp.act_as(c);
  perform pg_temp.expect_true('manager may delete their own upload', public.vault_delete_check(fm) = mpath);
  perform pg_temp.expect_blocked('manager may not delete the controller''s file', format($s$select public.vault_delete_check(%L)$s$, f));
  -- the row cannot be deleted while the object is still stored (object first)
  perform pg_temp.expect_blocked('row delete is refused while the stored file still exists', format($s$select public.vault_delete_file(%L)$s$, fm));
  perform pg_temp.expect_blocked('the app cannot delete a stored object directly', format($s$delete from storage.objects where bucket_id = 'personal-vault' and name = %L$s$, mpath));
  perform pg_temp.as_admin();
  delete from storage.objects where bucket_id = 'personal-vault' and name = mpath;  -- what the Edge Function does
  perform pg_temp.act_as(c);
  perform public.vault_delete_file(fm);
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('manager''s own upload is deleted', not exists (select 1 from public.vault_files where id = fm));
  perform pg_temp.expect_true('the delete is in the audit log with roles, not file content',
    exists (select 1 from public.audit_logs where action = 'vault.file_deleted' and entity_id = fm and user_id = a
            and details ->> 'deleted_by_role' = 'manager' and (details ->> 'deleted_by_uploader')::boolean and not (details ? 'title')));
  perform pg_temp.expect_true('and in the controller''s activity',
    exists (select 1 from public.subject_activity where subject_id = self_a and action = 'deleted' and entity_title = 'Health policy 2026' and actor_role = 'manager'));

  -- a manager whose access was revoked can no longer delete what they uploaded
  perform pg_temp.act_as(c);
  insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes)
  values (self_a, 'other', 'Another', 'o.pdf', 'application/pdf', 10) returning id into fm2;
  insert into storage.objects (bucket_id, name, owner, metadata)
  select 'personal-vault', storage_path, c, '{"size": 10}'::jsonb from public.vault_files where id = fm2;
  update public.vault_files set status = 'stored' where id = fm2;
  perform pg_temp.as_admin();
  update public.subject_access set status = 'revoked', revoked_at = now() where grantee_user_id = c and subject_id = self_a;
  perform pg_temp.act_as(c);
  perform pg_temp.expect_blocked('a revoked manager cannot delete what they uploaded', format($s$select public.vault_delete_check(%L)$s$, fm2));
  perform pg_temp.expect_true('a revoked manager sees nothing', not exists (select 1 from public.vault_files));
  perform pg_temp.expect_blocked('a revoked manager cannot add', format($s$insert into public.vault_files (subject_id, category, title, original_filename, mime_type, file_size_bytes) values (%L, 'other', 'x', 'x.pdf', 'application/pdf', 10)$s$, self_a));
  -- ...but the controller can delete a file somebody else uploaded
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('the controller may delete any file of their person', public.vault_delete_check(fm2) is not null);
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('uploader attribution is kept though the uploader lost access', (select uploaded_by = c and uploaded_by_role = 'manager' from public.vault_files where id = fm2));

  -- viewer revocation and expiry
  update public.subject_access set status = 'revoked', revoked_at = now() where grantee_user_id = b and subject_id = self_a;
  perform pg_temp.act_as(b);
  perform pg_temp.expect_true('revoked viewer sees no files', not exists (select 1 from public.vault_files));
  perform pg_temp.expect_true('revoked viewer cannot open the file', not exists (select 1 from storage.objects where bucket_id = 'personal-vault'));

  -- controller deletes their own: object, then row
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('controller may delete the file', public.vault_delete_check(f) = path);
  perform pg_temp.as_admin();
  delete from storage.objects where bucket_id = 'personal-vault' and name = path;
  perform pg_temp.act_as(a);
  perform public.vault_delete_file(f);
  perform pg_temp.as_admin();
  perform pg_temp.expect_true('controller delete: row gone', not exists (select 1 from public.vault_files where id = f));
  perform pg_temp.expect_true('controller delete is audited with role self',
    exists (select 1 from public.audit_logs where action = 'vault.file_deleted' and entity_id = f and details ->> 'deleted_by_role' = 'self'));

  -- ---- the uploader leaves: the person keeps the file, attribution survives ---------------------
  perform pg_temp.as_admin();
  delete from auth.users where id = c;
  perform pg_temp.expect_true('when the uploader''s account is deleted the file stays with the person, uploader becomes unknown',
    (select uploaded_by is null and uploaded_by_role = 'manager' and subject_id = self_a from public.vault_files where id = fm2));
  perform pg_temp.act_as(a);
  perform pg_temp.expect_true('and the person''s controller still reads it', exists (select 1 from public.vault_files where id = fm2));

  -- ---- cascades are not logged as deliberate deletes --------------------------------------------
  perform pg_temp.as_admin();
  delete from public.subjects where id = kid;
  perform pg_temp.expect_true('deleting a person removes their files without writing per-file delete entries',
    not exists (select 1 from public.vault_files where id = fk) and not exists (select 1 from public.audit_logs where action = 'vault.file_deleted' and entity_id = fk));

  -- ---- an account being deleted can add nothing -------------------------------------------------
  insert into private.account_deletions (user_id) values (a);
  perform pg_temp.act_as(a);
  perform pg_temp.expect_blocked('no new file once account deletion has started',
    $s$insert into public.vault_files (category, title, original_filename, mime_type, file_size_bytes) values ('other', 'x', 'x.pdf', 'application/pdf', 10)$s$);
  perform pg_temp.as_admin();
  delete from private.account_deletions where user_id = a;

  raise notice 'ALL VAULT FILE CHECKS PASSED';
end $$;

rollback;
