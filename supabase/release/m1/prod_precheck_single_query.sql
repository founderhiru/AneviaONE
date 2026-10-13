-- Read-only pre-deployment check for the M1 migrations, as ONE query so the
-- Supabase SQL Editor (which shows only the last statement's result) displays
-- every check. Same checks and values as prod_precheck.sql; a single SELECT
-- creates, changes and locks nothing beyond ordinary reads.
-- Expected values: docs/M1_PRODUCTION_MIGRATION_REVIEW.md §10.
select 01 as n, "check", result from (
select 'last applied migrations' as check, string_agg(version || ' ' || coalesce(name, ''), ', ' order by version desc) as result
from (select version, name from supabase_migrations.schema_migrations order by version desc limit 5) m
) s1
union all
select 02 as n, "check", result from (
select 'M1 migrations already applied' as check,
       coalesce(string_agg(version, ', '), 'none') as result
from supabase_migrations.schema_migrations
where version in ('20261012090000', '20261013090000')
) s2
union all
select 03 as n, "check", result from (
select 'required predecessor 20261011090000 applied' as check,
       exists (select 1 from supabase_migrations.schema_migrations where version = '20261011090000')::text as result
) s3
union all
select 04 as n, "check", result from (
select 'correction_reason columns present (expect 0)' as check, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and column_name = 'correction_reason'
  and table_name in ('encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies')
) s4
union all
select 05 as n, "check", result from (
select 'correct_fact present (expect false)' as check,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'correct_fact')::text as result
) s5
union all
select 06 as n, "check", result from (
select 'M1 private helpers present (expect 0)' as check, count(*)::text as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname in ('fact_identity_held', 'report_identity_unconfirmed', 'fact_plain_number', 'fact_reference_bounds')
) s6
union all
select 07 as n, "check", result from (
select 'trigger functions to replace present (expect 3)' as check, count(*)::text as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname in ('clinical_fact_before_insert', 'clinical_fact_before_update', 'clinical_fact_after_insert')
) s7
union all
select 08 as n, "check", result from (
select 'engine_delete_document(uuid, uuid) present' as check,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'engine_delete_document'
                 and pg_get_function_identity_arguments(p.oid) = 'p_document_id uuid, p_user_id uuid')::text as result
) s8
union all
select 09 as n, "check", result from (
select 'fact triggers bound (expect 24)' as check, count(*)::text as result
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
  and c.relname in ('encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies')
  and t.tgfoid in (select p.oid from pg_proc p join pg_namespace pn on pn.oid = p.pronamespace
                   where pn.nspname = 'private' and p.proname like 'clinical_fact_%')
) s9
union all
select 10 as n, "check", result from (
select 'user_corrected rows already present' as check, count(*)::text as result
from public.observations where origin = 'user_corrected'
) s10
union all
select 11 as n, "check", result from (
select 'size ' || c.relname as check,
       c.reltuples::bigint || ' rows (estimate), ' || pg_size_pretty(pg_total_relation_size(c.oid)) as result
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies', 'documents')
order by c.relname
) s11
union all
select 12 as n, "check", result from (
select 'open transactions older than 1 minute' as check, count(*)::text as result
from pg_stat_activity
where xact_start < now() - interval '1 minute' and pid <> pg_backend_pid()
) s12
union all
select 13 as n, "check", result from (
select 'md5 ' || p.proname as check, md5(pg_get_functiondef(p.oid)) as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'private' and p.proname in ('clinical_fact_before_insert', 'clinical_fact_before_update', 'clinical_fact_after_insert'))
   or (n.nspname = 'public' and p.proname = 'engine_delete_document')
order by p.proname
) s13
order by n, "check";
