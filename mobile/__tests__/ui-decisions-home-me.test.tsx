/**
 * Recorded UI decisions (Gate 1 review, 9 Oct 2026):
 *   - Home shows no "Areas" figure — it was ambiguous. The glance row is
 *     exactly Reports | Results | Medications.
 *   - Me does not offer unfinished features: WhatsApp, Family Health,
 *     Doctor Brief and Data Sharing are hidden (their screens/routes stay parked).
 *   - Add Record offers only working capture methods: no WhatsApp, no
 *     "Add manually"; the first-run intro has no WhatsApp step.
 *   - One privacy/security entry on Me: "Privacy & Security" (/privacy); the
 *     duplicate "Data & Security" row is gone.
 * Synthetic data only.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { useFocusEffect } from 'expo-router';

import OnboardingScreen from '../app/(auth)/onboarding';
import MeScreen from '../app/(tabs)/me';
import AddRecordScreen from '../app/add/index';
import PrivacyScreen from '../app/privacy/index';
import { HealthAtAGlance } from '../components/home/HomeDashboard';
import { profileService } from '../services/profile/profileService';
import { renderWithAuth, renderWithProviders } from './testUtils';

beforeEach(() => {
  jest.restoreAllMocks();
  (useFocusEffect as jest.Mock).mockImplementation((effect: () => void) => {
    React.useEffect(effect, [effect]);
  });
  jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue({ fullName: null, dateOfBirth: null });
});

describe('Home glance row', () => {
  it('is exactly Reports | Results | Medications — no Areas, whatever the data', async () => {
    for (const healthAreas of [[], ['Lab tests'], ['Lab tests', 'Urine tests'], null]) {
      const view = await renderWithProviders(
        <HealthAtAGlance
          summary={{ reportCount: 3, resultCount: 8, healthAreas, medicationCount: 0 }}
          onReports={jest.fn()}
          onResults={jest.fn()}
          onMedications={jest.fn()}
        />
      );
      const row = screen.getByTestId('home-glance');
      expect(within(row).getAllByRole('button').map((b) => b.props.testID)).toEqual(['glance-reports', 'glance-results', 'glance-medications']);
      expect(within(row).queryByText(/Areas?/)).toBeNull();
      expect(screen.queryByTestId('glance-area-names')).toBeNull();
      await view.unmount();
    }
  });
});

describe('Me menu', () => {
  async function openMe() {
    await renderWithAuth(<MeScreen />);
    await waitFor(() => expect(screen.getByText('Sign out')).toBeTruthy());
  }

  it('does not offer unfinished features', async () => {
    await openMe();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(screen.queryByText(/Family Health/)).toBeNull();
    expect(screen.queryByText(/Doctor Brief/)).toBeNull();
    expect(screen.queryByText('Data Sharing')).toBeNull();
    expect(screen.queryByText(/coming soon|\(preview\)/i)).toBeNull();
  });

  it('has exactly one privacy/security entry: Privacy & Security', async () => {
    await openMe();
    expect(screen.getAllByText(/Security/)).toHaveLength(1);
    expect(screen.getByText('Privacy & Security')).toBeTruthy();
    expect(screen.queryByText('Data & Security')).toBeNull();
  });

  it('keeps the finished entries', async () => {
    await openMe();
    for (const label of ['Identity details', 'My documents', 'Help & FAQ', 'Privacy & Security', 'Terms of Service', 'Sign out']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('parked screens are kept, just not listed', () => {
    for (const route of ['whatsapp/index.tsx', 'family/index.tsx', 'doctor-brief/index.tsx', 'privacy/data-sharing.tsx']) {
      expect(fs.existsSync(path.join(__dirname, '..', 'app', route))).toBe(true);
    }
  });
});

describe('Add Record and the first-run intro', () => {
  it('Add Record offers only working capture methods', async () => {
    await renderWithAuth(<AddRecordScreen />);
    for (const label of ['Upload PDF', 'Take Photo', 'Choose Photo', 'Scan Document']) expect(screen.getByLabelText(label)).toBeTruthy();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(screen.queryByText(/Add manually|More ways/)).toBeNull();
  });

  it('the intro never mentions or connects WhatsApp, at any step', async () => {
    await renderWithAuth(<OnboardingScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('onboarding-build-memory'));
    });
    for (let i = 0; i < 2; i++) {
      expect(screen.queryByText(/WhatsApp/)).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByText('Continue'));
      });
    }
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
    expect(screen.queryByTestId('onboarding-connect-whatsapp')).toBeNull();
    expect(screen.getByText('Start with your first health record.')).toBeTruthy();
  });
});

describe('Privacy & Security', () => {
  it('does not offer "Connected Services" (its only service, WhatsApp, is not available)', async () => {
    await renderWithAuth(<PrivacyScreen />);
    await waitFor(() => expect(screen.getByText('Privacy & Security')).toBeTruthy());
    expect(screen.queryByText('Connected Services')).toBeNull();
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
  });
});
