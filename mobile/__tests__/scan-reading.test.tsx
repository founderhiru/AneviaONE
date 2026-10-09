/**
 * Photos and scans are read like PDFs (the server transcribes their pages),
 * and a completed report can be read again. Consent now names what is sent:
 * the report's text, or images of its pages for photos and scans.
 */
import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import AddRecordScreen from '../app/add/index';
import DocumentViewerScreen from '../app/documents/[id]';
import { AI_CONSENT_COPY, AI_CONSENT_VERSION, consentService } from '../services/consent/consentService';
import { documentsService } from '../services/documents/documentsService';
import { readLocalFile } from '../services/documents/fileAccess';
import { healthService } from '../services/health/healthService';
import { processingService, supabaseProcessingService } from '../services/processing/processingService';
import { getSupabaseClient } from '../services/supabaseClient';
import { createFakeSupabase, pdfBytes } from '../test-support/fakeSupabase';
import type { StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../services/documents/fileAccess', () => ({ readLocalFile: jest.fn() }));
jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(() => null), isSupabaseConfigured: false }));

const DOC_ID = '44444444-4444-4444-8444-444444444444';
const stored = (overrides: Partial<StoredDocument> = {}): StoredDocument => ({
  id: DOC_ID,
  userId: 'u',
  source: 'camera',
  documentType: 'unclassified',
  originalFilename: 'Scan 7 Oct.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 2048,
  storagePath: `u/documents/${DOC_ID}/original.pdf`,
  status: 'uploaded',
  processingError: null,
  uploadedAt: '2026-10-07T10:00:05Z',
  createdAt: '2026-10-07T10:00:00Z',
  updatedAt: '2026-10-07T10:00:05Z',
  ...overrides,
});

const CONSENTED = { granted: true, version: AI_CONSENT_VERSION, recordedAt: 'x' };

beforeEach(() => {
  jest.restoreAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void) => {
    React.useEffect(effect, [effect]);
  });
  (readLocalFile as jest.Mock).mockResolvedValue(pdfBytes());
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/scan.pdf', name: 'Scan 7 Oct.pdf', mimeType: 'application/pdf', size: 2048 }],
  });
});

describe('consent names what is sent', () => {
  it('is a new version that covers page images for photos and scans', () => {
    expect(AI_CONSENT_VERSION).toBe('ai-2026-11');
    const text = AI_CONSENT_COPY.points.join(' ');
    expect(text).toMatch(/images of its pages/);
    expect(text).not.toMatch(/not the PDF file/);
  });
});

describe('a camera scan is read automatically, like a PDF', () => {
  it('starts reading after upload, with no "isn’t available" message', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(processingService, 'getState').mockResolvedValueOnce({ phase: 'not_started' }).mockResolvedValue({ phase: 'processing' });
    jest.spyOn(documentsService, 'uploadDocument').mockResolvedValue({ document: stored() });
    await renderWithAuth(<AddRecordScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Upload PDF'));
    });
    await waitFor(() => expect(start).toHaveBeenCalledWith(DOC_ID, { retry: false, reprocess: false }));
    expect(screen.queryByText(/isn’t available yet/)).toBeNull();
  });

  it('an unreadable scan shows the honest failure, never a result', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest
      .spyOn(processingService, 'getState')
      .mockResolvedValueOnce({ phase: 'not_started' })
      .mockResolvedValue({ phase: 'failed', reason: 'unsupported', message: 'This photo or scan couldn’t be read clearly.', canRetry: false });
    jest.spyOn(documentsService, 'uploadDocument').mockResolvedValue({ document: stored() });
    await renderWithAuth(<AddRecordScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Upload PDF'));
    });
    await waitFor(() => expect(screen.getByText(/couldn’t be read clearly/)).toBeTruthy(), { timeout: 6000 });
    expect(screen.queryByText(/added to your Health Memory/)).toBeNull();
  }, 10000);
});

describe('Read again', () => {
  async function openCompleted() {
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue(stored({ source: 'upload', status: 'completed' }));
    jest.spyOn(healthService, 'getDocumentObservations').mockResolvedValue([]);
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'ready', resultsAdded: 0, needsReview: 0, alreadyInMemory: 0 });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: DOC_ID });
    await renderWithAuth(<DocumentViewerScreen />);
    return screen.findByTestId('read-report-again');
  }

  /** The confirmation shown before a re-read; answers it with `choice`. */
  const confirmWith = (choice: 'Cancel' | 'Read again') =>
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons?: AlertButton[]) => {
      buttons?.find((b) => b.text === choice)?.onPress?.();
    });

  it('a completed report offers Read again — confirmed first, then the server re-reads it', async () => {
    const alert = confirmWith('Read again');
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    await fireEvent.press(await openCompleted());
    expect(alert).toHaveBeenCalledWith(
      'Read this report again?',
      'We’ll read the original again. The results from this report in your Health Memory will be replaced by the new reading.',
      [expect.objectContaining({ text: 'Cancel', style: 'cancel' }), expect.objectContaining({ text: 'Read again' })],
    );
    await waitFor(() => expect(start).toHaveBeenCalledWith(DOC_ID, { retry: false, reprocess: true }));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('a single tap is not enough: Cancel on the confirmation re-reads nothing', async () => {
    confirmWith('Cancel');
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue(CONSENTED);
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    await fireEvent.press(await openCompleted());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('without current consent, Read again asks first — and Allow then re-reads (not just reopens)', async () => {
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue({ granted: false, version: null, recordedAt: null });
    jest.spyOn(consentService, 'grantAiConsent').mockResolvedValue();
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    confirmWith('Read again');
    await fireEvent.press(await openCompleted());
    expect(start).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByText(AI_CONSENT_COPY.allow));
    expect(start).toHaveBeenCalledWith(DOC_ID, { retry: false, reprocess: true });
  });

  it('the request names a re-read only when asked', async () => {
    const fake = createFakeSupabase();
    fake.functions.invoke.mockResolvedValue({ data: { status: 'processing' }, error: null });
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    await supabaseProcessingService.start(DOC_ID, { reprocess: true });
    await supabaseProcessingService.start(DOC_ID);
    expect(fake.functions.invoke).toHaveBeenNthCalledWith(1, 'process-document', { body: { document_id: DOC_ID, operation: 'reread', reprocess: true } });
    expect(fake.functions.invoke).toHaveBeenNthCalledWith(2, 'process-document', { body: { document_id: DOC_ID } });
  });
});
