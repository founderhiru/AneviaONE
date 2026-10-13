-- READ-ONLY diagnosis of the M1 objects, as ONE query (SQL Editor shows only
-- the last statement's result). Only catalog reads and counts; nothing is
-- created, changed or locked beyond ordinary reads. No health values are read.
--
-- Purpose: when prod_precheck shows M1 objects present but no M1 row in
-- supabase_migrations.schema_migrations, tell apart
--   (a) M1 fully applied outside the migration tool (e.g. SQL Editor),
--   (b) a partial application,
--   (c) a different/older definition of the same objects.
-- Compare each result with the three expected columns in
-- docs/M1_PRODUCTION_MIGRATION_REVIEW.md §12 (recorded on throwaway databases).
select n, "check", result from (
  -- 1. Migration history: every recorded version from 20261001 on.
  select 1 as n, 'history since 20261001' as "check",
         coalesce(string_agg(version, ', ' order by version), 'none') as result
    from supabase_migrations.schema_migrations where version >= '20261001000000'
  union all
  -- 2. correction_reason column on each of the six fact tables (expect all or none).
  select 2, 'correction_reason column per table',
         string_agg(t || '=' || exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public' and c.table_name = t and c.column_name = 'correction_reason')::text, ' ' order by t)
    from unnest(array['allergies','conditions','encounters','medications','observations','procedures']) t
  union all
  -- 3. The check constraint migration 1 adds with each column.
  select 3, 'reason_only_on_corrections constraints', count(*)::text
    from pg_constraint where conname like '%\_reason\_only\_on\_corrections'
  union all
  -- 4. Definitions (md5) of every function migration 1 creates or replaces, and migration 2's.
  select 4, 'md5 ' || n.nspname || '.' || p.proname, md5(pg_get_functiondef(p.oid))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname = 'private' and p.proname in ('clinical_fact_before_insert', 'clinical_fact_before_update', 'clinical_fact_after_insert',
                                                  'report_identity_unconfirmed', 'fact_identity_held', 'fact_plain_number', 'fact_reference_bounds'))
      or (n.nspname = 'public' and p.proname in ('correct_fact', 'engine_delete_document'))
  union all
  -- 5. Who may run correct_fact (migration 1: authenticated only).
  select 5, 'correct_fact EXECUTE authenticated/anon/public',
         coalesce((select has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || '/' ||
                          has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' ||
                          coalesce((select bool_or(a.grantee = 0) from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                     where a.privilege_type = 'EXECUTE'), false)::text
                     from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                    where s.nspname = 'public' and p.proname = 'correct_fact' limit 1), 'absent')
  union all
  -- 6. Triggers still bound to the shared functions (expect 24 in every state).
  select 6, 'fact triggers bound', count(*)::text
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and not t.tgisinternal
     and c.relname in ('encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies')
     and t.tgfoid in (select p.oid from pg_proc p join pg_namespace pn on pn.oid = p.pronamespace
                       where pn.nspname = 'private' and p.proname like 'clinical\_fact\_%')
  union all
  -- 7. Whether corrections have been made in production (counts only). The
  --    column may not exist, so it is read dynamically (query_to_xml).
  select 7, 'observations user_corrected / with reason',
         (select count(*) from public.observations where origin = 'user_corrected')::text || ' / ' ||
         case when exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = 'observations' and column_name = 'correction_reason')
              then (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.observations where correction_reason is not null', false, true, '')))[1]::text
              else '(no column)' end
  union all
  -- 8. Audit trail of corrections (counts, first time) — when the feature was first used.
  select 8, 'audit fact.user_corrected count / first at',
         count(*)::text || ' / ' || coalesce(min(created_at)::text, '-')
    from public.audit_logs where action = 'fact.user_corrected'
) s
order by n, "check";
