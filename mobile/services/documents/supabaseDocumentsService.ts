import type { SupabaseClient } from '@supabase/supabase-js';

import type { DocumentStatus, PickedFile, StoredDocument, StoredDocumentSource, StoredDocumentType } from '../../types';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import { isListedStatus, hasStoredOriginal } from './documentStatus';
import { sanitizeFilename, validateDocumentBytes, validatePickedFile } from './documentValidation';
import type { DocumentsService } from './documentsTypes';
import { readLocalFile } from './fileAccess';
import { DOCUMENTS_BUCKET, isExpectedStoragePath, isStoredDocumentId } from './storagePaths';

/**
 * Real document storage (production mode).
 *
 * Upload flow — each step is enforced by the database, not just this code:
 *   1. validate   name/MIME/size from the picker, then the real bytes (%PDF-)
 *   2. reserve    INSERT documents row → DB assigns id, owner, storage path,
 *                 status `pending_upload`
 *   3. upload     original → private bucket at exactly that path (Storage
 *                 RLS only allows it for your own pending document; no
 *                 overwrite is possible)
 *   4. confirm    UPDATE status → `uploaded` (DB checks the file exists and
 *                 records the size Storage actually holds)
 *
 * A failed step 3 removes the reservation; a row that is never confirmed is
 * hidden from lists and cleaned up later.
 */

export const SIGNED_URL_TTL_SECONDS = 60;
const STALE_PENDING_MS = 60 * 60 * 1000;
const CONFIRM_ATTEMPTS = 3;

type DocumentRow = {
  id: string;
  user_id: string;
  source: StoredDocumentSource;
  document_type: StoredDocumentType;
  original_filename: string;
  mime_type: 'application/pdf';
  file_size_bytes: number;
  storage_path: string;
  status: DocumentStatus;
  processing_error: string | null;
  failure_kind?: string | null;
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
};

const DOCUMENT_COLUMNS =
  'id, user_id, source, document_type, original_filename, mime_type, file_size_bytes, storage_path, status, processing_error, failure_kind, uploaded_at, created_at, updated_at';

export function rowToStoredDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    documentType: row.document_type,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    storagePath: row.storage_path,
    status: row.status,
    processingError: row.processing_error,
    failureKind: row.failure_kind ?? null,
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new ServiceError('not_configured', 'Document storage isn’t available right now.');
  return client;
}

async function requireUserId(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new ServiceError('not_signed_in', 'Please sign in again to continue.');
  return userId;
}

function isAlreadyStored(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  return String(error.statusCode) === '409' || /already exists|duplicate/i.test(error.message ?? '');
}

/** Best effort: remove a reservation whose upload never completed. */
async function abandonUpload(client: SupabaseClient, row: Pick<DocumentRow, 'id' | 'storage_path'>): Promise<void> {
  await client.storage.from(DOCUMENTS_BUCKET).remove([row.storage_path]).catch(() => undefined);
  await Promise.resolve(client.from('documents').delete().eq('id', row.id).eq('status', 'pending_upload')).catch(
    () => undefined
  );
}

async function cleanupStalePendingUploads(client: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const { data } = await client
    .from('documents')
    .select('id, storage_path')
    .eq('status', 'pending_upload')
    .lt('created_at', cutoff)
    .limit(20);
  for (const row of data ?? []) await abandonUpload(client, row);
}

type RunCounts = { document_id: string; facts_written: number | null; facts_needs_review: number | null; facts_duplicate: number | null; completed_at: string | null };

/**
 * Adds how many results each completed report contributes to Health Memory,
 * from its latest successful read (RLS: the person's own runs only). On any
 * error the count stays unknown — the screens then make no claim either way.
 */
async function withHealthInfo(client: SupabaseClient, documents: StoredDocument[]): Promise<StoredDocument[]> {
  const ids = documents.filter((d) => d.status === 'completed').map((d) => d.id);
  if (ids.length === 0) return documents;
  const { data, error } = await client
    .from('extraction_runs')
    .select('document_id, facts_written, facts_needs_review, facts_duplicate, completed_at')
    .eq('status', 'succeeded')
    .in('document_id', ids)
    .order('completed_at', { ascending: false });
  if (error || !data) return documents;
  const latest = new Map<string, RunCounts>();
  for (const run of data as RunCounts[]) if (!latest.has(run.document_id)) latest.set(run.document_id, run);
  return documents.map((d) => {
    const run = latest.get(d.id);
    if (!run) return d;
    const trusted = (run.facts_written ?? 0) - (run.facts_needs_review ?? 0) + (run.facts_duplicate ?? 0);
    return { ...d, healthInfoCount: Math.max(0, trusted) };
  });
}

export const supabaseDocumentsService: DocumentsService = {
  async listDocuments() {
    const client = requireClient();
    await requireUserId(client);
    const { data, error } = await client
      .from('documents')
      .select(DOCUMENT_COLUMNS)
      .neq('status', 'pending_upload')
      .order('created_at', { ascending: false });
    if (error) {
      throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t load your documents. Please try again.', retryable: true });
    }
    cleanupStalePendingUploads(client).catch(() => undefined);
    return withHealthInfo(client, (data as DocumentRow[]).map(rowToStoredDocument).filter((d) => isListedStatus(d.status)));
  },

  async getDocument(id) {
    if (!isStoredDocumentId(id)) return null;
    const client = requireClient();
    await requireUserId(client);
    // RLS returns nothing for another user's id — indistinguishable from "not found".
    const { data, error } = await client.from('documents').select(DOCUMENT_COLUMNS).eq('id', id).maybeSingle();
    if (error) {
      throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t load this document. Please try again.', retryable: true });
    }
    if (!data) return null;
    const [document] = await withHealthInfo(client, [rowToStoredDocument(data as DocumentRow)]);
    return document;
  },

  async uploadDocument(file: PickedFile, onStage) {
    // 1. validate
    onStage?.('validating');
    const picked = validatePickedFile(file);
    if (!picked.ok) throw new ServiceError('invalid_file', picked.message);

    let buffer: ArrayBuffer;
    try {
      buffer = await readLocalFile(file.uri);
    } catch (cause) {
      throw new ServiceError('invalid_file', 'We couldn’t open that file. Please choose it again.', { cause });
    }
    const content = validateDocumentBytes(new Uint8Array(buffer));
    if (!content.ok) throw new ServiceError('invalid_file', content.message);

    const client = requireClient();
    const userId = await requireUserId(client);

    // 2. reserve — the database assigns id, owner and storage path.
    onStage?.('uploading');
    const { data: reserved, error: reserveError } = await client
      .from('documents')
      .insert({
        source: file.source ?? 'upload',
        original_filename: sanitizeFilename(file.name),
        mime_type: content.mimeType,
        file_size_bytes: buffer.byteLength,
      })
      .select(DOCUMENT_COLUMNS)
      .single();
    if (reserveError || !reserved) {
      throw toServiceError(reserveError, {
        code: 'save_failed',
        userMessage: 'We couldn’t start the upload. Please try again.',
        retryable: true,
      });
    }
    const row = reserved as DocumentRow;
    if (!isExpectedStoragePath(row.storage_path, userId, row.id, row.mime_type)) {
      await abandonUpload(client, row);
      throw new ServiceError('unknown', 'We couldn’t start the upload. Please try again.', {
        cause: new Error('Unexpected storage path from server'),
      });
    }

    // 3. upload the original — private bucket, never overwritten.
    const { error: uploadError } = await client.storage.from(DOCUMENTS_BUCKET).upload(row.storage_path, buffer, {
      contentType: content.mimeType,
      upsert: false,
    });
    if (uploadError && !isAlreadyStored(uploadError)) {
      await abandonUpload(client, row);
      throw toServiceError(uploadError, {
        code: 'upload_failed',
        userMessage: 'The upload didn’t finish. Please check your connection and try again.',
        retryable: true,
      });
    }

    // 4. confirm — the database verifies the file really exists.
    onStage?.('saving');
    let lastError: unknown = null;
    for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        // A previous attempt may have succeeded with the response lost.
        const { data: current } = await client.from('documents').select(DOCUMENT_COLUMNS).eq('id', row.id).maybeSingle();
        if (current && (current as DocumentRow).status !== 'pending_upload') {
          return { document: rowToStoredDocument(current as DocumentRow) };
        }
      }
      const { data: confirmed, error } = await client
        .from('documents')
        .update({ status: 'uploaded' })
        .eq('id', row.id)
        .select(DOCUMENT_COLUMNS)
        .single();
      if (!error && confirmed) return { document: rowToStoredDocument(confirmed as DocumentRow) };
      lastError = error;
    }
    throw toServiceError(lastError, {
      code: 'save_failed',
      userMessage: 'Your file was uploaded but we couldn’t finish saving it. Please try again.',
      retryable: true,
    });
  },

  async getOriginalDocumentUrl(document) {
    if (!hasStoredOriginal(document.status)) {
      throw new ServiceError('not_found', 'This upload didn’t finish, so there’s no original to show.');
    }
    const client = requireClient();
    await requireUserId(client);
    const { data, error } = await client.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(document.storagePath, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t open the original. Please try again.', retryable: true });
    }
    return data.signedUrl;
  },
};
