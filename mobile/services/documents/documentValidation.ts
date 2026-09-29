/**
 * Document upload rules (pure functions — no I/O).
 *
 * The same limits are enforced again server-side by the database (check
 * constraints) and the private Storage bucket (allowed MIME types + size
 * limit), so these checks are for a fast, friendly error — not the only line
 * of defence.
 */

/** Must match the bucket `file_size_limit` and `documents.file_size_bytes` check. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const SUPPORTED_DOCUMENT_MIME_TYPES = ['application/pdf'] as const;
export type SupportedDocumentMimeType = (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number];

export type DocumentValidationCode = 'unsupported_type' | 'too_large' | 'empty' | 'not_a_pdf';

export type DocumentValidationResult =
  | { ok: true; mimeType: SupportedDocumentMimeType }
  | { ok: false; code: DocumentValidationCode; message: string };

const MESSAGES: Record<DocumentValidationCode, string> = {
  unsupported_type: 'Please choose a PDF file. Photos and other file types aren’t supported yet.',
  too_large: `This file is too large. Please choose a PDF under ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`,
  empty: 'This file appears to be empty. Please choose another PDF.',
  not_a_pdf: 'This file isn’t a valid PDF. Please choose another file.',
};

const fail = (code: DocumentValidationCode): DocumentValidationResult => ({ ok: false, code, message: MESSAGES[code] });

/** Generic MIME types some Android pickers report for PDFs. */
const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/**
 * First check, using what the file picker reports (name, MIME type, size).
 * Pickers can be vague, so a `.pdf` with a generic MIME type is allowed
 * through here — its real content is verified by `validateDocumentBytes`.
 */
export function validatePickedFile(file: { name?: string | null; mimeType?: string | null; size?: number | null }): DocumentValidationResult {
  const mimeType = (file.mimeType ?? '').trim().toLowerCase();
  const hasPdfExtension = /\.pdf$/i.test(file.name ?? '');

  const looksLikePdf = mimeType === 'application/pdf' || (GENERIC_MIME_TYPES.has(mimeType) && hasPdfExtension);
  if (!looksLikePdf) return fail('unsupported_type');

  if (typeof file.size === 'number') {
    if (file.size <= 0) return fail('empty');
    if (file.size > MAX_DOCUMENT_BYTES) return fail('too_large');
  }
  return { ok: true, mimeType: 'application/pdf' };
}

/** The PDF format requires `%PDF-` within the first 1024 bytes. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export function hasPdfSignature(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length - PDF_MAGIC.length, 1024);
  for (let start = 0; start <= limit; start++) {
    let match = true;
    for (let i = 0; i < PDF_MAGIC.length; i++) {
      if (bytes[start + i] !== PDF_MAGIC[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/** Second check, on the actual file contents we are about to upload. */
export function validateDocumentBytes(bytes: Uint8Array): DocumentValidationResult {
  if (bytes.byteLength === 0) return fail('empty');
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) return fail('too_large');
  if (!hasPdfSignature(bytes)) return fail('not_a_pdf');
  return { ok: true, mimeType: 'application/pdf' };
}

/** Keeps a display-safe original filename (no paths/control chars, ≤255). */
export function sanitizeFilename(name: string | null | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const safe = cleaned.length > 0 ? cleaned : 'document.pdf';
  return safe.length > 255 ? safe.slice(safe.length - 255) : safe;
}
