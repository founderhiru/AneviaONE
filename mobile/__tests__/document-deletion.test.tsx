/**
 * Phase B — deleting a document. The production service only asks the
 * server (delete-document) to delete by id — ownership, the file location and
 * the health records are the server's business — and never reports success
 * early. The document screen keeps Delete apart, behind a confirmation, and
 * shows a failure without leaving the document.
 */
import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import MyDocumentsScreen from '../app/documents/index';
import DocumentViewerScreen from '../app/documents/[id]';
import { demoDocumentsService } from '../services/documents/demoDocumentsService';
import { documentsService, hasStoredOriginal, presentDocumentStatus } from '../services/documents/documentsService';
import { supabaseDocumentsService } from '../services/documents/supabaseDocumentsService';
import { onHealthMemoryChanged } from '../services/health/healthMemoryApi';
import { ServiceError } from '../services/serviceError';
import { getSupabaseClient } from '../services/supabaseClient';
import type { StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));

const DOC_ID = '33333333-3333-4333-8333-333333333333';

function storedDoc(overrides: Partial<StoredDocument> = {}): StoredDocument {
  const at = '2026-10-07T10:00:00.000Z';
  return {
    id: DOC_ID,
    userId: 'user-1',
    source: 'upload',
    documentType: 'unclassified',
    originalFilename: 'Lab report.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 2048,
    storagePath: `user-1/documents/${DOC_ID}/original.pdf`,
    status: 'completed',
    processingError: null,
    healthInfoCount: 2,
    uploadedAt: at,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function fakeClient(invoke: jest.Mock) {
  const { createFakeSupabase } = jest.requireActual('../test-support/fakeSupabase');
  const fake = createFakeSupabase();
  fake.functions.invoke = invoke;
  (getSupabaseClient as jest.Mock).mockReturnValue(fake);
  return fake;
}

const httpFailure = (status: number, error: string) => ({ data: null, error: { context: new Response(JSON.stringify({ error }), { status }) } });

beforeEach(() => {
  jest.restoreAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: DOC_ID });
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void) => {
    React.useEffect(effect, [effect]);
  });
});

// ------------------------------------------------------------ service --

describe('production deleteDocument', () => {
  it('asks the server to delete by id only, then refreshes Health Memory', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { document_id: DOC_ID, status: 'deleted' }, error: null });
    fakeClient(invoke);
    const refreshed = jest.fn();
    const unsubscribe = onHealthMemoryChanged(refreshed);
    await supabaseDocumentsService.deleteDocument(DOC_ID);
    expect(invoke).toHaveBeenCalledWith('delete-document', { body: { document_id: DOC_ID } });
    expect(refreshed).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('a bad id never reaches the server', async () => {
    const invoke = jest.fn();
    fakeClient(invoke);
    await expect(supabaseDocumentsService.deleteDocument('../../etc')).rejects.toMatchObject({ code: 'not_found' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('failures are never reported as success, and Health Memory is not refreshed', async () => {
    const refreshed = jest.fn();
    const unsubscribe = onHealthMemoryChanged(refreshed);
    const cases: [ReturnType<typeof httpFailure>, Partial<ServiceError>][] = [
      [httpFailure(404, 'not_found'), { code: 'not_found' }],
      [httpFailure(401, 'unauthenticated'), { code: 'not_signed_in' }],
      [httpFailure(409, 'document_busy'), { code: 'not_available', userMessage: 'This report is being read right now. Try deleting it again in a moment.' }],
      [httpFailure(502, 'storage_delete_failed'), { code: 'unknown', retryable: true, userMessage: 'We couldn’t delete this report. It hasn’t been removed — please try again.' }],
      [httpFailure(500, 'delete_failed'), { code: 'unknown', retryable: true }],
    ];
    for (const [response, expected] of cases) {
      fakeClient(jest.fn().mockResolvedValue(response));
      await expect(supabaseDocumentsService.deleteDocument(DOC_ID)).rejects.toMatchObject(expected);
    }
    expect(refreshed).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('not signed in: nothing is sent', async () => {
    const { createFakeSupabase } = jest.requireActual('../test-support/fakeSupabase');
    const fake = createFakeSupabase({ userId: null });
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    await expect(supabaseDocumentsService.deleteDocument(DOC_ID)).rejects.toMatchObject({ code: 'not_signed_in' });
    expect(fake.functions.invoke).not.toHaveBeenCalled();
  });
});

describe('statuses', () => {
  it('a deletion that did not finish is shown truthfully, and its original is not offered', () => {
    expect(presentDocumentStatus({ status: 'deleting' })).toMatchObject({ label: 'Deletion not finished', tone: 'warning' });
    expect(hasStoredOriginal('deleting')).toBe(false);
  });

  it('demo: deleting an unknown document is refused, not silently "done"', async () => {
    await expect(demoDocumentsService.deleteDocument(DOC_ID)).rejects.toMatchObject({ code: 'not_found' });
  });
});

// ------------------------------------------------------------- screens --

function confirmWith(choice: 'Cancel' | 'Delete') {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.text === choice)?.onPress?.();
  });
}

async function openDocument(doc = storedDoc()) {
  jest.spyOn(documentsService, 'getDocument').mockResolvedValue(doc);
  await renderWithAuth(<DocumentViewerScreen />);
  await waitFor(() => expect(screen.getByTestId('delete-document')).toBeTruthy());
}

describe('document screen — Delete', () => {
  it('asks first, with the exact wording', async () => {
    const alert = confirmWith('Cancel');
    const remove = jest.spyOn(documentsService, 'deleteDocument');
    await openDocument();
    await act(async () => {
      fireEvent.press(screen.getByTestId('delete-document'));
    });
    expect(alert).toHaveBeenCalledWith(
      'Delete this health record?',
      'This will remove the uploaded document and the health information extracted from it.\n\nThis action can’t be undone.',
      [expect.objectContaining({ text: 'Cancel', style: 'cancel' }), expect.objectContaining({ text: 'Delete', style: 'destructive' })],
    );
    expect(remove).not.toHaveBeenCalled(); // Cancel deletes nothing
  });

  it('Delete: deleted on the server, then back to My documents with a confirmation', async () => {
    confirmWith('Delete');
    const remove = jest.spyOn(documentsService, 'deleteDocument').mockResolvedValue();
    await openDocument();
    await act(async () => {
      fireEvent.press(screen.getByTestId('delete-document'));
    });
    expect(remove).toHaveBeenCalledWith(DOC_ID);
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/documents', params: { deleted: '1' } });
  });

  it('a failure keeps the document on screen with an actionable message', async () => {
    confirmWith('Delete');
    jest
      .spyOn(documentsService, 'deleteDocument')
      .mockRejectedValue(new ServiceError('unknown', 'We couldn’t delete this report. It hasn’t been removed — please try again.', { retryable: true }));
    await openDocument();
    await act(async () => {
      fireEvent.press(screen.getByTestId('delete-document'));
    });
    await waitFor(() => expect(screen.getByTestId('delete-error')).toBeTruthy());
    expect(screen.getByText('We couldn’t delete this report. It hasn’t been removed — please try again.')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByText('Lab report.pdf')).toBeTruthy();
    expect(screen.getByText('Delete document')).toBeTruthy(); // can try again
  });

  it('a document whose deletion did not finish says so and can be deleted again', async () => {
    await openDocument(storedDoc({ status: 'deleting' }));
    expect(screen.getByText('Deletion not finished')).toBeTruthy();
    expect(screen.queryByLabelText('View original document')).toBeNull();
    expect(screen.getByText('Delete document')).toBeTruthy();
  });
});

describe('My documents', () => {
  it('Delete is not offered on the list (no accidental taps)', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([storedDoc()]);
    await renderWithAuth(<MyDocumentsScreen />);
    await waitFor(() => expect(screen.getByText('Lab report.pdf')).toBeTruthy());
    expect(screen.queryByTestId('delete-document')).toBeNull();
    expect(screen.queryByText(/Delete/)).toBeNull();
    expect(screen.queryByTestId('document-deleted-notice')).toBeNull();
  });

  it('after deleting: a clear confirmation, and the list no longer has it', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ deleted: '1' });
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([]);
    await renderWithAuth(<MyDocumentsScreen />);
    await waitFor(() => expect(screen.getByTestId('document-deleted-notice')).toBeTruthy());
    expect(screen.getByText('Health record deleted.')).toBeTruthy();
    expect(screen.queryByText('Lab report.pdf')).toBeNull();
  });
});
