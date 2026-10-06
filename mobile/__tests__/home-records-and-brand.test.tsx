/**
 * Home shows the person's own uploaded records (through the same
 * documentsService as My documents), with an honest empty state; and the
 * brand moments — launch splash and Welcome — render the one canonical
 * AneviaONE mark with the configured name and tagline.
 *
 * Health history comes from the production health service here (no sample
 * history), as in a real production account.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import HomeScreen from '../app/(tabs)/home';
import WelcomeScreen from '../app/(auth)/welcome';
import { AnimatedSplash } from '../components/AnimatedSplash';
import { BrandMarkGlyph } from '../components/BrandMarkArt';
import { LAUNCH_TAGLINE_LINES } from '../components/BrandWordmark';
import { uploadedLabel } from '../components/StoredDocumentCard';
import { BRAND } from '../config/brand';
import { documentsService } from '../services/documents/documentsService';
import type { StoredDocument } from '../types';
import { renderWithAuth, renderWithProviders } from './testUtils';

jest.mock('../services/health/healthService', () => {
  const actual = jest.requireActual('../services/health/healthService');
  return { ...actual, healthService: actual.productionHealthService };
});
jest.mock('../components/BrandMarkArt', () => {
  const actual = jest.requireActual('../components/BrandMarkArt');
  return { ...actual, BrandMarkGlyph: jest.fn(actual.BrandMarkGlyph) };
});

function storedDocument(id: string, name: string, uploadedAt = new Date().toISOString()): StoredDocument {
  return {
    id,
    userId: 'user-1',
    source: 'upload',
    documentType: 'unclassified',
    originalFilename: name,
    mimeType: 'application/pdf',
    fileSizeBytes: 120_000,
    storagePath: `user-1/documents/${id}/original.pdf`,
    status: 'uploaded',
    processingError: null,
    uploadedAt,
    createdAt: uploadedAt,
    updatedAt: uploadedAt,
  };
}

const BLOOD = storedDocument('11111111-1111-4111-8111-111111111111', 'Blood Test.pdf');
const REPORT = storedDocument('22222222-2222-4222-8222-222222222222', 'Medical Report.pdf');

afterEach(() => jest.restoreAllMocks());

describe('Home — recent health records', () => {
  it('shows the person’s uploaded documents, newest first, with when they were added', async () => {
    const list = jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([BLOOD, REPORT]);
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Recent Health Records')).toBeTruthy());
    expect(screen.getByText('Blood Test.pdf')).toBeTruthy();
    expect(screen.getByText('Medical Report.pdf')).toBeTruthy();
    expect(screen.getAllByText(/Uploaded today/)).toHaveLength(2);
    expect(list).toHaveBeenCalled();
    expect(screen.queryByText('Your health history starts here.')).toBeNull();
  });

  it('tapping a record opens the existing document detail; View all opens My documents', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([BLOOD, REPORT]);
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Blood Test.pdf')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Blood Test.pdf'));
    });
    expect(router.push).toHaveBeenCalledWith(`/documents/${BLOOD.id}`);
    await act(async () => {
      fireEvent.press(screen.getByText('View all'));
    });
    expect(router.push).toHaveBeenCalledWith('/documents');
  });

  it('shows at most three recent records', async () => {
    const many = [1, 2, 3, 4].map((n) => storedDocument(`3333333${n}-3333-4333-8333-333333333333`, `Report ${n}.pdf`));
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue(many);
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Report 1.pdf')).toBeTruthy());
    expect(screen.queryByText('Report 4.pdf')).toBeNull();
  });

  it('with no records yet: “Your health history starts here.” and Add Health Record', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([]);
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Your health history starts here.')).toBeTruthy());
    expect(screen.getByText('Add a report, scan or photo to begin building your health memory.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Add Health Record'));
    });
    expect(router.push).toHaveBeenCalledWith('/add');
  });

  it('a records error is shown in place, never as an empty history, and can be retried', async () => {
    const list = jest.spyOn(documentsService, 'listDocuments').mockRejectedValueOnce(new Error('offline')).mockResolvedValue([BLOOD]);
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByTestId('home-records-retry')).toBeTruthy());
    expect(screen.queryByText('Your health history starts here.')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('home-records-retry'));
    });
    await waitFor(() => expect(screen.getByText('Blood Test.pdf')).toBeTruthy());
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('the Add action is always on Home', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([BLOOD]);
    await renderWithAuth(<HomeScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('home-add-record'));
    });
    expect(router.push).toHaveBeenCalledWith('/add');
  });

  it('labels upload dates plainly', () => {
    const now = new Date('2026-10-05T12:00:00');
    expect(uploadedLabel('2026-10-05T08:00:00', now)).toBe('Uploaded today');
    expect(uploadedLabel('2026-10-04T08:00:00', now)).toBe('Uploaded yesterday');
    expect(uploadedLabel('2026-09-12T08:00:00', now)).toMatch(/^Uploaded 12 Sept? 2026$/);
  });
});

describe('Brand — one canonical mark', () => {
  const glyph = BrandMarkGlyph as unknown as jest.Mock;
  const parts = () => glyph.mock.calls.map(([props]) => props.part).sort();

  beforeEach(() => glyph.mockClear());

  it('the splash renders the canonical A and leaf, with the configured name and tagline', async () => {
    await renderWithProviders(<AnimatedSplash ready={false} onFinished={() => undefined} />);
    expect(screen.getByTestId('splash-brand-mark')).toBeTruthy();
    expect(parts()).toEqual(expect.arrayContaining(['leaf', 'letter']));
    expect(screen.getByText(BRAND.wordmark)).toBeTruthy();
    expect(LAUNCH_TAGLINE_LINES).toEqual(['Healthier generations', 'Brighter lives']);
    for (const line of LAUNCH_TAGLINE_LINES) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByLabelText(BRAND.launchTagline)).toBeTruthy();
  });

  it('Welcome renders the same mark, name and tagline as the settled splash', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByTestId('brand-mark', { includeHiddenElements: true })).toBeTruthy();
    expect(parts()).toEqual(expect.arrayContaining(['leaf', 'letter']));
    expect(screen.getByText(BRAND.wordmark)).toBeTruthy();
    for (const line of LAUNCH_TAGLINE_LINES) expect(screen.getByText(line)).toBeTruthy();
  });

  it('sign-in buttons on Welcome share one label style (Mobile, Google, Apple)', async () => {
    await renderWithAuth(<WelcomeScreen />);
    const label = (testID: string) => {
      const text = within(screen.getByTestId(testID)).getByText(/^Continue with/);
      const style = Object.assign({}, ...[text.props.style].flat(Infinity).filter(Boolean));
      return { fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight };
    };
    const apple = await screen.findByTestId('continue-with-apple');
    expect(apple).toBeTruthy();
    const mobile = label('continue-with-mobile');
    expect(label('continue-with-google')).toEqual(mobile);
    expect(label('continue-with-apple')).toEqual(mobile);
  });
});
