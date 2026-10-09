/**
 * Phase D — identity details (full name + date of birth). Synthetic values
 * only. The rules are pure and shared; the production service reads and
 * saves only the signed-in person's details and never lets the values reach
 * an error or a log; the screen validates first and keeps what was typed.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect } from 'expo-router';

import MeScreen from '../app/(tabs)/me';
import IdentityDetailsScreen from '../app/profile/identity';
import { checkDateOfBirth, checkFullName, splitDate } from '../services/profile/identityValidation';
import { productionProfileService, profileService } from '../services/profile/profileService';
import { ServiceError } from '../services/serviceError';
import { getSupabaseClient } from '../services/supabaseClient';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));

const NAME = 'Test Person Gamma';
const TODAY = '2026-10-08';

beforeEach(() => {
  jest.restoreAllMocks();
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void) => {
    React.useEffect(effect, [effect]);
  });
});

// ---------------------------------------------------------------- rules --

describe('full name rules', () => {
  it('empty means not provided; only surrounding spaces are removed', () => {
    expect(checkFullName('')).toEqual({ ok: true, value: null });
    expect(checkFullName(`  ${NAME}  `)).toEqual({ ok: true, value: NAME });
    expect(checkFullName('Ána-Lúcia O’Brien')).toEqual({ ok: true, value: 'Ána-Lúcia O’Brien' });
    expect(checkFullName('நிலா')).toEqual({ ok: true, value: 'நிலா' });
  });

  it('rejects spaces only, digits only, control characters and over-long names', () => {
    expect(checkFullName('   ')).toMatchObject({ ok: false, error: 'Enter your full name.' });
    expect(checkFullName('12345')).toMatchObject({ ok: false });
    expect(checkFullName('Test\nPerson')).toMatchObject({ ok: false });
    expect(checkFullName('x'.repeat(201))).toMatchObject({ ok: false });
    expect(checkFullName('x'.repeat(200))).toMatchObject({ ok: true });
  });
});

describe('date of birth rules', () => {
  it('all empty means not provided; a real date becomes YYYY-MM-DD', () => {
    expect(checkDateOfBirth('', '', '', TODAY)).toEqual({ ok: true, value: null });
    expect(checkDateOfBirth('7', '3', '1990', TODAY)).toEqual({ ok: true, value: '1990-03-07' });
    expect(checkDateOfBirth('29', '02', '2000', TODAY)).toEqual({ ok: true, value: '2000-02-29' });
    expect(checkDateOfBirth('08', '10', '2026', TODAY)).toEqual({ ok: true, value: TODAY });
  });

  it('rejects partial, impossible, too-early and future dates', () => {
    expect(checkDateOfBirth('7', '', '1990', TODAY)).toMatchObject({ ok: false, error: 'Enter the day, month and year.' });
    expect(checkDateOfBirth('29', '02', '1999', TODAY)).toMatchObject({ ok: false });
    expect(checkDateOfBirth('31', '04', '1990', TODAY)).toMatchObject({ ok: false });
    expect(checkDateOfBirth('10', '13', '1990', TODAY)).toMatchObject({ ok: false });
    expect(checkDateOfBirth('00', '01', '1990', TODAY)).toMatchObject({ ok: false });
    expect(checkDateOfBirth('01', '01', '1899', TODAY)).toMatchObject({ ok: false });
    expect(checkDateOfBirth('01', '01', '90', TODAY)).toMatchObject({ ok: false });
    expect(checkDateOfBirth('aa', '01', '1990', TODAY)).toMatchObject({ ok: false });
    expect(checkDateOfBirth('09', '10', '2026', TODAY)).toMatchObject({ ok: false, error: 'Your date of birth can’t be in the future.' });
  });

  it('a saved date splits back into its fields', () => {
    expect(splitDate('1990-03-07')).toEqual({ day: '07', month: '03', year: '1990' });
    expect(splitDate(null)).toEqual({ day: '', month: '', year: '' });
  });
});

// -------------------------------------------------------------- service --

function fake(rows: { profile?: unknown; health?: unknown } = {}, userId: string | null = 'user-a') {
  const { createFakeSupabase } = jest.requireActual('../test-support/fakeSupabase');
  const client = createFakeSupabase({ userId });
  client.respond('select', { data: rows.profile ?? { full_name: null }, error: null });
  client.respond('select', { data: rows.health ?? null, error: null });
  (client as unknown as { rpc: jest.Mock }).rpc = jest.fn().mockResolvedValue({ data: null, error: null });
  (getSupabaseClient as jest.Mock).mockReturnValue(client);
  return client as typeof client & { rpc: jest.Mock };
}

describe('production identity service', () => {
  it('an existing user with nothing saved reads as empty — nothing invented', async () => {
    const client = fake();
    await expect(productionProfileService.getMyIdentity()).resolves.toEqual({ fullName: null, dateOfBirth: null });
    expect(client.calls.map((c: { table: string; filters: unknown[] }) => [c.table, c.filters])).toEqual([
      ['profiles', [['eq', 'id', 'user-a']]],
      ['health_profiles', [['eq', 'user_id', 'user-a']]],
    ]);
  });

  it('reads only the signed-in person\'s own saved details', async () => {
    fake({ profile: { full_name: NAME }, health: { date_of_birth: '1990-03-07' } });
    await expect(productionProfileService.getMyIdentity()).resolves.toEqual({ fullName: NAME, dateOfBirth: '1990-03-07' });
  });

  it('saves both values in one call, as the signed-in person', async () => {
    const client = fake();
    await productionProfileService.updateMyIdentity({ fullName: `  ${NAME} `, dateOfBirth: '1990-03-07' });
    expect(client.rpc).toHaveBeenCalledWith('set_my_identity', { p_full_name: NAME, p_date_of_birth: '1990-03-07' });
  });

  it('saves a name alone or a date alone', async () => {
    const client = fake();
    await productionProfileService.updateMyIdentity({ fullName: NAME, dateOfBirth: null });
    await productionProfileService.updateMyIdentity({ fullName: null, dateOfBirth: '2000-02-29' });
    expect(client.rpc.mock.calls.map((c: unknown[]) => c[1])).toEqual([
      { p_full_name: NAME, p_date_of_birth: null },
      { p_full_name: null, p_date_of_birth: '2000-02-29' },
    ]);
  });

  it('invalid values are never sent', async () => {
    const client = fake();
    await expect(productionProfileService.updateMyIdentity({ fullName: '   ', dateOfBirth: null })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(productionProfileService.updateMyIdentity({ fullName: null, dateOfBirth: '07/03/1990' })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('a refusal never carries the name or date of birth — not in the message, not in a log', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fake();
    client.rpc.mockResolvedValue({ data: null, error: { message: 'failed', details: `Failing row contains (${NAME}, 1990-03-07)` } });
    const error = await productionProfileService.updateMyIdentity({ fullName: NAME, dateOfBirth: '1990-03-07' }).catch((e) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error.userMessage).toBe('We couldn’t save your identity details. Nothing was changed — please try again.');
    expect(JSON.stringify(warn.mock.calls) + error.message).not.toMatch(/Gamma|1990-03-07/);
  });

  it('not signed in: nothing is read', async () => {
    const client = fake({}, null);
    await expect(productionProfileService.getMyIdentity()).rejects.toMatchObject({ code: 'not_signed_in' });
    expect(client.calls).toEqual([]);
  });
});

// --------------------------------------------------------------- screens --

async function openIdentity(saved = { fullName: null as string | null, dateOfBirth: null as string | null }) {
  jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue(saved);
  await renderWithAuth(<IdentityDetailsScreen />);
  await waitFor(() => expect(screen.getByTestId('identity-save')).toBeTruthy());
}

const type = async (testID: string, text: string) => {
  await fireEvent.changeText(screen.getByTestId(testID), text);
};
const pressSave = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId('identity-save'));
  });
};

describe('Identity details screen', () => {
  it('explains why, and a new user starts empty', async () => {
    await openIdentity();
    expect(screen.getByText(/help us verify that a health report belongs to you before adding it to Health Memory/)).toBeTruthy();
    expect(screen.getByText(/doesn’t verify a report by itself/)).toBeTruthy();
    expect(screen.getByTestId('identity-full-name').props.value).toBe('');
    expect(screen.getByTestId('identity-dob-year').props.value).toBe('');
  });

  it('saved values are shown when returning', async () => {
    await openIdentity({ fullName: NAME, dateOfBirth: '1990-03-07' });
    expect(screen.getByTestId('identity-full-name').props.value).toBe(NAME);
    expect([0, 1, 2].map((i) => screen.getByTestId(['identity-dob-day', 'identity-dob-month', 'identity-dob-year'][i]).props.value)).toEqual(['07', '03', '1990']);
  });

  it('invalid values are rejected on screen and nothing is saved', async () => {
    const update = jest.spyOn(profileService, 'updateMyIdentity');
    await openIdentity();
    await type('identity-full-name', '   ');
    await type('identity-dob-day', '31');
    await type('identity-dob-month', '04');
    await type('identity-dob-year', '1990');
    await pressSave();
    expect(screen.getByText('Enter your full name.')).toBeTruthy();
    expect(screen.getByTestId('identity-dob-error')).toHaveTextContent('That date doesn’t exist. Check the day and month.');
    await type('identity-dob-day', '01');
    await type('identity-dob-month', '01');
    await type('identity-dob-year', '2999');
    await pressSave();
    expect(screen.getByTestId('identity-dob-error')).toHaveTextContent('Your date of birth can’t be in the future.');
    expect(update).not.toHaveBeenCalled();
  });

  it('a valid name and date of birth are saved, with a clear confirmation', async () => {
    const update = jest.spyOn(profileService, 'updateMyIdentity').mockImplementation(async (v) => v);
    await openIdentity();
    await type('identity-full-name', ` ${NAME} `);
    await type('identity-dob-day', '7');
    await type('identity-dob-month', '3');
    await type('identity-dob-year', '1990');
    await pressSave();
    expect(update).toHaveBeenCalledWith({ fullName: NAME, dateOfBirth: '1990-03-07' });
    expect(screen.getByTestId('identity-saved')).toHaveTextContent(/Saved\./);
  });

  it('a failed save keeps what was typed and says nothing changed', async () => {
    jest
      .spyOn(profileService, 'updateMyIdentity')
      .mockRejectedValue(new ServiceError('unknown', 'We couldn’t save your identity details. Nothing was changed — please try again.'));
    await openIdentity();
    await type('identity-full-name', NAME);
    await pressSave();
    expect(screen.getByTestId('identity-save-error')).toHaveTextContent(/Nothing was changed/);
    expect(screen.getByTestId('identity-full-name').props.value).toBe(NAME);
    expect(screen.queryByTestId('identity-saved')).toBeNull();
  });
});

describe('Me — Identity details row', () => {
  it('shows only whether details are added, never the values, and opens the screen', async () => {
    jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue({ fullName: NAME, dateOfBirth: '1990-03-07' });
    await renderWithAuth(<MeScreen />);
    await waitFor(() => expect(screen.getByLabelText('Identity details, Added')).toBeTruthy());
    expect(screen.queryByText(/1990|07\/03|Gamma/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('me-identity'));
    });
    expect(router.push).toHaveBeenCalledWith('/profile/identity');
  });

  it('an incomplete or empty profile is fine — the app is not blocked', async () => {
    jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue({ fullName: null, dateOfBirth: null });
    await renderWithAuth(<MeScreen />);
    await waitFor(() => expect(screen.getByLabelText('Identity details, Not added')).toBeTruthy());
    expect(screen.getByText('My documents')).toBeTruthy();
  });
});
