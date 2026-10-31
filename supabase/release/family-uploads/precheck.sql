-- Family uploads release · BEFORE applying 20261103090000. Read-only: one SELECT, safe on production.
-- Every row with an "ok" must be true.
select * from (
  select 1 as n, 'family release (20261101 + 20261102) is in production: subjects table' as check_name,
         (to_regclass('public.subjects') is not null)::text as value, 'true' as expected, to_regclass('public.subjects') is not null as ok
  union all select 2, 'family access functions present: redeem_access_invite',
         (to_regprocedure('public.redeem_access_invite(text)') is not null)::text, 'true', to_regprocedure('public.redeem_access_invite(text)') is not null
  union all select 3, 'new function NOT yet present: engine_document_identity',
         (to_regprocedure('public.engine_document_identity(uuid,uuid)') is not null)::text, 'false', to_regprocedure('public.engine_document_identity(uuid,uuid)') is null
  union all select 4, 'new storage rule NOT yet present',
         exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'medical_documents_select_granted')::text, 'false',
         not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'medical_documents_select_granted')
  union all select 5, 'no relatives or grants yet (information)',
         (select count(*) from public.subjects where relationship <> 'self')::text || ' / ' || (select count(*) from public.subject_access)::text, 'information', null
  union all select 6, 'reports (information)', (select count(*) from public.documents)::text, 'information', null
  union all select 7, 'open transactions older than 1 minute',
         (select count(*) from pg_stat_activity where xact_start < now() - interval '1 minute' and state <> 'idle' and pid <> pg_backend_pid())::text, '0',
         (select count(*) from pg_stat_activity where xact_start < now() - interval '1 minute' and state <> 'idle' and pid <> pg_backend_pid()) = 0
) t order by n;
