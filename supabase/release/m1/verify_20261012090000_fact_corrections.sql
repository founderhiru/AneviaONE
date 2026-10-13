-- Post-deployment verification for 20261012090000_fact_corrections.sql (read-only; safe on production).
select 'correction_reason column on all 6 fact tables' as check_name,
       (select count(*) from information_schema.columns where table_schema='public' and column_name='correction_reason'
          and table_name in ('encounters','observations','conditions','medications','procedures','allergies')) = 6 as ok
union all select 'reason-only-on-corrections constraint on all 6',
       (select count(*) from pg_constraint where conname like '%\_reason\_only\_on\_corrections') = 6
union all select 'correct_fact exists, SECURITY DEFINER, search_path pinned',
       exists (select 1 from pg_proc p where p.oid = 'public.correct_fact(text,uuid,jsonb,text)'::regprocedure and p.prosecdef and p.proconfig @> array['search_path=""'])
union all select 'authenticated may execute correct_fact',
       has_function_privilege('authenticated', 'public.correct_fact(text,uuid,jsonb,text)', 'execute')
union all select 'anon may NOT execute correct_fact',
       not has_function_privilege('anon', 'public.correct_fact(text,uuid,jsonb,text)', 'execute')
union all select 'helper functions present (4)',
       (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
          and p.proname in ('fact_plain_number','fact_reference_bounds','report_identity_unconfirmed','fact_identity_held')) = 4
union all select 'insert trigger: correction path + identity safeguard',
       (select prosrc like '%hi.fact_correction%' and prosrc like '%fact_identity_held%' from pg_proc where oid='private.clinical_fact_before_insert()'::regprocedure)
union all select 'update trigger: identity safeguard',
       (select prosrc like '%fact_identity_held%' from pg_proc where oid='private.clinical_fact_before_update()'::regprocedure)
union all select 'after-insert trigger: no double supersede',
       (select prosrc like '%superseded_at is null%' from pg_proc where oid='private.clinical_fact_after_insert()'::regprocedure)
union all select 'fact triggers still bound (18 = 6 tables x 3)',
       (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
         where c.relname in ('encounters','observations','conditions','medications','procedures','allergies')
           and t.tgname ~ '_(before_insert|before_update|after_insert)$') = 18
union all select 'row level security still enabled on fact tables',
       (select bool_and(relrowsecurity) from pg_class where relname in ('encounters','observations','conditions','medications','procedures','allergies') and relkind='r')
union all select 'unique live-fingerprint index intact (6)',
       (select count(*) from pg_indexes where indexname like '%\_fingerprint\_live\_idx') = 6
union all select 'no correction rows yet / no reasons set (fresh deploy)',
       (select count(*) from public.observations where origin='user_corrected' or correction_reason is not null) = 0;
