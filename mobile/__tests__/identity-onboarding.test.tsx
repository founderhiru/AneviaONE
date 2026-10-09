/**
 * Optional identity onboarding: "Set up your health profile" once after the
 * first sign-in, and a one-time "Help us recognize your record" note before
 * the first upload. Both are optional, never write placeholder values, and
 * never touch documents, Health Memory or the trust rules. Synthetic values
 * only.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router, useSegments } from 'expo-router';

import RootLayout from '../app/_layout';
import AddRecordScreen from '../app/add/index';
import HealthProfileSetupScreen from '../app/profile/setup';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/auth/authService';
import { supabaseAuthService, toDomainUser } from '../services/auth/supabaseAuthService';
import { documentsService } from '../services/documents/documentsService';
import { profileService } from '../services/profile/profileService';
import { ServiceError } from '../services/serviceError';
import { getSupabaseClient } from '../services/supabaseClient';
import type { IdentityProfile, User } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(() => null), isSupabaseConfigured: false }));

const NAME = 'Test Person Delta';
const EMPTY: IdentityProfile = { fullName: null, dateOfBirth: null };

const user = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'synthetic@example.com',
  createdAt: '2026-10-01T10:00:00Z',
  linkedIdentities: [{ provider: 'google', displayValue: 's•••@example.com', linkedAt: '2026-10-01T10:00:00Z' }],
  onboardingComplete: true,
  identityOnboardingComplete: true,
  identityUploadPromptSeen: true,
  ...overrides,
});

let saveFlags: jest.SpyInstance;

beforeEach(() => {
  jest.restoreAllMocks();
  (useSegments as jest.Mock).mockReturnValue([]);
  saveFlags = jest.spyOn(authService, 'saveOnboardingFlags').mockResolvedValue();
});

// ------------------------------------------------------------- routing --

async function launch(signedIn: User | null, segments: string[] = []) {
  (useSegments as jest.Mock).mockReturnValue(segments);
  jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(signedIn);
  await act(async () => {
    await render(<RootLayout />);
  });
  await waitFor(() => expect(authService.getCurrentUser).toHaveBeenCalled());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

describe('first-login routing', () => {
  it('an authenticated account that has not seen the step → Set up your health profile', async () => {
    await launch(user({ identityOnboardingComplete: false }));
    expect(router.replace).toHaveBeenCalledWith('/profile/setup');
    expect(router.replace).not.toHaveBeenCalledWith('/(tabs)/home');
  });

  it('an existing, long-onboarded account sees it once too (it is new)', async () => {
    await launch(user({ identityOnboardingComplete: false }), ['(tabs)', 'home']);
    expect(router.replace).toHaveBeenCalledWith('/profile/setup');
  });

  it('a brand-new account sees the step first, then the existing intro', async () => {
    await launch(user({ identityOnboardingComplete: false, onboardingComplete: false }));
    expect(router.replace).toHaveBeenCalledWith('/profile/setup');
    expect(router.replace).not.toHaveBeenCalledWith('/(auth)/onboarding');
  });

  it('already on the step: no redirect, so no Identity → Identity loop', async () => {
    await launch(user({ identityOnboardingComplete: false }), ['profile', 'setup']);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('once completed or skipped, the step gives way to Home', async () => {
    await launch(user(), ['profile', 'setup']);
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/home');
    expect(router.replace).not.toHaveBeenCalledWith('/profile/setup');
  });

  it('once done, a brand-new account continues to the existing intro', async () => {
    await launch(user({ onboardingComplete: false }), ['profile', 'setup']);
    expect(router.replace).toHaveBeenCalledWith('/(auth)/onboarding');
  });

  it('relaunch after the step goes straight to Home', async () => {
    await launch(user());
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/home');
    expect(router.replace).not.toHaveBeenCalledWith('/profile/setup');
  });

  it('moving around the app after the step never brings it back', async () => {
    for (const segments of [['(tabs)', 'home'], ['(tabs)', 'me'], ['add'], ['profile', 'identity']]) {
      jest.clearAllMocks();
      await launch(user(), segments);
      expect(router.replace).not.toHaveBeenCalled();
    }
  });

  it('signed out never reaches the step — Welcome, as before', async () => {
    await launch(null, ['profile', 'setup']);
    expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome');
    expect(router.replace).not.toHaveBeenCalledWith('/profile/setup');
  });
});

// ---------------------------------------------------------- setup step --

/** Exposes the in-memory account, so tests see what the navigator sees. */
let currentUser: () => User | null = () => null;
function CaptureUser() {
  const { user: current } = useAuth();
  currentUser = () => current;
  return null;
}

async function openSetup(saved: IdentityProfile = EMPTY) {
  jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(user({ identityOnboardingComplete: false }));
  jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue(saved);
  await renderWithAuth(
    <>
      <HealthProfileSetupScreen />
      <CaptureUser />
    </>
  );
  await waitFor(() => expect(currentUser()).not.toBeNull());
}

const type = async (testID: string, text: string) => {
  await fireEvent.changeText(screen.getByTestId(testID), text);
};
const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};
const typeDate = async (d: string, m: string, y: string) => {
  await type('identity-dob-day', d);
  await type('identity-dob-month', m);
  await type('identity-dob-year', y);
};
const expectStepDone = () => {
  expect(saveFlags).toHaveBeenCalledWith({ identityOnboardingComplete: true });
  expect(currentUser()?.identityOnboardingComplete).toBe(true);
};
const expectStepNotDone = () => {
  expect(saveFlags).not.toHaveBeenCalled();
  expect(currentUser()?.identityOnboardingComplete).toBe(false);
};

describe('Set up your health profile', () => {
  it('reads as a calm, optional step — Full name, structured date, Continue and Skip', async () => {
    await openSetup();
    await waitFor(() => expect(screen.getByTestId('setup-continue')).toBeTruthy());
    expect(screen.getByText('Set up your health profile')).toBeTruthy();
    expect(screen.getByText(/Add a few details to help .+ recognize your health records accurately\./)).toBeTruthy();
    expect(screen.getByText('Full name')).toBeTruthy();
    expect(screen.getByText('As it appears on your health records')).toBeTruthy();
    expect(screen.getByText('Date of birth')).toBeTruthy();
    expect(screen.getByTestId('identity-dob-day')).toBeTruthy();
    expect(screen.getByTestId('identity-dob-month')).toBeTruthy();
    expect(screen.getByTestId('identity-dob-year')).toBeTruthy();
    expect(screen.getByText('These details help us determine whether a health record belongs to you.')).toBeTruthy();
    expect(screen.getByText('Skip for now')).toBeTruthy();
    expect(screen.getByText('You can add these details later in your profile.')).toBeTruthy();
    // No back route into sign-in, and none of the wording it must avoid.
    expect(screen.queryByLabelText('Go back')).toBeNull();
    expect(screen.queryByText(/legal name|verif|KYC|government|required|mandatory/i)).toBeNull();
  });

  it('full name + date of birth are saved through the existing identity service, then on to Home', async () => {
    const update = jest.spyOn(profileService, 'updateMyIdentity').mockImplementation(async (v) => v);
    await openSetup();
    await waitFor(() => expect(screen.getByTestId('setup-continue')).toBeTruthy());
    await type('identity-full-name', ` ${NAME} `);
    await typeDate('7', '3', '1990');
    await press('setup-continue');
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ fullName: NAME, dateOfBirth: '1990-03-07' });
    expectStepDone();
  });

  it('a name alone is fine — the date stays empty', async () => {
    const update = jest.spyOn(profileService, 'updateMyIdentity').mockImplementation(async (v) => v);
    await openSetup();
    await waitFor(() => expect(screen.getByTestId('setup-continue')).toBeTruthy());
    await type('identity-full-name', NAME);
    await press('setup-continue');
    expect(update).toHaveBeenCalledWith({ fullName: NAME, dateOfBirth: null });
    expectStepDone();
  });

  it('a date of birth alone is fine — the name stays empty', async () => {
    const update = jest.spyOn(profileService, 'updateMyIdentity').mockImplementation(async (v) => v);
    await openSetup();
    await waitFor(() => expect(screen.getByTestId('setup-continue')).toBeTruthy());
    await typeDate('29', '02', '2000');
    await press('setup-continue');
    expect(update).toHaveBeenCalledWith({ fullName: null, dateOfBirth: '2000-02-29' });
    expectStepDone();
  });

  it('Skip for now writes nothing — no placeholder values — and moves on', async () => {
    const update = jest.spyOn(profileService, 'updateMyIdentity');
    await openSetup();
    await waitFor(() => expect(screen.getByTestId('setup-skip')).toBeTruthy());
    await type('identity-full-name', NAME); // typed, then skipped: discarded
    await press('setup-skip');
    expect(update).not.toHaveBeenCalled();
    expectStepDone();
  });

  it('Continue with nothing entered is the same as Skip: nothing written', async () => {
    const update = jest.spyOn(profileService, 'updateMyIdentity');
    await openSetup();
    await waitFor(() => expect(screen.getByTestId('setup-continue')).toBeTruthy());
    await press('setup-continue');
    expect(update).not.toHaveBeenCalled();
    expectStepDone();
  });

  it('uses the same validation as Identity details: an invalid date is shown, nothing saved, no move on', async () => {
    const update = jest.spyOn(profileService, 'updateMyIdentity');
    await openSetup();
    await waitFor(() => expect(screen.getByTestId('setup-continue')).toBeTruthy());
    await typeDate('31', '04', '1990');
    await press('setup-continue');
    expect(screen.getByTestId('identity-dob-error')).toHaveTextContent('That date doesn’t exist. Check the day and month.');
    await typeDate('7', '', '1990');
    await press('setup-continue');
    expect(screen.getByTestId('identity-dob-error')).toHaveTextContent('Enter the day, month and year.');
    await type('identity-full-name', '12345');
    await typeDate('', '', '');
    await press('setup-continue');
    expect(screen.getByText('Enter your name using letters.')).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
    expectStepNotDone();
  });

  it('a failed save keeps what was typed, stays here, and Skip still works', async () => {
    jest
      .spyOn(profileService, 'updateMyIdentity')
      .mockRejectedValue(new ServiceError('unknown', 'We couldn’t save your identity details. Nothing was changed — please try again.'));
    await openSetup();
    await waitFor(() => expect(screen.getByTestId('setup-continue')).toBeTruthy());
    await type('identity-full-name', NAME);
    await press('setup-continue');
    expect(screen.getByTestId('setup-save-error')).toHaveTextContent(/Nothing was changed/);
    expect(screen.getByTestId('identity-full-name').props.value).toBe(NAME);
    expectStepNotDone();
    await press('setup-skip');
    expectStepDone();
  });

  it('details already added from Me: nothing to ask, it moves straight on', async () => {
    const update = jest.spyOn(profileService, 'updateMyIdentity');
    await openSetup({ fullName: NAME, dateOfBirth: '1990-03-07' });
    await waitFor(() => expect(currentUser()?.identityOnboardingComplete).toBe(true));
    expect(screen.queryByTestId('setup-continue')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('one detail already added: it is shown, and Continue keeps it', async () => {
    const update = jest.spyOn(profileService, 'updateMyIdentity').mockImplementation(async (v) => v);
    await openSetup({ fullName: NAME, dateOfBirth: null });
    await waitFor(() => expect(screen.getByTestId('identity-full-name').props.value).toBe(NAME));
    await typeDate('07', '03', '1990');
    await press('setup-continue');
    expect(update).toHaveBeenCalledWith({ fullName: NAME, dateOfBirth: '1990-03-07' });
    expectStepDone();
  });

  it('if the details can’t be loaded, the person can retry or skip — never stuck', async () => {
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(user({ identityOnboardingComplete: false }));
    jest
      .spyOn(profileService, 'getMyIdentity')
      .mockRejectedValueOnce(new ServiceError('network', 'You appear to be offline. Check your connection and try again.'))
      .mockResolvedValue(EMPTY);
    await renderWithAuth(
      <>
        <HealthProfileSetupScreen />
        <CaptureUser />
      </>
    );
    await waitFor(() => expect(screen.getByText(/You appear to be offline/)).toBeTruthy());
    expect(screen.queryByTestId('setup-continue')).toBeNull();
    expect(screen.getByTestId('setup-skip')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'));
    });
    await waitFor(() => expect(screen.getByTestId('setup-continue')).toBeTruthy());
  });

  it('touches only identity — no documents, reading or Health Memory calls', async () => {
    const docCalls = (Object.keys(documentsService) as (keyof typeof documentsService)[])
      .filter((k) => typeof documentsService[k] === 'function')
      .map((k) => jest.spyOn(documentsService, k as never));
    jest.spyOn(profileService, 'updateMyIdentity').mockImplementation(async (v) => v);
    await openSetup();
    await waitFor(() => expect(screen.getByTestId('setup-continue')).toBeTruthy());
    await type('identity-full-name', NAME);
    await press('setup-continue');
    await press('setup-skip');
    for (const spy of docCalls) expect(spy).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------- before first upload --

async function openAdd(account: User, identity: IdentityProfile | Error = EMPTY) {
  jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(account);
  const get = jest.spyOn(profileService, 'getMyIdentity');
  if (identity instanceof Error) get.mockRejectedValue(identity);
  else get.mockResolvedValue(identity);
  await renderWithAuth(
    <>
      <AddRecordScreen />
      <CaptureUser />
    </>
  );
  await waitFor(() => expect(currentUser()).not.toBeNull());
  return get;
}

describe('Add Record after skipping', () => {
  it('Add Record stays available; the note is offered once, before choosing a file', async () => {
    await openAdd(user({ identityUploadPromptSeen: false }));
    await waitFor(() => expect(screen.getByTestId('identity-upload-hint')).toBeTruthy());
    expect(screen.getByText('Help us recognize your record')).toBeTruthy();
    expect(screen.getByText(/Adding your full name and date of birth can help .+ determine whether a health record belongs to you\./)).toBeTruthy();
    expect(screen.getByText('Add identity details')).toBeTruthy();
    expect(screen.getByText('Continue without them')).toBeTruthy();
    // Shown → never offered again.
    expect(saveFlags).toHaveBeenCalledWith({ identityUploadPromptSeen: true });
    expect(currentUser()?.identityUploadPromptSeen).toBe(true);
  });

  it('"Add identity details" opens Identity details (Back returns to the upload)', async () => {
    await openAdd(user({ identityUploadPromptSeen: false }));
    await waitFor(() => expect(screen.getByTestId('identity-hint-add')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('identity-hint-add'));
    });
    expect(router.push).toHaveBeenCalledWith('/profile/identity');
    // Underneath, the upload choices are waiting.
    expect(screen.getByTestId('add-record-options')).toBeTruthy();
    expect(screen.queryByTestId('identity-upload-hint')).toBeNull();
  });

  it('"Continue without them" carries straight on with the upload', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    await openAdd(user({ identityUploadPromptSeen: false }));
    await waitFor(() => expect(screen.getByTestId('identity-hint-continue')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('identity-hint-continue'));
    });
    expect(screen.getByTestId('add-record-options')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Upload PDF'));
    });
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalledWith('/profile/identity');
  });

  it('not repeated: once seen, Add Record goes straight to the choices', async () => {
    const get = await openAdd(user({ identityUploadPromptSeen: true }));
    expect(screen.getByTestId('add-record-options')).toBeTruthy();
    expect(screen.queryByTestId('identity-upload-hint')).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('not needed when a name or date of birth is already added', async () => {
    await openAdd(user({ identityUploadPromptSeen: false }), { fullName: NAME, dateOfBirth: null });
    await waitFor(() => expect(screen.getByTestId('add-record-options')).toBeTruthy());
    expect(screen.queryByTestId('identity-upload-hint')).toBeNull();
    expect(saveFlags).toHaveBeenCalledWith({ identityUploadPromptSeen: true });
  });

  it('if the check fails, the upload is never blocked (and the note may come another time)', async () => {
    await openAdd(user({ identityUploadPromptSeen: false }), new ServiceError('network', 'offline'));
    await waitFor(() => expect(screen.getByTestId('add-record-options')).toBeTruthy());
    expect(screen.queryByTestId('identity-upload-hint')).toBeNull();
    expect(saveFlags).not.toHaveBeenCalled();
  });
});

// ------------------------------------------- production account flags --

describe('production account flags (no schema change, no identity values)', () => {
  const supabaseUser = (metadata: Record<string, unknown>) => ({
    id: 'u1',
    email: 'synthetic@example.com',
    created_at: '2026-10-01T10:00:00Z',
    user_metadata: metadata,
    identities: [{ provider: 'google', identity_data: { email: 'synthetic@example.com' }, created_at: '2026-10-01T10:00:00Z' }],
  });

  it('an account without the flags has not seen either step', () => {
    const mapped = toDomainUser(supabaseUser({ onboarding_complete: true }) as never, { onboarding_completed_at: '2026-10-01T10:05:00Z', display_name: null });
    expect(mapped).toMatchObject({ onboardingComplete: true, identityOnboardingComplete: false, identityUploadPromptSeen: false });
    // Google sign-in mapping is otherwise unchanged.
    expect(mapped.linkedIdentities[0].provider).toBe('google');
  });

  it('flags saved on the account are read back on the next launch / sign-in', () => {
    const mapped = toDomainUser(
      supabaseUser({ identity_onboarding_complete: true, identity_upload_prompt_seen: true }) as never,
      { onboarding_completed_at: '2026-10-01T10:05:00Z', display_name: null }
    );
    expect(mapped).toMatchObject({ identityOnboardingComplete: true, identityUploadPromptSeen: true });
  });

  it('marking a step done updates only the account metadata — no tables, no functions, no values', async () => {
    const { createFakeSupabase } = jest.requireActual('../test-support/fakeSupabase');
    const client = createFakeSupabase();
    client.auth.updateUser = jest.fn(async () => ({ data: {}, error: null }));
    client.rpc = jest.fn();
    (getSupabaseClient as jest.Mock).mockReturnValue(client);
    saveFlags.mockRestore();

    await supabaseAuthService.saveOnboardingFlags({ identityOnboardingComplete: true });
    await supabaseAuthService.saveOnboardingFlags({ identityUploadPromptSeen: true });
    await supabaseAuthService.saveOnboardingFlags({});

    expect(client.auth.updateUser.mock.calls).toEqual([
      [{ data: { identity_onboarding_complete: true } }],
      [{ data: { identity_upload_prompt_seen: true } }],
    ]);
    expect(client.calls).toEqual([]);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.functions.invoke).not.toHaveBeenCalled();
  });

  it('a failed save is reported, not hidden', async () => {
    const { createFakeSupabase } = jest.requireActual('../test-support/fakeSupabase');
    const client = createFakeSupabase();
    client.auth.updateUser = jest.fn(async () => ({ data: null, error: { message: 'boom', status: 500 } }));
    (getSupabaseClient as jest.Mock).mockReturnValue(client);
    saveFlags.mockRestore();
    await expect(supabaseAuthService.saveOnboardingFlags({ identityOnboardingComplete: true })).rejects.toBeInstanceOf(ServiceError);
  });
});
