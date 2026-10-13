-- =============================================================================
-- M1 follow-up — a correction survives deleting its report while another
-- report of the same person still contains the result.
--
-- Before: engine_delete_document kept (re-recorded from another report's
-- evidence) only live EXTRACTED facts that another report supports. A
-- person's correction — origin user_corrected, whose other-report support is
-- recorded against the original reading or the correction — was deleted
-- with the report, silently dropping the result from Health Memory even
-- though another report still holds it.
--
-- Now, additionally: for each live correction of the deleted report whose
-- chain (correction → earlier corrections → original reading) another
-- not-being-deleted report of the SAME person supports, the function
--   1. re-records that report's own reading as the original (its page, quote,
--      run, confidence — exactly how kept facts are re-recorded), and
--   2. re-records the person's correction on top (values, reason,
--      confirmation, original correction time); the insert trigger
--      supersedes that reading and hands the correction its fingerprint,
--   3. points other reports' support at the live correction.
-- Intermediate corrections and the deleted report's own reading go with the
-- deleted report (they were recorded from it). A correction no other report
-- supports is removed with its report, as before. Nothing else changes.
-- Service role only, as before.
-- =============================================================================

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
  kept_corrections integer;
  original_id uuid;
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
  if to_regclass('pg_temp.engine_keep_correction') is null then
    create temporary table engine_keep_correction (correction jsonb, original jsonb, chain uuid[], source_id uuid, source jsonb) on commit drop;
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

    -- Live corrections of this document whose chain (the correction, earlier
    -- corrections and the original reading) another (not-being-deleted)
    -- report of the same person still supports. The person's correction must
    -- not disappear with this report while that report still holds the result.
    truncate pg_temp.engine_keep_correction;
    execute format($q$
      insert into pg_temp.engine_keep_correction (correction, original, chain, source_id, source)
      with recursive live_correction as (
        select x.* from public.%1$I x
         where x.document_id = $1 and x.user_id = $2 and x.superseded_at is null and x.origin = 'user_corrected'
      ), chain as (
        select c.id as head, c.id as fact_id, c.supersedes_id from live_correction c
        union all
        select ch.head, f.id, f.supersedes_id
          from chain ch join public.%1$I f on f.id = ch.supersedes_id and f.user_id = $2
      )
      select to_jsonb(c), to_jsonb(o), ch.ids, s.id, to_jsonb(s)
        from live_correction c
        cross join lateral (select array_agg(chain.fact_id) as ids from chain where chain.head = c.id) ch
        cross join lateral (
          select f.* from chain join public.%1$I f on f.id = chain.fact_id
           where chain.head = c.id and chain.supersedes_id is null and f.origin = 'extracted'
           limit 1
        ) o
        cross join lateral (
          select fs.*
            from public.fact_sources fs
            join public.documents od on od.id = fs.document_id and od.user_id = $2
           where fs.fact_table = %1$L and fs.fact_id = any (ch.ids) and fs.document_id <> $1
             and od.status <> 'deleting'
           order by (fs.confidence_gate = 'passed') desc, fs.confidence desc, fs.created_at, fs.id
           limit 1
        ) s
    $q$, t) using p_document_id, p_user_id;

    execute format('select count(*) from public.%I where document_id = $1 and user_id = $2 and superseded_at is null', t)
      into live using p_document_id, p_user_id;
    kept_corrections := (select count(*) from pg_temp.engine_keep_correction);
    removed := removed + live - (select count(*) from pg_temp.engine_keep) - kept_corrections;

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

    -- Re-record each supported correction on the other report: that report's
    -- own reading becomes the original it replaces, and the person's
    -- correction (values, reason, confirmation, when it was made) is recorded
    -- on top. The insert trigger supersedes that reading and hands the
    -- correction its fingerprint, so a reread can't bring the old value back.
    for plan in select * from pg_temp.engine_keep_correction loop
      fact := plan.original || jsonb_build_object(
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
      if t = 'observations' and fact ->> 'encounter_id' is not null
         and not exists (select 1 from public.encounters e where e.id = (fact ->> 'encounter_id')::uuid) then
        fact := fact || jsonb_build_object('encounter_id', null);
      end if;
      execute format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, $1)).* returning id', t)
        into original_id using fact;

      fact := plan.correction || jsonb_build_object(
        'id', gen_random_uuid(),
        'supersedes_id', original_id,
        'document_id', null,          -- inherited from the original by the insert trigger
        'document_page_id', null,
        'source_text', null,
        'fact_fingerprint', null,     -- taken over from the original by the insert trigger
        'superseded_at', null,
        'updated_at', now());
      if t = 'observations' and fact ->> 'encounter_id' is not null
         and not exists (select 1 from public.encounters e where e.id = (fact ->> 'encounter_id')::uuid) then
        fact := fact || jsonb_build_object('encounter_id', null);
      end if;
      execute format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, $1)).* returning id', t)
        into new_id using fact;

      -- The used source is now the original's own evidence; any other
      -- report's support follows the live correction.
      update public.fact_sources set fact_id = new_id
       where fact_table = t and fact_id = any (plan.chain) and id <> plan.source_id;
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

revoke all on function public.engine_delete_document(uuid, uuid) from public, anon, authenticated;
grant execute on function public.engine_delete_document(uuid, uuid) to service_role;
