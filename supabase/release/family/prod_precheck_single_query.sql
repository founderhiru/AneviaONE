-- Family release · BEFORE applying 20261101090000 and 20261102090000.
-- Read-only: one SELECT, safe on production. Paste into the Supabase SQL Editor and run.
-- Every row in the "ok" column must be true before you apply anything.
with m as (
  select case when to_regclass('supabase_migrations.schema_migrations') is not null
    then (xpath('/row/v/text()', query_to_xml(
      'select string_agg(version, '', '' order by version desc) as v from (select version from supabase_migrations.schema_migrations order by version desc limit 4) s',
      false, true, '')))[1]::text
    else 'migration history table not found' end as last_applied
)
select * from (
  select 1 as n, 'last applied migrations (newest first)' as check, (select last_applied from m) as value, 'ends with 20261014090000 or later, before 20261101' as expected, null::boolean as ok
  union all select 2, 'account deletion migration present (20261014)', (to_regprocedure('private.account_deletion_started(uuid)') is not null)::text, 'true', to_regprocedure('private.account_deletion_started(uuid)') is not null
  union all select 3, 'corrections (M1) present: correct_fact exists', (to_regprocedure('public.correct_fact(text,uuid,jsonb,text)') is not null)::text, 'true', to_regprocedure('public.correct_fact(text,uuid,jsonb,text)') is not null
  union all select 4, 'family tables NOT yet present: subjects', (to_regclass('public.subjects') is not null)::text, 'false', to_regclass('public.subjects') is null
  union all select 5, 'family tables NOT yet present: subject_access', (to_regclass('public.subject_access') is not null)::text, 'false', to_regclass('public.subject_access') is null
  union all select 6, 'subject_id column NOT yet on documents', exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='subject_id')::text, 'false', not exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='subject_id')
  union all select 7, 'accounts', (select count(*) from auth.users)::text, 'information', null
  union all select 8, 'profiles (each gets a self record)', (select count(*) from public.profiles)::text, 'information', null
  union all select 9, 'accounts without a profile', (select count(*) from auth.users u left join public.profiles p on p.id = u.id where p.id is null)::text, '0', (select count(*) from auth.users u left join public.profiles p on p.id = u.id where p.id is null) = 0
  union all select 10, 'reports / results (information: sets how long the change holds locks)', (select count(*) from public.documents)::text || ' / ' || (select count(*) from public.observations)::text, 'information', null
  union all select 11, 'open transactions older than 1 minute', (select count(*) from pg_stat_activity where xact_start < now() - interval '1 minute' and state <> 'idle' and pid <> pg_backend_pid())::text, '0', (select count(*) from pg_stat_activity where xact_start < now() - interval '1 minute' and state <> 'idle' and pid <> pg_backend_pid()) = 0
) t order by n;
