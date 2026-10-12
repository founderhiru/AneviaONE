-- Post-deployment verification for 20261013090000_corrections_survive_report_deletion.sql (read-only).
select 'engine_delete_document keeps supported corrections' as check_name,
       (select prosrc like '%engine_keep_correction%' from pg_proc where oid = 'public.engine_delete_document(uuid,uuid)'::regprocedure) as ok
union all select 'still SECURITY DEFINER with pinned search_path',
       (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.engine_delete_document(uuid,uuid)'::regprocedure)
union all select 'service_role may execute',
       has_function_privilege('service_role', 'public.engine_delete_document(uuid,uuid)', 'execute')
union all select 'authenticated may NOT execute',
       not has_function_privilege('authenticated', 'public.engine_delete_document(uuid,uuid)', 'execute')
union all select 'anon may NOT execute',
       not has_function_privilege('anon', 'public.engine_delete_document(uuid,uuid)', 'execute')
union all select 'still requires the service role inside',
       (select prosrc like '%require_service_role%' from pg_proc where oid = 'public.engine_delete_document(uuid,uuid)'::regprocedure);
