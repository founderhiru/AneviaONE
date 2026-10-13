/**
 * Cold-launch routing (app/_layout.tsx): the navigator stays mounted under
 * the full-screen AnimatedSplash, and the redirect runs behind it so the
 * placeholder entry route ("Loading…") is never left on screen.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { router, useSegments } from 'expo-router';

import RootLayout from '../app/_layout';
import { setRouteAfterOnboarding } from '../navigation/authRoutes';
import { BRAND } from '../config/brand';
import { authService } from '../services/auth/authService';
import type { User } from '../types';

const baseUser: User = {
  id: 'user-1',
  email: 'priya@example.com',
  createdAt: '2026-09-29T10:00:00Z',
  onboardingComplete: true,
  identityOnboardingComplete: true,
  identityUploadPromptSeen: true,
  linkedIdentities: [],
};

beforeEach(() => {
  (useSegments as jest.Mock).mockReturnValue([]); // cold start: entry route
});

afterEach(() => jest.restoreAllMocks());

describe('launch routing', () => {
  it('shows the branded launch sequence on cold start', async () => {
    // Keep the session check pending so the splash holds (as it does while
    // the app starts) — animations finish instantly under Jest, so a resolved
    // check would let the splash exit before these assertions run.
    jest.spyOn(authService, 'getCurrentUser').mockImplementation(() => new Promise(() => {}));
    await render(<RootLayout />);
    expect(screen.getByLabelText(`Loading ${BRAND.wordmark}`)).toBeTruthy();
    expect(screen.getByText(BRAND.wordmark)).toBeTruthy();
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

  it('lets a signed-out person stay in Explore (no sign-in wall)', async () => {
    (useSegments as jest.Mock).mockReturnValue(['explore', 'memory']);
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(null);
    await render(<RootLayout />);
    await waitFor(() => expect(authService.getCurrentUser).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('a signed-out person outside Welcome/Explore is still sent to Welcome', async () => {
    (useSegments as jest.Mock).mockReturnValue(['(tabs)', 'home']);
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(null);
    await render(<RootLayout />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome'));
  });

  it('once signed in from Explore ("Make it yours"), the person lands in their own app', async () => {
    (useSegments as jest.Mock).mockReturnValue(['explore']);
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(baseUser);
    await render(<RootLayout />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)/home'));
  });

  it('plays the launch sequence once, and not again when navigating', async () => {
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(null);
    const view = await render(<RootLayout />);
    const splash = `Loading ${BRAND.wordmark}`;
    expect(screen.getByLabelText(splash)).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText(splash)).toBeNull());

    for (const segments of [['(auth)', 'welcome'], ['explore'], ['explore', 'memory'], ['(auth)', 'login']]) {
      (useSegments as jest.Mock).mockReturnValue(segments);
      await view.rerender(<RootLayout />);
      expect(screen.queryByLabelText(splash)).toBeNull();
    }
  });
});

describe('leaving onboarding for Add Record', () => {
  it('"Upload a document" / "Take a photo": Home, then Add Record on top — never lost to the guard', async () => {
    // The last onboarding step records the destination and completes onboarding;
    // the guard (still on the onboarding route) is the one that navigates.
    (useSegments as jest.Mock).mockReturnValue(['(auth)', 'onboarding']);
    setRouteAfterOnboarding('/add');
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(baseUser);
    await render(<RootLayout />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/add'));
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/home');
    const replaceOrder = (router.replace as jest.Mock).mock.invocationCallOrder[0];
    const pushOrder = (router.push as jest.Mock).mock.invocationCallOrder[0];
    expect(replaceOrder).toBeLessThan(pushOrder);
  });

  it('the destination is used once — a later launch goes to Home only', async () => {
    (useSegments as jest.Mock).mockReturnValue(['(auth)', 'onboarding']);
    jest.spyOn(authService, 'getCurrentUser').mockResolvedValue(baseUser);
    await render(<RootLayout />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)/home'));
    expect(router.push).not.toHaveBeenCalled();
  });
});
