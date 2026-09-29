-- =============================================================================
-- Phase 1 · Migration 3 — private Storage for original medical documents
--
-- Bucket `medical-documents`:
--   * PRIVATE (no public URLs, ever). Files are read through short-lived
--     signed URLs created for the signed-in owner.
--   * PDF only, max 20 MB — enforced by Storage itself, not just the app.
--   * Layout: <user_id>/documents/<document_id>/original.pdf
--
-- Access rules on storage.objects:
--   * SELECT  — only objects in your own <user_id>/ folder.
--   * INSERT  — only into your own folder, only at the exact path of one of
--               YOUR documents rows that is still `pending_upload`.
--   * UPDATE  — none. Originals can never be overwritten (immutable evidence).
--   * DELETE  — only leftovers from an abandoned upload; never a file whose
--               document has been confirmed.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medical-documents', 'medical-documents', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "medical_documents_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'medical-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "medical_documents_insert_own_pending"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'medical-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
        from public.documents d
       where d.storage_path = objects.name
         and d.user_id      = (select auth.uid())
         and d.status       = 'pending_upload'
    )
  );

create policy "medical_documents_delete_own_abandoned"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'medical-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1
        from public.documents d
       where d.storage_path = objects.name
         and d.status      <> 'pending_upload'
    )
  );

-- Intentionally NO update policy on this bucket.
