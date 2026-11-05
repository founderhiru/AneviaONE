/**
 * Timeline > Documents: every stored report lives here (Home no longer lists
 * recent documents). Same list and rows as My documents.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import TimelineScreen from '../app/(tabs)/timeline';
import { documentsService } from '../services/documents/documentsService';
import type { StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

const at = '2026-10-06T09:00:00.000Z';
const doc = (id: string): StoredDocument => ({
  id, userId: 'user-1', source: 'upload', documentType: 'unclassified', originalFilename: `${id}.pdf`, mimeType: 'application/pdf',
  fileSizeBytes: 1000, storagePath: `user-1/documents/${id}/original.pdf`, status: 'completed', processingError: null,
  healthInfoCount: 6, uploadedAt: at, createdAt: at, updatedAt: at,
});

afterEach(() => jest.restoreAllMocks());

describe('Timeline > Documents', () => {
  it('opens on Events, and the Documents segment lists every stored report', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc('d1'), doc('d2'), doc('d3'), doc('d4')]);
    await renderWithAuth(<TimelineScreen />);
    await waitFor(() => expect(screen.getByText('Health Timeline')).toBeTruthy());
    expect(screen.queryByTestId('timeline-documents')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('timeline-segment-documents'));
    });
    expect(await screen.findByTestId('timeline-documents')).toBeTruthy();
    for (const id of ['d1', 'd2', 'd3', 'd4']) expect(screen.getByTestId(`stored-document-${id}`)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('d2.pdf'));
    });
    expect(router.push).toHaveBeenCalledWith('/documents/d2');
  });

  it('with no documents it says so and offers Add Health Record', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([]);
    await renderWithAuth(<TimelineScreen />);
    await act(async () => {
      fireEvent.press(await screen.findByTestId('timeline-segment-documents'));
    });
    expect(await screen.findByText('No documents yet')).toBeTruthy();
  });
});
