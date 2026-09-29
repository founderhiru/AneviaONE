/**
 * Where original documents live in the private Storage bucket.
 *
 * The DATABASE assigns each document's path (see
 * `private.document_storage_path` in supabase/migrations); the app never
 * chooses one. This mirror exists so the app can verify the path it was
 * given really is inside the signed-in user's own folder before uploading.
 */

export const DOCUMENTS_BUCKET = 'medical-documents';

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
};

/** `<userId>/documents/<documentId>/original.<ext>` */
export function documentStoragePath(userId: string, documentId: string, mimeType: string): string {
  const extension = EXTENSIONS[mimeType];
  if (!extension) throw new Error(`Unsupported document type: ${mimeType}`);
  return `${userId}/documents/${documentId}/original.${extension}`;
}

/** True only for the exact path the database would assign to this document. */
export function isExpectedStoragePath(path: string, userId: string, documentId: string, mimeType: string): boolean {
  try {
    return path === documentStoragePath(userId, documentId, mimeType);
  } catch {
    return false;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Real stored documents have UUID ids; mock Health Memory records don't. */
export function isStoredDocumentId(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID_PATTERN.test(id);
}
