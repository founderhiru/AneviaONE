/**
 * New Home: the summary line, then "what changed" with graphs, then the key
 * measures. No recent-documents list (documents live under Timeline >
 * Documents). A report is flagged only when a page was hard to read; no
 * "add your name" nag. The previous Home is kept, unchanged, and proven by
 * the classic tests (config/homeVariant.ts).
 */
import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import HomeScreen from '../app/(tabs)/home';
import { documentsService } from '../services/documents/documentsService';
import { invalidateHealthMemory } from '../services/health/healthMemoryApi';
import { productionHealthService } from '../services/health/healthService';
import { getSupabaseClient } from '../services/supabaseClient';
import type { RecordedObservation, StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

const mockPeople: { people: unknown[]; active: unknown } = { people: [], active: null };
jest.mock('../hooks/usePeople', () => ({ usePeople: () => ({ ...mockPeople, switchTo: mockSwitch, refresh: jest.fn() }) }));
const mockSwitch = jest.fn();

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));
jest.mock('../services/health/healthService', () => {
  const actual = jest.requireActual('../services/health/healthService');
  return { ...actual, healthService: actual.productionHealthService };
});

function doc(id: string, over: Partial<StoredDocument> = {}): StoredDocument {
  const at = '2026-10-06T09:00:00.000Z';
  return {
    id, userId: 'user-1', source: 'upload', documentType: 'unclassified', originalFilename: `${id}.pdf`, mimeType: 'application/pdf',
    fileSizeBytes: 1000, storagePath: `user-1/documents/${id}/original.pdf`, status: 'completed', processingError: null,
    healthInfoCount: 6, uploadedAt: at, createdAt: at, updatedAt: at, ...over,
  };
}

function result(id: string, name: string, value: string, date: string, documentId: string, extra: Partial<RecordedObservation> = {}): RecordedObservation {
  return {
    id, name, value, unit: 'mg/dL', referenceRange: null, date, needsReview: false, category: 'laboratory', valueNumeric: Number(value),
    source: { documentId, documentName: `${documentId}.pdf`, reportDate: null, pageNumber: 1 },
    ...extra,
  } as RecordedObservation;
}

const LDL = [
  result('l1', 'LDL Cholesterol', '112', '2019-01-10', 'd1'),
  result('l2', 'LDL Cholesterol', '131', '2024-03-10', 'd2'),
  result('l3', 'LDL Cholesterol', '146', '2026-03-10', 'd3'),
];

const emptySnapshot = {
  version: 'g2.0',
  memory: { conditions: [], medications: [], allergies: [], procedures: [], vaccinations: [], encounters: [], counts: { records: 3, reports: 3 } },
  timeline: [], trends: [], changes: { status: 'insufficient_data', changes: [] },
};

async function renderHome(documents: StoredDocument[], results: RecordedObservation[]) {
  invalidateHealthMemory();
  const { createFakeSupabase } = jest.requireActual('../test-support/fakeSupabase');
  const fake = createFakeSupabase();
  fake.functions.invoke.mockResolvedValue({ data: emptySnapshot, error: null });
  (getSupabaseClient as jest.Mock).mockReturnValue(fake);
  jest.spyOn(documentsService, 'listDocuments').mockResolvedValue(documents);
  jest.spyOn(productionHealthService, 'getRecordedObservations').mockResolvedValue(results);
  await renderWithAuth(<HomeScreen />);
}

afterEach(() => jest.restoreAllMocks());

describe('Home (new)', () => {
  const docs = [doc('d1'), doc('d2'), doc('d3')];

  it('the summary line comes first, then what changed with a graph, then the key measures', async () => {
    await renderHome(docs, LDL);
    await waitFor(() => expect(screen.getByTestId('home-summary')).toBeTruthy());
    expect(screen.getByLabelText('3 Reports')).toBeTruthy();
    expect(screen.getByLabelText('3 Results')).toBeTruthy();
    const card = await screen.findByTestId('home-change-card');
    expect(within(card).getByText('1 result changed since your last report.')).toBeTruthy();
    expect(within(card).getByText('LDL Cholesterol')).toBeTruthy();
    expect(within(card).getByText(/\+12%/)).toBeTruthy(); // 131 → 146 (11.5%, as the app rounds it)
    expect(within(card).getByTestId('trend-line', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('home-key-measures')).toBeTruthy();
    expect(screen.getByTestId('measure-tile-lab|ldlcholesterol|mg/dl')).toBeTruthy();
    // Order on screen: summary, what changed, key measures.
    const order: string[] = [];
    const walk = (n: unknown): void => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      const node = n as { props?: { testID?: string }; children?: unknown };
      if (node.props?.testID) order.push(node.props.testID);
      walk(node.children);
    };
    walk(screen.toJSON());
    const at = (id: string) => order.indexOf(id);
    expect(at('home-summary')).toBeGreaterThan(-1);
    expect(at('home-summary')).toBeLessThan(at('home-change-card'));
    expect(at('home-change-card')).toBeLessThan(at('home-key-measures'));
  });

  it('no recent-documents list on Home', async () => {
    await renderHome(docs, LDL);
    await screen.findByTestId('home-change-card');
    expect(screen.queryByTestId('home-recent-records')).toBeNull();
    expect(screen.queryByText('Recent documents')).toBeNull();
    expect(screen.queryByTestId('stored-document-d1')).toBeNull();
  });

  it('opening the card or a measure opens What changed; the Doctor shortcut opens For Doctor', async () => {
    await renderHome(docs, LDL);
    await act(async () => { fireEvent.press(await screen.findByTestId('home-change-card')); });
    expect(router.push).toHaveBeenCalledWith('/changes');
    await act(async () => { fireEvent.press(screen.getByTestId('home-doctor-shortcut')); });
    expect(router.push).toHaveBeenCalledWith('/(tabs)/doctor');
  });

  it('no warning for read reports: nothing flagged, no card, no name nag', async () => {
    await renderHome(docs, LDL);
    await screen.findByTestId('home-change-card');
    expect(screen.queryByTestId('home-check-card')).toBeNull();
    expect(screen.queryByText(/name and date of birth/i)).toBeNull();
    expect(screen.getByLabelText('0 Reports to verify')).toBeTruthy();
  });

  it('a single card appears only for a report with hard-to-read pages, and opens that report', async () => {
    const unclear = doc('d4', { healthInfoCount: 0, heldForReviewCount: 3 });
    await renderHome([...docs, unclear], LDL);
    const card = await screen.findByTestId('home-check-card');
    expect(within(card).getByText('1 report has pages that were hard to read')).toBeTruthy();
    await act(async () => { fireEvent.press(card); });
    expect(router.push).toHaveBeenCalledWith('/documents/d4');
  });

  it('with one report there is nothing to compare: an honest invitation, no chart', async () => {
    await renderHome([doc('d1')], [LDL[0]]);
    expect(await screen.findByTestId('home-story-card')).toBeTruthy(); // a green card, even with nothing to chart
    expect(screen.queryByTestId('trend-line', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('home-key-measures')).toBeNull();
  });

  it('never judges a result: no diagnosis or good/bad wording', async () => {
    await renderHome(docs, LDL);
    const card = await screen.findByTestId('home-change-card');
    expect(within(card).queryByText(/diagnos|you have|disease|treatment|improv|worse|bad|good/i)).toBeNull();
  });

  it('narrative findings (no repeated test) still get the green story card, with the newest report and the mix', async () => {
    const narrative = [
      result('n1', 'Impression', 'Normal study', '2025-11-25', 'd1', { category: 'imaging', valueNumeric: null, unit: null }),
      result('n2', 'Liver', 'Normal in size', '2025-11-25', 'd1', { category: 'imaging', valueNumeric: null, unit: null }),
      result('n3', 'Haemoglobin', '13.1', '2025-06-01', 'd2', { unit: 'g/dL' }),
    ];
    await renderHome([doc('d1'), doc('d2')], narrative);
    const card = await screen.findByTestId('home-story-card');
    expect(within(card).getByText(/LATEST REPORT · 25 NOV 2025/)).toBeTruthy();
    expect(within(card).getByText('Impression')).toBeTruthy();
    expect(within(card).getByText('Normal study')).toBeTruthy();
    expect(within(card).getByTestId('story-strip')).toBeTruthy();
    expect(within(card).getByText('Imaging 2')).toBeTruthy();
    expect(within(card).getByText('Lab 1')).toBeTruthy();
    expect(screen.queryByTestId('home-change-card')).toBeNull();
    expect(screen.queryByText('Latest results')).toBeNull(); // no long results list on Home; the Health tab has it
  });

  it('with nothing to chart, shows where single results sit against their printed range, and when they were done', async () => {
    const singles = [
      result('s1', 'LDL Cholesterol', '142', '2026-03-10', 'd1', { referenceRange: '0 - 100', referenceLow: 0, referenceHigh: 100 }),
      result('s2', 'HDL Cholesterol', '50', '2026-03-10', 'd1', { referenceRange: '40 - 100', referenceLow: 40, referenceHigh: 100 }),
    ];
    await renderHome([doc('d1')], singles);
    const card = await screen.findByTestId('home-key-numbers');
    expect(within(card).getByTestId('key-number-s1')).toBeTruthy();
    expect(within(card).getAllByText('Above printed range').length).toBe(1);
    expect(within(card).getByText('Within printed range')).toBeTruthy();
  });

  it('shows the family at a glance, and tapping a person switches to their records', async () => {
    mockPeople.active = { id: 'me', name: 'Asha', relationship: 'self', access: 'owner' };
    mockPeople.people = [mockPeople.active, { id: 'dad', name: 'Ramesh Verma', relationship: 'father', access: 'owner' }];
    await renderHome(docs, LDL);
    const row = await screen.findByTestId('family-dad');
    await waitFor(() => expect(within(row).getByText(/Latest report/)).toBeTruthy());
    expect(screen.queryByTestId('family-me')).toBeNull(); // the person on screen is not repeated
    fireEvent.press(row);
    expect(mockSwitch).toHaveBeenCalledWith('dad');
    mockPeople.people = [];
    mockPeople.active = null;
  });
});
