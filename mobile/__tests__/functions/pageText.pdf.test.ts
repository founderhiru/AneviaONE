/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import { createUnpdfPageTextProvider, judgeTextLayer, PdfError, type UnpdfLike } from '../../../supabase/functions/_shared/providers/pageText.ts';

// jest-expo installs a structuredClone polyfill that cannot clone pdf.js worker messages.
// This minimal clone keeps typed arrays in the sandbox realm (pdf.js checks `instanceof`).
function cloneValue(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) {
    const view = v as Uint8Array;
    return new (view.constructor as Uint8ArrayConstructor)(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  if (v instanceof ArrayBuffer) return v.slice(0);
  if (Array.isArray(v)) return v.map(cloneValue);
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, cloneValue(x)]));
  if (v instanceof Set) return new Set([...v].map(cloneValue));
  return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, cloneValue(x)]));
}
(globalThis as { structuredClone: unknown }).structuredClone = cloneValue;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const unpdf = require('unpdf') as UnpdfLike;
export const fixture = (name: string) => new Uint8Array(fs.readFileSync(path.join(__dirname, '../../../supabase/functions/_fixtures', name)));

describe('PageTextProvider (text layer only)', () => {
  const provider = createUnpdfPageTextProvider(unpdf);

  it('reads a text-layer PDF page by page', async () => {
    const r = await provider.extract(fixture('report_a.pdf'));
    expect(r.pageCount).toBe(1);
    expect(r.source).toBe('pdf_text_layer');
    expect(r.pages[0].pageNumber).toBe(1);
    expect(r.pages[0].text).toContain('HbA1c 5.8 %');
    expect(r.pages[0].text).toContain('LDL Cholesterol 120 mg/dL');
    expect(judgeTextLayer(r).kind).toBe('text_layer');
  });
  it('detects an image-only PDF as scanned', async () => {
    const r = await provider.extract(fixture('scanned.pdf'));
    expect(judgeTextLayer(r)).toEqual({ kind: 'scanned' });
  });
  it('malformed PDF → invalid_pdf', async () => {
    await expect(provider.extract(fixture('malformed.pdf'))).rejects.toMatchObject({ code: 'invalid_pdf' });
    await expect(provider.extract(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(PdfError);
  });
  it('password-protected PDF → encrypted_pdf', async () => {
    await expect(provider.extract(fixture('encrypted.pdf'))).rejects.toMatchObject({ code: 'encrypted_pdf' });
  });
  it('too many pages → document_too_large', async () => {
    await expect(createUnpdfPageTextProvider(unpdf, 0).extract(fixture('report_a.pdf'))).rejects.toMatchObject({ code: 'document_too_large' });
  });
  it('errors never carry document text', async () => {
    try { await provider.extract(fixture('malformed.pdf')); } catch (e) { expect((e as Error).message).toBe('invalid_pdf'); }
  });
  it('judgeTextLayer: partially empty is processed, fully empty is scanned', () => {
    const page = (n: number, t: string) => ({ pageNumber: n, text: t });
    const long = 'HbA1c 5.8 % reference 4.0 - 5.6 patient synthetic collection date 15 Jan 2026';
    expect(judgeTextLayer({ pages: [page(1, long), page(2, '')], pageCount: 2, source: 'pdf_text_layer', meta: { provider: 'x', version: '1' } }))
      .toEqual({ kind: 'text_layer', emptyPages: 1 });
    expect(judgeTextLayer({ pages: [page(1, ''), page(2, '  ')], pageCount: 2, source: 'pdf_text_layer', meta: { provider: 'x', version: '1' } }).kind).toBe('scanned');
    expect(judgeTextLayer({ pages: [], pageCount: 0, source: 'pdf_text_layer', meta: { provider: 'x', version: '1' } }).kind).toBe('scanned');
  });
});

