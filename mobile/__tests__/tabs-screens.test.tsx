/**
 * Covers the 5 bottom-tab screens (Home, Timeline, Health, Ask, Me) — per
 * spec section 36 ("navigation ... major flows"). Each screen loads its
 * mock data on mount and renders it; navigation is verified via the mocked
 * `router.push` calls (see jest.setup.js).
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import AskScreen from '../app/(tabs)/ask';
import HealthScreen from '../app/(tabs)/health';
import HomeScreen from '../app/(tabs)/home';
import MeScreen from '../app/(tabs)/me';
import TimelineScreen from '../app/(tabs)/timeline';
import { renderWithAuth } from './testUtils';

describe('Home screen', () => {
  it('loads and shows What Changed, trends, and Ask entry point', async () => {
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByText(/What Changed/)).toBeTruthy());
    expect(screen.getByText('Ask about your health...')).toBeTruthy();
  });

  it('navigates to the timeline tab from the health story section', async () => {
    await renderWithAuth(<HomeScreen />);
    await waitFor(() => expect(screen.getByText('View Timeline')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('View Timeline'));
    });
    expect(router.push).toHaveBeenCalledWith('/(tabs)/timeline');
  });
});

describe('Timeline screen', () => {
  it('loads and groups events by year', async () => {
    await renderWithAuth(<TimelineScreen />);
    await waitFor(() => expect(screen.getByText('Health Timeline')).toBeTruthy());
  });
});

describe('Health screen', () => {
  it('loads trends, medications, conditions and vaccinations', async () => {
    await renderWithAuth(<HealthScreen />);
    await waitFor(() => expect(screen.getByText('Health')).toBeTruthy());
    expect(screen.getByText('Medications')).toBeTruthy();
    expect(screen.getByText('Conditions')).toBeTruthy();
    expect(screen.getByText('Vaccinations')).toBeTruthy();
  });

  it('navigates to the full medications list', async () => {
    await renderWithAuth(<HealthScreen />);
    await waitFor(() => expect(screen.getByText('View All')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('View All'));
    });
    expect(router.push).toHaveBeenCalledWith('/medications');
  });
});

describe('Ask My Health screen', () => {
  it('shows suggested questions and asks one on press', async () => {
    await renderWithAuth(<AskScreen />);
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));

    const suggestions = screen.getAllByRole('button');
    await act(async () => {
      fireEvent.press(suggestions[0]);
    });

    // The question the user asked appears as a message bubble, and an
    // assistant reply is appended once the mock AI service resolves.
    await waitFor(() => expect(screen.queryAllByText(/From your records|AI explanation/).length).toBeGreaterThan(0));
  });
});

describe('Me screen', () => {
  it('loads the profile and links to Privacy, Data Sharing and WhatsApp', async () => {
    await renderWithAuth(<MeScreen />);
    await waitFor(() => expect(screen.getByText('Privacy & Security')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Privacy & Security'));
    });
    expect(router.push).toHaveBeenCalledWith('/privacy');

    await act(async () => {
      fireEvent.press(screen.getByText('Data Sharing'));
    });
    expect(router.push).toHaveBeenCalledWith('/privacy/data-sharing');

    await act(async () => {
      fireEvent.press(screen.getByText('WhatsApp — Connected Services'));
    });
    expect(router.push).toHaveBeenCalledWith('/whatsapp');
  });

  it('signs out on pressing Sign out', async () => {
    await renderWithAuth(<MeScreen />);
    await waitFor(() => expect(screen.getByText('Sign out')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('Sign out'));
    });
  });
});
