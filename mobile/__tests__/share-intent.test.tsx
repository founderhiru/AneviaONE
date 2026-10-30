/**
 * "Share to AneviaONE": a PDF shared from WhatsApp, Gmail or Files opens Add
 * Record with it. Only one PDF at a time; anything else is explained. Sharing
 * alone never uploads or reads anything.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ShareIntentHandler } from '../components/ShareIntentHandler';
import { hasPendingSharedFile, pickedFileFromShare, takePendingSharedFile } from '../navigation/sharedFile';
import { authService } from '../services/auth/authService';
import type { User } from '../types';
import { renderWithAuth } from './testUtils';

const { __setShareIntentForTests } = require('expo-share-intent');

const readyUser: User = {
  id: 'user-1', email: 'priya@example.com', createdAt: '2026-09-29T10:00:00Z', onboardingComplete: true,
  identityOnboardingComplete: true, identityUploadPromptSeen: true, linkedIdentities: [],
};

const pdf = { path: 'file:///inbox/Blood%20report.pdf', fileName: 'Blood report.pdf', mimeType: 'application/pdf', size: 52000 };

afterEach(() => {
  __setShareIntentForTests(null);
  takePendingSharedFile();
  jest.restoreAllMocks();
});

describe('pickedFileFromShare', () => {
  it('accepts exactly one PDF and keeps its name', () => {
    expect(pickedFileFromShare([pdf])).toEqual({ ok: true, file: { uri: pdf.path, name: 'Blood report.pdf', mimeType: 'application/pdf', size: 52000, source: 'upload' } });
  });
  it('recognises a PDF by its extension when the mime type is generic', () => {
    expect(pickedFileFromShare([{ ...pdf, mimeType: 'application/octet-stream' }]).ok).toBe(true);
  });
  it('explains anything else instead of dropping it silently', () => {
    expect(pickedFileFromShare([])).toMatchObject({ ok: false });
    expect(pickedFileFromShare([pdf, pdf])).toEqual({ ok: false, message: 'Please share one report at a time.' });
    expect(pickedFileFromShare([{ path: 'file:///x.jpg', fileName: 'x.jpg', mimeType: 'image/jpeg' }])).toEqual({ ok: false, message: 'Only PDF reports can be added from Share for now.' });
  });
});

describe('ShareIntentHandler', () => {
  beforeEach(() => {
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(readyUser);
  });

  it('a shared PDF opens Add Record once the person is signed in and set up', async () => {
    __setShareIntentForTests({ hasShareIntent: true, shareIntent: { files: [pdf] } });
    await renderWithAuth(<ShareIntentHandler />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/add'));
    expect(takePendingSharedFile()).toMatchObject({ name: 'Blood report.pdf', source: 'upload' });
  });

  it('a share that is not a PDF shows a message and goes nowhere', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    __setShareIntentForTests({ hasShareIntent: true, shareIntent: { files: [{ path: 'file:///a.docx', fileName: 'a.docx', mimeType: 'application/msword' }] } });
    await renderWithAuth(<ShareIntentHandler />);
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Can’t add this', 'Only PDF reports can be added from Share for now.'));
    expect(hasPendingSharedFile()).toBe(false);
    expect(router.push).not.toHaveBeenCalledWith('/add');
  });

  it('a share received before sign-in waits and is not opened', async () => {
    (authService.getCurrentUser as jest.Mock).mockResolvedValue(null);
    __setShareIntentForTests({ hasShareIntent: true, shareIntent: { files: [pdf] } });
    await renderWithAuth(<ShareIntentHandler />);
    await act(async () => {});
    expect(hasPendingSharedFile()).toBe(true);
    expect(router.push).not.toHaveBeenCalledWith('/add');
  });

  it('with nothing shared, it does nothing', async () => {
    await renderWithAuth(<ShareIntentHandler />);
    await act(async () => {});
    expect(router.push).not.toHaveBeenCalledWith('/add');
  });
});

describe('Add Record with a shared PDF', () => {
  it('uploads the shared file through the normal path, once', async () => {
    const AddRecordScreen = require('../app/add/index').default;
    const { documentsService } = require('../services/documents/documentsService');
    const upload = jest.spyOn(documentsService, 'uploadDocument').mockResolvedValue({
      document: { id: 'd1', userId: 'u', source: 'upload', documentType: 'unclassified', originalFilename: 'Blood report.pdf', mimeType: 'application/pdf', fileSizeBytes: 52000,
        storagePath: 'u/d1.pdf', status: 'uploaded', processingError: null, uploadedAt: 'x', createdAt: 'x', updatedAt: 'x' },
    });
    const { setPendingSharedFile } = require('../navigation/sharedFile');
    setPendingSharedFile({ uri: pdf.path, name: 'Blood report.pdf', mimeType: 'application/pdf', size: 52000, source: 'upload' });
    await renderWithAuth(<AddRecordScreen />);
    await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.objectContaining({ uri: pdf.path, name: 'Blood report.pdf' }), expect.any(Function)));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(hasPendingSharedFile()).toBe(false);
  });
});
