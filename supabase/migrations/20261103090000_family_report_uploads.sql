-- =============================================================================
-- Family · reports for a relative you manage (backend).
--
--   1. The app may name WHICH PERSON a new report is for (documents.subject_id),
--      but only a person it owns: itself, or a relative it created. Caregivers
--      with a grant can read, not upload (a revoked caregiver must not keep a
--      copy of the original in their own folder).
--   2. Every fact, page, run and source follows its REPORT's person, not the
--      uploader's own record.
--   3. Approved readers can open the original file (signed URL) of reports
--      they can read. Writing and deleting files stays owner-only.
--   4. The report-person check compares a report with the person it is FOR.
--      A relative stored under a nickname ("Dad") has no full name to compare:
--      only an exact date of birth can then confirm the report; otherwise it
--      is held for review. Nothing is rejected on a nickname.
-- No existing row changes.
-- =============================================================================

-- 1 + 2 -----------------------------------------------------------------------
grant insert (subject_id) on public.documents to authenticated;

create or replace function private.fill_subject_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc uuid;
begin
  if new.subject_id is not null then
    -- Only the app is checked; the engine (service role, no signed-in user) is trusted.
    if tg_table_name = 'documents' and auth.uid() is not null
       and not public.can_access_subject(new.subject_id, 'manage') then
      raise exception 'documents: you can only add reports for yourself or a relative you manage' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_table_name <> 'documents' then
    v_doc := nullif(to_jsonb(new) ->> 'document_id', '')::uuid;
    if v_doc is not null then
      select d.subject_id into new.subject_id from public.documents d where d.id = v_doc;
    end if;
  end if;

  if new.subject_id is null and new.user_id is not null then
    select s.id into new.subject_id from public.subjects s where s.linked_user_id = new.user_id;
  end if;
  return new;
end;
$$;

-- 3 ---------------------------------------------------------------------------
create policy "medical_documents_select_granted"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'medical-documents'
    and exists (
      select 1 from public.documents d
       where d.storage_path = objects.name
         and public.can_access_subject(d.subject_id, 'read')
    )
  );

-- 4 ---------------------------------------------------------------------------
create or replace function public.engine_document_identity(p_document_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject public.subjects%rowtype;
begin
  perform private.require_service_role();
  select s.* into v_subject
    from public.documents d join public.subjects s on s.id = d.subject_id
   where d.id = p_document_id and d.user_id = p_user_id;

  if not found or v_subject.linked_user_id is not null then
    -- A report for the account holder: the identity they entered (unchanged).
    return public.engine_account_identity(p_user_id);
  end if;

  return jsonb_build_object(
    -- Two or more words, or nothing: a nickname proves nothing.
    'full_name', case when array_length(regexp_split_to_array(btrim(v_subject.display_name), '\s+'), 1) >= 2
                      then v_subject.display_name end,
    'date_of_birth', v_subject.date_of_birth
  );
end;
$$;

revoke all on function public.engine_document_identity(uuid, uuid) from public, anon, authenticated;
grant execute on function public.engine_document_identity(uuid, uuid) to service_role;

revoke all on all functions in schema private from public, anon, authenticated;
