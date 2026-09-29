import type { PickedFile, StoredDocument, UploadResult, UploadStage } from '../../types';

/**
 * Contract for the user's real, stored original documents. Screens use
 * only this interface; `documentsService.ts` selects the Supabase-backed
 * implementation (production) or the in-memory one (explicit demo mode).
 *
 * Every method throws a `ServiceError` (services/serviceError.ts) whose
 * `userMessage` is safe to display.
 */
export interface DocumentsService {
  /** The signed-in user's documents, newest first (abandoned uploads excluded). */
  listDocuments(): Promise<StoredDocument[]>;
  /** One of the signed-in user's documents, or null if it isn't theirs / doesn't exist. */
  getDocument(id: string): Promise<StoredDocument | null>;
  /**
   * Validates the picked PDF, stores the original privately and records it.
   * Resolves with the stored document in status `uploaded`.
   */
  uploadDocument(file: PickedFile, onStage?: (stage: UploadStage) => void): Promise<UploadResult>;
  /** A short-lived URL for viewing the original. Never a permanent/public URL. */
  getOriginalDocumentUrl(document: StoredDocument): Promise<string>;
}
