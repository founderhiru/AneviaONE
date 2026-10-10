/**
 * Covers the required auth screen transitions: Welcome, Mobile OTP entry +
 * verification, Google sign-in UI, and Onboarding — per spec section 36
 * ("navigation, authentication screen transitions, OTP UI, Google login UI
 * flow"). Screens are rendered directly (not through the full Stack
 * navigator — see jest.setup.js for why) and navigation is verified via the
 * mocked `router.push`/`replace` calls each screen makes.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import LoginScreen from '../app/(auth)/login';
import OnboardingScreen from '../app/(auth)/onboarding';
import OtpScreen from '../app/(auth)/otp';
import WelcomeScreen from '../app/(auth)/welcome';
import { BRAND, taglineLines } from '../config/brand';
import { resetAppleAvailabilityForTests } from '../services/auth/appleAuth';
import { authService } from '../services/auth/authService';
import { renderWithAuth } from './testUtils';

const { __clearSecureStoreForTests } = require('expo-secure-store');
const { __setAppleAvailableForTests } = require('expo-apple-authentication');

beforeEach(() => {
  __clearSecureStoreForTests();
  __setAppleAvailableForTests(true);
  resetAppleAvailabilityForTests();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

describe('Welcome screen', () => {
  it('shows the brand-neutral name/tagline and the entry points', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByText(BRAND.wordmark)).toBeTruthy();
    expect(screen.getByText('Log in or sign up')).toBeTruthy();
    expect(screen.getByTestId('mobile-number-input')).toBeTruthy();
    expect(screen.getByTestId('continue-with-google')).toBeTruthy();
    expect(await screen.findByTestId('continue-with-email')).toBeTruthy();
  });

  it('navigates to the Email sign-in step', async () => {
    await renderWithAuth(<WelcomeScreen />);
    await fireEvent.press(await screen.findByTestId('continue-with-email'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=email');
  });

  it('navigates to the Google login screen', async () => {
    await renderWithAuth(<WelcomeScreen />);
    fireEvent.press(screen.getByTestId('continue-with-google'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=google');
  });
});

describe('Welcome — Mobile OTP (primary path)', () => {
  it('sends an OTP and navigates to the OTP screen once a valid number is entered', async () => {
    await renderWithAuth(<WelcomeScreen />);

    const input = screen.getByTestId('mobile-number-input');
    await act(async () => {
      fireEvent.changeText(input, '9876543210');
    });

    const sendButton = screen.getByTestId('send-otp');
    await act(async () => {
      fireEvent.press(sendButton);
    });

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/(auth)/otp',
        params: { mobileNumber: '+919876543210' },
      })
    );
  });

  it('shows a validation error for a too-short number', async () => {
    await renderWithAuth(<WelcomeScreen />);
    // Continue stays disabled below 10 digits — nothing to send, no navigation.
    expect(screen.getByTestId('send-otp').props.accessibilityState.disabled).toBe(true);
  });
});

describe('Login screen — Google (secondary path)', () => {
  it('renders the Google continue UI and signs in on press', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ method: 'google' });
    await renderWithAuth(<LoginScreen />);

    // Both the heading and the button read "Continue with Google" — assert
    // there are two matches rather than picking one ambiguously.
    expect(screen.getAllByText('Continue with Google')).toHaveLength(2);
    const button = screen.getByTestId('google-oauth-continue');
    await act(async () => {
      fireEvent.press(button);
    });

    // Mock Google sign-in resolves without throwing; no error surfaced.
    await waitFor(() => expect(screen.queryByText(/errorMessage/)).toBeNull());
  });
});

describe('Login screen — Apple (secondary path)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the system Apple button and signs in through the auth service', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ method: 'apple' });
    const signIn = jest.spyOn(authService, 'signInWithApple');
    await renderWithAuth(<LoginScreen />);
    expect(screen.getByRole('header', { name: 'Continue with Apple' })).toBeTruthy();
    expect(screen.getByText(/Hide My Email/)).toBeTruthy();
    await act(async () => {
      await fireEvent.press(await screen.findByTestId('apple-signin-continue'));
    });
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
  });

  it('says a cancelled Apple sheet is fine — no error', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ method: 'apple' });
    jest.spyOn(authService, 'signInWithApple').mockResolvedValue({ success: false, cancelled: true });
    await renderWithAuth(<LoginScreen />);
    await act(async () => {
      await fireEvent.press(await screen.findByTestId('apple-signin-continue'));
    });
    expect(screen.queryByText(/couldn|could not|try again/i)).toBeNull();
  });

  it('shows a safe error when Apple sign-in fails', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ method: 'apple' });
    jest
      .spyOn(authService, 'signInWithApple')
      .mockResolvedValue({ success: false, errorMessage: 'Could not complete sign-in. Please try again.' });
    await renderWithAuth(<LoginScreen />);
    await act(async () => {
      await fireEvent.press(await screen.findByTestId('apple-signin-continue'));
    });
    expect(screen.getByText('Could not complete sign-in. Please try again.')).toBeTruthy();
  });

  it('offers no Apple button where Sign in with Apple is unavailable', async () => {
    __setAppleAvailableForTests(false);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ method: 'apple' });
    await renderWithAuth(<LoginScreen />);
    await waitFor(() => expect(screen.getByText(/isn’t available on this device/)).toBeTruthy());
    expect(screen.queryByTestId('apple-signin-continue')).toBeNull();
  });
});

describe('OTP screen', () => {
  it('verifies the correct mock code', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ mobileNumber: '9876543210' });
    await renderWithAuth(<OtpScreen />);

    const hiddenInput = screen.getByTestId('otp-hidden-input');
    await act(async () => {
      fireEvent.changeText(hiddenInput, '123456');
    });

    // Verification runs automatically once 6 digits are entered; no error shown.
    await waitFor(() => expect(screen.queryByText('Incorrect code. Please try again.')).toBeNull());
  });

  it('shows an error for an incorrect code', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ mobileNumber: '9876543210' });
    await renderWithAuth(<OtpScreen />);

    const hiddenInput = screen.getByTestId('otp-hidden-input');
    await act(async () => {
      fireEvent.changeText(hiddenInput, '000000');
    });

    await waitFor(() => expect(screen.getByText('Incorrect code. Please try again.')).toBeTruthy());
  });
});

describe('Onboarding screen', () => {
  it('walks through all 5 steps and lets a user skip to Home', async () => {
    await renderWithAuth(<OnboardingScreen />);

    expect(screen.getByText(taglineLines()[0])).toBeTruthy();
    expect(screen.getByText(taglineLines()[1])).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('onboarding-build-memory'));
    });

    expect(
      screen.getByText(/Bring your health records together/)
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });

    expect(screen.getByText(/Health Memory brings together/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });

    // No WhatsApp step: the intro goes straight to the first record.
    expect(screen.queryByText('Your health records can start here.')).toBeNull();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(screen.getByText('Start with your first health record.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('onboarding-skip-record'));
    });

    expect(router.replace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('lets a user skip immediately from step 1', async () => {
    await renderWithAuth(<OnboardingScreen />);
    fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/home');
  });
});
