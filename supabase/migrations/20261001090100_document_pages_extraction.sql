-- =============================================================================
-- Approved for Gate 1 (reviewed 2026-10-06) · Health data model 2/4
-- documents enrichment · document_pages · extraction_runs · derivatives bucket
--
-- Everything here is written ONLY by server code (service role, e.g. the
-- Phase 2 processing Edge Function). The app can read its own rows.
-- The original PDF is never modified: pages, text and images are DERIVED
-- copies stored separately.
-- =============================================================================

-- More document kinds (values are added, never removed).
alter type public.document_type add value if not exists 'prescription';
alter type public.document_type add value if not exists 'discharge_summary';
alter type public.document_type add value if not exists 'consultation_note';
alter type public.document_type add value if not exists 'imaging_report';
alter type public.document_type add value if not exists 'vaccination_record';

-- Server-derived metadata about the original (never edits the file itself).
alter table public.documents
  add column page_count     integer check (page_count is null or page_count between 1 and 2000),
  add column content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  add column title          text check (title is null or char_length(title) <= 200),
  add column report_date    date,
  add column provider_name  text check (provider_name is null or char_length(provider_name) <= 200);

comment on column public.documents.content_sha256 is
  'SHA-256 of the stored original, computed server-side. Write-once: proves the original never changed.';

-- content_sha256 / page_count are write-once facts about the original.
create or replace function private.documents_write_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.content_sha256 is not null and new.content_sha256 is distinct from old.content_sha256 then
    raise exception 'documents: content_sha256 is write-once' using errcode = '42501';
  end if;
  if old.page_count is not null and new.page_count is distinct from old.page_count then
    raise exception 'documents: page_count is write-once' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger documents_write_once
  before update on public.documents
  for each row execute function private.documents_write_once();

-- -----------------------------------------------------------------------------
-- extraction_runs — one row per processing attempt, so every AI-derived fact
-- records exactly which pipeline/model/prompt produced it.
-- -----------------------------------------------------------------------------
create type public.extraction_run_status as enum ('queued', 'running', 'succeeded', 'failed');

create table public.extraction_runs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  document_id         uuid not null,
  status              public.extraction_run_status not null default 'queued',
  pipeline_version    text not null check (char_length(pipeline_version) between 1 and 64),
  model_provider      text check (model_provider is null or char_length(model_provider) <= 64),
  model_name          text check (model_name is null or char_length(model_name) <= 128),
  prompt_version      text check (prompt_version is null or char_length(prompt_version) <= 64),
  -- Raw structured output kept for audit, in the private derivatives bucket.
  output_storage_path text,
  error_code          text check (error_code is null or error_code ~ '^[a-z0-9_]{1,64}$'),
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint extraction_runs_id_user_key unique (id, user_id),
  constraint extraction_runs_document_fk foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade,
  constraint extraction_runs_times check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index extraction_runs_document_idx on public.extraction_runs (document_id, created_at desc);
create index extraction_runs_user_idx on public.extraction_runs (user_id);

create trigger extraction_runs_set_updated_at
  before update on public.extraction_runs
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- document_pages — one row per page of the original: extracted text and an
-- optional rendered image (for showing evidence highlights).
-- -----------------------------------------------------------------------------
create type public.page_text_source as enum ('pdf_text_layer', 'ocr');

create table public.document_pages (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  document_id        uuid not null,
  page_number        integer not null check (page_number between 1 and 2000),
  text_content       text,
  text_source        public.page_text_source,
  image_storage_path text,
  width_pt           numeric(8, 2) check (width_pt is null or width_pt > 0),
  height_pt          numeric(8, 2) check (height_pt is null or height_pt > 0),
  extraction_run_id  uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint document_pages_number_key unique (document_id, page_number),
  constraint document_pages_id_user_key unique (id, user_id),
  constraint document_pages_id_document_key unique (id, document_id),
  constraint document_pages_document_fk foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade,
  constraint document_pages_run_fk foreign key (extraction_run_id, user_id)
    references public.extraction_runs (id, user_id),
  constraint document_pages_text_source check ((text_content is null) = (text_source is null))
);

create index document_pages_user_idx on public.document_pages (user_id);
create index document_pages_run_idx on public.document_pages (extraction_run_id);

create trigger document_pages_set_updated_at
  before update on public.document_pages
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS — read own; no client writes at all (server uses the service role).
-- -----------------------------------------------------------------------------
alter table public.extraction_runs enable row level security;
alter table public.document_pages enable row level security;

create policy "extraction_runs_select_own" on public.extraction_runs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "document_pages_select_own" on public.document_pages for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.extraction_runs, public.document_pages from anon, authenticated;
grant select on public.extraction_runs, public.document_pages to authenticated;

-- -----------------------------------------------------------------------------
-- Private bucket for server-generated derivatives:
--   <user_id>/documents/<document_id>/pages/<page_number>.webp
--   <user_id>/documents/<document_id>/runs/<extraction_run_id>.json
-- Owners can read; only server code can write.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('document-derivatives', 'document-derivatives', false, 20971520,
        array['image/webp', 'image/png', 'image/jpeg', 'application/json'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "document_derivatives_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'document-derivatives'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Audit every lifecycle change of an extraction run.
create or replace function private.audit_extraction_runs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform private.write_audit(new.user_id, 'extraction_run.' || new.status::text, 'extraction_runs', new.id,
      jsonb_build_object('document_id', new.document_id, 'pipeline_version', new.pipeline_version,
                         'model_name', new.model_name, 'error_code', new.error_code));
  end if;
  return null;
end;
$$;

create trigger extraction_runs_audit
  after insert or update of status on public.extraction_runs
  for each row execute function private.audit_extraction_runs();

revoke all on all functions in schema private from public, anon, authenticated;
