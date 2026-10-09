/**
 * Gate 1 — extraction is not proof of ownership. When the server couldn't
 * establish that a report belongs to the person (no identifiers on it, or
 * only weak identity evidence), every result is held for review: the app
 * says so plainly, offers Identity details, never shows them as added, and
 * viewing the report still never reads it again. Synthetic ids only.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import DocumentViewerScreen from '../app/documents/[id]';
import { consentService } from '../services/consent/consentService';
import {
  ADDED_PRESENTATION,
  HELD_FOR_REVIEW_PRESENTATION,
  IDENTITY_UNCONFIRMED_PRESENTATION,
  NEEDS_REVIEW_PRESENTATION,
  NO_HEALTH_INFO_PRESENTATION,
  documentsService,
  presentDocumentStatus,
} from '../services/documents/documentsService';
import { rowToStoredDocument } from '../services/documents/supabaseDocumentsService';
import { healthService } from '../services/health/healthService';
import { ReadReportPanel } from '../components/ReadReportPanel';
import { processingService, toProcessingState } from '../services/processing/processingService';
import { renderWithProviders } from './testUtils';
import type { StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(() => null), isSupabaseConfigured: false }));

const DOC_ID = '55555555-5555-4555-8555-555555555555';

function stored(extra: Partial<StoredDocument> = {}): StoredDocument {
  const at = '2026-10-09T10:00:00.000Z';
  return {
    id: DOC_ID, userId: 'user-1', source: 'upload', documentType: 'unclassified', originalFilename: 'Synthetic report.pdf',
    mimeType: 'application/pdf', fileSizeBytes: 2048, storagePath: `user-1/documents/${DOC_ID}/original.pdf`,
    status: 'completed', processingError: null, uploadedAt: at, createdAt: at, updatedAt: at, ...extra,
  };
}

describe('document status reflects whether ownership was established', () => {
  const held = { status: 'completed' as const, healthInfoCount: 0, heldForReviewCount: 4 };

  it('no identifiers or weak identity: "Needs review", explained as an identity question', () => {
    expect(presentDocumentStatus({ ...held, identityCheck: 'no_identifiers' })).toBe(IDENTITY_UNCONFIRMED_PRESENTATION);
    expect(presentDocumentStatus({ ...held, identityCheck: 'unverifiable' })).toBe(IDENTITY_UNCONFIRMED_PRESENTATION);
    expect(IDENTITY_UNCONFIRMED_PRESENTATION.label).toBe('Needs review');
    expect(IDENTITY_UNCONFIRMED_PRESENTATION.description).toMatch(/couldn’t confirm this report is yours/);
    expect(IDENTITY_UNCONFIRMED_PRESENTATION.description).toMatch(/aren’t in your Health Memory yet/);
  });

  it('identity confirmed but some results uncertain: the general held-for-review message', () => {
    expect(presentDocumentStatus({ ...held, identityCheck: 'consistent' })).toBe(HELD_FOR_REVIEW_PRESENTATION);
    expect(presentDocumentStatus({ ...held, identityCheck: null })).toBe(HELD_FOR_REVIEW_PRESENTATION);
  });

  it('never "added" or "nothing found" when results are held; mismatch still adds nothing', () => {
    for (const identityCheck of ['no_identifiers', 'unverifiable', 'consistent']) {
      const p = presentDocumentStatus({ ...held, identityCheck });
      expect(p).not.toBe(ADDED_PRESENTATION);
      expect(p).not.toBe(NO_HEALTH_INFO_PRESENTATION);
    }
    expect(presentDocumentStatus({ status: 'failed', failureKind: 'identity_mismatch', identityCheck: 'mismatch' })).toBe(NEEDS_REVIEW_PRESENTATION);
    // Trusted results present: added, whatever else is held.
    expect(presentDocumentStatus({ status: 'completed', healthInfoCount: 3, heldForReviewCount: 1, identityCheck: 'consistent' })).toBe(ADDED_PRESENTATION);
  });

  it('the server’s identity result is carried from the document row', () => {
    const row = {
      id: DOC_ID, user_id: 'user-1', source: 'upload', document_type: 'unclassified', original_filename: 'a.pdf',
      mime_type: 'application/pdf', file_size_bytes: 10, storage_path: 'p', status: 'completed', processing_error: null,
      failure_kind: null, identity_check: 'unverifiable', uploaded_at: null, created_at: 'x', updated_at: 'x',
    };
    expect(rowToStoredDocument(row as never).identityCheck).toBe('unverifiable');
    expect(rowToStoredDocument({ ...row, identity_check: undefined } as never).identityCheck).toBeNull();
  });
});

describe('the report page for an identity-uncertain report', () => {
  let start: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: DOC_ID });
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue({ granted: true, version: 'ai-2026-11', recordedAt: '2026-10-01T00:00:00Z' });
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'ready', resultsAdded: 0, needsReview: 2, alreadyInMemory: 0 });
    start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(healthService, 'getDocumentObservations').mockResolvedValue([
      {
        id: 'o1', name: 'HbA1c', value: '5.8', unit: '%', referenceRange: '4.0 - 5.6', date: '2026-03-12', needsReview: true,
        valueNumeric: 5.8, referenceLow: 4, referenceHigh: 5.6, category: 'laboratory', abnormalFlag: null,
        source: { documentId: DOC_ID, documentName: 'Synthetic report.pdf', pageNumber: 1 },
      },
    ]);
  });

  async function open(doc: StoredDocument) {
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue(doc);
    await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByTestId('delete-document')).toBeTruthy());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
  }

  it('explains why, offers Identity details, marks each result unchecked, and reads nothing again', async () => {
    await open(stored({ healthInfoCount: 0, heldForReviewCount: 2, identityCheck: 'no_identifiers' }));
    expect(screen.getByText(/couldn’t confirm this report is yours/)).toBeTruthy();
    expect(screen.getByTestId('identity-held-hint')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Not yet checked')).toBeTruthy());
    expect(screen.getByText(/Page 1/)).toBeTruthy();
    expect(screen.queryByText('Added to Health Memory')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('identity-held-add'));
    });
    expect(router.push).toHaveBeenCalledWith('/profile/identity');
    expect(start).not.toHaveBeenCalled();
  });

  it('a report whose owner was confirmed shows no identity prompt', async () => {
    await open(stored({ healthInfoCount: 4, heldForReviewCount: 0, identityCheck: 'consistent' }));
    expect(screen.queryByTestId('identity-held-hint')).toBeNull();
    expect(screen.queryByTestId('identity-held-add')).toBeNull();
  });
});

describe('the read summary gives the real reason results are held', () => {
  const run = { facts_written: 2, facts_needs_review: 2, facts_duplicate: 0 };
  const row = (identity_check: string | null) => ({ status: 'completed', failure_kind: null, processing_error: null, processing_attempts: 1, identity_check });

  it('marks identity-held reads, and only those', () => {
    expect(toProcessingState(row('no_identifiers'), run)).toMatchObject({ phase: 'ready', needsReview: 2, identityUnconfirmed: true });
    expect(toProcessingState(row('unverifiable'), run)).toMatchObject({ identityUnconfirmed: true });
    expect(toProcessingState(row('consistent'), run)).not.toHaveProperty('identityUnconfirmed');
    expect(toProcessingState(row(null), run)).not.toHaveProperty('identityUnconfirmed');
  });

  const panel = (identityUnconfirmed?: boolean) =>
    renderWithProviders(
      <ReadReportPanel
        view={{ kind: 'state', state: { phase: 'ready', resultsAdded: 0, needsReview: 2, alreadyInMemory: 0, ...(identityUnconfirmed ? { identityUnconfirmed } : {}) } } as never}
        onAllow={jest.fn()}
        onDecline={jest.fn()}
        onRead={jest.fn()}
      />
    );

  it('identity: says ownership couldn’t be confirmed — not that it was unclear', async () => {
    await panel(true);
    expect(screen.getByText('2 held back until checked (we couldn’t confirm this report is yours)')).toBeTruthy();
    expect(screen.queryByText(/not clear enough/)).toBeNull();
  });

  it('uncertain reading: keeps the clarity reason', async () => {
    await panel();
    expect(screen.getByText('2 held back until checked (not clear enough to use yet)')).toBeTruthy();
  });
});

describe('"may belong to someone else" is said once on the report page', () => {
  const view = { kind: 'state', state: { phase: 'needs_review', message: 'This report may belong to someone else.' } } as never;

  it('the report page (status card already says it): no second card', async () => {
    await renderWithProviders(<ReadReportPanel view={view} onAllow={jest.fn()} onDecline={jest.fn()} onRead={jest.fn()} compactReady />);
    expect(screen.queryByTestId('read-report-needs-review')).toBeNull();
  });

  it('the upload result screen (no status card): still explains it', async () => {
    await renderWithProviders(<ReadReportPanel view={view} onAllow={jest.fn()} onDecline={jest.fn()} onRead={jest.fn()} />);
    expect(screen.getByTestId('read-report-needs-review')).toBeTruthy();
    expect(screen.getByText(/Check the original to see whose report it is/)).toBeTruthy();
  });

  it('the report page still states it once, via the status card', async () => {
    jest.restoreAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: DOC_ID });
    jest.spyOn(consentService, 'getAiConsent').mockResolvedValue({ granted: true, version: 'ai-2026-11', recordedAt: '2026-10-01T00:00:00Z' });
    jest.spyOn(processingService, 'getState').mockResolvedValue({ phase: 'needs_review', message: 'This report may belong to someone else.' });
    const start = jest.spyOn(processingService, 'start').mockResolvedValue('processing');
    jest.spyOn(healthService, 'getDocumentObservations').mockResolvedValue([]);
    jest.spyOn(documentsService, 'getDocument').mockResolvedValue(stored({ status: 'failed', failureKind: 'identity_mismatch', identityCheck: 'mismatch' }));
    await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByTestId('delete-document')).toBeTruthy());
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(screen.getAllByText(/may belong to someone else/)).toHaveLength(1);
    expect(start).not.toHaveBeenCalled();
  });
});
