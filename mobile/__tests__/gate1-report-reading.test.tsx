/**
 * Gate 1 — reading a stored report: consent, the process-document request,
 * status → UI mapping, results with their source page, and the
 * Uploading → Processing → Reading report → Ready / failure + Retry flow.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import AddRecordScreen from '../app/add/index';
import DocumentViewerScreen from '../app/documents/[id]';
import HealthScreen from '../app/(tabs)/health';
import PrivacyScreen from '../app/privacy/index';
import {
  AI_CONSENT_VERSION,
  consentService,
  summarizeConsents,
  supabaseConsentService,
} from '../services/consent/consentService';
import { documentsService } from '../services/documents/documentsService';
import { readLocalFile } from '../services/documents/fileAccess';
import { healthService, productionHealthService } from '../services/health/healthService';
import { processingService, supabaseProcessingService, toProcessingState } from '../services/processing/processingService';
import { getSupabaseClient } from '../services/supabaseClient';
import { createFakeSupabase, pdfBytes } from '../test-support/fakeSupabase';
import type { RecordedObservation, StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../services/documents/fileAccess', () => ({ readLocalFile: jest.fn() }));
jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(() => null), isSupabaseConfigured: false }));

const DOC_ID = '33333333-3333-4333-8333-333333333333';

const stored = (overrides: Partial<StoredDocument> = {}): StoredDocument => ({
  id: DOC_ID,
  userId: 'u',
  source: 'upload',
  documentType: 'unclassified',
  originalFilename: 'Sunrise lab report.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 2048,
  storagePath: `u/documents/${DOC_ID}/original.pdf`,
  status: 'uploaded',
  processingError: null,
  uploadedAt: '2026-10-06T10:00:05Z',
  createdAt: '2026-10-06T10:00:00Z',
  updatedAt: '2026-10-06T10:00:05Z',
  ...overrides,
});

const hba1c: RecordedObservation = {
  id: 'o1',
  name: 'HbA1c',
  value: '5.8',
  unit: '%',
  referenceRange: '4.0 - 5.6',
  date: '2026-03-12',
  needsReview: false,
  source: { documentId: DOC_ID, documentName: 'Sunrise lab report.pdf', pageNumber: 1 },
};

beforeEach(() => {
  jest.restoreAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void) => {
    React.useEffect(effect, [effect]);
  });
  (readLocalFile as jest.Mock).mockResolvedValue(pdfBytes());
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/report.pdf', name: 'Sunrise lab report.pdf', mimeType: 'application/pdf', size: 2048 }],
  });
});

// ------------------------------------------------------------------ consent --

describe('AI consent', () => {
  const row = (consent_type: string, granted = true, policy_version = AI_CONSENT_VERSION, recorded_at = '2026-10-06T10:00:00Z') => ({
    consent_type,
    granted,
    policy_version,
    recorded_at,
  });

  it('counts only when BOTH consents are granted at the current version', () => {
    expect(summarizeConsents([row('ai_processing'), row('health_data_processing')])).toMatchObject({ granted: true, version: AI_CONSENT_VERSION });
    expect(summarizeConsents([row('ai_processing')]).granted).toBe(false);
    expect(summarizeConsents([row('ai_processing'), row('health_data_processing', false)]).granted).toBe(false);
    expect(summarizeConsents([row('ai_processing', true, 'ai-2020-01'), row('health_data_processing')]).granted).toBe(false);
    expect(summarizeConsents([]).granted).toBe(false);
  });

  it('records explicit, versioned rows (identity comes from the session, never the app)', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    await supabaseConsentService.grantAiConsent();
    await supabaseConsentService.revokeAiConsent();
    const [grant, revoke] = fake.calls;
    expect(grant).toMatchObject({ table: 'consents', op: 'insert' });
    expect(grant.payload).toEqual([
      { consent_type: 'ai_processing', policy_version: AI_CONSENT_VERSION, granted: true },
      { consent_type: 'health_data_processing', policy_version: AI_CONSENT_VERSION, granted: true },
    ]);
    expect(JSON.stringify(grant.payload)).not.toMatch(/user_id/);
    // Revoking appends a new decision; nothing is updated or deleted.
    expect(revoke).toMatchObject({ table: 'consents', op: 'insert' });
    expect((revoke.payload as { granted: boolean }[]).every((r) => r.granted === false)).toBe(true);
  });
});

// ---------------------------------------------------------- process request --

describe('process-document request', () => {
  it('sends only the document id — never a user id', async () => {
    const fake = createFakeSupabase();
    fake.functions.invoke.mockResolvedValue({ data: { status: 'processing' }, error: null });
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    expect(await supabaseProcessingService.start(DOC_ID)).toBe('processing');
    expect(fake.functions.invoke).toHaveBeenCalledWith('process-document', { body: { document_id: DOC_ID } });
  });

  it('maps server answers: 412 → consent needed, 409 already_processing → keep watching, other 409 → not available', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    const httpError = (status: number, error: string) => ({ data: null, error: { context: new Response(JSON.stringify({ error }), { status }) } });
    fake.functions.invoke.mockResolvedValueOnce(httpError(412, 'consent_required'));
    await expect(supabaseProcessingService.start(DOC_ID)).rejects.toMatchObject({ code: 'consent_required' });
    fake.functions.invoke.mockResolvedValueOnce(httpError(409, 'already_processing'));
    expect(await supabaseProcessingService.start(DOC_ID)).toBe('processing');
    fake.functions.invoke.mockResolvedValueOnce(httpError(409, 'not_retryable'));
    await expect(supabaseProcessingService.start(DOC_ID)).rejects.toMatchObject({ code: 'not_available' });
  });

  it('maps document status to what the person sees', () => {
    const base = { failure_kind: null, processing_error: null, processing_attempts: 1 };
    expect(toProcessingState({ ...base, status: 'uploaded' }, null)).toEqual({ phase: 'not_started' });
    expect(toProcessingState({ ...base, status: 'validated' }, null)).toEqual({ phase: 'processing' });
    expect(toProcessingState({ ...base, status: 'completed' }, { facts_written: 5, facts_needs_review: 1, facts_duplicate: 2 })).toEqual({
      phase: 'ready',
      resultsAdded: 4,
      needsReview: 1,
      alreadyInMemory: 2,
    });
    const failed = (failure_kind: string, attempts = 1) =>
      toProcessingState({ status: 'failed', failure_kind: failure_kind as never, processing_error: 'Reason.', processing_attempts: attempts }, null);
    expect(failed('provider')).toMatchObject({ phase: 'failed', canRetry: true, message: 'Reason.' });
    expect(failed('provider', 3)).toMatchObject({ canRetry: false }); // attempt limit, as on the server
    expect(failed('unsupported')).toMatchObject({ canRetry: false });
    expect(failed('identity_mismatch')).toEqual({ phase: 'needs_review', message: 'Reason.' }); // not retried; the person reviews
  });
});

// ---------------------------------------------------- production read model --

describe('production test results', () => {
  it('reads current_observations and links each to its stored document and page', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    fake.respond('select', {
      data: [
        {
          id: 'o1', name_as_written: 'HbA1c', value_as_written: '5.8', unit_as_written: '%', reference_range_as_written: '4.0 - 5.6',
          effective_date: '2026-03-12', confidence_gate: 'passed', review_status: 'unreviewed', document_id: DOC_ID, document_page_id: 'p1', created_at: 'x',
          // Server interpretation of the printed value/range; numerics may arrive as strings.
          value_numeric: '5.8', reference_low: 4, reference_high: '5.6', category: 'laboratory', abnormal_flag_as_written: null,
        },
      ],
      error: null,
    });
    fake.respond('select', { data: [{ id: DOC_ID, original_filename: 'Sunrise lab report.pdf' }], error: null });
    fake.respond('select', { data: [{ id: 'p1', page_number: 1 }], error: null });
    expect(await productionHealthService.getRecordedObservations()).toEqual([
      { ...hba1c, valueNumeric: 5.8, referenceLow: 4, referenceHigh: 5.6, category: 'laboratory', abnormalFlag: null },
    ]);
    expect(fake.calls.map((c) => c.table)).toEqual(['current_observations', 'documents', 'document_pages']);
  });

  it('one document: excludes superseded and rejected rows, marks unchecked ones', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    fake.respond('select', { data: [], error: null });
    await productionHealthService.getDocumentObservations(DOC_ID);
    expect(fake.calls[0]).toMatchObject({ table: 'observations' });
    expect(fake.calls[0].filters).toEqual(
      expect.arrayContaining([
        ['eq', 'document_id', DOC_ID],
        ['is', 'superseded_at', null],
        ['neq', 'review_status', 'rejected'],
      ])
    );
  });
});

// ------------------------------------------------------------------ the UI --

async function uploadThroughAddRecord() {
  jest.spyOn(documentsService, 'uploadDocument').mockResolvedValue({ document: stored() });
  await renderWithAuth(<AddRecordScreen />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Upload PDF'));
  });
}

describe('Add Record → reading the report', () => {
  it('asks for consent first; Allow records it and shows Uploading → Processing → Reading report → Ready', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue({ granted: false, version: null, recordedAt: null });
    const grant = jest.spyOn(consentService, 'grantAiConsent').mockResolvedValue();
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest
      .spyOn(processingService, 'getState')
      .mockResolvedValueOnce({ phase: 'not_started' })
      .mockResolvedValueOnce({ phase: 'processing' })
      .mockResolvedValue({ phase: 'ready', resultsAdded: 2, needsReview: 0, alreadyInMemory: 0 });

    await uploadThroughAddRecord();
    await waitFor(() => expect(screen.getByText('Read this report for you?')).toBeTruthy());
    expect(start).not.toHaveBeenCalled(); // nothing is sent before consent
    // The consent says what is sent: text, or images of the pages for photos and scans.
    expect(screen.getByText(/its text, or — for photos and scans — images of its pages/)).toBeTruthy();
    expect(screen.getByText(/Only the report itself is sent/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Allow and read report'));
    });
    expect(grant).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(DOC_ID, { retry: true, reprocess: false });
    for (const step of ['Uploading', 'Processing', 'Reading report', 'Ready']) expect(screen.getByText(step)).toBeTruthy();

    await waitFor(() => expect(screen.getByText('2 results added to your Health Memory')).toBeTruthy(), { timeout: 6000 });
    expect(screen.getAllByText('Your report is ready.').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByText('View results'));
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/health');
  }, 10000);

  it('with consent already recorded, starts reading straight away', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue({ granted: true, version: AI_CONSENT_VERSION, recordedAt: 'x' });
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(processingService, 'getState').mockResolvedValueOnce({ phase: 'not_started' }).mockResolvedValue({ phase: 'processing' });
    await uploadThroughAddRecord();
    await waitFor(() => expect(start).toHaveBeenCalledWith(DOC_ID, { retry: false, reprocess: false }));
    expect(screen.queryByText('Read this report for you?')).toBeNull();
    expect(screen.getByText('Reading your report…')).toBeTruthy();
  });

  it('declining keeps the original stored and reads nothing', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue({ granted: false, version: null, recordedAt: null });
    const start = jest.spyOn(processingService, 'start');
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'not_started' });
    await uploadThroughAddRecord();
    await waitFor(() => expect(screen.getByText('Not now')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
    });
    expect(start).not.toHaveBeenCalled();
    expect(screen.getByText('Uploaded')).toBeTruthy();
    // No "Read report" button — only a way to allow reading after "Not now".
    expect(screen.queryByText('Read this report')).toBeNull();
    expect(screen.getByText('Allow report reading')).toBeTruthy();
  });

  it('failure: “Couldn’t read this report yet.” with the reason and Retry', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue({ granted: true, version: AI_CONSENT_VERSION, recordedAt: 'x' });
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('completed');
    jest
      .spyOn(processingService, 'getState')
      .mockResolvedValueOnce({ phase: 'not_started' })
      .mockResolvedValue({ phase: 'failed', reason: 'provider', message: 'The reading service was busy. Please try again.', canRetry: true });
    await uploadThroughAddRecord();
    await waitFor(() => expect(screen.getByText('Couldn’t read this report yet.')).toBeTruthy());
    expect(screen.getByText('The reading service was busy. Please try again.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Retry'));
    });
    expect(start).toHaveBeenLastCalledWith(DOC_ID, { retry: true, reprocess: false });
  });

  it('a scanned report is not offered a Retry', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue({ granted: true, version: AI_CONSENT_VERSION, recordedAt: 'x' });
    jest.spyOn(processingService, 'start').mockResolvedValue('completed');
    jest
      .spyOn(processingService, 'getState')
      .mockResolvedValueOnce({ phase: 'not_started' })
      .mockResolvedValue({ phase: 'failed', reason: 'unsupported', message: 'This looks like a scanned document.', canRetry: false });
    await uploadThroughAddRecord();
    await waitFor(() => expect(screen.getByText('This looks like a scanned document.')).toBeTruthy());
    expect(screen.queryByText('Retry')).toBeNull();
  });
});

describe('Document screen: results with their source page', () => {
  it('shows each value as printed with its page, and the original to check against', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: DOC_ID });
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue(stored({ status: 'completed' }));
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'ready', resultsAdded: 2, needsReview: 1, alreadyInMemory: 0 });
    jest.spyOn(healthService, 'getDocumentObservations').mockResolvedValue([
      hba1c,
      { ...hba1c, id: 'o2', name: 'LDL Cholesterol', value: '1,20', unit: 'mg/dL', referenceRange: '< 100', needsReview: true },
    ]);
    await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByText('Read from this report')).toBeTruthy());
    expect(screen.getByText('HbA1c')).toBeTruthy();
    expect(screen.getByText('5.8 %')).toBeTruthy();
    expect(screen.getAllByText(/Page 1/).length).toBe(2);
    expect(screen.getByText('Not yet checked')).toBeTruthy();
    expect(screen.getByLabelText('View original document')).toBeTruthy();
  });
});

describe('Health tab: test results', () => {
  it('lists results with the report and page they came from; tapping opens the report', async () => {
    jest.spyOn(healthService, 'getRecordedObservations').mockResolvedValue([hba1c]);
    await renderWithAuth(<HealthScreen />);
    await waitFor(() => expect(screen.getByText('Test results')).toBeTruthy());
    expect(screen.getByText(/From Sunrise lab report\.pdf/)).toBeTruthy();
    expect(screen.getByText(/, page 1/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('HbA1c 5.8 %, from Sunrise lab report.pdf, page 1'));
    expect(router.push).toHaveBeenCalledWith(`/documents/${DOC_ID}`);
  });
});

describe('Privacy: report reading can be turned off', () => {
  it('revokes after confirmation', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue({ granted: true, version: AI_CONSENT_VERSION, recordedAt: '2026-10-06T10:00:00Z' });
    const revoke = jest.spyOn(consentService, 'revokeAiConsent').mockResolvedValue();
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === 'Turn off')?.onPress?.());
    await renderWithAuth(<PrivacyScreen />);
    await waitFor(() => expect(screen.getByText(/On — your report text is read/)).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Report reading (AI)'));
    });
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});
