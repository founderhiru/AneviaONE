/**
 * Visual direction V2 (EXPO_PUBLIC_VISUAL_V2=on): the green palette and the restyled
 * Biomarkers rows, Documents tools and Family overview. Off, nothing changes.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { greenLightColors, lightColors } from '../design/colors';
import { getTheme } from '../design/theme';
import { rangeStatusFor } from '../services/health/rangeStatus';
import { BiomarkerRow } from '../components/BiomarkerRow';
import { HomeNav, greetingFor } from '../components/home/HomeNav';
import { healthService } from '../services/health/healthService';
import MyDocumentsScreen from '../app/documents/index';
import FamilyScreen from '../app/family';
import { documentsService } from '../services/documents/documentsService';
import { peopleService } from '../services/people/peopleService';
import { usePeople } from '../hooks/usePeople';
import { renderWithAuth } from './testUtils';

let mockV2 = true;
jest.mock('../config/visualFlag', () => ({
  get VISUAL_V2_ENABLED() {
    return mockV2;
  },
}));
jest.mock('../hooks/usePeople', () => ({ usePeople: jest.fn() }));

const result = (over: Record<string, unknown> = {}) =>
  ({ id: 'r1', name: 'Vitamin D', value: '18', unit: 'ng/mL', referenceRange: '30 - 100', date: '2026-01-10', needsReview: false, valueNumeric: 18, referenceLow: 30, referenceHigh: 100, source: { documentId: 'd1', documentName: 'report.pdf', pageNumber: 1 }, ...over }) as never;

beforeEach(() => {
  mockV2 = true;
  (router.push as jest.Mock).mockClear();
});

describe('palette', () => {
  it('uses green only when the flag is on, and leaves dark mode alone', () => {
    expect(getTheme('light').colors).toBe(greenLightColors);
    expect(getTheme('dark').colors).not.toBe(greenLightColors);
    mockV2 = false;
    expect(getTheme('light').colors).toBe(lightColors);
  });
});

describe('rangeStatusFor — only from the range printed on the report', () => {
  it('compares the value with the report’s own bounds', () => {
    expect(rangeStatusFor(result())).toBe('below');
    expect(rangeStatusFor(result({ valueNumeric: 45 }))).toBe('in_range');
    expect(rangeStatusFor(result({ valueNumeric: 168, referenceLow: null, referenceHigh: 200 }))).toBe('in_range');
    expect(rangeStatusFor(result({ valueNumeric: 240, referenceLow: null, referenceHigh: 200 }))).toBe('above');
  });
  it('gives no label without a range, without a plain number, or while unverified', () => {
    expect(rangeStatusFor(result({ referenceLow: null, referenceHigh: null }))).toBeNull();
    expect(rangeStatusFor(result({ valueNumeric: null }))).toBeNull();
    expect(rangeStatusFor(result({ needsReview: true }))).toBeNull();
  });
});

describe('BiomarkerRow', () => {
  it('shows the value, the report’s range and a plain range label — never Low, High or advice', async () => {
    const onPress = jest.fn();
    await renderWithAuth(<BiomarkerRow result={result()} onPress={onPress} />);
    expect(screen.getByText('Vitamin D')).toBeTruthy();
    expect(screen.getByText('Ref: 30 - 100')).toBeTruthy();
    expect(screen.getByText('Below range')).toBeTruthy();
    expect(screen.queryByText(/^low$|^high$|borderline|consider/i)).toBeNull();
  });
  it('marks an unverified result To verify and gives it no range label', async () => {
    await renderWithAuth(<BiomarkerRow result={result({ needsReview: true })} />);
    expect(screen.getByText('To verify')).toBeTruthy();
    expect(screen.queryByText('Below range')).toBeNull();
  });
});

const doc = (id: string, name: string) => ({ id, originalFilename: name, status: 'completed', source: 'upload', fileSizeBytes: 1000, uploadedAt: '2026-07-12T10:00:00Z', createdAt: '2026-07-12T10:00:00Z', updatedAt: '2026-07-12T10:00:00Z' }) as never;

describe('Documents & Records (V2)', () => {
  beforeEach(() => {
    (usePeople as jest.Mock).mockReturnValue({ people: [], active: null, switchTo: jest.fn(), refresh: jest.fn() });
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    (useFocusEffect as jest.Mock).mockImplementation((cb: () => void) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => cb(), []);
    });
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc('a', 'blood-test-jan.pdf'), doc('b', 'mri-scan.pdf')]);
  });

  it('has the new title, search by name and an Upload document button', async () => {
    await renderWithAuth(<MyDocumentsScreen />);
    await waitFor(() => expect(screen.getByTestId('stored-document-a')).toBeTruthy());
    expect(screen.getByText('Documents & Records')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('documents-search'), 'MRI');
    expect(screen.queryByTestId('stored-document-a')).toBeNull();
    expect(screen.getByTestId('stored-document-b')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('documents-search'), 'zzz');
    expect(screen.getByTestId('documents-no-match')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('documents-upload'));
    expect(router.push).toHaveBeenCalledWith('/add');
  });

  it('with the flag off it is the screen as before', async () => {
    mockV2 = false;
    await renderWithAuth(<MyDocumentsScreen />);
    await waitFor(() => expect(screen.getByTestId('stored-document-a')).toBeTruthy());
    expect(screen.getByText('My documents')).toBeTruthy();
    expect(screen.queryByTestId('documents-tools')).toBeNull();
    expect(screen.queryByTestId('documents-upload')).toBeNull();
  });
});

describe('Family overview (V2)', () => {
  const me = { id: 'me', name: 'Asha Rao', relationship: 'self', dateOfBirth: null, access: 'owner' };
  const dad = { id: 'dad', name: 'Ramesh Rao', relationship: 'father', dateOfBirth: null, access: 'owner' };
  const switchTo = jest.fn();
  beforeEach(() => {
    switchTo.mockClear();
    (usePeople as jest.Mock).mockReturnValue({ people: [me, dad], active: dad, switchTo, refresh: jest.fn().mockResolvedValue([me, dad]) });
    jest.spyOn(peopleService, 'listAccess').mockResolvedValue([]);
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc('a', 'a.pdf'), doc('b', 'b.pdf')]);
  });

  it('shows people by initials, the active person’s records, and no score or advice', async () => {
    await renderWithAuth(<FamilyScreen />);
    await waitFor(() => expect(screen.getByTestId('family-overview')).toBeTruthy());
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('RR')).toBeTruthy();
    expect(screen.getByTestId('family-overview-title').props.children).toBe('Ramesh Rao’s records');
    await waitFor(() => expect(screen.getByText('2 documents')).toBeTruthy());
    expect(screen.queryByText(/score|recommendation|care plan/i)).toBeNull();
  });

  it('choosing a person switches whose records are shown; rows open existing screens', async () => {
    await renderWithAuth(<FamilyScreen />);
    await fireEvent.press(await screen.findByTestId('family-pick-me'));
    expect(switchTo).toHaveBeenCalledWith('me');
    await fireEvent.press(screen.getByTestId('family-overview-documents'));
    expect(router.push).toHaveBeenCalledWith('/documents');
    await fireEvent.press(screen.getByTestId('family-pick-add'));
    expect(await screen.findByTestId('family-add-form')).toBeTruthy();
  });

  it('is absent with the flag off', async () => {
    mockV2 = false;
    await renderWithAuth(<FamilyScreen />);
    await waitFor(() => expect(screen.getByText('People')).toBeTruthy());
    expect(screen.queryByTestId('family-overview')).toBeNull();
  });
});

describe('Home (V2)', () => {

  beforeEach(() => {
    (usePeople as jest.Mock).mockReturnValue({ people: [], active: null, switchTo: jest.fn(), refresh: jest.fn() });
    (useFocusEffect as jest.Mock).mockImplementation(() => undefined);
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc('a', 'a.pdf')]);
    jest.spyOn(healthService, 'getRecordedObservations').mockResolvedValue([]);
  });

  it('greets by time of day', () => {
    expect(greetingFor(new Date(2026, 0, 1, 9))).toBe('Good morning');
    expect(greetingFor(new Date(2026, 0, 1, 14))).toBe('Good afternoon');
    expect(greetingFor(new Date(2026, 0, 1, 20))).toBe('Good evening');
  });

  it('shows the brand row, greeting and compact tiles that open real screens — and no score', async () => {
    await renderWithAuth(<HomeNav />);
    expect(screen.getByTestId('home-brand-row')).toBeTruthy();
    expect(screen.getByText('Your health, records and insights in one place.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('1 report')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('home-tile-family'));
    expect(router.push).toHaveBeenCalledWith('/family');
    await fireEvent.press(screen.getByTestId('home-tile-health'));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/hub');
    await fireEvent.press(screen.getByTestId('home-open-me'));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/me');
    expect(screen.queryByText(/score/i)).toBeNull();
  });

  it('with the flag off Home keeps its current header and tiles', async () => {
    mockV2 = false;
    await renderWithAuth(<HomeNav />);
    expect(screen.getByText('Your life. Your intelligence.')).toBeTruthy();
    expect(screen.queryByTestId('home-tiles')).toBeNull();
  });
});
