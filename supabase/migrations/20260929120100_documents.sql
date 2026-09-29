-- =============================================================================
-- Phase 1 · Migration 2 — medical documents + processing lifecycle
--
-- A `documents` row is the metadata for ONE original file the user uploaded.
-- The original file itself lives in the private `medical-documents` Storage
-- bucket (next migration) at a path the DATABASE decides:
--
--     <user_id>/documents/<document_id>/original.pdf
--
-- Security model (enforced here, not in app code):
--   * RLS: a user only ever sees/creates/changes their own rows.
--   * The app can create a row, then make exactly ONE status change:
--       pending_upload → uploaded   (only once the file really exists)
--     Every later lifecycle step (processing → … → completed/failed) can only
--     be made server-side (service role, e.g. the Phase 2 Edge Function).
--   * Identity/source fields (owner, path, filename, type, size…) are
--     immutable for everyone once written — the original is source evidence.
--   * Every status change is written to `document_status_history` (audit).
-- =============================================================================

create type public.document_status as enum (
  'pending_upload',  -- row reserved; original file not yet in Storage
  'uploaded',        -- original stored & verified; waiting for processing (end state of Phase 1)
  'processing',      -- server-side extraction running (Phase 2)
  'extracted',       -- raw extraction produced (Phase 2)
  'validated',       -- extraction checked / validated (Phase 2)
  'completed',       -- structured data committed to Health Memory (Phase 2+)
  'failed'           -- processing failed; see processing_error
);

create type public.document_source as enum ('upload', 'camera');

-- What kind of document this is. Starts 'unclassified'; set server-side.
-- New kinds are added later with `alter type … add value`.
create type public.document_type as enum ('unclassified', 'blood_test', 'other');

create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source            public.document_source not null default 'upload',
  document_type     public.document_type not null default 'unclassified',
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type         text not null check (mime_type in ('application/pdf')),
  file_size_bytes   bigint not null check (file_size_bytes > 0 and file_size_bytes <= 20971520), -- 20 MB
  storage_bucket    text not null default 'medical-documents' check (storage_bucket = 'medical-documents'),
  storage_path      text not null unique,
  status            public.document_status not null default 'pending_upload',
  processing_error  text check (processing_error is null or char_length(processing_error) <= 1000),
  uploaded_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint documents_uploaded_at_matches_status
    check ((status = 'pending_upload') = (uploaded_at is null))
);

comment on table public.documents is
  'Metadata for original medical documents uploaded by a user. The original file is immutable source evidence in Storage.';
comment on column public.documents.storage_path is
  'Set by the database: <user_id>/documents/<id>/original.<ext>. Never chosen by the client.';
comment on column public.documents.processing_error is
  'Server-written, user-safe description of why processing failed (status = failed).';

create index documents_user_created_idx on public.documents (user_id, created_at desc);
-- Work queue for the Phase 2 processor.
create index documents_processing_queue_idx on public.documents (status, uploaded_at)
  where status in ('uploaded', 'processing');

-- -----------------------------------------------------------------------------
-- Storage path — single source of truth for where an original lives.
-- -----------------------------------------------------------------------------
create or replace function private.document_storage_path(p_user_id uuid, p_document_id uuid, p_mime_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_user_id::text || '/documents/' || p_document_id::text || '/original.' ||
    case p_mime_type
      when 'application/pdf' then 'pdf'
    end
$$;

-- Is `from_status → to_status` a legal lifecycle step?
create or replace function private.document_status_transition_allowed(
  from_status public.document_status,
  to_status   public.document_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (from_status, to_status) in (
    ('pending_upload'::public.document_status, 'uploaded'::public.document_status),
    ('uploaded',   'processing'),
    ('uploaded',   'failed'),
    ('processing', 'extracted'),
    ('processing', 'failed'),
    ('extracted',  'validated'),
    ('extracted',  'failed'),
    ('validated',  'completed'),
    ('validated',  'failed'),
    ('failed',     'processing'),  -- retry
    ('completed',  'processing')   -- re-process with an improved pipeline
  )
$$;

-- True for requests made by the mobile app (a signed-in or anonymous JWT).
-- Service-role requests and direct database sessions are trusted server code.
create or replace function private.is_app_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') in ('authenticated', 'anon')
$$;

-- -----------------------------------------------------------------------------
-- BEFORE INSERT — the server decides ownership, path and initial state.
-- -----------------------------------------------------------------------------
create or replace function private.documents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_app_request() then
    new.user_id          := auth.uid();
    new.status           := 'pending_upload';
    new.document_type    := 'unclassified';
    new.processing_error := null;
    new.uploaded_at      := null;
  end if;

  if new.user_id is null then
    raise exception 'documents: a document must belong to a user' using errcode = '42501';
  end if;

  new.storage_bucket := 'medical-documents';
  new.storage_path   := private.document_storage_path(new.user_id, new.id, new.mime_type);
  if new.storage_path is null then
    raise exception 'documents: unsupported file type %', new.mime_type using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger documents_before_insert
  before insert on public.documents
  for each row execute function private.documents_before_insert();

-- -----------------------------------------------------------------------------
-- BEFORE UPDATE — immutability + lifecycle rules.
-- -----------------------------------------------------------------------------
create or replace function private.documents_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_size bigint;
begin
  -- Source evidence never changes, for anyone.
  if new.id                is distinct from old.id
  or new.user_id           is distinct from old.user_id
  or new.source            is distinct from old.source
  or new.original_filename is distinct from old.original_filename
  or new.mime_type         is distinct from old.mime_type
  or new.storage_bucket    is distinct from old.storage_bucket
  or new.storage_path      is distinct from old.storage_path
  or new.created_at        is distinct from old.created_at then
    raise exception 'documents: document identity and source fields are immutable' using errcode = '42501';
  end if;

  -- The app may only confirm its own upload. Everything else is server-side.
  if private.is_app_request() then
    if not (old.status = 'pending_upload' and new.status = 'uploaded') then
      raise exception 'documents: this change can only be made by the server' using errcode = '42501';
    end if;
    if new.document_type    is distinct from old.document_type
    or new.processing_error is distinct from old.processing_error
    or new.file_size_bytes  is distinct from old.file_size_bytes then
      raise exception 'documents: this change can only be made by the server' using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status
     and not private.document_status_transition_allowed(old.status, new.status) then
    raise exception 'documents: status cannot change from % to %', old.status, new.status using errcode = '22023';
  end if;

  -- Confirming an upload: the original must really be in Storage.
  if old.status = 'pending_upload' and new.status = 'uploaded' then
    select (o.metadata ->> 'size')::bigint
      into stored_size
      from storage.objects o
     where o.bucket_id = new.storage_bucket
       and o.name      = new.storage_path;
    if not found then
      raise exception 'documents: the original file has not been uploaded yet' using errcode = 'P0002';
    end if;
    -- Record the size Storage actually holds, not what the client claimed.
    if stored_size is not null then
      new.file_size_bytes := stored_size;
    end if;
    new.uploaded_at := now();
  end if;

  if new.status = 'pending_upload' then
    new.uploaded_at := null;
  end if;

  return new;
end;
$$;

create trigger documents_before_update
  before update on public.documents
  for each row execute function private.documents_before_update();

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit trail of every lifecycle change (append-only; written by trigger).
-- -----------------------------------------------------------------------------
create table public.document_status_history (
  id          bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  from_status public.document_status,
  to_status   public.document_status not null,
  changed_by  text not null,  -- 'authenticated' (the app), 'service_role' (server) or 'system'
  created_at  timestamptz not null default now()
);

comment on table public.document_status_history is
  'Append-only audit log of documents.status changes. Written only by trigger.';

create index document_status_history_document_idx
  on public.document_status_history (document_id, created_at);
create index document_status_history_user_idx
  on public.document_status_history (user_id);

create or replace function private.documents_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.document_status_history (document_id, user_id, from_status, to_status, changed_by)
    values (
      new.id,
      new.user_id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      coalesce(auth.role(), 'system')
    );
  end if;
  return null;
end;
$$;

create trigger documents_log_status
  after insert or update of status on public.documents
  for each row execute function private.documents_log_status();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.document_status_history enable row level security;

create policy "documents_select_own"
  on public.documents for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "documents_insert_own"
  on public.documents for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "documents_update_own"
  on public.documents for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Only abandoned, never-completed uploads may be deleted from the app.
-- Uploaded originals are source evidence; deleting them (e.g. account
-- deletion) is a server-side flow.
create policy "documents_delete_own_abandoned"
  on public.documents for delete
  to authenticated
  using ((select auth.uid()) = user_id and status = 'pending_upload');

create policy "document_status_history_select_own"
  on public.document_status_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Column-level least privilege (defence in depth on top of RLS + triggers).
revoke all on public.documents from anon, authenticated;
grant select, delete on public.documents to authenticated;
grant insert (source, original_filename, mime_type, file_size_bytes) on public.documents to authenticated;
grant update (status) on public.documents to authenticated;

revoke all on public.document_status_history from anon, authenticated;
grant select on public.document_status_history to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
