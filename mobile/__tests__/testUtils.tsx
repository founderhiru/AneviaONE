import React from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { AuthProvider } from '../hooks/useAuth';

/** Renders a screen/component with just the safe-area provider every
 * screen expects. */
export async function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  return render(<SafeAreaProvider initialMetrics={initialWindowMetrics}>{ui}</SafeAreaProvider>, options);
}

/** Renders with `AuthProvider` too, for screens that call `useAuth()`
 * (login, otp, onboarding, me, whatsapp). */
export async function renderWithAuth(ui: React.ReactElement, options?: RenderOptions) {
  return render(
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>{ui}</AuthProvider>
    </SafeAreaProvider>,
    options
  );
}

export * from '@testing-library/react-native';
