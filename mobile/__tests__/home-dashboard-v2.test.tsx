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
  it('a calm start: no statistics, results, comparisons or sample data', async () => {
    await renderHome({ snapshot: snapshot(), documents: [], results: [] });
    await waitFor(() => expect(screen.getByText('Your health story starts here.')).toBeTruthy());
    expect(screen.getByText('Add your first health report and AneviaONE will begin connecting the pieces over time.')).toBeTruthy();
    expect(screen.getByText('Add health record')).toBeTruthy();
    for (const id of ['home-summary', 'home-what-changed', 'home-latest-results', 'home-review-card']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByText('Your health, over time.')).toBeNull();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });
});

describe('Home — B. early user (one report)', () => {
  beforeEach(() => renderHome({ snapshot: early(), documents: [doc('urine', 'Urine report.pdf')], results: URINE }));

  it('heading and three summary cards from the real report — no Medications, no Areas', async () => {
    await waitFor(() => expect(screen.getByTestId('home-summary')).toBeTruthy());
    expect(screen.getByText('Your health, over time.')).toBeTruthy();
    expect(screen.getByLabelText('1 Report')).toBeTruthy();
    expect(screen.getByLabelText('6 Results')).toBeTruthy();
    expect(screen.getByLabelText('0 Needs review')).toBeTruthy();
    expect(screen.queryByText(/Medications?/)).toBeNull();
    expect(screen.queryByText(/^Areas?$/)).toBeNull();
  });

  it('"What changed?" with one report: an honest invitation, no chart, percentage or trend', async () => {
    const hero = await screen.findByTestId('home-what-changed');
    expect(within(hero).getByText('What changed?')).toBeTruthy();
    expect(within(hero).getByText('Your health story is taking shape.')).toBeTruthy();
    expect(within(hero).getByText('Add another report to start comparing results over time.')).toBeTruthy();
    expect(within(hero).queryByTestId('sparkline', { includeHiddenElements: true })).toBeNull();
    expect(within(hero).queryByText(/%|→/)).toBeNull();
    await act(async () => {
      fireEvent.press(within(hero).getByTestId('home-what-changed-open'));
    });
    expect(router.push).toHaveBeenCalledWith('/changes');
  });

  it('the snapshot shows real results compactly, with filter chips counting real tests', async () => {
    const section = await screen.findByTestId('home-latest-results');
    expect(within(section).getByText('Latest health snapshot')).toBeTruthy();
    expect(within(section).getByLabelText('All (6)')).toBeTruthy();
    expect(within(section).getByLabelText('Lab (6)')).toBeTruthy(); // urine results are lab tests
    expect(within(section).getByLabelText('Imaging (0)')).toBeTruthy();
    expect(within(section).getByLabelText('Other (0)')).toBeTruthy();
    expect(within(section).getAllByText('06 Oct 2026 · Lab test').length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(within(section).getByText('View all'));
    });
    expect(router.push).toHaveBeenCalledWith('/(tabs)/health');
  });

  it('no pending-review card when nothing awaits review', async () => {
    await waitFor(() => expect(screen.getByTestId('home-summary')).toBeTruthy());
    expect(screen.queryByTestId('home-review-card')).toBeNull();
    expect(screen.queryByText(/need your review|needs your review/)).toBeNull();
  });

  it('Add, profile, summary cards, snapshot rows and recent documents open the existing screens', async () => {
    await waitFor(() => expect(screen.getByTestId('home-summary')).toBeTruthy());
    for (const [id, route] of [
      ['home-add-record', '/add'],
      ['home-profile', '/(tabs)/me'],
      ['summary-reports', '/documents'],
      ['summary-results', '/(tabs)/health'],
      ['result-row-ph', '/documents/urine'],
      ['stored-document-urine', '/documents/urine'],
    ]) {
      await act(async () => {
        fireEvent.press(screen.getByTestId(id));
      });
      expect(router.push).toHaveBeenCalledWith(route);
    }
    expect(within(screen.getByTestId('home-recent-records')).getByText('Recent documents')).toBeTruthy();
    expect(screen.getByText('Added to Health Memory')).toBeTruthy();
  });
});

describe('Home — C. established user', () => {
  const history = [
    ...URINE.map((r) => (r.id === 'ph' ? { ...r, valueNumeric: 7 } : r)),
    result('ph-old', 'pH', '6.5', '4.5 - 8.0', { date: '2025-03-01', documentId: 'march', valueNumeric: 6.5 }),
  ];

  it('the hero previews a real comparison: values, dates, chart and a percentage from two numbers', async () => {
    await renderHome({ snapshot: established(), documents: [doc('urine'), doc('march')], results: history });
    const hero = await screen.findByTestId('home-what-changed');
    expect(screen.getByLabelText('2 Reports')).toBeTruthy();
    expect(screen.getByLabelText('7 Results')).toBeTruthy();
    expect(within(hero).getByText('pH')).toBeTruthy();
    expect(within(hero).getByText('6.5 → 7.0')).toBeTruthy();
    expect(within(hero).getByText('+8%')).toBeTruthy(); // (7 − 6.5) / 6.5
    expect(within(hero).getByText('01 Mar 2025')).toBeTruthy();
    expect(within(hero).getByText('06 Oct 2026')).toBeTruthy();
    // Decorative (hidden from screen readers — the card's label carries the values and dates).
    expect(within(hero).getByTestId('sparkline', { includeHiddenElements: true })).toBeTruthy();
    expect(within(hero).queryByText(UNSAFE)).toBeNull();
  });
});

describe('Home — review and trust states', () => {
  it('held results: never counted as results; a review card computed from real documents', async () => {
    const blood = [result('hb', 'Haemoglobin', '13.1', '12 - 15', { category: 'laboratory', documentId: 'blood' })];
    const heldA = { ...doc('scan', 'Scanned document.pdf'), healthInfoCount: 0, heldForReviewCount: 36, identityCheck: 'unverifiable' };
    const heldB = { ...doc('scan2'), healthInfoCount: 0, heldForReviewCount: 2 };
    const mismatch = { ...doc('other'), status: 'failed' as const, failureKind: 'identity_mismatch', healthInfoCount: null };
    await renderHome({ snapshot: early(), documents: [doc('urine'), heldA, heldB, mismatch], results: [...URINE, ...blood, { ...URINE[0], id: 'held-1', needsReview: true }] });
    await waitFor(() => expect(screen.getByTestId('home-summary')).toBeTruthy());
    expect(screen.getByLabelText('4 Reports')).toBeTruthy();
    expect(screen.getByLabelText('7 Results')).toBeTruthy(); // the held result is not counted
    expect(screen.getByLabelText('3 Needs review')).toBeTruthy();
    const card = screen.getByTestId('home-review-card');
    expect(within(card).getByText('3 reports need your review')).toBeTruthy();
    expect(within(card).getByText(/Adding your name and date of birth helps us recognise your reports\./)).toBeTruthy();
    expect(screen.queryByText('No results currently flagged for attention.')).toBeNull();
    await act(async () => {
      fireEvent.press(card);
    });
    expect(router.push).toHaveBeenCalledWith('/documents');
    expect(within(screen.getByTestId('stored-document-scan')).getByText('Needs review')).toBeTruthy();
  });

  it('a single report to review opens that report; a failed read is told apart from review', async () => {
    const failed = { ...doc('blurry'), status: 'failed' as const, failureKind: 'validation', healthInfoCount: null };
    await renderHome({ snapshot: early(), documents: [doc('urine'), failed], results: URINE });
    const card = await screen.findByTestId('home-review-card');
    expect(within(card).getByText('1 report couldn’t be read')).toBeTruthy();
    expect(screen.getByLabelText('0 Needs review')).toBeTruthy();
    await act(async () => {
      fireEvent.press(card);
    });
    expect(router.push).toHaveBeenCalledWith('/documents/blurry');
  });

  it('a report still being read: honest empty results, no figures invented', async () => {
    await renderHome({ snapshot: snapshot(), documents: [{ ...doc('new'), status: 'processing', healthInfoCount: null }], results: [] });
    await waitFor(() => expect(screen.getByTestId('home-no-results')).toBeTruthy());
    expect(screen.getByText('Your results appear here once your report has been read.')).toBeTruthy();
    expect(screen.getByLabelText('0 Results')).toBeTruthy();
    expect(screen.queryByTestId('home-review-card')).toBeNull();
    expect(screen.getByText('Reading report')).toBeTruthy();
  });

  it('results that fail to load: a retry, the rest of Home still works', async () => {
    invalidateHealthMemory();
    const { createFakeSupabase } = jest.requireActual('../test-support/fakeSupabase');
    (getSupabaseClient as jest.Mock).mockReturnValue(createFakeSupabase());
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc('urine')]);
    jest.spyOn(productionHealthService, 'getRecordedObservations').mockRejectedValue(new Error('offline'));
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByTestId('home-results-retry')).toBeTruthy());
    expect(screen.getByLabelText('1 Report')).toBeTruthy();
  });
});

describe('Home — snapshot filters and long findings', () => {
  const xray = result('xr', 'Impression', 'No significant abnormality is seen in the lung fields, cardiac silhouette, costophrenic angles or the bony thorax on this view.', null, {
    category: 'imaging',
    documentId: 'xray',
    date: '2026-09-25',
  });

  it('filters change the rows; long imaging findings are clamped to two lines (full text kept)', async () => {
    await renderHome({ snapshot: early(), documents: [doc('urine'), doc('xray')], results: [...URINE, xray] });
    const section = await screen.findByTestId('home-latest-results');
    await act(async () => {
      fireEvent.press(within(section).getByTestId('home-snapshot-filter-imaging'));
    });
    expect(within(section).getByText('Impression')).toBeTruthy();
    expect(within(section).queryByText('pH')).toBeNull();
    const value = within(section).getByTestId('result-value-xr');
    expect(value.props.numberOfLines).toBe(2);
    expect(value).toHaveTextContent(xray.value);
    await act(async () => {
      fireEvent.press(within(section).getByTestId('home-snapshot-filter-other'));
    });
    expect(within(section).getByTestId('home-snapshot-empty')).toBeTruthy();
    await act(async () => {
      fireEvent.press(within(section).getByTestId('home-snapshot-filter-lab'));
    });
    expect(within(section).queryByText('Impression')).toBeNull();
  });
});
