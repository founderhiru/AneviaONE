/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules needs require() to load fresh module instances */
/**
 * Home's summary helpers and the redesigned Welcome.
 *
 * Home: every summary figure is derived from the person's own data — counts
 * are list lengths, dates are record dates, and anything unsupported is null.
 * Welcome: Mobile leads, Google is always offered, and Apple/Email appear
 * only when the project has them switched on.
 */
import React from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import LoginScreen from '../app/(auth)/login';
import OtpScreen from '../app/(auth)/otp';
import WelcomeScreen from '../app/(auth)/welcome';
import { BRAND } from '../config/brand';
import { LEGAL_LINKS } from '../config/legal';
import { markLaunchSplashDone } from '../hooks/useLaunchSplash';
import { useSignInMethods } from '../hooks/useSignInMethods';
import { monthYear, summarizeHome, visibleYears } from '../services/health/homeSummary';
import type { HealthEvent, Medication, StoredDocument, Trend } from '../types';
import { renderWithAuth } from './testUtils';

jest.mock('../services/supabaseClient', () => ({ getSupabaseClient: jest.fn(), isSupabaseConfigured: true }));
jest.mock('../services/health/healthService', () => {
  const actual = jest.requireActual('../services/health/healthService');
  return { ...actual, healthService: actual.productionHealthService };
});
jest.mock('../hooks/useSignInMethods', () => ({ useSignInMethods: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })) }));

const ALL_ON = { email: true, phone: true, google: true, apple: true };
const { __setAppleAvailableForTests } = require('expo-apple-authentication');
const { resetAppleAvailabilityForTests } = require('../services/auth/appleAuth');

function doc(id: string): StoredDocument {
  const at = '2026-06-10T09:00:00.000Z';
  return {
    id,
    userId: 'user-1',
    source: 'upload',
    documentType: 'unclassified',
    originalFilename: `Report ${id}.pdf`,
    mimeType: 'application/pdf',
    fileSizeBytes: 1000,
    storagePath: `user-1/documents/${id}/original.pdf`,
    status: 'completed',
    processingError: null,
    uploadedAt: at,
    createdAt: at,
    updatedAt: at,
  };
}

beforeEach(() => {
  (useSignInMethods as jest.Mock).mockReturnValue(ALL_ON);
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  __setAppleAvailableForTests(true);
  resetAppleAvailabilityForTests();
});
afterEach(() => jest.restoreAllMocks());

// ------------------------------------------------------------------ Home --

describe('Home summary — derived only from real data', () => {
  const trend = (n: number) => ({ points: Array.from({ length: n }, (_, i) => ({ date: `2026-0${i + 1}-01`, value: i })) }) as Trend;
  const visit = (date: string | null, type: HealthEvent['type'] = 'encounter') => ({ id: `${type}-${date}`, type, title: '', date }) as HealthEvent;
  const now = new Date('2026-10-07T12:00:00Z');

  it('counts are list lengths; a trend needs two results', () => {
    const s = summarizeHome({ documents: [doc('a'), doc('b')], trends: [trend(2), trend(1), trend(3)], medications: [{} as Medication], timeline: [], now });
    expect(s).toMatchObject({ documentCount: 2, trendMeasureCount: 2, medicationCount: 1 });
  });

  it('next check-up is only a visit dated after today, and the earliest one', () => {
    const timeline = [visit('2026-01-01'), visit('2027-05-02'), visit('2027-03-01', 'consultation'), visit('2028-01-01', 'report'), visit(null)];
    expect(summarizeHome({ documents: [], trends: [], medications: [], timeline, now }).nextCheckupDate).toBe('2027-03-01');
    expect(summarizeHome({ documents: [], trends: [], medications: [], timeline: [visit('2026-01-01')], now }).nextCheckupDate).toBeNull();
  });

  it('latest record is the newest dated event up to today; nothing → null', () => {
    const timeline = [visit('2019-05-02', 'report'), visit('2026-06-10', 'report'), visit('2099-01-01')];
    expect(summarizeHome({ documents: [], trends: [], medications: [], timeline, now }).latestRecordDate).toBe('2026-06-10');
    expect(summarizeHome({ documents: [], trends: [], medications: [], timeline: [], now })).toEqual({
      documentCount: 0, trendMeasureCount: 0, medicationCount: 0, nextCheckupDate: null, latestRecordDate: null,
    });
  });

  it('timeline years are always real years; long histories keep the first and the latest', () => {
    expect(visibleYears(['2019', '2021'])).toEqual(['2019', '2021']);
    expect(visibleYears(['2012', '2014', '2016', '2018', '2020', '2022', '2024'])).toEqual(['2012', '2018', '2020', '2022', '2024']);
    expect(monthYear('2027-03-15')).toBe('Mar 2027');
  });
});

// Home's rendered dashboard (stages, results, signals, history, changes) is
// covered in home-dashboard-v2.test.tsx.

// --------------------------------------------------------------- Welcome --

describe('Welcome — honest ways in', () => {
  it('the mobile number leads; Google, Apple and Email follow when switched on', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByText(`Welcome to ${BRAND.wordmark}`)).toBeTruthy();
    expect(screen.getByText('Your health story, connected over time.')).toBeTruthy();
    expect(screen.getByTestId('mobile-number-input')).toBeTruthy();
    expect(screen.getByTestId('continue-with-google')).toBeTruthy();
    expect(await screen.findByTestId('continue-with-apple')).toBeTruthy();
    expect(screen.getByTestId('continue-with-email')).toBeTruthy();
  });

  it('Apple and Email are not offered when the project has them switched off', async () => {
    (useSignInMethods as jest.Mock).mockReturnValue({ email: false, phone: false, google: true, apple: false });
    await renderWithAuth(<WelcomeScreen />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByTestId('mobile-number-input')).toBeTruthy();
    expect(screen.getByTestId('continue-with-google')).toBeTruthy();
    expect(screen.queryByTestId('continue-with-apple')).toBeNull();
    expect(screen.queryByTestId('continue-with-email')).toBeNull();
  });

  it('while the enabled methods are unknown, only the mobile number and Google are offered', async () => {
    (useSignInMethods as jest.Mock).mockReturnValue(null);
    await renderWithAuth(<WelcomeScreen />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByTestId('continue-with-apple')).toBeNull();
    expect(screen.queryByTestId('continue-with-email')).toBeNull();
    expect(screen.getByTestId('continue-with-google')).toBeTruthy();
  });

  it('opens the published Terms and Privacy Policy', async () => {
    await renderWithAuth(<WelcomeScreen />);
    await fireEvent.press(screen.getByTestId('legal-terms'));
    await fireEvent.press(screen.getByTestId('legal-privacy'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(LEGAL_LINKS.terms.url);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(LEGAL_LINKS.privacy.url);
  });
});

describe('Welcome — layout of the ways in', () => {
  it('the mobile number and Continue are the primary action; the others are compact secondary buttons', async () => {
    await renderWithAuth(<WelcomeScreen />);
    await screen.findByTestId('continue-with-email');
    const buttons = within(screen.getByTestId('welcome-sheet')).getAllByRole('button');
    const ids = buttons.map((b) => b.props.testID);
    // In the sheet: the country selector, then Continue, before every other way in.
    expect(ids.slice(0, 2)).toEqual(['phone-country', 'send-otp']);
    expect(screen.queryByText('Continue with Mobile')).toBeNull();
    // Google and Email are icon buttons (labelled for screen readers), not text buttons.
    expect(screen.queryByText('Continue with Google')).toBeNull();
    expect(screen.queryByText('Continue with Email')).toBeNull();
  });

  it('when Apple is switched on it takes its place between Google and Email', async () => {
    await renderWithAuth(<WelcomeScreen />);
    await screen.findByTestId('continue-with-apple');
    const order = screen.getAllByTestId(/^continue-with-(google|apple|email)$/).map((b) => b.props.testID);
    expect(order).toEqual(['continue-with-google', 'continue-with-apple', 'continue-with-email']);
  });

  it('while Apple is switched off the row is Google | Email; Skip and the legal links stay', async () => {
    (useSignInMethods as jest.Mock).mockReturnValue({ email: true, phone: false, google: true, apple: false });
    await renderWithAuth(<WelcomeScreen />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const order = screen.getAllByTestId(/^continue-with-(google|apple|email)$/).map((b) => b.props.testID);
    expect(order).toEqual(['continue-with-google', 'continue-with-email']);
    expect(screen.getByText('Skip')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('explore-cta'));
    expect(router.push).toHaveBeenCalledWith('/explore');
    expect(screen.getByText(LEGAL_LINKS.terms.label)).toBeTruthy();
    expect(screen.getByText(LEGAL_LINKS.privacy.label)).toBeTruthy();
  });

  it('Skip sits in the hero (top-right), not in the sign-in sheet, and keeps its label and hint', async () => {
    await renderWithAuth(<WelcomeScreen />);
    const sheet = screen.getByTestId('welcome-sheet');
    expect(within(sheet).queryByTestId('explore-cta')).toBeNull();
    expect(within(sheet).getByTestId('welcome-legal')).toBeTruthy();
    const skip = screen.getByTestId('explore-cta');
    expect(skip.props.accessibilityLabel).toBe('Skip');
    expect(skip.props.accessibilityHint).toBe('Opens a sample health history. No sign-in needed.');
    await fireEvent.press(skip);
    expect(router.push).toHaveBeenCalledWith('/explore');
  });
});

describe('Welcome — story hero motion', () => {
  const opacityOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID, { includeHiddenElements: true }).props.style).opacity;

  async function renderHero() {
    await renderWithAuth(<WelcomeScreen />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // Give the hero a size so its stage and scenes render.
    await act(async () => {
      fireEvent(screen.getByTestId('welcome-hero-art', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 240 } },
      });
    });
  }

  it('with Reduce Motion: a stable first scene, nothing looping', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const loop = jest.spyOn(Animated, 'loop');
    markLaunchSplashDone();
    await renderHero();
    expect(opacityOf('hero-scene-connect')).toBe(1);
    expect(opacityOf('hero-scene-understand')).toBe(0);
    expect(opacityOf('hero-scene-inform')).toBe(0);
    expect(loop).not.toHaveBeenCalled();
  });

  it('without Reduce Motion: the three scenes loop once the splash has gone', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const loop = jest.spyOn(Animated, 'loop');
    markLaunchSplashDone();
    await renderHero();
    expect(loop).toHaveBeenCalledTimes(1);
    expect(opacityOf('hero-scene-connect')).toBe(1);
  });

  it('is decorative: hidden from screen readers', async () => {
    await renderHero();
    const hero = screen.getByTestId('welcome-hero-art', { includeHiddenElements: true });
    expect(hero.props.accessibilityElementsHidden).toBe(true);
    expect(hero.props.importantForAccessibility).toBe('no-hide-descendants');
  });
});

describe('Email sign-in — entry wired to the existing passwordless seam', () => {
  it('Email on Welcome opens the email step, which asks only for an address', async () => {
    await renderWithAuth(<WelcomeScreen />);
    await fireEvent.press(await screen.findByTestId('continue-with-email'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=email');

    (useLocalSearchParams as jest.Mock).mockReturnValue({ method: 'email' });
    await renderWithAuth(<LoginScreen />);
    expect(screen.getByText('Continue with Email')).toBeTruthy();
    expect(screen.getByText('Enter your email address and we’ll send you a secure sign-in code.')).toBeTruthy();
    expect(screen.getByText('Send code')).toBeTruthy();
    expect(screen.queryByText(/password/i)).toBeNull();
  });

  it('the code step names the masked address and offers Verify, Resend and a different email', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ email: 'asha.verma@example.com' });
    await renderWithAuth(<OtpScreen />);
    expect(screen.getByText('Check your email')).toBeTruthy();
    expect(screen.getByText('Enter the 6-digit code we sent to as••••••••@example.com.')).toBeTruthy();
    expect(screen.queryByText(/asha\.verma@/)).toBeNull();
    expect(screen.getByText('Verify code')).toBeTruthy();
    expect(screen.getByText('Resend code in 60s')).toBeTruthy();
    expect(screen.getByText('Use a different email')).toBeTruthy();
  });

  it('the SMS code step uses the mobile wording, not the email one', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ mobileNumber: '+919876543210' });
    await renderWithAuth(<OtpScreen />);
    expect(screen.getByText('Verify your number')).toBeTruthy();
    expect(screen.queryByText('Check your email')).toBeNull();
    expect(screen.getByText('Change mobile number')).toBeTruthy();
  });
});

// ------------------------------------------------- enabled sign-in methods --

describe('enabled sign-in methods (production)', () => {
  const saved = { ...process.env };
  const realFetch = global.fetch;
  afterEach(() => {
    process.env = { ...saved };
    global.fetch = realFetch;
  });

  function load() {
    process.env.EXPO_PUBLIC_APP_MODE = 'production';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    let mod: typeof import('../services/auth/signInMethods') | undefined;
    jest.isolateModules(() => {
      mod = require('../services/auth/signInMethods');
    });
    return mod!;
  }

  it('reads the public, read-only Auth settings with the anon key only', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ external: { email: true, phone: false, google: true, apple: false } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { getSignInMethods } = load();
    await expect(getSignInMethods()).resolves.toEqual({ email: true, phone: false, google: true, apple: false });
    expect(fetchMock).toHaveBeenCalledWith('https://abc.supabase.co/auth/v1/settings', expect.objectContaining({ headers: { apikey: 'anon-key' } }));
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toMatch(/authorization|bearer/i);
  });

  it('an unreadable answer is unknown (null) and is asked again next time', async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => ({ external: { email: true } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { getSignInMethods } = load();
    await expect(getSignInMethods()).resolves.toBeNull();
    await expect(getSignInMethods()).resolves.toEqual({ email: true, phone: false, google: false, apple: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
