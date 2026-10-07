/**
 * Automatic reading after upload: nobody taps "Read report". Upload →
 * consent once (if missing) → the server reads it → Health Memory and the
 * screens built from it refresh. Waiting documents are picked up when the
 * app opens; completed and permanently failed ones are left alone; the one
 * text PDF that came back empty under the earlier reading gets one re-read.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import HomeScreen from '../app/(tabs)/home';
import AddRecordScreen from '../app/add/index';
import DocumentViewerScreen from '../app/documents/[id]';
import { resetAutoReadConsentPromptForTests } from '../hooks/useAutoRead';
import { AI_CONSENT_VERSION, consentService } from '../services/consent/consentService';
import { documentsService } from '../services/documents/documentsService';
import { readLocalFile } from '../services/documents/fileAccess';
import { onHealthMemoryChanged } from '../services/health/healthMemoryApi';
import { allowAndReadWaitingDocuments, getAutoReadStatus, readWaitingDocuments, resetAutoReadForTests } from '../services/processing/autoRead';
import {
  EARLIER_READING_BEFORE,
  MAX_ATTEMPTS,
  POLL_INTERVAL_MS,
  processingService,
  selectAutoReads,
  startReading,
  supabaseProcessingService,
  toProcessingState,
} from '../services/processing/processingService';
import { getSupabaseClient } from '../services/supabaseClient';
import { createFakeSupabase, pdfBytes } from '../test-support/fakeSupabase';
import type { StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../services/documents/fileAccess', () => ({ readLocalFile: jest.fn() }));
jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(() => null), isSupabaseConfigured: false }));

const PDF_ID = '55555555-5555-4555-8555-555555555555';
const SCAN_ID = '66666666-6666-4666-8666-666666666666';
const OLD_ID = '77777777-7777-4777-8777-777777777777';

const CONSENTED = { granted: true, version: AI_CONSENT_VERSION, recordedAt: 'x' };
const NO_CONSENT = { granted: false, version: null, recordedAt: null };

const stored = (overrides: Partial<StoredDocument> = {}): StoredDocument => ({
  id: PDF_ID,
  userId: 'u',
  source: 'upload',
  documentType: 'unclassified',
  originalFilename: 'Lab report.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 2048,
  storagePath: `u/documents/${PDF_ID}/original.pdf`,
  status: 'uploaded',
  processingError: null,
  uploadedAt: '2026-10-07T10:00:05Z',
  createdAt: '2026-10-07T10:00:00Z',
  updatedAt: '2026-10-07T10:00:05Z',
  ...overrides,
});

const doc = (id: string, status: string, extra: { failure_kind?: string | null; processing_attempts?: number } = {}) => ({
  id,
  status,
  failure_kind: (extra.failure_kind ?? null) as never,
  processing_attempts: extra.processing_attempts ?? 1,
});
const run = (
  document_id: string,
  counts: { written?: number; review?: number; duplicate?: number },
  startedAt: string,
  completedAt: string,
  status = 'succeeded'
) => ({
  document_id,
  status,
  facts_written: counts.written ?? 0,
  facts_needs_review: counts.review ?? 0,
  facts_duplicate: counts.duplicate ?? 0,
  started_at: startedAt,
  completed_at: completedAt,
});
/** The text PDF read under the earlier evidence matching: completed, nothing found. */
const OLD_EMPTY_RUN = run(OLD_ID, {}, '2026-10-06T09:00:00Z', '2026-10-06T09:01:00Z');

beforeEach(() => {
  jest.restoreAllMocks();
  resetAutoReadForTests();
  resetAutoReadConsentPromptForTests();
  (getSupabaseClient as jest.Mock).mockReturnValue(null);
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void) => {
    React.useEffect(effect, [effect]);
  });
  (readLocalFile as jest.Mock).mockResolvedValue(pdfBytes());
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/report.pdf', name: 'Lab report.pdf', mimeType: 'application/pdf', size: 2048 }],
  });
  // Nothing waits in the background unless a test says so.
  jest.spyOn(processingService, 'listAutoReads').mockResolvedValue([]);
});

afterEach(() => {
  // No background watcher outlives its test.
  resetAutoReadForTests();
  jest.useRealTimers();
});

async function upload(document: StoredDocument) {
  jest.spyOn(documentsService, 'uploadDocument').mockResolvedValue({ document });
  await renderWithAuth(<AddRecordScreen />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Upload PDF'));
  });
}

// ------------------------------------------------- 1. upload → auto read --

describe('1. a new upload is read automatically after consent', () => {
  it('with consent recorded: reading starts on its own — no "Read report" tap', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(processingService, 'getState').mockResolvedValueOnce({ phase: 'not_started' }).mockResolvedValue({ phase: 'processing' });

    await upload(stored());

    await waitFor(() => expect(start).toHaveBeenCalledWith(PDF_ID, { retry: false, reprocess: false }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Read this report')).toBeNull();
    expect(screen.getByText('Reading your report…')).toBeTruthy();
    expect(screen.getByText('We’re extracting the important health information.')).toBeTruthy();
  });

  it('after "Allow": reading starts straight away, then "Your report is ready." and Health Memory refreshes', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(NO_CONSENT);
    const grant = jest.spyOn(consentService, 'grantAiConsent').mockResolvedValue();
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest
      .spyOn(processingService, 'getState')
      .mockResolvedValueOnce({ phase: 'not_started' })
      .mockResolvedValue({ phase: 'ready', resultsAdded: 3, needsReview: 0, alreadyInMemory: 0 });
    const refreshed = jest.fn();
    const unsubscribe = onHealthMemoryChanged(refreshed);

    await upload(stored());
    await waitFor(() => expect(screen.getByText('Allow and read report')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Allow and read report'));
    });

    expect(grant).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(PDF_ID, { retry: true, reprocess: false });
    await waitFor(() => expect(screen.getByText('3 results added to your Health Memory')).toBeTruthy(), { timeout: 6000 });
    expect(screen.getAllByText('Your report is ready.').length).toBeGreaterThan(0);
    expect(refreshed).toHaveBeenCalled();
    unsubscribe();
  }, 10000);
});

// --------------------------------------------- 2. consent before reading --

describe('2. missing consent is asked for before anything is read', () => {
  it('after upload: the consent is shown and nothing is sent until Allow', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(NO_CONSENT);
    const start = jest.spyOn(processingService, 'start');
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'not_started' });

    await upload(stored());

    await waitFor(() => expect(screen.getByTestId('ai-consent')).toBeTruthy());
    expect(start).not.toHaveBeenCalled();
  });

  it('waiting documents at app open: no request without consent; Allow records it, then reads', async () => {
    jest.spyOn(processingService, 'listAutoReads').mockResolvedValue([{ documentId: PDF_ID, reprocess: false }]);
    const consent = jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(NO_CONSENT);
    const grant = jest.spyOn(consentService, 'grantAiConsent').mockImplementation(async () => {
      consent.mockResolvedValue(CONSENTED);
    });
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'processing' });

    expect((await readWaitingDocuments()).waitingForConsent).toBe(1);
    expect(start).not.toHaveBeenCalled();

    await allowAndReadWaitingDocuments();
    expect(grant).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(PDF_ID, { reprocess: false });
    expect(getAutoReadStatus()).toMatchObject({ waitingForConsent: 0, reading: 1 });
  });

  it('Home shows the consent once for waiting reports; "Not now" sends nothing and is not asked again this session', async () => {
    jest.spyOn(processingService, 'listAutoReads').mockResolvedValue([{ documentId: PDF_ID, reprocess: false }]);
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(NO_CONSENT);
    const start = jest.spyOn(processingService, 'start');

    const first = await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByTestId('ai-consent')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
    });
    expect(screen.queryByTestId('ai-consent')).toBeNull();
    await act(async () => {
      first.unmount();
    });

    // Opening Home again in the same session: still not asked.
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(getAutoReadStatus().waitingForConsent).toBe(1));
    expect(screen.queryByTestId('ai-consent')).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it('Home: Allow starts reading, shows "Reading your report…", then "Your report is ready." and reloads Health Memory', async () => {
    const consent = jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(NO_CONSENT);
    jest.spyOn(consentService, 'grantAiConsent').mockImplementation(async () => {
      consent.mockResolvedValue(CONSENTED);
    });
    jest.spyOn(processingService, 'listAutoReads').mockResolvedValue([{ documentId: PDF_ID, reprocess: false }]);
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'ready', resultsAdded: 1, needsReview: 0, alreadyInMemory: 0 });
    const refreshed = jest.fn();
    const unsubscribe = onHealthMemoryChanged(refreshed);

    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Allow and read report')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Allow and read report'));
    });
    await waitFor(() => expect(screen.getByTestId('home-reading')).toBeTruthy());
    expect(start).toHaveBeenCalledWith(PDF_ID, { reprocess: false });
    expect(screen.getByText('Reading your report…')).toBeTruthy();

    await waitFor(() => expect(screen.getByTestId('home-report-ready')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText('Your report is ready.')).toBeTruthy();
    expect(refreshed).toHaveBeenCalledTimes(1);
    unsubscribe();
  }, 10000);
});

// ------------------------------------------- 3. never started twice --

describe('3. a document already being read is not started again', () => {
  it('the document screen only watches a report that is already being read', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: PDF_ID });
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue(stored({ status: 'processing' }));
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start');
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'processing' });

    await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByTestId('read-report-processing')).toBeTruthy());
    expect(start).not.toHaveBeenCalled();
  });

  it('overlapping requests for one document (upload screen, document screen, app-open sweep) send one request', async () => {
    let finish: (v: 'processing') => void = () => {};
    const start = jest.spyOn(processingService, 'start').mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const a = startReading(PDF_ID);
    const b = startReading(PDF_ID);
    const c = startReading(PDF_ID, { retry: true });
    finish('processing');
    await expect(Promise.all([a, b, c])).resolves.toEqual(['processing', 'processing', 'processing']);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('overlapping app-open sweeps share one pass; a document being watched is not started again', async () => {
    jest.useFakeTimers();
    const list = jest.spyOn(processingService, 'listAutoReads').mockResolvedValue([{ documentId: PDF_ID, reprocess: false }]);
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'processing' });

    await Promise.all([readWaitingDocuments(), readWaitingDocuments(), readWaitingDocuments()]);
    expect(list).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);

    // Comes back to the foreground while it is still being read.
    await readWaitingDocuments();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('the server saying "already being read" is just watched, not an error', async () => {
    const fake = createFakeSupabase();
    fake.functions.invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify({ error: 'already_processing' }), { status: 409 }) },
    });
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    await expect(supabaseProcessingService.start(PDF_ID)).resolves.toBe('processing');
  });
});

// -------------------------------------- 4. completed: not read again --

describe('4. completed documents are not read again on every launch', () => {
  it('only documents waiting to be read are picked', () => {
    const reads = selectAutoReads(
      [
        doc('a', 'uploaded'),
        doc('b', 'processing'),
        doc('c', 'completed'),
        doc('d', 'failed', { failure_kind: 'provider', processing_attempts: 1 }),
        doc('e', 'failed', { failure_kind: 'unsupported' }),
        doc('f', 'failed', { failure_kind: 'identity_mismatch' }),
        doc('g', 'failed', { failure_kind: 'consent_required', processing_attempts: 1 }),
        doc('h', 'failed', { failure_kind: 'consent_required', processing_attempts: MAX_ATTEMPTS }),
      ],
      [run('c', { written: 4 }, '2026-10-06T09:00:00Z', '2026-10-06T09:01:00Z')]
    );
    // Uploaded, and a read that stopped only for consent (tries left). No
    // other failure is retried automatically — that stays a manual Retry.
    expect(reads).toEqual([
      { documentId: 'a', reprocess: false },
      { documentId: 'g', reprocess: false },
    ]);
  });

  it('a completed report that read nothing NOW (current reading) is not re-read', () => {
    const now = run('c', {}, '2026-10-07T18:00:00Z', '2026-10-07T18:01:00Z');
    expect(Date.parse(now.completed_at) > Date.parse(EARLIER_READING_BEFORE)).toBe(true);
    expect(selectAutoReads([doc('c', 'completed')], [now])).toEqual([]);
  });

  it('launching again and again sends nothing for completed documents', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    jest.spyOn(processingService, 'listAutoReads').mockImplementation(() => supabaseProcessingService.listAutoReads());
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start');
    for (let launch = 0; launch < 3; launch++) {
      fake.respond('select', { data: [doc(PDF_ID, 'completed')], error: null });
      fake.respond('select', { data: [run(PDF_ID, { written: 5 }, '2026-10-07T18:00:00Z', '2026-10-07T18:01:00Z')], error: null });
      await readWaitingDocuments();
    }
    expect(start).not.toHaveBeenCalled();
  });

  it('asks only for the signed-in person’s rows (RLS) — no user id is sent', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    fake.respond('select', { data: [doc(PDF_ID, 'uploaded'), doc(OLD_ID, 'completed')], error: null });
    fake.respond('select', { data: [OLD_EMPTY_RUN], error: null });
    await expect(supabaseProcessingService.listAutoReads()).resolves.toEqual([
      { documentId: PDF_ID, reprocess: false },
      { documentId: OLD_ID, reprocess: true },
    ]);
    expect(JSON.stringify(fake.calls)).not.toMatch(/user_id/);
    expect(fake.calls.map((c) => c.table)).toEqual(['documents', 'extraction_runs']);
  });

  it('opening an already-read report does not reload Health Memory', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: PDF_ID });
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue(stored({ status: 'completed' }));
    const start = jest.spyOn(processingService, 'start');
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'ready', resultsAdded: 2, needsReview: 0, alreadyInMemory: 0 });
    const refreshed = jest.fn();
    const unsubscribe = onHealthMemoryChanged(refreshed);
    await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByTestId('read-report-ready')).toBeTruthy());
    expect(start).not.toHaveBeenCalled();
    expect(refreshed).not.toHaveBeenCalled();
    // "Read again" stays, as a secondary recovery action.
    expect(screen.getByTestId('read-report-again')).toBeTruthy();
    unsubscribe();
  });
});

// ------------------------------ 5. the old empty read: one re-read only --

describe('5. the completed text PDF with 0 results gets one controlled re-read', () => {
  it('is picked once, as a re-read', () => {
    expect(selectAutoReads([doc(OLD_ID, 'completed')], [OLD_EMPTY_RUN])).toEqual([{ documentId: OLD_ID, reprocess: true }]);
  });

  it('after its re-read (a newer run) it is never picked again — whatever that run found', () => {
    const reread = (counts: { written?: number }) => run(OLD_ID, counts, '2026-10-08T09:00:00Z', '2026-10-08T09:01:00Z');
    expect(selectAutoReads([doc(OLD_ID, 'completed')], [OLD_EMPTY_RUN, reread({ written: 6 })])).toEqual([]);
    expect(selectAutoReads([doc(OLD_ID, 'completed')], [OLD_EMPTY_RUN, reread({})])).toEqual([]);
    // A re-read that failed leaves the document failed — not retried automatically.
    expect(selectAutoReads([doc(OLD_ID, 'failed', { failure_kind: 'provider' })], [OLD_EMPTY_RUN])).toEqual([]);
  });

  it('a report that came back with results held for review or already known is not re-read', () => {
    expect(selectAutoReads([doc(OLD_ID, 'completed')], [run(OLD_ID, { review: 2 }, '2026-10-06T09:00:00Z', '2026-10-06T09:01:00Z')])).toEqual([]);
    expect(selectAutoReads([doc(OLD_ID, 'completed')], [run(OLD_ID, { duplicate: 3 }, '2026-10-06T09:00:00Z', '2026-10-06T09:01:00Z')])).toEqual([]);
  });

  it('end to end over launches: one re-read request, then none', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    jest.spyOn(processingService, 'listAutoReads').mockImplementation(() => supabaseProcessingService.listAutoReads());
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'processing' });

    fake.respond('select', { data: [doc(OLD_ID, 'completed')], error: null });
    fake.respond('select', { data: [OLD_EMPTY_RUN], error: null });
    await readWaitingDocuments();
    expect(start).toHaveBeenCalledWith(OLD_ID, { reprocess: true });
    resetAutoReadForTests();

    // Later launches: the re-read finished (newer run, 6 results).
    for (let launch = 0; launch < 2; launch++) {
      fake.respond('select', { data: [doc(OLD_ID, 'completed')], error: null });
      fake.respond('select', { data: [OLD_EMPTY_RUN, run(OLD_ID, { written: 6 }, '2026-10-08T09:00:00Z', '2026-10-08T09:01:00Z')], error: null });
      await readWaitingDocuments();
    }
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('the re-read goes through the server’s reprocess path (fingerprinted)', async () => {
    const fake = createFakeSupabase();
    fake.functions.invoke.mockResolvedValue({ data: { status: 'processing' }, error: null });
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    await supabaseProcessingService.start(OLD_ID, { reprocess: true });
    expect(fake.functions.invoke).toHaveBeenCalledWith('process-document', { body: { document_id: OLD_ID, reprocess: true } });
  });
});

// ------------------------------------------ 6. scans are read automatically --

describe('6. uploaded scans are read automatically', () => {
  it('a camera scan is sent for reading straight after upload (the server transcribes it)', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(processingService, 'getState').mockResolvedValueOnce({ phase: 'not_started' }).mockResolvedValue({ phase: 'processing' });

    await upload(stored({ id: SCAN_ID, source: 'camera', originalFilename: 'Scan 7 Oct.pdf' }));

    await waitFor(() => expect(start).toHaveBeenCalledWith(SCAN_ID, { retry: false, reprocess: false }));
    expect(screen.getByText('Reading your report…')).toBeTruthy();
  });

  it('a scan left waiting is read when its document is opened — no button', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: SCAN_ID });
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue(stored({ id: SCAN_ID, source: 'camera' }));
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(processingService, 'getState').mockResolvedValueOnce({ phase: 'not_started' }).mockResolvedValue({ phase: 'processing' });

    await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(start).toHaveBeenCalledWith(SCAN_ID, { retry: false, reprocess: false }));
    expect(screen.queryByText('Read this report')).toBeNull();
  });

  it('a scan waiting at app open is read by the sweep and Health Memory refreshes when it is ready', async () => {
    jest.useFakeTimers();
    jest.spyOn(processingService, 'listAutoReads').mockResolvedValue([{ documentId: SCAN_ID, reprocess: false }]);
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest
      .spyOn(processingService, 'getState')
      .mockResolvedValueOnce({ phase: 'processing' })
      .mockResolvedValue({ phase: 'ready', resultsAdded: 2, needsReview: 1, alreadyInMemory: 0 });
    const refreshed = jest.fn();
    const unsubscribe = onHealthMemoryChanged(refreshed);

    await readWaitingDocuments();
    expect(start).toHaveBeenCalledWith(SCAN_ID, { reprocess: false });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(refreshed).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(getAutoReadStatus()).toMatchObject({ reading: 0, justFinished: true });
    unsubscribe();
  });
});

// ------------------------------------------------ 7. no duplicate facts --

describe('7. duplicate facts are prevented', () => {
  it('upload screen + app-open sweep on the same new document: one read request, so one set of results', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    jest.spyOn(processingService, 'listAutoReads').mockResolvedValue([{ documentId: PDF_ID, reprocess: false }]);
    let finish: (v: 'processing') => void = () => {};
    const start = jest
      .spyOn(processingService, 'start')
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValue('processing');
    jest.spyOn(processingService, 'getState').mockResolvedValueOnce({ phase: 'not_started' }).mockResolvedValue({ phase: 'processing' });

    await upload(stored());
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    // The sweep reaches the same document while the upload screen's request is still in flight.
    const sweep = readWaitingDocuments();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      finish('processing');
      await sweep;
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('results the server already had are reported as "already in your Health Memory", not added again', async () => {
    expect(
      toProcessingState(
        { status: 'completed', failure_kind: null, processing_error: null, processing_attempts: 2 },
        { facts_written: 0, facts_needs_review: 0, facts_duplicate: 4 }
      )
    ).toEqual({ phase: 'ready', resultsAdded: 0, needsReview: 0, alreadyInMemory: 4 });
    // …and a report whose results were all duplicates is never re-read for having "0 added".
    expect(selectAutoReads([doc(PDF_ID, 'completed')], [run(PDF_ID, { duplicate: 4 }, '2026-10-06T09:00:00Z', '2026-10-06T09:01:00Z')])).toEqual([]);
  });

  it('the app never writes results itself — only the server (process-document) does', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    jest.spyOn(processingService, 'listAutoReads').mockImplementation(() => supabaseProcessingService.listAutoReads());
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    jest.spyOn(processingService, 'start').mockImplementation((id, options) => supabaseProcessingService.start(id, options));
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'processing' });
    fake.functions.invoke.mockResolvedValue({ data: { status: 'processing' }, error: null });
    fake.respond('select', { data: [doc(PDF_ID, 'uploaded')], error: null });

    await readWaitingDocuments();
    expect(fake.functions.invoke).toHaveBeenCalledTimes(1);
    expect(fake.calls.every((c) => c.op === 'select')).toBe(true);
  });
});
