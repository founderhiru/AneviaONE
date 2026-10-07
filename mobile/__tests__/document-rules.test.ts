/**
 * Pure document rules: validation, storage paths, lifecycle presentation.
 * These mirror limits the database and private bucket enforce again.
 */
import { DOCUMENT_STATUS_PRESENTATION, formatFileSize, hasStoredOriginal, isListedStatus } from '../services/documents/documentStatus';
import {
  hasPdfSignature,
  MAX_DOCUMENT_BYTES,
  sanitizeFilename,
  validateDocumentBytes,
  validatePickedFile,
} from '../services/documents/documentValidation';
import { documentStoragePath, DOCUMENTS_BUCKET, isExpectedStoragePath, isStoredDocumentId } from '../services/documents/storagePaths';
import type { DocumentStatus } from '../types';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('validatePickedFile', () => {
  it('accepts PDFs, including a .pdf reported with a generic MIME type', () => {
    expect(validatePickedFile({ name: 'report.pdf', mimeType: 'application/pdf', size: 1000 }).ok).toBe(true);
    expect(validatePickedFile({ name: 'Report.PDF', mimeType: 'application/octet-stream', size: 1000 }).ok).toBe(true);
  });

  it.each([
    ['image/jpeg', 'photo.jpg'],
    ['text/plain', 'notes.txt'],
    ['application/octet-stream', 'program.exe'],
  ])('rejects %s (%s)', (mimeType, name) => {
    expect(validatePickedFile({ name, mimeType, size: 1000 })).toMatchObject({ ok: false, code: 'unsupported_type' });
  });

  it('rejects empty and oversized files (20 MB limit, matching the bucket)', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(20971520);
    expect(validatePickedFile({ name: 'a.pdf', mimeType: 'application/pdf', size: 0 })).toMatchObject({ code: 'empty' });
    expect(validatePickedFile({ name: 'a.pdf', mimeType: 'application/pdf', size: MAX_DOCUMENT_BYTES + 1 })).toMatchObject({ code: 'too_large' });
  });
});

describe('validateDocumentBytes', () => {
  it('accepts real PDF content and rejects renamed files', () => {
    expect(validateDocumentBytes(bytes('%PDF-1.4\n')).ok).toBe(true);
    expect(validateDocumentBytes(bytes('\u0089PNG\r\n'))).toMatchObject({ code: 'not_a_pdf' });
    expect(validateDocumentBytes(new Uint8Array(0))).toMatchObject({ code: 'empty' });
  });

  it('finds the header within the first 1024 bytes only', () => {
    expect(hasPdfSignature(bytes(`${' '.repeat(500)}%PDF-1.7`))).toBe(true);
    expect(hasPdfSignature(bytes(`${' '.repeat(2000)}%PDF-1.7`))).toBe(false);
  });

  it('keeps filenames display-safe', () => {
    expect(sanitizeFilename('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(sanitizeFilename('')).toBe('document.pdf');
  });
});

describe('storage paths', () => {
  const user = '11111111-1111-4111-8111-111111111111';
  const doc = '22222222-2222-4222-8222-222222222222';

  it('matches the private database layout', () => {
    expect(DOCUMENTS_BUCKET).toBe('medical-documents');
    expect(documentStoragePath(user, doc, 'application/pdf')).toBe(`${user}/documents/${doc}/original.pdf`);
    expect(isExpectedStoragePath(`other/documents/${doc}/original.pdf`, user, doc, 'application/pdf')).toBe(false);
  });

  it('distinguishes real (UUID) document ids from sample ids', () => {
    expect(isStoredDocumentId(doc)).toBe(true);
    expect(isStoredDocumentId('doc-2026-annual')).toBe(false);
  });
});

describe('document status', () => {
  const all: DocumentStatus[] = ['pending_upload', 'uploaded', 'processing', 'extracted', 'validated', 'completed', 'failed'];

  it('never claims an uploaded report was read', () => {
    expect(DOCUMENT_STATUS_PRESENTATION.uploaded.description).toMatch(/nothing from this file has been added to your Health Memory yet/i);
    for (const s of all) expect(DOCUMENT_STATUS_PRESENTATION[s].label).toBeTruthy();
  });

  it('hides abandoned uploads', () => {
    expect(all.filter((s) => !isListedStatus(s))).toEqual(['pending_upload']);
    expect(all.filter((s) => !hasStoredOriginal(s))).toEqual(['pending_upload']);
    expect(formatFileSize(2048)).toBe('2 KB');
  });
});
