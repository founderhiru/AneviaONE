-- Read-only pre-deployment check for the M1 migrations. Safe to run on production
-- (Supabase SQL Editor). Only SELECTs and catalog reads, inside a read-only
-- transaction; nothing is created, changed or locked beyond ordinary reads.
begin transaction read only;

-- 1. Migration history: the last applied version must be 20261011090000, and
--    neither M1 migration may be listed.
select 'last applied migrations' as check, string_agg(version || ' ' || coalesce(name, ''), ', ' order by version desc) as result
from (select version, name from supabase_migrations.schema_migrations order by version desc limit 5) m;

select 'M1 migrations already applied' as check,
       coalesce(string_agg(version, ', '), 'none') as result
from supabase_migrations.schema_migrations
where version in ('20261012090000', '20261013090000');

select 'required predecessor 20261011090000 applied' as check,
       exists (select 1 from supabase_migrations.schema_migrations where version = '20261011090000')::text as result;

-- 2. Schema state M1 expects to change: none of its objects may exist yet.
select 'correction_reason columns present (expect 0)' as check, count(*)::text as result
from information_schema.columns
where table_schema = 'public' and column_name = 'correction_reason'
  and table_name in ('encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies');

select 'correct_fact present (expect false)' as check,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'correct_fact')::text as result;

select 'M1 private helpers present (expect 0)' as check, count(*)::text as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname in ('fact_identity_held', 'report_identity_unconfirmed', 'fact_plain_number', 'fact_reference_bounds');

-- 3. Objects M1/M2 replace must exist with the expected signatures.
select 'trigger functions to replace present (expect 3)' as check, count(*)::text as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private' and p.proname in ('clinical_fact_before_insert', 'clinical_fact_before_update', 'clinical_fact_after_insert');

select 'engine_delete_document(uuid, uuid) present' as check,
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'engine_delete_document'
                 and pg_get_function_identity_arguments(p.oid) = 'p_document_id uuid, p_user_id uuid')::text as result;

select 'fact triggers bound (expect 24)' as check, count(*)::text as result
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
  and c.relname in ('encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies')
  and t.tgfoid in (select p.oid from pg_proc p join pg_namespace pn on pn.oid = p.pronamespace
                   where pn.nspname = 'private' and p.proname like 'clinical_fact_%');

-- 4. Data shape M1 relies on (no rows are read beyond counts).
select 'user_corrected rows already present' as check, count(*)::text as result
from public.observations where origin = 'user_corrected';

-- 5. Lock-duration inputs: size of each table M1 locks exclusively.
select 'size ' || c.relname as check,
       c.reltuples::bigint || ' rows (estimate), ' || pg_size_pretty(pg_total_relation_size(c.oid)) as result
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('encounters', 'observations', 'conditions', 'medications', 'procedures', 'allergies', 'documents')
order by c.relname;

-- 6. Anything that would block M1's exclusive locks right now.
select 'open transactions older than 1 minute' as check, count(*)::text as result
from pg_stat_activity
where xact_start < now() - interval '1 minute' and pid <> pg_backend_pid();

-- 7. Source-of-truth comparison: the deployed function bodies M1 replaces
--    (md5 of the definitions; compare with the values recorded in the review).
select 'md5 ' || p.proname as check, md5(pg_get_functiondef(p.oid)) as result
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'private' and p.proname in ('clinical_fact_before_insert', 'clinical_fact_before_update', 'clinical_fact_after_insert'))
   or (n.nspname = 'public' and p.proname = 'engine_delete_document')
order by p.proname;

rollback;
