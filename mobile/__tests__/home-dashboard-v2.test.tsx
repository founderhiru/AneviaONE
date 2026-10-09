/**
 * Home dashboard V2 — "Your health at a glance."
 *
 * The domain rules (services/health/homeDashboard.ts) are tested directly;
 * the screen is rendered against the production services with a fake
 * backend, so every figure, result and signal on it comes from the person's
 * own (fixture) records — never from the sample dataset.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import HomeScreen from '../app/(tabs)/home';
import { documentsService, presentDocumentStatus } from '../services/documents/documentsService';
import { invalidateHealthMemory } from '../services/health/healthMemoryApi';
import { productionHealthService } from '../services/health/healthService';
import {
  SIGNAL_COPY,
  describeChange,
  healthSignals,
  homeStage,
  latestActivity,
  healthSnapshot,
  parseReportedRange,
  resultPosition,
  summarizeDashboard,
} from '../services/health/homeDashboard';
import { getSupabaseClient } from '../services/supabaseClient';
import type { HealthChange, HealthEvent, Medication, RecordedObservation, StoredDocument, Trend } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));
jest.mock('../services/health/healthService', () => {
  const actual = jest.requireActual('../services/health/healthService');
  return { ...actual, healthService: actual.productionHealthService };
});

// ---------------------------------------------------------------- fixtures --

function doc(id: string, name = `${id}.pdf`): StoredDocument {
  const at = '2026-10-06T09:00:00.000Z';
  return {
    id,
    userId: 'user-1',
    source: 'upload',
    documentType: 'unclassified',
    originalFilename: name,
    mimeType: 'application/pdf',
    fileSizeBytes: 1000,
    storagePath: `user-1/documents/${id}/original.pdf`,
    status: 'completed',
    processingError: null,
    healthInfoCount: 6,
    uploadedAt: at,
    createdAt: at,
    updatedAt: at,
  };
}

function result(
  id: string,
  name: string,
  value: string,
  range: string | null,
  overrides: Partial<RecordedObservation> & { documentId?: string } = {},
): RecordedObservation {
  const { documentId = 'urine', ...rest } = overrides;
  return {
    id,
    name,
    value,
    unit: null,
    referenceRange: range,
    date: '2026-10-06',
    needsReview: false,
    category: 'urine',
    source: { documentId, documentName: `${documentId}.pdf`, pageNumber: 1 },
    ...rest,
  };
}

/** One real-world urine report: six results, one below its printed range. */
const URINE: RecordedObservation[] = [
  result('ph', 'pH', '7.0', '4.5 - 8.0'),
  result('sg', 'Specific Gravity', '1.005', '1.010–1.030'),
  result('protein', 'Protein', 'Nil', 'Nil'),
  result('sugar', 'Sugar', 'Nil', 'Nil'),
  result('colour', 'Colour', 'Pale yellow', null),
  result('appearance', 'Appearance', 'Clear', null),
];

const evidence = (documentId: string) => ({ documentId, documentName: `${documentId}.pdf`, reportDate: null, pageNumber: 1 });
const serverEvent = (id: string, date: string, title: string, summary: string) => ({ id, type: 'report', date, title, summary, documentId: id, recordIds: [] });

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    version: 'g2.0',
    memory: { conditions: [], medications: [], allergies: [], procedures: [], vaccinations: [], encounters: [], counts: { records: 0, reports: 0 } },
    timeline: [],
    trends: [],
    changes: { status: 'insufficient_data', changes: [] },
    ...overrides,
  };
}

const early = () =>
  snapshot({
    memory: { conditions: [], medications: [], allergies: [], procedures: [], vaccinations: [], encounters: [], counts: { records: 6, reports: 1 } },
    timeline: [serverEvent('urine', '2026-10-06', 'Urine report', '6 results')],
  });

const established = () =>
  snapshot({
    timeline: [serverEvent('march', '2025-03-01', 'March lab report', '2 results'), serverEvent('urine', '2026-10-06', 'Urine report', '6 results')],
    trends: [
      {
        id: 't-ph', name: 'pH', nameKey: 'ph', unit: null,
        points: [{ date: '2025-03-01', value: 6.5, recordIds: [], evidence: evidence('march') }, { date: '2026-10-06', value: 7, recordIds: [], evidence: evidence('urine') }],
        direction: 'increased', latest: { date: '2026-10-06', value: 7 }, summary: 'The recorded value increased from 6.5 to 7.', referenceRange: '4.5 - 8.0', otherUnits: [],
      },
    ],
    changes: {
      status: 'ok',
      changes: [
        {
          id: 'c-ph', type: 'value_change', name: 'pH', summary: 'Recorded pH increased from 6.5 to 7.', previousValue: '6.5', currentValue: '7', unit: null,
          date: '2026-10-06', comparedWithDate: '2025-03-01',
          sources: [{ recordId: 'ph', role: 'current', evidence: evidence('urine') }, { recordId: 'ph-old', role: 'previous', evidence: evidence('march') }],
        },
      ],
    },
  });

async function renderHome(opts: { snapshot: object; documents: StoredDocument[]; results: RecordedObservation[] }) {
  invalidateHealthMemory();
  const { createFakeSupabase } = jest.requireActual('../test-support/fakeSupabase');
  const fake = createFakeSupabase();
  fake.functions.invoke.mockResolvedValue({ data: opts.snapshot, error: null });
  (getSupabaseClient as jest.Mock).mockReturnValue(fake);
  jest.spyOn(documentsService, 'listDocuments').mockResolvedValue(opts.documents);
  jest.spyOn(productionHealthService, 'getRecordedObservations').mockResolvedValue(opts.results);
  await renderWithAuth(<HomeScreen />);
}

afterEach(() => jest.restoreAllMocks());

/** Words that would turn a signal into a diagnosis or a treatment instruction. */
const UNSAFE = /diagnos|you have|you probably|disease|treatment|\btake\b|\bstart\b|\bstop\b|prescri|medicine|dose/i;

// ------------------------------------------------------------ domain rules --

describe('reported-range checks', () => {
  it('parses the range forms printed on reports, and nothing else', () => {
    expect(parseReportedRange('4.5 - 8.0')).toEqual({ low: 4.5, high: 8 });
    expect(parseReportedRange('1.010–1.030')).toEqual({ low: 1.01, high: 1.03 });
    expect(parseReportedRange('70 - 100 mg/dL')).toEqual({ low: 70, high: 100 });
    expect(parseReportedRange('70 to 100')).toBeNull(); // as on the server: not read as a range
    expect(parseReportedRange('< 100')).toEqual({ low: null, high: 100 });
    expect(parseReportedRange('>= 40')).toEqual({ low: 40, high: null });
    expect(parseReportedRange('Nil')).toBeNull();
    expect(parseReportedRange('Negative')).toBeNull();
    expect(parseReportedRange(null)).toBeNull();
  });

  it('compares a value only with its own report range; text values are never judged', () => {
    expect(resultPosition(URINE[0])).toBe('within');
    expect(resultPosition(URINE[1])).toBe('below');
    expect(resultPosition(result('ldl', 'LDL', '135', '< 100'))).toBe('above');
    expect(resultPosition(result('edge', 'Edge', '100', '< 100'))).toBe('within');
    expect(resultPosition(URINE[2])).toBeNull();
    expect(resultPosition(result('lt', 'CRP', '<0.5', '0 - 5'))).toBeNull();
    expect(resultPosition(result('none', 'Glucose', '180', null))).toBeNull();
  });

  it('prefers the bounds the server parsed from the report', () => {
    expect(resultPosition(result('x', 'X', '12', 'see note', { valueNumeric: 12, referenceLow: 1, referenceHigh: 10 }))).toBe('above');
  });
});

describe('Health Signals — deterministic and evidence-based', () => {
  it('below range: the report’s own range, and doctor-consult wording', () => {
    const [signal, ...rest] = healthSignals(URINE);
    expect(rest).toHaveLength(0);
    expect(signal).toMatchObject({
      kind: 'outside',
      name: 'Specific Gravity',
      value: '1.005',
      headline: 'Below the reported range',
      referenceRange: '1.010–1.030',
      advice: 'Consider discussing this result with your doctor.',
    });
  });

  it('above range', () => {
    expect(healthSignals([result('ldl', 'LDL', '135', '< 100')])[0]).toMatchObject({ kind: 'outside', headline: 'Above the reported range' });
  });

  it('within range, text values and missing ranges: no signal', () => {
    expect(healthSignals([URINE[0], URINE[2], URINE[4], result('g', 'Glucose', '180', null)])).toEqual([]);
  });

  it('outside the range across consecutive reports: a pattern', () => {
    const series = [
      result('g1', 'Fasting Glucose', '130', '70 - 100', { date: '2024-01-10', documentId: 'a' }),
      result('g2', 'Fasting glucose', '128', '70 - 100', { date: '2025-01-10', documentId: 'b' }),
      result('g3', 'FASTING GLUCOSE', '140', '70 - 100', { date: '2026-01-10', documentId: 'c' }),
    ];
    expect(healthSignals(series)).toEqual([
      expect.objectContaining({
        id: 'g3',
        kind: 'repeated',
        detail: 'This result has remained outside the reported range across 3 reports.',
        advice: 'Consider discussing this pattern with your doctor.',
      }),
    ]);
  });

  it('within range before, outside now: changed from the previous report', () => {
    const series = [
      result('h1', 'Haemoglobin', '13.2', '12 - 15', { date: '2025-01-10', documentId: 'a' }),
      result('h2', 'Haemoglobin', '11.1', '12 - 15', { date: '2026-01-10', documentId: 'b' }),
    ];
    expect(healthSignals(series)[0]).toMatchObject({ kind: 'moved_outside', headline: 'Below the reported range' });
    expect(healthSignals(series)[0].detail).toMatch(/changed from your previous report/);
  });

  it('back within range now: nothing to flag', () => {
    const series = [
      result('h1', 'Haemoglobin', '11.1', '12 - 15', { date: '2025-01-10', documentId: 'a' }),
      result('h2', 'Haemoglobin', '13.0', '12 - 15', { date: '2026-01-10', documentId: 'b' }),
    ];
    expect(healthSignals(series)).toEqual([]);
  });

  it('critical only when the report itself says so — and it comes first', () => {
    const flagged = [
      result('k', 'Potassium', '6.9', '3.5 - 5.1', { abnormalFlag: 'Critical' }),
      result('l', 'LDL', '135', '< 100'),
    ];
    const [first, second] = healthSignals(flagged);
    expect(first).toMatchObject({ kind: 'critical', detail: SIGNAL_COPY.critical, advice: null });
    expect(first.detail).toBe(
      'Your report flags this result as critical. Please follow the instructions on the report and contact your healthcare professional promptly.',
    );
    expect(second.kind).toBe('outside');
    // A far-out value or an unexplained code is never promoted to "critical".
    expect(healthSignals([result('k', 'Potassium', '9.9', '3.5 - 5.1', { abnormalFlag: 'HH' })])[0].kind).toBe('outside');
    expect(healthSignals([result('k', 'Potassium', '9.9', '3.5 - 5.1')])[0].kind).toBe('outside');
  });

  it('a report-provided flag on a result without a comparable range', () => {
    expect(healthSignals([result('u', 'Pus cells', '8-10', null, { abnormalFlag: 'H' })])[0]).toMatchObject({
      kind: 'flagged',
      headline: 'Flagged on your report',
      detail: 'Your report marks this result “H”.',
    });
  });

  it('results held for review are never used', () => {
    expect(healthSignals([result('sg', 'Specific Gravity', '1.005', '1.010 - 1.030', { needsReview: true })])).toEqual([]);
  });

  it('all signal copy is non-diagnostic and suggests only professional follow-up', () => {
    const copy = Object.values(SIGNAL_COPY).map((v) => (typeof v === 'function' ? v(2 as never) : v));
    for (const text of copy) expect(text).not.toMatch(UNSAFE);
    expect(SIGNAL_COPY.discussResult).toMatch(/doctor/);
    expect(SIGNAL_COPY.discussPattern).toMatch(/doctor/);
  });
});

describe('summary, stage, latest results and changes', () => {
  const trend = (n: number) => ({ points: Array.from({ length: n }, (_, i) => ({ date: `2026-0${i + 1}-01`, value: i })) }) as Trend;
  const event = { id: 'e', type: 'report', title: 'Urine report', date: '2026-10-06' } as HealthEvent;

  it('new: nothing at all; early: one report; established: a test in more than one report', () => {
    expect(homeStage({ documents: [], results: [], timeline: [], trends: [] })).toBe('new');
    expect(homeStage({ documents: [doc('urine')], results: URINE, timeline: [event], trends: [] })).toBe('early');
    const two = [...URINE, result('ph-old', 'pH', '6.5', '4.5 - 8.0', { date: '2025-03-01', documentId: 'march' })];
    expect(homeStage({ documents: [doc('urine'), doc('march')], results: two, timeline: [event], trends: [trend(2)] })).toBe('established');
  });

  it('counts are real list lengths; areas come only from stored classifications', () => {
    expect(summarizeDashboard({ documents: [doc('a'), doc('b'), doc('c')], results: URINE, medications: [] })).toEqual({
      reportCount: 3, resultCount: 6, healthAreas: ['Urine tests'], medicationCount: 0,
    });
    const unclassified = URINE.map((r) => ({ ...r, category: 'other' }));
    expect(summarizeDashboard({ documents: [], results: unclassified, medications: [{} as Medication] }).healthAreas).toBeNull();
    expect(summarizeDashboard({ documents: [], results: [], medications: [] })).toEqual({ reportCount: 0, resultCount: 0, healthAreas: [], medicationCount: 0 });
    const held = [...URINE, result('x', 'X', '1', null, { needsReview: true, category: 'laboratory' })];
    expect(summarizeDashboard({ documents: [], results: held, medications: [] })).toMatchObject({ resultCount: 6, healthAreas: ['Urine tests'] });
  });

  it('snapshot: newest results, attention items excluded, no area takes more than two', () => {
    // One area only: two results, never more, and Specific Gravity (shown under attention) left out.
    expect(healthSnapshot(URINE, { exclude: ['sg'] }).map((r) => r.id)).toEqual(['ph', 'protein']);
    // Two areas take turns, the most recently updated first.
    const blood = [
      result('hb', 'Haemoglobin', '13.1', '12 - 15', { category: 'laboratory', date: '2026-09-01', documentId: 'blood' }),
      result('wbc', 'WBC', '7.2', '4 - 11', { category: 'laboratory', date: '2026-09-01', documentId: 'blood' }),
      result('plt', 'Platelets', '250', '150 - 450', { category: 'laboratory', date: '2026-09-01', documentId: 'blood' }),
    ];
    expect(healthSnapshot([...URINE, ...blood], { exclude: ['sg'] }).map((r) => r.id)).toEqual(['ph', 'hb', 'protein', 'wbc']);
    // Only the latest result of a test; nothing held for review.
    const olderPh = result('ph-old', 'pH', '6.5', '4.5 - 8.0', { date: '2025-01-01', documentId: 'old' });
    const heldHb = { ...blood[0], needsReview: true };
    expect(healthSnapshot([olderPh, URINE[0], heldHb]).map((r) => r.id)).toEqual(['ph']);
    expect(healthSnapshot([])).toEqual([]);
    // Descriptive results printed first on the report don't crowd out measured ones.
    const textFirst = [URINE[4], URINE[5], URINE[0], URINE[2]];
    expect(healthSnapshot(textFirst).map((r) => r.id)).toEqual(['ph', 'colour']);
  });

  it('report status is truthful: results held for review are never "No health information found"', () => {
    const done = { status: 'completed' as const };
    expect(presentDocumentStatus({ ...done, healthInfoCount: 14, heldForReviewCount: 24 }).label).toBe('Added to Health Memory');
    expect(presentDocumentStatus({ ...done, healthInfoCount: 0, heldForReviewCount: 36 }).label).toBe('Needs review');
    expect(presentDocumentStatus({ ...done, healthInfoCount: 0, heldForReviewCount: 0 }).label).toBe('No health information found');
    expect(presentDocumentStatus({ ...done, healthInfoCount: 0 }).label).toBe('No health information found');
    expect(presentDocumentStatus({ status: 'processing' }).label).toBe('Reading report');
    expect(presentDocumentStatus({ status: 'failed' }).label).toBe('Failed');
  });

  it('latest activity is never in the future; changes are described from two plain numbers', () => {
    const future = { ...event, id: 'f', date: '2099-01-01' };
    expect(latestActivity([event, future], new Date('2026-10-08'))?.id).toBe('e');
    const change = { type: 'value_change', previousValue: '6.5', currentValue: '7' } as HealthChange;
    expect(describeChange(change)).toBe('Increased since your previous report.');
    expect(describeChange({ ...change, currentValue: '6.1' })).toBe('Decreased since your previous report.');
    expect(describeChange({ ...change, currentValue: '6.5' })).toBe('Unchanged since your previous report.');
    expect(describeChange({ ...change, currentValue: 'Nil', summary: 'As written.' })).toBe('As written.');
  });
});

// ------------------------------------------------------------------ screen --

describe('Home — A. new user', () => {
  it('a calm start: no statistics, results, signals, history or sample data', async () => {
    await renderHome({ snapshot: snapshot(), documents: [], results: [] });
    await waitFor(() => expect(screen.getByText('Your health story starts here.')).toBeTruthy());
    expect(screen.getByText('Add your first health report and AneviaONE will begin connecting the pieces over time.')).toBeTruthy();
    expect(screen.getByText('Add health record')).toBeTruthy();
    for (const id of ['home-glance', 'home-signals', 'home-latest-results', 'home-timeline', 'home-what-changed']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByText('Your health at a glance.')).toBeNull();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
    expect(screen.queryByText(/12 Records|4 Health Areas|3 Years|HbA1c/)).toBeNull();
  });
});

describe('Home — B. early user (one report)', () => {
  beforeEach(() => renderHome({ snapshot: early(), documents: [doc('urine', 'Urine report.pdf')], results: URINE }));

  it('the summary is derived from the real report', async () => {
    await waitFor(() => expect(screen.getByTestId('home-glance')).toBeTruthy());
    expect(screen.getByText('Your health at a glance.')).toBeTruthy();
    expect(screen.getByLabelText('1 Report')).toBeTruthy();
    expect(screen.getByLabelText('6 Results')).toBeTruthy();
    expect(screen.getByLabelText('0 Medications')).toBeTruthy();
    // No ambiguous "Areas" figure on Home.
    expect(screen.queryByTestId('glance-areas')).toBeNull();
    expect(screen.queryByText(/^Areas?$/)).toBeNull();
  });

  it('worth your attention: the result below its printed range, with follow-up wording only', async () => {
    const section = await screen.findByTestId('home-signals');
    const card = within(section).getByTestId('signal-sg');
    expect(within(card).getByText('Specific Gravity')).toBeTruthy();
    expect(within(card).getByText('1.005')).toBeTruthy();
    expect(within(card).getByText('Below the reported range')).toBeTruthy();
    expect(within(card).getByText('Reported range: 1.010–1.030')).toBeTruthy();
    // One shared follow-up line for the section, not one per result.
    expect(within(section).getByTestId('home-signals-advice')).toHaveTextContent('Consider discussing these results with your doctor.');
    expect(within(section).getAllByText(/doctor/)).toHaveLength(1);
    expect(within(section).queryAllByText(UNSAFE)).toHaveLength(0);
    expect(within(section).queryByTestId('signal-ph')).toBeNull();
    await act(async () => {
      fireEvent.press(card);
    });
    expect(router.push).toHaveBeenCalledWith('/documents/urine');
  });

  it('the snapshot shows real results compactly, never repeating an attention item', async () => {
    const section = await screen.findByTestId('home-latest-results');
    expect(within(section).getByText('pH')).toBeTruthy();
    expect(within(section).getByText('7.0')).toBeTruthy();
    expect(within(section).getByText('Range 4.5 - 8.0')).toBeTruthy();
    expect(within(section).getAllByText('06 Oct 2026 · Urine tests').length).toBe(2);
    expect(within(section).queryByText('Specific Gravity')).toBeNull(); // already under Worth your attention
    expect(within(section).queryByText('Sugar')).toBeNull(); // at most two from one area
    await act(async () => {
      fireEvent.press(within(section).getByText('View all results'));
    });
    expect(router.push).toHaveBeenCalledWith('/(tabs)/health');
  });

  it('health history is the real report; What Changed invites, never claims a trend', async () => {
    const history = await screen.findByTestId('home-timeline');
    expect(within(history).getByText('2026')).toBeTruthy();
    expect(within(history).getByText('Latest: 06 Oct · Urine report · 6 results')).toBeTruthy();

    const changed = screen.getByTestId('home-what-changed');
    expect(within(changed).getByText('Your history is just getting started. Add another report to see changes over time.')).toBeTruthy();
    expect(within(changed).queryByText(/Increased|Decreased|View trend/)).toBeNull();
    expect(screen.queryByText(/Nothing to compare yet/)).toBeNull();
  });

  it('Add, profile, Ask, Timeline, summary and recent reports open the existing screens', async () => {
    await waitFor(() => expect(screen.getByTestId('home-glance')).toBeTruthy());
    for (const [id, route] of [
      ['home-add-record', '/add'],
      ['home-profile', '/(tabs)/me'],
      ['home-ask', '/(tabs)/ask'],
      ['glance-reports', '/documents'],
      ['glance-results', '/(tabs)/health'],
      ['glance-medications', '/medications'],
      ['stored-document-urine', '/documents/urine'],
    ]) {
      await act(async () => {
        fireEvent.press(screen.getByTestId(id));
      });
      expect(router.push).toHaveBeenCalledWith(route);
    }
    await act(async () => {
      fireEvent.press(screen.getByText('View Timeline'));
    });
    expect(router.push).toHaveBeenCalledWith('/(tabs)/timeline');
    expect(screen.getByText('Ask about your health records')).toBeTruthy();
    expect(screen.getByText('Added to Health Memory')).toBeTruthy();
    // No review flow exists yet, so no "waiting for your review" call to action.
    expect(screen.queryByText(/waiting for your review/i)).toBeNull();
  });
});

describe('Home — C. established user', () => {
  const history = [
    ...URINE,
    result('ph-old', 'pH', '6.5', '4.5 - 8.0', { date: '2025-03-01', documentId: 'march' }),
    result('sg-old', 'Specific Gravity', '1.004', '1.010 - 1.030', { date: '2025-03-01', documentId: 'march' }),
  ];

  it('shows the change, the history across years and the repeated pattern', async () => {
    await renderHome({ snapshot: established(), documents: [doc('urine'), doc('march')], results: history });
    await waitFor(() => expect(screen.getByTestId('home-change')).toBeTruthy());
    expect(screen.getByLabelText('2 Reports')).toBeTruthy();
    expect(screen.getByLabelText('8 Results')).toBeTruthy();

    const changed = screen.getByTestId('home-what-changed');
    expect(within(changed).getByText('pH')).toBeTruthy();
    expect(within(changed).getByText('Increased since your previous report.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(within(changed).getByTestId('home-view-trend'));
    });
    expect(router.push).toHaveBeenCalledWith('/trends/pH');

    expect(within(screen.getByTestId('home-timeline')).getByText('2025 – 2026')).toBeTruthy();

    const signal = within(screen.getByTestId('home-signals')).getByTestId('signal-sg');
    expect(within(signal).getByText('This result has remained outside the reported range across 2 reports.')).toBeTruthy();
    expect(screen.getByTestId('home-signals-advice')).toHaveTextContent('Consider discussing these results with your doctor.');
  });
});

describe('Home — two areas and held results', () => {
  it('no Areas figure or area names even with several areas; held-only reports say Needs review', async () => {
    const blood = [result('hb', 'Haemoglobin', '13.1', '12 - 15', { category: 'laboratory', documentId: 'blood' })];
    const heldReport = { ...doc('scan', 'Scanned document.pdf'), healthInfoCount: 0, heldForReviewCount: 36 };
    await renderHome({ snapshot: early(), documents: [doc('urine'), heldReport], results: [...URINE, ...blood] });
    await waitFor(() => expect(screen.getByTestId('home-glance')).toBeTruthy());
    expect(screen.queryByTestId('glance-areas')).toBeNull();
    expect(screen.queryByTestId('glance-area-names')).toBeNull();
    expect(screen.queryByLabelText(/Areas?$/)).toBeNull();
    expect(within(screen.getByTestId('stored-document-scan')).getByText('Needs review')).toBeTruthy();
    expect(screen.queryByText('No health information found')).toBeNull();
  });
});

describe('Home — signals stay honest', () => {
  it('nothing outside its range: a quiet note, no warning card', async () => {
    const normal = URINE.filter((r) => r.id !== 'sg');
    await renderHome({ snapshot: early(), documents: [doc('urine')], results: normal });
    await waitFor(() => expect(screen.getByTestId('home-no-signals')).toBeTruthy());
    expect(screen.getByText('No results currently flagged for attention.')).toBeTruthy();
    expect(screen.queryByTestId('home-signals')).toBeNull();
  });

  it('a low-confidence result is neither flagged, counted nor shown', async () => {
    const held = [URINE[0], { ...URINE[1], needsReview: true }];
    await renderHome({ snapshot: early(), documents: [doc('urine')], results: held });
    await waitFor(() => expect(screen.getByTestId('home-glance')).toBeTruthy());
    expect(screen.queryByTestId('home-signals')).toBeNull();
    expect(screen.queryByText('Specific Gravity')).toBeNull();
    expect(screen.getByLabelText('1 Result')).toBeTruthy();
  });

  it('a report still being read: honest empty results, no figures invented', async () => {
    await renderHome({ snapshot: snapshot(), documents: [{ ...doc('new'), status: 'processing', healthInfoCount: null }], results: [] });
    await waitFor(() => expect(screen.getByTestId('home-no-results')).toBeTruthy());
    expect(screen.getByText('Your results appear here once your report has been read.')).toBeTruthy();
    expect(screen.getByLabelText('0 Results')).toBeTruthy();
    expect(screen.queryByTestId('home-signals')).toBeNull();
    expect(screen.queryByTestId('home-no-signals')).toBeNull();
    expect(screen.getByText('Reading report')).toBeTruthy();
  });
});
