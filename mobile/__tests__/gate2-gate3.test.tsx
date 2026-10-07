/**
 * Gates 2–3 in the app: the health-memory snapshot mapped onto Health,
 * Timeline, Trends and What Changed (production), undated events, neutral
 * change text, Ask My Health answers with their sources, and "Needs review".
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import AskScreen from '../app/(tabs)/ask';
import ChangesScreen from '../app/changes/index';
import TrendScreen from '../app/trends/[metric]';
import { aiService, toAskResult } from '../services/ai/aiService';
import { presentDocumentStatus } from '../services/documents/documentsService';
import { invalidateHealthMemory, toChange, toTrend } from '../services/health/healthMemoryApi';
import { healthService, productionHealthService } from '../services/health/healthService';
import { groupTimelineByYear, UNDATED_LABEL } from '../services/health/timeline';
import { toProcessingState } from '../services/processing/processingService';
import { getSupabaseClient } from '../services/supabaseClient';
import { createFakeSupabase, emptyHealthSnapshot } from '../test-support/fakeSupabase';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(() => null), isSupabaseConfigured: true }));

const ev = (documentId: string, page = 1) => ({ documentId, documentName: `${documentId}.pdf`, reportDate: '2026-09-15', pageNumber: page });
const trend = {
  id: 'hba1c|%',
  name: 'HbA1c',
  nameKey: 'hba1c',
  unit: '%',
  points: [
    { date: '2026-03-12', value: 5.8, recordIds: ['r1'], evidence: ev('a') },
    { date: '2026-06-10', value: 6.1, recordIds: ['r2'], evidence: ev('b') },
    { date: '2026-09-15', value: 5.9, recordIds: ['r3'], evidence: ev('c') },
  ],
  direction: 'varied' as const,
  latest: { date: '2026-09-15', value: 5.9 },
  summary: 'The recorded values went up and down between 5.8% and 6.1% across 3 measurements (12 Mar 2026 to 15 Sep 2026); the latest was 5.9%.',
  referenceRange: '4.0 - 5.6',
  otherUnits: ['mmol/mol'],
};
const change = {
  id: 'value:r3',
  type: 'value_change' as const,
  name: 'HbA1c',
  summary: 'Recorded HbA1c decreased from 6.1% (10 Jun 2026) to 5.9% (15 Sep 2026).',
  previousValue: '6.1',
  currentValue: '5.9',
  unit: '%',
  date: '2026-09-15',
  comparedWithDate: '2026-06-10',
  sources: [
    { recordId: 'r3', role: 'current' as const, evidence: ev('c') },
    { recordId: 'r2', role: 'previous' as const, evidence: ev('b') },
  ],
};
const newMed = {
  ...change,
  id: 'new:m1',
  type: 'new_medication' as const,
  name: 'Telmisartan',
  summary: 'Telmisartan appears as a medication in the latest report (15 Sep 2026) and not in earlier records.',
  previousValue: null,
  currentValue: null,
  unit: null,
  comparedWithDate: null,
  sources: [{ recordId: 'm1', role: 'current' as const, evidence: ev('c', 2) }],
};
const snapshot = () => ({
  ...emptyHealthSnapshot(),
  memory: {
    ...emptyHealthSnapshot().memory,
    conditions: [{ key: 'diabetes', name: 'Diabetes', detail: 'Recorded as mentioned', firstRecorded: '2026-03-12', lastRecorded: '2026-03-12', recordIds: ['c1'], sources: [ev('a', 2)] }],
    medications: [{ key: 'telmisartan', name: 'Telmisartan', detail: '40 mg', firstRecorded: '2026-09-15', lastRecorded: '2026-09-15', recordIds: ['m1'], sources: [ev('c', 2)] }],
    counts: { records: 9, reports: 3 },
  },
  timeline: [
    { id: 'report:c', type: 'report', date: '2026-09-15', title: 'c.pdf', summary: '2 test results', documentId: 'c', recordIds: ['r3'] },
    { id: 'report:u', type: 'report', date: null, title: 'Undated note.pdf', summary: '1 test result', documentId: 'u', recordIds: ['r9'] },
  ],
  trends: [trend],
  changes: { status: 'ok', latest: null, previous: null, changes: [change, newMed] },
});

function useSnapshot(data: unknown = snapshot()) {
  invalidateHealthMemory();
  const fake = createFakeSupabase();
  fake.functions.invoke.mockResolvedValue({ data, error: null });
  (getSupabaseClient as jest.Mock).mockReturnValue(fake);
  return fake;
}

beforeEach(() => {
  jest.restoreAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

describe('production Gate 2 mapping', () => {
  it('trends keep units separate and say so; direction "varied" is not forced up or down', () => {
    expect(toTrend(trend)).toMatchObject({ metricName: 'HbA1c', unit: '%', currentValue: 5.9, direction: 'mixed', otherUnits: ['mmol/mol'], referenceRange: '4.0 - 5.6' });
    expect(toTrend(trend).points.map((p) => p.sourceDocumentId)).toEqual(['a', 'b', 'c']);
  });

  it('changes carry their neutral sentence and both source documents', () => {
    expect(toChange(change)).toMatchObject({ summary: change.summary, sourceDocumentId: 'c', comparedSourceDocumentId: 'b', previousValue: '6.1', currentValue: '5.9' });
  });

  it('the service reads one snapshot from health-memory for every Gate 2 view', async () => {
    const fake = useSnapshot();
    const s = productionHealthService;
    expect((await s.getConditions())[0]).toMatchObject({ name: 'Diabetes', assertion: 'mentioned', status: 'unknown' });
    expect((await s.getMedications())[0]).toMatchObject({ name: 'Telmisartan', dosage: '40 mg', status: 'recorded' });
    expect((await s.getTimeline()).map((e) => e.date)).toEqual(['2026-09-15', null]);
    expect(await s.getHealthStoryYears()).toEqual(['2026']);
    expect((await s.getTrendByMetricName('hba1c'))?.metricName).toBe('HbA1c');
    expect((await s.getWhatChanged()).map((c) => c.type)).toEqual(['value_change', 'new_medication']);
    expect(fake.functions.invoke).toHaveBeenCalledTimes(1); // cached
    expect(fake.functions.invoke).toHaveBeenCalledWith('health-memory', { body: {} });
  });

  it('undated events are grouped last and never given a date', () => {
    const groups = groupTimelineByYear([
      { id: 'u', type: 'report', title: 'Undated', date: null },
      { id: 'b', type: 'report', title: 'B', date: '2025-01-01' },
      { id: 'a', type: 'report', title: 'A', date: '2026-02-01' },
    ]);
    expect(groups.map((g) => [g.year, g.events.map((e) => e.id)])).toEqual([['2026', ['a']], ['2025', ['b']], [UNDATED_LABEL, ['u']]]);
  });
});

describe('Gate 2 screens with real data', () => {
  it('What Changed shows neutral sentences and links to evidence', async () => {
    jest.spyOn(healthService, 'getWhatChanged').mockResolvedValue([toChange(change), toChange(newMed)]);
    await renderWithAuth(<ChangesScreen />);
    await waitFor(() => expect(screen.getByText(change.summary)).toBeTruthy());
    expect(screen.getByText('New medication')).toBeTruthy();
    expect(screen.getByText(newMed.summary)).toBeTruthy();
    expect(screen.queryByText(/worse|better|improv/i)).toBeNull();
  });

  it('a trend shows the printed range and the separate-unit note', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ metric: 'HbA1c' });
    jest.spyOn(healthService, 'getTrendByMetricName').mockResolvedValue(toTrend(trend));
    await renderWithAuth(<TrendScreen />);
    await waitFor(() => expect(screen.getByText(trend.summary)).toBeTruthy());
    expect(screen.getByText('Range printed on the latest report: 4.0 - 5.6')).toBeTruthy();
    expect(screen.getByText(/Also recorded in mmol\/mol — shown separately, not converted/)).toBeTruthy();
  });
});

describe('Ask My Health', () => {
  const answered = {
    status: 'answered' as const,
    answer: 'Medications recorded in your reports: Telmisartan 40 mg — 15 Sep 2026.',
    sources: [{ documentId: 'c', documentName: 'Report C.pdf', pageNumber: 2, excerpt: 'Telmisartan 40 mg once daily' }],
    generatedBy: 'records' as const,
  };

  it('maps grounded answers to record answers with evidence; limitations to explanations', () => {
    expect(toAskResult(answered).recordAnswer).toEqual({
      text: answered.answer,
      wordedByAi: false,
      evidence: [{ documentId: 'c', documentTitle: 'Report C.pdf', pageNumber: 2, excerpt: 'Telmisartan 40 mg once daily' }],
    });
    expect(toAskResult({ status: 'safety', answer: 'I can’t give treatment advice.', sources: [], generatedBy: 'none' })).toEqual({ aiExplanation: { text: 'I can’t give treatment advice.' } });
  });

  it('shows each source (report, page, excerpt) and opens the report', async () => {
    jest.spyOn(aiService, 'getSuggestedQuestions').mockResolvedValue(['What medications have I taken?']);
    jest.spyOn(aiService, 'askQuestion').mockResolvedValue({ ...toAskResult({ ...answered, generatedBy: 'ai' }) });
    await renderWithAuth(<AskScreen />);
    await waitFor(() => expect(screen.getByText('What medications have I taken?')).toBeTruthy());
    await fireEvent.press(screen.getByText('What medications have I taken?'));
    await waitFor(() => expect(screen.getByText(answered.answer)).toBeTruthy());
    expect(screen.getByText('From your records · worded by AI')).toBeTruthy();
    expect(screen.getByText('“Telmisartan 40 mg once daily”')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Source: Report C.pdf, page 2'));
    expect(router.push).toHaveBeenCalledWith('/documents/c');
  });

  it('an unreachable server never leaves the screen stuck', async () => {
    jest.spyOn(aiService, 'getSuggestedQuestions').mockResolvedValue(['Show my recent health history.']);
    jest.spyOn(aiService, 'askQuestion').mockRejectedValue(new Error('offline'));
    await renderWithAuth(<AskScreen />);
    await waitFor(() => expect(screen.getByText('Show my recent health history.')).toBeTruthy());
    await fireEvent.press(screen.getByText('Show my recent health history.'));
    await waitFor(() => expect(screen.getByText('I couldn’t reach your records just now. Please try again.')).toBeTruthy());
  });
});

describe('Needs review', () => {
  it('a report that may belong to someone else is "Needs review", not a generic failure', () => {
    expect(presentDocumentStatus({ status: 'failed', failureKind: 'identity_mismatch' }).label).toBe('Needs review');
    expect(presentDocumentStatus({ status: 'failed', failureKind: 'provider' }).label).toBe('Failed');
    expect(toProcessingState({ status: 'failed', failure_kind: 'identity_mismatch', processing_error: 'This report may belong to someone else.', processing_attempts: 1 }, null)).toEqual({
      phase: 'needs_review',
      message: 'This report may belong to someone else.',
    });
  });
});
