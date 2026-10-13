/**
 * Medications from Health Memory carry the dose as written on the report and
 * no frequency, so the list must never show a dangling " · " — and each one
 * opens the report it was read from (provenance).
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import MedicationsScreen from '../app/medications/index';
import { healthService } from '../services/health/healthService';
import { renderWithAuth } from './testUtils';

describe('Medications screen', () => {
  beforeEach(() => {
    jest.spyOn(healthService, 'getMedications').mockResolvedValue([
      { id: 'm1', name: 'Metformin', dosage: '500 mg', status: 'recorded', sourceDocumentId: 'doc-1' },
      { id: 'm2', name: 'Vitamin D3', status: 'recorded' },
    ]);
  });

  it('shows only the details that were recorded', async () => {
    await renderWithAuth(<MedicationsScreen />);
    await waitFor(() => expect(screen.getByText('Metformin')).toBeTruthy());
    expect(screen.getByText('500 mg')).toBeTruthy();
    expect(screen.getByText('As written on your report')).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it('opens the source report of a medication', async () => {
    await renderWithAuth(<MedicationsScreen />);
    await waitFor(() => expect(screen.getByText('Metformin')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Metformin'));
    });
    expect(router.push).toHaveBeenCalledWith('/documents/doc-1');
  });
});
