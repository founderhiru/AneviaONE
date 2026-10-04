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

afterEach(() => jest.restoreAllMocks());

describe('Welcome entry points', () => {
  it('offers Mobile (primary) and Google, no Email, and no Apple until it is implemented', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByTestId('continue-with-mobile')).toBeTruthy();
    expect(screen.getByTestId('continue-with-google')).toBeTruthy();
    expect(screen.queryByTestId('continue-with-email')).toBeNull();
    expect(screen.queryByText(/email/i)).toBeNull();
    expect(screen.queryByText(/apple/i)).toBeNull();
  });

  it('offers Explore as an intentional entry, never as a "skip" or "guest" login', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByText(`Explore ${BRAND.wordmark}`)).toBeTruthy();
    expect(screen.queryByText(/guest|skip/i)).toBeNull();
  });

  it('opens Explore without signing in', async () => {
    await renderWithAuth(<WelcomeScreen />);
    const spies = spyOnBackends();
    await fireEvent.press(screen.getByTestId('explore-cta'));
    expect(router.push).toHaveBeenCalledWith('/explore');
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('shows the AneviaONE mark', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByTestId('brand-mark', { includeHiddenElements: true })).toBeTruthy();
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
  it.each(EXPLORE_SCREENS)('%s ends with Make it yours', async (_name, Screen) => {
    await renderWithProviders(<Screen />);
    expect(screen.getByTestId('make-it-yours')).toBeTruthy();
    expect(screen.getByText('Make it yours')).toBeTruthy();
    expect(screen.getByText(`Bring your own health history into ${BRAND.wordmark}.`)).toBeTruthy();
  });

  it('leads into the existing Mobile and Google sign-in, with no Email or Apple option', async () => {
    await renderWithProviders(<ExploreMemoryScreen />);
    await fireEvent.press(screen.getByTestId('continue-with-mobile'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=mobile');
    await fireEvent.press(screen.getByTestId('continue-with-google'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=google');
    expect(screen.queryByText(/apple/i)).toBeNull();
    expect(screen.queryByTestId('continue-with-email')).toBeNull();
  });
});

describe('Sample data stays on the device', () => {
  it('rendering and navigating every Explore screen never touches Supabase or any service', async () => {
    const spies = spyOnBackends();
    for (const [, Screen] of EXPLORE_SCREENS) {
      const view = await renderWithProviders(<Screen />);
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
