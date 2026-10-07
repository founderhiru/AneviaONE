/**
 * Add Record (main's UI on the new document service), My documents and the
 * document viewer (real vs sample records). Runs in demo mode; the
 * "no processing summary" production result is exercised by stubbing the
 * service's result.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as WebBrowser from 'expo-web-browser';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import AddRecordScreen from '../app/add/index';
import MyDocumentsScreen from '../app/documents/index';
import DocumentViewerScreen from '../app/documents/[id]';
import { documentsService } from '../services/documents/documentsService';
import { readLocalFile } from '../services/documents/fileAccess';
import { ServiceError } from '../services/serviceError';
import { pdfBytes } from '../test-support/fakeSupabase';
import { renderWithAuth } from './testUtils';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('../services/documents/fileAccess', () => ({ readLocalFile: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/print.pdf', numberOfPages: 1 })) }));

/** A photographed page as the image picker returns it (base64 JPEG). */
function photo() {
  return { uri: 'file:///cache/photo.jpg', width: 1200, height: 1600, base64: 'cGhvdG8=' };
}

function pick(asset: Partial<DocumentPicker.DocumentPickerAsset> = {}) {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/report.pdf', name: 'report.pdf', mimeType: 'application/pdf', size: 2048, ...asset }],
  });
}

async function pressUpload() {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Upload PDF'));
  });
}

beforeEach(() => {
  jest.restoreAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void) => {
    React.useEffect(effect, [effect]);
  });
  (readLocalFile as jest.Mock).mockResolvedValue(pdfBytes());
  (Print.printToFileAsync as jest.Mock).mockResolvedValue({ uri: 'file:///cache/print.pdf', numberOfPages: 1 });
});

describe('Add Record', () => {
  it('demo: uploads a PDF and shows main’s success screen with the sample-derived counts', async () => {
    pick({ name: 'Blood Test Sept.pdf' });
    await renderWithAuth(<AddRecordScreen />);
    await pressUpload();

    await waitFor(() => expect(screen.getByText('Added to Health Memory')).toBeTruthy());
    expect(screen.getByText('Blood Test Sept.pdf')).toBeTruthy();
    expect(screen.getByText(/health observation/)).toBeTruthy();
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: ['application/pdf'] }));
    await fireEvent.press(screen.getByText('See what changed →'));
    expect(router.replace).toHaveBeenCalledWith('/changes');
  });

  it('without a processing summary: honest "Stored securely", no invented counts, and asks before reading', async () => {
    pick({ name: 'lab.pdf' });
    const stored = {
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'u',
      source: 'upload' as const,
      documentType: 'unclassified' as const,
      originalFilename: 'lab.pdf',
      mimeType: 'application/pdf' as const,
      fileSizeBytes: 2048,
      storagePath: 'u/documents/22222222-2222-4222-8222-222222222222/original.pdf',
      status: 'uploaded' as const,
      processingError: null,
      uploadedAt: '2026-09-29T10:00:05Z',
      createdAt: '2026-09-29T10:00:00Z',
      updatedAt: '2026-09-29T10:00:05Z',
    };
    jest.spyOn(documentsService, 'uploadDocument').mockResolvedValue({ document: stored });
    await renderWithAuth(<AddRecordScreen />);
    await pressUpload();

    await waitFor(() => expect(screen.getByText('Stored securely')).toBeTruthy());
    expect(screen.queryByText('Added to Health Memory')).toBeNull();
    expect(screen.queryByText(/health observation/)).toBeNull();
    expect(screen.queryByText('See what changed →')).toBeNull();
    // A real PDF is only read after explicit consent (none recorded yet).
    await waitFor(() => expect(screen.getByText('Read this report for you?')).toBeTruthy());
    await fireEvent.press(screen.getByText('View document'));
    expect(router.replace).toHaveBeenCalledWith(`/documents/${stored.id}`);
  });

  it('shows invalid-file errors and lets the user choose another file', async () => {
    pick({ name: 'renamed.pdf' });
    (readLocalFile as jest.Mock).mockResolvedValue(new TextEncoder().encode('not a pdf').buffer);
    await renderWithAuth(<AddRecordScreen />);
    await pressUpload();

    await waitFor(() => expect(screen.getByText('Upload didn’t finish')).toBeTruthy());
    expect(screen.getByText('This file isn’t a valid PDF. Please choose another file.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Choose another file'));
    expect(screen.getByLabelText('Upload PDF')).toBeTruthy();
  });

  it('shows a retryable upload/network failure with Try again', async () => {
    pick();
    const upload = jest
      .spyOn(documentsService, 'uploadDocument')
      .mockRejectedValueOnce(new ServiceError('network', 'You appear to be offline. Check your connection and try again.', { retryable: true }));
    await renderWithAuth(<AddRecordScreen />);
    await pressUpload();

    await waitFor(() => expect(screen.getByText('You appear to be offline. Check your connection and try again.')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'));
    });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('shows auth and not-configured failures without a retry', async () => {
    pick();
    jest
      .spyOn(documentsService, 'uploadDocument')
      .mockRejectedValueOnce(new ServiceError('not_configured', 'Document storage isn’t available right now.'));
    await renderWithAuth(<AddRecordScreen />);
    await pressUpload();
    await waitFor(() => expect(screen.getByText('Document storage isn’t available right now.')).toBeTruthy());
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('does nothing when the picker is cancelled', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    await renderWithAuth(<AddRecordScreen />);
    await pressUpload();
    expect(screen.getByLabelText('Upload PDF')).toBeTruthy();
    expect(readLocalFile).not.toHaveBeenCalled();
  });

  it('offers the four ways to add a health record', async () => {
    await renderWithAuth(<AddRecordScreen />);
    for (const label of ['Upload PDF', 'Take Photo', 'Choose Photo', 'Scan Document']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('Take Photo turns the photo into a PDF and stores it through the same upload, recorded as a camera capture', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [photo()] });
    const upload = jest.spyOn(documentsService, 'uploadDocument');
    await renderWithAuth(<AddRecordScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Take Photo'));
    });

    await waitFor(() => expect(screen.getByText('Added to Health Memory')).toBeTruthy());
    expect(Print.printToFileAsync).toHaveBeenCalledTimes(1);
    expect((Print.printToFileAsync as jest.Mock).mock.calls[0][0].html).toContain('data:image/jpeg;base64,cGhvdG8=');
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///cache/print.pdf', mimeType: 'application/pdf', source: 'camera', name: expect.stringMatching(/^Photo record .*\.pdf$/) }),
      expect.any(Function)
    );
  });

  it('Scan Document photographs page after page into one PDF', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [photo()] });
    // First prompt: "Add page"; second: "Done".
    let prompts = 0;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      prompts += 1;
      buttons?.find((b) => b.text === (prompts === 1 ? 'Add page' : 'Done'))?.onPress?.();
    });
    await renderWithAuth(<AddRecordScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Scan Document'));
    });

    await waitFor(() => expect(screen.getByText('Added to Health Memory')).toBeTruthy());
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledTimes(2);
    const html: string = (Print.printToFileAsync as jest.Mock).mock.calls[0][0].html;
    expect(html.match(/<img /g)).toHaveLength(2);
  });

  it('Choose Photo uses the photo library; cancelling changes nothing', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    await renderWithAuth(<AddRecordScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Choose Photo'));
    });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: true }));
    expect(Print.printToFileAsync).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Choose Photo')).toBeTruthy();
  });

  it('explains a denied camera permission and offers a PDF instead — nothing is uploaded', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const upload = jest.spyOn(documentsService, 'uploadDocument');
    await renderWithAuth(<AddRecordScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Take Photo'));
    });
    expect(alert).toHaveBeenCalledWith(
      'Permission needed',
      expect.stringMatching(/Camera access is off/),
      expect.arrayContaining([expect.objectContaining({ text: 'Upload PDF instead' })])
    );
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('My documents + document viewer', () => {
  it('lists a real stored document and opens its original via the service URL', async () => {
    pick({ name: 'Lipid panel.pdf', uri: 'file:///cache/lipid.pdf' });
    await renderWithAuth(<AddRecordScreen />);
    await pressUpload();
    await waitFor(() => expect(screen.getByText('Added to Health Memory')).toBeTruthy());
    const stored = (await documentsService.listDocuments()).find((d) => d.originalFilename === 'Lipid panel.pdf')!;

    await renderWithAuth(<MyDocumentsScreen />);
    await waitFor(() => expect(screen.getByText('Lipid panel.pdf')).toBeTruthy());

    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: stored.id });
    await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByText('Stored securely')).toBeTruthy());
    expect(screen.queryByText('Sample data')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('View original document'));
    });
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('file:///cache/lipid.pdf');
  });

  it('keeps main’s viewer (with AI explanation) for sample records, labelled "Sample data"', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'doc-2026-annual' });
    await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByText('Sample data')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('AI explanation')).toBeTruthy());
    expect(screen.getAllByLabelText('View previous result').length).toBeGreaterThan(0);
  });

  it('shows not-found for an unknown (or another user’s) real document id', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '99999999-9999-4999-8999-999999999999' });
    await renderWithAuth(<DocumentViewerScreen />);
    await waitFor(() => expect(screen.getByText('Document not found.')).toBeTruthy());
  });
});
