/**
 * Session expiry (clear state, explain, back to Welcome — never fall back to
 * mock sign-in) and the "backend not configured" state.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import WelcomeScreen from '../app/(auth)/welcome';
import RootLayout from '../app/_layout';
import { BRAND } from '../config/brand';
import { SESSION_EXPIRED_MESSAGE, AuthProvider, useAuth } from '../hooks/useAuth';
import { authService } from '../services/auth/authService';
import { supabaseAuthService } from '../services/auth/supabaseAuthService';
import { supabaseDocumentsService } from '../services/documents/supabaseDocumentsService';
import { getSupabaseClient } from '../services/supabaseClient';
import type { User } from '../types';

jest.mock('../config/appMode', () => ({
  ...jest.requireActual('../config/appMode'),
  APP_MODE: {
    mode: 'production',
    supabaseConfigured: false,
    configurationError: 'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  },
  isDemoMode: false,
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
}));

const signedInUser: User = {
  id: 'user-1',
  email: 'priya@example.com',
  createdAt: '2026-09-29T10:00:00Z',
  onboardingComplete: true,
  linkedIdentities: [],
};

function SessionProbe() {
  const { user, notice, signOut } = useAuth();
  return (
    <>
      <Text testID="user">{user ? user.id : 'signed-out'}</Text>
      <Text testID="notice">{notice ?? 'none'}</Text>
      <Text onPress={signOut}>sign out</Text>
    </>
  );
}

function renderSession(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>{ui}</AuthProvider>
    </SafeAreaProvider>
  );
}

describe('session expiry', () => {
  let fireSignedOut: () => void;

  beforeEach(() => {
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(signedInUser);
    jest.spyOn(authService, 'signOut').mockImplementation(async () => fireSignedOut());
    jest.spyOn(authService, 'onSignedOut').mockImplementation((listener) => {
      fireSignedOut = listener;
      return () => undefined;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('clears the user and explains the expiry when the session ends on its own', async () => {
    await renderSession(<SessionProbe />);
    await waitFor(() => expect(screen.getByTestId('user').props.children).toBe('user-1'));

    await act(async () => fireSignedOut());

    expect(screen.getByTestId('user').props.children).toBe('signed-out');
    expect(screen.getByTestId('notice').props.children).toBe('session_expired');
  });

  it('does not show the notice when the person signs out themselves', async () => {
    await renderSession(<SessionProbe />);
    await waitFor(() => expect(screen.getByTestId('user').props.children).toBe('user-1'));

    await act(async () => {
      fireEvent.press(screen.getByText('sign out'));
    });

    expect(screen.getByTestId('user').props.children).toBe('signed-out');
    expect(screen.getByTestId('notice').props.children).toBe('none');
  });

  it('Welcome shows an understandable session-expired message', async () => {
    await renderSession(<WelcomeScreen />);
    await waitFor(() => expect(authService.getCurrentUser).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => fireSignedOut());
    expect(screen.getByTestId('session-expired-notice')).toBeTruthy();
    expect(screen.getByText(SESSION_EXPIRED_MESSAGE)).toBeTruthy();
  });
});

describe('backend not configured (production)', () => {
  it('the app explains it cannot start instead of running on mocks', async () => {
    await render(<RootLayout />);
    expect(screen.getByText(`${BRAND.productName} isn’t configured`)).toBeTruthy();
    expect(screen.getByText(/can’t connect to its secure backend/)).toBeTruthy();
  });

  it('no Supabase client is created and services refuse instead of pretending', async () => {
    expect(getSupabaseClient()).toBeNull();
    expect(await supabaseAuthService.sendEmailOtp('priya@example.com')).toEqual({
      success: false,
      errorMessage: 'Sign-in is not available right now. Please try again later.',
    });
    expect(await supabaseAuthService.getCurrentUser()).toBeNull();
    await expect(supabaseDocumentsService.listDocuments()).rejects.toMatchObject({ code: 'not_configured' });
  });
});
