/**
 * The event screen reloads whenever it is shown. On the iOS simulator, a
 * report deleted from "View Original Document" left the event screen beneath
 * it still listing the deleted results on Back.
 */
import React from 'react';
import { act, screen, waitFor } from '@testing-library/react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import EventDetailScreen from '../app/timeline/[id]';
import { healthService } from '../services/health/healthService';
import type { HealthEvent } from '../types';
import { renderWithAuth } from './testUtils';

const EVENT = { id: 'e1', title: 'Lab tests', date: '2026-03-12', type: 'lab_test', sourceDocumentId: 'doc-1' } as unknown as HealthEvent;

it('after the report behind it is deleted, coming back shows that it is gone — not the old results', async () => {
  let refocus: () => void = () => {};
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void) => {
    refocus = effect;
    React.useEffect(effect, [effect]);
  });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'e1' });
  const getEvent = jest.spyOn(healthService, 'getEventById').mockResolvedValue(EVENT);
  jest.spyOn(healthService, 'getEventObservations').mockResolvedValue([
    { id: 'o1', name: 'Fasting Blood Glucose', value: '106', unit: 'mg/dL' } as never,
  ]);

  await renderWithAuth(<EventDetailScreen />);
  await waitFor(() => expect(screen.getByText('Fasting Blood Glucose')).toBeTruthy());

  // The report is deleted on a screen above; Back brings this one into focus again.
  getEvent.mockResolvedValue(undefined);
  await act(async () => {
    refocus();
  });

  await waitFor(() => expect(screen.getByTestId('event-gone')).toBeTruthy());
  expect(screen.queryByText('Fasting Blood Glucose')).toBeNull();
});
