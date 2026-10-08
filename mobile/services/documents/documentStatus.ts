import type { StatusTone } from '../../components/StatusBadge';
import type { DocumentStatus } from '../../types';

/**
 * How each lifecycle state is described to people. Wording is deliberately
 * honest about what has (and hasn't) happened — nothing claims the report
 * was read or added to Health Memory until the server says so.
 */
export type DocumentStatusPresentation = {
  label: string;
  description: string;
  tone: StatusTone;
};

export const DOCUMENT_STATUS_PRESENTATION: Record<DocumentStatus, DocumentStatusPresentation> = {
  pending_upload: {
    label: 'Upload incomplete',
    description: 'This upload didn’t finish. Please upload the file again.',
    tone: 'warning',
  },
  // Read automatically once consent is recorded — no one has to ask.
  uploaded: {
    label: 'Processing',
    description: 'Your original is saved privately and is read automatically. Nothing from this file has been added to your Health Memory yet.',
    tone: 'neutral',
  },
  processing: {
    label: 'Reading report',
    description: 'We’re extracting the important health information. This can take a few minutes.',
    tone: 'accent',
  },
  extracted: {
    label: 'Reading report',
    description: 'We’re extracting the important health information. This can take a few minutes.',
    tone: 'accent',
  },
  validated: {
    label: 'Reading report',
    description: 'We’re double-checking the information from this report.',
    tone: 'accent',
  },
  completed: {
    // Says only that it was read; whether anything was found is below.
    label: 'Read',
    description: 'Your report has been read.',
    tone: 'success',
  },
  failed: {
    label: 'Failed',
    description: 'Your original is still stored safely, but we couldn’t read it yet.',
    tone: 'danger',
  },
  deleting: {
    label: 'Deletion not finished',
    description: 'We started deleting this report but couldn’t finish. Try deleting it again.',
    tone: 'warning',
  },
};

export const NEEDS_REVIEW_PRESENTATION: DocumentStatusPresentation = {
  label: 'Needs review',
  description: 'This report may belong to someone else, so nothing from it was added to your Health Memory.',
  tone: 'warning',
};

/** A completed report that added results to Health Memory. */
export const ADDED_PRESENTATION: DocumentStatusPresentation = {
  label: 'Added to Health Memory',
  description: 'Your report has been read. Information from it is in your Health Memory.',
  tone: 'success',
};

/** A completed report in which no health information was found — never shown as "added". */
export const NO_HEALTH_INFO_PRESENTATION: DocumentStatusPresentation = {
  label: 'No health information found',
  description: 'Report read — no health information was found to add. Your original is stored safely.',
  tone: 'neutral',
};

/** Presentation for one document, including the "Needs review" case. */
export function presentDocumentStatus(document: {
  status: DocumentStatus;
  failureKind?: string | null;
  healthInfoCount?: number | null;
}): DocumentStatusPresentation {
  if (document.status === 'failed' && document.failureKind === 'identity_mismatch') return NEEDS_REVIEW_PRESENTATION;
  if (document.status === 'completed' && typeof document.healthInfoCount === 'number') {
    return document.healthInfoCount > 0 ? ADDED_PRESENTATION : NO_HEALTH_INFO_PRESENTATION;
  }
  return DOCUMENT_STATUS_PRESENTATION[document.status];
}

/** Documents shown in lists: everything except abandoned uploads. */
export function isListedStatus(status: DocumentStatus): boolean {
  return status !== 'pending_upload';
}

/** The original file is confirmed stored and can be opened (not while it is being deleted). */
export function hasStoredOriginal(status: DocumentStatus): boolean {
  return status !== 'pending_upload' && status !== 'deleting';
}

/** Server-side reading is running. */
export function isProcessing(status: DocumentStatus): boolean {
  return status === 'processing' || status === 'extracted' || status === 'validated';
}

/** "842 KB", "3.4 MB" — for document metadata lines. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
