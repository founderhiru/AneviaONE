/**
 * The root layout's sign-in guard: a signed-out person on a protected
 * screen goes to the one sign-in screen, Welcome — whether their session
 * expired (Welcome then says why) or they signed out.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { router, useSegments } from 'expo-router';

import RootLayout from '../app/_layout';
import { useAuth } from '../hooks/useAuth';

jest.mock('../hooks/useAuth', () => ({
  ...jest.requireActual('../hooks/useAuth'),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: jest.fn(),
}));

async function renderSignedOutOnHome(notice: 'session_expired' | null) {
  (useAuth as jest.Mock).mockReturnValue({ user: null, isLoading: false, notice });
  (useSegments as jest.Mock).mockReturnValue(['(tabs)', 'home']);
  await render(<RootLayout />);
}

describe('signed out on a protected screen', () => {
  it('after a session expires mid-use, opens the one sign-in screen (Welcome)', async () => {
    await renderSignedOutOnHome('session_expired');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome'));
    expect(router.replace).not.toHaveBeenCalledWith('/(auth)/login');
  });

  it('after a chosen sign-out, also returns to Welcome', async () => {
    await renderSignedOutOnHome(null);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome'));
  });
});
