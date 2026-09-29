/**
 * Production document service against a fake Supabase client (no network):
 * reserve → upload → confirm order, validation before any network call,
 * clean-up + safe errors on failure, signed URLs only.
 */
import { readLocalFile } from '../services/documents/fileAccess';
import { SIGNED_URL_TTL_SECONDS, supabaseDocumentsService as service } from '../services/documents/supabaseDocumentsService';
import { ServiceError } from '../services/serviceError';
import { getSupabaseClient } from '../services/supabaseClient';
import { createFakeSupabase, documentRow, pdfBytes, TEST_USER_ID, type FakeSupabase } from '../test-support/fakeSupabase';
import type { UploadStage } from '../types';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));
jest.mock('../services/documents/fileAccess', () => ({ readLocalFile: jest.fn() }));

const PDF = { uri: 'file:///cache/blood-test.pdf', name: 'blood-test.pdf', mimeType: 'application/pdf', size: 2048 };
let supabase: FakeSupabase;

beforeEach(() => {
  // ServiceError logs causes in dev builds; keep test output clean.
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  supabase = createFakeSupabase();
  (getSupabaseClient as jest.Mock).mockReturnValue(supabase);
  (readLocalFile as jest.Mock).mockResolvedValue(pdfBytes());
});

async function expectServiceError(promise: Promise<unknown>, code: string): Promise<ServiceError> {
  const error = await promise.then(
    () => {
      throw new Error('expected a ServiceError');
    },
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(ServiceError);
  expect((error as ServiceError).code).toBe(code);
  return error as ServiceError;
}

describe('uploadDocument', () => {
  it('reserves a row, uploads to the DB-assigned private path, then confirms — no processing summary yet', async () => {
    const pending = documentRow();
    supabase.respond('insert', { data: pending, error: null });
    supabase.respond('update', { data: { ...pending, status: 'uploaded', uploaded_at: '2026-09-29T10:00:05Z' }, error: null });
    const stages: UploadStage[] = [];

    const result = await service.uploadDocument(PDF, (s) => stages.push(s));

    expect(stages).toEqual(['validating', 'uploading', 'saving']);
    expect(supabase.calls.map((c) => `${c.table}.${c.op}`)).toEqual(['documents.insert', 'documents.update']);
    expect(supabase.calls[0].payload).toEqual({
      source: 'upload',
      original_filename: 'blood-test.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 2048,
    });
    expect(supabase.storageBucket.upload).toHaveBeenCalledWith(pending.storage_path, expect.any(ArrayBuffer), {
      contentType: 'application/pdf',
      upsert: false,
    });
    expect(result.document).toMatchObject({ status: 'uploaded', userId: TEST_USER_ID });
    expect(result.processing).toBeUndefined();
  });

  it('rejects invalid files before any network call', async () => {
    await expectServiceError(service.uploadDocument({ ...PDF, name: 'photo.jpg', mimeType: 'image/jpeg' }), 'invalid_file');
    (readLocalFile as jest.Mock).mockResolvedValue(new TextEncoder().encode('not a pdf').buffer);
    await expectServiceError(service.uploadDocument(PDF), 'invalid_file');
    await expectServiceError(service.uploadDocument({ ...PDF, size: 20 * 1024 * 1024 + 1 }), 'invalid_file');
    expect(supabase.calls).toHaveLength(0);
    expect(supabase.storageBucket.upload).not.toHaveBeenCalled();
  });

  it('reports an unreadable file clearly', async () => {
    (readLocalFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
    const error = await expectServiceError(service.uploadDocument(PDF), 'invalid_file');
    expect(error.userMessage).toMatch(/couldn’t open that file/);
  });

  it('requires a signed-in user (expired session)', async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(createFakeSupabase({ userId: null }));
    await expectServiceError(service.uploadDocument(PDF), 'not_signed_in');
  });

  it('reports a missing backend configuration', async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);
    await expectServiceError(service.uploadDocument(PDF), 'not_configured');
  });

  it('never uploads outside the user’s own folder', async () => {
    supabase.respond('insert', { data: documentRow({ storage_path: 'someone-else/documents/x/original.pdf' }), error: null });
    await expectServiceError(service.uploadDocument(PDF), 'unknown');
    expect(supabase.storageBucket.upload).not.toHaveBeenCalled();
  });

  it('cleans up and returns a safe, retryable error when the upload fails', async () => {
    const pending = documentRow();
    supabase.respond('insert', { data: pending, error: null });
    supabase.storageBucket.upload.mockResolvedValueOnce({ data: null, error: { message: 'row-level security policy (internal)', statusCode: '500' } });

    const error = await expectServiceError(service.uploadDocument(PDF), 'upload_failed');
    expect(error.retryable).toBe(true);
    expect(error.userMessage).not.toMatch(/row-level|policy|internal/i);
    expect(supabase.storageBucket.remove).toHaveBeenCalledWith([pending.storage_path]);
    expect(supabase.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('maps network failures to an offline message', async () => {
    supabase.respond('insert', { data: null, error: { message: 'Network request failed' } });
    const error = await expectServiceError(service.uploadDocument(PDF), 'network');
    expect(error.retryable).toBe(true);
  });

  it('maps an expired/unauthorised session to a sign-in message', async () => {
    supabase.respond('insert', { data: null, error: { message: 'JWT expired', status: 401 } });
    const error = await expectServiceError(service.uploadDocument(PDF), 'permission');
    expect(error.userMessage).toMatch(/sign in again/);
  });

  it('detects a confirmation that already succeeded', async () => {
    const pending = documentRow();
    supabase.respond('insert', { data: pending, error: null });
    supabase.respond('update', { data: null, error: { message: 'Network request failed' } });
    supabase.respond('select', { data: { ...pending, status: 'uploaded', uploaded_at: '2026-09-29T10:00:05Z' }, error: null });
    expect((await service.uploadDocument(PDF)).document.status).toBe('uploaded');
  });
});

describe('reading', () => {
  it('lists only confirmed documents', async () => {
    supabase.respond('select', { data: [documentRow({ status: 'uploaded', uploaded_at: '2026-09-29T10:00:05Z' })], error: null });
    expect(await service.listDocuments()).toHaveLength(1);
    expect(supabase.calls[0].filters).toContainEqual(['neq', 'status', 'pending_upload']);
  });

  it('never queries for sample ids, and treats another user’s id as not found', async () => {
    expect(await service.getDocument('doc-2026-annual')).toBeNull();
    expect(supabase.calls).toHaveLength(0);
    supabase.respond('select', { data: null, error: null });
    expect(await service.getDocument('33333333-3333-4333-8333-333333333333')).toBeNull();
  });

  it('opens originals only through short-lived signed URLs', async () => {
    const doc = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: TEST_USER_ID,
      source: 'upload' as const,
      documentType: 'unclassified' as const,
      originalFilename: 'a.pdf',
      mimeType: 'application/pdf' as const,
      fileSizeBytes: 1,
      storagePath: `${TEST_USER_ID}/documents/22222222-2222-4222-8222-222222222222/original.pdf`,
      status: 'uploaded' as const,
      processingError: null,
      uploadedAt: '2026-09-29T10:00:05Z',
      createdAt: '2026-09-29T10:00:00Z',
      updatedAt: '2026-09-29T10:00:05Z',
    };
    await service.getOriginalDocumentUrl(doc);
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(60);
    expect(supabase.storageBucket.createSignedUrl).toHaveBeenCalledWith(doc.storagePath, SIGNED_URL_TTL_SECONDS);
    expect(supabase.storageBucket.getPublicUrl).not.toHaveBeenCalled();
    await expectServiceError(service.getOriginalDocumentUrl({ ...doc, status: 'pending_upload' }), 'not_found');
  });
});
