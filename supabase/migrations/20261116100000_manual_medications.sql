-- =============================================================================
-- Medicines a person adds by hand.
--
-- Many prescriptions (handwritten ones especially) cannot be read reliably. A person, or the
-- family member who manages their record, can type the medicines in. Rules:
--   * Stored with origin 'user_entered' (or 'user_corrected' for an edit), never 'extracted':
--     the app and a Doctor can always tell a typed-in medicine from one read off a report.
--   * Only the person themself, or the custodian of a relative, may add or change them: the
--     same rule as adding a health report ('manage'). Managers and viewers cannot.
--   * A typed-in medicine is NOT tied to a report, even when it was copied from an uploaded
--     prescription. Deleting a report removes every fact tied to it; a medicine the family
--     typed must not vanish because they later replaced a blurry photo.
--   * Nothing is overwritten: an edit or "stopped" adds a new version; the old one is kept as
--     history. Removing marks it rejected, as with any fact marked not correct.
--   * Text is stored exactly as typed. No drug database, no codes, no interpretation.
-- Also: removing a relative now removes their report-less facts first (they would otherwise
-- block the removal).
-- No table or policy changes. No existing row changes.
-- =============================================================================

create or replace function private.medication_field(p_fields jsonb, p_key text, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := nullif(btrim(coalesce(p_fields ->> p_key, '')), '');
begin
  if v is null then return null; end if;
  if char_length(v) > p_max then
    raise exception 'medication: % is too long', p_key using errcode = '22023';
  end if;
  if v ~ '[[:cntrl:]]' then
    raise exception 'medication: % contains characters that are not allowed', p_key using errcode = '22023';
  end if;
  return v;
end;
$$;
revoke all on function private.medication_field(jsonb, text, integer) from public, anon, authenticated;

create or replace function private.medication_date(p_fields jsonb, p_key text)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  raw text := nullif(btrim(coalesce(p_fields ->> p_key, '')), '');
  d date;
begin
  if raw is null then return null; end if;
  if raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'medication: the date is not valid' using errcode = '22023';
  end if;
  begin
    d := raw::date;
  exception when others then
    raise exception 'medication: the date is not valid' using errcode = '22023';
  end;
  if d > current_date or d < date '1900-01-01' then
    raise exception 'medication: the date is not valid' using errcode = '22023';
  end if;
  return d;
end;
$$;
revoke all on function private.medication_date(jsonb, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Add
-- -----------------------------------------------------------------------------
create or replace function public.add_medication(p_subject_id uuid, p_fields jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  allowed constant text[] := array['name', 'dose', 'frequency', 'duration', 'instructions', 'prescriber', 'start_date', 'status'];
  unknown text;
  v_name text;
  v_status text;
  new_id uuid;
begin
  if uid is null then
    raise exception 'add_medication: sign in to add a medicine' using errcode = '42501';
  end if;
  if private.account_deletion_started(uid) then
    raise exception 'add_medication: this account is being deleted' using errcode = '42501';
  end if;
  if p_subject_id is null or not public.can_access_subject(p_subject_id, 'manage') then
    raise exception 'add_medication: you can only add medicines for yourself or a relative you manage' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'add_medication: nothing to add' using errcode = '22023';
  end if;
  select k into unknown from jsonb_object_keys(p_fields) k where k <> all (allowed) limit 1;
  if unknown is not null then
    raise exception 'add_medication: % cannot be set', quote_ident(unknown) using errcode = '22023';
  end if;

  v_name := private.medication_field(p_fields, 'name', 300);
  if v_name is null then
    raise exception 'add_medication: the medicine name is required' using errcode = '22023';
  end if;
  v_status := coalesce(nullif(btrim(coalesce(p_fields ->> 'status', '')), ''), 'active');
  if v_status not in ('active', 'as_needed', 'stopped') then
    raise exception 'add_medication: that status is not supported' using errcode = '22023';
  end if;

  insert into public.medications (
    origin, subject_id, name_as_written, dose_as_written, frequency_as_written,
    duration_as_written, instructions_as_written, prescriber_name, start_date, status)
  values (
    'user_entered', p_subject_id, v_name,
    private.medication_field(p_fields, 'dose', 100), private.medication_field(p_fields, 'frequency', 100),
    private.medication_field(p_fields, 'duration', 100), private.medication_field(p_fields, 'instructions', 1000),
    private.medication_field(p_fields, 'prescriber', 200), private.medication_date(p_fields, 'start_date'),
    v_status::public.medication_status)
  returning id into new_id;
  return new_id;
end;
$$;
comment on function public.add_medication(uuid, jsonb) is
  'Adds a medicine a person typed in (origin user_entered) for themself or a relative they manage.';
revoke all on function public.add_medication(uuid, jsonb) from public, anon;
grant execute on function public.add_medication(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Change (edit, or mark stopped): a new version; the old one is kept as history.
-- -----------------------------------------------------------------------------
create or replace function public.update_medication(p_medication_id uuid, p_fields jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  orig public.medications%rowtype;
  allowed constant text[] := array['name', 'dose', 'frequency', 'duration', 'instructions', 'prescriber', 'status', 'end_date'];
  unknown text;
  v_name text; v_dose text; v_freq text; v_dur text; v_ins text; v_by text; v_status text; v_end date;
  new_id uuid;
begin
  if uid is null then
    raise exception 'update_medication: sign in to change a medicine' using errcode = '42501';
  end if;
  if private.account_deletion_started(uid) then
    raise exception 'update_medication: this account is being deleted' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'update_medication: nothing to change' using errcode = '22023';
  end if;
  select k into unknown from jsonb_object_keys(p_fields) k where k <> all (allowed) limit 1;
  if unknown is not null then
    raise exception 'update_medication: % cannot be changed', quote_ident(unknown) using errcode = '22023';
  end if;

  -- Someone else's medicine reads as "not found".
  select * into orig from public.medications m where m.id = p_medication_id and m.user_id = uid for update;
  if not found or not public.can_access_subject(orig.subject_id, 'manage') then
    raise exception 'update_medication: that medicine was not found' using errcode = 'P0002';
  end if;
  if orig.superseded_at is not null then
    raise exception 'update_medication: that medicine has already been changed — change the newer version instead' using errcode = '22023';
  end if;
  if orig.review_status = 'rejected' then
    raise exception 'update_medication: that medicine was removed' using errcode = '22023';
  end if;

  v_name := case when p_fields ? 'name' then private.medication_field(p_fields, 'name', 300) else orig.name_as_written end;
  if v_name is null then
    raise exception 'update_medication: the medicine name is required' using errcode = '22023';
  end if;
  v_dose := case when p_fields ? 'dose' then private.medication_field(p_fields, 'dose', 100) else orig.dose_as_written end;
  v_freq := case when p_fields ? 'frequency' then private.medication_field(p_fields, 'frequency', 100) else orig.frequency_as_written end;
  v_dur  := case when p_fields ? 'duration' then private.medication_field(p_fields, 'duration', 100) else orig.duration_as_written end;
  v_ins  := case when p_fields ? 'instructions' then private.medication_field(p_fields, 'instructions', 1000) else orig.instructions_as_written end;
  v_by   := case when p_fields ? 'prescriber' then private.medication_field(p_fields, 'prescriber', 200) else orig.prescriber_name end;
  v_status := case when p_fields ? 'status' then nullif(btrim(coalesce(p_fields ->> 'status', '')), '') else orig.status::text end;
  if v_status is null or v_status not in ('active', 'as_needed', 'stopped', 'unknown') then
    raise exception 'update_medication: that status is not supported' using errcode = '22023';
  end if;
  v_end := case when p_fields ? 'end_date' then private.medication_date(p_fields, 'end_date') else orig.end_date end;
  if v_end is not null and orig.start_date is not null and v_end < orig.start_date then
    raise exception 'update_medication: the date is not valid' using errcode = '22023';
  end if;

  if v_name = orig.name_as_written and v_dose is not distinct from orig.dose_as_written
     and v_freq is not distinct from orig.frequency_as_written and v_dur is not distinct from orig.duration_as_written
     and v_ins is not distinct from orig.instructions_as_written and v_by is not distinct from orig.prescriber_name
     and v_status = orig.status::text and v_end is not distinct from orig.end_date then
    raise exception 'update_medication: nothing was changed' using errcode = '22023';
  end if;

  -- Through the normal triggers: confirmed, evidence inherited, original superseded, both audited.
  perform set_config('hi.fact_correction', 'on', true);
  insert into public.medications (
    origin, supersedes_id, subject_id, encounter_id, name_as_written, strength_as_written, dose_as_written,
    frequency_as_written, route_as_written, duration_as_written, instructions_as_written, prescribed_date,
    start_date, end_date, prescriber_name, status)
  values (
    'user_corrected', orig.id, orig.subject_id, orig.encounter_id, v_name, orig.strength_as_written, v_dose,
    v_freq, orig.route_as_written, v_dur, v_ins, orig.prescribed_date,
    orig.start_date, v_end, v_by, v_status::public.medication_status)
  returning id into new_id;
  perform set_config('hi.fact_correction', 'off', true);
  return new_id;
end;
$$;
comment on function public.update_medication(uuid, jsonb) is
  'Records a change to one of a person''s current medicines (edit, or stopped). The earlier version is kept as history.';
revoke all on function public.update_medication(uuid, jsonb) from public, anon;
grant execute on function public.update_medication(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Remove one that was typed in by mistake. A medicine read from a report is not removed here.
-- -----------------------------------------------------------------------------
create or replace function public.remove_medication(p_medication_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  orig public.medications%rowtype;
begin
  if uid is null then
    raise exception 'remove_medication: sign in to remove a medicine' using errcode = '42501';
  end if;
  select * into orig from public.medications m where m.id = p_medication_id and m.user_id = uid for update;
  if not found or not public.can_access_subject(orig.subject_id, 'manage') then
    raise exception 'remove_medication: that medicine was not found' using errcode = 'P0002';
  end if;
  if orig.superseded_at is not null or orig.review_status = 'rejected' then
    raise exception 'remove_medication: that medicine was already changed or removed' using errcode = '22023';
  end if;
  if orig.origin = 'extracted' then
    raise exception 'remove_medication: a medicine read from a report cannot be removed here' using errcode = '22023';
  end if;
  update public.medications set review_status = 'rejected' where id = orig.id;
end;
$$;
comment on function public.remove_medication(uuid) is
  'Removes (marks rejected) a medicine the person typed in or changed. The row is kept as history.';
revoke all on function public.remove_medication(uuid) from public, anon;
grant execute on function public.remove_medication(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Removing a relative: their report-less facts go first (same body otherwise).
-- -----------------------------------------------------------------------------
create or replace function public.engine_finish_subject_removal(p_subject uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.subjects%rowtype;
  v_grant record;
begin
  perform private.require_service_role();
  select * into v_s from public.subjects where id = p_subject;
  if not found then return jsonb_build_object('status', 'removed'); end if;
  if v_s.relationship = 'self' or v_s.custodian_user_id is distinct from p_user_id or v_s.legal_hold
     or not exists (select 1 from private.subject_deletion_confirmations where subject_id = p_subject)
     or exists (select 1 from public.documents where subject_id = p_subject) then
    raise exception 'subject removal is not permitted' using errcode = '42501';
  end if;
  for v_grant in select a.id, a.grantee_user_id, a.role from public.subject_access a where a.subject_id = p_subject and a.status = 'active' loop
    insert into public.account_notices (user_id, code, subject_name) values (v_grant.grantee_user_id, 'access_ended_person_removed', v_s.display_name);
    perform private.write_audit(v_grant.grantee_user_id, 'access.removed_by_person_removal', 'subject_access', v_grant.id, jsonb_build_object('role', v_grant.role));
  end loop;
  -- Facts with no report behind them (medicines the family typed in, corrections that outlived
  -- their report) belong to this person and go with them. Reports were already removed one by one.
  delete from public.fact_sources where subject_id = p_subject;
  delete from public.medications  where subject_id = p_subject;
  delete from public.observations where subject_id = p_subject;
  delete from public.conditions   where subject_id = p_subject;
  delete from public.procedures   where subject_id = p_subject;
  delete from public.allergies    where subject_id = p_subject;
  delete from public.encounters   where subject_id = p_subject;
  delete from public.subjects where id = p_subject;
  perform private.write_audit(p_user_id, 'subject.removed', 'subjects', p_subject, jsonb_build_object('relationship', v_s.relationship));
  return jsonb_build_object('status', 'removed');
end;
$$;
