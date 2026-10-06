/** Shared types for the document-understanding pipeline. */

export type PageText = {
  pageNumber: number;
  text: string;
  widthPt?: number | null;
  heightPt?: number | null;
};

export type PageTextResult = {
  pages: PageText[];
  pageCount: number;
  source: 'pdf_text_layer' | 'ocr';
  meta: { provider: string; version: string };
};

export type ConfidenceBand = 'high' | 'medium' | 'low';

export type ReviewGate = 'unreviewed' | 'needs_review';

/** Why a fact was refused outright (never stored). Counts of these are logged. */
export type RejectionReason =
  | 'schema_invalid'
  | 'page_missing'
  | 'quote_too_short'
  | 'quote_too_long'
  | 'quote_not_on_page'
  | 'value_not_in_quote'
  | 'name_not_in_quote'
  | 'confidence_invalid'
  | 'field_too_long'
  | 'not_patient_condition'
  | 'not_an_allergy'
  | 'unknown_encounter'
  | 'duplicate';

/** Why a fact was stored but kept out of longitudinal use until a person reviews it. */
export type ReviewReason =
  | 'low_confidence'
  | 'unit_not_in_quote'
  | 'unit_unexpected_for_analyte'
  | 'ambiguous_value'
  | 'ambiguous_date'
  | 'missing_date'
  | 'kind_uncertain';

export type DocumentTypeGuess =
  | 'blood_test'
  | 'prescription'
  | 'discharge_summary'
  | 'consultation_note'
  | 'imaging_report'
  | 'vaccination_record'
  | 'other';

export type FailureKind = 'transient' | 'permanent' | 'unsupported' | 'provider';

export type FailureCode =
  | 'scanned_pdf'
  | 'invalid_pdf'
  | 'encrypted_pdf'
  | 'document_too_large'
  | 'patient_mismatch'
  | 'no_results_found'
  | 'evidence_validation_failed'
  | 'extraction_invalid_output'
  | 'extraction_too_large'
  | 'provider_unavailable'
  | 'provider_auth'
  | 'provider_rejected'
  | 'storage_download_failed'
  | 'processing_timeout'
  | 'internal_error';

export type FailureInfo = {
  code: FailureCode;
  kind: FailureKind;
  retryable: boolean;
  /** Safe to show to the person. Never contains health content. */
  userMessage: string;
};

/** Output of the profile identity check. */
export type IdentityCheck = 'match' | 'mismatch' | 'unverifiable';

/** Counts-only stats stored on the extraction run. */
export type RunStats = {
  pages?: number;
  empty_pages?: number;
  chunks?: number;
  input_tokens?: number;
  output_tokens?: number;
  accepted?: Record<string, number>;
  needs_review?: Record<string, number>;
  rejected?: Partial<Record<RejectionReason, number>>;
  dropped_optional_fields?: number;
  confidence_threshold?: number;
};
