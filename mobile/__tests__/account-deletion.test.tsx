/**
 * Account deletion in the app: the service reports every server outcome
 * honestly (never "deleted" unless the server said so, never "nothing
 * changed" once deletion may have started); the screen needs DELETE typed
 * exactly; success signs out and Welcome says the account was deleted.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import WelcomeScreen from '../app/(auth)/welcome';
import DeleteAccountScreen from '../app/privacy/delete-account';
import PrivacyScreen from '../app/privacy/index';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/auth/authService';
import { productionProfileService, profileService } from '../services/profile/profileService';
import { ServiceError } from '../services/serviceError';
import { getSupabaseClient } from '../services/supabaseClient';
import type { User } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({
  ...jest.requireActual('../services/supabaseClient'),
  getSupabaseClient: jest.fn(),
}));

const user: User = {
  id: 'user-1',
  email: 'synthetic@example.test',
  createdAt: '2026-10-13T10:00:00Z',
  onboardingComplete: true,
  identityOnboardingComplete: true,
  identityUploadPromptSeen: true,
  linkedIdentities: [],
};

/** A FunctionsHttpError-like failure carrying the function's Response. */
const httpError = (status: number, error: string) => ({
  data: null,
  error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: new Response(JSON.stringify({ error }), { status }),
  }),
});

function clientInvoking(result: unknown) {
  const invoke = jest.fn().mockImplementation(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  (getSupabaseClient as jest.Mock).mockReturnValue({ functions: { invoke } });
  return invoke;
}

afterEach(() => jest.restoreAllMocks());

describe('productionProfileService.deleteAccount', () => {
  it('asks the server to delete the signed-in account, with the confirmation, and resolves on "deleted"', async () => {
    const invoke = clientInvoking({ data: { status: 'deleted' }, error: null });
    await expect(productionProfileService.deleteAccount()).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('delete-account', { body: { confirm: 'DELETE' } });
  });

  it.each([
    [403, 'reauthentication_required', 'reauthentication_required', /sign in again.*Nothing has been deleted/],
    [409, 'account_busy', 'busy', /being read.*Nothing has been deleted/],
    [502, 'storage_delete_failed', 'incomplete', /started but didn.t finish.*may already be removed.*try again/i],
    [500, 'delete_failed', 'incomplete', /started but didn.t finish/],
  ])('%s %s → %s, with an honest message', async (status, serverCode, code, message) => {
    clientInvoking(httpError(status, serverCode));
    const error = await productionProfileService.deleteAccount().catch((e) => e);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error.code).toBe(code);
    expect(error.userMessage).toMatch(message);
  });

  it('no answer (offline): never claims nothing changed — it may have started; retrying is safe', async () => {
    clientInvoking(new Error('Network request failed'));
    const error = await productionProfileService.deleteAccount().catch((e) => e);
    expect(error.code).toBe('network');
    expect(error.userMessage).toMatch(/can.t tell whether deletion started.*safe/);
    expect(error.userMessage).not.toMatch(/Nothing has been deleted/);
  });

  it('a 200 that does not say "deleted" is not treated as success', async () => {
    clientInvoking({ data: { status: 'something-else' }, error: null });
    await expect(productionProfileService.deleteAccount()).rejects.toMatchObject({ code: 'unknown' });
  });
});

function NoticeProbe() {
  const { notice } = useAuth();
  return <Text testID="notice">{notice ?? 'none'}</Text>;
}

async function openDeleteScreen() {
  jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(user);
  jest.spyOn(authService, 'signOut').mockResolvedValue();
  await renderWithAuth(
    <>
      <DeleteAccountScreen />
      <NoticeProbe />
    </>
  );
  await waitFor(() => expect(authService.getCurrentUser).toHaveBeenCalled());
}

const typeConfirmation = async (text: string) => {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('delete-account-confirm-input'), text);
  });
};
const pressDelete = async () => {
  await act(async () => {
    fireEvent.press(screen.getByTestId('delete-account-submit'));
  });
};

describe('Delete account screen', () => {
  it('says what is deleted, that it can\'t be undone, and what is kept', async () => {
    await openDeleteScreen();
    expect(screen.getByTestId('delete-account-scope')).toHaveTextContent(/original file.*corrections.*identity details.*sign-in/s);
    expect(screen.getByTestId('delete-account-kept')).toHaveTextContent(/can.t be undone.*anonymous.*no name, email or health information/);
  });

  it('the button stays disabled until DELETE is typed exactly', async () => {
    const del = jest.spyOn(profileService, 'deleteAccount').mockResolvedValue();
    await openDeleteScreen();
    for (const attempt of ['', 'delete', 'DELET', 'DELETE NOW']) {
      await typeConfirmation(attempt);
      expect(screen.getByTestId('delete-account-submit')).toBeDisabled();
    }
    await pressDelete();
    expect(del).not.toHaveBeenCalled();
    await typeConfirmation('DELETE');
    expect(screen.getByTestId('delete-account-submit')).toBeEnabled();
  });

  it('success: deletes once, signs out, and Welcome will say the account was deleted', async () => {
    const del = jest.spyOn(profileService, 'deleteAccount').mockResolvedValue();
    await openDeleteScreen();
    await typeConfirmation('DELETE');
    await pressDelete();
    expect(del).toHaveBeenCalledTimes(1);
    expect(authService.signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('notice')).toHaveTextContent('account_deleted'));
  });

  it('reauthentication required: explains, offers to sign out, and is NOT signed out by itself', async () => {
    jest.spyOn(profileService, 'deleteAccount').mockRejectedValue(
      new ServiceError('reauthentication_required', 'For your security, sign in again, then delete your account within 15 minutes. Nothing has been deleted.')
    );
    await openDeleteScreen();
    await typeConfirmation('DELETE');
    await pressDelete();
    expect(screen.getByTestId('delete-account-error')).toHaveTextContent(/sign in again/);
    expect(authService.signOut).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId('delete-account-reauth'));
    });
    expect(authService.signOut).toHaveBeenCalledTimes(1);
  });

  it('incomplete: says so and offers Try again (safe to repeat); the person stays signed in', async () => {
    const del = jest
      .spyOn(profileService, 'deleteAccount')
      .mockRejectedValueOnce(new ServiceError('incomplete', 'Deleting your account started but didn’t finish.', { retryable: true }))
      .mockResolvedValueOnce();
    await openDeleteScreen();
    await typeConfirmation('DELETE');
    await pressDelete();
    expect(screen.getByTestId('delete-account-error')).toHaveTextContent(/started but didn.t finish/);
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(authService.signOut).not.toHaveBeenCalled();
    await pressDelete();
    expect(del).toHaveBeenCalledTimes(2);
    expect(authService.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('Privacy → Delete account; Welcome after deletion', () => {
  it('Privacy offers Delete account and opens its screen', async () => {
    await renderWithAuth(<PrivacyScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Delete account'));
    });
    expect(router.push).toHaveBeenCalledWith('/privacy/delete-account');
    expect(screen.getByTestId('privacy-not-yet-available')).toHaveTextContent(/Downloading a copy of your data/);
    expect(screen.getByTestId('privacy-not-yet-available')).not.toHaveTextContent(/account/);
  });

  it('Welcome tells the person their account was deleted', async () => {
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(user);
    jest.spyOn(authService, 'signOut').mockResolvedValue();
    function SignOutAfterDeletion() {
      const { signOut, user: current } = useAuth();
      React.useEffect(() => {
        if (current) signOut('account_deleted');
      }, [current, signOut]);
      return null;
    }
    await renderWithAuth(
      <>
        <SignOutAfterDeletion />
        <WelcomeScreen />
      </>
    );
    await waitFor(() => expect(screen.getByTestId('account-deleted-notice')).toHaveTextContent('Your account and everything in it have been deleted.'));
  });
});
