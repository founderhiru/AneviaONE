/** Prescription details reach the app exactly as written: instructions and the prescribing Doctor. */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';

import MedicationsScreen from '../app/medications/index';
import { toMedication } from '../services/health/healthMemoryApi';
import { healthService } from '../services/health/healthService';
import { renderWithAuth } from './testUtils';

const item = (over: Record<string, unknown> = {}) =>
  ({ key: 'metformin', name: 'Metformin', detail: '500 mg · 1-0-1 · x 30 days', firstRecorded: '2026-03-12', lastRecorded: '2026-03-12', recordIds: ['m1'], sources: [], ...over }) as never;

describe('toMedication', () => {
  it('carries instructions and prescriber when the prescription gave them', () => {
    const med = toMedication(item({ instructions: 'after food', prescriber: 'Dr. Meera Nair' }));
    expect(med.dosage).toBe('500 mg · 1-0-1 · x 30 days');
    expect(med.instructions).toBe('after food');
    expect(med.prescribedBy).toBe('Dr. Meera Nair');
  });
  it('leaves them out for a medicine only mentioned in a report (and for older servers)', () => {
    const med = toMedication(item());
    expect(med.instructions).toBeUndefined();
    expect(med.prescribedBy).toBeUndefined();
  });
});

describe('Medications screen', () => {
  it('shows the schedule as written, the instructions and who prescribed it', async () => {
    jest.spyOn(healthService, 'getMedications').mockResolvedValue([toMedication(item({ instructions: 'after food', prescriber: 'Dr. Meera Nair' }))]);
    await renderWithAuth(<MedicationsScreen />);
    await waitFor(() => expect(screen.getByText('Metformin')).toBeTruthy());
    expect(screen.getByText('500 mg · 1-0-1 · x 30 days')).toBeTruthy();
    expect(screen.getByText('after food')).toBeTruthy();
    expect(screen.getByText('Prescribed by Dr. Meera Nair')).toBeTruthy();
  });
});
