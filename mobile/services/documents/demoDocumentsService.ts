import { mockChanges, mockDocuments } from '../../mock';
import type { ProcessingSummary, StoredDocument } from '../../types';
import { ServiceError } from '../serviceError';
import { sanitizeFilename, validateDocumentBytes, validatePickedFile } from './documentValidation';
import type { DocumentsService } from './documentsTypes';
import { readLocalFile } from './fileAccess';
import { documentStoragePath } from './storagePaths';

/**
 * DEMO-MODE ONLY (EXPO_PUBLIC_APP_MODE=demo). Keeps picked files in memory
 * for this app session so the upload UI can be reviewed without a backend.
 * It applies the same validation as production. To keep the full Add Record
 * experience reviewable, it also returns a processing summary derived from
 * the SAMPLE dataset (marked `source: 'sample'`; the app shows a DEMO badge).
 * Nothing is sent anywhere or persisted across restarts.
 */

/** Counts derived from the sample dataset's own links — never invented. */
function sampleProcessingSummary(): ProcessingSummary {
  const sample = mockDocuments[0];
  return {
    observationCount: sample.observationIds?.length ?? 0,
    newEncounterCount: 1,
    historicalComparisonCount: mockChanges.filter((c) => c.sourceDocumentId === sample.id).length,
    source: 'sample',
  };
}

const DEMO_USER_ID = '00000000-0000-4000-8000-000000000000';
const documents = new Map<string, StoredDocument>();
const localUris = new Map<string, string>();

function demoUuid(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const block = (n: number) => Array.from({ length: n }, hex).join('');
  const variant = '89ab'[Math.floor(Math.random() * 4)];
  return `${block(8)}-${block(4)}-4${block(3)}-${variant}${block(3)}-${block(12)}`;
}

export const demoDocumentsService: DocumentsService = {
  async listDocuments() {
    return [...documents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getDocument(id) {
    return documents.get(id) ?? null;
  },

  async uploadDocument(file, onStage) {
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

    onStage?.('uploading');
    const id = demoUuid();
    const now = new Date().toISOString();
    onStage?.('saving');
    const document: StoredDocument = {
      id,
      userId: DEMO_USER_ID,
      source: file.source ?? 'upload',
      documentType: 'unclassified',
      originalFilename: sanitizeFilename(file.name),
      mimeType: content.mimeType,
      fileSizeBytes: buffer.byteLength,
      storagePath: documentStoragePath(DEMO_USER_ID, id, content.mimeType),
      status: 'uploaded',
      processingError: null,
      uploadedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    documents.set(id, document);
    localUris.set(id, file.uri);
    return { document, processing: sampleProcessingSummary() };
  },

  async getOriginalDocumentUrl(document) {
    const uri = localUris.get(document.id);
    if (!uri) throw new ServiceError('not_found', 'This demo file is no longer available.');
    return uri;
  },
};
