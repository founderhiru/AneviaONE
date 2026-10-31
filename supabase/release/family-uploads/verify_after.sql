-- Family uploads release · AFTER applying 20261103090000. Read-only. The last row ("ALL CHECKS") must be true.
with checks(n, check_name, value, expected, ok) as (
  select 1, 'engine_document_identity exists', (to_regprocedure('public.engine_document_identity(uuid,uuid)') is not null)::text, 'true', to_regprocedure('public.engine_document_identity(uuid,uuid)') is not null
  union all select 2, 'signed-in and signed-out callers cannot run it',
    (has_function_privilege('authenticated', 'public.engine_document_identity(uuid,uuid)', 'execute') or has_function_privilege('anon', 'public.engine_document_identity(uuid,uuid)', 'execute'))::text, 'false',
    not (has_function_privilege('authenticated', 'public.engine_document_identity(uuid,uuid)', 'execute') or has_function_privilege('anon', 'public.engine_document_identity(uuid,uuid)', 'execute'))
  union all select 3, 'the server can run it', has_function_privilege('service_role', 'public.engine_document_identity(uuid,uuid)', 'execute')::text, 'true', has_function_privilege('service_role', 'public.engine_document_identity(uuid,uuid)', 'execute')
  union all select 4, 'approved readers can open originals (storage rule)',
    exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'medical_documents_select_granted' and cmd = 'SELECT')::text, 'true',
    exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'medical_documents_select_granted' and cmd = 'SELECT')
  union all select 5, 'no storage rule allows writing for readers',
    (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like '%granted%' and cmd <> 'SELECT')::text, '0',
    (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like '%granted%' and cmd <> 'SELECT') = 0
  union all select 6, 'the app may name the person on a new report',
    has_column_privilege('authenticated', 'public.documents', 'subject_id', 'insert')::text, 'true', has_column_privilege('authenticated', 'public.documents', 'subject_id', 'insert')
  union all select 7, 'but cannot change it afterwards',
    has_column_privilege('authenticated', 'public.documents', 'subject_id', 'update')::text, 'false', not has_column_privilege('authenticated', 'public.documents', 'subject_id', 'update')
  union all select 8, 'the auto-fill checks who may add a report',
    (pg_get_functiondef('private.fill_subject_id()'::regprocedure) like '%can_access_subject(new.subject_id, ''manage'')%')::text, 'true',
    pg_get_functiondef('private.fill_subject_id()'::regprocedure) like '%can_access_subject(new.subject_id, ''manage'')%'
  union all select 9, 'auto-fill triggers still on the ten tables', (select count(*) from pg_trigger where tgname = 'zz_fill_subject_id' and not tgisinternal)::text, '10',
    (select count(*) from pg_trigger where tgname = 'zz_fill_subject_id' and not tgisinternal) = 10
  union all select 10, 'reports without a person (accounts that have a profile)',
    (select count(*) from public.documents d join public.profiles p on p.id = d.user_id where d.subject_id is null)::text, '0',
    (select count(*) from public.documents d join public.profiles p on p.id = d.user_id where d.subject_id is null) = 0
)
select n, check_name, value, expected, ok from checks
union all select 99, 'ALL CHECKS', null, 'true', (select bool_and(coalesce(ok, true)) from checks)
order by n;
