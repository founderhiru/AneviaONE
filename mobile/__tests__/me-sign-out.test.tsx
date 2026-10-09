/**
 * Regression: Sign out must always be reachable on the Me screen.
 *
 * It is the last row on Me, below the fold on small screens. The screen
 * scrolls (ScreenContainer's ScrollView fills the screen) and leaves clear
 * space below the last row, so it can always be scrolled fully into view
 * above the tab bar. Pressing it uses the existing sign-out.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import MeScreen from '../app/(tabs)/me';
import { authService } from '../services/auth/authService';
import { profileService } from '../services/profile/profileService';
import { renderWithAuth } from './testUtils';

type Node = { props: Record<string, unknown>; parent: Node | null; type: unknown };

function scrollAncestor(node: Node | null): Node | null {
  for (let n = node; n; n = n.parent) if (n.props?.testID === 'screen-scroll') return n;
  return null;
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue({ fullName: null, dateOfBirth: null });
});

describe('Me — Sign out is always reachable', () => {
  it('is rendered as the last action, inside the screen’s vertical scroll view', async () => {
    await renderWithAuth(<MeScreen />);
    const signOut = await screen.findByTestId('me-sign-out');
    expect(screen.getByText('Sign out')).toBeTruthy();
    const scroll = scrollAncestor(signOut as unknown as Node);
    expect(scroll).not.toBeNull();
    expect(scroll!.props.scrollEnabled).not.toBe(false);
    expect(scroll!.props.horizontal).not.toBe(true);
    // The scroll view fills the screen, so everything below the fold can be scrolled to.
    expect(StyleSheet.flatten(scroll!.props.style as never)).toMatchObject({ flex: 1 });
    // Clear space below the last row, so it scrolls fully above the tab bar.
    const content = StyleSheet.flatten(scroll!.props.contentContainerStyle as never) as { paddingBottom?: number };
    expect(content.paddingBottom ?? 0).toBeGreaterThanOrEqual(48);
  });

  it('pressing it signs out through the existing sign-out', async () => {
    const signOut = jest.spyOn(authService, 'signOut');
    await renderWithAuth(<MeScreen />);
    await act(async () => {
      fireEvent.press(await screen.findByTestId('me-sign-out'));
    });
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });
});
