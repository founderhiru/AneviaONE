/**
 * No sign-in screen is a dead end. Every step has a visible Back that
 * returns to where the person came from (or Welcome when there is no
 * history); a cancelled Google/Apple sheet goes back; failures offer Try
 * again; loading always clears; a double tap starts only one attempt.
 *
 * Screens are rendered directly in demo mode (see jest.setup.js);
 * navigation is verified through the mocked expo-router calls.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import { router, useLocalSearchParams, useSegments } from 'expo-router';

import RootLayout from '../app/_layout';
import LoginScreen from '../app/(auth)/login';
import OtpScreen from '../app/(auth)/otp';
import WelcomeScreen from '../app/(auth)/welcome';
import MakeItYoursScreen from '../app/explore/make-it-yours';
import { useAuth } from '../hooks/useAuth';
import { resetAppleAvailabilityForTests } from '../services/auth/appleAuth';
import { authService } from '../services/auth/authService';
import type { User } from '../types';
import { renderWithAuth } from './testUtils';

const { __clearSecureStoreForTests } = require('expo-secure-store');
const { __setAppleAvailableForTests } = require('expo-apple-authentication');

const signedInUser: User = {
  id: 'user-1',
  email: 'priya@example.com',
  createdAt: '2026-10-05T10:00:00Z',
  onboardingComplete: true,
  identityOnboardingComplete: true,
  identityUploadPromptSeen: true,
  linkedIdentities: [],
};

/** Shows who AuthProvider thinks is signed in. */
function SessionProbe() {
  const { user } = useAuth();
  return <Text testID="session-probe">{user ? `signed-in:${user.id}` : 'signed-out'}</Text>;
}

async function renderStep(params: Record<string, string>, ui: React.ReactElement = <LoginScreen />) {
  (useLocalSearchParams as jest.Mock).mockReturnValue(params);
  return renderWithAuth(
    <>
      {ui}
      <SessionProbe />
    </>
  );
}

async function press(testID: string) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
}

beforeEach(() => {
  __clearSecureStoreForTests();
  __setAppleAvailableForTests(true);
  resetAppleAvailabilityForTests();
  (router.canGoBack as jest.Mock).mockReturnValue(true);
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

afterEach(() => jest.restoreAllMocks());

describe('Back is always available', () => {
  it('Welcome → Google → Back returns to Welcome', async () => {
    const welcome = await renderWithAuth(<WelcomeScreen />);
    await press('continue-with-google');
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=google');
    await welcome.unmount();

    await renderStep({ method: 'google' });
    expect(screen.getByLabelText('Go back')).toBeTruthy();
    await press('auth-back');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('a sign-in step with no history falls back to Welcome instead of trapping the person', async () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    await renderStep({ method: 'google' });
    await press('auth-back');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome');
  });

  it('Mobile (on Welcome) → OTP → Back returns to the number entry', async () => {
    const mobile = await renderWithAuth(<WelcomeScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('mobile-number-input'), '9876543210');
    });
    await press('send-otp');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/(auth)/otp', params: { mobileNumber: '+919876543210' } }));
    await mobile.unmount();

    await renderStep({ mobileNumber: '+919876543210' }, <OtpScreen />);
    await press('auth-back');
    expect(router.back).toHaveBeenCalledTimes(1);
    await press('otp-change-destination');
    expect(router.back).toHaveBeenCalledTimes(2);
  });

  it('every sign-in step (Google, Apple, Email, code) shows Back', async () => {
    for (const params of [{ method: 'google' }, { method: 'apple' }, { method: 'email' }]) {
      const view = await renderStep(params);
      expect(screen.getByTestId('auth-back')).toBeTruthy();
      await view.unmount();
    }
    await renderStep({ mobileNumber: '9876543210' }, <OtpScreen />);
    expect(screen.getByTestId('auth-back')).toBeTruthy();
  });

  it('Make it yours → Get started opens the one sign-in screen; Back there returns to Make it yours', async () => {
    const view = await renderWithAuth(<MakeItYoursScreen />);
    await press('make-it-yours-get-started');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/(auth)/welcome', params: { from: 'app' } });
    await view.unmount();

    // Welcome, opened from Make it yours, shows Back, which returns there.
    (useLocalSearchParams as jest.Mock).mockReturnValue({ from: 'app' });
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByText('Log in or sign up')).toBeTruthy();
    await press('auth-back');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('and back out of Make it yours itself', async () => {
    await renderWithAuth(<MakeItYoursScreen />);
    await press('make-it-yours-back');
    expect(router.back).toHaveBeenCalled();
  });
});

describe('Google', () => {
  it('cancelling the Google sheet returns to the sign-in options, with no error', async () => {
    jest.spyOn(authService, 'signInWithGoogle').mockResolvedValue({ success: false, cancelled: true });
    await renderStep({ method: 'google' });
    await press('google-oauth-continue');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('auth-error')).toBeNull();
    expect(screen.getByTestId('google-oauth-continue').props.accessibilityState.busy).toBe(false);
  });

  it('success signs the person in (the root layout then opens Home)', async () => {
    await renderStep({ method: 'google' });
    expect(screen.getByTestId('session-probe').props.children).toBe('signed-out');
    await press('google-oauth-continue');
    await waitFor(() => expect(screen.getByTestId('session-probe').props.children).toMatch(/^signed-in:/));
  });

  it('a failure is recoverable: the message, Try again, and a way back', async () => {
    const signIn = jest
      .spyOn(authService, 'signInWithGoogle')
      .mockResolvedValueOnce({ success: false, errorMessage: 'Could not complete sign-in. Please try again.' })
      .mockResolvedValueOnce({ success: true, user: signedInUser, isNewUser: false });
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(null);
    await renderStep({ method: 'google' });
    await press('google-oauth-continue');

    expect(screen.getByText('Could not complete sign-in. Please try again.')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.getByTestId('auth-cancel')).toBeTruthy();

    (authService.getCurrentUser as jest.Mock).mockResolvedValue(signedInUser);
    await act(async () => {
      fireEvent.press(screen.getByText('Try again'));
    });
    expect(signIn).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('session-probe').props.children).toBe('signed-in:user-1'));
    expect(screen.queryByTestId('auth-error')).toBeNull();
  });

  it('a failure shows the safe diagnostic code under the friendly message', async () => {
    jest
      .spyOn(authService, 'signInWithGoogle')
      .mockResolvedValue({ success: false, errorMessage: 'Could not complete sign-in. Please try again.', diagnosticCode: 'bad_code_verifier' });
    await renderStep({ method: 'google' });
    await press('google-oauth-continue');
    expect(screen.getByText('Could not complete sign-in. Please try again.')).toBeTruthy();
    expect(screen.getByTestId('auth-error-code').props.children).toBe('Error code: bad_code_verifier');

    // A new attempt clears the previous code.
    (authService.signInWithGoogle as jest.Mock).mockResolvedValue({ success: false, cancelled: true });
    await press('google-oauth-continue');
    expect(screen.queryByTestId('auth-error-code')).toBeNull();
  });

  it('“Back to sign-in options” leaves after a failure', async () => {
    jest.spyOn(authService, 'signInWithGoogle').mockResolvedValue({ success: false, errorMessage: 'Could not complete sign-in. Please try again.' });
    await renderStep({ method: 'google' });
    await press('google-oauth-continue');
    await press('auth-cancel');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('loading always clears, even when sign-in throws', async () => {
    jest.spyOn(authService, 'signInWithGoogle').mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await renderStep({ method: 'google' });
    await press('google-oauth-continue');
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(screen.getByTestId('google-oauth-continue').props.accessibilityState).toMatchObject({ busy: false, disabled: false });
  });

  it('a double tap starts only one sign-in', async () => {
    let finish: (value: { success: false; cancelled: true }) => void = () => undefined;
    const signIn = jest.spyOn(authService, 'signInWithGoogle').mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await renderStep({ method: 'google' });
    const button = screen.getByTestId('google-oauth-continue');
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    await act(async () => finish({ success: false, cancelled: true }));
  });
});

describe('Apple', () => {
  it('cancelling the Apple sheet returns to the sign-in options, with no error', async () => {
    jest.spyOn(authService, 'signInWithApple').mockResolvedValue({ success: false, cancelled: true });
    await renderStep({ method: 'apple' });
    await press('apple-signin-continue');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('auth-error')).toBeNull();
  });

  it('success signs the person in', async () => {
    await renderStep({ method: 'apple' });
    await press('apple-signin-continue');
    await waitFor(() => expect(screen.getByTestId('session-probe').props.children).toMatch(/^signed-in:/));
  });

  it('where Apple is unavailable, the screen offers a way back', async () => {
    __setAppleAvailableForTests(false);
    await renderStep({ method: 'apple' });
    await waitFor(() => expect(screen.getByTestId('auth-cancel')).toBeTruthy());
    await press('auth-cancel');
    expect(router.back).toHaveBeenCalled();
  });
});

describe('Mobile code', () => {
  it('a wrong code clears for a retry; resend waits for the cooldown', async () => {
    await renderStep({ mobileNumber: '+919876543210' }, <OtpScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('otp-hidden-input'), '000000');
    });
    await waitFor(() => expect(screen.getByText('Incorrect code. Please try again.')).toBeTruthy());
    expect(screen.getByTestId('otp-hidden-input').props.value).toBe('');
    expect(screen.getByTestId('verify-otp').props.accessibilityState.busy).toBe(false);

    // A code was just sent: resend waits out the cooldown first.
    expect(screen.getByTestId('otp-resend').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Resend code in 30s')).toBeTruthy();
  });

  it('after the cooldown a new code is sent to the same number, and the cooldown restarts', async () => {
    jest.useFakeTimers();
    try {
      const resend = jest.spyOn(authService, 'sendMobileOtp').mockResolvedValue({ success: true });
      await renderStep({ mobileNumber: '+919876543210' }, <OtpScreen />);
      for (let i = 0; i < 30; i += 1) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });
      }
      expect(screen.getByText('Resend code')).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByTestId('otp-resend'));
      });
      expect(resend).toHaveBeenCalledTimes(1);
      expect(resend).toHaveBeenCalledWith('+919876543210');
      expect(screen.getByText('Code sent · Resend code in 30s')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('the right code signs the person in', async () => {
    await renderStep({ mobileNumber: '+919876543210' }, <OtpScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('otp-hidden-input'), '123456');
    });
    await waitFor(() => expect(screen.getByTestId('session-probe').props.children).toMatch(/^signed-in:/));
  });
});

describe('Root layout after sign-in', () => {
  it('a signed-in, onboarded person on a sign-in step is taken to Home', async () => {
    (useSegments as jest.Mock).mockReturnValue(['(auth)', 'login']);
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(signedInUser);
    await render(<RootLayout />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)/home'));
  });

  it('after signing out, the person is taken back to Welcome', async () => {
    (useSegments as jest.Mock).mockReturnValue(['(tabs)', 'me']);
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(null);
    await render(<RootLayout />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome'));
  });
});
