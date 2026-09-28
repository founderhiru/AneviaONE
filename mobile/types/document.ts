export type DocumentSource = 'camera' | 'upload' | 'whatsapp';

export type DocumentProcessingStatus =
  | 'received'
  | 'identifying'
  | 'extracting'
  | 'comparing'
  | 'updating_memory'
  | 'complete'
  | 'failed';

export type Document = {
  id: string;
  title: string; // e.g. "Lipid Profile Report"
  date: string; // ISO date of the report itself
  provider?: string; // e.g. "Apollo Diagnostics"
  source: DocumentSource;
  status: DocumentProcessingStatus;
  /** Mock placeholder for a Supabase Storage URL later. */
  fileUri?: string;
  mimeType?: 'application/pdf' | 'image/jpeg' | 'image/png';
  pageCount?: number;
  observationIds?: string[];
  createdAt: string;
};

/** A single piece of evidence linking a claim back to its source document/page. */
export type Evidence = {
  documentId: string;
  documentTitle: string;
  pageNumber?: number;
  excerpt?: string;
};
