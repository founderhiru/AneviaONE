/**
 * Medicines typed in by hand: the form, who may use it, the labels, the prompt on an unread
 * prescription, and what the service sends. (The database rules are tested in supabase/tests.)
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import MedicationFormScreen from '../app/medications/form';
import MedicationsScreen from '../app/medications/index';
import { usePeople } from '../hooks/usePeople';
import { demoMedicationService, medicationService, productionMedicationService } from '../services/health/medicationService';
import { demoMedicationStore } from '../services/health/demoMedicationStore';
import { toMedication } from '../services/health/healthMemoryApi';
import { healthService } from '../services/health/healthService';
import { getSupabaseClient } from '../services/supabaseClient';
import { renderWithAuth } from './testUtils';

jest.mock('../hooks/usePeople', () => ({ usePeople: jest.fn() }));
jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));
jest.mock('../services/people/peopleService', () => ({
  ...jest.requireActual('../services/people/peopleService'),
  getActivePerson: jest.fn(() => ({ id: 'subject-dad', name: 'Dad', relationship: 'father', dateOfBirth: null, access: 'owner' })),
}));

const me = { id: 'me', name: 'Asha', relationship: 'self', dateOfBirth: null, access: 'owner' };
const people = (active: unknown) => (usePeople as jest.Mock).mockReturnValue({ people: [me], active, switchTo: jest.fn(), refresh: jest.fn() });
const med = (over: Record<string, unknown> = {}) =>
  ({ id: 'metformin', name: 'Metformin', dosage: '500 mg', frequency: '1-0-1', status: 'active', recordId: 'rec-1', origin: 'user_entered', ...over }) as never;

beforeEach(() => {
  jest.restoreAllMocks();
  people(me);
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (router.push as jest.Mock).mockClear();
  (router.back as jest.Mock).mockClear();
  (router.canGoBack as jest.Mock | undefined)?.mockReturnValue?.(true);
  demoMedicationStore.reset();
});

describe('add form', () => {
  it('needs only a name, sends exactly what was typed, and goes back', async () => {
    const add = jest.spyOn(medicationService, 'add').mockResolvedValue('new-id');
    await renderWithAuth(<MedicationFormScreen />);
    expect(screen.getByTestId('medication-save').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('medication-name'), 'Telma 40');
    await fireEvent.changeText(screen.getByTestId('medication-frequency'), '1-0-0');
    await fireEvent.press(screen.getByTestId('medication-status-as_needed'));
    await fireEvent.press(screen.getByTestId('medication-save'));
    await waitFor(() => expect(add).toHaveBeenCalledWith({ name: 'Telma 40', dose: '', frequency: '1-0-0', duration: '', instructions: '', prescriber: '', status: 'as_needed' }));
  });

  it('shows the server’s plain message and stays on the form when saving fails', async () => {
    jest.spyOn(medicationService, 'add').mockRejectedValue(new (jest.requireActual('../services/serviceError').ServiceError)('invalid_input', 'One of the entries is too long.'));
    await renderWithAuth(<MedicationFormScreen />);
    await fireEvent.changeText(screen.getByTestId('medication-name'), 'X');
    await fireEvent.press(screen.getByTestId('medication-save'));
    expect(await screen.findByText('One of the entries is too long.')).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('from an unread prescription it offers the original to copy from', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ fromDocument: 'doc-9' });
    await renderWithAuth(<MedicationFormScreen />);
    await fireEvent.press(screen.getByTestId('medication-view-prescription'));
    expect(router.push).toHaveBeenCalledWith('/documents/doc-9');
  });

  it('a viewer or manager of someone else’s record cannot add', async () => {
    people({ id: 'dad', name: 'Dad', relationship: 'father', dateOfBirth: null, access: 'manager' });
    await renderWithAuth(<MedicationFormScreen />);
    expect(screen.getByTestId('medication-not-allowed')).toBeTruthy();
    expect(screen.queryByTestId('medication-form')).toBeNull();
  });

  it('gives no advice and makes no suggestion', async () => {
    await renderWithAuth(<MedicationFormScreen />);
    expect(screen.getByText(/doesn’t check medicine names or doses and doesn’t give advice/)).toBeTruthy();
  });
});

describe('change form', () => {
  beforeEach(() => (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'rec-1' }));

  it('loads the medicine, can mark it stopped, and removes only after a second tap', async () => {
    jest.spyOn(healthService, 'getMedications').mockResolvedValue([med()]);
    const stop = jest.spyOn(medicationService, 'stop').mockResolvedValue('v2');
    const remove = jest.spyOn(medicationService, 'remove').mockResolvedValue();
    await renderWithAuth(<MedicationFormScreen />);
    await waitFor(() => expect(screen.getByTestId('medication-name').props.value).toBe('Metformin'));
    await fireEvent.press(screen.getByTestId('medication-remove'));
    expect(remove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('medication-remove-cancel'));
    await fireEvent.press(screen.getByTestId('medication-stop'));
    await waitFor(() => expect(stop).toHaveBeenCalledWith('rec-1'));
  });

  it('a medicine read from a report can be changed but not removed', async () => {
    jest.spyOn(healthService, 'getMedications').mockResolvedValue([med({ origin: 'extracted' })]);
    await renderWithAuth(<MedicationFormScreen />);
    await waitFor(() => expect(screen.getByTestId('medication-from-report-note')).toBeTruthy());
    expect(screen.queryByTestId('medication-remove')).toBeNull();
    expect(screen.getByTestId('medication-stop')).toBeTruthy();
  });
});

describe('Medications list', () => {
  it('labels what the person added, and opens it to change', async () => {
    jest.spyOn(healthService, 'getMedications').mockResolvedValue([med(), med({ id: 'aspirin', name: 'Aspirin', recordId: 'rec-2', origin: 'extracted', dosage: '75 mg', frequency: undefined })]);
    await renderWithAuth(<MedicationsScreen />);
    await waitFor(() => expect(screen.getByText('Metformin')).toBeTruthy());
    expect(screen.getByTestId('med-origin-metformin').props.children).toBe('Added by you');
    expect(screen.queryByTestId('med-origin-aspirin')).toBeNull();
    await fireEvent.press(screen.getByText('Metformin'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/medications/form', params: { id: 'rec-1' } });
    await fireEvent.press(screen.getByTestId('medications-add'));
    expect(router.push).toHaveBeenCalledWith('/medications/form');
  });

  it('someone who can only look gets no add or change', async () => {
    people({ id: 'dad', name: 'Dad', relationship: 'father', dateOfBirth: null, access: 'viewer' });
    jest.spyOn(healthService, 'getMedications').mockResolvedValue([med({ sourceDocumentId: undefined })]);
    await renderWithAuth(<MedicationsScreen />);
    await waitFor(() => expect(screen.getByText('Metformin')).toBeTruthy());
    expect(screen.queryByTestId('medications-add')).toBeNull();
    await fireEvent.press(screen.getByText('Metformin'));
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('mapping and service', () => {
  it('maps the server’s medicine fields, status and origin', () => {
    const m = toMedication({ key: 'telma', name: 'Telma 40', detail: 'x', firstRecorded: null, lastRecorded: null, recordIds: ['r'], sources: [], instructions: 'after food', prescriber: null, medication: { recordId: 'r', origin: 'user_entered', dose: '40 mg', frequency: '1-0-0', duration: null, status: 'stopped' } } as never);
    expect(m).toMatchObject({ dosage: '40 mg', frequency: '1-0-0', status: 'past', recordId: 'r', origin: 'user_entered', instructions: 'after food' });
    expect(m.duration).toBeUndefined();
  });

  it('adds for the person on screen, trimmed, through the database function', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 'new-id', error: null });
    (getSupabaseClient as jest.Mock).mockReturnValue({ rpc });
    await expect(productionMedicationService.add({ name: '  Telma 40 ', dose: ' 40 mg', status: 'active' })).resolves.toBe('new-id');
    expect(rpc).toHaveBeenCalledWith('add_medication', { p_subject_id: 'subject-dad', p_fields: { name: 'Telma 40', dose: '40 mg', status: 'active' } });
  });

  it('turns the database’s refusals into plain words', async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue({ rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'remove_medication: a medicine read from a report cannot be removed here' } }) });
    await expect(productionMedicationService.remove('r')).rejects.toMatchObject({ userMessage: 'This medicine was read from a report. You can change it or mark it as stopped.' });
  });

  it('demo: a typed-in medicine can be added, stopped and removed in memory', async () => {
    const id = await demoMedicationService.add({ name: 'Telma 40', frequency: '1-0-0' });
    expect(demoMedicationStore.list()).toMatchObject([{ name: 'Telma 40', origin: 'user_entered', status: 'active' }]);
    await demoMedicationService.stop(id);
    expect(demoMedicationStore.list()[0]).toMatchObject({ status: 'past', origin: 'user_corrected' });
    await demoMedicationService.remove(id);
    expect(demoMedicationStore.list()).toEqual([]);
  });
});
