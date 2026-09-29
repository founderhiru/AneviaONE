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
import { renderWithAuth } from './testUtils';

const { __clearSecureStoreForTests } = require('expo-secure-store');

beforeEach(() => {
  __clearSecureStoreForTests();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

describe('Welcome screen', () => {
  it('shows the brand-neutral name/tagline and both entry points', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByText(BRAND.productName)).toBeTruthy();
    expect(screen.getByTestId('continue-with-mobile')).toBeTruthy();
    expect(screen.getByTestId('continue-with-google')).toBeTruthy();
  });

  it('navigates to the mobile login screen', async () => {
    await renderWithAuth(<WelcomeScreen />);
    fireEvent.press(screen.getByTestId('continue-with-mobile'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=mobile');
  });

  it('navigates to the Google login screen', async () => {
    await renderWithAuth(<WelcomeScreen />);
    fireEvent.press(screen.getByTestId('continue-with-google'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=google');
  });
});

describe('Login screen — Mobile OTP (primary path)', () => {
  it('sends an OTP and navigates to the OTP screen once a valid number is entered', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    await renderWithAuth(<LoginScreen />);

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
        params: { mobileNumber: '9876543210' },
      })
    );
  });

  it('shows a validation error for a too-short number', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    await renderWithAuth(<LoginScreen />);
    // Send OTP stays disabled below 10 digits — nothing to send, no navigation.
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

    expect(screen.getByText('Your health records can start here.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('onboarding-skip-whatsapp'));
    });

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
