-- =============================================================================
-- Health data model 3/4 (promoted for Gate 1 — document understanding)
-- encounters · observations · conditions · medications · procedures · allergies
--
-- MEDICAL-DATA INTEGRITY RULES (enforced by the database for every fact table):
--
--  1. Provenance. Every fact records its `origin`:
--       extracted       — produced by server-side extraction. MUST link to the
--                         document, the page, the extraction run, carry the
--                         verbatim source_text and a confidence (0–1).
--       user_entered    — typed in by the person (review_status = confirmed).
--       user_corrected  — the person's correction of another fact; MUST name
--                         the fact it supersedes and inherits its evidence.
--     Only server code can create `extracted` facts. The app can never claim
--     AI provenance or set a confidence.
--
--  2. Source values never change. `*_as_written` columns hold exactly what the
--     document says and are immutable for everyone, including server code.
--     Server code may refine only the listed INTERPRETATION columns (codes,
--     normalised units, parsed numbers); each refinement is audited.
--
--  3. Corrections append, never overwrite. A correction is a new row with
--     `supersedes_id`; the database then stamps the old row `superseded_at`.
--     Nothing is deleted; the full chain stays queryable.
--
--  4. Review. The app may only mark a fact confirmed / rejected.
--
--  5. Same-owner references. Composite (id, user_id) foreign keys make it
--     impossible to link a fact to another user's document, page, run,
--     encounter or fact.
--
--  "Current" facts = not superseded and not rejected → the current_* views.
-- =============================================================================

create type public.fact_origin        as enum ('extracted', 'user_entered', 'user_corrected');
create type public.fact_review_status as enum ('unreviewed', 'confirmed', 'rejected');

create type public.encounter_type       as enum ('lab_test', 'consultation', 'hospital_admission', 'procedure', 'immunization', 'imaging', 'other');
create type public.observation_category as enum ('laboratory', 'vital_sign', 'imaging', 'urine', 'other');
create type public.condition_status     as enum ('active', 'resolved', 'monitoring', 'unknown');
create type public.medication_status    as enum ('active', 'stopped', 'as_needed', 'unknown');
create type public.procedure_kind       as enum ('procedure', 'immunization');
create type public.allergy_category     as enum ('medication', 'food', 'environment', 'other', 'unknown');
create type public.allergy_severity     as enum ('mild', 'moderate', 'severe', 'unknown');

-- -----------------------------------------------------------------------------
-- Shared trigger functions for every clinical fact table.
-- -----------------------------------------------------------------------------

-- BEFORE INSERT: ownership, origin rules, correction target checks.
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
    new.review_status     := 'confirmed';
    new.reviewed_at       := now();
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
    -- A correction keeps pointing at the same evidence as the original.
    if new.origin = 'user_corrected' and new.document_id is null then
      new.document_id      := target.document_id;
      new.document_page_id := target.document_page_id;
      new.source_text      := target.source_text;
    end if;
  end if;

  return new;
end;
$$;

-- AFTER INSERT: supersede the corrected fact + audit.
create or replace function private.clinical_fact_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.supersedes_id is not null then
    perform set_config('hi.fact_supersede', 'on', true);
    execute format('update public.%I set superseded_at = now() where id = $1', tg_table_name) using new.supersedes_id;
    perform set_config('hi.fact_supersede', 'off', true);
  end if;

  perform private.write_audit(new.user_id, 'fact.' || new.origin::text, tg_table_name, new.id,
    jsonb_build_object('document_id', new.document_id, 'document_page_id', new.document_page_id,
                       'extraction_run_id', new.extraction_run_id, 'supersedes_id', new.supersedes_id));
  return null;
end;
$$;

-- BEFORE UPDATE: immutability. TG_ARGV = interpretation columns the SERVER may refine.
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
  end if;

  if new.review_status is distinct from old.review_status then
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

-- AFTER UPDATE: audit which columns changed (names only, never values).
create or replace function private.clinical_fact_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
begin
  select array_agg(n.key order by n.key) into changed
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
   where n.value is distinct from o.value and n.key not in ('updated_at', 'reviewed_at');
  if changed is not null then
    perform private.write_audit(new.user_id,
      case
        when 'superseded_at' = any(changed) then 'fact.superseded'
        when 'review_status' = any(changed) then 'fact.reviewed'
        else 'fact.reinterpreted'
      end,
      tg_table_name, new.id,
      jsonb_build_object('changed', changed, 'review_status', new.review_status));
  end if;
  return null;
end;
$$;

-- Adds the shared provenance columns, constraints, triggers, RLS, grants and
-- a current_<table> view to a fact table. Used only by this migration.
create or replace function private.install_clinical_fact(p_table text, p_server_mutable text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format($ddl$
    alter table public.%1$I
      add column origin            public.fact_origin not null,
      add column document_id       uuid,
      add column document_page_id  uuid,
      add column extraction_run_id uuid,
      add column source_text       text check (source_text is null or char_length(source_text) <= 2000),
      add column source_bbox       jsonb check (source_bbox is null or jsonb_typeof(source_bbox) = 'object'),
      add column confidence        numeric(4, 3) check (confidence is null or confidence between 0 and 1),
      add column review_status     public.fact_review_status not null default 'unreviewed',
      add column reviewed_at       timestamptz,
      add column supersedes_id     uuid,
      add column superseded_at     timestamptz,
      add column created_at        timestamptz not null default now(),
      add column updated_at        timestamptz not null default now(),
      add constraint %1$s_id_user_key unique (id, user_id),
      add constraint %1$s_extracted_has_evidence check (
        origin <> 'extracted' or (document_id is not null and document_page_id is not null
          and extraction_run_id is not null and confidence is not null and source_text is not null)),
      add constraint %1$s_correction_has_target check (origin <> 'user_corrected' or supersedes_id is not null),
      add constraint %1$s_ai_fields_only_when_extracted check (
        origin = 'extracted' or (extraction_run_id is null and confidence is null)),
      add constraint %1$s_page_needs_document check (document_page_id is null or document_id is not null),
      add constraint %1$s_not_self_superseding check (supersedes_id is null or supersedes_id <> id)
  $ddl$, p_table);

  execute format($ddl$
    alter table public.%1$I
      add constraint %1$s_document_fk foreign key (document_id, user_id) references public.documents (id, user_id),
      add constraint %1$s_page_fk foreign key (document_page_id, document_id) references public.document_pages (id, document_id),
      add constraint %1$s_run_fk foreign key (extraction_run_id, user_id) references public.extraction_runs (id, user_id),
      add constraint %1$s_supersedes_fk foreign key (supersedes_id, user_id) references public.%1$I (id, user_id)
  $ddl$, p_table);

  execute format('create index %1$s_user_created_idx on public.%1$I (user_id, created_at desc)', p_table);
  execute format('create index %1$s_document_idx on public.%1$I (document_id)', p_table);
  execute format('create index %1$s_run_idx on public.%1$I (extraction_run_id)', p_table);
  execute format('create unique index %1$s_supersedes_once_idx on public.%1$I (supersedes_id) where supersedes_id is not null', p_table);

  execute format('create trigger %1$s_set_updated_at before update on public.%1$I for each row execute function private.set_updated_at()', p_table);
  execute format('create trigger %1$s_before_insert before insert on public.%1$I for each row execute function private.clinical_fact_before_insert()', p_table);
  execute format('create trigger %1$s_before_update before update on public.%1$I for each row execute function private.clinical_fact_before_update(%2$s)',
    p_table, (select coalesce(string_agg(quote_literal(c), ', '), '') from unnest(p_server_mutable) c));
  execute format('create trigger %1$s_after_insert after insert on public.%1$I for each row execute function private.clinical_fact_after_insert()', p_table);
  execute format('create trigger %1$s_after_update after update on public.%1$I for each row execute function private.clinical_fact_after_update()', p_table);

  execute format('alter table public.%1$I enable row level security', p_table);
  execute format('create policy %1$I on public.%2$I for select to authenticated using ((select auth.uid()) = user_id)', p_table || '_select_own', p_table);
  execute format('create policy %1$I on public.%2$I for insert to authenticated with check ((select auth.uid()) = user_id)', p_table || '_insert_own', p_table);
  execute format('create policy %1$I on public.%2$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', p_table || '_update_own', p_table);
  -- No DELETE policy: facts are never deleted from the app.

  execute format('revoke all on public.%1$I from anon, authenticated', p_table);
  execute format('grant select, insert on public.%1$I to authenticated', p_table);
  execute format('grant update (review_status) on public.%1$I to authenticated', p_table);

  execute format($ddl$
    create view public.%1$I with (security_invoker = true) as
      select * from public.%2$I where superseded_at is null and review_status <> 'rejected'
  $ddl$, 'current_' || p_table, p_table);
  execute format('revoke all on public.%1$I from anon, authenticated', 'current_' || p_table);
  execute format('grant select on public.%1$I to authenticated', 'current_' || p_table);
end;
$$;

-- -----------------------------------------------------------------------------
-- encounters — a visit / test / admission a document describes.
-- -----------------------------------------------------------------------------
create table public.encounters (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- as written
  encounter_date         date,
  end_date               date,
  provider_name          text check (provider_name is null or char_length(provider_name) <= 200),
  facility_name          text check (facility_name is null or char_length(facility_name) <= 200),
  reason_as_written      text check (reason_as_written is null or char_length(reason_as_written) <= 1000),
  -- interpretation
  encounter_type         public.encounter_type not null default 'other',
  specialty              text check (specialty is null or char_length(specialty) <= 100),
  interpretation_version text check (interpretation_version is null or char_length(interpretation_version) <= 64),
  constraint encounters_dates check (end_date is null or encounter_date is null or end_date >= encounter_date)
);
select private.install_clinical_fact('encounters', array['encounter_type', 'specialty', 'interpretation_version']);
create index encounters_user_date_idx on public.encounters (user_id, encounter_date desc);

-- -----------------------------------------------------------------------------
-- observations — lab results, vitals, measurements (Trends are queries on these).
-- -----------------------------------------------------------------------------
create table public.observations (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  encounter_id               uuid,
  -- as written (immutable)
  name_as_written            text not null check (char_length(name_as_written) between 1 and 300),
  value_as_written           text not null check (char_length(value_as_written) between 1 and 300),
  unit_as_written            text check (unit_as_written is null or char_length(unit_as_written) <= 50),
  reference_range_as_written text check (reference_range_as_written is null or char_length(reference_range_as_written) <= 200),
  abnormal_flag_as_written   text check (abnormal_flag_as_written is null or char_length(abnormal_flag_as_written) <= 20),
  effective_date             date,
  specimen                   text check (specimen is null or char_length(specimen) <= 100),
  -- interpretation (server-refinable, audited)
  category                   public.observation_category not null default 'other',
  code_system                text check (code_system is null or code_system in ('LOINC', 'SNOMED', 'LOCAL')),
  code                       text check (code is null or char_length(code) <= 64),
  display_name               text check (display_name is null or char_length(display_name) <= 200),
  value_numeric              numeric,
  value_text                 text check (value_text is null or char_length(value_text) <= 300),
  value_normalized           numeric,
  unit_normalized            text check (unit_normalized is null or char_length(unit_normalized) <= 50),
  reference_low              numeric,
  reference_high             numeric,
  interpretation_version     text check (interpretation_version is null or char_length(interpretation_version) <= 64),
  constraint observations_code_needs_system check (code is null or code_system is not null),
  constraint observations_normalized_needs_unit check (value_normalized is null or unit_normalized is not null),
  constraint observations_reference_order check (reference_low is null or reference_high is null or reference_low <= reference_high)
);
select private.install_clinical_fact('observations', array[
  'category', 'code_system', 'code', 'display_name', 'value_numeric', 'value_text',
  'value_normalized', 'unit_normalized', 'reference_low', 'reference_high', 'interpretation_version']);
alter table public.observations add constraint observations_encounter_fk
  foreign key (encounter_id, user_id) references public.encounters (id, user_id);
create index observations_user_code_date_idx on public.observations (user_id, code, effective_date desc);
create index observations_user_date_idx on public.observations (user_id, effective_date desc);
create index observations_encounter_idx on public.observations (encounter_id);

-- -----------------------------------------------------------------------------
-- conditions — diagnoses/problems as documented (never inferred by the app).
-- -----------------------------------------------------------------------------
create table public.conditions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  encounter_id           uuid,
  -- as written
  name_as_written        text not null check (char_length(name_as_written) between 1 and 300),
  status_as_written      text check (status_as_written is null or char_length(status_as_written) <= 100),
  recorded_date          date,
  onset_date             date,
  abatement_date         date,
  -- interpretation
  code_system            text check (code_system is null or code_system in ('ICD10', 'SNOMED', 'LOCAL')),
  code                   text check (code is null or char_length(code) <= 64),
  display_name           text check (display_name is null or char_length(display_name) <= 200),
  clinical_status        public.condition_status not null default 'unknown',
  interpretation_version text check (interpretation_version is null or char_length(interpretation_version) <= 64),
  constraint conditions_code_needs_system check (code is null or code_system is not null)
);
select private.install_clinical_fact('conditions', array['code_system', 'code', 'display_name', 'clinical_status', 'interpretation_version']);
alter table public.conditions add constraint conditions_encounter_fk
  foreign key (encounter_id, user_id) references public.encounters (id, user_id);
create index conditions_user_date_idx on public.conditions (user_id, recorded_date desc);

-- -----------------------------------------------------------------------------
-- medications — as prescribed/recorded in a document or entered by the user.
-- -----------------------------------------------------------------------------
create table public.medications (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  encounter_id            uuid,
  -- as written
  name_as_written         text not null check (char_length(name_as_written) between 1 and 300),
  strength_as_written     text check (strength_as_written is null or char_length(strength_as_written) <= 100),
  dose_as_written         text check (dose_as_written is null or char_length(dose_as_written) <= 100),
  frequency_as_written    text check (frequency_as_written is null or char_length(frequency_as_written) <= 100),
  route_as_written        text check (route_as_written is null or char_length(route_as_written) <= 50),
  duration_as_written     text check (duration_as_written is null or char_length(duration_as_written) <= 100),
  instructions_as_written text check (instructions_as_written is null or char_length(instructions_as_written) <= 1000),
  prescribed_date         date,
  start_date              date,
  end_date                date,
  prescriber_name         text check (prescriber_name is null or char_length(prescriber_name) <= 200),
  -- interpretation
  generic_name            text check (generic_name is null or char_length(generic_name) <= 200),
  code_system             text check (code_system is null or code_system in ('RXNORM', 'LOCAL')),
  code                    text check (code is null or char_length(code) <= 64),
  status                  public.medication_status not null default 'unknown',
  interpretation_version  text check (interpretation_version is null or char_length(interpretation_version) <= 64),
  constraint medications_code_needs_system check (code is null or code_system is not null),
  constraint medications_dates check (end_date is null or start_date is null or end_date >= start_date)
);
select private.install_clinical_fact('medications', array['generic_name', 'code_system', 'code', 'status', 'interpretation_version']);
alter table public.medications add constraint medications_encounter_fk
  foreign key (encounter_id, user_id) references public.encounters (id, user_id);
create index medications_user_date_idx on public.medications (user_id, prescribed_date desc);

-- -----------------------------------------------------------------------------
-- procedures — procedures and immunizations (procedure_kind).
-- -----------------------------------------------------------------------------
create table public.procedures (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  encounter_id           uuid,
  -- as written
  name_as_written        text not null check (char_length(name_as_written) between 1 and 300),
  performed_date         date,
  performer_name         text check (performer_name is null or char_length(performer_name) <= 200),
  facility_name          text check (facility_name is null or char_length(facility_name) <= 200),
  dose_number_as_written text check (dose_number_as_written is null or char_length(dose_number_as_written) <= 20),
  -- interpretation
  procedure_kind         public.procedure_kind not null default 'procedure',
  code_system            text check (code_system is null or code_system in ('SNOMED', 'CPT', 'CVX', 'LOCAL')),
  code                   text check (code is null or char_length(code) <= 64),
  display_name           text check (display_name is null or char_length(display_name) <= 200),
  interpretation_version text check (interpretation_version is null or char_length(interpretation_version) <= 64),
  constraint procedures_code_needs_system check (code is null or code_system is not null)
);
select private.install_clinical_fact('procedures', array['procedure_kind', 'code_system', 'code', 'display_name', 'interpretation_version']);
alter table public.procedures add constraint procedures_encounter_fk
  foreign key (encounter_id, user_id) references public.encounters (id, user_id);
create index procedures_user_date_idx on public.procedures (user_id, performed_date desc);

-- -----------------------------------------------------------------------------
-- allergies — allergies & intolerances as documented or reported.
-- -----------------------------------------------------------------------------
create table public.allergies (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  encounter_id           uuid,
  -- as written
  substance_as_written   text not null check (char_length(substance_as_written) between 1 and 300),
  reaction_as_written    text check (reaction_as_written is null or char_length(reaction_as_written) <= 500),
  severity_as_written    text check (severity_as_written is null or char_length(severity_as_written) <= 50),
  recorded_date          date,
  -- interpretation
  category               public.allergy_category not null default 'unknown',
  severity               public.allergy_severity not null default 'unknown',
  code_system            text check (code_system is null or code_system in ('SNOMED', 'RXNORM', 'LOCAL')),
  code                   text check (code is null or char_length(code) <= 64),
  display_name           text check (display_name is null or char_length(display_name) <= 200),
  interpretation_version text check (interpretation_version is null or char_length(interpretation_version) <= 64),
  constraint allergies_code_needs_system check (code is null or code_system is not null)
);
select private.install_clinical_fact('allergies', array['category', 'severity', 'code_system', 'code', 'display_name', 'interpretation_version']);
alter table public.allergies add constraint allergies_encounter_fk
  foreign key (encounter_id, user_id) references public.encounters (id, user_id);
create index allergies_user_date_idx on public.allergies (user_id, recorded_date desc);

-- The installer is only needed while migrating.
drop function private.install_clinical_fact(text, text[]);

revoke all on all functions in schema private from public, anon, authenticated;
