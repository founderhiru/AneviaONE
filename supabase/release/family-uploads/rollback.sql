-- Family uploads release · ROLLBACK of 20261103090000. Run in the SQL Editor only with approval.
-- Refuses if any report has already been filed under a relative: that data would lose its meaning.
-- Afterwards run: npx supabase migration repair --status reverted 20261103090000
begin;
do $$
begin
  if exists (select 1 from public.documents d join public.subjects s on s.id = d.subject_id where s.linked_user_id is distinct from d.user_id) then
    raise exception 'rollback refused: reports already exist for a relative';
  end if;
end $$;

drop policy if exists "medical_documents_select_granted" on storage.objects;
drop function if exists public.engine_document_identity(uuid, uuid);
revoke insert (subject_id) on public.documents from authenticated;

-- The auto-fill as it was in 20261101090000.
create or replace function private.fill_subject_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subject_id is null and new.user_id is not null then
    select s.id into new.subject_id from public.subjects s where s.linked_user_id = new.user_id;
  end if;
  return new;
end;
$$;
revoke all on all functions in schema private from public, anon, authenticated;
commit;
