-- =============================================================================
-- Gate 1 · migration 2/2 — document understanding
--
-- Builds on the reviewed health data model (20261001*). Minimal additions:
--
--   1. documents: failure code + retryability, attempt counter, processing
--      lease, current extraction run, report-person identity result.
--      (The existing lifecycle enum and transitions are reused unchanged.)
--   2. clinical facts: `fingerprint` (idempotency), `review_reason`,
--      the `needs_review` confidence gate, condition/allergy `assertion`,
--      observation normalisation rule + date basis.
--   3. current_* views now exclude needs_review facts — the gate that keeps
--      low-confidence data out of every longitudinal feature.
--   4. extraction_runs: error kind + counts-only stats.
--   5. health_profiles.full_name (optional, user-entered) for the
--      report-person check.
--   6. Three SERVER-ONLY functions (service role only):
--        claim_document_processing      atomic claim + retry/attempt rules
--        commit_document_extraction     ONE transaction: pages, facts,
--                                       supersession, run + lifecycle
--        fail_document_processing       run + document failure, atomically
--
-- Nothing here lets the app write extracted facts: the existing triggers and
-- column grants still apply.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. documents
-- -----------------------------------------------------------------------------
alter table public.documents
  add column failure_code               text
    check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,64}$'),
  add column failure_retryable          boolean,
  add column processing_attempts        integer not null default 0
    check (processing_attempts between 0 and 100),
  add column processing_started_at      timestamptz,
  add column current_extraction_run_id  uuid,
  add column identity_check             text not null default 'not_checked'
    check (identity_check in ('not_checked', 'match', 'mismatch', 'unverifiable')),
  add constraint documents_failure_only_when_failed
    check (status = 'failed' or (failure_code is null and failure_retryable is null)),
  add constraint documents_current_run_fk
    foreign key (current_extraction_run_id, user_id)
    references public.extraction_runs (id, user_id);

comment on column public.documents.failure_code is
  'Machine code for why processing failed (server-written). Never contains health content.';
comment on column public.documents.failure_retryable is
  'true = a plain retry may succeed (transient/provider). false = retrying will not help (unsupported or permanently invalid).';
comment on column public.documents.identity_check is
  'Report-person check result. mismatch = the report names a different person than the account profile; nothing was ingested.';
comment on column public.documents.current_extraction_run_id is
  'The extraction run whose facts are the trusted current set for this document.';

-- -----------------------------------------------------------------------------
-- 2. extraction_runs
-- -----------------------------------------------------------------------------
alter table public.extraction_runs
  add column error_kind text
    check (error_kind is null or error_kind in ('transient', 'permanent', 'unsupported', 'provider')),
  add column attempt integer check (attempt is null or attempt >= 1),
  add column stats jsonb not null default '{}'::jsonb
    check (jsonb_typeof(stats) = 'object');

comment on column public.extraction_runs.stats is
  'Counts only (pages, chunks, facts accepted/rejected/needs-review by reason code, token usage). Never health content.';

-- -----------------------------------------------------------------------------
-- 3. health_profiles.full_name (optional, for the report-person check)
-- -----------------------------------------------------------------------------
alter table public.health_profiles
  add column full_name text check (full_name is null or char_length(full_name) between 1 and 200);

grant insert (full_name) on public.health_profiles to authenticated;
grant update (full_name) on public.health_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 4. clinical facts
-- -----------------------------------------------------------------------------
create type public.fact_assertion as enum ('mentioned', 'reported', 'diagnosed');

do $$
declare
  t text;
begin
  foreach t in array array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies'] loop
    execute format($ddl$
      alter table public.%1$I
        add column fingerprint   text check (fingerprint is null or fingerprint ~ '^[0-9a-f]{64}$'),
        add column review_reason text check (review_reason is null or review_reason ~ '^[a-z0-9_]{1,64}$'),
        add constraint %1$s_extracted_has_fingerprint check (origin <> 'extracted' or fingerprint is not null),
        add constraint %1$s_needs_review_only_extracted check (review_status <> 'needs_review' or origin = 'extracted'),
        add constraint %1$s_needs_review_has_reason check (review_status <> 'needs_review' or review_reason is not null)
    $ddl$, t);
    execute format('create index %1$s_document_fingerprint_idx on public.%1$I (document_id, fingerprint)', t);
    -- The same fact can never be written twice by one run.
    execute format('create unique index %1$s_run_fingerprint_key on public.%1$I (extraction_run_id, fingerprint) where extraction_run_id is not null', t);
  end loop;
end
$$;

-- assertion level: a mention is not a diagnosis.
alter table public.conditions add column assertion public.fact_assertion not null default 'mentioned';
alter table public.allergies  add column assertion public.fact_assertion not null default 'mentioned';

-- observations: which deterministic rule produced the normalised value, and
-- where the effective date came from (never silently borrowed).
alter table public.observations
  add column normalization_rule   text check (normalization_rule is null or normalization_rule ~ '^[a-z0-9_]{1,80}$'),
  add column effective_date_basis text not null default 'none'
    check (effective_date_basis in ('observation', 'collection', 'report', 'none'));

-- -----------------------------------------------------------------------------
-- Fact triggers: add the needs_review rules (replaces the 20261001090200 bodies).
-- -----------------------------------------------------------------------------
create or replace function private.clinical_fact_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  matched integer;
begin
  if private.is_app_request() then
    new.user_id := auth.uid();
    if new.origin = 'extracted' then
      raise exception '%: only the server can record extracted facts', tg_table_name using errcode = '42501';
    end if;
    new.extraction_run_id := null;
    new.confidence        := null;
    new.fingerprint       := null;
    new.review_reason     := null;
    new.review_status     := 'confirmed';
    new.reviewed_at       := now();
  elsif new.origin = 'extracted' and new.review_status not in ('unreviewed', 'needs_review') then
    -- The server may propose facts; only a person can confirm or reject them.
    raise exception '%: extracted facts start unreviewed or needs_review', tg_table_name using errcode = '22023';
  end if;

  new.superseded_at := null;

  if new.supersedes_id is not null then
    execute format(
      'select id, document_id, document_page_id, source_text, superseded_at
         from public.%I where id = $1 and user_id = $2 for update', tg_table_name)
      into target using new.supersedes_id, new.user_id;
    get diagnostics matched = row_count;
    if matched = 0 then
      raise exception '%: the fact being corrected was not found', tg_table_name using errcode = 'P0002';
    end if;
    if target.superseded_at is not null then
      raise exception '%: that fact has already been corrected', tg_table_name using errcode = '22023';
    end if;
    if new.origin = 'user_corrected' and new.document_id is null then
      new.document_id      := target.document_id;
      new.document_page_id := target.document_page_id;
      new.source_text      := target.source_text;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.clinical_fact_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  internal boolean := coalesce(current_setting('hi.fact_supersede', true), 'off') = 'on';
  -- review_reason is mutable so the server can mark a fact "not found again on reprocess".
  always_mutable text[] := array['review_status', 'review_reason', 'reviewed_at', 'superseded_at', 'updated_at'];
  server_mutable text[] := coalesce(tg_argv::text[], '{}'::text[]);
begin
  if (to_jsonb(new) - (always_mutable || server_mutable)) is distinct from (to_jsonb(old) - (always_mutable || server_mutable)) then
    raise exception '%: recorded facts are immutable — add a correction instead', tg_table_name using errcode = '42501';
  end if;

  if new.superseded_at is distinct from old.superseded_at then
    if not internal or old.superseded_at is not null then
      raise exception '%: superseded_at is set only by recording a correction', tg_table_name using errcode = '42501';
    end if;
  end if;

  if private.is_app_request() and not internal then
    if (to_jsonb(new) - array['review_status', 'reviewed_at', 'superseded_at', 'updated_at'])
       is distinct from (to_jsonb(old) - array['review_status', 'reviewed_at', 'superseded_at', 'updated_at']) then
      raise exception '%: only the server can refine interpretations', tg_table_name using errcode = '42501';
    end if;
    if old.superseded_at is not null then
      raise exception '%: this fact has been corrected; review the correction instead', tg_table_name using errcode = '22023';
    end if;
    if new.review_status in ('unreviewed', 'needs_review') and new.review_status <> old.review_status then
      raise exception '%: a reviewed fact cannot go back to % ', tg_table_name, new.review_status using errcode = '22023';
    end if;
  end if;

  if new.review_status is distinct from old.review_status then
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. current_* views — THE CONFIDENCE GATE.
--    Trusted = not superseded AND (unreviewed-high-confidence OR confirmed).
--    needs_review and rejected facts are in no current_* view.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies'] loop
    execute format('drop view public.%I', 'current_' || t);
    execute format($ddl$
      create view public.%1$I with (security_invoker = true) as
        select * from public.%2$I
         where superseded_at is null
           and review_status in ('unreviewed', 'confirmed')
    $ddl$, 'current_' || t, t);
    execute format('revoke all on public.%I from anon, authenticated', 'current_' || t);
    execute format('grant select on public.%I to authenticated', 'current_' || t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 6. SERVER-ONLY functions. Each one refuses any caller except service_role
--    (defence in depth; EXECUTE is also revoked from every app role).
-- -----------------------------------------------------------------------------

-- 6a. Atomic claim ------------------------------------------------------------
create or replace function public.claim_document_processing(
  p_document_id  uuid,
  p_user_id      uuid,
  p_reprocess    boolean default false,
  p_max_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'claim_document_processing: server only' using errcode = '42501';
  end if;

  -- The caller's identity comes from the verified JWT, passed in by trusted
  -- server code; a document that is not theirs is simply "not found".
  select * into d from public.documents where id = p_document_id and user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;

  -- A run that died mid-way must not block the document forever.
  if d.status = 'processing'
     and d.processing_started_at is not null
     and d.processing_started_at < now() - interval '15 minutes' then
    update public.documents
       set status = 'failed', failure_code = 'processing_timeout', failure_retryable = true,
           processing_error = 'Reading this report took too long. Please try again.'
     where id = d.id;
    select * into d from public.documents where id = d.id;
  end if;

  if d.status = 'pending_upload' then
    return jsonb_build_object('claimed', false, 'reason', 'not_uploaded');
  elsif d.status = 'processing' then
    return jsonb_build_object('claimed', false, 'reason', 'already_processing');
  elsif d.status in ('extracted', 'validated') then
    return jsonb_build_object('claimed', false, 'reason', 'not_eligible');
  elsif d.processing_attempts >= p_max_attempts then
    return jsonb_build_object('claimed', false, 'reason', 'too_many_attempts', 'attempts', d.processing_attempts);
  elsif d.status = 'completed' and not p_reprocess then
    return jsonb_build_object('claimed', false, 'reason', 'already_completed');
  elsif d.status = 'failed' and d.failure_retryable is not true and not p_reprocess then
    return jsonb_build_object('claimed', false, 'reason', 'not_retryable', 'failure_code', d.failure_code);
  end if;

  update public.documents
     set status = 'processing',
         processing_started_at = now(),
         processing_attempts = processing_attempts + 1,
         failure_code = null,
         failure_retryable = null,
         processing_error = null
   where id = d.id;

  return jsonb_build_object('claimed', true, 'attempt', d.processing_attempts + 1, 'previous_status', d.status);
end;
$$;

-- 6b. Failure ---------------------------------------------------------------------
create or replace function public.fail_document_processing(
  p_document_id    uuid,
  p_run_id         uuid,
  p_failure_code   text,
  p_retryable      boolean,
  p_error_kind     text,
  p_user_message   text,
  p_identity_check text default null,
  p_stats          jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'fail_document_processing: server only' using errcode = '42501';
  end if;

  select * into d from public.documents where id = p_document_id for update;
  if not found or d.status <> 'processing' then
    return; -- nothing to fail (already finished, or never claimed)
  end if;

  if p_run_id is not null then
    update public.extraction_runs
       set status = 'failed', error_code = p_failure_code, error_kind = p_error_kind,
           completed_at = now(), stats = coalesce(p_stats, '{}'::jsonb)
     where id = p_run_id and document_id = p_document_id and status in ('queued', 'running');
  end if;

  update public.documents
     set status = 'failed',
         failure_code = p_failure_code,
         failure_retryable = p_retryable,
         processing_error = left(p_user_message, 1000),
         identity_check = coalesce(p_identity_check, identity_check)
   where id = p_document_id;
end;
$$;

-- 6c. Atomic commit -------------------------------------------------------------
-- p_result (built and fully validated by server code):
--   { page_count, content_sha256,
--     document: { title, report_date, provider_name, document_type, identity_check },
--     pages:   [ { page_number, text_content, text_source, width_pt, height_pt } ],
--     encounters|observations|conditions|medications|procedures|allergies: [ fact rows ],
--     stats:   { counts only } }
-- Each fact row carries: fingerprint, page_number, source_text, confidence,
-- review_status ('unreviewed' | 'needs_review'), review_reason, plus the
-- table's own as-written / interpretation columns. Facts may carry
-- `encounter_key` (observations etc.) matching an encounter's `key`.
create or replace function public.commit_document_extraction(
  p_document_id uuid,
  p_run_id      uuid,
  p_result      jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
  r public.extraction_runs%rowtype;
  fact_tables text[] := array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies'];
  t text;
  elem jsonb;
  merged jsonb;
  page_id uuid;
  new_id uuid;
  prev_id uuid;
  enc_map jsonb := '{}'::jsonb;
  head_id uuid;
  head_status text;
  head_reason text;
  head_sup timestamptz;
  skip boolean;
  counts jsonb := '{}'::jsonb;
  n_inserted integer;
  n_superseded integer;
  n_kept integer;
  n_stale integer;
  doc_meta jsonb := coalesce(p_result -> 'document', '{}'::jsonb);
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'commit_document_extraction: server only' using errcode = '42501';
  end if;

  select * into d from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'commit_document_extraction: document not found' using errcode = 'P0002';
  end if;
  if d.status <> 'processing' then
    raise exception 'commit_document_extraction: document is not being processed' using errcode = '22023';
  end if;
  select * into r from public.extraction_runs where id = p_run_id and document_id = p_document_id and user_id = d.user_id;
  if not found or r.status <> 'running' then
    raise exception 'commit_document_extraction: extraction run is not running' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_result -> 'pages', 'null'::jsonb)) <> 'array' then
    raise exception 'commit_document_extraction: pages are required' using errcode = '22023';
  end if;

  -- Document-level facts about the original (write-once hash / page count are
  -- enforced by the documents_write_once trigger).
  update public.documents
     set page_count      = coalesce(page_count, nullif(p_result ->> 'page_count', '')::integer),
         content_sha256  = coalesce(content_sha256, p_result ->> 'content_sha256'),
         title           = coalesce(nullif(doc_meta ->> 'title', ''), title),
         report_date     = coalesce(nullif(doc_meta ->> 'report_date', '')::date, report_date),
         provider_name   = coalesce(nullif(doc_meta ->> 'provider_name', ''), provider_name),
         document_type   = case
                             when document_type = 'unclassified' and (doc_meta ->> 'document_type') in
                               ('blood_test', 'prescription', 'discharge_summary', 'consultation_note', 'imaging_report', 'vaccination_record', 'other')
                             then (doc_meta ->> 'document_type')::public.document_type
                             else document_type
                           end,
         identity_check  = coalesce(nullif(doc_meta ->> 'identity_check', ''), identity_check)
   where id = p_document_id;

  -- Pages (derived text; the original PDF is never touched). Re-processing the
  -- same original upserts the same pages.
  insert into public.document_pages
    (user_id, document_id, page_number, text_content, text_source, width_pt, height_pt, extraction_run_id)
  select d.user_id, p_document_id, x.page_number, x.text_content, x.text_source::public.page_text_source,
         x.width_pt, x.height_pt, p_run_id
    from jsonb_to_recordset(p_result -> 'pages') as x(page_number integer, text_content text, text_source text, width_pt numeric, height_pt numeric)
  on conflict (document_id, page_number) do update
     set text_content = excluded.text_content, text_source = excluded.text_source,
         width_pt = excluded.width_pt, height_pt = excluded.height_pt,
         extraction_run_id = excluded.extraction_run_id;

  update public.documents set status = 'extracted' where id = p_document_id;
  update public.documents set status = 'validated' where id = p_document_id;

  -- Facts. Idempotency: a fact is identified by its fingerprint within a document.
  foreach t in array fact_tables loop
    n_inserted := 0; n_superseded := 0; n_kept := 0;

    for elem in select * from jsonb_array_elements(coalesce(p_result -> t, '[]'::jsonb)) loop
      select id into page_id from public.document_pages
       where document_id = p_document_id and page_number = (elem ->> 'page_number')::integer;
      if page_id is null then
        raise exception 'commit_document_extraction: a fact points at a page that does not exist' using errcode = '22023';
      end if;

      head_id := null; head_status := null; head_reason := null; head_sup := null;
      execute format(
        'select id, review_status::text, review_reason, superseded_at
           from public.%I
          where document_id = $1 and fingerprint = $2 and origin = ''extracted''
          order by created_at desc, id limit 1', t)
        into head_id, head_status, head_reason, head_sup
        using p_document_id, elem ->> 'fingerprint';

      skip := false;
      prev_id := null;
      if head_id is not null then
        if head_sup is not null then
          skip := true;                      -- a person's correction stands
        elsif head_status = 'confirmed' then
          skip := true;                      -- a person confirmed it; keep it
        elsif head_status = 'rejected' and head_reason is distinct from 'reprocess_not_found' then
          skip := true;                      -- a person rejected it; do not resurrect
        else
          prev_id := head_id;                -- replace the earlier machine-extracted fact
        end if;
      end if;

      if skip then
        n_kept := n_kept + 1;
        if t = 'encounters' and head_sup is null and head_status in ('unreviewed', 'confirmed') then
          enc_map := enc_map || jsonb_build_object(elem ->> 'key', head_id);
        end if;
        continue;
      end if;

      new_id := gen_random_uuid();
      merged := (elem - 'key' - 'encounter_key' - 'page_number')
        || jsonb_build_object(
             'id', new_id, 'user_id', d.user_id, 'origin', 'extracted',
             'document_id', p_document_id, 'document_page_id', page_id,
             'extraction_run_id', p_run_id, 'supersedes_id', prev_id,
             'created_at', now(), 'updated_at', now());
      if t <> 'encounters' and (elem ->> 'encounter_key') is not null then
        merged := merged || jsonb_build_object('encounter_id', enc_map ->> (elem ->> 'encounter_key'));
      end if;

      execute format('insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)', t) using merged;

      n_inserted := n_inserted + 1;
      if prev_id is not null then n_superseded := n_superseded + 1; end if;
      if t = 'encounters' then
        enc_map := enc_map || jsonb_build_object(elem ->> 'key', new_id);
      end if;
    end loop;

    -- Earlier machine-extracted facts for this document that this run did not
    -- find again are no longer trusted. (Replaced facts are already superseded;
    -- anything a person confirmed is left alone.)
    execute format(
      'update public.%I
          set review_status = ''rejected'', review_reason = ''reprocess_not_found''
        where document_id = $1 and origin = ''extracted'' and superseded_at is null
          and review_status in (''unreviewed'', ''needs_review'')
          and extraction_run_id is distinct from $2', t)
      using p_document_id, p_run_id;
    get diagnostics n_stale = row_count;

    counts := counts || jsonb_build_object(t, jsonb_build_object(
      'inserted', n_inserted, 'superseded', n_superseded, 'kept', n_kept, 'retired', n_stale));
  end loop;

  update public.extraction_runs
     set status = 'succeeded', completed_at = now(),
         stats = coalesce(p_result -> 'stats', '{}'::jsonb) || jsonb_build_object('commit', counts)
   where id = p_run_id;

  update public.documents
     set current_extraction_run_id = p_run_id,
         failure_code = null, failure_retryable = null, processing_error = null
   where id = p_document_id;
  update public.documents set status = 'completed' where id = p_document_id;

  return counts;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants: service role only.
-- -----------------------------------------------------------------------------
revoke all on function public.claim_document_processing(uuid, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.fail_document_processing(uuid, uuid, text, boolean, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.commit_document_extraction(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_document_processing(uuid, uuid, boolean, integer) to service_role;
grant execute on function public.fail_document_processing(uuid, uuid, text, boolean, text, text, text, jsonb) to service_role;
grant execute on function public.commit_document_extraction(uuid, uuid, jsonb) to service_role;

revoke all on all functions in schema private from public, anon, authenticated;
