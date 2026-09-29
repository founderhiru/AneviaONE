/**
 * Cold-launch routing (app/_layout.tsx): the navigator stays mounted under
 * the full-screen AnimatedSplash, and the redirect runs behind it so the
 * placeholder entry route ("Loading…") is never left on screen.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { router, useSegments } from 'expo-router';

import RootLayout from '../app/_layout';
import { BRAND } from '../config/brand';
import { authService } from '../services/auth/authService';
import type { User } from '../types';

const baseUser: User = {
  id: 'user-1',
  email: 'priya@example.com',
  createdAt: '2026-09-29T10:00:00Z',
  onboardingComplete: true,
  linkedIdentities: [],
};

beforeEach(() => {
  (useSegments as jest.Mock).mockReturnValue([]); // cold start: entry route
});

afterEach(() => jest.restoreAllMocks());

describe('launch routing', () => {
  it('shows the branded launch sequence on cold start', async () => {
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(null);
    await render(<RootLayout />);
    expect(screen.getByLabelText(`Loading ${BRAND.productName}`)).toBeTruthy();
    expect(screen.getByText(BRAND.productName)).toBeTruthy();
  });

  it('new / signed-out user → Welcome', async () => {
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(null);
    await render(<RootLayout />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome'));
  });

  it('signed-in user who has not finished onboarding → onboarding', async () => {
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue({ ...baseUser, onboardingComplete: false });
    await render(<RootLayout />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/onboarding'));
  });

  it('existing signed-in, onboarded user on the entry route → Home (no stuck "Loading…")', async () => {
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(baseUser);
    await render(<RootLayout />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)/home'));
  });

  it('does not redirect an onboarded user who is already inside the app', async () => {
    (useSegments as jest.Mock).mockReturnValue(['(tabs)', 'timeline']);
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(baseUser);
    await render(<RootLayout />);
    await waitFor(() => expect(authService.getCurrentUser).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.replace).not.toHaveBeenCalled();
  });
});
