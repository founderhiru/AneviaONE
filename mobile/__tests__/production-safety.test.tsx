/**
 * Production must never present sample data as the person's own: health,
 * AI and profile services return honest empty/unavailable results, and Home
 * shows its empty-history state.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';

import HomeScreen from '../app/(tabs)/home';
import { ASK_NOT_AVAILABLE_MESSAGE, productionAiService } from '../services/ai/aiService';
import { documentsService } from '../services/documents/documentsService';
import { productionHealthService } from '../services/health/healthService';
import { productionProfileService } from '../services/profile/profileService';
import { ServiceError } from '../services/serviceError';
import { renderWithAuth } from './testUtils';

jest.mock('../services/health/healthService', () => {
  const actual = jest.requireActual('../services/health/healthService');
  return { ...actual, healthService: actual.productionHealthService };
});

describe('productionHealthService', () => {
  it('returns no health facts, trends, changes, timeline or story years', async () => {
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
    ]);
    for (const list of lists) expect(list).toEqual([]);
    expect(await s.getTrendByMetricName('HbA1c')).toBeUndefined();
    expect(await s.getEventById('evt-2026-annual')).toBeUndefined();
  });

  it('counts only real stored documents', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([]);
    expect(await productionHealthService.getHealthProfile()).toMatchObject({
      recordCount: 0,
      documentCount: 0,
      activeMedicationCount: 0,
    });
  });

  it('surfaces document errors instead of substituting numbers', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockRejectedValue(new ServiceError('network', 'offline'));
    await expect(productionHealthService.getHealthProfile()).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('productionAiService', () => {
  it('never answers from sample records and gives no evidence', async () => {
    const result = await productionAiService.askQuestion('What is my HbA1c?');
    expect(result.recordAnswer).toBeUndefined();
    expect(result.aiExplanation?.text).toBe(ASK_NOT_AVAILABLE_MESSAGE);
    expect(await productionAiService.getSuggestedQuestions()).toEqual([]);
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
  it('shows the empty-history state and no sample years/changes/trends', async () => {
    // A person with no stored records yet.
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([]);
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('Your health history starts here.')).toBeTruthy());
    expect(screen.getByText('Add a report, scan or photo to begin building your health memory.')).toBeTruthy();
    expect(screen.getByText('Add Health Record')).toBeTruthy();
    expect(screen.queryByText('2026')).toBeNull();
    expect(screen.queryByText(/HbA1c/)).toBeNull();
  });
});
