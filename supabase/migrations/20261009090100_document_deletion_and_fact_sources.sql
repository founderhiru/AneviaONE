-- =============================================================================
-- Phase B · document deletion + source integrity (2/2)
--
--   1. Lifecycle: any settled document may move to `deleting` (server only).
--   2. fact_sources: ADDITIONAL documents supporting a live fact. A fact's own
--      evidence columns (document, page, run, quote, confidence) remain its
--      primary source; when another upload yields the same fact (same
--      fingerprint) it is not stored twice — that upload is recorded here.
--      Existing rows need no backfill: today every fact's only source is its
--      own document.
--   3. engine_complete_document records those additional sources.
--   4. engine_begin_document_deletion / engine_delete_document: the only way a
--      document and its records are deleted. Service role only — called by the
--      delete-document Edge Function after it has authenticated the caller and
--      removed the stored original. A fact still supported by another of the
--      person's documents is kept (re-recorded from that document's evidence);
--      a fact whose only source was the deleted document is removed.
--
-- Nothing here weakens RLS: the app gains no write path. Audit rows written by
-- deletion hold ids and counts only — never report text, quotes or values.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lifecycle
-- -----------------------------------------------------------------------------
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
    ('completed',  'processing'),  -- re-process with an improved pipeline
    -- Deletion (server only; documents_before_update blocks the app). A
    -- `processing` document only once its run is stale — see
    -- engine_begin_document_deletion. Nothing leaves `deleting` except the
    -- row's removal.
    ('uploaded',   'deleting'),
    ('completed',  'deleting'),
    ('failed',     'deleting'),
    ('processing', 'deleting')
  )
$$;

-- -----------------------------------------------------------------------------
-- 2. fact_sources
-- -----------------------------------------------------------------------------
create table public.fact_sources (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  fact_table        text not null check (fact_table in ('encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies')),
  fact_id           uuid not null,
  document_id       uuid not null,
  document_page_id  uuid not null,
  extraction_run_id uuid not null,
  source_text       text not null check (char_length(source_text) <= 2000),
  confidence        numeric(4, 3) not null check (confidence between 0 and 1),
  confidence_gate   text not null check (confidence_gate in ('passed', 'needs_review')),
  created_at        timestamptz not null default now(),
  constraint fact_sources_one_per_document unique (fact_table, fact_id, document_id),
  constraint fact_sources_document_fk foreign key (document_id, user_id)
    references public.documents (id, user_id) on delete cascade,
  constraint fact_sources_page_fk foreign key (document_page_id, document_id)
    references public.document_pages (id, document_id) on delete cascade,
  constraint fact_sources_run_fk foreign key (extraction_run_id, user_id)
    references public.extraction_runs (id, user_id) on delete cascade
);

comment on table public.fact_sources is
  'Additional documents supporting a live fact (the fact row''s own evidence is its primary source). Written by engine_* functions only.';

create index fact_sources_fact_idx on public.fact_sources (fact_table, fact_id);
create index fact_sources_document_idx on public.fact_sources (document_id);
create index fact_sources_user_idx on public.fact_sources (user_id);

alter table public.fact_sources enable row level security;
create policy "fact_sources_select_own" on public.fact_sources for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.fact_sources from anon, authenticated;
grant select on public.fact_sources to authenticated;

-- -----------------------------------------------------------------------------
-- 3. engine_complete_document — unchanged except: record additional sources
--    for duplicates from another document, and keep them on reprocessing.
-- -----------------------------------------------------------------------------
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

  -- Pages: derived from the immutable original, so written once. text_source
  -- says where the text came from: the PDF's text layer, or a transcription
  -- of a scanned / image-only page ('ocr').
  insert into public.document_pages (user_id, document_id, page_number, text_content, text_source, extraction_run_id)
  select p_user_id, doc_id, (p ->> 'page_number')::integer, p ->> 'text',
         coalesce(p ->> 'text_source', 'pdf_text_layer')::public.page_text_source, p_run_id
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
  if to_regclass('pg_temp.engine_live') is null then
    create temporary table engine_live (tbl text, id uuid, document_id uuid, fact_fingerprint text) on commit drop;
  end if;
  truncate pg_temp.engine_live;
  insert into pg_temp.engine_live
    select 'encounters', id, document_id, fact_fingerprint from public.encounters   where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
    union all select 'observations', id, document_id, fact_fingerprint from public.observations where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
    union all select 'conditions',   id, document_id, fact_fingerprint from public.conditions   where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
    union all select 'medications',  id, document_id, fact_fingerprint from public.medications  where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
    union all select 'procedures',   id, document_id, fact_fingerprint from public.procedures   where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null
    union all select 'allergies',    id, document_id, fact_fingerprint from public.allergies    where user_id = p_user_id and superseded_at is null and fact_fingerprint is not null;

  -- Phase B: a duplicate from ANOTHER document is still evidence for the live
  -- fact. Record this document as an additional source (its page, run, quote,
  -- confidence and gate), so deleting the fact's original document doesn't
  -- remove a fact this one still supports.
  insert into public.fact_sources (user_id, fact_table, fact_id, document_id, document_page_id, extraction_run_id,
                                   source_text, confidence, confidence_gate)
  select distinct on (live.tbl, live.id)
         p_user_id, live.tbl, live.id, doc_id, ef.page_id, p_run_id,
         ef.f ->> 'source_text', (ef.f ->> 'confidence')::numeric, ef.f ->> 'confidence_gate'
    from pg_temp.engine_fact ef
    join pg_temp.engine_live live on live.fact_fingerprint = ef.f ->> 'fact_fingerprint' and live.tbl = ef.kind
   where live.document_id is distinct from doc_id
   order by live.tbl, live.id, (ef.f ->> 'confidence')::numeric desc
  on conflict (fact_table, fact_id, document_id) do nothing;

  delete from pg_temp.engine_fact ef using pg_temp.engine_live live where live.fact_fingerprint = ef.f ->> 'fact_fingerprint';
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

  -- Phase B: reprocessing replaced this document's unreviewed facts with new
  -- rows (same fingerprint); other documents' support moves to the new row.
  foreach t in array array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies'] loop
    execute format('update public.fact_sources fs set fact_id = cur.id
                      from public.%1$I old, public.%1$I cur
                     where fs.fact_table = %1$L and fs.fact_id = old.id and old.document_id = $1
                       and old.superseded_at is not null and cur.user_id = $2 and cur.superseded_at is null
                       and cur.fact_fingerprint = old.fact_fingerprint and cur.id <> old.id
                       and not exists (select 1 from public.fact_sources x
                                        where x.fact_table = fs.fact_table and x.fact_id = cur.id and x.document_id = fs.document_id)', t)
      using doc_id, p_user_id;
  end loop;

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

-- -----------------------------------------------------------------------------
-- 4. Deletion
-- -----------------------------------------------------------------------------

-- Step 1 (before the Storage object is removed). Locks the person's document
-- and moves it to `deleting`, so it can't be claimed for processing again.
-- Returns {status} and, while deleting, the server-recorded storage path:
--   deleting       — proceed (also when a previous attempt didn't finish)
--   deleted        — this person already deleted it (idempotent repeat)
--   busy           — it is being read right now; try again shortly
--   not_eligible   — an upload that never finished (the app removes those)
--   not_found      — no such document for this person (also another person's)
create or replace function public.engine_begin_document_deletion(p_document_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
begin
  perform private.require_service_role();

  select id, status, storage_bucket, storage_path, processing_started_at into d
    from public.documents
   where id = p_document_id and user_id = p_user_id
     for update;

  if not found then
    if exists (select 1 from public.audit_logs
                where user_id = p_user_id and action = 'document.deleted'
                  and entity_table = 'documents' and entity_id = p_document_id) then
      return jsonb_build_object('status', 'deleted');
    end if;
    return jsonb_build_object('status', 'not_found');
  end if;

  if d.status = 'pending_upload' then
    return jsonb_build_object('status', 'not_eligible');
  end if;
  if d.status in ('processing', 'extracted', 'validated')
     and coalesce(d.processing_started_at, now()) > now() - interval '15 minutes' then
    return jsonb_build_object('status', 'busy');
  end if;

  if d.status <> 'deleting' then
    -- A stale run (crashed reader) is closed first, as engine_claim_document does.
    update public.extraction_runs
       set status = 'failed', error_code = 'abandoned', failure_kind = 'transient', completed_at = now()
     where document_id = d.id and status = 'running';
    update public.documents set status = 'deleting' where id = d.id;
    perform private.write_audit(p_user_id, 'document.deletion_started', 'documents', d.id, '{}'::jsonb);
  end if;

  return jsonb_build_object('status', 'deleting', 'storage_bucket', d.storage_bucket, 'storage_path', d.storage_path);
end;
$$;

-- Step 2 (after the Storage object is gone). One transaction: either every
-- record below is removed, or nothing is and the document stays `deleting`.
--   • For each live fact whose primary source is this document: if another of
--     the person's documents supports it (fact_sources), the fact is
--     re-recorded from that document's evidence (same values; that source's
--     confidence gate; review starts over) and its other sources move to it.
--   • Every fact row of this document (incl. superseded history and the
--     person's corrections of them) is removed, with sources pointing to them.
--   • The document row is removed; its pages (incl. OCR text), extraction
--     runs, status history and fact_sources cascade.
--   • One audit row: ids and counts only.
create or replace function public.engine_delete_document(p_document_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  t text;
  plan record;
  fact jsonb;
  new_id uuid;
  live integer;
  removed integer := 0;
  kept integer := 0;
begin
  perform private.require_service_role();

  select id, status into d from public.documents
   where id = p_document_id and user_id = p_user_id
     for update;
  if not found then
    raise exception 'engine: document not found' using errcode = 'P0002';
  end if;
  if d.status <> 'deleting' then
    raise exception 'engine: deletion was not started for this document' using errcode = '22023';
  end if;

  if to_regclass('pg_temp.engine_keep') is null then
    create temporary table engine_keep (old_id uuid, fact jsonb, source_id uuid, source jsonb) on commit drop;
  end if;

  -- Observations first: they may point at this document's encounters.
  foreach t in array array['observations', 'conditions', 'medications', 'procedures', 'allergies', 'encounters'] loop
    truncate pg_temp.engine_keep;

    -- Live facts of this document that another (not-being-deleted) document supports.
    execute format($q$
      insert into pg_temp.engine_keep (old_id, fact, source_id, source)
      select x.id, to_jsonb(x), s.id, to_jsonb(s)
        from public.%1$I x
        cross join lateral (
          select fs.*
            from public.fact_sources fs
            join public.documents od on od.id = fs.document_id and od.user_id = $2
           where fs.fact_table = %1$L and fs.fact_id = x.id and fs.document_id <> $1
             and od.status <> 'deleting'
           order by (fs.confidence_gate = 'passed') desc, fs.confidence desc, fs.created_at, fs.id
           limit 1
        ) s
       where x.document_id = $1 and x.user_id = $2 and x.superseded_at is null and x.origin = 'extracted'
    $q$, t) using p_document_id, p_user_id;

    execute format('select count(*) from public.%I where document_id = $1 and user_id = $2 and superseded_at is null', t)
      into live using p_document_id, p_user_id;
    removed := removed + live - (select count(*) from pg_temp.engine_keep);

    -- Remove every fact row of this document (one statement: correction
    -- chains within the document are removed together).
    execute format('delete from public.%I where document_id = $1 and user_id = $2', t)
      using p_document_id, p_user_id;

    -- Re-record each supported fact from its other source's evidence.
    for plan in select * from pg_temp.engine_keep loop
      fact := plan.fact || jsonb_build_object(
        'id', gen_random_uuid(),
        'document_id', plan.source ->> 'document_id',
        'document_page_id', plan.source ->> 'document_page_id',
        'extraction_run_id', plan.source ->> 'extraction_run_id',
        'source_text', plan.source ->> 'source_text',
        'confidence', (plan.source ->> 'confidence')::numeric,
        'confidence_gate', plan.source ->> 'confidence_gate',
        'review_status', 'unreviewed',
        'reviewed_at', null,
        'supersedes_id', null,
        'superseded_at', null,
        'created_at', now(),
        'updated_at', now());
      -- A link to an encounter of the deleted document can't survive it.
      if t = 'observations' and fact ->> 'encounter_id' is not null
         and not exists (select 1 from public.encounters e where e.id = (fact ->> 'encounter_id')::uuid) then
        fact := fact || jsonb_build_object('encounter_id', null);
      end if;
      execute format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, $1)).* returning id', t)
        into new_id using fact;
      update public.fact_sources set fact_id = new_id
       where fact_table = t and fact_id = plan.old_id and id <> plan.source_id;
      delete from public.fact_sources where id = plan.source_id;
      kept := kept + 1;
    end loop;

    -- Sources pointing at facts that no longer exist.
    execute format('delete from public.fact_sources fs
                     where fs.fact_table = %1$L and fs.user_id = $1
                       and not exists (select 1 from public.%1$I x where x.id = fs.fact_id)', t)
      using p_user_id;
  end loop;

  delete from public.documents where id = p_document_id and user_id = p_user_id;

  perform private.write_audit(p_user_id, 'document.deleted', 'documents', p_document_id,
    jsonb_build_object('facts_removed', removed, 'facts_kept', kept));

  return jsonb_build_object('status', 'deleted', 'facts_removed', removed, 'facts_kept', kept);
end;
$$;

revoke all on function public.engine_begin_document_deletion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.engine_delete_document(uuid, uuid) from public, anon, authenticated;
grant execute on function public.engine_begin_document_deletion(uuid, uuid) to service_role;
grant execute on function public.engine_delete_document(uuid, uuid) to service_role;
revoke all on function public.engine_complete_document(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.engine_complete_document(uuid, uuid, jsonb) to service_role;
