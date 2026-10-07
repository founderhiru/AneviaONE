-- =============================================================================
-- Gate 1 · Document understanding — schema gaps on top of the health model
-- (migrations 20261001090000–20261001090200).
--
-- Adds only what Gate 1 needs:
--   1. Document processing state: attempts, claim time, failure kind (retry
--      policy), report-person check result, review reason.
--   2. Extraction run accounting: consent version used, counts, failure kind.
--   3. Fact fingerprints (idempotency) + a fact-level confidence gate, and the
--      condition / allergy `assertion` (mentioned | reported | diagnosed).
--   4. current_* views exclude low-confidence facts until a person confirms
--      them — so nothing unreviewed can feed trends / What Changed / Ask.
--   5. Consent check helpers.
--   6. engine_* functions: the ONLY way processing state and extracted facts
--      are written. Executable by the service role only (the process-document
--      Edge Function); never by the app.
--
-- Nothing here weakens RLS: every table keeps owner-only SELECT and no new
-- app write paths are added (the app still writes only consents and reviews).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. documents — processing state
-- -----------------------------------------------------------------------------
alter table public.documents
  add column processing_attempts   integer not null default 0 check (processing_attempts between 0 and 100),
  add column processing_started_at timestamptz,
  add column failure_kind          text check (failure_kind is null or failure_kind in (
                                     'transient',          -- network / timeout / our infrastructure: retry
                                     'provider',           -- AI provider error or refusal: retry
                                     'validation',         -- extraction failed deterministic validation: limited retry
                                     'unsupported',        -- scanned/image-only, too long, malformed: no retry
                                     'identity_mismatch',  -- report appears to belong to someone else: review
                                     'consent_required')), -- AI processing not consented: retry after consent
  add column review_reason         text check (review_reason is null or review_reason in ('identity_mismatch')),
  add column identity_check        text not null default 'not_checked' check (identity_check in (
                                     'not_checked', 'no_identifiers', 'consistent', 'unverifiable', 'mismatch')),
  add column text_layer            text check (text_layer is null or text_layer in ('present', 'absent'));

comment on column public.documents.failure_kind is
  'Server-set reason class when status = failed. Drives the retry policy (engine_claim_document).';
comment on column public.documents.identity_check is
  'Result of comparing explicit patient identifiers in the report with the account. Never stores the identifiers.';

-- -----------------------------------------------------------------------------
-- 2. extraction_runs — accounting
-- -----------------------------------------------------------------------------
alter table public.extraction_runs
  add column consent_version     text check (consent_version is null or char_length(consent_version) <= 40),
  add column failure_kind        text check (failure_kind is null or failure_kind ~ '^[a-z_]{1,32}$'),
  add column pages_processed     integer check (pages_processed is null or pages_processed >= 0),
  add column chunk_count         integer check (chunk_count is null or chunk_count >= 0),
  add column facts_written       integer check (facts_written is null or facts_written >= 0),
  add column facts_needs_review  integer check (facts_needs_review is null or facts_needs_review >= 0),
  add column facts_discarded     integer check (facts_discarded is null or facts_discarded >= 0),
  add column facts_duplicate     integer check (facts_duplicate is null or facts_duplicate >= 0);

-- At most one running extraction per document.
create unique index extraction_runs_one_running_idx on public.extraction_runs (document_id) where status = 'running';

-- -----------------------------------------------------------------------------
-- 3. Fact tables — fingerprint, confidence gate, assertion
-- -----------------------------------------------------------------------------
create type public.fact_assertion as enum ('mentioned', 'reported', 'diagnosed');

do $$
declare
  t text;
begin
  foreach t in array array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies'] loop
    execute format($ddl$
      alter table public.%1$I
        add column fact_fingerprint text check (fact_fingerprint is null or fact_fingerprint ~ '^[0-9a-f]{64}$'),
        add column confidence_gate  text not null default 'passed' check (confidence_gate in ('passed', 'needs_review')),
        add constraint %1$s_gate_only_when_extracted check (origin = 'extracted' or confidence_gate = 'passed')
    $ddl$, t);
    -- One live fact per fingerprint per person: reprocessing or re-uploading
    -- the same report can never produce duplicate current facts.
    execute format('create unique index %1$s_fingerprint_live_idx on public.%1$I (user_id, fact_fingerprint)
                      where fact_fingerprint is not null and superseded_at is null', t);
  end loop;
end
$$;

alter table public.conditions add column assertion public.fact_assertion not null default 'mentioned';
alter table public.allergies  add column assertion public.fact_assertion not null default 'mentioned';
comment on column public.conditions.assertion is
  'How the document states it: mentioned (incl. family history), reported (by the patient), diagnosed (by a clinician). Never inferred.';

-- -----------------------------------------------------------------------------
-- 4. current_* views — only trusted facts.
-- A low-confidence extracted fact (confidence_gate = needs_review) is current
-- only once the person confirms it. These views are what later features
-- (trends, What Changed, Ask My Health) read.
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
           and review_status <> 'rejected'
           and (confidence_gate = 'passed' or review_status = 'confirmed')
    $ddl$, 'current_' || t, t);
    execute format('revoke all on public.%1$I from anon, authenticated', 'current_' || t);
    execute format('grant select on public.%1$I to authenticated', 'current_' || t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 5. Consent helpers (the consents ledger is append-only; the latest row per
-- type is the current decision — a revocation is a later row with
-- granted = false).
-- -----------------------------------------------------------------------------
create or replace function private.has_current_consent(p_user_id uuid, p_type public.consent_type, p_policy_version text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.granted and c.policy_version = p_policy_version
      from public.consents c
     where c.user_id = p_user_id and c.consent_type = p_type
     order by c.recorded_at desc
     limit 1
  ), false)
$$;

-- -----------------------------------------------------------------------------
-- 6. Engine functions (service role only)
-- -----------------------------------------------------------------------------
create or replace function private.require_service_role()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'engine: service role required' using errcode = '42501';
  end if;
end;
$$;

-- Both AI consents required before a document may be sent to the AI provider.
create or replace function public.engine_has_ai_consent(p_user_id uuid, p_policy_version text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role();
  return private.has_current_consent(p_user_id, 'ai_processing', p_policy_version)
     and private.has_current_consent(p_user_id, 'health_data_processing', p_policy_version);
end;
$$;

-- Atomically claims a document for processing. Eligible:
--   uploaded                                  first processing
--   failed (transient|provider|consent_required) retry while attempts < max
--   failed (validation)                       retry while attempts < max
--   completed                                 only when p_reprocess
--   processing, claim older than 15 minutes   a crashed run is reclaimed
-- Never eligible: failed (unsupported | identity_mismatch).
-- Returns no row when the document isn't this user's or isn't eligible.
create or replace function public.engine_claim_document(
  p_document_id uuid, p_user_id uuid, p_reprocess boolean default false, p_max_attempts integer default 3
)
returns table (id uuid, storage_path text, content_sha256 text, processing_attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_service_role();
  -- A crashed run left the document in `processing`; close its run first.
  update public.extraction_runs r
     set status = 'failed', error_code = 'abandoned', failure_kind = 'transient', completed_at = now()
    from public.documents d
   where r.document_id = d.id and d.id = p_document_id and d.user_id = p_user_id
     and r.status = 'running' and d.status = 'processing'
     and d.processing_started_at < now() - interval '15 minutes';

  return query
  update public.documents d
     set status                = 'processing',
         processing_started_at = now(),
         processing_attempts   = d.processing_attempts + 1,
         processing_error      = null,
         failure_kind          = null,
         review_reason         = null
   where d.id = p_document_id
     and d.user_id = p_user_id
     and (
          d.status = 'uploaded'
       or (d.status = 'failed' and d.failure_kind in ('transient', 'provider', 'consent_required', 'validation')
           and d.processing_attempts < p_max_attempts)
       or (d.status = 'completed' and p_reprocess)
       or (d.status = 'processing' and d.processing_started_at < now() - interval '15 minutes')
     )
  returning d.id, d.storage_path, d.content_sha256, d.processing_attempts;
end;
$$;

-- Records the original's SHA-256 and page count (write-once; a different hash
-- for the same document means the stored original changed — refuse).
create or replace function public.engine_record_original(
  p_document_id uuid, p_user_id uuid, p_sha256 text, p_page_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing text;
begin
  perform private.require_service_role();
  select d.content_sha256 into existing from public.documents d
   where d.id = p_document_id and d.user_id = p_user_id and d.status = 'processing' for update;
  if not found then
    raise exception 'engine: document not claimed' using errcode = 'P0002';
  end if;
  if existing is not null and existing <> p_sha256 then
    raise exception 'engine: stored original does not match its recorded hash' using errcode = '22023';
  end if;
  update public.documents d
     set content_sha256 = p_sha256,
         page_count     = coalesce(d.page_count, p_page_count)
   where d.id = p_document_id;
end;
$$;

create or replace function public.engine_start_run(
  p_document_id uuid, p_user_id uuid, p_pipeline_version text, p_model_provider text,
  p_model_name text, p_prompt_version text, p_consent_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
begin
  perform private.require_service_role();
  perform 1 from public.documents d where d.id = p_document_id and d.user_id = p_user_id and d.status = 'processing';
  if not found then
    raise exception 'engine: document not claimed' using errcode = 'P0002';
  end if;
  insert into public.extraction_runs (user_id, document_id, status, pipeline_version, model_provider, model_name,
                                      prompt_version, consent_version, started_at)
  values (p_user_id, p_document_id, 'running', p_pipeline_version, p_model_provider, p_model_name,
          p_prompt_version, p_consent_version, now())
  returning id into run_id;
  return run_id;
end;
$$;

-- Marks a claimed document (and its running run, if any) failed.
create or replace function public.engine_fail_document(
  p_document_id uuid, p_user_id uuid, p_run_id uuid, p_failure_kind text, p_error_code text,
  p_user_message text, p_review_reason text default null, p_identity_check text default null,
  p_text_layer text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_service_role();
  if p_run_id is not null then
    update public.extraction_runs r
       set status = 'failed', error_code = p_error_code, failure_kind = p_failure_kind, completed_at = now()
     where r.id = p_run_id and r.user_id = p_user_id and r.status = 'running';
  end if;
  update public.documents d
     set status           = 'failed',
         failure_kind     = p_failure_kind,
         processing_error = left(p_user_message, 1000),
         review_reason    = p_review_reason,
         identity_check   = coalesce(p_identity_check, d.identity_check),
         text_layer       = coalesce(p_text_layer, d.text_layer)
   where d.id = p_document_id and d.user_id = p_user_id and d.status = 'processing';
  if not found then
    raise exception 'engine: document not claimed' using errcode = 'P0002';
  end if;
end;
$$;

-- Persists one validated extraction atomically and completes the document:
--   pages (inserted once — they are derived from the immutable original),
--   supersedes the previous runs' unreviewed facts of THIS document,
--   inserts the new facts (skipping any fingerprint that already has a live
--   fact — confirmed, rejected or from a duplicate upload),
--   run → succeeded, document → extracted → validated → completed.
-- p_payload shape (built by the Edge Function from deterministically validated
-- data; see supabase/functions/_shared/health-engine/persist.ts):
--   { "report_date": "YYYY-MM-DD"|null, "identity_check": "...", "text_layer": "present",
--     "pages": [{"page_number": 1, "text": "..."}],
--     "facts_discarded": 0,
--     "encounters"|"observations"|"conditions"|"medications"|"procedures"|"allergies": [ {...} ] }
create or replace function public.engine_complete_document(p_run_id uuid, p_user_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc_id uuid;
  written integer := 0;
  needs_review integer := 0;
  duplicates integer := 0;
  n integer;
  t text;
begin
  perform private.require_service_role();

  select r.document_id into doc_id from public.extraction_runs r
   where r.id = p_run_id and r.user_id = p_user_id and r.status = 'running' for update;
  if not found then
    raise exception 'engine: extraction run not running' using errcode = 'P0002';
  end if;
  perform 1 from public.documents d where d.id = doc_id and d.status = 'processing' for update;
  if not found then
    raise exception 'engine: document not claimed' using errcode = 'P0002';
  end if;

  -- Pages: derived from the immutable original, so written once.
  insert into public.document_pages (user_id, document_id, page_number, text_content, text_source, extraction_run_id)
  select p_user_id, doc_id, (p ->> 'page_number')::integer, p ->> 'text', 'pdf_text_layer', p_run_id
    from jsonb_array_elements(coalesce(p_payload -> 'pages', '[]'::jsonb)) p
  on conflict (document_id, page_number) do nothing;

  -- Reprocessing: earlier runs' facts for this document that nobody reviewed
  -- are superseded (kept for audit, no longer current). Confirmed or rejected
  -- facts are a person's decision and are left alone.
  perform set_config('hi.fact_supersede', 'on', true);
  foreach t in array array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies'] loop
    execute format('update public.%I set superseded_at = now()
                     where document_id = $1 and origin = ''extracted'' and extraction_run_id <> $2
                       and superseded_at is null and review_status = ''unreviewed''', t)
      using doc_id, p_run_id;
  end loop;
  perform set_config('hi.fact_supersede', 'off', true);

  -- Facts. Each element carries page_number (resolved to this document's page),
  -- source_text, confidence, confidence_gate and fact_fingerprint.
  if to_regclass('pg_temp.engine_fact') is null then
    create temporary table engine_fact (kind text, f jsonb, page_id uuid) on commit drop;
  end if;
  truncate pg_temp.engine_fact;
  insert into pg_temp.engine_fact (kind, f, page_id)
  select k.kind, e.f, dp.id
    from unnest(array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies']) as k(kind)
    cross join lateral jsonb_array_elements(coalesce(p_payload -> k.kind, '[]'::jsonb)) as e(f)
    left join public.document_pages dp on dp.document_id = doc_id and dp.page_number = (e.f ->> 'page_number')::integer;
  if exists (select 1 from pg_temp.engine_fact where page_id is null) then
    raise exception 'engine: a fact refers to a page that does not exist' using errcode = '22023';
  end if;

  -- Skip fingerprints that already have a live fact (any document of this
  -- person — covers reprocessing, confirmed/rejected facts and duplicate uploads).
  with live as (
    select fact_fingerprint from public.encounters   where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
    union all select fact_fingerprint from public.observations where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
    union all select fact_fingerprint from public.conditions   where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
    union all select fact_fingerprint from public.medications  where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
    union all select fact_fingerprint from public.procedures   where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
    union all select fact_fingerprint from public.allergies    where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
  )
  delete from pg_temp.engine_fact ef using live where live.fact_fingerprint = ef.f ->> 'fact_fingerprint';
  get diagnostics duplicates = row_count;
  -- …and duplicates within this one payload.
  delete from pg_temp.engine_fact a using pg_temp.engine_fact b
   where a.ctid > b.ctid and a.f ->> 'fact_fingerprint' = b.f ->> 'fact_fingerprint';
  get diagnostics n = row_count;
  duplicates := duplicates + n;

  insert into public.encounters (user_id, origin, document_id, document_page_id, extraction_run_id, source_text, confidence,
                                 confidence_gate, fact_fingerprint, encounter_date, provider_name, facility_name, encounter_type)
  select p_user_id, 'extracted', doc_id, page_id, p_run_id, f ->> 'source_text', (f ->> 'confidence')::numeric,
         f ->> 'confidence_gate', f ->> 'fact_fingerprint', (f ->> 'encounter_date')::date, f ->> 'provider_name',
         f ->> 'facility_name', coalesce((f ->> 'encounter_type')::public.encounter_type, 'other')
    from pg_temp.engine_fact where kind = 'encounters';

  insert into public.observations (user_id, origin, document_id, document_page_id, extraction_run_id, source_text, confidence,
                                   confidence_gate, fact_fingerprint, name_as_written, value_as_written, unit_as_written,
                                   reference_range_as_written, effective_date, category, value_numeric, value_text,
                                   value_normalized, unit_normalized, reference_low, reference_high, interpretation_version)
  select p_user_id, 'extracted', doc_id, page_id, p_run_id, f ->> 'source_text', (f ->> 'confidence')::numeric,
         f ->> 'confidence_gate', f ->> 'fact_fingerprint', f ->> 'name_as_written', f ->> 'value_as_written',
         f ->> 'unit_as_written', f ->> 'reference_range_as_written', (f ->> 'effective_date')::date,
         coalesce((f ->> 'category')::public.observation_category, 'other'), (f ->> 'value_numeric')::numeric,
         f ->> 'value_text', (f ->> 'value_normalized')::numeric, f ->> 'unit_normalized',
         (f ->> 'reference_low')::numeric, (f ->> 'reference_high')::numeric, f ->> 'interpretation_version'
    from pg_temp.engine_fact where kind = 'observations';

  insert into public.conditions (user_id, origin, document_id, document_page_id, extraction_run_id, source_text, confidence,
                                 confidence_gate, fact_fingerprint, name_as_written, assertion, recorded_date)
  select p_user_id, 'extracted', doc_id, page_id, p_run_id, f ->> 'source_text', (f ->> 'confidence')::numeric,
         f ->> 'confidence_gate', f ->> 'fact_fingerprint', f ->> 'name_as_written',
         (f ->> 'assertion')::public.fact_assertion, (f ->> 'recorded_date')::date
    from pg_temp.engine_fact where kind = 'conditions';

  insert into public.medications (user_id, origin, document_id, document_page_id, extraction_run_id, source_text, confidence,
                                  confidence_gate, fact_fingerprint, name_as_written, dose_as_written, frequency_as_written,
                                  start_date, end_date, status)
  select p_user_id, 'extracted', doc_id, page_id, p_run_id, f ->> 'source_text', (f ->> 'confidence')::numeric,
         f ->> 'confidence_gate', f ->> 'fact_fingerprint', f ->> 'name_as_written', f ->> 'dose_as_written',
         f ->> 'frequency_as_written', (f ->> 'start_date')::date, (f ->> 'end_date')::date,
         coalesce((f ->> 'status')::public.medication_status, 'unknown')
    from pg_temp.engine_fact where kind = 'medications';

  insert into public.procedures (user_id, origin, document_id, document_page_id, extraction_run_id, source_text, confidence,
                                 confidence_gate, fact_fingerprint, name_as_written, performed_date, procedure_kind)
  select p_user_id, 'extracted', doc_id, page_id, p_run_id, f ->> 'source_text', (f ->> 'confidence')::numeric,
         f ->> 'confidence_gate', f ->> 'fact_fingerprint', f ->> 'name_as_written', (f ->> 'performed_date')::date,
         coalesce((f ->> 'procedure_kind')::public.procedure_kind, 'procedure')
    from pg_temp.engine_fact where kind = 'procedures';

  insert into public.allergies (user_id, origin, document_id, document_page_id, extraction_run_id, source_text, confidence,
                                confidence_gate, fact_fingerprint, substance_as_written, reaction_as_written, assertion)
  select p_user_id, 'extracted', doc_id, page_id, p_run_id, f ->> 'source_text', (f ->> 'confidence')::numeric,
         f ->> 'confidence_gate', f ->> 'fact_fingerprint', f ->> 'substance_as_written', f ->> 'reaction_as_written',
         (f ->> 'assertion')::public.fact_assertion
    from pg_temp.engine_fact where kind = 'allergies';

  select count(*), count(*) filter (where f ->> 'confidence_gate' = 'needs_review')
    into written, needs_review from pg_temp.engine_fact;

  update public.extraction_runs r
     set status             = 'succeeded',
         completed_at       = now(),
         pages_processed    = jsonb_array_length(coalesce(p_payload -> 'pages', '[]'::jsonb)),
         chunk_count        = (p_payload ->> 'chunk_count')::integer,
         facts_written      = written,
         facts_needs_review = needs_review,
         facts_discarded    = coalesce((p_payload ->> 'facts_discarded')::integer, 0),
         facts_duplicate    = duplicates
   where r.id = p_run_id;

  -- The lifecycle steps, each recorded in document_status_history.
  update public.documents d
     set status         = 'extracted',
         report_date    = coalesce((p_payload ->> 'report_date')::date, d.report_date),
         identity_check = coalesce(p_payload ->> 'identity_check', d.identity_check),
         text_layer     = coalesce(p_payload ->> 'text_layer', d.text_layer)
   where d.id = doc_id;
  update public.documents set status = 'validated' where id = doc_id;
  update public.documents set status = 'completed' where id = doc_id;

  return jsonb_build_object('document_id', doc_id, 'facts_written', written, 'facts_needs_review', needs_review,
                            'facts_duplicate', duplicates);
end;
$$;

-- Engine functions: service role only (Supabase grants new functions in
-- `public` to anon/authenticated by default — revoke explicitly).
revoke all on function public.engine_has_ai_consent(uuid, text) from public, anon, authenticated;
revoke all on function public.engine_claim_document(uuid, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function public.engine_record_original(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.engine_start_run(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.engine_fail_document(uuid, uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.engine_complete_document(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.engine_has_ai_consent(uuid, text) to service_role;
grant execute on function public.engine_claim_document(uuid, uuid, boolean, integer) to service_role;
grant execute on function public.engine_record_original(uuid, uuid, text, integer) to service_role;
grant execute on function public.engine_start_run(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.engine_fail_document(uuid, uuid, uuid, text, text, text, text, text, text) to service_role;
grant execute on function public.engine_complete_document(uuid, uuid, jsonb) to service_role;

revoke all on all functions in schema private from public, anon, authenticated;
