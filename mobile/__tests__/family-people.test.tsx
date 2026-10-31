/**
 * Family: the app only ever shows ONE person's records at a time, uploads never
 * land on the wrong record, and the people / invite / approval flows go through
 * the server functions. (Database-level isolation is tested in supabase/tests.)
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import DoctorScreen from '../app/(tabs)/doctor';
import FamilyScreen from '../app/family';
import { documentsService } from '../services/documents/documentsService';
import { healthService } from '../services/health/healthService';
import { profileService } from '../services/profile/profileService';
import { PersonBar } from '../components';
import { supabaseDocumentsService } from '../services/documents/supabaseDocumentsService';
import { getSnapshot, invalidateHealthMemory } from '../services/health/healthMemoryApi';
import { productionHealthService } from '../services/health/healthService';
import { setActiveSubjectId } from '../services/people/activeSubject';
import { toIsoDate } from '../services/people/dates';
import { getActivePerson, peopleService as appPeopleService, productionPeopleService as peopleService, type PeopleService } from '../services/people/peopleService';
import { getSupabaseClient } from '../services/supabaseClient';
import { createFakeSupabase, emptyHealthSnapshot, TEST_USER_ID, type FakeSupabase } from '../test-support/fakeSupabase';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { push: jest.fn(), back: jest.fn() } }));

const ME = '33333333-3333-4333-8333-333333333331';
const DAD = '33333333-3333-4333-8333-333333333332';
const SHARED = '33333333-3333-4333-8333-333333333333';
const OTHER_USER = '44444444-4444-4444-8444-444444444444';

const subjectRows = [
  { id: ME, display_name: 'Asha', relationship: 'self', date_of_birth: '1985-03-14', linked_user_id: TEST_USER_ID, created_by: TEST_USER_ID },
  { id: DAD, display_name: 'Dad', relationship: 'father', date_of_birth: '1952-01-09', linked_user_id: null, created_by: TEST_USER_ID },
  { id: SHARED, display_name: 'Meera', relationship: 'self', date_of_birth: null, linked_user_id: OTHER_USER, created_by: OTHER_USER },
];
const grantRows = [{ subject_id: SHARED, role: 'viewer', status: 'active', expires_at: null }];

let supabase: FakeSupabase;
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  supabase = createFakeSupabase();
  (getSupabaseClient as jest.Mock).mockReturnValue(supabase);
  setActiveSubjectId(null);
  // Screens use the app's service (the demo one under test); route it to the real implementation.
  for (const key of Object.keys(peopleService) as (keyof PeopleService)[]) {
    jest.spyOn(appPeopleService, key).mockImplementation(peopleService[key] as never);
  }
});

async function loadPeople() {
  supabase.respond('select', { data: subjectRows, error: null });
  supabase.respond('select', { data: grantRows, error: null });
  return peopleService.refresh();
}

describe('people', () => {
  it('lists me first, then relatives I manage, then people who shared theirs — and chooses me', async () => {
    const people = await loadPeople();
    expect(people.map((p) => [p.name, p.access])).toEqual([['Asha', 'owner'], ['Dad', 'owner'], ['Meera', 'viewer']]);
    expect(getActivePerson()?.id).toBe(ME);
  });

  it('an expired or non-active grant gives nothing: the person is not listed as accessible with a role', async () => {
    supabase.respond('select', { data: subjectRows.slice(0, 2), error: null });
    supabase.respond('select', { data: [], error: null });
    expect((await peopleService.refresh()).map((p) => p.id)).toEqual([ME, DAD]);
  });

  it('before the family tables exist, nobody is chosen and reads are not narrowed', async () => {
    supabase.respond('select', { data: null, error: { code: '42P01', message: 'relation "subjects" does not exist' } });
    supabase.respond('select', { data: null, error: { code: '42P01', message: 'x' } });
    expect(await peopleService.refresh()).toEqual([]);
    expect(getActivePerson()).toBeNull();
    supabase.calls.length = 0;
    supabase.respond('select', { data: [], error: null });
    await supabaseDocumentsService.listDocuments();
    expect(supabase.calls.find((c) => c.table === 'documents')?.filters.some(([, col]) => col === 'subject_id')).toBe(false);
  });

  it('adds a relative through the server function, with the authority confirmation', async () => {
    supabase.respondRpc({ data: DAD, error: null });
    supabase.respond('select', { data: subjectRows, error: null });
    supabase.respond('select', { data: grantRows, error: null });
    const id = await peopleService.createRelative({ name: '  Dad ', relationship: 'father', dateOfBirth: '1952-01-09', authorityConfirmed: true });
    expect(id).toBe(DAD);
    expect(supabase.rpcCalls[0]).toEqual({ name: 'create_relative', args: { p_name: 'Dad', p_relationship: 'father', p_date_of_birth: '1952-01-09', p_authority_confirmed: true } });
  });

  it('a code that does not work returns false; rate limiting reads as a clear message', async () => {
    supabase.respondRpc({ data: null, error: null });
    expect(await peopleService.redeemInvite('0000-0000-0000')).toBe(false);
    supabase.respondRpc({ data: null, error: { message: 'too many attempts, try again later' } });
    await expect(peopleService.redeemInvite('1111-1111-1111')).rejects.toMatchObject({ userMessage: expect.stringMatching(/too many attempts/i) });
  });
});

describe('every read is limited to the person on screen', () => {
  it('reports', async () => {
    await loadPeople();
    peopleService.switchTo(DAD);
    supabase.calls.length = 0;
    supabase.respond('select', { data: [], error: null });
    await supabaseDocumentsService.listDocuments();
    expect(supabase.calls.find((c) => c.table === 'documents')?.filters).toContainEqual(['eq', 'subject_id', DAD]);
  });

  it('results', async () => {
    await loadPeople();
    peopleService.switchTo(DAD);
    supabase.calls.length = 0;
    supabase.respond('select', { data: [], error: null });
    await productionHealthService.getRecordedObservations();
    expect(supabase.calls.find((c) => c.table === 'current_observations')?.filters).toContainEqual(['eq', 'subject_id', DAD]);
  });

  it('Health Memory asks for that person, and a cached snapshot is never served to another person', async () => {
    await loadPeople();
    invalidateHealthMemory();
    const invoke = supabase.functions.invoke;
    invoke.mockResolvedValue({ data: emptyHealthSnapshot(), error: null });
    await getSnapshot();
    expect(invoke).toHaveBeenLastCalledWith('health-memory', { body: { subject_id: ME } });
    peopleService.switchTo(DAD);
    await getSnapshot();
    expect(invoke).toHaveBeenLastCalledWith('health-memory', { body: { subject_id: DAD } });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('a report can only be added to my own record, never silently while viewing someone else', async () => {
    await loadPeople();
    peopleService.switchTo(DAD);
    supabase.calls.length = 0;
    await expect(
      supabaseDocumentsService.uploadDocument({ uri: 'file:///a.pdf', name: 'a.pdf', mimeType: 'application/pdf', size: 100 }),
    ).rejects.toMatchObject({ code: 'not_available' });
    expect(supabase.calls).toHaveLength(0);
  });
});

describe('PersonBar', () => {
  it('is hidden when the account has only one person', async () => {
    supabase.respond('select', { data: subjectRows.slice(0, 1), error: null });
    supabase.respond('select', { data: [], error: null });
    await peopleService.refresh();
    await renderWithAuth(<PersonBar />);
    expect(screen.queryByTestId('person-bar')).toBeNull();
  });

  it('says clearly whose records are shown, and goes back to mine', async () => {
    await loadPeople();
    await renderWithAuth(<PersonBar />);
    expect(screen.queryByTestId('person-banner')).toBeNull();
    fireEvent.press(screen.getByTestId('person-switch'));
    fireEvent.press(await screen.findByTestId(`person-option-${SHARED}`));
    expect(await screen.findByText('Viewing Meera’s records (view only)')).toBeTruthy();
    fireEvent.press(screen.getByTestId('person-back'));
    await waitFor(() => expect(screen.queryByTestId('person-banner')).toBeNull());
    expect(getActivePerson()?.id).toBe(ME);
  });
});

describe('Family screen', () => {
  async function open(extra: () => void = () => undefined) {
    await loadPeople();
    // refresh() again on open: subjects + grants, then access list per person I own (2).
    supabase.respond('select', { data: subjectRows, error: null });
    supabase.respond('select', { data: grantRows, error: null });
    supabase.respondRpc({ data: [], error: null });
    supabase.respondRpc({ data: [], error: null });
    extra();
    await renderWithAuth(<FamilyScreen />);
    await screen.findByText('Add a relative');
  }

  it('will not add a relative without the authority confirmation', async () => {
    await open();
    fireEvent.press(screen.getByTestId('family-add'));
    await screen.findByTestId('family-add-form');
    fireEvent.changeText(screen.getByTestId('family-name'), 'Mum');
    await screen.findByDisplayValue('Mum');
    fireEvent.press(screen.getByTestId('family-rel-mother'));
    await waitFor(() => expect(screen.getByTestId('family-rel-mother').props.accessibilityState.selected).toBe(true));
    fireEvent.press(screen.getByTestId('family-save'));
    await waitFor(() => expect(screen.getByTestId('family-add-error')).toHaveTextContent(/allowed to manage/i));
    expect(supabase.rpcCalls.some((c) => c.name === 'create_relative')).toBe(false);
  });

  it('shows an invite code once and offers to share it', async () => {
    await open(() => undefined);
    supabase.respondRpc({ data: 'ABCD-1234-EF56', error: null });
    fireEvent.press(screen.getByTestId(`family-invite-view-${DAD}`));
    expect(await screen.findByTestId('family-invite-code')).toHaveTextContent('ABCD-1234-EF56');
    expect(supabase.rpcCalls.find((c) => c.name === 'create_access_invite')?.args).toEqual({ p_subject: DAD, p_role: 'viewer' });
    expect(screen.getByTestId('family-share-code')).toBeTruthy();
  });

  it('a request waits for approval, which names what they asked for', async () => {
    await loadPeople();
    supabase.respond('select', { data: subjectRows, error: null });
    supabase.respond('select', { data: grantRows, error: null });
    supabase.respondRpc({ data: [{ grant_id: 'g1', grantee_name: 'Ravi', role: 'manager', status: 'requested', requested_at: '2026-10-31T00:00:00Z', expires_at: null }], error: null });
    supabase.respondRpc({ data: [], error: null });
    await renderWithAuth(<FamilyScreen />);
    expect(await screen.findByText(/Ravi asked to help manage your records/)).toBeTruthy();
    expect(screen.getByText('They see nothing until you approve.')).toBeTruthy();
    supabase.respondRpc({ data: null, error: null });
    fireEvent.press(screen.getByTestId('family-approve-g1'));
    await waitFor(() => expect(supabase.rpcCalls.some((c) => c.name === 'approve_access' && (c.args as { p_grant: string }).p_grant === 'g1')).toBe(true));
  });
});

describe('date of birth', () => {
  it('turns day / month / year into an ISO date, and refuses impossible or future dates', () => {
    const today = new Date('2026-10-31T00:00:00Z');
    expect(toIsoDate('9', '1', '1952', today)).toBe('1952-01-09');
    expect(toIsoDate('', '', '', today)).toBeNull();
    expect(toIsoDate('31', '2', '2020', today)).toBeUndefined();
    expect(toIsoDate('1', '1', '2027', today)).toBeUndefined();
    expect(toIsoDate('1', '13', '2000', today)).toBeUndefined();
    expect(toIsoDate('1', '1', '99', today)).toBeUndefined();
  });
});

describe('For Doctor names the person on screen', () => {
  it('uses the relative’s name and date of birth, never the signed-in account’s', async () => {
    await loadPeople();
    peopleService.switchTo(DAD);
    jest.spyOn(healthService, 'getRecordedObservations').mockResolvedValue([]);
    jest.spyOn(healthService, 'getMedications').mockResolvedValue([{ id: 'm1', name: 'Metformin' } as never]);
    jest.spyOn(healthService, 'getConditions').mockResolvedValue([]);
    jest.spyOn(healthService, 'getAllergies').mockResolvedValue([]);
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([]);
    jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue({ fullName: 'Asha Testwell', dateOfBirth: '1985-03-14' });
    await renderWithAuth(<DoctorScreen />);
    const who = await screen.findByTestId('doctor-person');
    expect(who).toHaveTextContent(/Dad/);
    expect(who).toHaveTextContent(/Born.*1952/);
    expect(who).not.toHaveTextContent(/1985/);
    expect(who).not.toHaveTextContent(/Asha/);
  });
});
