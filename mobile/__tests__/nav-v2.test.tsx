/**
 * The new navigation (EXPO_PUBLIC_NAV_V2=on). Demo mode, in-memory data. Covers the Add sheet's
 * two entry points, Home (tiles, Life Management status line), the Health hub's three sections,
 * the Documents tab, and that the flag is OFF by default so today's five tabs stay.
 */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import DocumentsTab from '../app/(tabs)/documents';
import HealthHub from '../app/(tabs)/hub';
import { AddSheet } from '../components/nav/AddSheet';
import { HomeNav } from '../components/home/HomeNav';
import { NAV_V2 } from '../config/navFlag';
import { resetDemoObligations } from '../services/obligations/demoObligationsService';
import { resetDemoVault } from '../services/vault/demoVaultService';
import { useAutoRead } from '../hooks/useAutoRead';
import { documentsService } from '../services/documents/documentsService';
import { startReading } from '../services/processing/processingService';
import type { StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('../hooks/useAutoRead', () => ({
  ...jest.requireActual('../hooks/useAutoRead'),
  useAutoRead: jest.fn(),
}));
jest.mock('../services/processing/processingService', () => ({ ...jest.requireActual('../services/processing/processingService'), startReading: jest.fn(async () => undefined) }));
const doc = (over: Partial<StoredDocument>): StoredDocument => ({ id: 'd1', title: 'Report', status: 'completed', createdAt: '2026-11-01T00:00:00Z', ...over }) as StoredDocument;
const IDLE = { showConsent: false, reading: 0, waitingForConsent: 0, justFinished: false, error: null, allow: jest.fn(), decline: jest.fn(), refresh: jest.fn(async () => undefined) };

beforeEach(() => {
  resetDemoObligations();
  resetDemoVault();
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (useAutoRead as jest.Mock).mockReturnValue(IDLE);
});

describe('flag', () => {
  it('is off unless the build turns it on, so today’s five tabs stay', () => {
    expect(NAV_V2).toBe(false);
  });
});

describe('Add sheet', () => {
  it('offers a Health Report and a Personal Document', async () => {
    await renderWithAuth(<AddSheet visible onClose={jest.fn()} />);
    expect(await screen.findByText('Add a Health Report')).toBeTruthy();
    expect(screen.getByText('Add a Personal Document')).toBeTruthy();
  });

  it('sends a health report to the existing Add flow and closes', async () => {
    const onClose = jest.fn();
    await renderWithAuth(<AddSheet visible onClose={onClose} />);
    await fireEvent.press(await screen.findByTestId('add-health'));
    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/add');
  });

  it('sends a personal document to the Documents add flow', async () => {
    await renderWithAuth(<AddSheet visible onClose={jest.fn()} />);
    await fireEvent.press(await screen.findByTestId('add-document'));
    expect(router.push).toHaveBeenCalledWith('/vault?add=1');
  });
});

describe('Home: reports that need a look (nothing is lost by the new layout)', () => {
  it('shows nothing extra when every report is fine', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc({})]);
    await renderWithAuth(<HomeNav />);
    await screen.findByTestId('home-tile-health');
    expect(screen.queryByTestId('home-check-card')).toBeNull();
    expect(screen.queryByTestId('home-verify')).toBeNull();
  });

  it('shows the review card and a "Reports to verify" tile for a held report, and opens the verify list', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc({ heldForReviewCount: 2 })]);
    await renderWithAuth(<HomeNav />);
    expect(await screen.findByTestId('home-check-card')).toBeTruthy();
    expect(screen.getByText(/pages that were hard to read/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('summary-review'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/documents', params: { filter: 'verify' } });
  });

  it('a single held report opens straight to that report', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc({ id: 'held-1', heldForReviewCount: 1 })]);
    await renderWithAuth(<HomeNav />);
    await fireEvent.press(await screen.findByTestId('home-check-card'));
    expect(router.push).toHaveBeenLastCalledWith('/documents/held-1');
  });

  it('can read held reports again with the latest reading', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc({ id: 'held-1', heldForReviewCount: 1 }), doc({ id: 'held-2', heldForReviewCount: 3 })]);
    await renderWithAuth(<HomeNav />);
    await fireEvent.press(await screen.findByTestId('home-check-read-again'));
    expect(startReading).toHaveBeenCalledWith('held-1', { reprocess: true });
    expect(startReading).toHaveBeenCalledWith('held-2', { reprocess: true });
  });

  it('says plainly when a report could not be read', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc({ status: 'failed', failureKind: 'unsupported' as never })]);
    await renderWithAuth(<HomeNav />);
    expect(await screen.findByText(/couldn’t be read/)).toBeTruthy();
  });
});

describe('Home', () => {
  it('shows What changed, the two tiles and Life Management with its live status line', async () => {
    await renderWithAuth(<HomeNav />);
    expect(await screen.findByTestId('home-tile-health')).toBeTruthy();
    expect(screen.getByTestId('home-tile-documents')).toBeTruthy();
    expect(await screen.findByTestId('home-life-status')).toBeTruthy();
    expect(await screen.findByText(/overdue|due soon|coming up/)).toBeTruthy();
  });

  it('opens Health, Personal Documents and Life Management', async () => {
    await renderWithAuth(<HomeNav />);
    await fireEvent.press(await screen.findByTestId('home-tile-health'));
    expect(router.push).toHaveBeenLastCalledWith('/(tabs)/hub');
    await fireEvent.press(screen.getByTestId('home-tile-documents'));
    expect(router.push).toHaveBeenLastCalledWith('/(tabs)/documents');
    await fireEvent.press(screen.getByTestId('home-tile-life'));
    expect(router.push).toHaveBeenLastCalledWith('/reminders');
  });

  it('lists personal documents under Recently added', async () => {
    await renderWithAuth(<HomeNav />);
    expect(await screen.findByTestId('home-recent')).toBeTruthy();
    expect(await screen.findAllByText(/Personal document/)).not.toHaveLength(0);
  });
});

describe('Home keeps reading new reports', () => {
  it('asks for consent once, and shows progress while reading', async () => {
    (useAutoRead as jest.Mock).mockReturnValue({ ...IDLE, showConsent: true, waitingForConsent: 2 });
    await renderWithAuth(<HomeNav />);
    expect(await screen.findByText('Read your reports for you?')).toBeTruthy();
    (useAutoRead as jest.Mock).mockReturnValue({ ...IDLE, reading: 1 });
    await renderWithAuth(<HomeNav />);
    expect(await screen.findByTestId('home-reading')).toBeTruthy();
  });
});

describe('Health hub', () => {
  it('holds Overview, Timeline and Doctor Brief, and a red Prepare for Doctor button', async () => {
    await renderWithAuth(<HealthHub />);
    expect(await screen.findByTestId('hub-overview')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('hub-seg-timeline'));
    expect(await screen.findByTestId('hub-timeline')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('hub-prepare-doctor'));
    expect(await screen.findByTestId('hub-doctor')).toBeTruthy();
  });
});

describe('Documents tab', () => {
  it('shows the six Personal Documents categories', async () => {
    await renderWithAuth(<DocumentsTab />);
    expect(await screen.findByTestId('vault-category-tile-identity')).toBeTruthy();
    expect(screen.getByTestId('vault-category-tile-other')).toBeTruthy();
  });
});
