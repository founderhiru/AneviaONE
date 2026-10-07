/**
 * The link in a sign-in email returns to the app, never to a website.
 *
 * Before: `signInWithOtp` sent no `emailRedirectTo`, so Supabase used the
 * project's Site URL (http://localhost:3000) — "connection refused" in the
 * browser. Now the email asks Supabase to return to
 * healthintelligence://auth-callback, which completes sign-in in the app.
 * The 6-digit code flow is unchanged.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import EmailLinkCallbackScreen from '../app/(auth)/auth-callback';
import { authService } from '../services/auth/authService';
import { EMAIL_LINK_PATH, emailLinkRedirect } from '../services/auth/emailLink';
import { supabaseAuthService } from '../services/auth/supabaseAuthService';
import { getSupabaseClient } from '../services/supabaseClient';
import { renderWithAuth } from './testUtils';

jest.mock('expo-linking', () => ({ createURL: (p: string) => `healthintelligence://${p.replace(/^\//, '')}` }));
jest.mock('../services/supabaseClient', () => ({
  ...jest.requireActual('../services/supabaseClient'),
  getSupabaseClient: jest.fn(() => null),
}));

const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;

function fakeClient() {
  const profile = { maybeSingle: jest.fn(async () => ({ data: null, error: null })) };
  return {
    auth: {
      signInWithOtp: jest.fn(async () => ({ error: null })),
      exchangeCodeForSession: jest.fn(async (code: string) =>
        code === 'good-code'
          ? { data: { user: { id: 'u1', email: 'a@example.com', identities: [], user_metadata: {}, created_at: '2026-10-07T00:00:00Z' }, session: {} }, error: null }
          : { data: { user: null, session: null }, error: { name: 'AuthApiError', status: 400, code: 'flow_state_not_found' } },
      ),
    },
    from: jest.fn(() => ({ select: () => ({ eq: () => profile }) })),
  };
}

afterEach(() => jest.restoreAllMocks());

describe('where the email link returns', () => {
  it('is the app’s own scheme, never a localhost or web address', () => {
    expect(appJson.scheme).toBe('healthintelligence');
    expect(emailLinkRedirect()).toBe(`healthintelligence://${EMAIL_LINK_PATH}`);
    expect(emailLinkRedirect()).not.toMatch(/localhost|https?:/);
  });

  it('every email sign-in asks Supabase to return to the app (not the Site URL)', async () => {
    const client = fakeClient();
    (getSupabaseClient as jest.Mock).mockReturnValue(client);
    expect(await supabaseAuthService.sendEmailOtp('Asha@Example.com')).toEqual({ success: true });
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'asha@example.com',
      options: { shouldCreateUser: true, emailRedirectTo: 'healthintelligence://auth-callback' },
    });
  });

  it('the link’s code is exchanged for a session; a link it can’t use explains the 6-digit code', async () => {
    const client = fakeClient();
    (getSupabaseClient as jest.Mock).mockReturnValue(client);
    const ok = await supabaseAuthService.completeEmailLink('good-code');
    expect(ok.success).toBe(true);
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith('good-code');
    const bad = await supabaseAuthService.completeEmailLink('other-device-code');
    expect(bad).toEqual({ success: false, errorMessage: expect.stringMatching(/6-digit code/) });
  });
});

describe('the callback screen', () => {
  beforeEach(() => (useLocalSearchParams as jest.Mock).mockReturnValue({}));

  it('completes sign-in once with the link’s code (the root layout then opens Home)', async () => {
    const complete = jest.spyOn(authService, 'completeEmailLink').mockResolvedValue({ success: false, errorMessage: 'x' });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ code: 'abc123' });
    await renderWithAuth(<EmailLinkCallbackScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith('abc123');
  });

  it('while signing in it says so — the code itself is never shown', async () => {
    jest.spyOn(authService, 'completeEmailLink').mockImplementation(() => new Promise(() => undefined));
    (useLocalSearchParams as jest.Mock).mockReturnValue({ code: 'abc123' });
    await renderWithAuth(<EmailLinkCallbackScreen />);
    expect(screen.getByText('Signing you in…')).toBeTruthy();
    expect(screen.queryByText(/abc123/)).toBeNull();
  });

  it('an expired or reused link (Supabase sends error=…) is explained, with a way back to sign in', async () => {
    const complete = jest.spyOn(authService, 'completeEmailLink');
    (useLocalSearchParams as jest.Mock).mockReturnValue({ error: 'access_denied' });
    await renderWithAuth(<EmailLinkCallbackScreen />);
    expect(screen.getByText('Link can’t be used')).toBeTruthy();
    expect(screen.getByText(/6-digit code/)).toBeTruthy();
    expect(complete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('email-link-back'));
    expect(router.replace).toHaveBeenCalledWith('/(auth)/welcome');
  });

  it('a link that fails to complete shows the reason, and nothing about it is logged', async () => {
    const logs = [jest.spyOn(console, 'log'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error')];
    jest.spyOn(authService, 'completeEmailLink').mockResolvedValue({ success: false, errorMessage: 'This sign-in link has expired.' });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ code: 'secret-link-code' });
    await renderWithAuth(<EmailLinkCallbackScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('This sign-in link has expired.')).toBeTruthy();
    for (const spy of logs) expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-link-code');
  });
});
