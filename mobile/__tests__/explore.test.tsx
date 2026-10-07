/**
 * Explore: the sample health history reachable from Welcome without signing
 * in. Screens are rendered without `AuthProvider` to prove they need no
 * session, and every backend boundary is watched to prove the sample never
 * leaves the device.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import WelcomeScreen from '../app/(auth)/welcome';
import ExploreAskScreen from '../app/explore/ask';
import ExploreChangesScreen from '../app/explore/changes';
import ExploreHomeScreen from '../app/explore/index';
import MakeItYoursScreen from '../app/explore/make-it-yours';
import ExploreMemoryScreen from '../app/explore/memory';
import ExploreTimelineScreen from '../app/explore/timeline';
import { BRAND, PRODUCT_TERMS } from '../config/brand';
import {
  SAMPLE_MARKERS,
  SAMPLE_QUESTIONS,
  SAMPLE_RECORDS,
  sampleConnections,
  sampleSummary,
  sampleTimeline,
} from '../content/exploreSample';
import { aiService } from '../services/ai/aiService';
import { resetAppleAvailabilityForTests } from '../services/auth/appleAuth';
import { authService } from '../services/auth/authService';
import { documentsService } from '../services/documents/documentsService';
import { healthService } from '../services/health/healthService';
import * as supabaseClient from '../services/supabaseClient';
import { renderWithAuth, renderWithProviders } from './testUtils';

const EXPLORE_SCREENS: [string, React.ComponentType][] = [
  ['home', ExploreHomeScreen],
  ['memory', ExploreMemoryScreen],
  ['changes', ExploreChangesScreen],
  ['timeline', ExploreTimelineScreen],
  ['ask', ExploreAskScreen],
];

const { __setAppleAvailableForTests } = require('expo-apple-authentication');

/** Spies on every method of each backend-facing service. */
function spyOnBackends() {
  const spies: jest.SpyInstance[] = [jest.spyOn(supabaseClient, 'getSupabaseClient')];
  for (const service of [authService, documentsService, healthService, aiService] as unknown as Record<string, unknown>[]) {
    for (const key of Object.keys(service)) {
      if (typeof service[key] === 'function') spies.push(jest.spyOn(service as never, key as never));
    }
  }
  return spies;
}

beforeEach(() => {
  __setAppleAvailableForTests(true);
  resetAppleAvailabilityForTests();
});

afterEach(() => jest.restoreAllMocks());

/** Mobile, Google and — once availability resolves — Apple; never Email. */
async function expectSignInOptions({ apple, email = false }: { apple: boolean; email?: boolean }) {
  // Mobile is the number field itself — no "Continue with Mobile" gateway.
  expect(screen.getByTestId('mobile-number-input')).toBeTruthy();
  expect(screen.queryByText('Continue with Mobile')).toBeNull();
  expect(screen.getByTestId('continue-with-google')).toBeTruthy();
  if (apple) expect(await screen.findByTestId('continue-with-apple')).toBeTruthy();
  else expect(screen.queryByTestId('continue-with-apple')).toBeNull();
  if (email) {
    expect(await screen.findByTestId('continue-with-email')).toBeTruthy();
  } else {
    expect(screen.queryByTestId('continue-with-email')).toBeNull();
    expect(screen.queryByText(/email/i)).toBeNull();
  }
}

describe('Welcome entry points', () => {
  it('offers Mobile, Google, Apple (where supported) and Email', async () => {
    await renderWithAuth(<WelcomeScreen />);
    await expectSignInOptions({ apple: true, email: true });
  });

  it('hides Apple where Sign in with Apple is not available', async () => {
    __setAppleAvailableForTests(false);
    await renderWithAuth(<WelcomeScreen />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expectSignInOptions({ apple: false, email: true });
    expect(screen.queryByText(/apple/i)).toBeNull();
  });

  it('Apple leads into the Apple sign-in step of the existing login flow', async () => {
    await renderWithAuth(<WelcomeScreen />);
    await fireEvent.press(await screen.findByTestId('continue-with-apple'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=apple');
  });

  it('offers the sample history as a quiet "Skip", never as a guest login', async () => {
    await renderWithAuth(<WelcomeScreen />);
    const skip = screen.getByTestId('explore-cta');
    expect(screen.getByText('Skip')).toBeTruthy();
    expect(skip.props.accessibilityHint).toBe('Opens a sample health history. No sign-in needed.');
    expect(screen.queryByText(/guest/i)).toBeNull();
    expect(screen.queryByText(`Explore ${BRAND.wordmark}`)).toBeNull();
  });

  it('opens Explore without signing in', async () => {
    await renderWithAuth(<WelcomeScreen />);
    const spies = spyOnBackends();
    await fireEvent.press(screen.getByTestId('explore-cta'));
    expect(router.push).toHaveBeenCalledWith('/explore');
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('shows the AneviaONE wordmark and the connected-history story', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByTestId('brand-wordmark')).toBeTruthy();
    expect(screen.getByLabelText(BRAND.welcomeTagline)).toBeTruthy();
    expect(screen.getByTestId('welcome-hero-art', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('Demo Home', () => {
  it('opens without authentication and shows the sample summary', async () => {
    await renderWithProviders(<ExploreHomeScreen />); // no AuthProvider
    expect(screen.getByText('Your health, connected over time.')).toBeTruthy();
    expect(
      screen.getByText(`See how ${BRAND.wordmark} turns scattered health records into a connected health history.`)
    ).toBeTruthy();
    expect(screen.getAllByTestId('sample-badge').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('12 Records')).toBeTruthy();
    expect(screen.getByLabelText('4 Health Areas')).toBeTruthy();
    expect(screen.getByLabelText('3 Years')).toBeTruthy();
  });

  it.each([
    ['explore-open-memory', '/explore/memory'],
    ['explore-open-changes', '/explore/changes'],
    ['explore-open-timeline', '/explore/timeline'],
    ['explore-open-ask', '/explore/ask'],
  ])('%s navigates to %s', async (testID, href) => {
    await renderWithProviders(<ExploreHomeScreen />);
    await fireEvent.press(screen.getByTestId(testID));
    expect(router.push).toHaveBeenCalledWith(href);
  });
});

describe('Explore screens', () => {
  it.each(EXPLORE_SCREENS)('%s renders without a session and is labelled as sample data', async (_name, Screen) => {
    await renderWithProviders(<Screen />);
    expect(screen.getAllByTestId('sample-badge').length).toBeGreaterThan(0);
    expect(screen.getByTestId('sample-notice')).toBeTruthy();
  });

  it('Health Memory shows connected records, labelled as a demo history', async () => {
    await renderWithProviders(<ExploreMemoryScreen />);
    expect(screen.getByText('DEMO HEALTH HISTORY')).toBeTruthy();
    for (const record of SAMPLE_RECORDS.slice(0, 4)) {
      expect(screen.getByTestId(`memory-record-${record.id}`)).toBeTruthy();
    }
    expect(screen.getByText('12 Mar 2026 · Sample Diagnostics Lab')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('memory-to-changes'));
    expect(router.push).toHaveBeenCalledWith('/explore/changes');
    await fireEvent.press(screen.getByTestId('memory-to-timeline'));
    expect(router.push).toHaveBeenCalledWith('/explore/timeline');
  });

  it('What Changed shows the sample labels with a no-medical-advice note', async () => {
    await renderWithProviders(<ExploreChangesScreen />);
    expect(screen.getByText('Improved')).toBeTruthy();
    expect(screen.getByText('Stable')).toBeTruthy();
    expect(screen.getByText('Changed')).toBeTruthy();
    expect(screen.getByTestId('changes-disclaimer')).toBeTruthy();
    expect(screen.getByText(/not medical advice, a\s+diagnosis, or a treatment recommendation/)).toBeTruthy();
  });

  it('Timeline lists every sample record by year', async () => {
    await renderWithProviders(<ExploreTimelineScreen />);
    expect(screen.getByText('Your health has a history.')).toBeTruthy();
    for (const { year } of sampleTimeline()) expect(screen.getByTestId(`timeline-year-${year}`)).toBeTruthy();
  });

  it('Ask My Health is an honest preview: example questions, no answers, no AI call', async () => {
    const askSpy = jest.spyOn(aiService, 'askQuestion');
    await renderWithProviders(<ExploreAskScreen />);
    expect(screen.getByText(PRODUCT_TERMS.askMyHealth)).toBeTruthy();
    expect(screen.getByText('PREVIEW')).toBeTruthy();
    expect(screen.getByText(/Not available in this preview/)).toBeTruthy();
    for (const question of SAMPLE_QUESTIONS) expect(screen.getByText(question)).toBeTruthy();
    expect(screen.getByTestId('ask-preview-input').props.accessibilityState).toEqual({ disabled: true });
    expect(askSpy).not.toHaveBeenCalled();
  });
});

describe('Make it yours', () => {
  it('Explore Home has a subtle "Make it yours" link to the dedicated screen', async () => {
    await renderWithProviders(<ExploreHomeScreen />);
    expect(screen.getByText('Make it yours')).toBeTruthy();
    // A link, not the full sign-in panel: no sign-in buttons on Home.
    expect(screen.queryByTestId('make-it-yours')).toBeNull();
    expect(screen.queryByTestId('mobile-number-input')).toBeNull();
    await fireEvent.press(screen.getByTestId('explore-make-it-yours'));
    expect(router.push).toHaveBeenCalledWith('/explore/make-it-yours');
  });

  it.each(EXPLORE_SCREENS.filter(([name]) => name !== 'home'))('%s ends with Make it yours → the one sign-in screen', async (name, Screen) => {
    await renderWithProviders(<Screen />);
    expect(screen.getByTestId('make-it-yours')).toBeTruthy();
    expect(screen.getByText('Make it yours')).toBeTruthy();
    expect(screen.getByText(`Bring your own health history into ${BRAND.wordmark}.`)).toBeTruthy();
    // A hand-off, never a sign-in form of its own.
    expect(screen.queryByTestId(/^continue-with-/)).toBeNull();
    expect(screen.queryByTestId('mobile-number-input')).toBeNull();
    await fireEvent.press(screen.getByText('Get started'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/(auth)/welcome', params: { from: 'app' } });
    expect(name).toBeTruthy();
  });

  it('the Make It Yours screen opens without a session and shows its content', async () => {
    await renderWithProviders(<MakeItYoursScreen />); // no AuthProvider
    expect(screen.getByTestId('make-it-yours-screen')).toBeTruthy();
    expect(screen.getByText('MAKE IT YOURS')).toBeTruthy();
    expect(screen.getByText('Your health has a history.')).toBeTruthy();
    expect(
      screen.getByText(`Bring your own health records into ${BRAND.wordmark} and keep your health history connected over time.`)
    ).toBeTruthy();
    expect(screen.getByText('Your health information belongs to you.')).toBeTruthy();
    expect(screen.queryByText(/price|subscribe|trial|premium/i)).toBeNull();
  });

  it('the Make It Yours screen has one action, Get started, into the one sign-in screen — no second login form', async () => {
    await renderWithProviders(<MakeItYoursScreen />);
    expect(screen.queryByTestId(/^continue-with-/)).toBeNull();
    expect(screen.queryByTestId('mobile-number-input')).toBeNull();
    const getStarted = screen.getByTestId('make-it-yours-get-started');
    expect(getStarted.props.accessibilityHint).toMatch(/Opens sign-in/);
    await fireEvent.press(getStarted);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/(auth)/welcome', params: { from: 'app' } });
  });
});

describe('Sample data stays on the device', () => {
  it('rendering and navigating every Explore screen never touches Supabase or any service', async () => {
    const spies = spyOnBackends();
    for (const [, Screen] of [...EXPLORE_SCREENS, ['make-it-yours', MakeItYoursScreen] as const]) {
      const view = await renderWithProviders(<Screen />);
      await screen.findAllByTestId(/get-started|explore-make-it-yours/);
      for (const button of screen.getAllByRole('button')) await fireEvent.press(button);
      await view.unmount();
    }
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('Explore code imports no service, so it has no path to the backend or an AI provider', () => {
    const root = path.join(__dirname, '..');
    const files = [
      'content/exploreSample.ts',
      'components/explore/ExploreUI.tsx',
      ...fs.readdirSync(path.join(root, 'app/explore')).map((f) => `app/explore/${f}`),
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      const importsService = /^import[^;]*from ['"][^'"]*(services|supabase)/im.test(source);
      expect({ file, importsService }).toEqual({ file, importsService: false });
    }
  });

  it('sample data is read-only', () => {
    expect(Object.isFrozen(SAMPLE_RECORDS)).toBe(true);
    expect(Object.isFrozen(SAMPLE_RECORDS[0])).toBe(true);
    expect(Object.isFrozen(SAMPLE_MARKERS[0].readings)).toBe(true);
    expect(Object.isFrozen(SAMPLE_QUESTIONS)).toBe(true);
  });

  it('derives its summary and connections from the records', () => {
    expect(sampleSummary()).toEqual({ records: 12, areas: 4, years: 3 });
    const connections = sampleConnections('sample-r12').map((c) => [c.record.id, c.via]);
    expect(connections).toEqual([
      ['sample-r11', 'HbA1c, LDL'],
      ['sample-r10', 'Vitamin D'],
    ]);
    expect(sampleConnections('sample-r09')).toEqual([{ record: expect.objectContaining({ id: 'sample-r08' }), via: 'Follow-up' }]);
  });
});
