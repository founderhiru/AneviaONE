-- Scanned / image-only reports: record where each page's text came from.
--
-- process-document now reads scans by transcribing them (OCR) and passes
-- text_source = 'ocr' for those pages. engine_complete_document previously
-- wrote every page as 'pdf_text_layer'; it now takes the payload's value
-- (default 'pdf_text_layer', so text PDFs are unchanged). The
-- public.page_text_source enum already includes 'ocr'.
--
-- Only this one line of the function changes; the rest is identical to
-- 20261006120000_gate1_document_understanding.sql (verified against the
-- live definition). No table, column, policy or data changes.

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

revoke all on function public.engine_complete_document(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.engine_complete_document(uuid, uuid, jsonb) to service_role;
