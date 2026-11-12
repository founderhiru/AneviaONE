-- =============================================================================
-- Vault files — a person's own documents kept in one private place.
--
-- Storage only. Nothing here reads, classifies, indexes or sends a file anywhere
-- (no AI, no text extraction, no search inside files). Separate from the health
-- report pipeline: its own table and its own private bucket.
--
-- OWNERSHIP MODEL (data-ownership spec, Phase 1). Four facts, stored separately and
-- never inferred from one user id:
--   * the RECORD SUBJECT     public.vault_files.subject_id     (whose record it is)
--   * the UPLOADER           public.vault_files.uploaded_by    (who added it; set null if they leave)
--   * the uploader's ROLE    public.vault_files.uploaded_by_role  (self | custodian | manager, as at upload time)
--   * the CONTROLLER / access  public.subjects + public.subject_access (who may see / manage now)
--
--   * Layout: <subject_id>/files/<file_id>/original.<ext>   (database-assigned).
--     A file belongs to the person, so it does not live under any user's folder and
--     survives the uploader leaving.
--   * Add: the controller, or a manager with valid `write` access (a family manager
--     can add a document for the person they look after).
--   * Edit / delete: the controller, or the uploader while their write access is valid.
--   * Read: anyone with `read` access to the person (stored files only).
--   * Deleting a file goes through the delete-vault-file Edge Function (object first, then
--     the audited row delete). Every delete is written to the audit log AND to
--     public.subject_activity, which the controller can read.
--
-- Additive only: no existing table, policy or function changes.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('personal-vault', 'personal-vault', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/heic'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table public.vault_files (
  id                uuid primary key default gen_random_uuid(),
  subject_id        uuid not null references public.subjects (id) on delete cascade,
  uploaded_by       uuid references auth.users (id) on delete set null,
  uploaded_by_role  text not null check (uploaded_by_role in ('self', 'custodian', 'manager')),
  category          text not null check (category in
                      ('identity', 'insurance', 'education', 'property_legal', 'photos', 'other')),
  kind              text check (kind is null or char_length(btrim(kind)) between 1 and 40),
  title             text not null check (char_length(btrim(title)) between 1 and 120),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type         text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic')),
  file_size_bytes   bigint not null check (file_size_bytes > 0 and file_size_bytes <= 20971520),
  storage_path      text not null unique,
  status            text not null default 'pending_upload' check (status in ('pending_upload', 'stored')),
  expires_on        date check (expires_on is null or (expires_on >= date '1900-01-01' and expires_on <= date '2200-01-01')),
  uploaded_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint vault_files_uploaded_at_matches_status check ((status = 'stored') = (uploaded_at is not null))
);

comment on table public.vault_files is
  'A person''s own stored documents (IDs, policies, certificates...). Belongs to the SUBJECT, not to the uploader. Files are never read or sent to AI. Original file is in the private personal-vault bucket under <subject_id>/.';

create index vault_files_subject_idx on public.vault_files (subject_id, created_at desc);
create index vault_files_uploader_idx on public.vault_files (uploaded_by);

-- Who controls a person's record right now. Phase 2 redefines this to read the custodian.
create or replace function private.subject_controller(p_subject uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(s.linked_user_id, s.created_by) from public.subjects s where s.id = p_subject
$$;

-- The caller's role towards a person: the person themself, their custodian, or a manager.
-- p_actor lets a trusted function name the caller; app requests always use auth.uid().
create or replace function private.vault_actor_role(p_subject uuid, p_actor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.linked_user_id = p_actor then 'self'
    when coalesce(s.linked_user_id, s.created_by) = p_actor then 'custodian'
    else 'manager'
  end
  from public.subjects s where s.id = p_subject
$$;

-- Where a file lives: the database decides, never the app.
create or replace function private.vault_file_path(p_subject_id uuid, p_file_id uuid, p_mime_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_subject_id::text || '/files/' || p_file_id::text || '/original.' ||
    case p_mime_type
      when 'application/pdf' then 'pdf'
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'image/heic' then 'heic'
    end
$$;

-- -----------------------------------------------------------------------------
-- A person's activity log: what was added or removed in their record, and by whom
-- (in role terms). Written only by triggers / functions. The controller reads it.
-- -----------------------------------------------------------------------------
create table public.subject_activity (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  action       text not null check (action in ('added', 'deleted')),
  entity_kind  text not null check (entity_kind in ('vault_file')),
  entity_title text not null,
  actor_role   text not null check (actor_role in ('self', 'custodian', 'manager')),
  at           timestamptz not null default now()
);

create index subject_activity_subject_idx on public.subject_activity (subject_id, at desc);

alter table public.subject_activity enable row level security;

create policy "subject_activity_select_controller"
  on public.subject_activity for select to authenticated
  using (public.can_access_subject(subject_id, 'manage'));

revoke all on public.subject_activity from public, anon, authenticated;
grant select on public.subject_activity to authenticated;
grant all on public.subject_activity to service_role;

-- BEFORE INSERT: the server decides who uploaded, in what role, the path and the starting state.
create or replace function private.vault_files_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_app_request() then
    new.uploaded_by := auth.uid();
    new.status      := 'pending_upload';
    new.uploaded_at := null;
    -- No person named: the account holder's own record.
    if new.subject_id is null then
      select s.id into new.subject_id from public.subjects s where s.linked_user_id = auth.uid();
    end if;
    -- The controller, or a manager with valid write access, may add files for that person.
    if new.subject_id is null or not public.can_access_subject(new.subject_id, 'write') then
      raise exception 'vault_files: you can only add files for yourself or a person you manage' using errcode = '42501';
    end if;
  end if;

  if new.uploaded_by is null then
    raise exception 'vault_files: a file must have an uploader' using errcode = '42501';
  end if;

  if private.account_deletion_started(new.uploaded_by) then
    raise exception 'vault_files: this account is being deleted' using errcode = '42501';
  end if;

  new.uploaded_by_role := private.vault_actor_role(new.subject_id, new.uploaded_by);
  new.title            := btrim(new.title);
  new.storage_path     := private.vault_file_path(new.subject_id, new.id, new.mime_type);
  if new.storage_path is null then
    raise exception 'vault_files: unsupported file type %', new.mime_type using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger vault_files_before_insert
  before insert on public.vault_files
  for each row execute function private.vault_files_before_insert();

-- BEFORE UPDATE: identity, uploader and the original file are frozen; the app may rename,
-- re-file, set an expiry, and confirm an upload. The one system change allowed to the
-- uploader columns: uploaded_by -> null when the uploader's account is deleted.
create or replace function private.vault_files_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_size bigint;
begin
  if new.id                is distinct from old.id
  or new.subject_id        is distinct from old.subject_id
  or new.uploaded_by_role  is distinct from old.uploaded_by_role
  or new.original_filename is distinct from old.original_filename
  or new.mime_type         is distinct from old.mime_type
  or new.storage_path      is distinct from old.storage_path
  or new.created_at        is distinct from old.created_at then
    raise exception 'vault_files: identity and file fields are immutable' using errcode = '42501';
  end if;

  if new.uploaded_by is distinct from old.uploaded_by and not (new.uploaded_by is null and old.uploaded_by is not null) then
    raise exception 'vault_files: the uploader cannot be changed' using errcode = '42501';
  end if;

  if new.status is distinct from old.status and not (old.status = 'pending_upload' and new.status = 'stored') then
    raise exception 'vault_files: status cannot change from % to %', old.status, new.status using errcode = '22023';
  end if;

  if old.status = 'pending_upload' and new.status = 'stored' then
    select (o.metadata ->> 'size')::bigint into stored_size
      from storage.objects o
     where o.bucket_id = 'personal-vault' and o.name = new.storage_path;
    if not found then
      raise exception 'vault_files: the file has not been uploaded yet' using errcode = 'P0002';
    end if;
    if stored_size is not null then
      new.file_size_bytes := stored_size;
    end if;
    new.uploaded_at := now();
  elsif private.is_app_request() and new.file_size_bytes is distinct from old.file_size_bytes then
    raise exception 'vault_files: file fields are immutable' using errcode = '42501';
  end if;

  new.title := btrim(new.title);
  return new;
end;
$$;

create trigger vault_files_before_update
  before update on public.vault_files
  for each row execute function private.vault_files_before_update();

create trigger vault_files_set_updated_at
  before update on public.vault_files
  for each row execute function private.set_updated_at();

-- AFTER UPDATE: a file becoming stored is "added" in the person's activity.
create or replace function private.vault_files_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending_upload' and new.status = 'stored' then
    insert into public.subject_activity (subject_id, action, entity_kind, entity_title, actor_role)
    values (new.subject_id, 'added', 'vault_file', new.title, new.uploaded_by_role);
  end if;
  return new;
end;
$$;

create trigger vault_files_after_update
  after update on public.vault_files
  for each row execute function private.vault_files_after_update();

-- AFTER DELETE: a deliberate delete is audited and shown to the person's controller.
-- Skipped when the row goes because its person is being deleted (the person no longer
-- exists when the cascade reaches this row): that has its own audit trail.
create or replace function private.vault_files_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := coalesce(auth.uid(), nullif(current_setting('hi.vault_actor', true), '')::uuid);
  actor_role text;
  controller uuid;
begin
  -- The row is going because its person is being deleted: no per-file entry (the person,
  -- and with them their activity log, are already gone).
  if not exists (select 1 from public.subjects s where s.id = old.subject_id) then
    return old;
  end if;

  -- A reservation that never became a stored file was never "added": nothing to log.
  if old.status <> 'stored' then
    return old;
  end if;

  actor_role := coalesce(private.vault_actor_role(old.subject_id, actor), 'custodian');
  controller := private.subject_controller(old.subject_id);

  insert into public.subject_activity (subject_id, action, entity_kind, entity_title, actor_role)
  values (old.subject_id, 'deleted', 'vault_file', old.title, actor_role);

  perform private.write_audit(
    controller, 'vault.file_deleted', 'vault_files', old.id,
    jsonb_build_object('subject_id', old.subject_id, 'category', old.category, 'kind', old.kind,
                       'deleted_by_role', actor_role, 'uploaded_by_role', old.uploaded_by_role,
                       'deleted_by_uploader', (old.uploaded_by is not null and old.uploaded_by is not distinct from actor))
  );
  return old;
end;
$$;

create trigger vault_files_after_delete
  after delete on public.vault_files
  for each row execute function private.vault_files_after_delete();

-- -----------------------------------------------------------------------------
-- Deleting a file: object first, then the row. Called by the delete-vault-file Edge Function
-- with the CALLER'S token, so auth.uid() is the person asking.
--   vault_delete_check  -> the path to remove, or an error if the caller may not delete it
--   vault_delete_file   -> deletes the row (audited); refuses while the object still exists
-- Allowed: the controller, or the uploader while their `write` access is still valid.
-- -----------------------------------------------------------------------------
create or replace function private.vault_can_delete(p_file uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vault_files f
     where f.id = p_file
       and auth.uid() is not null
       and (
         public.can_access_subject(f.subject_id, 'manage')
         or (f.uploaded_by = auth.uid() and public.can_access_subject(f.subject_id, 'write'))
       )
  )
$$;

create or replace function public.vault_delete_check(p_file uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path text;
begin
  if not private.vault_can_delete(p_file) then
    raise exception 'vault_files: you cannot delete this file' using errcode = '42501';
  end if;
  select f.storage_path into path from public.vault_files f where f.id = p_file;
  return path;
end;
$$;

create or replace function public.vault_delete_file(p_file uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  path text;
begin
  if not private.vault_can_delete(p_file) then
    raise exception 'vault_files: you cannot delete this file' using errcode = '42501';
  end if;
  select f.storage_path into path from public.vault_files f where f.id = p_file;
  if exists (select 1 from storage.objects o where o.bucket_id = 'personal-vault' and o.name = path) then
    raise exception 'vault_files: remove the stored file first' using errcode = '55000';
  end if;
  delete from public.vault_files where id = p_file;
end;
$$;

revoke all on function public.vault_delete_check(uuid) from public, anon;
revoke all on function public.vault_delete_file(uuid) from public, anon;
grant execute on function public.vault_delete_check(uuid) to authenticated, service_role;
grant execute on function public.vault_delete_file(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security.
--   SELECT  read access to the person, stored files only (the uploader also sees their own pending row)
--   INSERT  the uploader is the caller, with write access to the person
--   UPDATE  the controller, or the uploader while their write access is valid
--   DELETE  same rule; the app uses the delete-vault-file function (no direct DELETE grant)
-- -----------------------------------------------------------------------------
alter table public.vault_files enable row level security;

create policy "vault_files_select_accessible"
  on public.vault_files for select to authenticated
  using (
    public.can_access_subject(subject_id, 'read')
    and (status = 'stored' or uploaded_by = (select auth.uid()))
  );

create policy "vault_files_insert_writer"
  on public.vault_files for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and public.can_access_subject(subject_id, 'write'));

create policy "vault_files_update_controller_or_uploader"
  on public.vault_files for update to authenticated
  using (
    public.can_access_subject(subject_id, 'manage')
    or (uploaded_by = (select auth.uid()) and public.can_access_subject(subject_id, 'write'))
  )
  with check (
    public.can_access_subject(subject_id, 'manage')
    or (uploaded_by = (select auth.uid()) and public.can_access_subject(subject_id, 'write'))
  );

create policy "vault_files_delete_controller_or_uploader"
  on public.vault_files for delete to authenticated
  using (
    public.can_access_subject(subject_id, 'manage')
    or (uploaded_by = (select auth.uid()) and public.can_access_subject(subject_id, 'write'))
  );

revoke all on public.vault_files from public, anon, authenticated;
grant select on public.vault_files to authenticated;
grant insert (subject_id, category, kind, title, original_filename, mime_type, file_size_bytes, expires_on) on public.vault_files to authenticated;
grant update (title, category, kind, expires_on, status) on public.vault_files to authenticated;
grant all on public.vault_files to service_role;

-- -----------------------------------------------------------------------------
-- Storage policies for the private bucket. Access follows the PERSON, never a user folder.
--   SELECT  a stored file of a person you can read.
--   INSERT  only at the exact path of a pending file YOU reserved, with write access to the person.
--   DELETE  none for the app: removal goes through delete-vault-file (service role).
--   UPDATE  none: originals can never be overwritten.
-- -----------------------------------------------------------------------------
create policy "personal_vault_select_accessible"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'personal-vault'
    and exists (
      select 1 from public.vault_files f
       where f.storage_path = objects.name
         and f.status = 'stored'
         and public.can_access_subject(f.subject_id, 'read')
    )
  );

create policy "personal_vault_insert_pending_writer"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'personal-vault'
    and exists (
      select 1 from public.vault_files f
       where f.storage_path = objects.name
         and f.uploaded_by = (select auth.uid())
         and f.status = 'pending_upload'
         and public.can_access_subject(f.subject_id, 'write')
    )
  );

revoke all on all functions in schema private from public, anon, authenticated;
