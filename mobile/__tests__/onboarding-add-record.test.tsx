/**
 * The last onboarding step's "Take a photo" / "Upload a document" must end on
 * Add Record. Onboarding records the destination and completes onboarding; it
 * does not navigate itself (the root guard would replace that with Home — seen
 * on the iOS simulator, where both buttons landed on Home).
 */
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import OnboardingScreen from '../app/(auth)/onboarding';
import { takeRouteAfterOnboarding } from '../navigation/authRoutes';
import { renderWithAuth } from './testUtils';

async function toLastStep() {
  await renderWithAuth(<OnboardingScreen />);
  await act(async () => {
    fireEvent.press(screen.getByTestId('onboarding-build-memory'));
  });
  for (let i = 0; i < 2; i++) {
    await act(async () => {
      fireEvent.press(screen.getByText('Continue'));
    });
  }
}

describe.each(['onboarding-camera', 'onboarding-upload'])('%s', (testID) => {
  it('records Add Record as the next stop and leaves navigation to the guard', async () => {
    await toLastStep();
    await act(async () => {
      fireEvent.press(screen.getByTestId(testID));
    });
    expect(takeRouteAfterOnboarding()).toBe('/add');
    expect(router.replace).not.toHaveBeenCalledWith('/add');
  });
});

it('Skip goes Home with no pending destination', async () => {
  await toLastStep();
  await act(async () => {
    fireEvent.press(screen.getByTestId('onboarding-skip-record'));
  });
  expect(router.replace).toHaveBeenCalledWith('/(tabs)/home');
  expect(takeRouteAfterOnboarding()).toBeNull();
});
