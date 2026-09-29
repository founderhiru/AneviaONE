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
  uploaded: {
    label: 'Stored securely',
    description:
      'Your original is saved privately to your account. Automatic reading of reports is coming soon — nothing from this file has been added to your Health Memory yet.',
    tone: 'neutral',
  },
  processing: {
    label: 'Reading your report',
    description: 'We’re reading this report. This can take a few minutes.',
    tone: 'accent',
  },
  extracted: {
    label: 'Reading your report',
    description: 'We’re reading this report. This can take a few minutes.',
    tone: 'accent',
  },
  validated: {
    label: 'Checking results',
    description: 'We’re double-checking the information from this report.',
    tone: 'accent',
  },
  completed: {
    label: 'Added to Health Memory',
    description: 'Information from this report is in your Health Memory.',
    tone: 'success',
  },
  failed: {
    label: 'Couldn’t read this report',
    description: 'Your original is still stored safely, but we couldn’t read it.',
    tone: 'danger',
  },
};

/** Documents shown in lists: everything except abandoned uploads. */
export function isListedStatus(status: DocumentStatus): boolean {
  return status !== 'pending_upload';
}

/** The original file is confirmed stored and can be opened. */
export function hasStoredOriginal(status: DocumentStatus): boolean {
  return status !== 'pending_upload';
}

/** Server-side processing is running (Phase 2+). */
export function isProcessing(status: DocumentStatus): boolean {
  return status === 'processing' || status === 'extracted' || status === 'validated';
}

/** "842 KB", "3.4 MB" — for document metadata lines. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
