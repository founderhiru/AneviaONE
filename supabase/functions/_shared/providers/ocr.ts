/**
 * OcrProvider boundary. Gate 1 deliberately has NO implementation: scanned
 * PDFs are rejected with `scanned_pdf` ("Scanned PDFs aren't supported yet.").
 * A later gate can implement this interface without touching the pipeline.
 */
import type { PageTextResult } from '../types.ts';

export interface OcrProvider {
  readonly available: boolean;
  recognize(bytes: Uint8Array): Promise<PageTextResult>;
}

export class NoOcrProvider implements OcrProvider {
  readonly available = false;
  recognize(): Promise<PageTextResult> {
    return Promise.reject(new Error('ocr_not_implemented'));
  }
}
