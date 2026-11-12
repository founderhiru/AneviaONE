-- =============================================================================
-- Vault files — a person's own documents kept in one private place.
--
-- Storage only. Nothing here reads, classifies, indexes or sends a file anywhere
-- (no AI, no text extraction, no search inside files). It is separate from the
-- health report pipeline: its own table and its own private bucket.
--
--   * Table public.vault_files: person (subject), category, title, optional expiry date.
--   * Bucket `personal-vault`: PRIVATE, 20 MB, PDF / JPEG / PNG / HEIC only.
--   * Layout: <user_id>/files/<file_id>/original.<ext>  (database-assigned).
--   * The OWNER of the person (subjects: coalesce(linked_user_id, created_by)) uploads,
--     edits and deletes. People with an approved grant can read and open, never write
--     (the same rule as health reports: "uploader = owner").
--   * Account deletion: rows cascade from auth.users and subjects; the delete-account
--     function must also empty this bucket (it lists personal-vault in ACCOUNT_BUCKETS).
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
  user_id           uuid not null references auth.users (id) on delete cascade,
  subject_id        uuid not null references public.subjects (id) on delete cascade,
  category          text not null check (category in
                      ('identity', 'insurance', 'education', 'property', 'legal', 'vehicle', 'certificate', 'other')),
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
  'A person''s own stored documents (IDs, policies, certificates...). Files are never read or sent to AI. Original file is in the private personal-vault bucket.';

create index vault_files_subject_idx on public.vault_files (subject_id, created_at desc);
create index vault_files_user_idx on public.vault_files (user_id);

-- Where a file lives: the database decides, never the app.
create or replace function private.vault_file_path(p_user_id uuid, p_file_id uuid, p_mime_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_user_id::text || '/files/' || p_file_id::text || '/original.' ||
    case p_mime_type
      when 'application/pdf' then 'pdf'
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'image/heic' then 'heic'
    end
$$;

-- BEFORE INSERT: the server decides owner, person, path and starting state.
create or replace function private.vault_files_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_app_request() then
    new.user_id     := auth.uid();
    new.status      := 'pending_upload';
    new.uploaded_at := null;
    -- No person named: the account holder's own record.
    if new.subject_id is null then
      select s.id into new.subject_id from public.subjects s where s.linked_user_id = auth.uid();
    end if;
    -- Only the OWNER of that person may add files for them.
    if new.subject_id is null or not public.can_access_subject(new.subject_id, 'manage') then
      raise exception 'vault_files: you can only add files for yourself or a relative you manage' using errcode = '42501';
    end if;
  end if;

  if new.user_id is null then
    raise exception 'vault_files: a file must belong to a user' using errcode = '42501';
  end if;

  if private.account_deletion_started(new.user_id) then
    raise exception 'vault_files: this account is being deleted' using errcode = '42501';
  end if;

  new.title        := btrim(new.title);
  new.storage_path := private.vault_file_path(new.user_id, new.id, new.mime_type);
  if new.storage_path is null then
    raise exception 'vault_files: unsupported file type %', new.mime_type using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger vault_files_before_insert
  before insert on public.vault_files
  for each row execute function private.vault_files_before_insert();

-- BEFORE UPDATE: identity and the original file are frozen; the app may rename, re-file,
-- set an expiry, and confirm its own upload. Nothing else.
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
  or new.user_id           is distinct from old.user_id
  or new.subject_id        is distinct from old.subject_id
  or new.original_filename is distinct from old.original_filename
  or new.mime_type         is distinct from old.mime_type
  or new.storage_path      is distinct from old.storage_path
  or new.created_at        is distinct from old.created_at then
    raise exception 'vault_files: identity and file fields are immutable' using errcode = '42501';
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

-- -----------------------------------------------------------------------------
-- Row Level Security: read by anyone with access to the person; write by the owner only.
-- -----------------------------------------------------------------------------
alter table public.vault_files enable row level security;

create policy "vault_files_select_accessible"
  on public.vault_files for select to authenticated
  using (public.can_access_subject(subject_id, 'read'));

create policy "vault_files_insert_owner"
  on public.vault_files for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_access_subject(subject_id, 'manage'));

create policy "vault_files_update_owner"
  on public.vault_files for update to authenticated
  using (public.can_access_subject(subject_id, 'manage'))
  with check (public.can_access_subject(subject_id, 'manage'));

create policy "vault_files_delete_owner"
  on public.vault_files for delete to authenticated
  using (public.can_access_subject(subject_id, 'manage'));

revoke all on public.vault_files from public, anon, authenticated;
grant select on public.vault_files to authenticated;
grant insert (subject_id, category, title, original_filename, mime_type, file_size_bytes, expires_on) on public.vault_files to authenticated;
grant update (title, category, expires_on, status) on public.vault_files to authenticated;
grant delete on public.vault_files to authenticated;
grant all on public.vault_files to service_role;

-- -----------------------------------------------------------------------------
-- Storage policies for the private bucket.
--   SELECT  your own folder, or the file of a person you have approved access to.
--   INSERT  your own folder, at the exact path of YOUR file that is still pending.
--   DELETE  your own folder, owner only (the app removes the file, then its row).
--   UPDATE  none: originals can never be overwritten.
-- -----------------------------------------------------------------------------
create policy "personal_vault_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'personal-vault' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "personal_vault_select_granted"
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

create policy "personal_vault_insert_own_pending"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'personal-vault'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.vault_files f
       where f.storage_path = objects.name
         and f.user_id = (select auth.uid())
         and f.status = 'pending_upload'
    )
  );

create policy "personal_vault_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'personal-vault' and (storage.foldername(name))[1] = (select auth.uid())::text);

revoke all on all functions in schema private from public, anon, authenticated;
