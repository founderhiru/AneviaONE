-- Family release · AFTER applying 20261101090000 and 20261102090000.
-- Read-only: one SELECT, safe on production. The last row ("ALL CHECKS") must be true.
with checks(n, check_name, value, expected, ok) as (
  select 1, 'subjects table', (to_regclass('public.subjects') is not null)::text, 'true', to_regclass('public.subjects') is not null
  union all select 2, 'subject_access table', (to_regclass('public.subject_access') is not null)::text, 'true', to_regclass('public.subject_access') is not null
  union all select 3, 'invite table (private)', (to_regclass('private.access_invites') is not null)::text, 'true', to_regclass('private.access_invites') is not null
  union all select 4, 'row security on for all three',
    (select count(*) from pg_class where oid in ('public.subjects'::regclass, 'public.subject_access'::regclass, 'private.access_invites'::regclass) and relrowsecurity)::text, '3',
    (select count(*) from pg_class where oid in ('public.subjects'::regclass, 'public.subject_access'::regclass, 'private.access_invites'::regclass) and relrowsecurity) = 3
  union all select 5, 'self records = profiles',
    (select count(*) from public.subjects where relationship = 'self')::text || ' of ' || (select count(*) from public.profiles)::text, 'equal',
    (select count(*) from public.subjects where relationship = 'self') = (select count(*) from public.profiles)
  union all select 6, 'relatives created yet', (select count(*) from public.subjects where relationship <> 'self')::text, '0 right after applying', null
  union all select 7, 'access grants / open invites yet', (select count(*) from public.subject_access)::text || ' / ' || (select count(*) from private.access_invites)::text, '0 / 0 right after applying', null
  union all select 8, 'existing rows without a person (accounts that have a profile)',
    ((select count(*) from public.documents d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.observations d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.conditions d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.medications d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.encounters d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.procedures d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.allergies d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.extraction_runs d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.document_pages d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.fact_sources d join public.profiles p on p.id = d.user_id where d.subject_id is null))::text, '0',
    ((select count(*) from public.documents d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.observations d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.conditions d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.medications d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.encounters d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.procedures d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.allergies d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.extraction_runs d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.document_pages d join public.profiles p on p.id = d.user_id where d.subject_id is null)
   + (select count(*) from public.fact_sources d join public.profiles p on p.id = d.user_id where d.subject_id is null)) = 0
  union all select 9, 'granted-read policies', (select count(*) from pg_policies where schemaname = 'public' and policyname like '%\_select\_granted')::text, '10',
    (select count(*) from pg_policies where schemaname = 'public' and policyname like '%\_select\_granted') = 10
  union all select 10, 'auto-fill triggers on the ten tables', (select count(*) from pg_trigger where tgname = 'zz_fill_subject_id' and not tgisinternal)::text, '10',
    (select count(*) from pg_trigger where tgname = 'zz_fill_subject_id' and not tgisinternal) = 10
  union all select 11, 'current_* views expose subject_id', (select count(*) from information_schema.columns where table_schema = 'public' and table_name like 'current\_%' and column_name = 'subject_id')::text, '6',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name like 'current\_%' and column_name = 'subject_id') = 6
  union all select 12, 'current_* views still follow row security (security_invoker)', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('current_observations','current_conditions','current_medications','current_encounters','current_procedures','current_allergies') and 'security_invoker=true' = any (c.reloptions))::text, '6',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('current_observations','current_conditions','current_medications','current_encounters','current_procedures','current_allergies') and 'security_invoker=true' = any (c.reloptions)) = 6
  union all select 13, 'signed-out callers cannot run any family function',
    (select count(*) from unnest(array[
      'public.can_access_subject(uuid,text)','public.create_relative(text,text,date,boolean)','public.create_access_invite(uuid,public.subject_role)',
      'public.redeem_access_invite(text)','public.approve_access(uuid,timestamptz)','public.revoke_access(uuid)','public.list_subject_access(uuid)']) f
      where has_function_privilege('anon', f, 'execute'))::text, '0',
    (select count(*) from unnest(array[
      'public.can_access_subject(uuid,text)','public.create_relative(text,text,date,boolean)','public.create_access_invite(uuid,public.subject_role)',
      'public.redeem_access_invite(text)','public.approve_access(uuid,timestamptz)','public.revoke_access(uuid)','public.list_subject_access(uuid)']) f
      where has_function_privilege('anon', f, 'execute')) = 0
  union all select 14, 'signed-in callers can run the six app functions',
    (select count(*) from unnest(array[
      'public.create_relative(text,text,date,boolean)','public.create_access_invite(uuid,public.subject_role)',
      'public.redeem_access_invite(text)','public.approve_access(uuid,timestamptz)','public.revoke_access(uuid)','public.list_subject_access(uuid)']) f
      where has_function_privilege('authenticated', f, 'execute'))::text, '6',
    (select count(*) from unnest(array[
      'public.create_relative(text,text,date,boolean)','public.create_access_invite(uuid,public.subject_role)',
      'public.redeem_access_invite(text)','public.approve_access(uuid,timestamptz)','public.revoke_access(uuid)','public.list_subject_access(uuid)']) f
      where has_function_privilege('authenticated', f, 'execute')) = 6
  union all select 15, 'the app cannot write people or grants directly',
    (has_table_privilege('authenticated', 'public.subjects', 'insert,update,delete') or has_table_privilege('authenticated', 'public.subject_access', 'insert,update,delete'))::text, 'false',
    not (has_table_privilege('authenticated', 'public.subjects', 'insert,update,delete') or has_table_privilege('authenticated', 'public.subject_access', 'insert,update,delete'))
  union all select 16, 'the app cannot read invite codes', (has_table_privilege('authenticated', 'private.access_invites', 'select') or has_table_privilege('anon', 'private.access_invites', 'select'))::text, 'false',
    not (has_table_privilege('authenticated', 'private.access_invites', 'select') or has_table_privilege('anon', 'private.access_invites', 'select'))
)
select n, check_name, value, expected, ok from checks
union all select 99, 'ALL CHECKS', null, 'true', (select bool_and(coalesce(ok, true)) from checks)
order by n;
