/**
 * Regression: viewing a completed document must be read-only.
 *
 * An already-read report was re-read on the server while it was being viewed,
 * replacing its results in Health Memory. Opening, re-opening, deep-linking,
 * resuming the app and refreshing must never ask the server to read a
 * completed report; only the person's confirmed "Read again" does. Reports
 * that genuinely wait to be read are still read, exactly once.
 * Synthetic ids only.
 */
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import HomeScreen from '../app/(tabs)/home';
import DocumentViewerScreen from '../app/documents/[id]';
import { consentService } from '../services/consent/consentService';
import { documentsService } from '../services/documents/documentsService';
import { readWaitingDocuments, resetAutoReadForTests } from '../services/processing/autoRead';
import { processingService, supabaseProcessingService } from '../services/processing/processingService';
import { getSupabaseClient } from '../services/supabaseClient';
import { createFakeSupabase } from '../test-support/fakeSupabase';
import type { StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(() => null), isSupabaseConfigured: false }));

const DOC_ID = '44444444-4444-4444-8444-444444444444';
const CONSENTED = { granted: true, version: 'ai-2026-10', recordedAt: '2026-10-01T00:00:00Z' };
const READY = { phase: 'ready' as const, resultsAdded: 14, needsReview: 24, alreadyInMemory: 0 };

function stored(status: StoredDocument['status'], extra: Partial<StoredDocument> = {}): StoredDocument {
  const at = '2026-10-07T10:00:00.000Z';
  return {
    id: DOC_ID, userId: 'user-1', source: 'camera', documentType: 'unclassified', originalFilename: 'Synthetic scan.pdf',
    mimeType: 'application/pdf', fileSizeBytes: 2048, storagePath: `user-1/documents/${DOC_ID}/original.pdf`,
    status, processingError: null, healthInfoCount: 14, uploadedAt: at, createdAt: at, updatedAt: at, ...extra,
  };
}

let start: jest.SpyInstance;

beforeEach(() => {
  jest.restoreAllMocks();
  resetAutoReadForTests();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: DOC_ID });
  jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
  start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
});

async function openDocument(doc: StoredDocument) {
  jest.spyOn(documentsService, 'getDocument').mockResolvedValue(doc);
  const view = await renderWithAuth(<DocumentViewerScreen />);
  await waitFor(() => expect(screen.getByTestId('delete-document')).toBeTruthy());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return view;
}

describe('a completed document is never read again by viewing it', () => {
  beforeEach(() => {
    jest.spyOn(processingService, 'getState').mockResolvedValue(READY);
  });

  it('A. opening it sends nothing to the server', async () => {
    await openDocument(stored('completed'));
    await waitFor(() => expect(screen.getByTestId('read-report-ready')).toBeTruthy());
    expect(start).not.toHaveBeenCalled();
  });

  it('B. opening it again and again sends nothing', async () => {
    for (let i = 0; i < 4; i++) {
      const view = await openDocument(stored('completed'));
      await view.unmount();
    }
    expect(start).not.toHaveBeenCalled();
  });

  it('C. arriving by a deep link (route id only, nothing else) sends nothing', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: DOC_ID });
    await openDocument(stored('completed'));
    expect(start).not.toHaveBeenCalled();
  });

  it('D. resuming the app (foreground) while it is open sends nothing', async () => {
    const handlers: ((s: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      handlers.push(handler as (s: AppStateStatus) => void);
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
    // The sweep sees the person's documents exactly as the server returns them.
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    jest.spyOn(processingService, 'listAutoReads').mockImplementation(() => supabaseProcessingService.listAutoReads());
    for (let i = 0; i < 5; i++) fake.respond('select', { data: [{ id: DOC_ID, status: 'completed', failure_kind: null, processing_attempts: 3 }], error: null });
    await renderWithAuth(<HomeScreen />);
    await openDocument(stored('completed'));
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        handlers.forEach((h) => h('active'));
        await readWaitingDocuments();
      });
    }
    expect(start).not.toHaveBeenCalled();
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });

  it('E. refreshing it (status reloaded after a check) sends nothing', async () => {
    const getDocument = jest.spyOn(documentsService, 'getDocument').mockResolvedValue(stored('completed'));
    const view = await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByTestId('read-report-ready')).toBeTruthy());
    await view.rerender(<DocumentViewerScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(getDocument.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(start).not.toHaveBeenCalled();
  });

  it('K. two screens loading the same completed report at once send nothing', async () => {
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue(stored('completed'));
    // Both mounted before either load resolves: their loads overlap.
    await renderWithAuth(<DocumentViewerScreen />);
    await renderWithAuth(<DocumentViewerScreen />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('a settled status the app doesn\'t treat as "waiting" (e.g. a deletion in progress) sends nothing', async () => {
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'not_started', awaitingRead: false });
    await openDocument(stored('completed'));
    expect(start).not.toHaveBeenCalled();
  });

  it('Read again is the only way to re-read it, and it is confirmed first', async () => {
    const { Alert } = jest.requireActual('react-native');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await openDocument(stored('completed'));
    await fireEvent.press(await screen.findByTestId('read-report-again'));
    expect(alert).toHaveBeenCalledWith('Read this report again?', expect.any(String), expect.any(Array));
    expect(start).not.toHaveBeenCalled(); // nothing until the person confirms
  });
});

describe('documents that genuinely wait to be read are still read — once', () => {
  it('F/G. a newly uploaded document is read when opened', async () => {
    jest.spyOn(processingService, 'getState').mockResolvedValueOnce({ phase: 'not_started' }).mockResolvedValue({ phase: 'processing' });
    await openDocument(stored('uploaded', { healthInfoCount: null }));
    await waitFor(() => expect(start).toHaveBeenCalledWith(DOC_ID, { retry: false, reprocess: false }));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('G. the background sweep reads a new upload (and never a completed one)', async () => {
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    jest.spyOn(processingService, 'listAutoReads').mockImplementation(() => supabaseProcessingService.listAutoReads());
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'processing' });
    fake.respond('select', {
      data: [
        { id: DOC_ID, status: 'uploaded', failure_kind: null, processing_attempts: 0 },
        { id: '55555555-5555-4555-8555-555555555555', status: 'completed', failure_kind: null, processing_attempts: 3 },
      ],
      error: null,
    });
    await readWaitingDocuments();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(DOC_ID, {});
  });

  it('H. a failed read can still be retried by the person', async () => {
    jest
      .spyOn(processingService, 'getState')
      .mockResolvedValueOnce({ phase: 'failed', reason: 'transient', message: 'Something went wrong.', canRetry: true })
      .mockResolvedValue({ phase: 'processing' });
    await openDocument(stored('failed', { healthInfoCount: null }));
    expect(start).not.toHaveBeenCalled(); // viewing a failed report doesn't retry it either
    await fireEvent.press(await screen.findByText('Retry'));
    await waitFor(() => expect(start).toHaveBeenCalledWith(DOC_ID, { retry: true, reprocess: false }));
  });

  it('K. two screens loading the same new upload start ONE processing run', async () => {
    // The server claims a document atomically: the first request starts the
    // run, any other while it runs is told "already_processing".
    let runs = 0;
    const invoke = jest.fn(async () => {
      if (runs === 0) {
        runs += 1;
        return { data: { status: 'processing' }, error: null };
      }
      return { data: null, error: { context: new Response(JSON.stringify({ error: 'already_processing' }), { status: 409 }) } };
    });
    const fake = createFakeSupabase();
    fake.functions.invoke = invoke as unknown as typeof fake.functions.invoke;
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    start.mockRestore();
    jest.spyOn(processingService, 'start').mockImplementation((id, options) => supabaseProcessingService.start(id, options));
    jest.spyOn(processingService, 'getState').mockResolvedValueOnce({ phase: 'not_started' }).mockResolvedValueOnce({ phase: 'not_started' }).mockResolvedValue({ phase: 'processing' });
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue(stored('uploaded', { healthInfoCount: null }));
    await renderWithAuth(<DocumentViewerScreen />);
    await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(runs).toBe(1);
    for (const call of invoke.mock.calls as unknown as [string, unknown][]) expect(call).toEqual(['process-document', { body: { document_id: DOC_ID } }]);
  });

  it('K. two requests made at the same moment share ONE call to the server', async () => {
    const { startReading } = jest.requireActual('../services/processing/processingService');
    let release: (v: 'processing') => void = () => {};
    start.mockImplementation(() => new Promise((r) => (release = r)));
    const both = Promise.all([startReading(DOC_ID), startReading(DOC_ID)]);
    release('processing');
    await expect(both).resolves.toEqual(['processing', 'processing']);
    expect(start).toHaveBeenCalledTimes(1);
  });
});
