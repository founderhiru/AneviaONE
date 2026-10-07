/**
 * A real, persisted original document (one row of `public.documents`).
 *
 * Deliberately separate from `Document` (types/document.ts), which describes
 * the still-mocked Health Memory records. A StoredDocument only ever holds
 * facts about the FILE — never extracted or AI-generated health information.
 */

/** Mirrors the `public.document_status` enum (supabase/migrations). */
export type DocumentStatus =
  | 'pending_upload'
  | 'uploaded'
  | 'processing'
  | 'extracted'
  | 'validated'
  | 'completed'
  | 'failed';

/** Mirrors `public.document_type`. */
export type StoredDocumentType = 'unclassified' | 'blood_test' | 'other';

/** Mirrors `public.document_source`. */
export type StoredDocumentSource = 'upload' | 'camera';

export type StoredDocument = {
  id: string;
  userId: string;
  source: StoredDocumentSource;
  documentType: StoredDocumentType;
  originalFilename: string;
  mimeType: 'application/pdf';
  fileSizeBytes: number;
  /** Private Storage location — never a public URL. */
  storagePath: string;
  status: DocumentStatus;
  /** User-safe explanation when status = 'failed'. */
  processingError: string | null;
  /** Why reading failed (server-set); 'identity_mismatch' means the report needs the person's review. */
  failureKind?: string | null;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A file the user picked, before it has been validated or uploaded. */
export type PickedFile = {
  uri: string;
  name: string;
  /** As reported by the picker — may be missing or wrong; verified again. */
  mimeType?: string | null;
  size?: number | null;
  /** How it was captured; recorded on the document. Defaults to 'upload'. */
  source?: StoredDocumentSource;
};

/** Progress of an upload, for the Add Record screen. */
export type UploadStage = 'validating' | 'uploading' | 'saving';

/**
 * What processing added to the Health Memory. Real counts arrive in Phase 2
 * (server-side extraction); in Phase 1 production uploads have none yet.
 * Demo mode supplies counts derived from the sample dataset (`source: 'sample'`).
 */
export type ProcessingSummary = {
  observationCount: number;
  newEncounterCount: number;
  historicalComparisonCount: number;
  source: 'sample' | 'processed';
};

export type UploadResult = {
  document: StoredDocument;
  /** Absent until the document has actually been processed. */
  processing?: ProcessingSummary;
};
