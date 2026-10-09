/**
 * "What changed?" and Home's summary — derived deterministically from the
 * person's TRUSTED current results and their documents. Synthetic data only.
 */
import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import WhatChangedScreen from '../app/changes/index';
import { formatPercent } from '../components/home/WhatChangedUI';
import { healthService, productionHealthService } from '../services/health/healthService';
import { invalidateHealthMemory } from '../services/health/healthMemoryApi';
import {
  availableGroups,
  buildComparisons,
  formatDifference,
  homeCounts,
  pickHeroComparison,
  resultGroup,
} from '../services/health/whatChanged';
import { getSupabaseClient } from '../services/supabaseClient';
import type { RecordedObservation, StoredDocument } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(() => null), isSupabaseConfigured: false }));

function obs(id: string, name: string, value: string, date: string | null, extra: Partial<RecordedObservation> & { doc?: string } = {}): RecordedObservation {
  const { doc = `doc-${id}`, ...rest } = extra;
  const n = Number(value);
  return {
    id, name, value, unit: 'g/dL', referenceRange: null, date, needsReview: false,
    valueNumeric: Number.isFinite(n) ? n : null, category: 'laboratory',
    source: { documentId: doc, documentName: `${doc}.pdf`, pageNumber: 1 },
    ...rest,
  };
}

function doc(id: string, extra: Partial<StoredDocument> = {}): StoredDocument {
  const at = '2026-10-06T09:00:00.000Z';
  return {
    id, userId: 'u', source: 'upload', documentType: 'unclassified', originalFilename: `${id}.pdf`, mimeType: 'application/pdf',
    fileSizeBytes: 1, storagePath: `u/${id}`, status: 'completed', processingError: null, healthInfoCount: 3,
    uploadedAt: at, createdAt: at, updatedAt: at, ...extra,
  };
}

afterEach(() => jest.restoreAllMocks());

// ------------------------------------------------------------- counts --

describe('Home counts', () => {
  it('one report per document, trusted results only, review vs could-not-read told apart', () => {
    const docs = [
      doc('a'),
      doc('a'), // the same document listed twice (e.g. two reads): one report
      doc('held', { healthInfoCount: 0, heldForReviewCount: 4 }),
      doc('partly', { healthInfoCount: 2, heldForReviewCount: 1 }),
      doc('mismatch', { status: 'failed', failureKind: 'identity_mismatch', healthInfoCount: null }),
      doc('blurry', { status: 'failed', failureKind: 'validation', healthInfoCount: null }),
      doc('needs-consent', { status: 'failed', failureKind: 'consent_required', healthInfoCount: null }),
      doc('pending', { status: 'pending_upload' }),
    ];
    const results = [obs('1', 'Hb', '13.1', '2026-10-01'), obs('2', 'Hb', '13.4', '2026-10-05', { needsReview: true })];
    expect(homeCounts(docs, results)).toEqual({ reports: 6, results: 1, needsReview: 3, couldNotRead: 1 });
  });

  it('results come from current_observations — the view without superseded or held facts', async () => {
    invalidateHealthMemory();
    const { createFakeSupabase } = jest.requireActual('../test-support/fakeSupabase');
    const fake = createFakeSupabase();
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    await productionHealthService.getRecordedObservations();
    expect(fake.calls[0].table).toBe('current_observations');
  });
});

// -------------------------------------------------------- comparisons --

describe('comparisons', () => {
  it('compares the same test in the same unit across two dates, oldest → newest', () => {
    const { numeric } = buildComparisons([
      obs('1', 'Haemoglobin', '13.1', '2026-09-01'),
      obs('2', 'HAEMOGLOBIN', '13.4', '2026-09-20', { unit: 'g / dL' }),
      obs('3', 'Haemoglobin', '13.7', '2026-10-05'),
    ]);
    expect(numeric).toHaveLength(1);
    const c = numeric[0];
    expect(c.points.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-20', '2026-10-05']);
    expect([c.previous.value, c.latest.value]).toEqual([13.4, 13.7]);
    expect(c.direction).toBe('up');
    expect(c.percentChange).toBe(2.2); // (13.7 − 13.4) / 13.4
    expect(c.summary).toBe('Higher than on 20 Sep 2026.');
  });

  it('never compares different units — each unit is its own series', () => {
    const { numeric } = buildComparisons([obs('1', 'HbA1c', '5.8', '2026-03-01', { unit: '%' }), obs('2', 'HbA1c', '40', '2026-09-01', { unit: 'mmol/mol' })]);
    expect(numeric).toEqual([]);
  });

  it('a missing unit on one report is not assumed to match a printed one', () => {
    const { numeric } = buildComparisons([obs('1', 'pH', '6.0', '2026-03-01', { unit: null }), obs('2', 'pH', '7.0', '2026-09-01', { unit: 'pH' })]);
    expect(numeric).toEqual([]);
  });

  it('percent change: none from a zero baseline; difference still shown', () => {
    const [c] = buildComparisons([obs('1', 'Ketones', '0', '2026-03-01', { unit: 'mmol/L' }), obs('2', 'Ketones', '0.4', '2026-09-01', { unit: 'mmol/L' })]).numeric;
    expect(c.percentChange).toBeNull();
    expect(formatDifference(c)).toBe('+0.4 mmol/L');
    const [d] = buildComparisons([obs('1', 'Hb', '14', '2026-03-01'), obs('2', 'Hb', '13', '2026-09-01')]).numeric;
    expect(d.percentChange).toBe(-7.1);
    expect(formatDifference(d)).toBe('−1 g/dL (−7.1%)');
    expect([formatPercent(4.58), formatPercent(-0.42), formatPercent(12.3)]).toEqual(['+5%', '−0.4%', '+12%']);
  });

  it('undated, held and non-numeric results are never compared; undated ones are counted', () => {
    const c = buildComparisons([
      obs('1', 'Hb', '13', null),
      obs('2', 'Hb', '14', '2026-09-01'),
      obs('3', 'Hb', '15', '2026-10-01', { needsReview: true }),
      obs('4', 'Protein', 'Nil', '2026-03-01', { category: 'urine', unit: null }),
      obs('5', 'Protein', 'Trace', '2026-09-01', { category: 'urine', unit: null }),
    ]);
    expect(c.numeric).toEqual([]);
    expect(c.undated).toBe(1);
  });

  it('different values on the same date can’t be ordered: that date is left out', () => {
    const { numeric } = buildComparisons([
      obs('1', 'Hb', '13', '2026-03-01'),
      obs('2', 'Hb', '14', '2026-09-01'),
      obs('3', 'Hb', '12', '2026-09-01'),
    ]);
    expect(numeric).toEqual([]); // only one usable date remains
  });

  it('crossing a report’s own range is stated plainly; staying outside is not repeated', () => {
    const within = (id: string, v: string, d: string) => obs(id, 'Glucose', v, d, { unit: 'mg/dL', referenceRange: '70 - 100', referenceLow: 70, referenceHigh: 100 });
    expect(buildComparisons([within('1', '95', '2026-03-01'), within('2', '112', '2026-09-01')]).numeric[0].rangeNote).toBe('Now above the range printed on its report.');
    expect(buildComparisons([within('1', '112', '2026-03-01'), within('2', '96', '2026-09-01')]).numeric[0].rangeNote).toBe('Now within the range printed on its report.');
    expect(buildComparisons([within('1', '110', '2026-03-01'), within('2', '120', '2026-09-01')]).numeric[0].rangeNote).toBeNull();
  });

  it('imaging findings: as written, side by side on two dates — never a number or a trend', () => {
    const img = (id: string, text: string, date: string) => obs(id, 'Impression', text, date, { category: 'imaging', unit: null });
    const c = buildComparisons([img('1', 'Mild changes noted.', '2026-08-10'), img('2', 'No significant abnormality detected.', '2026-09-25'), img('3', '12 mm nodule', '2026-07-01')]);
    expect(c.numeric).toEqual([]);
    expect(c.findings).toHaveLength(1);
    expect(c.findings[0].entries.map((e) => e.text)).toEqual(['12 mm nodule', 'Mild changes noted.', 'No significant abnormality detected.']);
  });

  it('the hero picks the most recent comparison; groups come from stored categories', () => {
    const results = [obs('1', 'Hb', '13', '2026-03-01'), obs('2', 'Hb', '14', '2026-06-01'), obs('3', 'PCV', '42', '2026-04-01', { unit: '%' }), obs('4', 'PCV', '45', '2026-10-01', { unit: '%' })];
    expect(pickHeroComparison(results)?.name).toBe('PCV');
    expect(pickHeroComparison([obs('1', 'Hb', '13', '2026-03-01')])).toBeNull();
    expect(['laboratory', 'urine', 'imaging', 'vital_sign', null].map((category) => resultGroup({ category }))).toEqual(['lab', 'lab', 'imaging', 'other', 'other']);
    expect(availableGroups([obs('1', 'Hb', '13', '2026-03-01'), obs('2', 'X', 'Normal', '2026-03-01', { category: 'imaging' })])).toEqual(['lab', 'imaging']);
  });
});

// ------------------------------------------------------------- screen --

describe('What changed? screen', () => {
  const HISTORY = [
    obs('hb1', 'Haemoglobin', '13.1', '2025-01-10', { doc: 'jan25' }),
    obs('hb2', 'Haemoglobin', '13.7', '2026-10-05', { doc: 'oct26', referenceRange: '13.0 - 17.5' }),
    obs('x1', 'Chest X-ray', 'Mild changes noted.', '2026-08-10', { category: 'imaging', unit: null, doc: 'xray1' }),
    obs('x2', 'Chest X-ray', 'No significant abnormality detected.', '2026-09-25', { category: 'imaging', unit: null, doc: 'xray2' }),
  ];

  it('shows a loading state while results load', async () => {
    jest.spyOn(healthService, 'getRecordedObservations').mockImplementation(() => new Promise(() => {}));
    await renderWithAuth(<WhatChangedScreen />);
    expect(screen.getByText('Comparing your reports…')).toBeTruthy();
  });

  it('key changes with values, dates, chart and a link to the report', async () => {
    jest.spyOn(healthService, 'getRecordedObservations').mockResolvedValue(HISTORY);
    await renderWithAuth(<WhatChangedScreen />);
    const card = await screen.findByTestId('comparison-lab|haemoglobin|g/dl');
    expect(within(card).getByText('Haemoglobin')).toBeTruthy();
    expect(within(card).getByText('2 results · Lab test')).toBeTruthy();
    expect(within(card).getByText('13.1 g/dL')).toBeTruthy();
    expect(within(card).getByText('13.7 g/dL')).toBeTruthy();
    expect(within(card).getAllByText('10 Jan 2025').length).toBeGreaterThan(0);
    expect(within(card).getByText('+5%')).toBeTruthy();
    expect(within(card).getByTestId('sparkline', { includeHiddenElements: true })).toBeTruthy();
    await act(async () => {
      fireEvent.press(card);
    });
    expect(router.push).toHaveBeenCalledWith('/documents/oct26');
    // The written finding: both texts, as written, no percentage.
    const finding = screen.getByTestId('finding-imaging|chestxray');
    expect(within(finding).getByText('Mild changes noted.')).toBeTruthy();
    expect(within(finding).getByText('No significant abnormality detected.')).toBeTruthy();
    expect(within(finding).queryByText(/%/)).toBeNull();
  });

  it('filters show only the chosen kind; only kinds present are offered', async () => {
    jest.spyOn(healthService, 'getRecordedObservations').mockResolvedValue(HISTORY);
    await renderWithAuth(<WhatChangedScreen />);
    await screen.findByTestId('changes-filter');
    expect(screen.queryByTestId('changes-filter-other')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('changes-filter-imaging'));
    });
    expect(screen.queryByTestId('comparison-lab|haemoglobin|g/dl')).toBeNull();
    expect(screen.getByTestId('finding-imaging|chestxray')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('changes-filter-lab'));
    });
    expect(screen.getByTestId('comparison-lab|haemoglobin|g/dl')).toBeTruthy();
    expect(screen.queryByTestId('finding-imaging|chestxray')).toBeNull();
  });

  it('the period selector really filters by the latest comparison date', async () => {
    jest.spyOn(healthService, 'getRecordedObservations').mockResolvedValue([
      obs('a1', 'Hb', '13', '2024-01-01'),
      obs('a2', 'Hb', '14', '2024-06-01'), // old comparison
      ...HISTORY.slice(2),
    ]);
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: AlertButton[]) => buttons?.find((b) => b.text === 'Last 12 months')?.onPress?.());
    await renderWithAuth(<WhatChangedScreen />);
    await screen.findByTestId('comparison-lab|hb|g/dl');
    await act(async () => {
      fireEvent.press(screen.getByTestId('changes-period'));
    });
    expect(screen.getByText('Last 12 months')).toBeTruthy();
    expect(screen.queryByTestId('comparison-lab|hb|g/dl')).toBeNull();
  });

  it('not enough history: an honest empty state, no chart or percentage', async () => {
    jest.spyOn(healthService, 'getRecordedObservations').mockResolvedValue([obs('1', 'Hb', '13', '2026-09-01'), obs('2', 'PCV', '42', null, { unit: '%' })]);
    await renderWithAuth(<WhatChangedScreen />);
    await waitFor(() => expect(screen.getByText('Not enough comparable history yet.')).toBeTruthy());
    expect(screen.getByText(/Some results have no readable date and can’t be compared/)).toBeTruthy();
    expect(screen.queryByTestId('sparkline', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByText(/%\)|[+−]\d+%/)).toBeNull();
    // Still lists what is tracked, each opening its report.
    await act(async () => {
      fireEvent.press(screen.getByTestId('result-row-1'));
    });
    expect(router.push).toHaveBeenCalledWith('/documents/doc-1');
  });

  it('held results never appear; an error offers a retry', async () => {
    const get = jest.spyOn(healthService, 'getRecordedObservations').mockRejectedValueOnce(new Error('offline'));
    get.mockResolvedValue([obs('1', 'Hb', '13', '2026-03-01'), obs('2', 'Hb', '19', '2026-09-01', { needsReview: true })]);
    await renderWithAuth(<WhatChangedScreen />);
    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'));
    });
    await waitFor(() => expect(screen.getByText('Not enough comparable history yet.')).toBeTruthy());
    expect(screen.queryByText('19 g/dL')).toBeNull();
  });
});
