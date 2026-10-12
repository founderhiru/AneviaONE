-- =============================================================================
-- Phase 2 · M1 — person-made corrections of extracted facts
--
-- The clinical-fact model already appends corrections (a `user_corrected` row
-- that names the fact it supersedes; the original is kept, marked superseded,
-- and both are audited). This migration closes three gaps so the app can
-- offer corrections safely:
--
--  1. A correction takes over the original's fact_fingerprint. Rereading a
--     report skips fingerprints that already have a live fact, so the original
--     (incorrect) reading can never come back as a new fact, and the existing
--     unique index keeps at most ONE live fact per fingerprint. The original is
--     superseded before the correction is written, so the two never overlap.
--  2. App inserts can no longer set server-side fields: fact_fingerprint is
--     never taken from the app, and interpreted values (parsed numbers, ranges,
--     codes) and correction_reason are cleared — unless the row is written by
--     public.correct_fact(), which computes them on the server.
--  3. public.correct_fact(): the one app entry point for corrections. It
--     checks ownership, that the fact is current (not superseded, not rejected,
--     its report not being deleted), validates the allowed fields and values,
--     computes interpreted values deterministically, records the reason, and
--     inserts the correction through the normal triggers (audit included).
--
--  4. Identity safeguard, on every app path: a fact held because its report
--     could not be matched to the person (documents.identity_check
--     no_identifiers / unverifiable) cannot be confirmed, corrected, or have
--     a self-entered fact attached to its report. Checking a value is not a
--     way to accept someone's report as yours; identity is resolved by adding
--     identity details and reading the report again.
--
-- Corrections are confirmed facts by definition (the person checked them), so
-- they count as trusted (current_* views). The original stays queryable as
-- superseded history; nothing is deleted and nothing is ever un-superseded.
-- M1 supports observations (lab results and other measurements).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. correction_reason — only on corrections; immutable like every recorded
--    column (it is not in any mutable-column list of the update trigger).
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies'] loop
    execute format($ddl$
      alter table public.%1$I
        add column correction_reason text
          check (correction_reason is null or char_length(correction_reason) between 1 and 500),
        add constraint %1$s_reason_only_on_corrections check (correction_reason is null or origin = 'user_corrected')
    $ddl$, t);
    execute format($c$comment on column public.%I.correction_reason is
      'Why the person corrected the fact this row supersedes (optional; set only through public.correct_fact).'$c$, t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 1b. Identity hold — a fact held for review whose report could not be matched
--     to the person.
-- -----------------------------------------------------------------------------
create or replace function private.report_identity_unconfirmed(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.documents d
                  where d.id = p_document_id and d.identity_check in ('no_identifiers', 'unverifiable'))
$$;

create or replace function private.fact_identity_held(p_document_id uuid, p_gate text, p_review public.fact_review_status)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_gate = 'needs_review' and p_review <> 'confirmed' and private.report_identity_unconfirmed(p_document_id)
$$;

revoke all on function private.report_identity_unconfirmed(uuid) from public;
revoke all on function private.fact_identity_held(uuid, text, public.fact_review_status) from public;

-- -----------------------------------------------------------------------------
-- 2. BEFORE INSERT — as before, plus: server-only fields are never taken from
--    the app, and a correction takes over its target's fingerprint after the
--    target stops being live.
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
  -- Set (transaction-local) only by public.correct_fact. API clients cannot
  -- set hi.* settings: the API exposes functions of the public schema only,
  -- and none of them sets this one except correct_fact.
  via_correct_fact boolean := coalesce(current_setting('hi.fact_correction', true), 'off') = 'on';
  prior_supersede text;
begin
  if private.is_app_request() then
    new.user_id := auth.uid();
    if new.origin = 'extracted' then
      raise exception '%: only the server can record extracted facts', tg_table_name using errcode = '42501';
    end if;
    new.extraction_run_id := null;
    new.confidence        := null;
    new.review_status     := 'confirmed';
    new.reviewed_at       := now();
    -- Fingerprints identify extracted readings; the app never chooses one.
    new.fact_fingerprint  := null;
    if not via_correct_fact then
      -- Interpreted values are computed by server code only.
      new := jsonb_populate_record(new, '{
        "correction_reason": null, "value_numeric": null, "value_text": null, "value_normalized": null,
        "unit_normalized": null, "reference_low": null, "reference_high": null, "code_system": null,
        "code": null, "display_name": null, "generic_name": null, "interpretation_version": null}'::jsonb);
    end if;
  end if;
  new.superseded_at := null;
  -- Identity safeguard: a self-entered fact cannot cite a report that isn't confirmed as the person's.
  if private.is_app_request() and new.supersedes_id is null and new.document_id is not null
     and private.report_identity_unconfirmed(new.document_id) then
    raise exception '%: this report has not been confirmed as yours', tg_table_name using errcode = '22023';
  end if;
  if new.supersedes_id is not null then
    execute format(
      'select id, document_id, document_page_id, source_text, superseded_at, fact_fingerprint, confidence_gate, review_status
         from public.%I where id = $1 and user_id = $2 for update', tg_table_name)
      into target using new.supersedes_id, new.user_id;
    get diagnostics matched = row_count;
    if matched = 0 then
      raise exception '%: the fact being corrected was not found', tg_table_name using errcode = 'P0002';
    end if;
    if target.superseded_at is not null then
      raise exception '%: that fact has already been corrected', tg_table_name using errcode = '22023';
    end if;
    -- Identity safeguard: correcting is not a way to accept the report as yours.
    if private.is_app_request() and private.fact_identity_held(target.document_id, target.confidence_gate, target.review_status) then
      raise exception '%: this report has not been confirmed as yours', tg_table_name using errcode = '22023';
    end if;
    if new.origin = 'user_corrected' and new.document_id is null then
      new.document_id      := target.document_id;
      new.document_page_id := target.document_page_id;
      new.source_text      := target.source_text;
    end if;
    -- The correction stands in for the original reading: it carries the
    -- original's fingerprint, so a reread can't add that reading back. The
    -- original stops being live first (one live fact per fingerprint).
    if target.fact_fingerprint is not null then
      prior_supersede := coalesce(current_setting('hi.fact_supersede', true), 'off');
      perform set_config('hi.fact_supersede', 'on', true);
      execute format('update public.%I set superseded_at = now() where id = $1', tg_table_name) using new.supersedes_id;
      perform set_config('hi.fact_supersede', prior_supersede, true);
      new.fact_fingerprint := target.fact_fingerprint;
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2b. BEFORE UPDATE — unchanged, plus the identity safeguard: the app cannot
--     confirm a fact held because its report isn't confirmed as the person's.
-- -----------------------------------------------------------------------------
create or replace function private.clinical_fact_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  internal boolean := coalesce(current_setting('hi.fact_supersede', true), 'off') = 'on';
  always_mutable text[] := array['review_status', 'reviewed_at', 'superseded_at', 'updated_at'];
  server_mutable text[] := coalesce(tg_argv::text[], '{}'::text[]);
begin
  -- Source/evidence columns never change, for anyone.
  if (to_jsonb(new) - (always_mutable || server_mutable)) is distinct from (to_jsonb(old) - (always_mutable || server_mutable)) then
    raise exception '%: recorded facts are immutable — add a correction instead', tg_table_name using errcode = '42501';
  end if;

  if new.superseded_at is distinct from old.superseded_at then
    if not internal or old.superseded_at is not null then
      raise exception '%: superseded_at is set only by recording a correction', tg_table_name using errcode = '42501';
    end if;
  end if;

  if private.is_app_request() and not internal then
    if (to_jsonb(new) - always_mutable) is distinct from (to_jsonb(old) - always_mutable) then
      raise exception '%: only the server can refine interpretations', tg_table_name using errcode = '42501';
    end if;
    if old.superseded_at is not null then
      raise exception '%: this fact has been corrected; review the correction instead', tg_table_name using errcode = '22023';
    end if;
    if new.review_status = 'unreviewed' and old.review_status <> 'unreviewed' then
      raise exception '%: a reviewed fact cannot become unreviewed', tg_table_name using errcode = '22023';
    end if;
    -- Identity safeguard: confirming a value is not a way to accept the report as yours.
    if new.review_status = 'confirmed' and old.review_status <> 'confirmed'
       and private.fact_identity_held(old.document_id, old.confidence_gate, old.review_status) then
      raise exception '%: this report has not been confirmed as yours', tg_table_name using errcode = '22023';
    end if;
  end if;

  if new.review_status is distinct from old.review_status then
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. AFTER INSERT — supersede the target unless the insert trigger already did.
-- -----------------------------------------------------------------------------
create or replace function private.clinical_fact_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_supersede text;
begin
  if new.supersedes_id is not null then
    prior_supersede := coalesce(current_setting('hi.fact_supersede', true), 'off');
    perform set_config('hi.fact_supersede', 'on', true);
    execute format('update public.%I set superseded_at = now() where id = $1 and superseded_at is null', tg_table_name)
      using new.supersedes_id;
    perform set_config('hi.fact_supersede', prior_supersede, true);
  end if;
  perform private.write_audit(new.user_id, 'fact.' || new.origin::text, tg_table_name, new.id,
    jsonb_build_object('document_id', new.document_id, 'document_page_id', new.document_page_id,
                       'extraction_run_id', new.extraction_run_id, 'supersedes_id', new.supersedes_id));
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Deterministic helpers (no AI, no guessing). Conservative: anything that
--    is not plainly a number / range stays text and is simply not trended.
-- -----------------------------------------------------------------------------
create or replace function private.fact_plain_number(p_text text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when btrim(p_text) ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p_text)::numeric end
$$;

-- "13.0 - 17.0" / "13.0–17.0" → (13.0, 17.0); "< 100" → (null, 100); "> 30" → (30, null).
create or replace function private.fact_reference_bounds(p_text text, out low numeric, out high numeric)
language plpgsql
immutable
set search_path = ''
as $$
declare
  m text[];
begin
  if p_text is null then
    return;
  end if;
  m := regexp_match(btrim(p_text), '^(-?[0-9]+(?:\.[0-9]+)?)\s*[-–]\s*(-?[0-9]+(?:\.[0-9]+)?)$');
  if m is not null and m[1]::numeric <= m[2]::numeric then
    low := m[1]::numeric;
    high := m[2]::numeric;
    return;
  end if;
  m := regexp_match(btrim(p_text), '^<\s*(-?[0-9]+(?:\.[0-9]+)?)$');
  if m is not null then
    high := m[1]::numeric;
    return;
  end if;
  m := regexp_match(btrim(p_text), '^>\s*(-?[0-9]+(?:\.[0-9]+)?)$');
  if m is not null then
    low := m[1]::numeric;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. public.correct_fact — the app's way to correct a fact.
--
--   p_table   'observations' (M1)
--   p_fact_id the fact being corrected (must be the caller's, and current)
--   p_fields  {"name", "value", "unit", "reference_range", "effective_date"}
--             — only the keys being changed; "unit", "reference_range" and
--             "effective_date" may be null/"" to say "not on the report".
--   p_reason  optional, ≤ 500 characters
--
-- Results held because their report could not be matched to the person
-- (identity_check no_identifiers / unverifiable) cannot be corrected: the
-- identity safeguard is resolved on the report, never by editing a value.
--
-- Returns the id of the new (current, confirmed) fact. Errors never echo the
-- submitted values.
-- -----------------------------------------------------------------------------
create or replace function public.correct_fact(p_table text, p_fact_id uuid, p_fields jsonb, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  orig public.observations%rowtype;
  doc_status public.document_status;
  doc_identity text;
  allowed constant text[] := array['name', 'value', 'unit', 'reference_range', 'effective_date'];
  unknown text;
  v_name text;
  v_value text;
  v_unit text;
  v_range text;
  v_date date;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  raw text;
  bounds record;
  new_id uuid;
begin
  if uid is null then
    raise exception 'correct_fact: sign in to correct your records' using errcode = '42501';
  end if;
  if p_table is distinct from 'observations' then
    raise exception 'correct_fact: this kind of record cannot be corrected yet' using errcode = '0A000';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'correct_fact: nothing to correct' using errcode = '22023';
  end if;
  select k into unknown from jsonb_object_keys(p_fields) k where k <> all (allowed) limit 1;
  if unknown is not null then
    raise exception 'correct_fact: % cannot be corrected', quote_ident(unknown) using errcode = '22023';
  end if;

  -- Ownership and currency. Another person's fact reads as "not found".
  select * into orig from public.observations o where o.id = p_fact_id and o.user_id = uid for update;
  if not found then
    raise exception 'correct_fact: that result was not found' using errcode = 'P0002';
  end if;
  if orig.superseded_at is not null then
    raise exception 'correct_fact: that result has already been corrected — correct the newer version instead' using errcode = '22023';
  end if;
  if orig.review_status = 'rejected' then
    raise exception 'correct_fact: that result was marked as not correct and cannot be corrected' using errcode = '22023';
  end if;
  if orig.document_id is not null then
    select d.status, d.identity_check into doc_status, doc_identity
      from public.documents d where d.id = orig.document_id and d.user_id = uid;
    if doc_status is null or doc_status = 'deleting' then
      raise exception 'correct_fact: that report is being deleted' using errcode = '22023';
    end if;
    -- Identity safeguard: a result held because its report could not be
    -- matched to the person stays held. Correcting a value is not a way to
    -- accept someone's report as theirs.
    if orig.confidence_gate = 'needs_review' and orig.review_status <> 'confirmed'
       and doc_identity in ('no_identifiers', 'unverifiable') then
      raise exception 'correct_fact: that report has not been confirmed as yours' using errcode = '22023';
    end if;
  end if;

  -- Merge: unspecified fields keep the current value.
  v_name  := case when p_fields ? 'name'  then btrim(coalesce(p_fields ->> 'name', ''))  else orig.name_as_written end;
  v_value := case when p_fields ? 'value' then btrim(coalesce(p_fields ->> 'value', '')) else orig.value_as_written end;
  v_unit  := case when p_fields ? 'unit'  then nullif(btrim(coalesce(p_fields ->> 'unit', '')), '') else orig.unit_as_written end;
  v_range := case when p_fields ? 'reference_range'
                  then nullif(btrim(coalesce(p_fields ->> 'reference_range', '')), '') else orig.reference_range_as_written end;
  if p_fields ? 'effective_date' then
    raw := nullif(btrim(coalesce(p_fields ->> 'effective_date', '')), '');
    if raw is null then
      v_date := null;
    else
      if raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'correct_fact: the date is not valid' using errcode = '22023';
      end if;
      begin
        v_date := raw::date;
      exception when others then
        raise exception 'correct_fact: the date is not valid' using errcode = '22023';
      end;
      if v_date > current_date or v_date < date '1900-01-01' then
        raise exception 'correct_fact: the date is not valid' using errcode = '22023';
      end if;
    end if;
  else
    v_date := orig.effective_date;
  end if;

  -- Values.
  if v_name = '' then
    raise exception 'correct_fact: the test name is required' using errcode = '22023';
  end if;
  if v_value = '' then
    raise exception 'correct_fact: the value is required' using errcode = '22023';
  end if;
  if char_length(v_name) > 300 or char_length(v_value) > 300
     or char_length(coalesce(v_unit, '')) > 50 or char_length(coalesce(v_range, '')) > 200 then
    raise exception 'correct_fact: an entry is too long' using errcode = '22023';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'correct_fact: the reason is too long' using errcode = '22023';
  end if;
  if concat_ws(' ', v_name, v_value, v_unit, v_range, v_reason) ~ '[[:cntrl:]]' then
    raise exception 'correct_fact: an entry contains characters that are not allowed' using errcode = '22023';
  end if;
  if v_name = orig.name_as_written and v_value = orig.value_as_written
     and v_unit is not distinct from orig.unit_as_written and v_range is not distinct from orig.reference_range_as_written
     and v_date is not distinct from orig.effective_date then
    raise exception 'correct_fact: nothing was changed' using errcode = '22023';
  end if;

  select b.low, b.high into bounds from private.fact_reference_bounds(v_range) b;

  -- Written through the normal triggers: owner, confirmed review, evidence
  -- inherited from the original, fingerprint taken over, original superseded,
  -- audit rows for both.
  perform set_config('hi.fact_correction', 'on', true);
  insert into public.observations (
    origin, supersedes_id, encounter_id, name_as_written, value_as_written, unit_as_written,
    reference_range_as_written, abnormal_flag_as_written, effective_date, specimen, category,
    value_numeric, value_text, reference_low, reference_high, interpretation_version, correction_reason)
  values (
    'user_corrected', orig.id, orig.encounter_id, v_name, v_value, v_unit,
    v_range, orig.abnormal_flag_as_written, v_date, orig.specimen, orig.category,
    private.fact_plain_number(v_value),
    case when private.fact_plain_number(v_value) is null then v_value end,
    bounds.low, bounds.high, 'user-correction-1', v_reason)
  returning id into new_id;
  perform set_config('hi.fact_correction', 'off', true);
  return new_id;
end;
$$;

comment on function public.correct_fact(text, uuid, jsonb, text) is
  'Records a person''s correction of one of their current facts (observations in M1). The original is kept as superseded history.';

revoke all on function public.correct_fact(text, uuid, jsonb, text) from public, anon;
grant execute on function public.correct_fact(text, uuid, jsonb, text) to authenticated;
revoke all on function private.fact_plain_number(text) from public;
revoke all on function private.fact_reference_bounds(text) from public;
