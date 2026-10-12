-- ROLLBACK for 20261012090000_fact_corrections.sql  (run rollback-m2.sql FIRST if M2 is deployed)
-- Restores the three shared fact triggers exactly as defined in 20261001090200,
-- drops correct_fact and its helpers, and removes correction_reason.
--
-- DATA LIMITS — read before running:
--  * correction_reason holds what people typed. This script REFUSES to run if
--    any reason is stored (dropping the column would lose them). Export them
--    first and remove the guard deliberately if that loss is accepted.
--  * Corrections already made stay as ordinary user_corrected rows (valid in
--    the old schema); their originals stay superseded. Nothing is deleted or
--    un-superseded. Corrections keep the fingerprint they took over, which
--    the old engine also respects.
--  * After rollback, an app build with the Result screen can no longer save
--    corrections (correct_fact is gone) — roll back the app first.
begin;
set local lock_timeout = '5s';
do $$
declare
  n bigint := 0; t text; c bigint;
begin
  foreach t in array array['encounters','observations','conditions','medications','procedures','allergies'] loop
    execute format('select count(*) from public.%I where correction_reason is not null', t) into c;
    n := n + c;
  end loop;
  if n > 0 then
    raise exception 'rollback refused: % correction reason(s) are stored; export them and remove this guard deliberately', n;
  end if;
end $$;

drop function if exists public.correct_fact(text, uuid, jsonb, text);
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

drop function if exists private.fact_identity_held(uuid, text, public.fact_review_status);
drop function if exists private.report_identity_unconfirmed(uuid);
drop function if exists private.fact_reference_bounds(text);
drop function if exists private.fact_plain_number(text);

do $$
declare
  t text;
begin
  foreach t in array array['encounters','observations','conditions','medications','procedures','allergies'] loop
    execute format('alter table public.%I drop constraint if exists %s', t, t || '_reason_only_on_corrections');
    execute format('alter table public.%I drop column if exists correction_reason', t);
  end loop;
end $$;
commit;
