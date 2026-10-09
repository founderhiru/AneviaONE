/** Pages/PDF detection, chunking, identity, fingerprints and redacted logging. */
import { assertEquals, assertNotEquals, assertRejects, assertThrows } from '@std/assert';

import { chunkPages } from '../chunking.ts';
import { EngineError } from '../errors.ts';
import { factFingerprint, sha256Hex } from '../fingerprint.ts';
import { checkReportPerson, identityAllowsTrust } from '../identity.ts';
import { redact } from '../log.ts';
import { UnpdfPageTextProvider, detectTextLayer } from '../pages.ts';
import { MALFORMED_PDF, NOT_A_PDF, REPORT_A, SYNTHETIC_PATIENT, buildImageOnlyPdf, buildTextPdf } from './fixtures.ts';

const provider = new UnpdfPageTextProvider(() => import('unpdf'));

Deno.test('PDF: a text-layer PDF yields its page text', async () => {
  const { pages, metadata } = await provider.extract(buildTextPdf(REPORT_A));
  assertEquals(metadata.textLayer, 'present');
  assertEquals(metadata.pageCount, 1);
  assertEquals(pages[0].page_number, 1);
  assertEquals(pages[0].text.includes('HbA1c 5.8 % 4.0 - 5.6'), true);
});

Deno.test('PDF: multi-page text PDFs keep page numbers', async () => {
  const { pages } = await provider.extract(buildTextPdf([['Page one HbA1c 5.8 % result line'], ['Page two LDL Cholesterol 120 mg/dL line']]));
  assertEquals(pages.map((p) => p.page_number), [1, 2]);
  assertEquals(pages[1].text.includes('LDL Cholesterol 120'), true);
});

Deno.test('PDF: an image-only (scanned) PDF is detected — no text layer', async () => {
  const { metadata } = await provider.extract(buildImageOnlyPdf());
  assertEquals(metadata.textLayer, 'absent');
});

Deno.test('PDF: malformed files and non-PDFs are unsupported', async () => {
  await assertRejects(() => provider.extract(MALFORMED_PDF), EngineError, 'malformed_pdf');
  await assertRejects(() => provider.extract(NOT_A_PDF), EngineError, 'malformed_pdf');
});

Deno.test('text-layer detection thresholds', () => {
  assertEquals(detectTextLayer([]), 'absent');
  assertEquals(detectTextLayer([{ page_number: 1, text: '  ' }]), 'absent');
  assertEquals(detectTextLayer([{ page_number: 1, text: 'Hemoglobin 13.2 g/dL reference 12-15' }]), 'present');
});

Deno.test('chunking: deterministic, whole pages, never truncated', () => {
  const pages = [1, 2, 3, 4].map((n) => ({ page_number: n, text: 'x'.repeat(40) }));
  assertEquals(chunkPages(pages, 100).map((c) => c.map((p) => p.page_number)), [[1, 2], [3, 4]]);
  assertEquals(chunkPages(pages, 100), chunkPages(pages, 100));
  assertThrows(() => chunkPages([{ page_number: 1, text: 'x'.repeat(200) }], 100), EngineError, 'page_too_long');
  assertThrows(() => chunkPages(pages, 1000, 3), EngineError, 'too_many_pages');
});

Deno.test('report-person check: explicit identifiers only, no fuzzy matching', () => {
  const account = { fullName: SYNTHETIC_PATIENT.name, dateOfBirth: SYNTHETIC_PATIENT.dateOfBirth };
  assertEquals(checkReportPerson({ patientName: null, patientDateOfBirth: null }, account), 'no_identifiers');
  assertEquals(checkReportPerson({ patientName: 'Mrs. ASHA VERMA', patientDateOfBirth: '14/08/1985' }, account), 'consistent');
  assertEquals(checkReportPerson({ patientName: 'Rahul Mehta', patientDateOfBirth: null }, account), 'mismatch');
  assertEquals(checkReportPerson({ patientName: 'Asha Verma', patientDateOfBirth: '01/01/1970' }, account), 'mismatch');
  assertEquals(checkReportPerson({ patientName: 'Rahul Mehta', patientDateOfBirth: null }, { fullName: null, dateOfBirth: null }), 'unverifiable');
  // An ambiguous DOB (05/06/…) is not compared rather than guessed.
  assertEquals(checkReportPerson({ patientName: null, patientDateOfBirth: '05/06/1985' }, account), 'unverifiable');
});

Deno.test('report-person check: only strong evidence is "consistent"', () => {
  const account = { fullName: SYNTHETIC_PATIENT.name, dateOfBirth: SYNTHETIC_PATIENT.dateOfBirth };
  // Full name alone, or the exact date of birth alone, is strong.
  assertEquals(checkReportPerson({ patientName: 'verma asha', patientDateOfBirth: null }, account), 'consistent');
  assertEquals(checkReportPerson({ patientName: null, patientDateOfBirth: '14/08/1985' }, account), 'consistent');
  assertEquals(checkReportPerson({ patientName: 'Asha Rani Verma', patientDateOfBirth: null }, account), 'consistent');
  // One shared word or an initial is weak: identifiers exist but don't establish ownership.
  assertEquals(checkReportPerson({ patientName: 'A. Verma', patientDateOfBirth: null }, account), 'unverifiable');
  assertEquals(checkReportPerson({ patientName: 'Asha Sharma', patientDateOfBirth: null }, account), 'unverifiable');
  // A conflict anywhere wins over a match elsewhere.
  assertEquals(checkReportPerson({ patientName: 'Asha Verma', patientDateOfBirth: '15/08/1985' }, account), 'mismatch');
  // Nothing entered by the person: nothing to establish ownership with.
  assertEquals(checkReportPerson({ patientName: 'Asha Verma', patientDateOfBirth: '14/08/1985' }, { fullName: null, dateOfBirth: null }), 'unverifiable');
  // Only the name entered, report only has a DOB: can't compare.
  assertEquals(checkReportPerson({ patientName: null, patientDateOfBirth: '14/08/1985' }, { fullName: 'Asha Verma', dateOfBirth: null }), 'unverifiable');
});

Deno.test('trust needs strong identity evidence', () => {
  assertEquals(identityAllowsTrust('consistent'), true);
  for (const check of ['no_identifiers', 'unverifiable', 'mismatch'] as const) assertEquals(identityAllowsTrust(check), false);
});

Deno.test('fingerprints: same report → same fingerprint; any identity change → different', async () => {
  const sha = await sha256Hex(buildTextPdf(REPORT_A));
  assertEquals(sha, await sha256Hex(buildTextPdf(REPORT_A)));
  const fp = await factFingerprint(sha, ['observations', '1', 'hba1c', '5.8', '%', '']);
  assertEquals(fp, await factFingerprint(sha, ['observations', '1', 'hba1c', '5.8', '%', '']));
  assertEquals(/^[0-9a-f]{64}$/.test(fp), true);
  assertNotEquals(fp, await factFingerprint(sha, ['observations', '1', 'hba1c', '5.9', '%', '']));
  assertNotEquals(fp, await factFingerprint('0'.repeat(64), ['observations', '1', 'hba1c', '5.8', '%', '']));
  // Field boundaries can't collide.
  assertNotEquals(await factFingerprint(sha, ['a|b', 'c']), await factFingerprint(sha, ['a', 'b|c']));
});

Deno.test('logging: only allow-listed, non-sensitive fields survive', () => {
  const safe = redact({
    event: 'document_failed',
    document_id: 'd1',
    error_code: 'scanned_pdf',
    source_text: 'HbA1c 5.8 %',
    page_text: 'Patient: Asha Verma',
    prompt: 'Extract…',
    patient_name: 'Asha Verma',
    value: '5.8',
  } as never);
  assertEquals(safe, { event: 'document_failed', document_id: 'd1', error_code: 'scanned_pdf' });
});
