/**
 * Production must never present sample data as the person's own: health,
 * AI and profile services return honest empty/unavailable results, and Home
 * shows its empty-history state.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';

import HomeScreen from '../app/(tabs)/home';
import { ASK_UNAVAILABLE_MESSAGE, SUGGESTED_QUESTIONS, productionAiService } from '../services/ai/aiService';
import { documentsService } from '../services/documents/documentsService';
import { invalidateHealthMemory } from '../services/health/healthMemoryApi';
import { productionHealthService } from '../services/health/healthService';
import { productionProfileService } from '../services/profile/profileService';
import { ServiceError } from '../services/serviceError';
import { getSupabaseClient } from '../services/supabaseClient';
import { createFakeSupabase, emptyHealthSnapshot } from '../test-support/fakeSupabase';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({
  // An account with no records: health-memory returns an empty snapshot.
  getSupabaseClient: jest.fn(() => {
    const { createFakeSupabase, emptyHealthSnapshot } = jest.requireActual('../test-support/fakeSupabase');
    const fake = createFakeSupabase();
    fake.functions.invoke.mockResolvedValue({ data: emptyHealthSnapshot(), error: null });
    return fake;
  }),
  isSupabaseConfigured: true,
}));
jest.mock('../services/health/healthService', () => {
  const actual = jest.requireActual('../services/health/healthService');
  return { ...actual, healthService: actual.productionHealthService };
});

describe('productionHealthService', () => {
  beforeEach(() => {
    invalidateHealthMemory();
    const fake = createFakeSupabase();
    fake.functions.invoke.mockResolvedValue({ data: emptyHealthSnapshot(), error: null });
    fake.respond('select', { data: [], error: null });
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
  });

  it('an account with no records gets empty facts, trends, changes, timeline and story years — never samples', async () => {
    const s = productionHealthService;
    const lists = await Promise.all([
      s.getWhatChanged(),
      s.getTimeline(),
      s.getTrends(),
      s.getMedications(),
      s.getConditions(),
      s.getAllergies(),
      s.getVaccinations(),
      s.getProcedures(),
      s.getHealthStoryYears(),
      s.getRecordedObservations(),
    ]);
    for (const list of lists) expect(list).toEqual([]);
    expect(await s.getTrendByMetricName('HbA1c')).toBeUndefined();
    expect(await s.getEventById('evt-2026-annual')).toBeUndefined();
  });

  it('counts only real stored documents and records', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([]);
    expect(await productionHealthService.getHealthProfile()).toMatchObject({
      recordCount: 0,
      documentCount: 0,
      activeMedicationCount: 0,
    });
  });

  it('surfaces errors instead of substituting data', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockRejectedValue(new ServiceError('network', 'offline'));
    await expect(productionHealthService.getHealthProfile()).rejects.toBeInstanceOf(ServiceError);
    invalidateHealthMemory();
    (getSupabaseClient as jest.Mock).mockReturnValue(null);
    await expect(productionHealthService.getTimeline()).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('productionAiService', () => {
  it('asks the server and never answers from sample records', async () => {
    const fake = createFakeSupabase();
    fake.functions.invoke.mockResolvedValue({
      data: { status: 'no_data', answer: 'There are no records in your Health Memory yet.', sentences: [], sources: [], generatedBy: 'none' },
      error: null,
    });
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    const result = await productionAiService.askQuestion('What is my HbA1c?');
    expect(fake.functions.invoke).toHaveBeenCalledWith('ask-health', { body: { question: 'What is my HbA1c?' } });
    expect(result.recordAnswer).toBeUndefined();
    expect(result.aiExplanation?.text).toBe('There are no records in your Health Memory yet.');
    expect(await productionAiService.getSuggestedQuestions()).toEqual(SUGGESTED_QUESTIONS);
  });

  it('shows a friendly message when the server is unreachable', async () => {
    const fake = createFakeSupabase();
    fake.functions.invoke.mockResolvedValue({ data: null, error: new Error('fetch failed') });
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
    expect((await productionAiService.askQuestion('x')).aiExplanation?.text).toBe(ASK_UNAVAILABLE_MESSAGE);
  });
});

describe('productionProfileService', () => {
  it('shows every sharing option as off and refuses changes/requests honestly', async () => {
    const settings = await productionProfileService.getDataSharingSettings();
    expect(settings.every((s) => !s.enabled)).toBe(true);
    await expect(productionProfileService.setDataSharingSetting('share-doctor-brief', true)).rejects.toMatchObject({ code: 'not_available' });
    await expect(productionProfileService.requestDataDownload()).rejects.toMatchObject({ code: 'not_available' });
    await expect(productionProfileService.requestAccountDeletion()).rejects.toMatchObject({ code: 'not_available' });
  });
});

describe('Home with no health history (production services)', () => {
  beforeEach(() => {
    invalidateHealthMemory();
    const fake = createFakeSupabase();
    fake.functions.invoke.mockResolvedValue({ data: emptyHealthSnapshot(), error: null });
    (getSupabaseClient as jest.Mock).mockReturnValue(fake);
  });

  it('shows the empty-history state and no sample years/changes/trends', async () => {
    // A person with no stored records yet.
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([]);
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Your health story starts here.')).toBeTruthy());
    expect(screen.getByText('Add health record')).toBeTruthy();
    // No snapshot, timeline or change is drawn for an empty account.
    expect(screen.queryByTestId('home-snapshot')).toBeNull();
    expect(screen.queryByTestId('home-timeline')).toBeNull();
    expect(screen.queryByTestId('home-what-changed')).toBeNull();
    expect(screen.queryByText(/documents?$/)).toBeNull();
    expect(screen.queryByText('2026')).toBeNull();
    expect(screen.queryByText(/HbA1c/)).toBeNull();
  });
});
